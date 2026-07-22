import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import Store from '../src/models/Store';
import Order from '../src/models/Order';
import User from '../src/models/User';
import Customer from '../src/models/Customer';
import CheckoutHandoff from '../src/models/CheckoutHandoff';
import webhookRoutes from '../src/routes/webhookRoutes';
import { shopifyWebhookBodyParser } from '../src/middleware/shopifyWebhookAuth';
import { tenantConfig } from '../src/config/tenant';
import {
  extractShopifyCartToken,
  reconcileShopifyOrder,
} from '../src/services/orderReconciliationService';

// =============================================================================
// Shopify order webhook reconciliation (issue #76)
//
// Orders completed via the Shopify-hosted checkout handoff must come back as
// store-scoped local Orders: matched to the CheckoutHandoff where possible,
// attributed to the store's Customer or a guest session/contact, idempotent
// under duplicate webhook delivery, and never colliding across stores.
// =============================================================================

const TEST_WEBHOOK_SECRET = 'test-webhook-secret';
const SHOP_A = 'reconcile-store-a.myshopify.com';
const SHOP_B = 'reconcile-store-b.myshopify.com';
const CART_TOKEN = 'hWN2Fo0lJZZ8dpvkyu6kzRO1';
const CART_GID = `gid://shopify/Cart/${CART_TOKEN}?key=aa11bb22cc33`;

// Minimal app mirroring the exact webhook wiring in src/app.ts: raw-body
// capture for /api/webhooks/shopify before the global JSON parser, then the
// webhook router. Avoids src/app.ts import side effects (schedulers).
const buildTestApp = () => {
  const app = express();
  app.use('/api/webhooks/shopify', shopifyWebhookBodyParser);
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/webhooks', webhookRoutes);
  return app;
};

const signBody = (body: string): string =>
  crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(body, 'utf8').digest('base64');

const shopifyOrderPayload = (overrides: Record<string, any> = {}) => ({
  id: 820982911946154500,
  order_number: 1001,
  name: '#1001',
  email: 'shopper@example.com',
  cart_token: CART_TOKEN,
  checkout_token: 'checkout-token-1',
  currency: 'USD',
  subtotal_price: '48.00',
  total_tax: '2.00',
  total_price: '50.00',
  financial_status: 'pending',
  fulfillment_status: null,
  created_at: '2026-07-01T10:00:00-04:00',
  line_items: [
    {
      product_id: 632910392,
      variant_id: 808950810,
      quantity: 1,
      price: '48.00',
      title: 'Test Product',
      sku: 'TEST-SKU',
    },
  ],
  billing_address: {
    first_name: 'Sam',
    last_name: 'Shopper',
    address1: '1 Test St',
    city: 'Testville',
    province: 'TS',
    country: 'US',
    zip: '12345',
    phone: '+15550001111',
  },
  shipping_address: {
    first_name: 'Sam',
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

describe('extractShopifyCartToken', () => {
  it('extracts the token from a cart GID with a key', () => {
    expect(extractShopifyCartToken(CART_GID)).toBe(CART_TOKEN);
  });

  it('extracts the token from a cart GID without a key', () => {
    expect(extractShopifyCartToken(`gid://shopify/Cart/${CART_TOKEN}`)).toBe(CART_TOKEN);
  });

  it('returns a bare token unchanged', () => {
    expect(extractShopifyCartToken(CART_TOKEN)).toBe(CART_TOKEN);
  });
});

describe('Shopify order webhook reconciliation', () => {
  const app = buildTestApp();
  let originalWebhookSecret: string;
  let storeAId: Types.ObjectId;
  let storeBId: Types.ObjectId;

  beforeAll(() => {
    originalWebhookSecret = tenantConfig.shopify.webhookSecret;
    tenantConfig.shopify.webhookSecret = TEST_WEBHOOK_SECRET;
  });

  afterAll(() => {
    tenantConfig.shopify.webhookSecret = originalWebhookSecret;
  });

  beforeEach(async () => {
    const [storeA, storeB] = await Promise.all([
      Store.create({
        name: 'Reconcile Store A',
        slug: 'reconcile-store-a',
        shopify: { shop: SHOP_A, isConnected: true },
      }),
      Store.create({
        name: 'Reconcile Store B',
        slug: 'reconcile-store-b',
        shopify: { shop: SHOP_B, isConnected: true },
      }),
    ]);
    storeAId = storeA._id;
    storeBId = storeB._id;
  });

  afterEach(async () => {
    await Promise.all([
      Store.deleteMany({}),
      Order.deleteMany({}),
      User.deleteMany({}),
      Customer.deleteMany({}),
      CheckoutHandoff.deleteMany({}),
    ]);
  });

  describe('matched checkout handoff', () => {
    test('customer handoff: order is bound to the store and customer, handoff marked reconciled', async () => {
      const customer = await Customer.create({
        storeId: storeAId,
        email: 'shopper@example.com',
        password: 'password123',
        name: 'Sam Shopper',
      });
      const handoff = await CheckoutHandoff.create({
        storeId: storeAId,
        shopifyCartId: CART_GID,
        customerId: customer._id,
        source: 'customer',
        checkoutUrl: 'https://reconcile-store-a.myshopify.com/checkout',
      });

      const payload = shopifyOrderPayload();
      const response = await postWebhook(app, 'orders/create', payload, SHOP_A);

      expect(response.status).toBe(200);

      const order = await Order.findOne({
        storeId: storeAId,
        shopifyOrderId: payload.id.toString(),
      });
      expect(order).not.toBeNull();
      expect(order!.customer?.toString()).toBe(customer._id.toString());
      expect(order!.isGuestOrder).toBeFalsy();
      expect((order as any).user).toBeUndefined();

      const reconciled = await CheckoutHandoff.findById(handoff._id);
      expect(reconciled!.status).toBe('reconciled');
      expect(reconciled!.shopifyOrderId).toBe(payload.id.toString());
      expect(reconciled!.orderId?.toString()).toBe(order!._id.toString());
      expect(reconciled!.reconciledAt).toBeInstanceOf(Date);
    });

    test('guest handoff: order carries the guest session and is store-scoped', async () => {
      const handoff = await CheckoutHandoff.create({
        storeId: storeAId,
        shopifyCartId: CART_GID,
        guestSessionId: 'guest-session-123',
        source: 'public',
        checkoutUrl: 'https://reconcile-store-a.myshopify.com/checkout',
      });

      const response = await postWebhook(app, 'orders/create', shopifyOrderPayload(), SHOP_A);

      expect(response.status).toBe(200);

      const order = await Order.findOne({ storeId: storeAId });
      expect(order).not.toBeNull();
      expect(order!.isGuestOrder).toBe(true);
      expect(order!.guestSessionId).toBe('guest-session-123');

      const reconciled = await CheckoutHandoff.findById(handoff._id);
      expect(reconciled!.status).toBe('reconciled');
    });

    test("a handoff for the same cart token in ANOTHER store is never matched", async () => {
      // Same cart token recorded for store B: must not be touched by store A's webhook
      const foreignHandoff = await CheckoutHandoff.create({
        storeId: storeBId,
        shopifyCartId: CART_GID,
        guestSessionId: 'store-b-guest',
        source: 'public',
        checkoutUrl: 'https://reconcile-store-b.myshopify.com/checkout',
      });

      const response = await postWebhook(app, 'orders/create', shopifyOrderPayload(), SHOP_A);

      expect(response.status).toBe(200);

      const order = await Order.findOne({ storeId: storeAId });
      expect(order).not.toBeNull();
      // Not attributed via store B's handoff
      expect(order!.guestSessionId).toBeUndefined();

      const untouched = await CheckoutHandoff.findById(foreignHandoff._id);
      expect(untouched!.status).toBe('pending');
      expect(untouched!.orderId).toBeUndefined();
    });
  });

  describe('unmatched orders', () => {
    test('matches a store-scoped customer by email, never a same-email customer of another store', async () => {
      const [customerA] = await Promise.all([
        Customer.create({
          storeId: storeAId,
          email: 'shopper@example.com',
          password: 'password123',
        }),
        Customer.create({
          storeId: storeBId,
          email: 'shopper@example.com',
          password: 'password123',
        }),
      ]);

      const response = await postWebhook(
        app,
        'orders/create',
        shopifyOrderPayload({ cart_token: null, checkout_token: null }),
        SHOP_A
      );

      expect(response.status).toBe(200);

      const order = await Order.findOne({ storeId: storeAId });
      expect(order).not.toBeNull();
      expect(order!.customer?.toString()).toBe(customerA._id.toString());
    });

    test('no handoff and no customer: stored store-scoped as a guest order with guest contact', async () => {
      const response = await postWebhook(
        app,
        'orders/create',
        shopifyOrderPayload({ cart_token: null, checkout_token: null }),
        SHOP_A
      );

      expect(response.status).toBe(200);

      const order = await Order.findOne({ storeId: storeAId });
      expect(order).not.toBeNull();
      expect(order!.storeId!.toString()).toBe(storeAId.toString());
      expect(order!.isGuestOrder).toBe(true);
      expect(order!.guestContact?.email).toBe('shopper@example.com');
      expect(order!.guestContact?.fullName).toBe('Sam Shopper');
      // Webhook order writes never create dashboard User records
      expect(await User.countDocuments({})).toBe(0);
      expect(await Customer.countDocuments({})).toBe(0);
    });

    test('orders/updated for an unknown order stores it store-scoped instead of returning 404', async () => {
      const response = await postWebhook(
        app,
        'orders/updated',
        shopifyOrderPayload({ financial_status: 'paid', fulfillment_status: 'fulfilled' }),
        SHOP_A
      );

      expect(response.status).toBe(200);

      const order = await Order.findOne({ storeId: storeAId });
      expect(order).not.toBeNull();
      expect(order!.financialStatus).toBe('paid');
      expect(order!.fulfillmentStatus).toBe('fulfilled');
    });
  });

  describe('idempotency', () => {
    test('duplicate orders/create webhooks create exactly one order', async () => {
      const payload = shopifyOrderPayload();

      const first = await postWebhook(app, 'orders/create', payload, SHOP_A);
      const second = await postWebhook(app, 'orders/create', payload, SHOP_A);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(
        await Order.countDocuments({ storeId: storeAId, shopifyOrderId: payload.id.toString() })
      ).toBe(1);
    });

    test('duplicate handoff reconciliation is a no-op', async () => {
      const handoff = await CheckoutHandoff.create({
        storeId: storeAId,
        shopifyCartId: CART_GID,
        guestSessionId: 'guest-session-123',
        source: 'public',
        checkoutUrl: 'https://reconcile-store-a.myshopify.com/checkout',
      });
      const payload = shopifyOrderPayload();

      await postWebhook(app, 'orders/create', payload, SHOP_A);
      const firstReconciled = await CheckoutHandoff.findById(handoff._id);

      await postWebhook(app, 'orders/create', payload, SHOP_A);
      const secondReconciled = await CheckoutHandoff.findById(handoff._id);

      expect(secondReconciled!.status).toBe('reconciled');
      expect(secondReconciled!.orderId?.toString()).toBe(firstReconciled!.orderId?.toString());
      expect(secondReconciled!.reconciledAt!.getTime()).toBe(
        firstReconciled!.reconciledAt!.getTime()
      );
    });

    test('duplicate orders/paid webhooks apply the paid transition exactly once', async () => {
      await postWebhook(app, 'orders/create', shopifyOrderPayload(), SHOP_A);

      const paidPayload = shopifyOrderPayload({ financial_status: 'paid' });
      const first = await postWebhook(app, 'orders/paid', paidPayload, SHOP_A);
      const orderAfterFirst = await Order.findOne({ storeId: storeAId });
      const historyLengthAfterFirst = orderAfterFirst!.mobileStatus.history.length;

      const second = await postWebhook(app, 'orders/paid', paidPayload, SHOP_A);
      const orderAfterSecond = await Order.findOne({ storeId: storeAId });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(orderAfterFirst!.financialStatus).toBe('paid');
      expect(orderAfterFirst!.mobileStatus.current).toBe('processing');
      expect(orderAfterSecond!.mobileStatus.history.length).toBe(historyLengthAfterFirst);
    });
  });

  describe('cross-store isolation', () => {
    test('the same Shopify order ID and order number in two stores creates two store-bound orders', async () => {
      // Every Shopify store numbers orders from #1001, so identical ids/names
      // across shops are the norm this must survive
      const payload = shopifyOrderPayload();

      const responseA = await postWebhook(app, 'orders/create', payload, SHOP_A);
      const responseB = await postWebhook(app, 'orders/create', payload, SHOP_B);

      expect(responseA.status).toBe(200);
      expect(responseB.status).toBe(200);

      const [orderA, orderB] = await Promise.all([
        Order.findOne({ storeId: storeAId, shopifyOrderId: payload.id.toString() }),
        Order.findOne({ storeId: storeBId, shopifyOrderId: payload.id.toString() }),
      ]);

      expect(orderA).not.toBeNull();
      expect(orderB).not.toBeNull();
      expect(orderA!._id.toString()).not.toBe(orderB!._id.toString());
      expect(orderA!.orderNumber).toBe('#1001');
      expect(orderB!.orderNumber).toBe('#1001');
    });

    test("store B's paid webhook never touches store A's order with the same Shopify order ID", async () => {
      const payload = shopifyOrderPayload();
      await postWebhook(app, 'orders/create', payload, SHOP_A);

      await postWebhook(
        app,
        'orders/paid',
        shopifyOrderPayload({ financial_status: 'paid' }),
        SHOP_B
      );

      const orderA = await Order.findOne({ storeId: storeAId });
      expect(orderA!.financialStatus).toBe('pending');
      expect(orderA!.mobileStatus.current).toBe('confirmed');

      // Store B got its own store-scoped order from the paid payload
      const orderB = await Order.findOne({ storeId: storeBId });
      expect(orderB).not.toBeNull();
      expect(orderB!.financialStatus).toBe('paid');
    });
  });

  describe('unprocessable payloads', () => {
    test('an order without an email is acknowledged with 200 and not stored', async () => {
      const response = await postWebhook(
        app,
        'orders/create',
        shopifyOrderPayload({ email: null, customer: null }),
        SHOP_A
      );

      expect(response.status).toBe(200);
      expect(await Order.countDocuments({})).toBe(0);
    });

    test('a payload failing schema validation is acknowledged with 200, not 500-looped into retries', async () => {
      const response = await postWebhook(
        app,
        'orders/create',
        shopifyOrderPayload({ subtotal_price: null, total_tax: null, total_price: null }),
        SHOP_A
      );

      expect(response.status).toBe(200);
      expect(await Order.countDocuments({})).toBe(0);
    });
  });

  describe('sparse payloads still reconcile', () => {
    test('a digital order without a shipping address falls back to billing and is stored', async () => {
      const response = await postWebhook(
        app,
        'orders/create',
        shopifyOrderPayload({ shipping_address: null }),
        SHOP_A
      );

      expect(response.status).toBe(200);

      const order = await Order.findOne({ storeId: storeAId });
      expect(order).not.toBeNull();
      expect(order!.shippingAddress?.address1).toBe('1 Test St');
    });

    test('a guest order without a billing address takes guestContact.fullName from shipping', async () => {
      const response = await postWebhook(
        app,
        'orders/create',
        shopifyOrderPayload({
          cart_token: null,
          checkout_token: null,
          billing_address: null,
          customer: null,
        }),
        SHOP_A
      );

      expect(response.status).toBe(200);

      const order = await Order.findOne({ storeId: storeAId });
      expect(order).not.toBeNull();
      expect(order!.isGuestOrder).toBe(true);
      expect(order!.guestContact?.fullName).toBe('Sam Shopper');
    });

    test('a fully addressless order is acknowledged with 200 and not stored (schema requires a shipping address)', async () => {
      const response = await postWebhook(
        app,
        'orders/create',
        shopifyOrderPayload({ billing_address: null, shipping_address: null }),
        SHOP_A
      );

      expect(response.status).toBe(200);
      expect(await Order.countDocuments({})).toBe(0);
    });
  });

  // ===========================================================================
  // Webhook-sourced orders relax province/zip/phone validation (issue #126).
  //
  // Order address validation unconditionally required province + zip and
  // applied a strict phone format, so Shopify-valid orders from countries
  // without provinces/postal codes (e.g. Pakistan) were silently dropped.
  // Any address Shopify itself accepted must be storable from a webhook, with
  // empty/missing values persisted as absent (never invented).
  // ===========================================================================
  describe('webhook-sourced address validation (issue #126)', () => {
    // Pakistan-style address: no province, no postal code - Shopify accepts it
    const PK_ADDRESS = {
      first_name: 'Ali',
      last_name: 'Khan',
      address1: '12 Tariq Rd',
      city: 'Karachi',
      country: 'Pakistan',
    };

    test('a Pakistan-style address (no province, no zip) stores from orders/create, store-scoped', async () => {
      const response = await postWebhook(
        app,
        'orders/create',
        shopifyOrderPayload({ billing_address: PK_ADDRESS, shipping_address: PK_ADDRESS }),
        SHOP_A
      );

      expect(response.status).toBe(200);

      const order = await Order.findOne({ storeId: storeAId });
      expect(order).not.toBeNull();
      // Store-scoped to the resolving store, never leaking to store B
      expect(order!.storeId!.toString()).toBe(storeAId.toString());
      expect(await Order.countDocuments({ storeId: storeBId })).toBe(0);
      // Absent province/zip persist as absent, never invented
      expect(order!.shippingAddress?.city).toBe('Karachi');
      expect(order!.shippingAddress?.country).toBe('Pakistan');
      expect(order!.shippingAddress?.province).toBeUndefined();
      expect(order!.shippingAddress?.zip).toBeUndefined();
      expect(order!.billingAddress?.province).toBeUndefined();
      expect(order!.billingAddress?.zip).toBeUndefined();
    });

    test("a phone format the strict local validator rejects still stores from a webhook", async () => {
      // Shopify accepts free-form phones the strict local regex rejects (e.g.
      // the extension format seen on Shopify's test payload). It must persist.
      const phone = '555-1199 ext. 42';
      const response = await postWebhook(
        app,
        'orders/create',
        shopifyOrderPayload({
          billing_address: { ...PK_ADDRESS, province: 'Sindh', zip: '74000', phone },
        }),
        SHOP_A
      );

      expect(response.status).toBe(200);

      const order = await Order.findOne({ storeId: storeAId });
      expect(order).not.toBeNull();
      expect(order!.billingAddress?.phone).toBe(phone);
    });

    test('duplicate-key recovery re-marks the refetched order so a later sparse-address save still passes', async () => {
      // A concurrent duplicate webhook takes the create path (initial lookup
      // sees no order), loses the { storeId, shopifyOrderId } race, and
      // recovers the winner via a fresh Order.findOne() whose $locals are
      // empty. The controller then saves that returned order again (paid/status
      // transition), so the webhook-sourced marker must be restored or the
      // winner's sparse (no province/zip) address fails strict validation and
      // the webhook errors instead of completing idempotently (issue #126).
      await Order.init(); // ensure the unique compound index is built so the duplicate insert throws 11000

      const shopifyOrder = shopifyOrderPayload({
        billing_address: PK_ADDRESS,
        shipping_address: PK_ADDRESS,
      });

      // The order that won the race: already stored with a sparse address.
      const winner = await reconcileShopifyOrder(storeAId.toString(), shopifyOrder);
      expect(winner.created).toBe(true);

      // Force the race: the next reconcile must believe no order exists so it
      // takes the create path and hits the duplicate-key (11000) recovery.
      const findOneSpy = jest
        .spyOn(Order, 'findOne')
        .mockImplementationOnce(() => null as any);

      const result = await reconcileShopifyOrder(storeAId.toString(), shopifyOrder);
      findOneSpy.mockRestore();

      // Recovery returned the winner and re-marked it webhook-sourced.
      expect(result.order).not.toBeNull();
      expect(result.order!.$locals.webhookSourced).toBe(true);

      // A subsequent save (as the controller does on paid/status transitions)
      // must not trip strict province/zip validation on the sparse address.
      result.order!.financialStatus = 'paid';
      await expect(result.order!.save()).resolves.toBeDefined();

      // Still exactly one order for this store + Shopify order id.
      expect(
        await Order.countDocuments({
          storeId: storeAId,
          shopifyOrderId: shopifyOrder.id.toString(),
        })
      ).toBe(1);
    });

    test('locally-created orders keep strict province/zip validation (relaxation is webhook-only)', async () => {
      const localOrderData = {
        storeId: storeAId,
        orderNumber: 'LOCAL-126-1',
        email: 'local@example.com',
        isGuestOrder: true,
        guestContact: { email: 'local@example.com', fullName: 'Local Buyer' },
        lineItems: [{ quantity: 1, price: 10, title: 'Widget' }],
        subtotalPrice: 10,
        totalTax: 0,
        totalPrice: 10,
        currency: 'USD',
        // Missing province and zip
        shippingAddress: { firstName: 'Local', address1: '1 St', city: 'Karachi', country: 'Pakistan' },
      };

      // Without the webhook-sourced marker, the strict rules still apply
      const strictOrder = new Order(localOrderData);
      await expect(strictOrder.validate()).rejects.toThrow(/Province\/State is required/);

      // The same document validates once marked webhook-sourced
      const relaxedOrder = new Order({ ...localOrderData, orderNumber: 'LOCAL-126-2' });
      relaxedOrder.$locals.webhookSourced = true;
      await expect(relaxedOrder.validate()).resolves.toBeUndefined();
    });
  });
});
