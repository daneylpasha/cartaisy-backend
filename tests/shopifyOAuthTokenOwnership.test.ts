import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import axios from 'axios';
import fetch from 'node-fetch';
import Store from '../src/models/Store';
import User from '../src/models/User';
import { generateToken } from '../src/utils/jwt';
import { decrypt, encrypt } from '../src/utils/encryption';
import shopifyOAuthRoutes from '../src/routes/shopifyOAuthRoutes';
import { getAccessToken } from '../src/services/shopifyOAuthService';
import { getShopifyClientForStore } from '../src/services/shopifyService';
import { performFullSync } from '../src/services/syncService';
import {
  CATALOG_SYNC_STALE_AFTER_MS,
  settleInFlightCatalogSyncs,
} from '../src/services/catalogSyncService';

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

const installShopifyFetch = (revokeStatus = 200) => {
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
    if (href.includes('/admin/api_permissions/current.json')) {
      return jsonResponse({}, revokeStatus);
    }
    throw new Error(`unexpected fetch ${href}`);
  });
};

const expectNoToken = (payload: unknown) => {
  const serialized = JSON.stringify(payload);
  expect(serialized).not.toContain(RAW_TOKEN);
  expect(serialized).not.toContain(CLIENT_SECRET);
  expect(serialized).not.toContain('shpat_');
};

describe('Shopify OAuth token ownership (issue #153)', () => {
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
    delete process.env.SHOPIFY_OAUTH_RETURN_URL;
    delete process.env.SHOPIFY_API_KEY;
    delete process.env.SHOPIFY_API_SECRET;

    installShopifyFetch();
    performFullSyncMock.mockReset();
    performFullSyncMock.mockResolvedValue({
      inProgress: false,
      errors: [],
      lastFullSync: new Date('2026-09-23T00:00:00.000Z'),
      stats: { productsSync: 3, customersSync: 1, ordersSync: 2 },
    });

    const [storeA, storeB] = await Promise.all([
      Store.create({ name: 'OAuth Store A', slug: 'oauth-store-a', shopify: {} }),
      Store.create({ name: 'OAuth Store B', slug: 'oauth-store-b', shopify: {} }),
    ]);
    storeAId = storeA._id.toString();
    storeBId = storeB._id.toString();

    const [adminA, adminB, customer] = await Promise.all([
      User.create({
        name: 'OAuth Admin A',
        email: 'oauth-admin-a@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: storeA._id,
      }),
      User.create({
        name: 'OAuth Admin B',
        email: 'oauth-admin-b@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: storeB._id,
      }),
      User.create({
        name: 'OAuth Customer',
        email: 'oauth-customer@example.com',
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

  const startConnect = (token: string, shop: string, extra: Record<string, unknown> = {}) =>
    request(app)
      .post('/api/v1/shopify/oauth/connect')
      .set('Authorization', `Bearer ${token}`)
      .send({ shop, storeId: storeBId, ...extra });

  const finishCallback = (state: string, shop: string, extra: Record<string, string> = {}) => {
    const signed = signQuery({
      code: 'auth-code-from-shopify',
      shop,
      state,
      timestamp: '1710000000',
      ...extra,
    });
    return request(app)
      .get('/api/v1/shopify/oauth/callback')
      .redirects(0)
      .query(signed);
  };

  const waitForCatalogSyncToSettle = async (storeId: string) => {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const stored = await Store.findById(storeId).select('catalogSync.status');
      if (stored?.catalogSync?.status !== 'syncing') {
        await settleInFlightCatalogSyncs();
        return stored;
      }
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    throw new Error(`catalog sync for ${storeId} stayed syncing`);
  };

  const connectShop = async (token: string, shop: string) => {
    const start = await startConnect(token, shop);
    expect(start.status).toBe(200);
    const authorizationUrl = new URL(start.body.data.authorizationUrl);
    const state = authorizationUrl.searchParams.get('state');
    expect(state).toEqual(expect.any(String));
    const callback = await finishCallback(state as string, shop);
    if (callback.status === 200 || callback.status === 302) {
      await waitForCatalogSyncToSettle(storeAId);
    }
    return { start, callback, state: state as string, authorizationUrl };
  };

  test('store admin connect returns an authorize URL and does not return a token', async () => {
    const response = await startConnect(adminAToken, `https://${SHOP_A}/admin`);

    expect(response.status).toBe(200);
    expect(response.body.data.tokenOwner).toBe('backend');
    const authorizationUrl = new URL(response.body.data.authorizationUrl);
    expect(authorizationUrl.hostname).toBe(SHOP_A);
    expect(authorizationUrl.pathname).toBe('/admin/oauth/authorize');
    expect(authorizationUrl.searchParams.get('client_id')).toBe('partner-client-id');
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(
      'https://api.example.com/api/v1/shopify/oauth/callback'
    );
    expectNoToken(response.body);
    expect(authorizationUrl.toString()).not.toContain(CLIENT_SECRET);

    const pending = await Store.findById(storeAId).select('+shopify.oauthStateHash');
    expect(pending?.shopify?.oauthStateHash).toEqual(expect.any(String));
    expect(pending?.shopify?.oauthStateHash).not.toBe(response.body.data.state);
    expect(pending?.shopify?.oauthStateHash).toHaveLength(64);

    const other = await Store.findById(storeBId).select('+shopify.oauthStateHash');
    expect(other?.shopify?.oauthStateHash).toBeUndefined();
  });

  test('a customer cannot start connect, and a missing token is rejected', async () => {
    const customerResponse = await startConnect(customerToken, SHOP_A);
    expect(customerResponse.status).toBe(403);

    const anonymous = await request(app)
      .post('/api/v1/shopify/oauth/connect')
      .send({ shop: SHOP_A });
    expect(anonymous.status).toBe(401);
  });

  test('rejects a shop domain that is not a myshopify host', async () => {
    const response = await startConnect(adminAToken, 'https://evil.example/phish');
    expect(response.status).toBe(400);
    expectNoToken(response.body);
  });

  test('callback stores the encrypted admin token on that store only', async () => {
    const { callback } = await connectShop(adminAToken, SHOP_A);

    expect(callback.status).toBe(200);
    expect(callback.body.data.status).toBe('connected');
    expect(callback.body.data.tokenOwner).toBe('backend');
    expect(callback.body.data.shop.shop).toBe(SHOP_A);
    expectNoToken(callback.body);

    const stored = await Store.findById(storeAId).select('+shopify.accessToken');
    expect(stored?.shopify?.isConnected).toBe(true);
    expect(stored?.shopify?.accessToken).not.toBe(RAW_TOKEN);
    expect(decrypt(stored?.shopify?.accessToken as string)).toBe(RAW_TOKEN);
    expect(stored?.shopify?.shop).toBe(SHOP_A);
    expect(stored?.settings?.currency).toBe('USD');
    expect(stored?.settings?.timezone).toBe('America/New_York');

    const serialized = stored?.toJSON() as { shopify?: Record<string, unknown> };
    expect(serialized.shopify?.accessToken).toBeUndefined();
    expect(JSON.stringify(serialized)).not.toContain(RAW_TOKEN);

    const other = await Store.findById(storeBId).select('+shopify.accessToken');
    expect(other?.shopify?.isConnected).not.toBe(true);
    expect(other?.shopify?.accessToken).toBeFalsy();
    expect(other?.shopify?.shop).toBeFalsy();

    expect(await getAccessToken(storeAId)).toBe(RAW_TOKEN);
    expect(await getAccessToken(storeBId)).toBeNull();

    const clientA = await getShopifyClientForStore(storeAId);
    expect(clientA).not.toBeNull();
    expect(axiosCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: `https://${SHOP_A}/admin/api/2024-01`,
        headers: expect.objectContaining({ 'X-Shopify-Access-Token': RAW_TOKEN }),
      })
    );
    expect(await getShopifyClientForStore(storeBId)).toBeNull();
    const hosts = axiosCreate.mock.calls.map((call) => call[0]?.baseURL as string);
    expect(hosts.some((host) => host?.includes(SHOP_B))).toBe(false);

    const statusA = await request(app)
      .get('/api/v1/shopify/status')
      .query({ storeId: storeBId })
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(statusA.status).toBe(200);
    expect(statusA.body.data.status).toBe('connected');
    expect(statusA.body.data.shop).toBe(SHOP_A);
    expectNoToken(statusA.body);

    const statusB = await request(app)
      .get('/api/v1/shopify/status')
      .query({ storeId: storeAId })
      .set('Authorization', `Bearer ${adminBToken}`);
    expect(statusB.status).toBe(200);
    expect(statusB.body.data.status).toBe('disconnected');
    expect(statusB.body.data.shop).toBeNull();
    expect(statusB.body.data.tokenOwner).toBe('backend');
    expectNoToken(statusB.body);
  });

  test('callback rejects an invalid HMAC and does not save a token', async () => {
    const start = await startConnect(adminAToken, SHOP_A);
    const state = new URL(start.body.data.authorizationUrl).searchParams.get('state') as string;
    const signed = signQuery({
      code: 'auth-code-from-shopify',
      shop: SHOP_A,
      state,
      timestamp: '1710000000',
    }, 'wrong-secret');

    const callback = await request(app)
      .get('/api/v1/shopify/oauth/callback')
      .redirects(0)
      .query(signed);

    expect(callback.status).toBe(401);
    expectNoToken(callback.body);
    const stored = await Store.findById(storeAId).select('+shopify.accessToken');
    expect(stored?.shopify?.isConnected).not.toBe(true);
    expect(stored?.shopify?.accessToken).toBeFalsy();
  });

  test('callback state is single-use and expires', async () => {
    const start = await startConnect(adminAToken, SHOP_A);
    const state = new URL(start.body.data.authorizationUrl).searchParams.get('state') as string;

    await Store.updateOne(
      { _id: storeAId },
      { $set: { 'shopify.oauthStateExpiresAt': new Date(Date.now() - 1000) } }
    );
    const expired = await finishCallback(state, SHOP_A);
    expect(expired.status).toBe(401);

    const restart = await startConnect(adminAToken, SHOP_A);
    const freshState = new URL(restart.body.data.authorizationUrl).searchParams.get('state') as string;
    const first = await finishCallback(freshState, SHOP_A);
    expect(first.status).toBe(200);
    await waitForCatalogSyncToSettle(storeAId);
    const second = await finishCallback(freshState, SHOP_A);
    expect(second.status).toBe(401);
    expectNoToken(second.body);
  });

  test('one shop cannot be connected to two stores, and switching shops requires disconnect', async () => {
    const first = await connectShop(adminAToken, SHOP_A);
    expect(first.callback.status).toBe(200);

    const taken = await startConnect(adminBToken, SHOP_A);
    expect(taken.status).toBe(409);
    expectNoToken(taken.body);
    const storeB = await Store.findById(storeBId).select('+shopify.accessToken');
    expect(storeB?.shopify?.accessToken).toBeFalsy();
    expect(storeB?.shopify?.isConnected).not.toBe(true);

    const switched = await startConnect(adminAToken, SHOP_B);
    expect(switched.status).toBe(409);

    const sameShop = await startConnect(adminAToken, SHOP_A);
    expect(sameShop.status).toBe(200);
    expectNoToken(sameShop.body);
  });

  test('disconnect revokes the Shopify token and reports disconnected', async () => {
    await connectShop(adminAToken, SHOP_A);
    fetchMock.mockClear();

    const response = await request(app)
      .post('/api/v1/shopify/disconnect')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ storeId: storeBId });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('disconnected');
    expect(response.body.data.isConnected).toBe(false);
    expect(response.body.data.shopifyRevoked).toBe(true);
    expectNoToken(response.body);

    const revokeCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('/admin/api_permissions/current.json')
    );
    expect(revokeCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ 'X-Shopify-Access-Token': RAW_TOKEN }),
      })
    );

    const stored = await Store.findById(storeAId).select('+shopify.accessToken');
    expect(stored?.shopify?.isConnected).toBe(false);
    expect(stored?.shopify?.accessToken).toBeFalsy();
    expect(stored?.shopify?.shop).toBeFalsy();
    expect(stored?.shopify?.complianceShop).toBe(SHOP_A);
    expect(stored?.shopify?.storefrontAccessToken).toBeFalsy();
    expect(await getAccessToken(storeAId)).toBeNull();
    expect(await getShopifyClientForStore(storeAId)).toBeNull();

    const status = await request(app)
      .get('/api/v1/shopify/status')
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(status.body.data.status).toBe('disconnected');
    expect(status.body.data.shop).toBeNull();

    const other = await Store.findById(storeBId).select('+shopify.accessToken');
    expect(other?.shopify?.isConnected).not.toBe(true);
  });

  test('a failed Shopify revoke leaves the backend token in place', async () => {
    await connectShop(adminAToken, SHOP_A);
    installShopifyFetch(500);

    const response = await request(app)
      .post('/api/v1/shopify/disconnect')
      .set('Authorization', `Bearer ${adminAToken}`);

    expect(response.status).toBe(502);
    expectNoToken(response.body);

    const stored = await Store.findById(storeAId).select('+shopify.accessToken');
    expect(stored?.shopify?.isConnected).toBe(true);
    expect(decrypt(stored?.shopify?.accessToken as string)).toBe(RAW_TOKEN);

    const status = await request(app)
      .get('/api/v1/shopify/status')
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(status.body.data.status).toBe('connected');
    expect(status.body.data.shop).toBe(SHOP_A);
  });

  test('trigger sync uses only the authenticated connected store', async () => {
    const disconnected = await request(app)
      .post('/api/v1/shopify/sync')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ storeId: storeBId });
    expect(disconnected.status).toBe(409);
    expect(performFullSyncMock).not.toHaveBeenCalled();

    await connectShop(adminAToken, SHOP_A);
    performFullSyncMock.mockClear();

    const synced = await request(app)
      .post('/api/v1/shopify/sync')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ storeId: storeBId });

    expect(synced.status).toBe(200);
    expect(synced.body.data.status).toBe('succeeded');
    expect(synced.body.data.storeId).toBe(storeAId);
    expect(synced.body.data.stats.productsSync).toBe(3);
    expect(synced.body.data.primaryAction).toBe('Sync again');
    expect(synced.body.data.eligibleForBuild).toBe(true);
    expectNoToken(synced.body);
    expect(performFullSyncMock).toHaveBeenCalledTimes(1);
    expect(performFullSyncMock).toHaveBeenCalledWith(storeAId);

    const ownStatus = await request(app)
      .get('/api/v1/shopify/sync')
      .set('Authorization', `Bearer ${adminAToken}`)
      .query({ storeId: storeBId });
    expect(ownStatus.status).toBe(200);
    expect(ownStatus.body.data.status).toBe('succeeded');
    expect(ownStatus.body.data.storeId).toBe(storeAId);
    expectNoToken(ownStatus.body);

    const otherStore = await request(app)
      .post('/api/v1/shopify/sync')
      .set('Authorization', `Bearer ${adminBToken}`);
    expect(otherStore.status).toBe(409);
    expect(performFullSyncMock).toHaveBeenCalledTimes(1);

    const otherStatus = await request(app)
      .get('/api/v1/shopify/sync')
      .set('Authorization', `Bearer ${adminBToken}`);
    expect(otherStatus.status).toBe(200);
    expect(otherStatus.body.data.status).toBe('idle');
    expect(otherStatus.body.data.storeId).toBe(storeBId);
    expect(otherStatus.body.data.eligibleForBuild).toBe(false);
    expect(JSON.stringify(otherStatus.body)).not.toContain(SHOP_A);
  });

  test('connecting a different shop clears the previous catalog sync success', async () => {
    await connectShop(adminAToken, SHOP_A);
    await Store.updateOne(
      { _id: storeAId },
      {
        $set: {
          catalogSync: {
            status: 'succeeded',
            shop: SHOP_A,
            lastSucceededAt: new Date('2026-09-23T00:00:00.000Z'),
            attempts: 1,
          },
        },
      }
    );

    const disconnected = await request(app)
      .post('/api/v1/shopify/disconnect')
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(disconnected.status).toBe(200);

    await connectShop(adminAToken, SHOP_B);

    const stored = await Store.findById(storeAId).select('shopify.shop shopify.isConnected catalogSync');
    expect(stored?.shopify?.shop).toBe(SHOP_B);
    expect(stored?.catalogSync?.status).toBe('succeeded');
    expect(stored?.catalogSync?.shop).toBe(SHOP_B);
    expect(stored?.catalogSync?.lastSucceededAt).toBeInstanceOf(Date);
    expect(stored?.catalogSync?.lastSucceededAt?.toISOString()).not.toBe(
      '2026-09-23T00:00:00.000Z'
    );
    expect(stored?.shopify?.isConnected).toBe(true);
  });

  test('disconnect clears a token that has no shop domain without calling Shopify', async () => {
    await Store.updateOne(
      { _id: storeAId },
      {
        $set: {
          'shopify.isConnected': true,
          'shopify.accessToken': encrypt(RAW_TOKEN),
        },
        $unset: { 'shopify.shop': '' },
      }
    );

    const response = await request(app)
      .post('/api/v1/shopify/disconnect')
      .set('Authorization', `Bearer ${adminAToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('disconnected');
    expect(response.body.data.shopifyRevoked).toBe(false);
    expectNoToken(response.body);
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes('api_permissions'))
    ).toBe(false);

    const stored = await Store.findById(storeAId).select('+shopify.accessToken');
    expect(stored?.shopify?.isConnected).toBe(false);
    expect(stored?.shopify?.accessToken).toBeFalsy();
  });

  test('browser callback redirects to the configured dashboard URL without the token', async () => {
    process.env.SHOPIFY_OAUTH_RETURN_URL = 'https://dashboard.example.com/onboarding';
    const start = await startConnect(adminAToken, SHOP_A);
    const state = new URL(start.body.data.authorizationUrl).searchParams.get('state') as string;
    const callback = await finishCallback(state, SHOP_A, {
      return_url: 'https://evil.example/steal',
    });

    expect(callback.status).toBe(302);
    const location = callback.headers.location as string;
    expect(location.startsWith('https://dashboard.example.com/onboarding')).toBe(true);
    expect(location).toContain('shopify=connected');
    expect(location).toContain(`shop=${SHOP_A}`);
    expect(location).not.toContain('evil.example');
    expect(location).not.toContain(RAW_TOKEN);
    expect(location).not.toContain('auth-code-from-shopify');
    await waitForCatalogSyncToSettle(storeAId);
  });

  test('falls back to SHOPIFY_API_KEY and SHOPIFY_API_SECRET when partner names are unset', async () => {
    delete process.env.SHOPIFY_CLIENT_ID;
    delete process.env.SHOPIFY_CLIENT_SECRET;
    process.env.SHOPIFY_API_KEY = 'legacy-app-key';
    process.env.SHOPIFY_API_SECRET = 'legacy-app-secret';

    const start = await startConnect(adminAToken, SHOP_A);
    expect(start.status).toBe(200);
    const authorizationUrl = new URL(start.body.data.authorizationUrl);
    expect(authorizationUrl.searchParams.get('client_id')).toBe('legacy-app-key');
    expect(authorizationUrl.toString()).not.toContain('legacy-app-secret');

    const state = authorizationUrl.searchParams.get('state') as string;
    const signed = signQuery(
      {
        code: 'auth-code-from-shopify',
        shop: SHOP_A,
        state,
        timestamp: '1710000000',
      },
      'legacy-app-secret'
    );
    const callback = await request(app)
      .get('/api/v1/shopify/oauth/callback')
      .redirects(0)
      .query(signed);

    expect(callback.status).toBe(200);
    expectNoToken(callback.body);
    expect(await getAccessToken(storeAId)).toBe(RAW_TOKEN);
    expect(await getAccessToken(storeBId)).toBeNull();
    await waitForCatalogSyncToSettle(storeAId);
  });

  test('callback starts catalog sync and redirects without waiting for it', async () => {
    let releaseSync: (value: unknown) => void = () => undefined;
    const gate = new Promise(resolve => {
      releaseSync = resolve;
    });
    performFullSyncMock.mockImplementation(() => gate);

    process.env.SHOPIFY_OAUTH_RETURN_URL = 'https://dashboard.example.com/onboarding';
    const start = await startConnect(adminAToken, SHOP_A);
    const state = new URL(start.body.data.authorizationUrl).searchParams.get('state') as string;

    try {
      const callback = await finishCallback(state, SHOP_A);
      expect(callback.status).toBe(302);
      expect(callback.headers.location).toContain('shopify=connected');
      expect(performFullSyncMock).toHaveBeenCalledTimes(1);
      expect(performFullSyncMock).toHaveBeenCalledWith(storeAId);

      const mid = await Store.findById(storeAId).select('shopify.lastSyncAt catalogSync');
      expect(mid?.catalogSync?.status).toBe('syncing');
      expect(mid?.catalogSync?.shop).toBe(SHOP_A);
      expect(mid?.shopify?.lastSyncAt).toBeUndefined();

      const status = await request(app)
        .get('/api/v1/shopify/sync')
        .set('Authorization', `Bearer ${adminAToken}`);
      expect(status.status).toBe(200);
      expect(status.body.data.status).toBe('syncing');
      expect(status.body.data.eligibleForBuild).toBe(false);
      expect(status.body.data.storeId).toBe(storeAId);

      const duplicate = await request(app)
        .post('/api/v1/shopify/sync')
        .set('Authorization', `Bearer ${adminAToken}`);
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.code).toBe('CATALOG_SYNC_IN_PROGRESS');
      expect(performFullSyncMock).toHaveBeenCalledTimes(1);

      const secondStart = await startConnect(adminAToken, SHOP_A);
      expect(secondStart.status).toBe(200);
      const secondState = new URL(secondStart.body.data.authorizationUrl).searchParams.get(
        'state'
      ) as string;
      const secondCallback = await finishCallback(secondState, SHOP_A);
      expect(secondCallback.status).toBe(302);
      expect(performFullSyncMock).toHaveBeenCalledTimes(1);

      const stillSyncing = await Store.findById(storeAId).select('catalogSync.status');
      expect(stillSyncing?.catalogSync?.status).toBe('syncing');
    } finally {
      releaseSync({
        inProgress: false,
        errors: [],
        lastFullSync: new Date('2026-09-23T00:00:00.000Z'),
        stats: { productsSync: 3, customersSync: 1, ordersSync: 2 },
      });
      await waitForCatalogSyncToSettle(storeAId);
    }
  });

  test('a catalog sync error does not fail the oauth callback', async () => {
    performFullSyncMock.mockRejectedValue(new Error(`Shopify down ${RAW_TOKEN}`));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const { callback } = await connectShop(adminAToken, SHOP_A);
      expect(callback.status).toBe(200);
      expect(callback.body.success).toBe(true);
      expect(callback.body.data.status).toBe('connected');
      expectNoToken(callback.body);

      const stored = await Store.findById(storeAId).select('catalogSync');
      expect(stored?.catalogSync?.status).toBe('failed');
      expect(stored?.catalogSync?.shop).toBe(SHOP_A);
      expect(stored?.catalogSync?.errorSummary).not.toContain(RAW_TOKEN);
      expect(stored?.catalogSync?.errorSummary).toContain('[redacted]');

      const logged = [...warnSpy.mock.calls, ...errorSpy.mock.calls]
        .flat()
        .map(entry => String(entry))
        .join('\n');
      expect(logged).toContain(storeAId);
      expect(logged).toContain(SHOP_A);
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  test('reconnecting the same shop starts another catalog sync', async () => {
    await connectShop(adminAToken, SHOP_A);
    performFullSyncMock.mockClear();

    const second = await connectShop(adminAToken, SHOP_A);
    expect(second.callback.status).toBe(200);
    expect(performFullSyncMock).toHaveBeenCalledTimes(1);
    expect(performFullSyncMock).toHaveBeenCalledWith(storeAId);

    const stored = await Store.findById(storeAId).select('catalogSync');
    expect(stored?.catalogSync?.status).toBe('succeeded');
    expect(stored?.catalogSync?.shop).toBe(SHOP_A);
  });

  test('a stale syncing record can be restarted from the oauth callback', async () => {
    await connectShop(adminAToken, SHOP_A);
    await Store.updateOne(
      { _id: storeAId },
      {
        $set: {
          'catalogSync.status': 'syncing',
          'catalogSync.shop': SHOP_A,
          'catalogSync.startedAt': new Date(Date.now() - CATALOG_SYNC_STALE_AFTER_MS - 1000),
          'catalogSync.attempts': 1,
        },
      }
    );
    performFullSyncMock.mockClear();

    const restarted = await connectShop(adminAToken, SHOP_A);
    expect(restarted.callback.status).toBe(200);
    expect(performFullSyncMock).toHaveBeenCalledTimes(1);
    expect(performFullSyncMock).toHaveBeenCalledWith(storeAId);

    const stored = await Store.findById(storeAId).select('catalogSync');
    expect(stored?.catalogSync?.status).toBe('succeeded');
    expect(stored?.catalogSync?.shop).toBe(SHOP_A);
  });
});
