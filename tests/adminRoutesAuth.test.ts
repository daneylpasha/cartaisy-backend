import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import adminRoutes from '../src/routes/adminRoutes';
import User from '../src/models/User';
import Store from '../src/models/Store';
import { generateToken } from '../src/utils/jwt';

// =============================================================================
// ROUTE TESTS: adminRoutes require authentication and store ownership
// (issue #75 - router-level auth was previously disabled)
// =============================================================================

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin', adminRoutes);
  return app;
};

describe('admin routes require authentication', () => {
  const app = buildTestApp();

  const protectedEndpoints: Array<[string, string]> = [
    ['get', '/api/v1/admin/dashboard'],
    ['get', '/api/v1/admin/sync/status'],
    ['post', '/api/v1/admin/sync/trigger'],
    ['post', '/api/v1/admin/shopify/fetch-location'],
    ['post', '/api/v1/admin/shopify/set-location'],
    ['get', '/api/v1/admin/jobs'],
    ['post', '/api/v1/admin/jobs/product-sync/run'],
    ['get', '/api/v1/admin/inventory/overview'],
    ['get', '/api/v1/admin/inventory/reservations'],
    ['get', '/api/v1/admin/system/health'],
    ['get', '/api/v1/admin/system/stats'],
    ['get', '/api/v1/admin/logs'],
    ['get', '/api/v1/admin/help-requests'],
    [
      'get',
      `/api/v1/admin/help-requests/${new Types.ObjectId()}/some-help-request-id`,
    ],
    [
      'put',
      `/api/v1/admin/help-requests/${new Types.ObjectId()}/some-help-request-id`,
    ],
  ];

  test.each(protectedEndpoints)(
    '%s %s without a token returns 401',
    async (method, path) => {
      const response = await (request(app) as any)[method](path);

      expect(response.status).toBe(401);
    }
  );

  test('a malformed token returns 401', async () => {
    const response = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', 'Bearer not-a-real-token');

    expect(response.status).toBe(401);
  });

  test('a customer-role token returns 403', async () => {
    const customer = await User.create({
      name: 'Customer User',
      email: 'customer@example.com',
      password: 'password123',
      role: 'customer',
      isActive: true,
    });
    const customerToken = generateToken(customer._id.toString());

    const response = await request(app)
      .get('/api/v1/admin/jobs')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(response.status).toBe(403);
  });
});

describe('admin routes enforce store ownership where store-specific', () => {
  const app = buildTestApp();
  let storeAId: Types.ObjectId;
  let storeBId: Types.ObjectId;
  let adminAToken: string;
  let superAdminToken: string;

  beforeEach(async () => {
    const [storeA, storeB] = await Promise.all([
      Store.create({ name: 'Store A', slug: 'admin-auth-store-a', shopify: {} }),
      Store.create({ name: 'Store B', slug: 'admin-auth-store-b', shopify: {} }),
    ]);
    storeAId = storeA._id;
    storeBId = storeB._id;

    const [adminA, superAdmin] = await Promise.all([
      User.create({
        name: 'Admin A',
        email: 'admin-a@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: storeAId,
      }),
      User.create({
        name: 'Super Admin',
        email: 'super@example.com',
        password: 'password123',
        role: 'super_admin',
        isActive: true,
      }),
    ]);
    adminAToken = generateToken(adminA._id.toString());
    superAdminToken = generateToken(superAdmin._id.toString());
  });

  test('admin can read their own sync status when authenticated', async () => {
    const response = await request(app)
      .get('/api/v1/admin/sync/status')
      .set('Authorization', `Bearer ${adminAToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('admin from store A gets 403 requesting store B sync status via query', async () => {
    const response = await request(app)
      .get(`/api/v1/admin/sync/status?storeId=${storeBId}`)
      .set('Authorization', `Bearer ${adminAToken}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ success: false, error: 'Store access denied' });
  });

  test('admin from store A gets 403 requesting store B via X-Store-ID header', async () => {
    const response = await request(app)
      .get('/api/v1/admin/sync/status')
      .set('Authorization', `Bearer ${adminAToken}`)
      .set('X-Store-ID', storeBId.toString());

    expect(response.status).toBe(403);
  });

  test('admin from store A gets 403 setting store B Shopify location via body', async () => {
    const response = await request(app)
      .post('/api/v1/admin/shopify/set-location')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ storeId: storeBId.toString(), locationId: '12345' });

    expect(response.status).toBe(403);
  });

  test('admin from store A can set the Shopify location for their own store', async () => {
    const response = await request(app)
      .post('/api/v1/admin/shopify/set-location')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ locationId: '12345' });

    expect(response.status).toBe(200);

    const store = await Store.findById(storeAId).lean();
    expect(store?.shopify?.locationId).toBe('12345');
  });

  test('super admin can target store B sync status explicitly', async () => {
    const response = await request(app)
      .get(`/api/v1/admin/sync/status?storeId=${storeBId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('super admin without a storeId gets the global sync view', async () => {
    const response = await request(app)
      .get('/api/v1/admin/sync/status')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
