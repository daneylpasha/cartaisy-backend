import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import shopifyRoutes from '../src/routes/shopifyRoutes';
import Product from '../src/models/Product';
import Order from '../src/models/Order';
import Store from '../src/models/Store';
import User from '../src/models/User';
import { generateToken } from '../src/utils/jwt';
import * as shopifyService from '../src/services/shopifyService';
import { performFullSync, resetSyncStatus } from '../src/services/syncService';

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/shopify', shopifyRoutes);
  return app;
};

const createProduct = (storeId: Types.ObjectId, overrides: Record<string, unknown> = {}) =>
  Product.create({
    storeId,
    shopifyProductId: overrides.shopifyProductId || new Types.ObjectId().toString(),
    title: overrides.title || 'Scoped Product',
    description: 'Product used for Shopify route scoping tests',
    handle: overrides.handle || `scoped-product-${new Types.ObjectId().toString()}`,
    status: overrides.status || 'active',
    price: 10,
    images: [{ url: 'https://example.com/product.jpg', alt: 'Product', position: 1 }],
    mobileDisplay: {
      thumbnailUrl: 'https://example.com/product-thumb.jpg',
      shortDescription: 'Scoped product',
    },
    seo: {
      title: overrides.title || 'Scoped Product',
      slug: overrides.handle || `scoped-product-${new Types.ObjectId().toString()}`,
    },
    analytics: {
      viewCount: overrides.viewCount || 0,
      favoriteCount: 0,
      conversionRate: 0,
    },
    inventoryTracking: {
      totalQuantity: overrides.totalQuantity || 5,
      tracked: true,
      lowStockThreshold: overrides.lowStockThreshold || 2,
      history: overrides.history || [],
    },
    variants: [
      {
        id: 'variant-1',
        title: 'Default',
        price: 10,
        inventory: { quantity: overrides.totalQuantity || 5, tracked: true, policy: 'deny' },
        options: { option1: 'Default' },
      },
    ],
    ...overrides,
  });

const testAddress = {
  firstName: 'Test',
  lastName: 'Buyer',
  address1: '123 Test Street',
  city: 'Test City',
  province: 'CA',
  country: 'US',
  zip: '94105',
};

const createOrder = (storeId: Types.ObjectId, overrides: Record<string, unknown> = {}) =>
  Order.create({
    storeId,
    orderNumber: overrides.orderNumber || `ORDER-${new Types.ObjectId().toString()}`,
    customer: new Types.ObjectId(),
    email: overrides.email || 'buyer@example.com',
    lineItems: [
      {
        quantity: 1,
        price: 10,
        title: 'Scoped Product',
      },
    ],
    subtotalPrice: 10,
    totalTax: 0,
    totalPrice: 10,
    currency: 'USD',
    shippingAddress: testAddress,
    mobileStatus: { current: 'placed' },
    paymentStatus: 'paid',
    ...overrides,
  });

describe('Shopify admin routes enforce authenticated store ownership', () => {
  const app = buildTestApp();
  let storeAId: Types.ObjectId;
  let storeBId: Types.ObjectId;
  let adminAToken: string;
  let superAdminToken: string;
  let productAId: string;
  let productBId: string;

  beforeEach(async () => {
    const [storeA, storeB] = await Promise.all([
      Store.create({ name: 'Shopify Route Store A', slug: 'shopify-route-store-a', shopify: {} }),
      Store.create({ name: 'Shopify Route Store B', slug: 'shopify-route-store-b', shopify: {} }),
    ]);
    storeAId = storeA._id;
    storeBId = storeB._id;

    const [adminA, superAdmin] = await Promise.all([
      User.create({
        name: 'Admin A',
        email: 'shopify-route-admin-a@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: storeAId,
      }),
      User.create({
        name: 'Super Admin',
        email: 'shopify-route-super@example.com',
        password: 'password123',
        role: 'super_admin',
        isActive: true,
      }),
    ]);
    adminAToken = generateToken(adminA._id.toString());
    superAdminToken = generateToken(superAdmin._id.toString());

    const [productA, productB] = await Promise.all([
      createProduct(storeAId, {
        title: 'Store A Product',
        handle: 'store-a-product',
        shopifyProductId: 'shopify-a-1',
        viewCount: 7,
      }),
      createProduct(storeBId, {
        title: 'Store B Product',
        handle: 'store-b-product',
        shopifyProductId: 'shopify-b-1',
        viewCount: 99,
      }),
      createOrder(storeAId, {
        orderNumber: 'A-1001',
      }),
      createOrder(storeBId, {
        orderNumber: 'B-1001',
        shopifyOrderId: 'shopify-order-b',
      }),
    ]);
    productAId = productA._id.toString();
    productBId = productB._id.toString();
  });

  afterEach(() => {
    resetSyncStatus();
  });

  test('overview counts only the authenticated admin store', async () => {
    const response = await request(app)
      .get('/api/v1/shopify/overview')
      .set('Authorization', `Bearer ${adminAToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.products.total).toBe(1);
    expect(response.body.data.products.syncedWithShopify).toBe(1);
    expect(response.body.data.orders.total).toBe(1);
    expect(response.body.data.orders.shopifyOrders).toBe(0);
  });

  test('product sync status returns only products from the authenticated admin store', async () => {
    const response = await request(app)
      .get('/api/v1/shopify/products/sync-status')
      .set('Authorization', `Bearer ${adminAToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].title).toBe('Store A Product');
    expect(response.body.data.map((product: any) => product.title)).not.toContain('Store B Product');
    expect(response.body.pagination.totalItems).toBe(1);
  });

  test('admin cannot switch the Shopify overview to another store with a header', async () => {
    const response = await request(app)
      .get('/api/v1/shopify/overview')
      .set('Authorization', `Bearer ${adminAToken}`)
      .set('X-Store-ID', storeBId.toString());

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ success: false, error: 'Store access denied' });
  });

  test('super admin can explicitly target a store for Shopify overview', async () => {
    const response = await request(app)
      .get('/api/v1/shopify/overview')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .set('X-Store-ID', storeBId.toString());

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.products.total).toBe(1);
    expect(response.body.data.orders.total).toBe(1);
    expect(response.body.data.orders.shopifyOrders).toBe(1);
  });

  test('sync status exposes only the validated Shopify admin store status', async () => {
    jest.spyOn(shopifyService, 'syncProducts').mockResolvedValue({
      synced: 0,
      errors: ['store-b-only-sync-error'],
    });
    jest.spyOn(shopifyService, 'syncCustomers').mockResolvedValue({ synced: 0, errors: [] });
    jest.spyOn(shopifyService, 'syncOrders').mockResolvedValue({ synced: 0, errors: [] });

    await performFullSync(storeBId.toString());

    const storeAResponse = await request(app)
      .get('/api/v1/shopify/sync/status')
      .set('Authorization', `Bearer ${adminAToken}`);

    expect(storeAResponse.status).toBe(200);
    expect(storeAResponse.body.success).toBe(true);
    expect(storeAResponse.body.data.errors).toEqual([]);
    expect(storeAResponse.body.data.lastFullSync).toBeUndefined();

    const storeBResponse = await request(app)
      .get('/api/v1/shopify/sync/status')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .set('X-Store-ID', storeBId.toString());

    expect(storeBResponse.status).toBe(200);
    expect(storeBResponse.body.data.errors).toEqual(['store-b-only-sync-error']);
    expect(storeBResponse.body.data.lastFullSync).toEqual(expect.any(String));
  });

  test('inventory sync returns a controlled not-found response for another store product', async () => {
    const response = await request(app)
      .post('/api/v1/shopify/inventory/sync')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ productId: productBId });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: 'Product not found' });
  });

  test('admin cannot read analytics for another store product', async () => {
    const wrongStoreResponse = await request(app)
      .get(`/api/v1/shopify/products/${productBId}/analytics`)
      .set('Authorization', `Bearer ${adminAToken}`);

    expect(wrongStoreResponse.status).toBe(404);
    expect(wrongStoreResponse.body).toEqual({ success: false, error: 'Product not found' });

    const ownStoreResponse = await request(app)
      .get(`/api/v1/shopify/products/${productAId}/analytics`)
      .set('Authorization', `Bearer ${adminAToken}`);

    expect(ownStoreResponse.status).toBe(200);
    expect(ownStoreResponse.body.success).toBe(true);
    expect(ownStoreResponse.body.data.viewCount).toBe(7);
  });
});
