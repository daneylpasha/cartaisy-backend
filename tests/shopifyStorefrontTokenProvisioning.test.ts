import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import shopifyRoutes from '../src/routes/shopifyRoutes';
import Store from '../src/models/Store';
import User from '../src/models/User';
import { generateToken } from '../src/utils/jwt';
import { createStorefrontAccessToken } from '../src/services/shopifyOAuthService';
import shopifyStorefront from '../src/services/shopifyStorefrontService';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const postMock = jest.fn();

const STOREFRONT_TOKEN = 'sf-provisioned-token-9876';
const TOKEN_TITLE = 'Cartaisy Storefront API Token';

// A query-aware Admin GraphQL mock. Provisioning now performs up to three kinds
// of calls (list existing tokens, delete stale ones, create), so the mock has to
// respond based on the operation in the request body rather than a single
// canned response.
const configureShopifyMock = (
  {
    existingTokens = [],
    createResult,
  }: {
    existingTokens?: Array<{ id: string; title: string; accessToken?: string }>;
    createResult?: any;
  } = {}
) => {
  postMock.mockImplementation((_url: string, body: any) => {
    const query: string = body?.query || '';

    if (query.includes('storefrontAccessTokens(first')) {
      return Promise.resolve({
        data: {
          data: {
            shop: {
              storefrontAccessTokens: {
                edges: existingTokens.map((node) => ({ node })),
              },
            },
          },
        },
      });
    }

    if (query.includes('storefrontAccessTokenDelete')) {
      return Promise.resolve({
        data: {
          data: {
            storefrontAccessTokenDelete: {
              deletedStorefrontAccessTokenId: body?.variables?.input?.id,
              userErrors: [],
            },
          },
        },
      });
    }

    // Default: storefrontAccessTokenCreate
    return Promise.resolve(
      createResult ?? {
        data: {
          data: {
            storefrontAccessTokenCreate: {
              storefrontAccessToken: {
                accessToken: STOREFRONT_TOKEN,
                title: TOKEN_TITLE,
              },
              userErrors: [],
            },
          },
        },
      }
    );
  });
};

// Count how many create mutations were issued across the mock's call history.
const createCallCount = () =>
  postMock.mock.calls.filter(([, body]: any[]) =>
    (body?.query || '').includes('storefrontAccessTokenCreate')
  ).length;

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/shopify', shopifyRoutes);
  return app;
};

const createConnectedStore = (slug: string) =>
  Store.create({
    name: `Storefront Token Store ${slug}`,
    slug: `storefront-token-store-${slug}`,
    isActive: true,
    shopify: {
      shop: `${slug}-shop.myshopify.com`,
      // Plain (non-encrypted) Admin token: getShopifyClientForStore uses it raw.
      accessToken: 'admin-token-plain',
      scope: 'read_products',
      isConnected: true,
    },
  });

const readStorefrontToken = async (storeId: Types.ObjectId | string) => {
  const store = await Store.findById(storeId).select('shopify.storefrontAccessToken');
  return store?.shopify?.storefrontAccessToken;
};

describe('Per-store Storefront API token provisioning (issue #124)', () => {
  beforeEach(() => {
    mockedAxios.create.mockReset();
    postMock.mockReset();
    // Default: no pre-existing tokens on the shop, so provisioning creates a
    // fresh Storefront access token.
    configureShopifyMock();
    mockedAxios.create.mockReturnValue({ post: postMock, get: jest.fn() } as any);
  });

  describe('createStorefrontAccessToken service', () => {
    it('persists the token to the target store only', async () => {
      const [storeA, storeB] = await Promise.all([
        createConnectedStore('a'),
        createConnectedStore('b'),
      ]);

      const result = await createStorefrontAccessToken(storeA._id.toString());

      expect(result).toEqual({ created: true, last4: STOREFRONT_TOKEN.slice(-4) });
      expect(await readStorefrontToken(storeA._id)).toBe(STOREFRONT_TOKEN);
      // The other store must be untouched.
      expect(await readStorefrontToken(storeB._id)).toBeUndefined();
    });

    it('makes getStorefrontClientForStore() usable after persistence', async () => {
      const store = await createConnectedStore('c');

      const before = await shopifyStorefront.getStorefrontClientForStore(store._id.toString());
      expect(before.isConfigured).toBe(false);

      await createStorefrontAccessToken(store._id.toString());

      const after = await shopifyStorefront.getStorefrontClientForStore(store._id.toString());
      expect(after.isConfigured).toBe(true);
    });

    it('fails closed when the store is not connected to Shopify', async () => {
      const store = await Store.create({
        name: 'Unconnected Store',
        slug: 'storefront-token-unconnected',
        isActive: true,
        shopify: {},
      });

      await expect(createStorefrontAccessToken(store._id.toString())).rejects.toThrow(
        /not connected/i
      );
      expect(await readStorefrontToken(store._id)).toBeUndefined();
    });

    it('fails closed and does not persist when Shopify returns userErrors', async () => {
      const store = await createConnectedStore('d');
      configureShopifyMock({
        createResult: {
          data: {
            data: {
              storefrontAccessTokenCreate: {
                storefrontAccessToken: null,
                userErrors: [{ field: null, message: 'Access denied' }],
              },
            },
          },
        },
      });

      await expect(createStorefrontAccessToken(store._id.toString())).rejects.toThrow(
        /Failed to create Storefront access token/i
      );

      expect(await readStorefrontToken(store._id)).toBeUndefined();
      // Still fails closed for downstream storefront calls.
      const client = await shopifyStorefront.getStorefrontClientForStore(store._id.toString());
      expect(client.isConfigured).toBe(false);
    });

    it('is idempotent: a repeated call reuses the existing token instead of creating a duplicate', async () => {
      const store = await createConnectedStore('idempotent');

      // First call: no pre-existing tokens, so one is created.
      const first = await createStorefrontAccessToken(store._id.toString());
      expect(first).toEqual({ created: true, last4: STOREFRONT_TOKEN.slice(-4) });
      expect(createCallCount()).toBe(1);
      expect(await readStorefrontToken(store._id)).toBe(STOREFRONT_TOKEN);

      // Simulate the token now existing on the shop (as a reconnect/retry would
      // see it) and replay provisioning.
      postMock.mockClear();
      configureShopifyMock({
        existingTokens: [
          { id: 'gid://shopify/StorefrontAccessToken/1', title: TOKEN_TITLE, accessToken: STOREFRONT_TOKEN },
        ],
      });

      const second = await createStorefrontAccessToken(store._id.toString());

      // Reused, not recreated: no create mutation was issued this time.
      expect(second).toEqual({ created: false, last4: STOREFRONT_TOKEN.slice(-4) });
      expect(createCallCount()).toBe(0);
      expect(await readStorefrontToken(store._id)).toBe(STOREFRONT_TOKEN);
    });
  });

  describe('POST /api/v1/shopify/storefront-token endpoint', () => {
    const app = buildTestApp();
    let storeAId: Types.ObjectId;
    let storeBId: Types.ObjectId;
    let adminAToken: string;

    beforeEach(async () => {
      const [storeA, storeB] = await Promise.all([
        createConnectedStore('endpoint-a'),
        createConnectedStore('endpoint-b'),
      ]);
      storeAId = storeA._id;
      storeBId = storeB._id;

      const adminA = await User.create({
        name: 'Storefront Admin A',
        email: 'storefront-token-admin-a@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: storeAId,
      });
      adminAToken = generateToken(adminA._id.toString());
    });

    it('provisions the token for the authenticated owner store and never returns it in full', async () => {
      const response = await request(app)
        .post('/api/v1/shopify/storefront-token')
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.storefrontTokenPresent).toBe(true);
      expect(response.body.data.storefrontTokenLast4).toBe(STOREFRONT_TOKEN.slice(-4));
      // The full token value must never appear in the response body.
      expect(JSON.stringify(response.body)).not.toContain(STOREFRONT_TOKEN);

      expect(await readStorefrontToken(storeAId)).toBe(STOREFRONT_TOKEN);
    });

    it('rejects a non-super admin trying to target another store and leaves it untouched', async () => {
      const response = await request(app)
        .post('/api/v1/shopify/storefront-token')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Store-ID', storeBId.toString());

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ success: false, error: 'Store access denied' });
      expect(await readStorefrontToken(storeBId)).toBeUndefined();
    });

    it('requires authentication', async () => {
      const response = await request(app).post('/api/v1/shopify/storefront-token');
      expect(response.status).toBe(401);
    });
  });
});
