import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import Product from '../src/models/Product';
import Store from '../src/models/Store';
import webhookRoutes from '../src/routes/webhookRoutes';
import { shopifyWebhookBodyParser } from '../src/middleware/shopifyWebhookAuth';
import { tenantConfig } from '../src/config/tenant';

const TEST_WEBHOOK_SECRET = 'test-webhook-secret';
const KNOWN_SHOP = 'known-store.myshopify.com';

// Variant A: Shopify variant id 111, Shopify inventory item id 222.
// The original bug matched inventory_item_id against variants.id, so a
// webhook for item 222 matched nothing and a webhook for 111 matched the
// wrong identifier space entirely.
const VARIANT_A_ID = '111';
const VARIANT_A_INVENTORY_ITEM_ID = '222';
const VARIANT_B_ID = '333';
const VARIANT_B_INVENTORY_ITEM_ID = '444';

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

describe('Shopify inventory webhook identifier lookup', () => {
  const app = buildTestApp();
  let originalWebhookSecret: string;

  const sendInventoryWebhook = (payload: object) => {
    const body = JSON.stringify(payload);
    return request(app)
      .post('/api/webhooks/shopify/inventory_levels/update')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-Sha256', signBody(body))
      .set('X-Shopify-Shop-Domain', KNOWN_SHOP)
      .send(body);
  };

  const loadProduct = async () => {
    const product = await Product.findOne({ handle: 'test-inventory-product' });
    expect(product).not.toBeNull();
    return product!;
  };

  beforeAll(() => {
    originalWebhookSecret = tenantConfig.shopify.webhookSecret;
    tenantConfig.shopify.webhookSecret = TEST_WEBHOOK_SECRET;
  });

  afterAll(() => {
    tenantConfig.shopify.webhookSecret = originalWebhookSecret;
  });

  beforeEach(async () => {
    const store = await Store.create({
      name: 'Known Store',
      slug: 'known-store',
      shopify: { shop: KNOWN_SHOP, isConnected: true },
    });

    await Product.create({
      storeId: store._id,
      title: 'Inventory Test Product',
      description: 'Product used for inventory webhook lookup tests',
      handle: 'test-inventory-product',
      status: 'active',
      price: 19.99,
      images: [{ url: 'https://example.com/inventory-test.jpg', alt: 'Test', position: 1 }],
      mobileDisplay: {
        thumbnailUrl: 'https://example.com/inventory-test-thumb.jpg',
        shortDescription: 'Inventory webhook test product',
      },
      seo: {
        title: 'Inventory Test Product',
        slug: 'test-inventory-product',
      },
      inventoryTracking: {
        totalQuantity: 12,
        tracked: true,
        lowStockThreshold: 2,
        history: [],
      },
      variants: [
        {
          id: VARIANT_A_ID,
          inventoryItemId: VARIANT_A_INVENTORY_ITEM_ID,
          title: 'Variant A',
          price: 19.99,
          inventory: { quantity: 5, tracked: true, policy: 'deny' },
          options: { option1: 'Default' },
        },
        {
          id: VARIANT_B_ID,
          inventoryItemId: VARIANT_B_INVENTORY_ITEM_ID,
          title: 'Variant B',
          price: 21.99,
          inventory: { quantity: 7, tracked: true, policy: 'deny' },
          options: { option1: 'Alternate' },
        },
      ],
    });
  });

  afterEach(async () => {
    await Promise.all([Product.deleteMany({}), Store.deleteMany({})]);
  });

  test('updates the intended variant matched by inventoryItemId (regression)', async () => {
    const response = await sendInventoryWebhook({
      inventory_item_id: Number(VARIANT_A_INVENTORY_ITEM_ID),
      available: 42,
      location_id: 1,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });

    const product = await loadProduct();
    const variantA = product.variants.find(v => v.id === VARIANT_A_ID);
    const variantB = product.variants.find(v => v.id === VARIANT_B_ID);

    expect(variantA?.inventory.quantity).toBe(42);
    expect(variantB?.inventory.quantity).toBe(7);
    expect(product.inventoryTracking.totalQuantity).toBe(49);

    expect(product.inventoryTracking.history).toHaveLength(1);
    const historyEntry = product.inventoryTracking.history[0];
    expect(historyEntry.newQuantity).toBe(42);
    expect(historyEntry.change).toBe(37);
    expect(historyEntry.reason).toBe('shopify_sync');
  });

  test('does not match variants by variant id (the original bug)', async () => {
    // 111 is variant A's Shopify *variant* id; no variant has it as an
    // inventory item id, so this webhook must not touch anything.
    const response = await sendInventoryWebhook({
      inventory_item_id: Number(VARIANT_A_ID),
      available: 99,
      location_id: 1,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });

    const product = await loadProduct();
    expect(product.variants.find(v => v.id === VARIANT_A_ID)?.inventory.quantity).toBe(5);
    expect(product.variants.find(v => v.id === VARIANT_B_ID)?.inventory.quantity).toBe(7);
    expect(product.inventoryTracking.totalQuantity).toBe(12);
    expect(product.inventoryTracking.history).toHaveLength(0);
  });

  test('zero-match inventory item is logged safely and writes nothing', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const response = await sendInventoryWebhook({
        inventory_item_id: 555555,
        available: 10,
        location_id: 1,
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No product variant matches inventory item 555555')
      );
    } finally {
      warnSpy.mockRestore();
    }

    const product = await loadProduct();
    expect(product.variants.find(v => v.id === VARIANT_A_ID)?.inventory.quantity).toBe(5);
    expect(product.variants.find(v => v.id === VARIANT_B_ID)?.inventory.quantity).toBe(7);
    expect(product.inventoryTracking.history).toHaveLength(0);
  });

  test('missing inventory_item_id is acknowledged safely without writes', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const response = await sendInventoryWebhook({ available: 10, location_id: 1 });

      // 200 so Shopify does not retry a payload that can never succeed
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing inventory_item_id')
      );
    } finally {
      warnSpy.mockRestore();
    }

    const product = await loadProduct();
    expect(product.inventoryTracking.totalQuantity).toBe(12);
    expect(product.inventoryTracking.history).toHaveLength(0);
  });
});
