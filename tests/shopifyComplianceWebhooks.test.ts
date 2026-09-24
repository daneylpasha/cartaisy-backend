import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import fetch from 'node-fetch';
import { Types } from 'mongoose';
import Store from '../src/models/Store';
import User from '../src/models/User';
import Customer from '../src/models/Customer';
import Order from '../src/models/Order';
import GuestSession from '../src/models/GuestSession';
import Favorite from '../src/models/Favorite';
import ShopifyComplianceRequest from '../src/models/ShopifyComplianceRequest';
import webhookRoutes from '../src/routes/webhookRoutes';
import { shopifyWebhookBodyParser } from '../src/middleware/shopifyWebhookAuth';
import { tenantConfig } from '../src/config/tenant';
import { encrypt } from '../src/utils/encryption';
import { getAccessToken } from '../src/services/shopifyOAuthService';
import { getShopifyClientForStore } from '../src/services/shopifyService';
import { getBuildEligibility } from '../src/services/catalogSyncService';

jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const fetchMock = fetch as unknown as jest.Mock;

const TEST_WEBHOOK_SECRET = 'test-webhook-secret';
const SHOP_A = 'compliance-a.myshopify.com';
const SHOP_B = 'compliance-b.myshopify.com';
const UNKNOWN_SHOP = 'compliance-unknown.myshopify.com';
const EMAIL = 'shopper@example.com';
const PHONE = '555-625-1199';
const ADMIN_TOKEN = 'shpat_compliance_admin_token';
const STOREFRONT_TOKEN = 'storefront-compliance-token';
const SHOPIFY_CUSTOMER_ID = '191167';
const SHOPIFY_ORDER_ID = '299938';

const buildTestApp = () => {
  const app = express();
  app.use('/api/webhooks/shopify', shopifyWebhookBodyParser);
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/webhooks', webhookRoutes);
  return app;
};

const signBody = (body: string, secret: string = TEST_WEBHOOK_SECRET): string =>
  crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');

const postWebhook = (
  app: express.Express,
  topicPath: string,
  payload: Record<string, unknown>,
  shopDomain: string,
  options: { topic?: string; secret?: string; sign?: boolean; triggeredAt?: string } = {}
) => {
  const body = JSON.stringify(payload);
  const req = request(app)
    .post(`/api/webhooks/shopify/${topicPath}`)
    .set('Content-Type', 'application/json')
    .set('X-Shopify-Shop-Domain', shopDomain);
  if (options.topic) {
    req.set('X-Shopify-Topic', options.topic);
  }
  if (options.triggeredAt) {
    req.set('X-Shopify-Triggered-At', options.triggeredAt);
  }
  if (options.sign !== false) {
    req.set('X-Shopify-Hmac-Sha256', signBody(body, options.secret));
  }
  return req.send(body);
};

const orderFixture = (
  storeId: Types.ObjectId,
  email: string,
  shopifyOrderId: string,
  orderNumber: string
) => ({
  storeId,
  email,
  shopifyOrderId,
  orderNumber,
  lineItems: [{ quantity: 1, price: 10, title: 'Test Item' }],
  subtotalPrice: 10,
  totalTax: 0,
  totalPrice: 10,
  currency: 'USD',
  shippingAddress: {
    firstName: 'Sam',
    lastName: 'Shopper',
    company: 'Secret Co',
    address1: '1 Secret St',
    address2: 'Apt 2',
    city: 'Testville',
    province: 'TS',
    country: 'US',
    zip: '12345',
    phone: PHONE,
  },
  billingAddress: {
    firstName: 'Sam',
    lastName: 'Shopper',
    company: 'Secret Co',
    address1: '1 Secret St',
    address2: 'Apt 2',
    city: 'Testville',
    province: 'TS',
    country: 'US',
    zip: '12345',
    phone: PHONE,
  },
  isGuestOrder: true,
  guestContact: {
    email,
    phone: PHONE,
    fullName: 'Sam Shopper',
  },
  customerNotes: 'Leave with Sam',
  placedAt: new Date(),
  source: 'web',
  channel: 'website',
});

const dataRequestPayload = () => ({
  shop_id: 1,
  shop_domain: SHOP_A,
  orders_requested: [Number(SHOPIFY_ORDER_ID)],
  customer: {
    id: Number(SHOPIFY_CUSTOMER_ID),
    email: EMAIL,
    phone: PHONE,
  },
  data_request: { id: 9999 },
});

const redactPayload = () => ({
  shop_id: 1,
  shop_domain: SHOP_A,
  customer: {
    id: Number(SHOPIFY_CUSTOMER_ID),
    email: EMAIL,
    phone: PHONE,
  },
  orders_to_redact: [Number(SHOPIFY_ORDER_ID)],
});

describe('Shopify compliance webhooks', () => {
  const app = buildTestApp();
  let originalWebhookSecret: string;
  let originalEncryptionKey: string | undefined;
  let storeAId: Types.ObjectId;
  let storeBId: Types.ObjectId;

  beforeAll(() => {
    originalWebhookSecret = tenantConfig.shopify.webhookSecret;
    tenantConfig.shopify.webhookSecret = TEST_WEBHOOK_SECRET;
    originalEncryptionKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = 'test-encryption-key-0123456789abcdef';
  });

  afterAll(() => {
    tenantConfig.shopify.webhookSecret = originalWebhookSecret;
    if (originalEncryptionKey === undefined) {
      delete process.env.ENCRYPTION_KEY;
    } else {
      process.env.ENCRYPTION_KEY = originalEncryptionKey;
    }
  });

  beforeEach(async () => {
    fetchMock.mockReset();
    const [storeA, storeB] = await Promise.all([
      Store.create({
        name: 'Compliance A',
        slug: 'compliance-a',
        shopify: {
          shop: SHOP_A,
          isConnected: true,
          accessToken: encrypt(ADMIN_TOKEN),
          storefrontAccessToken: STOREFRONT_TOKEN,
          scope: 'read_products',
        },
        catalogSync: {
          status: 'succeeded',
          shop: SHOP_A,
          lastSucceededAt: new Date('2026-09-23T00:00:00.000Z'),
          attempts: 1,
        },
      }),
      Store.create({
        name: 'Compliance B',
        slug: 'compliance-b',
        shopify: {
          shop: SHOP_B,
          isConnected: true,
          accessToken: encrypt('shpat_other_store_token'),
          storefrontAccessToken: 'storefront-other',
          scope: 'read_products',
        },
      }),
    ]);
    storeAId = storeA._id;
    storeBId = storeB._id;
  });

  const seedShopper = async () => {
    await Promise.all([
      User.create({
        storeId: storeAId,
        email: EMAIL,
        password: 'password123',
        name: 'Sam Shopper',
        phone: PHONE,
        role: 'customer',
        shopifyCustomerId: SHOPIFY_CUSTOMER_ID,
        addresses: [{
          firstName: 'Sam',
          lastName: 'Shopper',
          address1: '1 Secret St',
          city: 'Testville',
          province: 'TS',
          country: 'US',
          zip: '12345',
          phone: PHONE,
        }],
      }),
      User.create({
        storeId: storeAId,
        email: 'merchant-a@example.com',
        password: 'password123',
        name: 'Merchant A',
        role: 'admin',
        isActive: true,
      }),
      User.create({
        storeId: storeBId,
        email: EMAIL,
        password: 'password123',
        name: 'Sam Shopper',
        phone: PHONE,
        role: 'customer',
        shopifyCustomerId: SHOPIFY_CUSTOMER_ID,
      }),
      Customer.create({
        storeId: storeAId,
        email: EMAIL,
        password: 'password123',
        name: 'Sam Shopper',
        phone: PHONE,
      }),
      Customer.create({
        storeId: storeBId,
        email: EMAIL,
        password: 'password123',
        name: 'Sam Shopper',
        phone: PHONE,
      }),
      Order.create(orderFixture(storeAId, EMAIL, SHOPIFY_ORDER_ID, 'A-1001')),
      Order.create(orderFixture(storeAId, 'other-buyer@example.com', '111', 'A-1002')),
      Order.create(orderFixture(storeBId, EMAIL, SHOPIFY_ORDER_ID, 'B-1001')),
      GuestSession.create({
        sessionId: 'guest-a',
        storeId: storeAId,
        guestCheckout: { email: EMAIL, fullName: 'Sam Shopper', phone: PHONE },
      }),
      GuestSession.create({
        sessionId: 'guest-b',
        storeId: storeBId,
        guestCheckout: { email: EMAIL, fullName: 'Sam Shopper', phone: PHONE },
      }),
    ]);
  };

  const expectStoreBUntouched = async () => {
    const [user, customer, order, guest, store] = await Promise.all([
      User.findOne({ storeId: storeBId, email: EMAIL }),
      Customer.findOne({ storeId: storeBId, email: EMAIL }),
      Order.findOne({ storeId: storeBId, shopifyOrderId: SHOPIFY_ORDER_ID }),
      GuestSession.findOne({ storeId: storeBId }),
      Store.findById(storeBId).select('+shopify.accessToken'),
    ]);
    expect(user?.phone).toBe(PHONE);
    expect(user?.shopifyCustomerId).toBe(SHOPIFY_CUSTOMER_ID);
    expect(customer?.phone).toBe(PHONE);
    expect(order?.email).toBe(EMAIL);
    expect(order?.shippingAddress?.phone).toBe(PHONE);
    expect(order?.shippingAddress?.company).toBe('Secret Co');
    expect(order?.shippingAddress?.city).toBe('Testville');
    expect(order?.shippingAddress?.province).toBe('TS');
    expect(order?.shippingAddress?.country).toBe('US');
    expect(order?.shippingAddress?.zip).toBe('12345');
    expect(order?.billingAddress?.city).toBe('Testville');
    expect(guest?.guestCheckout?.email).toBe(EMAIL);
    expect(store?.shopify?.isConnected).toBe(true);
    expect(store?.shopify?.storefrontAccessToken).toBe('storefront-other');
  };

  const expectAddressRedacted = (address?: {
    firstName?: string;
    lastName?: string;
    company?: string;
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    country?: string;
    zip?: string;
    phone?: string;
  }): void => {
    expect(address?.firstName).toBe('Redacted');
    expect(address?.lastName).toBe('Customer');
    expect(address?.company || '').toBe('');
    expect(address?.address1).toBe('REDACTED');
    expect(address?.address2 || '').toBe('');
    expect(address?.city || '').toBe('');
    expect(address?.province || '').toBe('');
    expect(address?.country || '').toBe('');
    expect(address?.zip || '').toBe('');
    expect(address?.phone || '').toBe('');
  };

  const expectNoSecrets = (body: unknown) => {
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(EMAIL);
    expect(serialized).not.toContain(PHONE);
    expect(serialized).not.toContain(ADMIN_TOKEN);
    expect(serialized).not.toContain(STOREFRONT_TOKEN);
  };

  test('rejects a bad HMAC on every compliance topic and writes nothing', async () => {
    await seedShopper();
    const paths = [
      ['customers/data_request', dataRequestPayload(), 'customers/data_request'],
      ['customers/redact', redactPayload(), 'customers/redact'],
      ['shop/redact', { shop_id: 1, shop_domain: SHOP_A }, 'shop/redact'],
      ['app/uninstalled', { id: 1 }, 'app/uninstalled'],
    ] as const;

    for (const [path, payload, topic] of paths) {
      const response = await postWebhook(app, path, payload, SHOP_A, {
        topic,
        secret: 'wrong-secret',
      });
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid webhook signature' });
      expectNoSecrets(response.body);
    }

    expect(await ShopifyComplianceRequest.countDocuments({})).toBe(0);
    expect(await User.findOne({ storeId: storeAId, email: EMAIL })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    await expectStoreBUntouched();
  });

  test('acknowledges an unknown shop without writing', async () => {
    await seedShopper();
    const response = await postWebhook(
      app,
      'customers/redact',
      redactPayload(),
      UNKNOWN_SHOP,
      { topic: 'customers/redact' }
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expectNoSecrets(response.body);
    expect(await ShopifyComplianceRequest.countDocuments({})).toBe(0);
    expect(await User.findOne({ storeId: storeAId, email: EMAIL })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('catalog webhooks still reject a disconnected shop', async () => {
    await Store.updateOne({ _id: storeAId }, { $set: { 'shopify.isConnected': false } });
    const response = await postWebhook(
      app,
      'products/delete',
      { id: 1 },
      SHOP_A,
      { topic: 'products/delete' }
    );
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Unknown shop domain' });
  });

  test('customers/data_request records one store-scoped request and ignores replay', async () => {
    await seedShopper();
    const first = await postWebhook(
      app,
      'customers/data_request',
      dataRequestPayload(),
      SHOP_A,
      { topic: 'customers/data_request' }
    );
    const second = await postWebhook(
      app,
      'customers/data_request',
      dataRequestPayload(),
      SHOP_A,
      { topic: 'customers/data_request' }
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expectNoSecrets(first.body);
    expect(await ShopifyComplianceRequest.countDocuments({})).toBe(1);

    const recorded = await ShopifyComplianceRequest.findOne({ storeId: storeAId }).lean();
    expect(recorded?.topic).toBe('customers/data_request');
    expect(recorded?.externalId).toBe('request:9999');
    expect(recorded?.shopifyCustomerId).toBe(SHOPIFY_CUSTOMER_ID);
    expect(recorded?.shopifyOrderIds).toEqual([SHOPIFY_ORDER_ID]);
    expect(recorded?.matchedUserIds).toHaveLength(1);
    expect(recorded?.matchedCustomerIds).toHaveLength(1);
    expect(recorded?.summary?.matchedOrderCount).toBe(1);
    const stored = JSON.stringify(recorded);
    expect(stored).not.toContain(EMAIL);
    expect(stored).not.toContain(PHONE);
    expect(stored).not.toContain(ADMIN_TOKEN);

    expect(await ShopifyComplianceRequest.countDocuments({ storeId: storeBId })).toBe(0);
    expect(await User.findOne({ storeId: storeAId, email: EMAIL })).toBeTruthy();
    await expectStoreBUntouched();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('customers/redact erases only the resolved store and is safe to replay', async () => {
    await seedShopper();
    const first = await postWebhook(app, 'customers/redact', redactPayload(), SHOP_A, {
      topic: 'customers/redact',
    });
    const second = await postWebhook(app, 'customers/redact', redactPayload(), SHOP_A, {
      topic: 'customers/redact',
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expectNoSecrets(first.body);
    expect(await ShopifyComplianceRequest.countDocuments({ topic: 'customers/redact' })).toBe(1);

    const shopper = await User.findOne({ storeId: storeAId, role: 'customer' });
    expect(shopper?.email).toMatch(/^redacted\+.+@redacted\.invalid$/);
    expect(shopper?.phone || '').toBe('');
    expect(shopper?.shopifyCustomerId).toBeUndefined();
    expect(shopper?.addresses || []).toHaveLength(0);
    expect(shopper?.isActive).toBe(false);

    const merchant = await User.findOne({ storeId: storeAId, role: 'admin' });
    expect(merchant?.email).toBe('merchant-a@example.com');
    expect(merchant?.name).toBe('Merchant A');

    expect(await Customer.countDocuments({ storeId: storeAId })).toBe(0);
    const redactedOrder = await Order.findOne({ storeId: storeAId, shopifyOrderId: SHOPIFY_ORDER_ID });
    expect(redactedOrder?.email).toBe('redacted@redacted.invalid');
    expectAddressRedacted(redactedOrder?.shippingAddress);
    expectAddressRedacted(redactedOrder?.billingAddress);
    expect(redactedOrder?.customerNotes || '').toBe('');
    expect(redactedOrder?.totalPrice).toBe(10);

    const otherOrder = await Order.findOne({ storeId: storeAId, shopifyOrderId: '111' });
    expect(otherOrder?.email).toBe('other-buyer@example.com');
    expect(otherOrder?.shippingAddress?.address1).toBe('1 Secret St');
    expect(otherOrder?.shippingAddress?.company).toBe('Secret Co');
    expect(otherOrder?.shippingAddress?.city).toBe('Testville');
    expect(otherOrder?.shippingAddress?.zip).toBe('12345');
    expect(otherOrder?.billingAddress?.province).toBe('TS');
    expect(otherOrder?.billingAddress?.country).toBe('US');

    const guest = await GuestSession.findOne({ storeId: storeAId });
    expect(guest?.guestCheckout).toBeUndefined();

    const store = await Store.findById(storeAId).select('+shopify.accessToken');
    expect(store?.shopify?.isConnected).toBe(true);
    expect(store?.shopify?.accessToken).toBeTruthy();

    await expectStoreBUntouched();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('customers/redact retry finishes erasure from saved owner ids', async () => {
    await seedShopper();
    const shopper = await User.findOne({ storeId: storeAId, email: EMAIL });
    const customer = await Customer.findOne({ storeId: storeAId, email: EMAIL });
    const otherShopper = await User.findOne({ storeId: storeBId, email: EMAIL });
    expect(shopper?._id).toBeTruthy();
    expect(customer?._id).toBeTruthy();
    expect(otherShopper?._id).toBeTruthy();

    await Favorite.create({ userId: shopper!._id, productId: 'gid://shopify/Product/1' });
    await Favorite.create({ customerId: customer!._id, productId: 'gid://shopify/Product/2' });
    await Favorite.create({ userId: otherShopper!._id, productId: 'gid://shopify/Product/3' });
    await Order.create({
      ...orderFixture(storeAId, 'linked-only@example.com', '555001', 'A-1003'),
      user: shopper!._id,
      isGuestOrder: false,
    });

    const updateMany = jest.spyOn(Order, 'updateMany').mockImplementationOnce(() => {
      throw new Error('simulated order redact failure');
    });

    const failed = await postWebhook(app, 'customers/redact', redactPayload(), SHOP_A, {
      topic: 'customers/redact',
    });
    expect(failed.status).toBe(500);
    expect(failed.body).toEqual({ error: 'Failed to process webhook' });
    expectNoSecrets(failed.body);
    updateMany.mockRestore();

    const shopperAfterFailure = await User.findOne({ storeId: storeAId, role: 'customer' });
    expect(shopperAfterFailure?.email).toMatch(/^redacted\+.+@redacted\.invalid$/);
    expect(shopperAfterFailure?.shopifyCustomerId).toBeUndefined();
    expect(await User.findOne({ storeId: storeAId, email: EMAIL })).toBeNull();
    expect(await Customer.countDocuments({ storeId: storeAId })).toBe(0);
    expect(await Favorite.countDocuments({ userId: shopper!._id })).toBe(1);
    expect(await Favorite.countDocuments({ customerId: customer!._id })).toBe(1);

    const linkedAfterFailure = await Order.findOne({ storeId: storeAId, shopifyOrderId: '555001' });
    expect(linkedAfterFailure?.email).toBe('linked-only@example.com');
    expect(linkedAfterFailure?.shippingAddress?.city).toBe('Testville');
    expect(linkedAfterFailure?.shippingAddress?.company).toBe('Secret Co');
    expect(linkedAfterFailure?.billingAddress?.zip).toBe('12345');

    const pending = await ShopifyComplianceRequest.findOne({
      storeId: storeAId,
      topic: 'customers/redact',
    }).lean();
    expect(pending?.status).toBe('pending');
    expect(pending?.matchedUserIds).toEqual([shopper!._id.toString()]);
    expect(pending?.matchedCustomerIds).toEqual([customer!._id.toString()]);
    expect(pending?.matchedUserIds).not.toContain(otherShopper!._id.toString());
    const pendingStored = JSON.stringify(pending);
    expect(pendingStored).not.toContain(EMAIL);
    expect(pendingStored).not.toContain(PHONE);
    expect(await ShopifyComplianceRequest.countDocuments({ storeId: storeBId })).toBe(0);

    const retried = await postWebhook(app, 'customers/redact', redactPayload(), SHOP_A, {
      topic: 'customers/redact',
    });
    expect(retried.status).toBe(200);
    expectNoSecrets(retried.body);
    expect(await ShopifyComplianceRequest.countDocuments({ topic: 'customers/redact' })).toBe(1);

    const completed = await ShopifyComplianceRequest.findOne({
      storeId: storeAId,
      topic: 'customers/redact',
    }).lean();
    expect(completed?.status).toBe('redacted');
    expect(completed?.matchedUserIds).toEqual([shopper!._id.toString()]);
    expect(completed?.matchedCustomerIds).toEqual([customer!._id.toString()]);
    expect(JSON.stringify(completed)).not.toContain(EMAIL);
    expect(JSON.stringify(completed)).not.toContain(PHONE);

    expect(await Favorite.countDocuments({ userId: shopper!._id })).toBe(0);
    expect(await Favorite.countDocuments({ customerId: customer!._id })).toBe(0);
    expect(await Favorite.countDocuments({ userId: otherShopper!._id })).toBe(1);

    const linked = await Order.findOne({ storeId: storeAId, shopifyOrderId: '555001' });
    expect(linked?.email).toBe('redacted@redacted.invalid');
    expectAddressRedacted(linked?.shippingAddress);
    expectAddressRedacted(linked?.billingAddress);

    const payloadOrder = await Order.findOne({ storeId: storeAId, shopifyOrderId: SHOPIFY_ORDER_ID });
    expectAddressRedacted(payloadOrder?.shippingAddress);
    expectAddressRedacted(payloadOrder?.billingAddress);

    const otherOrder = await Order.findOne({ storeId: storeAId, shopifyOrderId: '111' });
    expect(otherOrder?.shippingAddress?.city).toBe('Testville');
    expect(otherOrder?.shippingAddress?.company).toBe('Secret Co');
    await expectStoreBUntouched();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a mismatched topic does not redact', async () => {
    await seedShopper();
    const response = await postWebhook(app, 'customers/redact', redactPayload(), SHOP_A, {
      topic: 'customers/data_request',
    });
    expect(response.status).toBe(200);
    expect(await User.findOne({ storeId: storeAId, email: EMAIL })).toBeTruthy();
    expect(await ShopifyComplianceRequest.countDocuments({})).toBe(0);
  });

  test('app/uninstalled clears credentials without calling Shopify', async () => {
    await seedShopper();
    const response = await postWebhook(app, 'app/uninstalled', {
      id: 99,
      email: 'merchant@example.com',
      shop_owner: 'Merchant A',
    }, SHOP_A, { topic: 'app/uninstalled' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expectNoSecrets(response.body);
    expect(fetchMock).not.toHaveBeenCalled();

    const stored = await Store.findById(storeAId).select('+shopify.accessToken');
    expect(stored?.shopify?.isConnected).toBe(false);
    expect(stored?.shopify?.accessToken).toBeFalsy();
    expect(stored?.shopify?.storefrontAccessToken).toBeFalsy();
    expect(stored?.shopify?.shop).toBeFalsy();
    expect(stored?.shopify?.scope).toBeFalsy();
    expect(stored?.shopify?.complianceShop).toBe(SHOP_A);
    expect(stored?.catalogSync?.status).toBe('succeeded');
    expect(await getAccessToken(storeAId.toString())).toBeNull();
    expect(await getShopifyClientForStore(storeAId.toString())).toBeNull();

    const eligibility = await getBuildEligibility(storeAId.toString());
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toBe('shopify_not_connected');

    expect(await User.findOne({ storeId: storeAId, email: EMAIL })).toBeTruthy();
    expect(await ShopifyComplianceRequest.countDocuments({ topic: 'app/uninstalled', storeId: storeAId })).toBe(1);

    const replay = await postWebhook(app, 'app/uninstalled', { id: 99 }, SHOP_A, {
      topic: 'app/uninstalled',
    });
    expect(replay.status).toBe(200);
    expect(await ShopifyComplianceRequest.countDocuments({ topic: 'app/uninstalled' })).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    await expectStoreBUntouched();
  });

  test('a late app/uninstalled does not clear a newer connection', async () => {
    const connectedAt = new Date('2026-09-24T12:00:00.000Z');
    await Store.updateOne({ _id: storeAId }, { $set: { 'shopify.connectedAt': connectedAt } });

    const response = await postWebhook(app, 'app/uninstalled', { id: 99 }, SHOP_A, {
      topic: 'app/uninstalled',
      triggeredAt: '2026-09-24T11:00:00.000Z',
    });

    expect(response.status).toBe(200);
    const stored = await Store.findById(storeAId).select('+shopify.accessToken');
    expect(stored?.shopify?.isConnected).toBe(true);
    expect(stored?.shopify?.shop).toBe(SHOP_A);
    expect(stored?.shopify?.accessToken).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    const other = await Store.findById(storeBId).select('shopify.isConnected shopify.shop');
    expect(other?.shopify?.isConnected).toBe(true);
    expect(other?.shopify?.shop).toBe(SHOP_B);
  });

  test('app/uninstalled does not wipe a reconnect that lands before the clear', async () => {
    const triggeredAt = new Date('2026-09-24T11:00:00.000Z');
    await Store.updateOne(
      { _id: storeAId },
      { $set: { 'shopify.isConnected': true, 'shopify.connectedAt': new Date('2026-09-24T10:00:00.000Z') } }
    );
    const reconnectedToken = encrypt('shpat_reconnected_token');
    const original = Store.findOneAndUpdate.bind(Store);
    const spy = jest.spyOn(Store, 'findOneAndUpdate').mockImplementation((async (
      ...args: Parameters<typeof Store.findOneAndUpdate>
    ) => {
      await Store.collection.updateOne(
        { _id: storeAId },
        {
          $set: {
            'shopify.isConnected': true,
            'shopify.shop': SHOP_A,
            'shopify.connectedAt': new Date('2026-09-24T12:00:00.000Z'),
            'shopify.accessToken': reconnectedToken,
            'shopify.storefrontAccessToken': 'storefront-reconnected',
            'shopify.scope': 'read_products',
          },
        }
      );
      return original(...args).exec();
    }) as typeof Store.findOneAndUpdate);

    try {
      const response = await postWebhook(app, 'app/uninstalled', { id: 99 }, SHOP_A, {
        topic: 'app/uninstalled',
        triggeredAt: triggeredAt.toISOString(),
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expectNoSecrets(response.body);
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }

    const stored = await Store.findById(storeAId).select('+shopify.accessToken');
    expect(stored?.shopify?.isConnected).toBe(true);
    expect(stored?.shopify?.accessToken).toBe(reconnectedToken);
    expect(stored?.shopify?.shop).toBe(SHOP_A);
    expect(stored?.shopify?.storefrontAccessToken).toBe('storefront-reconnected');
    expect(stored?.shopify?.complianceShop).toBeFalsy();
    expect(await getAccessToken(storeAId.toString())).toBe('shpat_reconnected_token');

    const receipt = await ShopifyComplianceRequest.findOne({
      topic: 'app/uninstalled',
      storeId: storeAId,
    }).lean();
    expect(receipt?.summary?.credentialsCleared).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    const other = await Store.findById(storeBId).select('+shopify.accessToken');
    expect(other?.shopify?.isConnected).toBe(true);
    expect(other?.shopify?.shop).toBe(SHOP_B);
    expect(other?.shopify?.storefrontAccessToken).toBe('storefront-other');
    expect(other?.shopify?.accessToken).toBeTruthy();
  });

  test('shop/redact on a connected store leaves the new token in place', async () => {
    await seedShopper();
    const response = await postWebhook(app, 'shop/redact', { shop_id: 1, shop_domain: SHOP_A }, SHOP_A, {
      topic: 'shop/redact',
    });
    expect(response.status).toBe(200);
    const stored = await Store.findById(storeAId).select('+shopify.accessToken');
    expect(stored?.shopify?.isConnected).toBe(true);
    expect(stored?.shopify?.accessToken).toBeTruthy();
    expect(stored?.shopify?.shop).toBe(SHOP_A);
    expect(await Customer.countDocuments({ storeId: storeAId })).toBe(0);
    await expectStoreBUntouched();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('the shared compliance URL dispatches app/uninstalled', async () => {
    const response = await postWebhook(app, 'compliance', { id: 99 }, SHOP_A, {
      topic: 'app/uninstalled',
    });
    expect(response.status).toBe(200);
    const stored = await Store.findById(storeAId).select('+shopify.accessToken');
    expect(stored?.shopify?.isConnected).toBe(false);
    expect(stored?.shopify?.accessToken).toBeFalsy();
    expect(stored?.shopify?.complianceShop).toBe(SHOP_A);
    expect(fetchMock).not.toHaveBeenCalled();

    const other = await Store.findById(storeBId).select('+shopify.accessToken');
    expect(other?.shopify?.isConnected).toBe(true);
    expect(other?.shopify?.shop).toBe(SHOP_B);
    expect(other?.shopify?.storefrontAccessToken).toBe('storefront-other');
  });

  test('shop/redact after uninstall redacts that store only', async () => {
    await seedShopper();
    const uninstalled = await postWebhook(app, 'app/uninstalled', { id: 99 }, SHOP_A, {
      topic: 'app/uninstalled',
    });
    expect(uninstalled.status).toBe(200);

    const redacted = await postWebhook(app, 'shop/redact', { shop_id: 1, shop_domain: SHOP_A }, SHOP_A, {
      topic: 'shop/redact',
    });
    expect(redacted.status).toBe(200);
    expectNoSecrets(redacted.body);

    const replay = await postWebhook(app, 'shop/redact', { shop_id: 1, shop_domain: SHOP_A }, SHOP_A, {
      topic: 'shop/redact',
    });
    expect(replay.status).toBe(200);
    expect(await ShopifyComplianceRequest.countDocuments({ topic: 'shop/redact' })).toBe(1);

    expect(await Customer.countDocuments({ storeId: storeAId })).toBe(0);
    const shopper = await User.findOne({ storeId: storeAId, role: 'customer' });
    expect(shopper?.email).toMatch(/@redacted\.invalid$/);
    const merchant = await User.findOne({ storeId: storeAId, role: 'admin' });
    expect(merchant?.email).toBe('merchant-a@example.com');
    const order = await Order.findOne({ storeId: storeAId, shopifyOrderId: SHOPIFY_ORDER_ID });
    expect(order?.email).toBe('redacted@redacted.invalid');
    expectAddressRedacted(order?.shippingAddress);
    expectAddressRedacted(order?.billingAddress);

    const stored = await Store.findById(storeAId).select('+shopify.accessToken');
    expect(stored?.shopify?.isConnected).toBe(false);
    expect(stored?.shopify?.accessToken).toBeFalsy();
    expect(await getAccessToken(storeAId.toString())).toBeNull();

    await expectStoreBUntouched();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('an ambiguous shop match writes nothing', async () => {
    await seedShopper();
    await Store.create({
      name: 'Compliance A Duplicate',
      slug: 'compliance-a-duplicate',
      shopify: {
        isConnected: false,
        complianceShop: SHOP_A,
      },
    });
    await Store.updateOne(
      { _id: storeAId },
      { $set: { 'shopify.isConnected': false, 'shopify.complianceShop': SHOP_A }, $unset: { 'shopify.shop': '' } }
    );

    const response = await postWebhook(app, 'customers/redact', redactPayload(), SHOP_A, {
      topic: 'customers/redact',
    });
    expect(response.status).toBe(200);
    expect(await User.findOne({ storeId: storeAId, email: EMAIL })).toBeTruthy();
    expect(await ShopifyComplianceRequest.countDocuments({})).toBe(0);
    await expectStoreBUntouched();
  });

  test('a connected store wins over another store that only retains the domain', async () => {
    await seedShopper();
    await Store.updateOne(
      { _id: storeBId },
      {
        $set: { 'shopify.isConnected': false, 'shopify.complianceShop': SHOP_A },
        $unset: { 'shopify.shop': '', 'shopify.accessToken': '', 'shopify.storefrontAccessToken': '' },
      }
    );

    const response = await postWebhook(
      app,
      'customers/data_request',
      dataRequestPayload(),
      SHOP_A,
      { topic: 'customers/data_request' }
    );
    expect(response.status).toBe(200);
    const records = await ShopifyComplianceRequest.find({}).lean();
    expect(records).toHaveLength(1);
    expect(records[0].storeId.toString()).toBe(storeAId.toString());
    expect(await User.findOne({ storeId: storeBId, email: EMAIL })).toBeTruthy();
  });
});
