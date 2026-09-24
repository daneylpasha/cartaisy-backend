import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import Store from '../src/models/Store';
import User from '../src/models/User';
import BuildRequest from '../src/models/BuildRequest';
import { generateToken } from '../src/utils/jwt';
import { strictStoreValidation } from '../src/middleware/strictStoreValidation';
import buildRequestRoutes from '../src/routes/buildRequestRoutes';
import authRoutes from '../src/routes/authRoutes';

const SHOP_A = 'alpha.myshopify.com';
const SHOP_B = 'beta.myshopify.com';
const TOKEN_MARKER = 'shpat_should_not_appear_in_build_responses';

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', strictStoreValidation);
  app.use('/api/v1', buildRequestRoutes);
  return app;
};

const setShopifyState = async (
  storeId: string,
  state: {
    isConnected?: boolean;
    shop?: string;
    lastSyncAt?: Date;
    accessToken?: string;
    catalogStatus?: string;
    catalogShop?: string;
  }
) => {
  const $set: Record<string, unknown> = {};
  if (state.isConnected !== undefined) {
    $set['shopify.isConnected'] = state.isConnected;
  }
  if (state.shop !== undefined) {
    $set['shopify.shop'] = state.shop;
  }
  if (state.lastSyncAt) {
    $set['shopify.lastSyncAt'] = state.lastSyncAt;
  }
  if (state.accessToken) {
    $set['shopify.accessToken'] = state.accessToken;
  }
  if (state.catalogStatus !== undefined) {
    $set['catalogSync.status'] = state.catalogStatus;
  }
  if (state.catalogShop !== undefined) {
    $set['catalogSync.shop'] = state.catalogShop;
  }

  await Store.collection.updateOne({ _id: new mongoose.Types.ObjectId(storeId) }, { $set });
};

const markEligible = (storeId: string, shop: string) =>
  setShopifyState(storeId, {
    isConnected: true,
    shop,
    accessToken: TOKEN_MARKER,
    catalogStatus: 'succeeded',
    catalogShop: shop,
    lastSyncAt: new Date('2026-09-23T12:00:00.000Z'),
  });

describe('Build request API (issue #155)', () => {
  const app = buildTestApp();
  let storeAId: string;
  let storeBId: string;
  let adminAId: string;
  let adminBId: string;
  let adminAToken: string;
  let adminBToken: string;
  let customerToken: string;
  let opsToken: string;

  beforeEach(async () => {
    const [storeA, storeB] = await Promise.all([
      Store.create({ name: 'Build Store A', slug: 'build-store-a', shopify: {} }),
      Store.create({ name: 'Build Store B', slug: 'build-store-b', shopify: {} }),
    ]);
    storeAId = storeA._id.toString();
    storeBId = storeB._id.toString();

    const [adminA, adminB, customer, ops] = await Promise.all([
      User.create({
        name: 'Build Admin A',
        email: 'build-admin-a@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: storeA._id,
      }),
      User.create({
        name: 'Build Admin B',
        email: 'build-admin-b@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: storeB._id,
      }),
      User.create({
        name: 'Build Customer',
        email: 'build-customer@example.com',
        password: 'password123',
        role: 'customer',
        isActive: true,
        storeId: storeA._id,
      }),
      User.create({
        name: 'Build Ops',
        email: 'build-ops@example.com',
        password: 'password123',
        role: 'super_admin',
        isActive: true,
        isVerified: false,
        isPlatformOperator: true,
        storeId: storeA._id,
      }),
    ]);

    adminAId = adminA._id.toString();
    adminBId = adminB._id.toString();
    adminAToken = generateToken(adminA._id.toString());
    adminBToken = generateToken(adminB._id.toString());
    customerToken = generateToken(customer._id.toString());
    opsToken = generateToken(ops._id.toString());
  });

  const createRequest = (
    token: string | undefined,
    body: Record<string, unknown>,
    headerStoreId?: string
  ) => {
    const req = request(app).post('/api/v1/build-requests');
    if (token) {
      req.set('Authorization', `Bearer ${token}`);
    }
    if (headerStoreId) {
      req.set('X-Store-ID', headerStoreId);
    }
    return req.send(body);
  };

  test('store admin can create, list, and get a request for their store only', async () => {
    await markEligible(storeAId, SHOP_A);
    await markEligible(storeBId, SHOP_B);

    const created = await createRequest(adminAToken, {
      android: true,
      ios: true,
      storeId: storeBId,
      checklist: { accessNotes: 'Apple developer invite sent.' },
    }, storeBId);

    expect(created.status).toBe(201);
    expect(created.body.success).toBe(true);
    expect(created.body.data.storeId).toBe(storeAId);
    expect(created.body.data.requestedBy).toBe(adminAId);
    expect(created.body.data.platforms.android.status).toBe('queued');
    expect(created.body.data.platforms.ios.status).toBe('queued');
    expect(created.body.data.checklist.accessNotes).toBe('Apple developer invite sent.');
    expect(JSON.stringify(created.body)).not.toContain(TOKEN_MARKER);
    expect(JSON.stringify(created.body)).not.toContain('shpat_');

    const stored = await BuildRequest.findById(created.body.data.id).lean();
    expect(stored?.storeId.toString()).toBe(storeAId);
    expect(stored?.platforms.android.status).toBe('queued');
    expect(stored?.platforms.ios.status).toBe('queued');
    expect(stored?.checklist.accessNotes).toBe('Apple developer invite sent.');

    const other = await createRequest(adminBToken, {
      android: true,
      ios: false,
      checklist: { accessNotes: 'Store B secret note' },
    });
    expect(other.status).toBe(201);

    const list = await request(app)
      .get('/api/v1/build-requests')
      .set('Authorization', `Bearer ${adminAToken}`)
      .set('X-Store-ID', storeBId);
    expect(list.status).toBe(200);
    expect(list.body.data.count).toBe(1);
    expect(list.body.data.requests).toHaveLength(1);
    expect(list.body.data.requests[0].id).toBe(created.body.data.id);
    expect(list.body.data.requests[0].storeId).toBe(storeAId);
    expect(JSON.stringify(list.body)).not.toContain('Store B secret note');
    expect(JSON.stringify(list.body)).not.toContain(storeBId);

    const fetched = await request(app)
      .get(`/api/v1/build-requests/${created.body.data.id}`)
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.id).toBe(created.body.data.id);

    const leaked = await request(app)
      .get(`/api/v1/build-requests/${other.body.data.id}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .set('X-Store-ID', storeBId);
    expect(leaked.status).toBe(404);
    expect(leaked.body).toEqual({
      success: false,
      error: 'Build request not found',
    });
    expect(JSON.stringify(leaked.body)).not.toContain('Store B secret note');
  });

  test('customers and anonymous callers cannot create or list', async () => {
    await markEligible(storeAId, SHOP_A);

    const customerResponse = await createRequest(customerToken, { android: true });
    expect(customerResponse.status).toBe(403);
    expect(customerResponse.body.success).toBe(false);

    const anonymous = await createRequest(undefined, { android: true });
    expect(anonymous.status).toBe(401);

    const list = await request(app)
      .get('/api/v1/build-requests')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(list.status).toBe(403);
    expect(await BuildRequest.countDocuments()).toBe(0);
  });

  test.each([
    ['disconnected', { isConnected: false, shop: SHOP_A, catalogStatus: 'succeeded', catalogShop: SHOP_A }, 'shopify_not_connected'],
    ['connected without a shop', { isConnected: true, shop: '  ', catalogStatus: 'succeeded', catalogShop: SHOP_A }, 'shopify_not_connected'],
    ['connected but never synced', { isConnected: true, shop: SHOP_A, lastSyncAt: new Date() }, 'catalog_sync_not_succeeded'],
    ['sync idle', { isConnected: true, shop: SHOP_A, catalogStatus: 'idle', catalogShop: SHOP_A }, 'catalog_sync_not_succeeded'],
    ['sync still running', { isConnected: true, shop: SHOP_A, catalogStatus: 'syncing', catalogShop: SHOP_A }, 'catalog_sync_not_succeeded'],
    ['sync failed', { isConnected: true, shop: SHOP_A, catalogStatus: 'failed', catalogShop: SHOP_A, lastSyncAt: new Date() }, 'catalog_sync_not_succeeded'],
    ['success recorded for another shop', { isConnected: true, shop: SHOP_A, catalogStatus: 'succeeded', catalogShop: SHOP_B }, 'catalog_sync_not_succeeded'],
  ])('rejects create when the store is %s', async (_label, state, reason) => {
    await setShopifyState(storeAId, state);

    const response = await createRequest(adminAToken, { android: true, ios: true });

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('BUILD_NOT_ELIGIBLE');
    expect(response.body.reason).toBe(reason);
    expect(typeof response.body.error).toBe('string');
    expect(response.body.error.length).toBeGreaterThan(0);
    expect(await BuildRequest.countDocuments({ storeId: storeAId })).toBe(0);
  });

  test('treats a succeeded sync for the same shop as eligible regardless of domain case', async () => {
    await setShopifyState(storeAId, {
      isConnected: true,
      shop: 'Alpha.MyShopify.com',
      catalogStatus: 'succeeded',
      catalogShop: 'alpha.myshopify.com',
    });

    const response = await createRequest(adminAToken, { ios: true });

    expect(response.status).toBe(201);
    expect(response.body.data.platforms.ios.status).toBe('queued');
    expect(response.body.data.platforms.android.status).toBe('not_requested');
  });

  test('an Android-only request leaves iOS not_requested', async () => {
    await markEligible(storeAId, SHOP_A);

    const response = await createRequest(adminAToken, { android: true });

    expect(response.status).toBe(201);
    expect(response.body.data.platforms.android.status).toBe('queued');
    expect(response.body.data.platforms.ios.status).toBe('not_requested');
    expect(response.body.data.checklist.accessNotes).toBeNull();
  });

  test('checklist edits stay on the owning store and cannot set status', async () => {
    await markEligible(storeAId, SHOP_A);
    await markEligible(storeBId, SHOP_B);
    const created = await createRequest(adminAToken, {
      ios: true,
      checklist: { accessNotes: 'First note' },
    });
    const id = created.body.data.id as string;

    const updated = await request(app)
      .patch(`/api/v1/build-requests/${id}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        storeId: storeBId,
        checklist: { accessNotes: 'Play Console access granted.' },
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.storeId).toBe(storeAId);
    expect(updated.body.data.checklist.accessNotes).toBe('Play Console access granted.');
    expect(updated.body.data.platforms.ios.status).toBe('queued');
    expect(updated.body.data.platforms.android.status).toBe('not_requested');

    const statusAttempt = await request(app)
      .patch(`/api/v1/build-requests/${id}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ android: { status: 'ready' } });
    expect(statusAttempt.status).toBe(400);
    expect(statusAttempt.body.code).toBe('BUILD_REQUEST_INVALID');

    const crossStore = await request(app)
      .patch(`/api/v1/build-requests/${id}`)
      .set('Authorization', `Bearer ${adminBToken}`)
      .send({ checklist: { accessNotes: 'taken over' } });
    expect(crossStore.status).toBe(404);

    const stored = await BuildRequest.findById(id).lean();
    expect(stored?.checklist.accessNotes).toBe('Play Console access granted.');
    expect(stored?.platforms.android.status).toBe('not_requested');
  });

  test('platform admin can update Android and iOS independently', async () => {
    await markEligible(storeBId, SHOP_B);
    const created = await createRequest(adminBToken, { android: true, ios: true });
    const id = created.body.data.id as string;

    const merchantAttempt = await request(app)
      .patch(`/api/v1/admin/build-requests/${id}/status`)
      .set('Authorization', `Bearer ${adminBToken}`)
      .set('X-Store-ID', storeBId)
      .send({ android: { status: 'ready' } });
    expect(merchantAttempt.status).toBe(403);
    expect(merchantAttempt.body.error).toBe('Platform admin access required');

    const androidReady = await request(app)
      .patch(`/api/v1/admin/build-requests/${id}/status`)
      .set('Authorization', `Bearer ${opsToken}`)
      .set('X-Store-ID', storeAId)
      .send({ android: { status: 'ready' } });
    expect(androidReady.status).toBe(200);
    expect(androidReady.body.data.storeId).toBe(storeBId);
    expect(androidReady.body.data.platforms.android.status).toBe('ready');
    expect(androidReady.body.data.platforms.ios.status).toBe('queued');

    const iosWaiting = await request(app)
      .patch(`/api/v1/admin/build-requests/${id}/status`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ ios: { status: 'waiting_on_merchant' } });
    expect(iosWaiting.status).toBe(200);
    expect(iosWaiting.body.data.platforms.android.status).toBe('ready');
    expect(iosWaiting.body.data.platforms.ios.status).toBe('waiting_on_merchant');

    const stored = await BuildRequest.findById(id).lean();
    expect(stored?.platforms.android.status).toBe('ready');
    expect(stored?.platforms.ios.status).toBe('waiting_on_merchant');
    expect(stored?.storeId.toString()).toBe(storeBId);
  });

  test('rejects an empty platform choice, a long note, and a runbook field', async () => {
    await markEligible(storeAId, SHOP_A);

    const empty = await createRequest(adminAToken, { android: false, ios: false });
    expect(empty.status).toBe(400);
    expect(empty.body.error).toBe('Choose Android, iOS, or both.');

    const longNote = await createRequest(adminAToken, {
      android: true,
      checklist: { accessNotes: 'x'.repeat(281) },
    });
    expect(longNote.status).toBe(400);
    expect(longNote.body.code).toBe('BUILD_REQUEST_INVALID');

    const runbook = await createRequest(adminAToken, {
      android: true,
      runbook: 'step 1 do everything',
    });
    expect(runbook.status).toBe(400);
    expect(await BuildRequest.countDocuments()).toBe(0);
  });

  test('a later disconnect blocks a new request and leaves the existing one readable', async () => {
    await markEligible(storeAId, SHOP_A);
    const created = await createRequest(adminAToken, { android: true });
    expect(created.status).toBe(201);

    await setShopifyState(storeAId, { isConnected: false, shop: '' });

    const blocked = await createRequest(adminAToken, { android: true });
    expect(blocked.status).toBe(409);
    expect(blocked.body.reason).toBe('shopify_not_connected');

    const fetched = await request(app)
      .get(`/api/v1/build-requests/${created.body.data.id}`)
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.platforms.android.status).toBe('queued');
  });

  const insertBuildRequest = async (input: {
    storeId: string;
    requestedBy: string;
    android: 'not_requested' | 'waiting_on_merchant' | 'queued' | 'building' | 'ready' | 'failed';
    ios: 'not_requested' | 'waiting_on_merchant' | 'queued' | 'building' | 'ready' | 'failed';
    accessNotes?: string;
    createdAt: string;
  }): Promise<string> => {
    const createdAt = new Date(input.createdAt);
    const doc = await BuildRequest.create({
      storeId: input.storeId,
      requestedBy: input.requestedBy,
      platforms: {
        android: { status: input.android, updatedAt: createdAt },
        ios: { status: input.ios, updatedAt: createdAt },
      },
      checklist: input.accessNotes ? { accessNotes: input.accessNotes } : {},
      createdAt,
      updatedAt: createdAt,
    });
    await BuildRequest.collection.updateOne(
      { _id: doc._id },
      { $set: { createdAt, updatedAt: createdAt } }
    );
    return doc._id.toString();
  };

  test('store admins cannot list build requests across stores', async () => {
    const secret = 'Store B Play Console password hint';
    await insertBuildRequest({
      storeId: storeBId,
      requestedBy: adminBId,
      android: 'queued',
      ios: 'waiting_on_merchant',
      accessNotes: secret,
      createdAt: '2026-09-20T12:00:00.000Z',
    });

    const storeAdmin = await request(app)
      .get('/api/v1/admin/build-requests')
      .set('Authorization', `Bearer ${adminAToken}`)
      .set('X-Store-ID', storeBId);
    expect(storeAdmin.status).toBe(403);
    expect(storeAdmin.body).toEqual({
      success: false,
      error: 'Platform admin access required',
    });
    expect(JSON.stringify(storeAdmin.body)).not.toContain(secret);
    expect(JSON.stringify(storeAdmin.body)).not.toContain(storeBId);

    const customer = await request(app)
      .get('/api/v1/admin/build-requests')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(customer.status).toBe(403);
    expect(customer.body.error).toBe('Platform admin access required');
    expect(JSON.stringify(customer.body)).not.toContain(secret);

    const anonymous = await request(app).get('/api/v1/admin/build-requests');
    expect(anonymous.status).toBe(401);
    expect(JSON.stringify(anonymous.body)).not.toContain(secret);
  });

  test('platform admin receives an empty queue', async () => {
    const response = await request(app)
      .get('/api/v1/admin/build-requests')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        requests: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          pages: 0,
        },
      },
    });
  });

  test('platform admin lists every store newest first with store identity and access notes', async () => {
    await setShopifyState(storeAId, {
      shop: SHOP_A,
      accessToken: TOKEN_MARKER,
    });
    await setShopifyState(storeBId, {
      shop: `  ${SHOP_B}  `,
      accessToken: TOKEN_MARKER,
    });

    const olderId = await insertBuildRequest({
      storeId: storeAId,
      requestedBy: adminAId,
      android: 'queued',
      ios: 'not_requested',
      accessNotes: 'Play Console access granted.',
      createdAt: '2026-09-01T00:00:00.000Z',
    });
    const newerId = await insertBuildRequest({
      storeId: storeBId,
      requestedBy: adminBId,
      android: 'ready',
      ios: 'waiting_on_merchant',
      accessNotes: 'Apple developer invite sent.',
      createdAt: '2026-09-20T15:30:00.000Z',
    });

    const response = await request(app)
      .get('/api/v1/admin/build-requests')
      .set('Authorization', `Bearer ${opsToken}`)
      .set('X-Store-ID', storeAId);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 2,
      pages: 1,
    });
    expect(response.body.data.requests.map((item: { id: string }) => item.id)).toEqual([
      newerId,
      olderId,
    ]);

    expect(response.body.data.requests[0]).toEqual({
      id: newerId,
      storeId: storeBId,
      store: {
        id: storeBId,
        name: 'Build Store B',
        domain: SHOP_B,
      },
      requestedBy: adminBId,
      platforms: {
        android: {
          status: 'ready',
          updatedAt: '2026-09-20T15:30:00.000Z',
        },
        ios: {
          status: 'waiting_on_merchant',
          updatedAt: '2026-09-20T15:30:00.000Z',
        },
      },
      checklist: {
        accessNotes: 'Apple developer invite sent.',
      },
      createdAt: '2026-09-20T15:30:00.000Z',
      updatedAt: '2026-09-20T15:30:00.000Z',
    });
    expect(response.body.data.requests[1].store).toEqual({
      id: storeAId,
      name: 'Build Store A',
      domain: SHOP_A,
    });
    expect(response.body.data.requests[1].checklist.accessNotes).toBe(
      'Play Console access granted.'
    );
    expect(JSON.stringify(response.body)).not.toContain(TOKEN_MARKER);
    expect(JSON.stringify(response.body)).not.toContain('shpat_');

    const ownStore = await request(app)
      .get('/api/v1/build-requests')
      .set('Authorization', `Bearer ${opsToken}`);
    expect(ownStore.status).toBe(200);
    expect(ownStore.body.data.requests.map((item: { id: string }) => item.id)).toEqual([olderId]);
    expect(JSON.stringify(ownStore.body)).not.toContain('Apple developer invite sent.');
  });

  test('platform queue filters by platform status and paginates', async () => {
    const iosOnly = await insertBuildRequest({
      storeId: storeAId,
      requestedBy: adminAId,
      android: 'not_requested',
      ios: 'queued',
      createdAt: '2026-09-01T00:00:00.000Z',
    });
    const waiting = await insertBuildRequest({
      storeId: storeBId,
      requestedBy: adminBId,
      android: 'ready',
      ios: 'waiting_on_merchant',
      accessNotes: 'Need Apple account',
      createdAt: '2026-09-10T00:00:00.000Z',
    });
    const building = await insertBuildRequest({
      storeId: storeAId,
      requestedBy: adminAId,
      android: 'building',
      ios: 'not_requested',
      createdAt: '2026-09-20T00:00:00.000Z',
    });

    const active = await request(app)
      .get('/api/v1/admin/build-requests')
      .query({ status: 'queued,building,waiting_on_merchant' })
      .set('Authorization', `Bearer ${opsToken}`);
    expect(active.status).toBe(200);
    expect(active.body.data.requests.map((item: { id: string }) => item.id)).toEqual([
      building,
      waiting,
      iosOnly,
    ]);
    expect(active.body.data.pagination.total).toBe(3);

    const androidQueued = await request(app)
      .get('/api/v1/admin/build-requests')
      .query({ platform: 'android', status: 'building' })
      .set('Authorization', `Bearer ${opsToken}`);
    expect(androidQueued.status).toBe(200);
    expect(androidQueued.body.data.requests).toHaveLength(1);
    expect(androidQueued.body.data.requests[0].id).toBe(building);

    const androidRequests = await request(app)
      .get('/api/v1/admin/build-requests')
      .query({ platform: 'android' })
      .set('Authorization', `Bearer ${opsToken}`);
    expect(androidRequests.body.data.requests.map((item: { id: string }) => item.id)).toEqual([
      building,
      waiting,
    ]);

    const page = await request(app)
      .get('/api/v1/admin/build-requests')
      .query({ page: '2', limit: '1' })
      .set('Authorization', `Bearer ${opsToken}`);
    expect(page.status).toBe(200);
    expect(page.body.data.requests.map((item: { id: string }) => item.id)).toEqual([waiting]);
    expect(page.body.data.pagination).toEqual({
      page: 2,
      limit: 1,
      total: 3,
      pages: 3,
    });

    const invalid = await request(app)
      .get('/api/v1/admin/build-requests')
      .query({ status: 'shipped', storeId: storeBId })
      .set('Authorization', `Bearer ${opsToken}`);
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('BUILD_REQUEST_INVALID');
  });

  const withAllowlist = async (
    value: string | undefined,
    run: () => Promise<void>
  ): Promise<void> => {
    const previous = process.env.PLATFORM_OPS_EMAILS;
    if (value === undefined) {
      delete process.env.PLATFORM_OPS_EMAILS;
    } else {
      process.env.PLATFORM_OPS_EMAILS = value;
    }
    try {
      await run();
    } finally {
      if (previous === undefined) {
        delete process.env.PLATFORM_OPS_EMAILS;
      } else {
        process.env.PLATFORM_OPS_EMAILS = previous;
      }
    }
  };

  const expectNoCrossStoreLeak = (body: unknown, secret: string, otherId: string): void => {
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(storeBId);
    expect(serialized).not.toContain(otherId);
    expect(serialized).not.toContain(SHOP_B);
  };

  test('store-owner super_admin without a platform-ops marker cannot list or update other stores', async () => {
    await withAllowlist(' , , ', async () => {
      const owner = await User.create({
        name: 'Store Owner',
        email: 'store-owner@example.com',
        password: 'password123',
        role: 'super_admin',
        isActive: true,
        isVerified: true,
        isPlatformOperator: false,
        storeId: storeAId,
      });
      const ownerToken = generateToken(owner._id.toString());

      await markEligible(storeAId, SHOP_A);
      const created = await createRequest(ownerToken, {
        android: true,
        ios: false,
        checklist: { accessNotes: 'Owner note for store A' },
      });
      expect(created.status).toBe(201);
      const ownId = created.body.data.id as string;
      expect(created.body.data.storeId).toBe(storeAId);

      const list = await request(app)
        .get('/api/v1/build-requests')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(list.status).toBe(200);
      expect(list.body.data.requests.map((item: { id: string }) => item.id)).toEqual([ownId]);

      const fetched = await request(app)
        .get(`/api/v1/build-requests/${ownId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(fetched.status).toBe(200);
      expect(fetched.body.data.checklist.accessNotes).toBe('Owner note for store A');

      const checklist = await request(app)
        .patch(`/api/v1/build-requests/${ownId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ checklist: { accessNotes: 'Updated owner note' } });
      expect(checklist.status).toBe(200);
      expect(checklist.body.data.storeId).toBe(storeAId);
      expect(checklist.body.data.checklist.accessNotes).toBe('Updated owner note');
      expect(checklist.body.data.platforms.android.status).toBe('queued');

      const secret = 'Store B Play Console password hint';
      const otherId = await insertBuildRequest({
        storeId: storeBId,
        requestedBy: adminBId,
        android: 'queued',
        ios: 'waiting_on_merchant',
        accessNotes: secret,
        createdAt: '2026-09-21T12:00:00.000Z',
      });

      const deniedList = await request(app)
        .get('/api/v1/admin/build-requests')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Store-ID', storeBId);
      expect(deniedList.status).toBe(403);
      expect(deniedList.body).toEqual({
        success: false,
        error: 'Platform admin access required',
      });
      expectNoCrossStoreLeak(deniedList.body, secret, otherId);

      const deniedStatus = await request(app)
        .patch(`/api/v1/admin/build-requests/${otherId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Store-ID', storeBId)
        .send({ android: { status: 'ready' } });
      expect(deniedStatus.status).toBe(403);
      expect(deniedStatus.body).toEqual({
        success: false,
        error: 'Platform admin access required',
      });
      expectNoCrossStoreLeak(deniedStatus.body, secret, otherId);

      const stored = await BuildRequest.findById(otherId).lean();
      expect(stored?.platforms.android.status).toBe('queued');
      expect(stored?.checklist.accessNotes).toBe(secret);
    });
  });

  test('a verified allowlisted email can list and update status without the operator flag', async () => {
    await withAllowlist(' Ops@Example.com , unverified-ops@example.com ', async () => {
      const [listed, unverified] = await Promise.all([
        User.create({
          name: 'Allowlisted Ops',
          email: 'ops@example.com',
          password: 'password123',
          role: 'admin',
          isActive: true,
          isVerified: true,
          isPlatformOperator: false,
          storeId: storeAId,
        }),
        User.create({
          name: 'Unverified Listed Email',
          email: 'unverified-ops@example.com',
          password: 'password123',
          role: 'super_admin',
          isActive: true,
          isVerified: false,
          isPlatformOperator: false,
          storeId: storeAId,
        }),
      ]);
      const listedToken = generateToken(listed._id.toString());
      const unverifiedToken = generateToken(unverified._id.toString());

      const secret = 'Allowlist must not leak this note';
      const otherId = await insertBuildRequest({
        storeId: storeBId,
        requestedBy: adminBId,
        android: 'queued',
        ios: 'not_requested',
        accessNotes: secret,
        createdAt: '2026-09-22T12:00:00.000Z',
      });

      const unverifiedList = await request(app)
        .get('/api/v1/admin/build-requests')
        .set('Authorization', `Bearer ${unverifiedToken}`);
      expect(unverifiedList.status).toBe(403);
      expectNoCrossStoreLeak(unverifiedList.body, secret, otherId);

      const unverifiedStatus = await request(app)
        .patch(`/api/v1/admin/build-requests/${otherId}/status`)
        .set('Authorization', `Bearer ${unverifiedToken}`)
        .send({ android: { status: 'failed' } });
      expect(unverifiedStatus.status).toBe(403);
      expectNoCrossStoreLeak(unverifiedStatus.body, secret, otherId);

      const listedList = await request(app)
        .get('/api/v1/admin/build-requests')
        .set('Authorization', `Bearer ${listedToken}`)
        .set('X-Store-ID', storeAId);
      expect(listedList.status).toBe(200);
      expect(listedList.body.data.requests.map((item: { id: string }) => item.id)).toContain(otherId);
      expect(JSON.stringify(listedList.body)).toContain(secret);

      const listedStatus = await request(app)
        .patch(`/api/v1/admin/build-requests/${otherId}/status`)
        .set('Authorization', `Bearer ${listedToken}`)
        .send({ android: { status: 'ready' } });
      expect(listedStatus.status).toBe(200);
      expect(listedStatus.body.data.storeId).toBe(storeBId);
      expect(listedStatus.body.data.platforms.android.status).toBe('ready');

      const flagged = await request(app)
        .get('/api/v1/admin/build-requests')
        .set('Authorization', `Bearer ${opsToken}`);
      expect(flagged.status).toBe(200);
      expect(flagged.body.data.requests.map((item: { id: string }) => item.id)).toContain(otherId);
    });
  });

  test('store registration cannot grant platform ops and merchant routes still work', async () => {
    await withAllowlist(undefined, async () => {
      const authApp = express();
      authApp.use(express.json());
      authApp.use('/api/v1/auth', authRoutes);
      authApp.use('/api/v1', strictStoreValidation);
      authApp.use('/api/v1', buildRequestRoutes);

      const registered = await request(authApp).post('/api/v1/auth/register').send({
        email: 'new-owner@example.com',
        password: 'password123',
        name: 'New Owner',
        storeName: 'New Owner Store',
        role: 'admin',
        isPlatformOperator: true,
      });
      expect(registered.status).toBe(201);
      expect(registered.body.data.user.role).toBe('super_admin');
      expect(registered.body.data.user.isPlatformOperator).not.toBe(true);

      const storedUser = await User.findOne({ email: 'new-owner@example.com' });
      expect(storedUser?.role).toBe('super_admin');
      expect(storedUser?.isPlatformOperator).toBe(false);
      expect(storedUser?.isVerified).toBe(true);

      const token = registered.body.data.token as string;
      const ownerStoreId = storedUser!.storeId.toString();
      const secret = 'Registration must not reveal this note';
      const otherId = await insertBuildRequest({
        storeId: storeBId,
        requestedBy: adminBId,
        android: 'building',
        ios: 'queued',
        accessNotes: secret,
        createdAt: '2026-09-22T18:00:00.000Z',
      });

      const deniedList = await request(authApp)
        .get('/api/v1/admin/build-requests')
        .set('Authorization', `Bearer ${token}`);
      expect(deniedList.status).toBe(403);
      expect(deniedList.body.error).toBe('Platform admin access required');
      expectNoCrossStoreLeak(deniedList.body, secret, otherId);

      const deniedStatus = await request(authApp)
        .patch(`/api/v1/admin/build-requests/${otherId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ ios: { status: 'ready' } });
      expect(deniedStatus.status).toBe(403);
      expectNoCrossStoreLeak(deniedStatus.body, secret, otherId);
      const unchanged = await BuildRequest.findById(otherId).lean();
      expect(unchanged?.platforms.ios.status).toBe('queued');

      const profile = await request(authApp)
        .patch('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ isPlatformOperator: true });
      expect(profile.status).toBe(400);
      const afterProfile = await User.findOne({ email: 'new-owner@example.com' });
      expect(afterProfile?.isPlatformOperator).toBe(false);

      await markEligible(ownerStoreId, 'new-owner.myshopify.com');
      const created = await request(authApp)
        .post('/api/v1/build-requests')
        .set('Authorization', `Bearer ${token}`)
        .send({
          android: true,
          ios: false,
          storeId: storeBId,
          checklist: { accessNotes: 'New owner checklist' },
        });
      expect(created.status).toBe(201);
      expect(created.body.data.storeId).toBe(ownerStoreId);
      expect(created.body.data.checklist.accessNotes).toBe('New owner checklist');

      const ownList = await request(authApp)
        .get('/api/v1/build-requests')
        .set('Authorization', `Bearer ${token}`);
      expect(ownList.status).toBe(200);
      expect(ownList.body.data.requests).toHaveLength(1);
      expect(JSON.stringify(ownList.body)).not.toContain(secret);

      const ownGet = await request(authApp)
        .get(`/api/v1/build-requests/${created.body.data.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(ownGet.status).toBe(200);

      const ownChecklist = await request(authApp)
        .patch(`/api/v1/build-requests/${created.body.data.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ checklist: { accessNotes: 'Checklist saved' } });
      expect(ownChecklist.status).toBe(200);
      expect(ownChecklist.body.data.checklist.accessNotes).toBe('Checklist saved');
    });
  });
});
