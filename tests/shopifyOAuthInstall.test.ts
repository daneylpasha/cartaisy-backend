import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import axios from 'axios';
import fetch from 'node-fetch';
import ShopifyPendingInstall from '../src/models/ShopifyPendingInstall';
import Store from '../src/models/Store';
import User from '../src/models/User';
import { generateToken } from '../src/utils/jwt';
import { decrypt } from '../src/utils/encryption';
import shopifyOAuthRoutes from '../src/routes/shopifyOAuthRoutes';
import { getAccessToken } from '../src/services/shopifyOAuthService';
import { performFullSync } from '../src/services/syncService';
import { settleInFlightCatalogSyncs } from '../src/services/catalogSyncService';
import { settleInFlightOperationalWebhookRegistrations } from '../src/services/shopifyWebhookSubscriptionService';

jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      post: jest.fn().mockRejectedValue(new Error('storefront provisioning skipped')),
      get: jest.fn(),
    })),
  },
}));

jest.mock('../src/services/syncService', () => ({
  performFullSync: jest.fn(),
}));

const fetchMock = fetch as unknown as jest.Mock;
const axiosCreate = axios.create as unknown as jest.Mock;
const performFullSyncMock = performFullSync as unknown as jest.Mock;

const RAW_TOKEN = 'shpat_test_token_value_not_for_clients';
const CLIENT_SECRET = 'partner-client-secret';
const SHOP_A = 'alpha.myshopify.com';
const SHOP_B = 'beta.myshopify.com';

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/shopify', shopifyOAuthRoutes);
  return app;
};

const signQuery = (
  params: Record<string, string>,
  secret: string = CLIENT_SECRET
): Record<string, string> => {
  const message = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  const hmac = crypto.createHmac('sha256', secret).update(message).digest('hex');
  return { ...params, hmac };
};

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 200 ? 'OK' : 'Error',
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const installShopifyFetch = () => {
  fetchMock.mockImplementation(async (url: unknown) => {
    const href = String(url);
    if (href.includes('/admin/oauth/access_token')) {
      return jsonResponse({
        access_token: RAW_TOKEN,
        scope: 'read_products,write_products',
      });
    }
    if (href.includes('/graphql.json')) {
      return jsonResponse({
        data: {
          shop: {
            name: 'Alpha Shop',
            email: 'alpha@example.com',
            myshopifyDomain: SHOP_A,
            primaryDomain: { host: SHOP_A },
            currencyCode: 'USD',
            ianaTimezone: 'America/New_York',
            billingAddress: { countryCode: 'US' },
          },
        },
      });
    }
    if (href.includes('/locations.json')) {
      return jsonResponse({ locations: [{ id: 99, name: 'Main', active: true }] });
    }
    throw new Error(`unexpected fetch ${href}`);
  });
};

const freshTimestamp = (): string => Math.floor(Date.now() / 1000).toString();

const expectNoToken = (payload: unknown) => {
  const serialized = JSON.stringify(payload);
  expect(serialized).not.toContain(RAW_TOKEN);
  expect(serialized).not.toContain(CLIENT_SECRET);
  expect(serialized).not.toContain('shpat_');
};

describe('Shopify public App Store install (issue #207)', () => {
  const app = buildTestApp();
  let storeAId: string;
  let storeBId: string;
  let adminAToken: string;
  let adminBToken: string;
  let customerToken: string;

  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = 'test-encryption-key-0123456789abcdef';
    process.env.SHOPIFY_CLIENT_ID = 'partner-client-id';
    process.env.SHOPIFY_CLIENT_SECRET = CLIENT_SECRET;
    process.env.SHOPIFY_REDIRECT_URI = 'https://api.example.com/api/v1/shopify/oauth/callback';
    process.env.SHOPIFY_SCOPES = 'read_products,write_products';
    process.env.SHOPIFY_OAUTH_RETURN_URL = 'https://dashboard.example.com/onboarding';
    delete process.env.SHOPIFY_API_KEY;
    delete process.env.SHOPIFY_API_SECRET;
    delete process.env.SHOPIFY_WEBHOOK_URL;

    installShopifyFetch();
    axiosCreate.mockReset();
    axiosCreate.mockImplementation(() => ({
      post: jest.fn().mockRejectedValue(new Error('storefront provisioning skipped')),
      get: jest.fn(),
    }));
    performFullSyncMock.mockReset();
    performFullSyncMock.mockResolvedValue({
      inProgress: false,
      errors: [],
      lastFullSync: new Date('2026-10-02T00:00:00.000Z'),
      stats: { productsSync: 1, customersSync: 0, ordersSync: 0 },
    });

    const [storeA, storeB] = await Promise.all([
      Store.create({ name: 'Install Store A', slug: 'install-store-a', shopify: {} }),
      Store.create({ name: 'Install Store B', slug: 'install-store-b', shopify: {} }),
    ]);
    storeAId = storeA._id.toString();
    storeBId = storeB._id.toString();

    const [adminA, adminB, customer] = await Promise.all([
      User.create({
        name: 'Install Admin A',
        email: 'install-admin-a@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: storeA._id,
      }),
      User.create({
        name: 'Install Admin B',
        email: 'install-admin-b@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: storeB._id,
      }),
      User.create({
        name: 'Install Customer',
        email: 'install-customer@example.com',
        password: 'password123',
        role: 'customer',
        isActive: true,
        storeId: storeA._id,
      }),
    ]);

    adminAToken = generateToken(adminA._id.toString());
    adminBToken = generateToken(adminB._id.toString());
    customerToken = generateToken(customer._id.toString());
  });

  const installQuery = (shop: string, extra: Record<string, string> = {}) =>
    signQuery({
      shop,
      timestamp: freshTimestamp(),
      host: Buffer.from(`${shop}/admin`).toString('base64'),
      ...extra,
    });

  const startInstall = (shop: string, extra: Record<string, string> = {}) =>
    request(app)
      .get('/api/v1/shopify/oauth/install')
      .redirects(0)
      .query(installQuery(shop, extra));

  const finishCallback = (state: string, shop: string) => {
    const signed = signQuery({
      code: 'auth-code-from-shopify',
      shop,
      state,
      timestamp: '1710000000',
    });
    return request(app)
      .get('/api/v1/shopify/oauth/callback')
      .redirects(0)
      .query(signed);
  };

  const tokenExchangeCalls = () =>
    fetchMock.mock.calls.filter((call) => String(call[0]).includes('/admin/oauth/access_token'));

  const claimTokenFrom = (location: string): string => {
    const redirected = new URL(location);
    expect(redirected.searchParams.get('claim_token')).toBeNull();
    const token = new URLSearchParams(redirected.hash.replace(/^#/, '')).get('claim_token');
    expect(token).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
    return token as string;
  };

  const claimShop = (token: string, shop: string, claimToken: string, body: Record<string, unknown> = {}) =>
    request(app)
      .post('/api/v1/shopify/oauth/claim')
      .set('Authorization', `Bearer ${token}`)
      .send({ shop, claimToken, ...body });

  const settleConnectWork = async () => {
    await settleInFlightCatalogSyncs();
    await settleInFlightOperationalWebhookRegistrations();
  };

  test('rejects an install query whose HMAC does not match and does not redirect', async () => {
    const response = await request(app)
      .get('/api/v1/shopify/oauth/install')
      .redirects(0)
      .query({
        shop: SHOP_A,
        timestamp: freshTimestamp(),
        host: 'admin-host',
        hmac: 'ab'.repeat(32),
      });

    expect(response.status).toBe(401);
    expect(response.headers.location).toBeUndefined();
    expect(response.body.success).toBe(false);
    expectNoToken(response.body);
    expect(await ShopifyPendingInstall.countDocuments()).toBe(0);
    expect(tokenExchangeCalls()).toHaveLength(0);
  });

  test('rejects an install query that has no HMAC', async () => {
    const response = await request(app)
      .get('/api/v1/shopify/oauth/install')
      .redirects(0)
      .query({
        shop: SHOP_A,
        timestamp: freshTimestamp(),
        host: 'admin-host',
      });

    expect(response.status).toBe(401);
    expect(response.headers.location).toBeUndefined();
    expect(await ShopifyPendingInstall.countDocuments()).toBe(0);
  });

  test('rejects a signed install query with a stale timestamp', async () => {
    const response = await request(app)
      .get('/api/v1/shopify/oauth/install')
      .redirects(0)
      .query(signQuery({
        shop: SHOP_A,
        timestamp: '1710000000',
        host: 'admin-host',
      }));

    expect(response.status).toBe(401);
    expect(response.headers.location).toBeUndefined();
    expect(await ShopifyPendingInstall.countDocuments()).toBe(0);
  });

  test('valid install redirects to the Shopify authorize URL without a store', async () => {
    const response = await startInstall(SHOP_A);

    expect(response.status).toBe(302);
    const location = response.headers.location as string;
    const authorizationUrl = new URL(location);
    expect(authorizationUrl.origin).toBe(`https://${SHOP_A}`);
    expect(authorizationUrl.pathname).toBe('/admin/oauth/authorize');
    expect(authorizationUrl.searchParams.get('client_id')).toBe('partner-client-id');
    expect(authorizationUrl.searchParams.get('scope')).toBe('read_products,write_products');
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(
      'https://api.example.com/api/v1/shopify/oauth/callback'
    );
    const state = authorizationUrl.searchParams.get('state');
    expect(state).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(location).not.toContain(CLIENT_SECRET);
    expect(location).not.toContain(RAW_TOKEN);

    const pending = await ShopifyPendingInstall.findOne({ shop: SHOP_A });
    expect(pending?.status).toBe('awaiting_auth');
    expect(pending?.stateHash).toBe(crypto.createHash('sha256').update(state as string).digest('hex'));
    expect(pending?.accessToken).toBeUndefined();

    const stores = await Store.find({
      'shopify.isConnected': true,
    }).select('_id');
    expect(stores).toHaveLength(0);
    expect(performFullSyncMock).not.toHaveBeenCalled();
  });

  test('pending callback redirects to the return URL and does not sync or require a store', async () => {
    const install = await startInstall(SHOP_A);
    const state = new URL(install.headers.location as string).searchParams.get('state') as string;

    const callback = await finishCallback(state, SHOP_A);

    expect(callback.status).toBe(302);
    const location = callback.headers.location as string;
    expect(location.startsWith('https://dashboard.example.com/onboarding')).toBe(true);
    const redirected = new URL(location);
    expect(redirected.searchParams.get('shopify')).toBe('connected');
    expect(redirected.searchParams.get('shop')).toBe(SHOP_A);
    expect(redirected.searchParams.get('claim')).toBe('pending');
    const claimToken = claimTokenFrom(location);
    expect(location).not.toContain(RAW_TOKEN);
    expect(location).not.toContain('auth-code-from-shopify');
    expect(location).not.toContain(CLIENT_SECRET);

    await settleConnectWork();
    expect(performFullSyncMock).not.toHaveBeenCalled();
    expect(tokenExchangeCalls()).toHaveLength(1);

    const pending = await ShopifyPendingInstall.findOne({ shop: SHOP_A }).select('+accessToken');
    expect(pending?.status).toBe('authorized');
    expect(pending?.stateHash).toBeUndefined();
    expect(pending?.scope).toBe('read_products,write_products');
    expect(pending?.accessToken).toEqual(expect.any(String));
    expect(pending?.accessToken).not.toContain(RAW_TOKEN);
    expect(pending?.accessToken).not.toContain(claimToken);
    expect(decrypt(pending?.accessToken as string)).toBe(RAW_TOKEN);
    const withHash = await ShopifyPendingInstall.findById(pending?._id).select('+claimTokenHash');
    expect(withHash?.claimTokenHash).toBe(
      crypto.createHash('sha256').update(claimToken).digest('hex')
    );
    expect(withHash?.claimTokenHash).not.toBe(claimToken);

    const [storeA, storeB] = await Promise.all([
      Store.findById(storeAId).select('+shopify.accessToken shopify.isConnected shopify.shop catalogSync'),
      Store.findById(storeBId).select('+shopify.accessToken shopify.isConnected'),
    ]);
    expect(storeA?.shopify?.isConnected).not.toBe(true);
    expect(storeA?.shopify?.accessToken).toBeFalsy();
    expect(storeA?.catalogSync?.status).toBeUndefined();
    expect(storeB?.shopify?.isConnected).not.toBe(true);

    const replay = await finishCallback(state, SHOP_A);
    expect(replay.status).toBe(302);
    expect(replay.headers.location).toContain('shopify=error');
    expect(replay.headers.location).toContain('reason=invalid_state');
    expect(tokenExchangeCalls()).toHaveLength(1);
    expect(performFullSyncMock).not.toHaveBeenCalled();
  });

  test('claim attaches the pending token to the authenticated store and starts sync', async () => {
    const install = await startInstall(SHOP_A);
    const state = new URL(install.headers.location as string).searchParams.get('state') as string;
    const callback = await finishCallback(state, SHOP_A);
    expect(callback.status).toBe(302);

    const claimToken = claimTokenFrom(callback.headers.location as string);

    const unauthenticated = await request(app)
      .post('/api/v1/shopify/oauth/claim')
      .send({ shop: SHOP_A, claimToken });
    expect(unauthenticated.status).toBe(401);

    const customer = await request(app)
      .post('/api/v1/shopify/oauth/claim')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shop: SHOP_A, claimToken });
    expect(customer.status).toBe(403);
    expect(await getAccessToken(storeAId)).toBeNull();

    const missingNonce = await request(app)
      .post('/api/v1/shopify/oauth/claim')
      .set('Authorization', `Bearer ${adminBToken}`)
      .send({ shop: SHOP_A });
    expect(missingNonce.status).toBe(400);

    const wrongNonce = await claimShop(adminBToken, SHOP_A, 'ab'.repeat(32));
    expect(wrongNonce.status).toBe(404);
    expectNoToken(wrongNonce.body);
    expect(await getAccessToken(storeBId)).toBeNull();
    const stillPending = await ShopifyPendingInstall.findOne({ shop: SHOP_A });
    expect(stillPending?.status).toBe('authorized');

    const claimed = await claimShop(adminAToken, SHOP_A, claimToken, { storeId: storeBId });

    expect(claimed.status).toBe(200);
    expect(claimed.body.data.status).toBe('connected');
    expect(claimed.body.data.tokenOwner).toBe('backend');
    expect(claimed.body.data.shop.shop).toBe(SHOP_A);
    expectNoToken(claimed.body);
    expect(JSON.stringify(claimed.body)).not.toContain(claimToken);

    await settleConnectWork();
    expect(performFullSyncMock).toHaveBeenCalledTimes(1);
    expect(performFullSyncMock).toHaveBeenCalledWith(storeAId);
    expect(await getAccessToken(storeAId)).toBe(RAW_TOKEN);
    expect(await getAccessToken(storeBId)).toBeNull();

    const storedA = await Store.findById(storeAId).select('shopify.shop shopify.isConnected catalogSync');
    expect(storedA?.shopify?.isConnected).toBe(true);
    expect(storedA?.shopify?.shop).toBe(SHOP_A);
    expect(storedA?.catalogSync?.status).toBe('succeeded');
    expect(await ShopifyPendingInstall.countDocuments({ shop: SHOP_A })).toBe(0);

    const again = await claimShop(adminBToken, SHOP_A, claimToken);
    expect(again.status).toBe(404);
    expect(await getAccessToken(storeBId)).toBeNull();
    expect(performFullSyncMock).toHaveBeenCalledTimes(1);
  });

  test('an expired pending install cannot be claimed', async () => {
    const install = await startInstall(SHOP_A);
    const state = new URL(install.headers.location as string).searchParams.get('state') as string;
    const callback = await finishCallback(state, SHOP_A);
    expect(callback.status).toBe(302);
    const claimToken = claimTokenFrom(callback.headers.location as string);

    await ShopifyPendingInstall.updateOne(
      { shop: SHOP_A },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );

    const claimed = await claimShop(adminAToken, SHOP_A, claimToken);

    expect(claimed.status).toBe(404);
    expectNoToken(claimed.body);
    expect(await getAccessToken(storeAId)).toBeNull();
    expect(performFullSyncMock).not.toHaveBeenCalled();
  });

  test('a pending callback for a different shop does not store the token', async () => {
    const install = await startInstall(SHOP_A);
    const state = new URL(install.headers.location as string).searchParams.get('state') as string;
    const signed = signQuery({
      code: 'auth-code-from-shopify',
      shop: SHOP_B,
      state,
      timestamp: '1710000000',
    });

    const callback = await request(app)
      .get('/api/v1/shopify/oauth/callback')
      .redirects(0)
      .query(signed);

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toContain('reason=invalid_state');
    expect(callback.headers.location).not.toContain('claim_token');
    expect(tokenExchangeCalls()).toHaveLength(0);

    const pending = await ShopifyPendingInstall.findOne({ shop: SHOP_A }).select('+accessToken');
    expect(pending?.status).toBe('exchanging');
    expect(pending?.accessToken).toBeFalsy();
    expect(await getAccessToken(storeAId)).toBeNull();
    expect(await getAccessToken(storeBId)).toBeNull();
    expect(performFullSyncMock).not.toHaveBeenCalled();
  });

  test('claim refuses a shop that is already connected to another store', async () => {
    const start = await request(app)
      .post('/api/v1/shopify/oauth/connect')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ shop: SHOP_A });
    const connectedState = new URL(start.body.data.authorizationUrl).searchParams.get('state') as string;
    expect((await finishCallback(connectedState, SHOP_A)).status).toBe(302);
    await settleConnectWork();
    expect(await getAccessToken(storeAId)).toBe(RAW_TOKEN);
    performFullSyncMock.mockClear();

    const install = await startInstall(SHOP_A);
    const installState = new URL(install.headers.location as string).searchParams.get('state') as string;
    const callback = await finishCallback(installState, SHOP_A);
    const claimToken = claimTokenFrom(callback.headers.location as string);

    const stolen = await claimShop(adminBToken, SHOP_A, claimToken);
    expect(stolen.status).toBe(409);
    expectNoToken(stolen.body);
    expect(JSON.stringify(stolen.body)).not.toContain(claimToken);
    expect(await getAccessToken(storeBId)).toBeNull();
    expect(await getAccessToken(storeAId)).toBe(RAW_TOKEN);

    const pending = await ShopifyPendingInstall.findOne({ shop: SHOP_A });
    expect(pending?.status).toBe('authorized');
    expect(performFullSyncMock).not.toHaveBeenCalled();
  });

  test('dashboard connect still returns an authorize URL and connects that store', async () => {
    const start = await request(app)
      .post('/api/v1/shopify/oauth/connect')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ shop: SHOP_B, storeId: storeBId });

    expect(start.status).toBe(200);
    expect(start.body.data.tokenOwner).toBe('backend');
    const authorizationUrl = new URL(start.body.data.authorizationUrl);
    expect(authorizationUrl.pathname).toBe('/admin/oauth/authorize');
    expect(authorizationUrl.hostname).toBe(SHOP_B);
    expectNoToken(start.body);
    expect(await ShopifyPendingInstall.countDocuments()).toBe(0);

    const state = authorizationUrl.searchParams.get('state') as string;
    const callback = await finishCallback(state, SHOP_B);

    expect(callback.status).toBe(302);
    const location = callback.headers.location as string;
    expect(location).toContain('shopify=connected');
    expect(location).toContain(`shop=${encodeURIComponent(SHOP_B)}`);
    expect(location).not.toContain('claim=pending');
    expect(location).not.toContain('claim_token');
    expect(location).not.toContain(RAW_TOKEN);

    await settleConnectWork();
    expect(performFullSyncMock).toHaveBeenCalledTimes(1);
    expect(performFullSyncMock).toHaveBeenCalledWith(storeAId);
    expect(await getAccessToken(storeAId)).toBe(RAW_TOKEN);
    expect(await getAccessToken(storeBId)).toBeNull();
    expect(await ShopifyPendingInstall.countDocuments()).toBe(0);
  });
});
