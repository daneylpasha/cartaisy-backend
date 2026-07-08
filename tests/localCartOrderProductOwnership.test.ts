import express from 'express';
import request from 'supertest';
import Customer from '../src/models/Customer';
import GuestSession from '../src/models/GuestSession';
import Order from '../src/models/Order';
import Product from '../src/models/Product';
import Store from '../src/models/Store';
import customerRoutes from '../src/routes/customerRoutes';
import unifiedCartRoutes from '../src/routes/unifiedCartRoutes';
import { generateToken } from '../src/utils/jwt';

jest.mock('../src/services/firebaseNotificationService', () => ({
  FirebaseNotificationService: {
    sendOrderNotification: jest.fn().mockResolvedValue(undefined),
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
});
