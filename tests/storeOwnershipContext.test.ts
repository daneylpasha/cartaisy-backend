import express from 'express';
import request from 'supertest';
import { NextFunction, Response } from 'express';
import { Types } from 'mongoose';
import { requireOwnedStoreContext } from '../src/middleware/storeOwnership';
import orderManagementRoutes from '../src/routes/orderManagementRoutes';
import User from '../src/models/User';
import Store from '../src/models/Store';
import Order from '../src/models/Order';
import { generateToken } from '../src/utils/jwt';
import { AuthenticatedRequest } from '../src/types';

// =============================================================================
// UNIT TESTS: requireOwnedStoreContext
// =============================================================================

const ownedStoreId = new Types.ObjectId();
const otherStoreId = new Types.ObjectId();
const userId = new Types.ObjectId();

const createRequest = (
  overrides: Record<string, unknown> = {},
  userOverrides: Record<string, unknown> = {}
): AuthenticatedRequest =>
  ({
    params: {},
    query: {},
    body: {},
    headers: {},
    user: {
      _id: userId,
      id: userId.toString(),
      storeId: ownedStoreId,
      email: 'admin@example.com',
      role: 'admin',
      name: 'Admin User',
      isActive: true,
      ...userOverrides,
    },
    ...overrides,
  } as unknown as AuthenticatedRequest);

const createResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
};

describe('requireOwnedStoreContext', () => {
  it('defaults to the user own store when no storeId is supplied', async () => {
    const req = createRequest();
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await requireOwnedStoreContext()(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.storeId).toBe(ownedStoreId.toString());
  });

  it('accepts a matching storeId from query', async () => {
    const req = createRequest({ query: { storeId: ownedStoreId.toString() } });
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await requireOwnedStoreContext()(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.storeId).toBe(ownedStoreId.toString());
  });

  it('rejects a mismatched storeId from body with 403', async () => {
    const req = createRequest({ body: { storeId: otherStoreId.toString() } });
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await requireOwnedStoreContext()(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Store access denied' });
  });

  it('rejects a mismatched X-Store-ID header with 403', async () => {
    const req = createRequest({ headers: { 'x-store-id': otherStoreId.toString() } });
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await requireOwnedStoreContext()(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('rejects an invalid storeId with 400', async () => {
    const req = createRequest({ query: { storeId: 'not-an-object-id' } });
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await requireOwnedStoreContext()(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects a user without a storeId with 403', async () => {
    const req = createRequest({}, { storeId: undefined });
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await requireOwnedStoreContext()(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('lets a super admin target another store and sets req.storeId from the request', async () => {
    const req = createRequest(
      { query: { storeId: otherStoreId.toString() } },
      { role: 'super_admin' }
    );
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await requireOwnedStoreContext()(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    // Must be the requested store, never the super admin's own store
    expect(req.storeId).toBe(otherStoreId.toString());
  });

  it('leaves req.storeId unset for a super admin global view when required is false', async () => {
    const req = createRequest({}, { role: 'super_admin', storeId: undefined });
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await requireOwnedStoreContext({ required: false })(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.storeId).toBeUndefined();
  });
});

// =============================================================================
// ROUTE TESTS: order management ownership through the real auth stack
// =============================================================================

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin', orderManagementRoutes);
  return app;
};

const orderFixture = (storeId: Types.ObjectId, user: Types.ObjectId, n: number) => ({
  storeId,
  user,
  email: `buyer${n}@example.com`,
  orderNumber: `TEST-${n}`,
  lineItems: [{ quantity: 1, price: 10, title: 'Test Item' }],
  subtotalPrice: 10,
  totalTax: 0,
  totalPrice: 10,
  currency: 'USD',
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
});

describe('order management routes enforce store ownership', () => {
  const app = buildTestApp();
  let storeAId: Types.ObjectId;
  let storeBId: Types.ObjectId;
  let adminAToken: string;
  let superAdminToken: string;
  let orderAId: string;
  let orderBId: string;

  beforeEach(async () => {
    const [storeA, storeB] = await Promise.all([
      Store.create({ name: 'Store A', slug: 'ownership-store-a', shopify: {} }),
      Store.create({ name: 'Store B', slug: 'ownership-store-b', shopify: {} }),
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

    const [orderA, orderB] = await Promise.all([
      Order.create(orderFixture(storeAId, adminA._id, 1)),
      Order.create(orderFixture(storeBId, adminA._id, 2)),
    ]);
    orderAId = orderA._id.toString();
    orderBId = orderB._id.toString();
  });

  afterEach(async () => {
    await Promise.all([Order.deleteMany({}), User.deleteMany({}), Store.deleteMany({})]);
  });

  test('admin from store A gets 403 targeting store B via :storeId', async () => {
    const response = await request(app)
      .get(`/api/v1/admin/stores/${storeBId}/orders`)
      .set('Authorization', `Bearer ${adminAToken}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ success: false, error: 'Store access denied' });
  });

  test('admin from store A succeeds on their own :storeId and sees only their orders', async () => {
    const response = await request(app)
      .get(`/api/v1/admin/stores/${storeAId}/orders`)
      .set('Authorization', `Bearer ${adminAToken}`);

    expect(response.status).toBe(200);
    const orders = response.body.data.orders;
    expect(orders).toHaveLength(1);
    expect(orders[0]._id).toBe(orderAId);
  });

  test('admin from store A gets 403 supplying store B via query on /orders', async () => {
    const response = await request(app)
      .get(`/api/v1/admin/orders?storeId=${storeBId}`)
      .set('Authorization', `Bearer ${adminAToken}`);

    expect(response.status).toBe(403);
  });

  test('/orders without a storeId defaults to the admin own store', async () => {
    const response = await request(app)
      .get('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${adminAToken}`);

    expect(response.status).toBe(200);
    const orders = response.body.data.orders;
    expect(orders).toHaveLength(1);
    expect(orders[0]._id).toBe(orderAId);
  });

  test('super admin can target store B and receives store B data', async () => {
    const response = await request(app)
      .get(`/api/v1/admin/stores/${storeBId}/orders`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(response.status).toBe(200);
    const orders = response.body.data.orders;
    expect(orders).toHaveLength(1);
    expect(orders[0]._id).toBe(orderBId);
  });

  test('admin from store A cannot fetch store B order by id (404)', async () => {
    const response = await request(app)
      .get(`/api/v1/admin/orders/${orderBId}`)
      .set('Authorization', `Bearer ${adminAToken}`);

    expect(response.status).toBe(404);
  });

  test('admin from store A can fetch their own order by id', async () => {
    const response = await request(app)
      .get(`/api/v1/admin/orders/${orderAId}`)
      .set('Authorization', `Bearer ${adminAToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.order._id).toBe(orderAId);
  });

  test('unauthenticated requests are rejected', async () => {
    const response = await request(app).get(`/api/v1/admin/stores/${storeAId}/orders`);

    expect(response.status).toBe(401);
  });
});
