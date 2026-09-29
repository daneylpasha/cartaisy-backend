import express from 'express';
import request from 'supertest';
import axios from 'axios';
import fetch from 'node-fetch';
import Store from '../src/models/Store';
import User from '../src/models/User';
import { generateToken } from '../src/utils/jwt';
import { syncOrders, syncProducts } from '../src/services/shopifyService';
import { resetSyncStatus } from '../src/services/syncService';
import shopifyOAuthRoutes from '../src/routes/shopifyOAuthRoutes';
import shopifyRoutes from '../src/routes/shopifyRoutes';
import {
  SHOPIFY_PAYMENT_REQUIRED_CODE,
  SHOPIFY_PAYMENT_REQUIRED_MESSAGE,
  ShopifyAdminBillingError,
  isShopifyAdminBillingHttpFailure,
  shopifyAdminBillingErrorFromGraphqlErrors,
  shopifyAdminBillingErrorFromHttp,
  shopifyAdminBillingErrorFromUnknown,
} from '../src/utils/shopifyAdminBilling';

jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-0123456789abcdef';

const fetchMock = fetch as unknown as jest.Mock;

const TOKEN = 'shpat_billing_test_token';
const RAW_BODY = 'Unavailable Shop';
const SHOP = 'billing-required.myshopify.com';

const loggedText = (spies: jest.SpyInstance[]): string =>
  spies
    .map((spy) =>
      spy.mock.calls
        .map((args) =>
          args
            .map((arg) => {
              if (arg instanceof Error) {
                return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
              }
              if (typeof arg === 'string') {
                return arg;
              }
              try {
                return JSON.stringify(arg);
              } catch {
                return String(arg);
              }
            })
            .join(' ')
        )
        .join('\n')
    )
    .join('\n');

const axiosBillingError = (status: number, statusText: string, data: unknown = { errors: RAW_BODY }) => ({
  message: `Request failed with status code ${status}`,
  response: {
    status,
    statusText,
    data,
  },
  config: {
    headers: { 'X-Shopify-Access-Token': TOKEN },
  },
});

describe('Shopify Admin billing failures', () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    fetchMock.mockReset();
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    logSpy.mockRestore();
    resetSyncStatus();
  });

  test('classifies payment required and frozen-shop responses, not auth or throttling', () => {
    expect(SHOPIFY_PAYMENT_REQUIRED_MESSAGE.length).toBeLessThanOrEqual(180);
    expect(SHOPIFY_PAYMENT_REQUIRED_MESSAGE).not.toMatch(/402|stack|token|cartaisy|admin api/i);

    expect(isShopifyAdminBillingHttpFailure(402, 'Payment Required', '')).toBe(true);
    expect(isShopifyAdminBillingHttpFailure(402, '', `<html>${TOKEN}</html>`)).toBe(true);
    expect(isShopifyAdminBillingHttpFailure(403, 'Forbidden', 'Unavailable Shop')).toBe(true);
    expect(isShopifyAdminBillingHttpFailure(423, 'Locked', 'This shop is unavailable')).toBe(true);
    expect(isShopifyAdminBillingHttpFailure(423, 'Locked', '')).toBe(false);
    expect(isShopifyAdminBillingHttpFailure(403, 'Forbidden', 'Missing read_products scope')).toBe(false);
    expect(isShopifyAdminBillingHttpFailure(401, 'Unauthorized', 'Payment Required')).toBe(false);
    expect(isShopifyAdminBillingHttpFailure(404, 'Not Found', 'Unavailable Shop')).toBe(false);
    expect(isShopifyAdminBillingHttpFailure(429, 'Too Many Requests', 'Payment Required')).toBe(false);
    expect(isShopifyAdminBillingHttpFailure(500, 'Internal Server Error', 'Payment Required')).toBe(false);

    const fromHttp = shopifyAdminBillingErrorFromHttp(402, 'Payment Required', RAW_BODY);
    expect(fromHttp).toBeInstanceOf(ShopifyAdminBillingError);
    expect(fromHttp?.statusCode).toBe(402);
    expect(fromHttp?.code).toBe(SHOPIFY_PAYMENT_REQUIRED_CODE);
    expect(fromHttp?.message).toBe(SHOPIFY_PAYMENT_REQUIRED_MESSAGE);
    expect(fromHttp?.message).not.toContain(RAW_BODY);
    expect(fromHttp?.message).not.toContain(TOKEN);

    expect(
      shopifyAdminBillingErrorFromGraphqlErrors([
        { message: 'Payment required', extensions: { code: 'PAYMENT_REQUIRED' } },
      ])?.code
    ).toBe(SHOPIFY_PAYMENT_REQUIRED_CODE);
    expect(
      shopifyAdminBillingErrorFromGraphqlErrors([{ message: 'Access denied', extensions: { code: 'ACCESS_DENIED' } }])
    ).toBeNull();

    const fromAxios = shopifyAdminBillingErrorFromUnknown(
      axiosBillingError(402, 'Payment Required', { errors: RAW_BODY, access_token: TOKEN })
    );
    expect(fromAxios?.message).toBe(SHOPIFY_PAYMENT_REQUIRED_MESSAGE);
    expect(fromAxios?.message).not.toContain(TOKEN);
    expect(shopifyAdminBillingErrorFromUnknown(axiosBillingError(401, 'Unauthorized'))).toBeNull();
  });

  describe('collections and sync HTTP', () => {
    const app = express();
    app.use(express.json());
    app.use('/api/v1/shopify', shopifyOAuthRoutes);
    app.use('/api/v1/shopify', shopifyRoutes);

    const expectBillingBody = (body: Record<string, unknown>) => {
      const serialized = JSON.stringify(body);
      expect(body.success).toBe(false);
      expect(body.code).toBe(SHOPIFY_PAYMENT_REQUIRED_CODE);
      expect(body.error).toBe(SHOPIFY_PAYMENT_REQUIRED_MESSAGE);
      expect(body.message).toBe(SHOPIFY_PAYMENT_REQUIRED_MESSAGE);
      expect(serialized).not.toContain(TOKEN);
      expect(serialized).not.toContain(RAW_BODY);
      expect(serialized).not.toContain('shpat_');
      expect(serialized).not.toContain('stack');
      expect(serialized).not.toContain('Shopify API error');
    };

    const connectAdmin = async () => {
      const store = await Store.create({
        name: 'Billing Store',
        slug: 'billing-store',
        shopify: { shop: SHOP, accessToken: TOKEN, isConnected: true },
      });
      const admin = await User.create({
        name: 'Billing Admin',
        email: 'billing-admin@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: store._id,
      });
      return {
        storeId: store._id.toString(),
        token: generateToken(admin._id.toString()),
      };
    };

    test('GET collections maps Shopify 402 to a merchant billing error', async () => {
      const { token } = await connectAdmin();
      fetchMock.mockResolvedValue({
        ok: false,
        status: 402,
        statusText: 'Payment Required',
        json: async () => ({ errors: RAW_BODY, access_token: TOKEN }),
        text: async () => {
          throw new Error(`body ${TOKEN} ${RAW_BODY}`);
        },
      });

      const response = await request(app)
        .get('/api/v1/shopify/collections')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(402);
      expectBillingBody(response.body);
      expect(response.body.code).not.toBe('shopify_reconnect_required');
      expect(loggedText([errorSpy, warnSpy, logSpy])).not.toContain(TOKEN);
      expect(loggedText([errorSpy, warnSpy, logSpy])).not.toContain(RAW_BODY);
    });

    test('GET collections maps a GraphQL payment-required payload without echoing it', async () => {
      const { token } = await connectAdmin();
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          errors: [
            {
              message: `Payment required ${TOKEN}`,
              extensions: { code: 'PAYMENT_REQUIRED' },
            },
          ],
        }),
        text: async () => '',
      });

      const response = await request(app)
        .get('/api/v1/shopify/collections')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(402);
      expectBillingBody(response.body);
      expect(loggedText([errorSpy, warnSpy, logSpy])).not.toContain(TOKEN);
    });

    test('GET collections maps a frozen-shop 403 and leaves revoked tokens as a generic failure', async () => {
      const { token } = await connectAdmin();
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({}),
        text: async () => JSON.stringify({ errors: RAW_BODY, access_token: TOKEN }),
      });

      const frozen = await request(app)
        .get('/api/v1/shopify/collections')
        .set('Authorization', `Bearer ${token}`);

      expect(frozen.status).toBe(402);
      expectBillingBody(frozen.body);

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ errors: 'invalid token' }),
        text: async () => 'invalid token',
      });

      const revoked = await request(app)
        .get('/api/v1/shopify/collections')
        .set('Authorization', `Bearer ${token}`);

      expect(revoked.status).toBe(500);
      expect(revoked.body.error).toBe('Failed to fetch collections');
      expect(revoked.body.code).toBeUndefined();
      expect(JSON.stringify(revoked.body)).not.toContain(TOKEN);
      expect(JSON.stringify(revoked.body)).not.toContain('invalid token');
    });

    test('an unreadable admin token still asks the merchant to reconnect', async () => {
      const stored = `${'ab'.repeat(16)}:${'cd'.repeat(20)}:${'ef'.repeat(16)}`;
      const store = await Store.create({
        name: 'Unreadable Billing Store',
        slug: 'unreadable-billing-store',
        shopify: { shop: SHOP, accessToken: stored, isConnected: true },
      });
      const admin = await User.create({
        name: 'Unreadable Admin',
        email: 'unreadable-billing-admin@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: store._id,
      });

      const response = await request(app)
        .get('/api/v1/shopify/collections')
        .set('Authorization', `Bearer ${generateToken(admin._id.toString())}`);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('shopify_reconnect_required');
      expect(response.body.error).toContain('Reconnect the store');
      expect(JSON.stringify(response.body)).not.toContain(stored);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test('product sync throws a billing error and does not return the Shopify body', async () => {
      const store = await Store.create({
        name: 'Product Billing Store',
        slug: 'product-billing-store',
        shopify: { shop: SHOP, accessToken: TOKEN, isConnected: true },
      });
      const get = jest.fn().mockRejectedValue(axiosBillingError(402, 'Payment Required'));
      const createSpy = jest.spyOn(axios, 'create').mockReturnValue({ get } as any);

      await expect(syncProducts(store._id.toString())).rejects.toMatchObject({
        name: 'ShopifyAdminBillingError',
        code: SHOPIFY_PAYMENT_REQUIRED_CODE,
        statusCode: 402,
        message: SHOPIFY_PAYMENT_REQUIRED_MESSAGE,
      });
      expect(get).toHaveBeenCalledTimes(1);
      expect(loggedText([errorSpy, warnSpy, logSpy])).not.toContain(TOKEN);
      expect(loggedText([errorSpy, warnSpy, logSpy])).not.toContain(RAW_BODY);

      get.mockRejectedValue(axiosBillingError(500, 'Internal Server Error', { errors: 'Payment Required' }));
      const outage = await syncProducts(store._id.toString());
      expect(outage.synced).toBe(0);
      expect(outage.errors.join(' ')).not.toContain(SHOPIFY_PAYMENT_REQUIRED_CODE);
      expect(outage.errors.join(' ')).toContain('status code 500');

      createSpy.mockRestore();
    });

    test('POST sync returns the billing error once and stores a safe summary', async () => {
      const { storeId, token } = await connectAdmin();
      const get = jest.fn().mockRejectedValue(
        axiosBillingError(402, 'Payment Required', { errors: RAW_BODY, access_token: TOKEN })
      );
      const createSpy = jest.spyOn(axios, 'create').mockReturnValue({ get } as any);

      const response = await request(app)
        .post('/api/v1/shopify/sync')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(402);
      expectBillingBody(response.body);
      expect(response.body.data.status).toBe('failed');
      expect(response.body.data.errorSummary).toBe(SHOPIFY_PAYMENT_REQUIRED_MESSAGE);
      expect(response.body.data.attempts).toBe(1);
      expect(response.body.data.storeId).toBe(storeId);
      expect(get).toHaveBeenCalledTimes(1);

      const stored = await Store.findById(storeId).select('catalogSync');
      expect(stored?.catalogSync?.status).toBe('failed');
      expect(stored?.catalogSync?.errorSummary).toBe(SHOPIFY_PAYMENT_REQUIRED_MESSAGE);
      expect(loggedText([errorSpy, warnSpy, logSpy])).not.toContain(TOKEN);
      expect(loggedText([errorSpy, warnSpy, logSpy])).not.toContain(RAW_BODY);

      createSpy.mockRestore();
    });

    test('POST sync/full and order sync use the same billing error', async () => {
      const { token } = await connectAdmin();
      const get = jest.fn().mockRejectedValue(axiosBillingError(423, 'Locked', 'This store is frozen'));
      const createSpy = jest.spyOn(axios, 'create').mockReturnValue({ get } as any);

      const full = await request(app)
        .post('/api/v1/shopify/sync/full')
        .set('Authorization', `Bearer ${token}`);

      expect(full.status).toBe(402);
      expectBillingBody(full.body);
      expect(get).toHaveBeenCalledTimes(1);

      const store = await Store.findOne({ slug: 'billing-store' });
      await expect(syncOrders(30, store!._id.toString())).rejects.toBeInstanceOf(ShopifyAdminBillingError);
      expect(get).toHaveBeenCalledTimes(2);

      createSpy.mockRestore();
    });
  });
});
