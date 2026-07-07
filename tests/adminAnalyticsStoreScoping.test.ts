import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import Store from '../src/models/Store';
import User from '../src/models/User';
import Order from '../src/models/Order';
import Product from '../src/models/Product';
import AnalyticsEvent from '../src/models/AnalyticsEvent';
import analyticsRoutes from '../src/routes/analyticsRoutes';
import adminRoutes from '../src/routes/adminRoutes';
import { generateToken } from '../src/utils/jwt';

// =============================================================================
// Admin analytics store scoping (issue #79)
//
// A Store A admin must only ever see Store A metrics: analytics endpoints
// bind to the VALIDATED req.storeId (requireOwnedStoreContext), reject any
// other supplied store with 403, and the platform-wide aggregate exists
// only for super admins who omit the store.
// =============================================================================

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/analytics', analyticsRoutes);
  app.use('/api/v1/admin', adminRoutes);
  return app;
};

const orderFixture = (
  storeId: Types.ObjectId,
  user: Types.ObjectId,
  n: number,
  totalPrice: number,
  extras: Record<string, any> = {}
) => ({
  storeId,
  user,
  email: `buyer${n}@example.com`,
  orderNumber: `ANALYTICS-${n}`,
  lineItems: [{ quantity: 1, price: totalPrice, title: 'Test Item' }],
  subtotalPrice: totalPrice,
  totalTax: 0,
  totalPrice,
  currency: 'USD',
  financialStatus: 'paid',
  billingAddress: {
    firstName: 'Test',
    address1: '1 Test St',
    city: 'Testville',
    province: 'TS',
    country: 'US',
    zip: '12345',
  },
  shippingAddress: {
    firstName: 'Test',
    address1: '1 Test St',
    city: 'Testville',
    province: 'TS',
    country: 'US',
    zip: '12345',
  },
  shipping: { method: 'Standard', cost: 0 },
  mobileStatus: { current: 'confirmed', history: [] },
  placedAt: new Date(),
  source: 'web',
  channel: 'website',
  ...extras,
});

describe('admin analytics store scoping', () => {
  const app = buildTestApp();
  let storeAId: Types.ObjectId;
  let storeBId: Types.ObjectId;
  let adminAToken: string;
  let superAdminToken: string;
  let orderBId: string;

  beforeEach(async () => {
    const [storeA, storeB] = await Promise.all([
      Store.create({ name: 'Analytics Store A', slug: 'analytics-store-a', shopify: {} }),
      Store.create({ name: 'Analytics Store B', slug: 'analytics-store-b', shopify: {} }),
    ]);
    storeAId = storeA._id;
    storeBId = storeB._id;

    const [adminA, superAdmin] = await Promise.all([
      User.create({
        name: 'Admin A',
        email: 'analytics-admin-a@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: storeAId,
      }),
      User.create({
        name: 'Super Admin',
        email: 'analytics-super@example.com',
        password: 'password123',
        role: 'super_admin',
        isActive: true,
      }),
    ]);
    adminAToken = generateToken(adminA._id.toString());
    superAdminToken = generateToken(superAdmin._id.toString());

    const [, orderB] = await Promise.all([
      Order.create(orderFixture(storeAId, adminA._id, 1, 50)),
      Order.create(
        orderFixture(storeBId, superAdmin._id, 2, 100, {
          helpRequests: [
            { id: 'hr-b-1', reason: 'other', otherText: 'Store B issue', status: 'open', createdAt: new Date() },
          ],
        })
      ),
    ]);
    orderBId = orderB._id.toString();

    await AnalyticsEvent.create([
      {
        storeId: storeAId,
        sessionId: 'session-store-a',
        eventType: 'product_view',
        platform: 'ios',
        timestamp: new Date(),
      },
      {
        storeId: storeBId,
        sessionId: 'session-store-b',
        eventType: 'product_view',
        platform: 'android',
        timestamp: new Date(),
      },
    ]);
  });

  afterEach(async () => {
    await Promise.all([
      Store.deleteMany({}),
      User.deleteMany({}),
      Order.deleteMany({}),
      Product.deleteMany({}),
      AnalyticsEvent.deleteMany({}),
    ]);
  });

  describe('authentication gate', () => {
    test('admin analytics endpoints reject unauthenticated requests', async () => {
      const response = await request(app).get('/api/v1/analytics/sales/overview');
      expect(response.status).toBe(401);
    });
  });

  describe('store admin sees only their own store', () => {
    test('sales overview returns only store A revenue for store A admin', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/sales/overview')
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.totalRevenue).toBe(50);
      expect(response.body.data.totalOrders).toBe(1);
    });

    test('legacy revenue analytics returns only store A revenue', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/revenue')
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.summary.totalRevenue).toBe(50);
      expect(response.body.data.summary.totalOrders).toBe(1);
    });

    test('app platform breakdown includes only store A events', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/app/platforms')
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(response.status).toBe(200);
      const platforms = response.body.data.map((p: any) => p.platform);
      expect(platforms).toEqual(['ios']);
    });

    test("store A admin cannot read a store B session journey by guessing its session ID", async () => {
      const response = await request(app)
        .get('/api/v1/analytics/app/journey/session-store-b')
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    });

    test('admin dashboard aggregates only store A orders', async () => {
      const response = await request(app)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.system.orders.total).toBe(1);
    });

    test("store A admin sees no store B help requests, and gets 404 on store B's detail and update", async () => {
      const list = await request(app)
        .get('/api/v1/admin/help-requests')
        .set('Authorization', `Bearer ${adminAToken}`);
      expect(list.status).toBe(200);
      expect(list.body.data.helpRequests).toHaveLength(0);
      expect(list.body.data.statusCounts.open).toBe(0);

      const detail = await request(app)
        .get(`/api/v1/admin/help-requests/${orderBId}/hr-b-1`)
        .set('Authorization', `Bearer ${adminAToken}`);
      expect(detail.status).toBe(404);

      const update = await request(app)
        .put(`/api/v1/admin/help-requests/${orderBId}/hr-b-1`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({ status: 'resolved' });
      expect(update.status).toBe(404);

      // Store B's help request is untouched
      const orderB = await Order.findById(orderBId);
      expect((orderB!.helpRequests as any)[0].status).toBe('open');
    });
  });

  describe('supplying another store is rejected', () => {
    test('store A admin requesting store B via query gets 403', async () => {
      const response = await request(app)
        .get(`/api/v1/analytics/sales/overview?storeId=${storeBId}`)
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ success: false, error: 'Store access denied' });
    });

    test('store A admin requesting store B via X-Store-ID header gets 403', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/sales/overview')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('X-Store-ID', storeBId.toString());

      expect(response.status).toBe(403);
    });
  });

  describe('super admin behavior is explicit', () => {
    test('super admin targeting store B sees store B metrics', async () => {
      const response = await request(app)
        .get(`/api/v1/analytics/sales/overview?storeId=${storeBId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.totalRevenue).toBe(100);
    });

    test('super admin without a store gets the platform-wide aggregate', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/sales/overview')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.totalRevenue).toBe(150);
      expect(response.body.data.totalOrders).toBe(2);
    });

    test('super admin dashboard without a store aggregates both stores', async () => {
      const response = await request(app)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.system.orders.total).toBe(2);
    });

    test('super admin sees store B help requests in the platform-wide list', async () => {
      const response = await request(app)
        .get('/api/v1/admin/help-requests')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.helpRequests).toHaveLength(1);
      expect(response.body.data.helpRequests[0].id).toBe('hr-b-1');
    });
  });

  describe('DAU/MAU endpoints require a concrete store', () => {
    test('store A admin gets their own store stats', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/app-stats')
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('super admin without a store gets an explicit 400 (no platform-wide mode)', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/app-stats')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Store ID required/);
    });
  });
});
