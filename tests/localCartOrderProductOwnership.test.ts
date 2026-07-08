import express from 'express';
import request from 'supertest';
import Customer from '../src/models/Customer';
import GuestSession from '../src/models/GuestSession';
import Order from '../src/models/Order';
import Product from '../src/models/Product';
import Store from '../src/models/Store';
import { cancelOrder as cancelLegacyOrder } from '../src/controllers/orderController';
import customerRoutes from '../src/routes/customerRoutes';
import unifiedCartRoutes from '../src/routes/unifiedCartRoutes';
import { generateToken } from '../src/utils/jwt';

jest.mock('../src/services/firebaseNotificationService', () => ({
  FirebaseNotificationService: {
    sendOrderNotification: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../src/services/emailService', () => ({
  EmailService: {
    sendOrderCancellation: jest.fn().mockResolvedValue(undefined),
  },
}));

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/customer', customerRoutes);
  app.use('/unified-cart', unifiedCartRoutes);
  return app;
};

const productFixture = (storeId: unknown, overrides: Record<string, unknown> = {}) => ({
  storeId,
  shopifyProductId: `shopify-${Math.random().toString(36).slice(2)}`,
  title: 'Owned Product',
  description: 'Product used for local cart and order ownership tests',
  handle: `owned-product-${Math.random().toString(36).slice(2)}`,
  status: 'active',
  price: 25,
  vendor: 'Test Vendor',
  productType: 'Test Type',
  tags: ['owned'],
  images: [{ url: 'https://example.com/product.jpg', alt: 'Product', position: 1 }],
  mobileDisplay: {
    thumbnailUrl: 'https://example.com/product-thumb.jpg',
    shortDescription: 'Ownership test product',
    isFeatured: false,
    priority: 1,
  },
  seo: {
    title: 'Owned Product',
    slug: `owned-product-${Math.random().toString(36).slice(2)}`,
    keywords: ['owned'],
  },
  inventoryTracking: { totalQuantity: 5, tracked: true, lowStockThreshold: 1, history: [] },
  analytics: { viewCount: 0, favoriteCount: 0, conversionRate: 0, averageTimeOnPage: 0, engagementScore: 0 },
  reviews: { count: 0, averageRating: 0, totalRating: 0 },
  variants: [
    {
      id: `variant-${Math.random().toString(36).slice(2)}`,
      title: 'Default',
      price: 25,
      inventory: { quantity: 5, tracked: true, policy: 'deny' },
      options: { option1: 'Default' },
    },
  ],
  ...overrides,
});

const customerFixture = (storeId: string) => ({
  storeId,
  email: `customer-${Math.random().toString(36).slice(2)}@example.com`,
  password: 'password123',
  isActive: true,
  isVerified: true,
  addresses: [
    {
      firstName: 'Test',
      lastName: 'Customer',
      address1: '123 Test St',
      city: 'Test City',
      province: 'CA',
      country: 'US',
      zip: '94105',
      isDefault: true,
    },
  ],
  wishlist: [],
  cart: { items: [], updatedAt: new Date() },
  preferences: { notifications: { email: true, push: true, sms: false, promotions: true, orderUpdates: true } },
  deviceTokens: [],
  notificationPreferences: {
    pushEnabled: true,
    orderUpdates: true,
    promotions: true,
    newProducts: true,
  },
  subscribedToTopics: [],
  orderCount: 0,
  totalSpent: 0,
});

describe('local cart and order product ownership checks', () => {
  const app = buildTestApp();
  let storeAId: string;
  let storeBId: string;
  let productA: any;
  let productB: any;
  let customerA: any;
  let customerToken: string;

  beforeAll(async () => {
    await Product.init();
  });

  beforeEach(async () => {
    const suffix = Math.random().toString(36).slice(2);
    const [storeA, storeB] = await Store.create([
      {
        name: 'Store A',
        slug: `store-a-${suffix}`,
        shopify: { shop: `store-a-${suffix}.myshopify.com`, isConnected: true },
      },
      {
        name: 'Store B',
        slug: `store-b-${suffix}`,
        shopify: { shop: `store-b-${suffix}.myshopify.com`, isConnected: true },
      },
    ]);

    storeAId = storeA._id.toString();
    storeBId = storeB._id.toString();

    [productA, productB] = await Product.create([
      productFixture(storeAId, { title: 'Store A Product', handle: `store-a-product-${suffix}` }),
      productFixture(storeBId, { title: 'Store B Product', handle: `store-b-product-${suffix}` }),
    ]);

    customerA = await Customer.create(customerFixture(storeAId));
    customerToken = generateToken(customerA._id.toString());
  });

  it('rejects a Store B product ID in a Store A guest cart mutation', async () => {
    const response = await request(app)
      .post('/unified-cart')
      .set('X-Store-ID', storeAId)
      .send({ productId: productB._id.toString(), quantity: 1 });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      status: 'error',
      message: 'Product not found',
    });

    const sessions = await GuestSession.find({ storeId: storeAId }).lean();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].cart.items).toHaveLength(0);
  });

  it('does not mutate a Store A guest session when the same session id is reused for Store B', async () => {
    await GuestSession.create({
      sessionId: 'shared-guest-session',
      storeId: storeAId,
      cart: {
        items: [{ product: productA._id, quantity: 1, addedAt: new Date() }],
        updatedAt: new Date(),
      },
      wishlist: [],
      recentlyViewed: [],
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const response = await request(app)
      .post('/unified-cart')
      .set('X-Store-ID', storeBId)
      .set('X-Session-ID', 'shared-guest-session')
      .send({ productId: productB._id.toString(), quantity: 1 });

    expect(response.status).toBe(200);
    const newSessionId = response.headers['x-session-id'];
    expect(newSessionId).toBeTruthy();
    expect(newSessionId).not.toBe('shared-guest-session');

    const storeASession = await GuestSession.findOne({ sessionId: 'shared-guest-session', storeId: storeAId }).lean();
    expect(storeASession?.cart.items).toHaveLength(1);
    expect(storeASession?.cart.items[0].product.toString()).toBe(productA._id.toString());

    const storeBSession = await GuestSession.findOne({ sessionId: newSessionId, storeId: storeBId }).lean();
    expect(storeBSession?.cart.items).toHaveLength(1);
    expect(storeBSession?.cart.items[0].product.toString()).toBe(productB._id.toString());
  });

  it('merges a guest cart using the authenticated customer store context', async () => {
    await GuestSession.create({
      sessionId: 'guest-store-a',
      storeId: storeAId,
      cart: {
        items: [{ product: productA._id, quantity: 2, addedAt: new Date() }],
        updatedAt: new Date(),
      },
      wishlist: [],
      recentlyViewed: [],
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const response = await request(app)
      .get('/unified-cart')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('X-Session-ID', 'guest-store-a')
      .set('X-Store-ID', storeBId);

    expect(response.status).toBe(200);

    const customer = await Customer.findById(customerA._id).lean();
    expect(customer?.cart.items).toHaveLength(1);
    expect(customer?.cart.items[0].productId.toString()).toBe(productA._id.toString());
    expect(customer?.cart.items[0].quantity).toBe(2);

    const guestSession = await GuestSession.findOne({ sessionId: 'guest-store-a' }).lean();
    expect(guestSession?.cart.items).toHaveLength(0);
    expect(guestSession?.convertedToCustomerId?.toString()).toBe(customerA._id.toString());

    const repeatResponse = await request(app)
      .get('/unified-cart')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('X-Session-ID', 'guest-store-a')
      .set('X-Store-ID', storeAId);

    expect(repeatResponse.status).toBe(200);
    const customerAfterRepeat = await Customer.findById(customerA._id).lean();
    expect(customerAfterRepeat?.cart.items).toHaveLength(1);
    expect(customerAfterRepeat?.cart.items[0].quantity).toBe(2);
  });

  it('rejects a Store B product ID in a Store A customer order and leaves inventory unchanged', async () => {
    const response = await request(app)
      .post('/customer/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        lineItems: [{ productId: productB._id.toString(), quantity: 1 }],
        shippingAddressId: 0,
        shipping: { method: 'Standard', cost: 0 },
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      status: 'error',
      message: `Product ${productB._id.toString()} not found or not available`,
    });

    expect(await Order.countDocuments({ storeId: storeAId })).toBe(0);
    const reloadedProductB = await Product.findById(productB._id).lean();
    expect(reloadedProductB?.inventoryTracking.totalQuantity).toBe(5);
  });

  it('keeps legacy customer orders without storeId visible until backfill', async () => {
    await Order.create({
      orderNumber: `LEGACY-${Math.random().toString(36).slice(2)}`,
      customer: customerA._id,
      email: customerA.email,
      lineItems: [{
        productId: productA._id,
        quantity: 1,
        price: productA.price,
        title: productA.title,
        sku: '',
      }],
      subtotalPrice: productA.price,
      totalTax: 0,
      totalPrice: productA.price,
      totalItems: 1,
      currency: 'USD',
      billingAddress: {
        firstName: 'Test',
        lastName: 'Customer',
        address1: '123 Test St',
        city: 'Test City',
        province: 'CA',
        country: 'US',
        zip: '94105',
      },
      shippingAddress: {
        firstName: 'Test',
        lastName: 'Customer',
        address1: '123 Test St',
        city: 'Test City',
        province: 'CA',
        country: 'US',
        zip: '94105',
      },
      shipping: { method: 'Standard', cost: 0 },
    });

    const response = await request(app)
      .get('/customer/orders')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.orders).toHaveLength(1);
    expect(response.body.data.orders[0].product).toBeUndefined();
    expect(response.body.data.orders[0].lineItems[0].product.title).toBe(productA.title);
  });

  it('restores inventory for legacy customer orders without storeId before cancelling', async () => {
    await Product.updateOne(
      { _id: productA._id },
      { $set: { 'inventoryTracking.totalQuantity': 3 } }
    );

    const order = await Order.create({
      orderNumber: `LEGACY-${Math.random().toString(36).slice(2)}`,
      customer: customerA._id,
      email: customerA.email,
      lineItems: [{
        productId: productA._id,
        quantity: 2,
        price: productA.price,
        title: productA.title,
        sku: '',
      }],
      subtotalPrice: productA.price * 2,
      totalTax: 0,
      totalPrice: productA.price * 2,
      totalItems: 2,
      currency: 'USD',
      billingAddress: {
        firstName: 'Test',
        lastName: 'Customer',
        address1: '123 Test St',
        city: 'Test City',
        province: 'CA',
        country: 'US',
        zip: '94105',
      },
      shippingAddress: {
        firstName: 'Test',
        lastName: 'Customer',
        address1: '123 Test St',
        city: 'Test City',
        province: 'CA',
        country: 'US',
        zip: '94105',
      },
      shipping: { method: 'Standard', cost: 0 },
    });

    const response = await request(app)
      .post(`/customer/orders/${order._id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason: 'Changed mind' });

    expect(response.status).toBe(200);
    const reloadedProductA = await Product.findById(productA._id).lean();
    expect(reloadedProductA?.inventoryTracking.totalQuantity).toBe(5);
  });

  it('derives product store before customer legacy order cancellation inventory restore', async () => {
    await Product.updateOne(
      { _id: productB._id },
      { $set: { 'inventoryTracking.totalQuantity': 3 } }
    );

    const order = await Order.create({
      orderNumber: `LEGACY-${Math.random().toString(36).slice(2)}`,
      customer: customerA._id,
      email: customerA.email,
      lineItems: [{
        productId: productB._id,
        quantity: 2,
        price: productB.price,
        title: productB.title,
        sku: '',
      }],
      subtotalPrice: productB.price * 2,
      totalTax: 0,
      totalPrice: productB.price * 2,
      totalItems: 2,
      currency: 'USD',
      billingAddress: {
        firstName: 'Test',
        lastName: 'Customer',
        address1: '123 Test St',
        city: 'Test City',
        province: 'CA',
        country: 'US',
        zip: '94105',
      },
      shippingAddress: {
        firstName: 'Test',
        lastName: 'Customer',
        address1: '123 Test St',
        city: 'Test City',
        province: 'CA',
        country: 'US',
        zip: '94105',
      },
      shipping: { method: 'Standard', cost: 0 },
    });

    const response = await request(app)
      .post(`/customer/orders/${order._id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason: 'Changed mind' });

    expect(response.status).toBe(200);
    const [reloadedProductA, reloadedProductB, reloadedOrder] = await Promise.all([
      Product.findById(productA._id).lean(),
      Product.findById(productB._id).lean(),
      Order.findById(order._id).lean(),
    ]);
    expect(reloadedProductA?.inventoryTracking.totalQuantity).toBe(5);
    expect(reloadedProductB?.inventoryTracking.totalQuantity).toBe(5);
    expect(reloadedOrder?.mobileStatus.current).toBe('cancelled');
  });

  it('rejects customer cancellation before status change when order store conflicts with product store', async () => {
    await Product.updateOne(
      { _id: productB._id },
      { $set: { 'inventoryTracking.totalQuantity': 3 } }
    );

    const order = await Order.create({
      storeId: storeAId,
      orderNumber: `LEGACY-${Math.random().toString(36).slice(2)}`,
      customer: customerA._id,
      email: customerA.email,
      lineItems: [{
        productId: productB._id,
        quantity: 2,
        price: productB.price,
        title: productB.title,
        sku: '',
      }],
      subtotalPrice: productB.price * 2,
      totalTax: 0,
      totalPrice: productB.price * 2,
      totalItems: 2,
      currency: 'USD',
      billingAddress: {
        firstName: 'Test',
        lastName: 'Customer',
        address1: '123 Test St',
        city: 'Test City',
        province: 'CA',
        country: 'US',
        zip: '94105',
      },
      shippingAddress: {
        firstName: 'Test',
        lastName: 'Customer',
        address1: '123 Test St',
        city: 'Test City',
        province: 'CA',
        country: 'US',
        zip: '94105',
      },
      shipping: { method: 'Standard', cost: 0 },
    });

    const response = await request(app)
      .post(`/customer/orders/${order._id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason: 'Changed mind' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      status: 'error',
      message: 'Unable to verify product ownership for inventory restore',
    });

    const [reloadedProductB, reloadedOrder] = await Promise.all([
      Product.findById(productB._id).lean(),
      Order.findById(order._id).lean(),
    ]);
    expect(reloadedProductB?.inventoryTracking.totalQuantity).toBe(3);
    expect(reloadedOrder?.mobileStatus.current).not.toBe('cancelled');
  });

  it('derives product store before legacy user-order cancellation inventory restore', async () => {
    await Product.updateOne(
      { _id: productA._id },
      { $set: { 'inventoryTracking.totalQuantity': 3 } }
    );

    const order = await Order.create({
      orderNumber: `LEGACY-${Math.random().toString(36).slice(2)}`,
      user: customerA._id,
      email: customerA.email,
      lineItems: [{
        productId: productA._id,
        quantity: 2,
        price: productA.price,
        title: productA.title,
        sku: '',
      }],
      subtotalPrice: productA.price * 2,
      totalTax: 0,
      totalPrice: productA.price * 2,
      totalItems: 2,
      currency: 'USD',
      billingAddress: {
        firstName: 'Test',
        lastName: 'Customer',
        address1: '123 Test St',
        city: 'Test City',
        province: 'CA',
        country: 'US',
        zip: '94105',
      },
      shippingAddress: {
        firstName: 'Test',
        lastName: 'Customer',
        address1: '123 Test St',
        city: 'Test City',
        province: 'CA',
        country: 'US',
        zip: '94105',
      },
      shipping: { method: 'Standard', cost: 0 },
    });

    const response: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await cancelLegacyOrder(
      {
        params: { orderId: order._id.toString() },
        body: { reason: 'Changed mind' },
        storeId: storeBId,
        user: {
          _id: customerA._id,
          storeId: storeBId,
        },
      } as any,
      response
    );

    expect(response.status).not.toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      message: 'Order cancelled successfully',
    });

    const [reloadedProductA, reloadedProductB, reloadedOrder] = await Promise.all([
      Product.findById(productA._id).lean(),
      Product.findById(productB._id).lean(),
      Order.findById(order._id).lean(),
    ]);
    expect(reloadedProductA?.inventoryTracking.totalQuantity).toBe(5);
    expect(reloadedProductB?.inventoryTracking.totalQuantity).toBe(5);
    expect(reloadedOrder?.mobileStatus.current).toBe('cancelled');
  });

  it('rejects legacy user-order cancellation before status change when order store conflicts with product store', async () => {
    await Product.updateOne(
      { _id: productA._id },
      { $set: { 'inventoryTracking.totalQuantity': 3 } }
    );

    const order = await Order.create({
      storeId: storeBId,
      orderNumber: `LEGACY-${Math.random().toString(36).slice(2)}`,
      user: customerA._id,
      email: customerA.email,
      lineItems: [{
        productId: productA._id,
        quantity: 2,
        price: productA.price,
        title: productA.title,
        sku: '',
      }],
      subtotalPrice: productA.price * 2,
      totalTax: 0,
      totalPrice: productA.price * 2,
      totalItems: 2,
      currency: 'USD',
      billingAddress: {
        firstName: 'Test',
        lastName: 'Customer',
        address1: '123 Test St',
        city: 'Test City',
        province: 'CA',
        country: 'US',
        zip: '94105',
      },
      shippingAddress: {
        firstName: 'Test',
        lastName: 'Customer',
        address1: '123 Test St',
        city: 'Test City',
        province: 'CA',
        country: 'US',
        zip: '94105',
      },
      shipping: { method: 'Standard', cost: 0 },
    });

    const response: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await cancelLegacyOrder(
      {
        params: { orderId: order._id.toString() },
        body: { reason: 'Changed mind' },
        user: {
          _id: customerA._id,
          storeId: storeBId,
        },
      } as any,
      response
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      message: 'Unable to verify product ownership for inventory restore',
    });

    const [reloadedProductA, reloadedOrder] = await Promise.all([
      Product.findById(productA._id).lean(),
      Order.findById(order._id).lean(),
    ]);
    expect(reloadedProductA?.inventoryTracking.totalQuantity).toBe(3);
    expect(reloadedOrder?.mobileStatus.current).not.toBe('cancelled');
  });
});
