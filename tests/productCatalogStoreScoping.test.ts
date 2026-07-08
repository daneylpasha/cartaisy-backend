import express from 'express';
import request from 'supertest';
import Product from '../src/models/Product';
import ProductCategory from '../src/models/ProductCategory';
import ProductView from '../src/models/ProductView';
import Store from '../src/models/Store';
import Customer from '../src/models/Customer';
import productRoutes from '../src/routes/productRoutes';
import customerRoutes from '../src/routes/customerRoutes';
import { generateProductRecommendations } from '../src/services/productEnhancementService';
import { generateToken } from '../src/utils/jwt';

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/products', productRoutes);
  app.use('/customer', customerRoutes);
  return app;
};

const productFixture = (storeId: unknown, overrides: Record<string, unknown> = {}) => ({
  storeId,
  shopifyProductId: `shopify-${Math.random().toString(36).slice(2)}`,
  title: 'Scoped Product',
  description: 'Product used for store-scoped catalog tests',
  handle: `scoped-product-${Math.random().toString(36).slice(2)}`,
  status: 'active',
  price: 25,
  vendor: 'Shared Vendor',
  productType: 'Shirts',
  tags: ['shared', 'featured'],
  images: [{ url: 'https://example.com/product.jpg', alt: 'Product', position: 1 }],
  mobileDisplay: {
    thumbnailUrl: 'https://example.com/product-thumb.jpg',
    shortDescription: 'Scoped catalog test product',
    isFeatured: false,
    priority: 1,
  },
  seo: {
    title: 'Scoped Product',
    slug: `scoped-product-${Math.random().toString(36).slice(2)}`,
    keywords: ['scoped'],
  },
  inventoryTracking: { totalQuantity: 4, tracked: true, lowStockThreshold: 1, history: [] },
  analytics: { viewCount: 1, favoriteCount: 0, conversionRate: 0, averageTimeOnPage: 0, engagementScore: 0 },
  reviews: { count: 0, averageRating: 0, totalRating: 0 },
  variants: [
    {
      id: `variant-${Math.random().toString(36).slice(2)}`,
      title: 'Default',
      price: 25,
      inventory: { quantity: 4, tracked: true, policy: 'deny' },
      options: { option1: 'Default' },
    },
  ],
  ...overrides,
});

const productViewFixture = (customerId: string, productId: string) => ({
  customer: customerId,
  product: productId,
  viewedAt: new Date(),
  session: {
    sessionId: `session-${Math.random().toString(36).slice(2)}`,
    isNewSession: false,
    sessionStartTime: new Date(),
    source: 'direct',
  },
  device: {
    platform: 'mobile',
    isMobile: true,
  },
  interactions: {
    clickedImages: 0,
    clickedVariants: 0,
    addedToWishlist: false,
    addedToCart: false,
    shared: false,
    reviewsViewed: false,
  },
  viewContext: 'direct',
});

describe('legacy local product catalog store scoping', () => {
  const app = buildTestApp();
  let storeAId: string;
  let storeBId: string;
  let categoryId: string;
  let productA: any;
  let relatedA: any;
  let productB: any;
  let customerA: any;
  let customerToken: string;

  beforeAll(async () => {
    await Promise.all([Product.init(), ProductCategory.init()]);
  });

  beforeEach(async () => {
    const [storeA, storeB] = await Store.create([
      {
        name: 'Store A',
        slug: `store-a-${Date.now()}`,
        shopify: { shop: `store-a-${Date.now()}.myshopify.com`, isConnected: true },
      },
      {
        name: 'Store B',
        slug: `store-b-${Date.now()}`,
        shopify: { shop: `store-b-${Date.now()}.myshopify.com`, isConnected: true },
      },
    ]);

    storeAId = storeA._id.toString();
    storeBId = storeB._id.toString();

    const category = await ProductCategory.create({
      name: 'Shared Shirts',
      handle: `shared-shirts-${Date.now()}`,
      path: `shared-shirts-${Date.now()}`,
      seo: { slug: `shared-shirts-${Date.now()}`, keywords: ['shirts'] },
      display: { featuredProducts: [], showInNavigation: true, sortOrder: 1 },
    });
    categoryId = category._id.toString();

    [productA, relatedA, productB] = await Product.create([
      productFixture(storeAId, {
        title: 'Store A Search Shirt',
        handle: 'store-a-search-shirt',
        category: category._id,
        shopifyProductId: 'store-a-search-shirt',
        seo: { title: 'Store A Search Shirt', slug: 'store-a-search-shirt', keywords: ['shirt'] },
        mobileDisplay: {
          thumbnailUrl: 'https://example.com/a-thumb.jpg',
          shortDescription: 'Store A product',
          isFeatured: true,
          priority: 10,
        },
        analytics: { viewCount: 20, favoriteCount: 0, conversionRate: 0, averageTimeOnPage: 0, engagementScore: 0 },
      }),
      productFixture(storeAId, {
        title: 'Store A Related Shirt',
        handle: 'store-a-related-shirt',
        category: category._id,
        shopifyProductId: 'store-a-related-shirt',
        seo: { title: 'Store A Related Shirt', slug: 'store-a-related-shirt', keywords: ['shirt'] },
        mobileDisplay: {
          thumbnailUrl: 'https://example.com/related-thumb.jpg',
          shortDescription: 'Store A related product',
          isFeatured: true,
          priority: 8,
        },
        analytics: { viewCount: 15, favoriteCount: 0, conversionRate: 0, averageTimeOnPage: 0, engagementScore: 0 },
      }),
      productFixture(storeBId, {
        title: 'Store B Search Shirt',
        handle: 'store-b-search-shirt',
        category: category._id,
        shopifyProductId: 'store-b-search-shirt',
        seo: { title: 'Store B Search Shirt', slug: 'store-b-search-shirt', keywords: ['shirt'] },
        mobileDisplay: {
          thumbnailUrl: 'https://example.com/b-thumb.jpg',
          shortDescription: 'Store B product',
          isFeatured: true,
          priority: 9,
        },
        analytics: { viewCount: 30, favoriteCount: 0, conversionRate: 0, averageTimeOnPage: 0, engagementScore: 0 },
      }),
    ]);

    customerA = await Customer.create({
      storeId: storeAId,
      email: `customer-${Date.now()}@example.com`,
      password: 'password123',
      isActive: true,
      isVerified: true,
      addresses: [],
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
    customerToken = generateToken(customerA._id.toString());
  });

  it('fails closed when public product lists have no store context', async () => {
    const response = await request(app).get('/products');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      message: 'Store ID is required',
    });
  });

  it('store-scopes local product list, search, featured, and category results', async () => {
    const listResponse = await request(app).get('/products').set('X-Store-ID', storeAId);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.products.map((product: any) => product.title).sort()).toEqual([
      'Store A Related Shirt',
      'Store A Search Shirt',
    ]);
    expect(listResponse.body.data.pagination.totalProducts).toBe(2);

    const searchResponse = await request(app)
      .get('/products/search')
      .query({ q: 'Search Shirt' })
      .set('X-Store-ID', storeAId);
    expect(searchResponse.status).toBe(200);
    expect(searchResponse.body.data.products.map((product: any) => product.title).sort()).toEqual([
      'Store A Related Shirt',
      'Store A Search Shirt',
    ]);
    expect(searchResponse.body.data.pagination.totalProducts).toBe(2);

    const featuredResponse = await request(app).get('/products/featured').set('X-Store-ID', storeAId);
    expect(featuredResponse.status).toBe(200);
    expect(featuredResponse.body.data.products.map((product: any) => product.title).sort()).toEqual([
      'Store A Related Shirt',
      'Store A Search Shirt',
    ]);

    const categoryResponse = await request(app)
      .get(`/products/category/${categoryId}`)
      .set('X-Store-ID', storeAId);
    expect(categoryResponse.status).toBe(200);
    expect(categoryResponse.body.data.products.map((product: any) => product.title).sort()).toEqual([
      'Store A Related Shirt',
      'Store A Search Shirt',
    ]);
    expect(categoryResponse.body.data.pagination.totalProducts).toBe(2);
  });

  it('store-scopes related products and hides another store product id', async () => {
    const relatedResponse = await request(app)
      .get(`/products/${productA._id}/related`)
      .set('X-Store-ID', storeAId);

    expect(relatedResponse.status).toBe(200);
    expect(relatedResponse.body.data.products.map((product: any) => product.title)).toEqual([
      'Store A Related Shirt',
    ]);

    const otherStoreResponse = await request(app)
      .get(`/products/${productB._id}/related`)
      .set('X-Store-ID', storeAId);

    expect(otherStoreResponse.status).toBe(404);
    expect(otherStoreResponse.body).toMatchObject({
      success: false,
      message: 'Product not found',
    });
  });

  it('uses the authenticated user store for legacy product recommendations', async () => {
    const response = await request(app)
      .get('/products/recommendations')
      .query({ limit: 5 })
      .set('Authorization', `Bearer ${customerToken}`)
      .set('X-Store-ID', storeBId);

    expect(response.status).toBe(200);
    expect(response.body.data.products.map((product: any) => product.title).sort()).toEqual([
      'Store A Related Shirt',
      'Store A Search Shirt',
    ]);
  });

  it('uses the authenticated customer store for customer product interactions', async () => {
    await ProductView.create([
      productViewFixture(customerA._id.toString(), productA._id.toString()),
      productViewFixture(customerA._id.toString(), productB._id.toString()),
    ]);

    const recommendationsResponse = await request(app)
      .get('/customer/products/recommendations')
      .query({ type: 'trending', limit: 5 })
      .set('Authorization', `Bearer ${customerToken}`)
      .set('X-Store-ID', storeBId);

    expect(recommendationsResponse.status).toBe(200);
    expect(recommendationsResponse.body.data.products.map((product: any) => product.title).sort()).toEqual([
      'Store A Related Shirt',
    ]);

    const recentlyViewedResponse = await request(app)
      .get('/customer/products/recently-viewed')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('X-Store-ID', storeBId);

    expect(recentlyViewedResponse.status).toBe(200);
    expect(recentlyViewedResponse.body.data.products.map((product: any) => product.title)).toEqual([
      'Store A Search Shirt',
    ]);

    const trackOtherStoreProductResponse = await request(app)
      .post(`/customer/products/${productB._id}/track-view`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ from: 'direct' });

    expect(trackOtherStoreProductResponse.status).toBe(404);
    expect(trackOtherStoreProductResponse.body).toMatchObject({
      status: 'error',
      message: 'Product not found',
    });
  });

  it('store-scopes the legacy local product recommendation helper', async () => {
    const recommendations = await generateProductRecommendations(productA._id.toString(), undefined, 5, storeAId);

    expect(recommendations.map(product => product.title)).toEqual(['Store A Related Shirt']);
    expect(recommendations.every(product => product.storeId.toString() === storeAId)).toBe(true);

    await expect(
      generateProductRecommendations(productA._id.toString(), undefined, 5)
    ).rejects.toThrow('Store context is required for product recommendations');
  });
});
