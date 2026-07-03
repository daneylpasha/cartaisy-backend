import crypto from 'crypto';
import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import Store from '../src/models/Store';
import Order from '../src/models/Order';
import User from '../src/models/User';
import webhookRoutes from '../src/routes/webhookRoutes';
import { shopifyWebhookBodyParser } from '../src/middleware/shopifyWebhookAuth';
import { tenantConfig } from '../src/config/tenant';
import { syncCustomers, syncOrders } from '../src/services/shopifyService';
import { handleCustomerUpdate } from '../src/controllers/webhookController';
import { encrypt } from '../src/utils/encryption';

// =============================================================================
// Store-scoped customer and order webhook/sync matching (issue #77)
//
// The same customer email and the same Shopify order ID/name exist across
// different merchants' stores by design. Customer webhooks and the
// syncCustomers/syncOrders jobs must match and write records only within
// their trusted/explicit store, never cross-linking another tenant's data.
// =============================================================================

// 32+ char key required by utils/encryption (read at call time)
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-0123456789abcdef';

const TEST_WEBHOOK_SECRET = 'test-webhook-secret';
const SHOP_A = 'cust-scope-store-a.myshopify.com';
const SHOP_B = 'cust-scope-store-b.myshopify.com';
const SHARED_EMAIL = 'shared.shopper@example.com';

const buildTestApp = () => {
  const app = express();
  app.use('/api/webhooks/shopify', shopifyWebhookBodyParser);
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/webhooks', webhookRoutes);
  return app;
};

const signBody = (body: string): string =>
  crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(body, 'utf8').digest('base64');

const postWebhook = (
  app: express.Express,
  topicPath: string,
  payload: Record<string, any>,
  shopDomain: string
) => {
  const body = JSON.stringify(payload);
  return request(app)
    .post(`/api/webhooks/shopify/${topicPath}`)
    .set('Content-Type', 'application/json')
    .set('X-Shopify-Hmac-Sha256', signBody(body))
    .set('X-Shopify-Shop-Domain', shopDomain)
    .send(body);
};

const shopifyCustomerPayload = (overrides: Record<string, any> = {}) => ({
  id: 70640550,
  email: SHARED_EMAIL,
  first_name: 'Shared',
  last_name: 'Shopper',
  phone: null,
  verified_email: true,
  addresses: [],
  ...overrides,
});

const shopifyOrderPayload = (overrides: Record<string, any> = {}) => ({
  id: 450789469,
  order_number: 1001,
  name: '#1001',
  email: SHARED_EMAIL,
  currency: 'USD',
  subtotal_price: '48.00',
  total_tax: '2.00',
  total_price: '50.00',
  financial_status: 'pending',
  fulfillment_status: null,
  created_at: '2026-07-01T10:00:00-04:00',
  // No product_id: the legacy syncOrders line-item mapper casts it to a
  // local Product ObjectId (pre-existing bug, out of scope here)
  line_items: [{ quantity: 1, price: '48.00', title: 'Test Item', sku: 'TEST-SKU' }],
  billing_address: {
    first_name: 'Shared',
    last_name: 'Shopper',
    address1: '1 Test St',
    city: 'Testville',
    province: 'TS',
    country: 'US',
    zip: '12345',
  },
  shipping_address: {
    first_name: 'Shared',
    last_name: 'Shopper',
    address1: '1 Test St',
    city: 'Testville',
    province: 'TS',
    country: 'US',
    zip: '12345',
  },
  shipping_lines: [],
  ...overrides,
});

const createStoreUser = (storeId: Types.ObjectId, overrides: Record<string, any> = {}) =>
  User.create({
    storeId,
    name: 'Shared Shopper',
    email: SHARED_EMAIL,
    password: 'password123',
    role: 'customer',
    isActive: true,
    ...overrides,
  });

describe('store-scoped customer and order webhook/sync matching', () => {
  let storeAId: Types.ObjectId;
  let storeBId: Types.ObjectId;

  beforeEach(async () => {
    const [storeA, storeB] = await Promise.all([
      Store.create({
        name: 'Cust Scope Store A',
        slug: 'cust-scope-store-a',
        shopify: { shop: SHOP_A, accessToken: encrypt('shpat_token_a'), isConnected: true },
      }),
      Store.create({
        name: 'Cust Scope Store B',
        slug: 'cust-scope-store-b',
        shopify: { shop: SHOP_B, accessToken: encrypt('shpat_token_b'), isConnected: true },
      }),
    ]);
    storeAId = storeA._id;
    storeBId = storeB._id;
  });

  afterEach(async () => {
    await Promise.all([Store.deleteMany({}), Order.deleteMany({}), User.deleteMany({})]);
    jest.restoreAllMocks();
  });

  describe('customer webhooks', () => {
    const app = buildTestApp();
    let originalWebhookSecret: string;

    beforeAll(() => {
      originalWebhookSecret = tenantConfig.shopify.webhookSecret;
      tenantConfig.shopify.webhookSecret = TEST_WEBHOOK_SECRET;
    });

    afterAll(() => {
      tenantConfig.shopify.webhookSecret = originalWebhookSecret;
    });

    test('the same email creates one store-bound user per store, never cross-linking', async () => {
      const responseA = await postWebhook(app, 'customers/create', shopifyCustomerPayload(), SHOP_A);
      const responseB = await postWebhook(
        app,
        'customers/create',
        shopifyCustomerPayload({ id: 70640551, first_name: 'Other' }),
        SHOP_B
      );

      expect(responseA.status).toBe(200);
      expect(responseB.status).toBe(200);

      const users = await User.find({ email: SHARED_EMAIL }).sort({ createdAt: 1 });
      expect(users).toHaveLength(2);

      const userA = users.find(u => u.storeId?.toString() === storeAId.toString());
      const userB = users.find(u => u.storeId?.toString() === storeBId.toString());
      expect(userA).toBeDefined();
      expect(userB).toBeDefined();
      expect(userA!.shopifyCustomerId).toBe('70640550');
      expect(userB!.shopifyCustomerId).toBe('70640551');
    });

    test("customers/create for store B updates store B's user, not store A's same-email user", async () => {
      const userA = await createStoreUser(storeAId, { name: 'Store A Name' });
      const userB = await createStoreUser(storeBId, { name: 'Store B Name' });

      const response = await postWebhook(
        app,
        'customers/create',
        shopifyCustomerPayload({ first_name: 'Updated', last_name: 'ByWebhook' }),
        SHOP_B
      );

      expect(response.status).toBe(200);
      expect(await User.countDocuments({ email: SHARED_EMAIL })).toBe(2);

      const untouchedA = await User.findById(userA._id);
      const updatedB = await User.findById(userB._id);
      expect(untouchedA!.name).toBe('Store A Name');
      expect(updatedB!.name).toBe('Updated ByWebhook');
    });

    // handleCustomerUpdate is exported but customers/update has no route
    // registered (adding one would be a new webhook topic, out of scope), so
    // the handler is exercised directly with a trusted store context, the
    // same shape resolveShopifyWebhookStore attaches.
    const invokeCustomerUpdate = async (storeId: Types.ObjectId, payload: Record<string, any>) => {
      const req = {
        body: payload,
        shopifyWebhook: { storeId: storeId.toString(), shopDomain: 'test.myshopify.com' },
      } as any;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as any;
      await handleCustomerUpdate(req, res);
      return res;
    };

    test("customers/update for store B never modifies store A's user with the same email or Shopify customer ID", async () => {
      const userA = await createStoreUser(storeAId, {
        name: 'Store A Name',
        shopifyCustomerId: '70640550',
      });

      const res = await invokeCustomerUpdate(
        storeBId,
        shopifyCustomerPayload({ first_name: 'Hijacked', last_name: 'Name' })
      );

      // Acknowledged (user simply not found in store B), and store A untouched
      expect(res.status).toHaveBeenCalledWith(200);

      const untouchedA = await User.findById(userA._id);
      expect(untouchedA!.name).toBe('Store A Name');
      expect(await User.countDocuments({ email: SHARED_EMAIL })).toBe(1);
    });

    test("customers/update for store A matches store A's user by Shopify customer ID", async () => {
      const userA = await createStoreUser(storeAId, {
        name: 'Store A Name',
        shopifyCustomerId: '70640550',
        isVerified: false,
      });

      const res = await invokeCustomerUpdate(
        storeAId,
        shopifyCustomerPayload({ verified_email: true, phone: '+15550002222' })
      );

      expect(res.status).toHaveBeenCalledWith(200);

      // handleDataConflicts propagates isVerified/phone from Shopify and
      // keeps other local fields; what matters here is that the store A
      // user was matched and updated within its own store
      const updatedA = await User.findById(userA._id);
      expect(updatedA!.isVerified).toBe(true);
      expect(updatedA!.phone).toBe('+15550002222');
      expect(updatedA!.name).toBe('Store A Name');
    });
  });

  describe('sync jobs', () => {
    const mockShopifyGet = (routes: Record<string, any>) => {
      const mockClient = {
        get: jest.fn().mockImplementation((url: string) => {
          for (const [prefix, data] of Object.entries(routes)) {
            if (url.startsWith(prefix)) {
              return Promise.resolve({ data, headers: {} });
            }
          }
          return Promise.resolve({ data: {}, headers: {} });
        }),
      };
      jest.spyOn(axios, 'create').mockReturnValue(mockClient as any);
      return mockClient;
    };

    test('syncCustomers(storeB) with a same-email user in store A creates a store B user and leaves store A alone', async () => {
      const userA = await createStoreUser(storeAId, { name: 'Store A Name' });
      mockShopifyGet({
        '/customers.json': { customers: [shopifyCustomerPayload()] },
      });

      const result = await syncCustomers(storeBId.toString());

      expect(result.errors).toEqual([]);
      expect(result.synced).toBe(1);

      const users = await User.find({ email: SHARED_EMAIL });
      expect(users).toHaveLength(2);

      const untouchedA = await User.findById(userA._id);
      expect(untouchedA!.name).toBe('Store A Name');
      expect(untouchedA!.shopifyCustomerId).toBeUndefined();

      const userB = users.find(u => u.storeId?.toString() === storeBId.toString());
      expect(userB).toBeDefined();
      expect(userB!.shopifyCustomerId).toBe('70640550');
    });

    test('syncCustomers(storeA) updates the existing store A user instead of duplicating it', async () => {
      const userA = await createStoreUser(storeAId, { name: 'Old Name' });
      mockShopifyGet({
        '/customers.json': { customers: [shopifyCustomerPayload()] },
      });

      const result = await syncCustomers(storeAId.toString());

      expect(result.synced).toBe(1);
      expect(await User.countDocuments({ email: SHARED_EMAIL })).toBe(1);

      const updatedA = await User.findById(userA._id);
      expect(updatedA!.name).toBe('Shared Shopper');
      expect(updatedA!.storeId?.toString()).toBe(storeAId.toString());
    });

    test('syncOrders(storeB) creates a store B order for the same Shopify order ID as an existing store A order', async () => {
      // Store A already holds this Shopify order ID (e.g. from its own sync)
      const userAId = (await createStoreUser(storeAId))._id;
      await Order.create({
        storeId: storeAId,
        user: userAId,
        shopifyOrderId: '450789469',
        orderNumber: '#1001',
        email: SHARED_EMAIL,
        lineItems: [{ quantity: 1, price: 48, title: 'Test Item' }],
        subtotalPrice: 48,
        totalTax: 2,
        totalPrice: 50,
        currency: 'USD',
        billingAddress: {
          firstName: 'Shared', address1: '1 Test St', city: 'Testville',
          province: 'TS', country: 'US', zip: '12345',
        },
        shippingAddress: {
          firstName: 'Shared', address1: '1 Test St', city: 'Testville',
          province: 'TS', country: 'US', zip: '12345',
        },
        shipping: { method: 'Standard', cost: 0 },
        mobileStatus: { current: 'confirmed', history: [] },
        placedAt: new Date(),
        source: 'web',
        channel: 'website',
      });
      await createStoreUser(storeBId);

      mockShopifyGet({
        '/orders.json': { orders: [shopifyOrderPayload()] },
      });

      const result = await syncOrders(30, storeBId.toString());

      expect(result.errors).toEqual([]);
      expect(result.synced).toBe(1);

      const [orderA, orderB] = await Promise.all([
        Order.findOne({ storeId: storeAId, shopifyOrderId: '450789469' }),
        Order.findOne({ storeId: storeBId, shopifyOrderId: '450789469' }),
      ]);
      expect(orderA).not.toBeNull();
      expect(orderB).not.toBeNull();
      expect(orderB!.storeId!.toString()).toBe(storeBId.toString());
      expect(orderB!.orderNumber).toBe('#1001');
      // Store B's order links store B's user, not store A's same-email user
      const userB = await User.findOne({ storeId: storeBId, email: SHARED_EMAIL });
      expect(orderB!.user!.toString()).toBe(userB!._id.toString());
    });

    test('syncOrders(storeB) skips the order when only another store has a same-email user', async () => {
      await createStoreUser(storeAId);

      mockShopifyGet({
        '/orders.json': { orders: [shopifyOrderPayload()] },
      });

      const result = await syncOrders(30, storeBId.toString());

      expect(result.errors).toEqual([]);
      expect(result.synced).toBe(0);
      expect(await Order.countDocuments({})).toBe(0);
    });

    test('syncOrders(storeA) is idempotent for an order it already holds', async () => {
      await createStoreUser(storeAId);
      mockShopifyGet({
        '/orders.json': { orders: [shopifyOrderPayload()] },
      });

      const first = await syncOrders(30, storeAId.toString());
      expect(first.synced).toBe(1);

      mockShopifyGet({
        '/orders.json': { orders: [shopifyOrderPayload()] },
      });
      const second = await syncOrders(30, storeAId.toString());
      expect(second.synced).toBe(0);
      expect(await Order.countDocuments({ storeId: storeAId })).toBe(1);

      const order = await Order.findOne({ storeId: storeAId });
      expect(order!.storeId!.toString()).toBe(storeAId.toString());
    });
  });
});
