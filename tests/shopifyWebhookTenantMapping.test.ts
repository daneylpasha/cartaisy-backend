import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import Store from '../src/models/Store';
import Order from '../src/models/Order';
import User from '../src/models/User';
import webhookRoutes from '../src/routes/webhookRoutes';
import { shopifyWebhookBodyParser } from '../src/middleware/shopifyWebhookAuth';
import { tenantConfig } from '../src/config/tenant';

const TEST_WEBHOOK_SECRET = 'test-webhook-secret';
const KNOWN_SHOP = 'known-store.myshopify.com';
const UNKNOWN_SHOP = 'unknown-store.myshopify.com';
const DISCONNECTED_SHOP = 'disconnected-store.myshopify.com';

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

const signBody = (body: string, secret: string = TEST_WEBHOOK_SECRET): string =>
  crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');

const orderCreatePayload = JSON.stringify({
  id: 900001,
  order_number: 1001,
  email: 'webhook.tenant@example.com',
});

const productDeletePayload = JSON.stringify({ id: 987654321 });

describe('Shopify webhook verification and tenant mapping', () => {
  const app = buildTestApp();
  let originalWebhookSecret: string;

  beforeAll(() => {
    originalWebhookSecret = tenantConfig.shopify.webhookSecret;
    tenantConfig.shopify.webhookSecret = TEST_WEBHOOK_SECRET;
  });

  afterAll(() => {
    tenantConfig.shopify.webhookSecret = originalWebhookSecret;
  });

  beforeEach(async () => {
    await Store.create({
      name: 'Known Store',
      slug: 'known-store',
      shopify: { shop: KNOWN_SHOP, isConnected: true },
    });
    await Store.create({
      name: 'Disconnected Store',
      slug: 'disconnected-store',
      shopify: { shop: DISCONNECTED_SHOP, isConnected: false },
    });
  });

  // Keep the suite self-contained: some tests mutate or add Store records
  // (inactive store, duplicate shop domain), and relying only on the global
  // tests/setup.ts cleanup would make the next beforeEach hit the unique
  // slug index if that global hook ever changes.
  afterEach(async () => {
    await Promise.all([
      Store.deleteMany({}),
      Order.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  const expectNoWebhookWrites = async () => {
    expect(await Order.countDocuments({})).toBe(0);
    expect(await User.countDocuments({ email: 'webhook.tenant@example.com' })).toBe(0);
  };

  describe('HMAC verification', () => {
    test('rejects webhook with missing HMAC signature and writes nothing', async () => {
      const response = await request(app)
        .post('/api/webhooks/shopify/orders/create')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Shop-Domain', KNOWN_SHOP)
        .send(orderCreatePayload);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Missing webhook signature' });
      await expectNoWebhookWrites();
    });

    test('rejects webhook with invalid HMAC signature and writes nothing', async () => {
      const response = await request(app)
        .post('/api/webhooks/shopify/orders/create')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Hmac-Sha256', signBody(orderCreatePayload, 'wrong-secret'))
        .set('X-Shopify-Shop-Domain', KNOWN_SHOP)
        .send(orderCreatePayload);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid webhook signature' });
      await expectNoWebhookWrites();
    });

    test('rejects webhook whose body was tampered with after signing', async () => {
      const response = await request(app)
        .post('/api/webhooks/shopify/orders/create')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Hmac-Sha256', signBody(orderCreatePayload))
        .set('X-Shopify-Shop-Domain', KNOWN_SHOP)
        .send(JSON.stringify({ id: 900001, order_number: 1001, email: 'attacker@example.com' }));

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid webhook signature' });
      await expectNoWebhookWrites();
    });

    test('rejects webhook when the webhook secret is not configured', async () => {
      tenantConfig.shopify.webhookSecret = '';
      try {
        const response = await request(app)
          .post('/api/webhooks/shopify/orders/create')
          .set('Content-Type', 'application/json')
          .set('X-Shopify-Hmac-Sha256', signBody(orderCreatePayload))
          .set('X-Shopify-Shop-Domain', KNOWN_SHOP)
          .send(orderCreatePayload);

        expect(response.status).toBe(401);
        await expectNoWebhookWrites();
      } finally {
        tenantConfig.shopify.webhookSecret = TEST_WEBHOOK_SECRET;
      }
    });
  });

  describe('shop domain to Store tenant mapping', () => {
    test('rejects valid-HMAC webhook from an unknown shop domain and writes nothing', async () => {
      const response = await request(app)
        .post('/api/webhooks/shopify/orders/create')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Hmac-Sha256', signBody(orderCreatePayload))
        .set('X-Shopify-Shop-Domain', UNKNOWN_SHOP)
        .send(orderCreatePayload);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Unknown shop domain' });
      await expectNoWebhookWrites();
    });

    test('rejects valid-HMAC webhook with a missing shop domain header', async () => {
      const response = await request(app)
        .post('/api/webhooks/shopify/orders/create')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Hmac-Sha256', signBody(orderCreatePayload))
        .send(orderCreatePayload);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Missing shop domain' });
      await expectNoWebhookWrites();
    });

    test('rejects valid-HMAC webhook with a malformed shop domain header', async () => {
      const response = await request(app)
        .post('/api/webhooks/shopify/orders/create')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Hmac-Sha256', signBody(orderCreatePayload))
        .set('X-Shopify-Shop-Domain', 'not-a-shopify-domain.example.com')
        .send(orderCreatePayload);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Unknown shop domain' });
      await expectNoWebhookWrites();
    });

    test('rejects valid-HMAC webhook for a disconnected store', async () => {
      const response = await request(app)
        .post('/api/webhooks/shopify/orders/create')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Hmac-Sha256', signBody(orderCreatePayload))
        .set('X-Shopify-Shop-Domain', DISCONNECTED_SHOP)
        .send(orderCreatePayload);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Unknown shop domain' });
      await expectNoWebhookWrites();
    });

    test('rejects valid-HMAC webhook for an inactive store', async () => {
      await Store.updateOne(
        { slug: 'known-store' },
        { $set: { isActive: false } }
      );

      const response = await request(app)
        .post('/api/webhooks/shopify/orders/create')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Hmac-Sha256', signBody(orderCreatePayload))
        .set('X-Shopify-Shop-Domain', KNOWN_SHOP)
        .send(orderCreatePayload);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Unknown shop domain' });
      await expectNoWebhookWrites();
    });

    test('rejects valid-HMAC webhook when multiple stores match the shop domain', async () => {
      await Store.create({
        name: 'Duplicate Store',
        slug: 'duplicate-store',
        shopify: { shop: KNOWN_SHOP, isConnected: true },
      });

      const response = await request(app)
        .post('/api/webhooks/shopify/orders/create')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Hmac-Sha256', signBody(orderCreatePayload))
        .set('X-Shopify-Shop-Domain', KNOWN_SHOP)
        .send(orderCreatePayload);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Ambiguous shop domain' });
      await expectNoWebhookWrites();
    });
  });

  describe('verified webhook with a known shop', () => {
    test('accepts a valid webhook and resolves the store before the handler runs', async () => {
      // products/delete for an unknown product returns 200 without writing,
      // so it proves the verified path reaches the handler with a trusted
      // store context and no external Shopify calls.
      const response = await request(app)
        .post('/api/webhooks/shopify/products/delete')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Hmac-Sha256', signBody(productDeletePayload))
        .set('X-Shopify-Shop-Domain', KNOWN_SHOP)
        .send(productDeletePayload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
    });

    test('normalizes shop domain header casing and whitespace', async () => {
      const response = await request(app)
        .post('/api/webhooks/shopify/products/delete')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Hmac-Sha256', signBody(productDeletePayload))
        .set('X-Shopify-Shop-Domain', ` ${KNOWN_SHOP.toUpperCase()} `)
        .send(productDeletePayload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
    });
  });

  describe('non-Shopify webhook routes', () => {
    test('health endpoint stays public and unaffected by HMAC verification', async () => {
      const response = await request(app).get('/api/webhooks/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'OK');
    });
  });
});
