import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import Product from '../src/models/Product';
import Store from '../src/models/Store';
import webhookRoutes from '../src/routes/webhookRoutes';
import { shopifyWebhookBodyParser } from '../src/middleware/shopifyWebhookAuth';
import { tenantConfig } from '../src/config/tenant';

const TEST_WEBHOOK_SECRET = 'test-webhook-secret';
const SHOP_A = 'store-a.myshopify.com';
const SHOP_B = 'store-b.myshopify.com';
const SHARED_SHOPIFY_PRODUCT_ID = '777001';
const SHARED_HANDLE = 'shared-handle';

// Minimal app mirroring the exact webhook wiring in src/app.ts (see
// tests/shopifyWebhookTenantMapping.test.ts for the rationale).
const buildTestApp = () => {
  const app = express();
  app.use('/api/webhooks/shopify', shopifyWebhookBodyParser);
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/webhooks', webhookRoutes);
  return app;
};

const signBody = (body: string): string =>
  crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(body, 'utf8').digest('base64');

const productFixture = (storeId: unknown, overrides: Record<string, unknown> = {}) => ({
  storeId,
  shopifyProductId: SHARED_SHOPIFY_PRODUCT_ID,
  title: 'Tenancy Test Product',
  description: 'Product used for tenancy tests',
  handle: SHARED_HANDLE,
  status: 'active',
  price: 10,
  images: [{ url: 'https://example.com/tenancy.jpg', alt: 'Test', position: 1 }],
  mobileDisplay: {
    thumbnailUrl: 'https://example.com/tenancy-thumb.jpg',
    shortDescription: 'Tenancy test product',
  },
  seo: { title: 'Tenancy Test Product', slug: SHARED_HANDLE },
  inventoryTracking: { totalQuantity: 3, tracked: true, lowStockThreshold: 1, history: [] },
  variants: [
    {
      id: '901',
      title: 'Default',
      price: 10,
      inventory: { quantity: 3, tracked: true, policy: 'deny' },
      options: { option1: 'Default' },
    },
  ],
  ...overrides,
});

// Shopify-shaped webhook payload accepted by syncProduct/syncProductData
const shopifyProductPayload = (overrides: Record<string, unknown> = {}) => ({
  id: Number(SHARED_SHOPIFY_PRODUCT_ID),
  title: 'Webhook Product',
  handle: SHARED_HANDLE,
  body_html: '<p>Webhook product description</p>',
  vendor: 'Test Vendor',
  product_type: 'Test Type',
  status: 'active',
  tags: 'tenancy,test',
  variants: [
    {
      id: 901,
      title: 'Default',
      price: '10.00',
      inventory_quantity: 3,
      sku: 'TEN-1',
      inventory_policy: 'deny',
      inventory_management: 'shopify',
      option1: 'Default',
    },
  ],
  images: [{ src: 'https://example.com/webhook.jpg', alt: 'Webhook', position: 1 }],
  ...overrides,
});

describe('Product tenancy', () => {
  const app = buildTestApp();
  let originalWebhookSecret: string;
  let storeAId: string;
  let storeBId: string;

  const postProductWebhook = (topicPath: string, payload: object, shop: string) => {
    const body = JSON.stringify(payload);
    return request(app)
      .post(`/api/webhooks/shopify/products/${topicPath}`)
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-Sha256', signBody(body))
      .set('X-Shopify-Shop-Domain', shop)
      .send(body);
  };

  beforeAll(async () => {
    originalWebhookSecret = tenantConfig.shopify.webhookSecret;
    tenantConfig.shopify.webhookSecret = TEST_WEBHOOK_SECRET;
    // Unique-index assertions need the indexes to actually exist
    await Product.init();
  });

  afterAll(() => {
    tenantConfig.shopify.webhookSecret = originalWebhookSecret;
  });

  beforeEach(async () => {
    const [storeA, storeB] = await Promise.all([
      Store.create({
        name: 'Store A',
        slug: 'store-a',
        shopify: { shop: SHOP_A, isConnected: true },
      }),
      Store.create({
        name: 'Store B',
        slug: 'store-b',
        shopify: { shop: SHOP_B, isConnected: true },
      }),
    ]);
    storeAId = storeA._id.toString();
    storeBId = storeB._id.toString();
  });

  afterEach(async () => {
    await Promise.all([Product.deleteMany({}), Store.deleteMany({})]);
  });

  describe('store-scoped uniqueness', () => {
    test('two stores can hold the same shopifyProductId, handle, and slug', async () => {
      await Product.create(productFixture(storeAId));
      await Product.create(productFixture(storeBId));

      const products = await Product.find({ shopifyProductId: SHARED_SHOPIFY_PRODUCT_ID });
      expect(products).toHaveLength(2);
      expect(new Set(products.map(p => p.storeId!.toString()))).toEqual(
        new Set([storeAId, storeBId])
      );
    });

    test('duplicate shopifyProductId within one store is rejected', async () => {
      await Product.create(productFixture(storeAId));

      await expect(
        Product.create(
          productFixture(storeAId, { handle: 'other-handle', seo: { title: 'Other', slug: 'other-handle' } })
        )
      ).rejects.toThrow(/duplicate key/i);
    });

    test('duplicate handle within one store is rejected', async () => {
      await Product.create(productFixture(storeAId));

      await expect(
        Product.create(
          productFixture(storeAId, {
            shopifyProductId: '777999',
            seo: { title: 'Other', slug: 'other-slug' },
          })
        )
      ).rejects.toThrow(/duplicate key/i);
    });

    test('a store can hold multiple local-only products without shopifyProductId', async () => {
      // Direct regression for the partialFilterExpression decision: a sparse
      // compound index would key both docs as (storeId, null) and collide
      await Product.create(
        productFixture(storeAId, { shopifyProductId: undefined })
      );

      await expect(
        Product.create(
          productFixture(storeAId, {
            shopifyProductId: undefined,
            handle: 'local-two',
            seo: { title: 'Local Two', slug: 'local-two' },
          })
        )
      ).resolves.toBeDefined();

      expect(
        await Product.countDocuments({ storeId: storeAId, shopifyProductId: { $exists: false } })
      ).toBe(2);
    });

    test('duplicate seo.slug within one store is rejected', async () => {
      await Product.create(productFixture(storeAId));

      await expect(
        Product.create(
          productFixture(storeAId, { shopifyProductId: '777999', handle: 'other-handle' })
        )
      ).rejects.toThrow(/duplicate key/i);
    });
  });

  describe('webhook product upserts are scoped by storeId', () => {
    test('product create webhook persists the trusted storeId', async () => {
      const response = await postProductWebhook('create', shopifyProductPayload(), SHOP_A);

      expect(response.status).toBe(200);
      const product = await Product.findOne({ shopifyProductId: SHARED_SHOPIFY_PRODUCT_ID });
      expect(product?.storeId?.toString()).toBe(storeAId);
    });

    test('create webhook for a product ID already held by another store creates a separate product', async () => {
      await Product.create(productFixture(storeAId, { title: 'Store A Product' }));

      const response = await postProductWebhook('create', shopifyProductPayload(), SHOP_B);

      expect(response.status).toBe(200);
      const products = await Product.find({ shopifyProductId: SHARED_SHOPIFY_PRODUCT_ID }).sort('title');
      expect(products).toHaveLength(2);

      const storeAProduct = products.find(p => p.storeId!.toString() === storeAId);
      const storeBProduct = products.find(p => p.storeId!.toString() === storeBId);
      expect(storeAProduct?.title).toBe('Store A Product');
      expect(storeBProduct?.title).toBe('Webhook Product');
    });

    test('product update webhook only touches the trusted store product', async () => {
      // Both stores start at price 10; the update webhook resolves price from
      // the Shopify payload (see handleDataConflicts), so only the trusted
      // store's product should move to 25
      await Product.create(productFixture(storeAId));
      await Product.create(productFixture(storeBId));

      const response = await postProductWebhook(
        'update',
        shopifyProductPayload({
          variants: [
            {
              id: 901,
              title: 'Default',
              price: '25.00',
              inventory_quantity: 3,
              sku: 'TEN-1',
              inventory_policy: 'deny',
              inventory_management: 'shopify',
              option1: 'Default',
            },
          ],
        }),
        SHOP_B
      );

      expect(response.status).toBe(200);
      const storeAProduct = await Product.findOne({ storeId: storeAId });
      const storeBProduct = await Product.findOne({ storeId: storeBId });
      expect(storeAProduct?.price).toBe(10);
      expect(storeBProduct?.price).toBe(25);
      expect(storeBProduct?.storeId?.toString()).toBe(storeBId);
    });

    test('product delete webhook only archives the trusted store product', async () => {
      await Product.create(productFixture(storeAId));
      await Product.create(productFixture(storeBId));

      const response = await postProductWebhook(
        'delete',
        { id: Number(SHARED_SHOPIFY_PRODUCT_ID) },
        SHOP_B
      );

      expect(response.status).toBe(200);
      const storeAProduct = await Product.findOne({ storeId: storeAId });
      const storeBProduct = await Product.findOne({ storeId: storeBId });
      expect(storeAProduct?.status).toBe('active');
      expect(storeBProduct?.status).toBe('archived');
    });
  });
});
