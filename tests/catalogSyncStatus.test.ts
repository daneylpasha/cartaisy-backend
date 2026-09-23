import express from 'express';
import request from 'supertest';
import Store from '../src/models/Store';
import User from '../src/models/User';
import { generateToken } from '../src/utils/jwt';
import shopifyOAuthRoutes from '../src/routes/shopifyOAuthRoutes';
import { performFullSync } from '../src/services/syncService';
import {
  assertBuildEligible,
  buildEligibilityErrorBody,
  BuildNotEligibleError,
  CATALOG_SYNC_MAX_ATTEMPTS,
  CATALOG_SYNC_STALE_AFTER_MS,
  catalogSyncShopChangeUpdate,
  getBuildEligibility,
  syncCatalogForStore,
  toSafeSyncErrorSummary,
} from '../src/services/catalogSyncService';
import { NotFoundError } from '../src/utils/errors';

jest.mock('../src/services/syncService', () => ({
  performFullSync: jest.fn(),
}));

const performFullSyncMock = performFullSync as unknown as jest.Mock;

const SHOP_A = 'alpha.myshopify.com';
const SHOP_B = 'beta.myshopify.com';
const RAW_TOKEN = 'shpat_catalog_sync_secret_token';

const successResult = {
  inProgress: false,
  errors: [],
  lastFullSync: new Date('2026-09-23T00:00:00.000Z'),
  stats: { productsSync: 4, customersSync: 1, ordersSync: 2 },
};

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/shopify', shopifyOAuthRoutes);
  return app;
};

const expectNoToken = (payload: unknown) => {
  const serialized = JSON.stringify(payload);
  expect(serialized).not.toContain(RAW_TOKEN);
  expect(serialized).not.toContain('shpat_');
};

describe('catalog sync status and build eligibility (issue #154)', () => {
  const app = buildTestApp();
  let storeAId: string;
  let storeBId: string;
  let adminAToken: string;
  let adminBToken: string;
  let customerToken: string;

  const connectStore = async (storeId: string, shop: string) => {
    await Store.updateOne(
      { _id: storeId },
      {
        $set: {
          'shopify.isConnected': true,
          'shopify.shop': shop,
          'shopify.scope': 'read_products',
          'shopify.connectedAt': new Date('2026-09-23T00:00:00.000Z'),
        },
      }
    );
  };

  beforeEach(async () => {
    performFullSyncMock.mockReset();
    performFullSyncMock.mockResolvedValue(successResult);

    const [storeA, storeB] = await Promise.all([
      Store.create({ name: 'Catalog Store A', slug: 'catalog-store-a', shopify: {} }),
      Store.create({ name: 'Catalog Store B', slug: 'catalog-store-b', shopify: {} }),
    ]);
    storeAId = storeA._id.toString();
    storeBId = storeB._id.toString();

    const [adminA, adminB, customer] = await Promise.all([
      User.create({
        name: 'Catalog Admin A',
        email: 'catalog-admin-a@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: storeA._id,
      }),
      User.create({
        name: 'Catalog Admin B',
        email: 'catalog-admin-b@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: storeB._id,
      }),
      User.create({
        name: 'Catalog Customer',
        email: 'catalog-customer@example.com',
        password: 'password123',
        role: 'customer',
        isActive: true,
        storeId: storeA._id,
      }),
    ]);

    adminAToken = generateToken(adminA._id.toString());
    adminBToken = generateToken(adminB._id.toString());
    customerToken = generateToken(customer._id.toString());
  });

  test('redacts token-like text and drops non-error payloads', () => {
    expect(toSafeSyncErrorSummary(new Error(`failed ${RAW_TOKEN} Bearer abc.def`))).toBe(
      'failed [redacted] Bearer [redacted]'
    );
    expect(toSafeSyncErrorSummary({ accessToken: RAW_TOKEN })).toBe(
      'Catalog sync failed. Use Sync again.'
    );
    expect(toSafeSyncErrorSummary(new Error('x'.repeat(400))).length).toBeLessThanOrEqual(180);
  });

  test('shop change reset only applies when the connected shop domain changes', () => {
    expect(catalogSyncShopChangeUpdate(SHOP_A, SHOP_A, SHOP_A)).toBeNull();
    expect(catalogSyncShopChangeUpdate(undefined, undefined, SHOP_A)).toBeNull();

    const changed = catalogSyncShopChangeUpdate(SHOP_A, SHOP_A, SHOP_B);
    expect(changed?.set['catalogSync.status']).toBe('idle');
    expect(changed?.set['catalogSync.shop']).toBe(SHOP_B);
    expect(changed?.unset['catalogSync.lastSucceededAt']).toBe('');
  });

  test('Sync again moves idle to succeeded and records build eligibility for that store only', async () => {
    await connectStore(storeAId, SHOP_A);

    const idle = await request(app)
      .get('/api/v1/shopify/sync')
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(idle.status).toBe(200);
    expect(idle.body.data.status).toBe('idle');
    expect(idle.body.data.storeId).toBe(storeAId);
    expect(idle.body.data.primaryAction).toBe('Sync again');
    expect(idle.body.data.eligibleForBuild).toBe(false);
    expect(idle.body.data.eligibilityCode).toBe('BUILD_NOT_ELIGIBLE');
    expect(idle.body.data.eligibilityReason).toBe('catalog_sync_not_succeeded');

    const synced = await request(app)
      .post('/api/v1/shopify/sync')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ storeId: storeBId });

    expect(synced.status).toBe(200);
    expect(synced.body.success).toBe(true);
    expect(synced.body.data.status).toBe('succeeded');
    expect(synced.body.data.storeId).toBe(storeAId);
    expect(synced.body.data.shop).toBe(SHOP_A);
    expect(synced.body.data.startedAt).toEqual(expect.any(String));
    expect(synced.body.data.finishedAt).toEqual(expect.any(String));
    expect(synced.body.data.lastSucceededAt).toEqual(expect.any(String));
    expect(synced.body.data.errorSummary).toBeNull();
    expect(synced.body.data.eligibleForBuild).toBe(true);
    expect(synced.body.data.stats.productsSync).toBe(4);
    expect(synced.body.data.primaryAction).toBe('Sync again');
    expectNoToken(synced.body);
    expect(performFullSyncMock).toHaveBeenCalledTimes(1);
    expect(performFullSyncMock).toHaveBeenCalledWith(storeAId);

    const storedA = await Store.findById(storeAId).select('catalogSync');
    expect(storedA?.catalogSync?.status).toBe('succeeded');
    const storedB = await Store.findById(storeBId).select('catalogSync');
    expect(storedB?.catalogSync?.status).toBeUndefined();

    const other = await request(app)
      .get('/api/v1/shopify/sync')
      .set('Authorization', `Bearer ${adminBToken}`);
    expect(other.body.data.storeId).toBe(storeBId);
    expect(other.body.data.status).toBe('idle');
    expect(other.body.data.shop).toBeNull();
    expect(JSON.stringify(other.body)).not.toContain(SHOP_A);
  });

  test('a failed sync is retried quietly twice, then stored as failed with a safe summary', async () => {
    await connectStore(storeAId, SHOP_A);
    const seen: string[] = [];
    performFullSyncMock.mockImplementation(async () => {
      const current = await Store.findById(storeAId).select('catalogSync.status catalogSync.attempts');
      seen.push(`${current?.catalogSync?.status}:${current?.catalogSync?.attempts}`);
      throw new Error(`Shopify down ${RAW_TOKEN}`);
    });

    const response = await request(app)
      .post('/api/v1/shopify/sync')
      .set('Authorization', `Bearer ${adminAToken}`);

    expect(performFullSyncMock).toHaveBeenCalledTimes(CATALOG_SYNC_MAX_ATTEMPTS);
    expect(seen).toEqual(['syncing:1', 'syncing:2', 'syncing:3']);
    expect(response.status).toBe(502);
    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('CATALOG_SYNC_FAILED');
    expect(response.body.error).toBe('Shopify down [redacted]');
    expect(response.body.data.status).toBe('failed');
    expect(response.body.data.errorSummary).toBe('Shopify down [redacted]');
    expect(response.body.data.attempts).toBe(CATALOG_SYNC_MAX_ATTEMPTS);
    expect(response.body.data.finishedAt).toEqual(expect.any(String));
    expect(response.body.data.eligibleForBuild).toBe(false);
    expect(response.body.data.eligibilityReason).toBe('catalog_sync_not_succeeded');
    expectNoToken(response.body);

    const stored = await Store.findById(storeAId).select('catalogSync');
    expect(stored?.catalogSync?.status).toBe('failed');
    expect(stored?.catalogSync?.errorSummary).toBe('Shopify down [redacted]');
  });

  test('a resolved sync that imported zero products and reported errors is a failure', async () => {
    await connectStore(storeAId, SHOP_A);
    performFullSyncMock.mockResolvedValue({
      inProgress: false,
      errors: [`Request failed with status code 401 ${RAW_TOKEN}`],
      stats: { productsSync: 0, customersSync: 0, ordersSync: 0 },
    });

    const response = await request(app)
      .post('/api/v1/shopify/sync')
      .set('Authorization', `Bearer ${adminAToken}`);

    expect(performFullSyncMock).toHaveBeenCalledTimes(CATALOG_SYNC_MAX_ATTEMPTS);
    expect(response.status).toBe(502);
    expect(response.body.data.status).toBe('failed');
    expect(response.body.data.eligibleForBuild).toBe(false);
    expect(response.body.data.errorSummary).toBe('Request failed with status code 401 [redacted]');
    expectNoToken(response.body);

    const eligibility = await getBuildEligibility(storeAId);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toBe('catalog_sync_not_succeeded');
  });

  test('an empty catalog with no errors succeeds, and partial product errors still succeed', async () => {
    await connectStore(storeAId, SHOP_A);
    performFullSyncMock.mockResolvedValue({
      inProgress: false,
      errors: [],
      stats: { productsSync: 0, customersSync: 0, ordersSync: 0 },
    });

    const emptyCatalog = await request(app)
      .post('/api/v1/shopify/sync')
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(emptyCatalog.status).toBe(200);
    expect(emptyCatalog.body.data.status).toBe('succeeded');
    expect(emptyCatalog.body.data.eligibleForBuild).toBe(true);
    expect(performFullSyncMock).toHaveBeenCalledTimes(1);

    performFullSyncMock.mockResolvedValue({
      inProgress: false,
      errors: ['Failed to sync product 9: validation'],
      stats: { productsSync: 2, customersSync: 0, ordersSync: 0 },
    });
    const partial = await request(app)
      .post('/api/v1/shopify/sync')
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(partial.status).toBe(200);
    expect(partial.body.data.status).toBe('succeeded');
    expect(partial.body.data.errorSummary).toBeNull();
    expect(partial.body.data.eligibleForBuild).toBe(true);
  });

  test('a later success after quiet retries is succeeded and never persisted as failed', async () => {
    await connectStore(storeAId, SHOP_A);
    let calls = 0;
    performFullSyncMock.mockImplementation(async () => {
      calls += 1;
      const current = await Store.findById(storeAId).select('catalogSync.status');
      expect(current?.catalogSync?.status).toBe('syncing');
      if (calls < CATALOG_SYNC_MAX_ATTEMPTS) {
        throw new Error('temporary failure');
      }
      return successResult;
    });

    const response = await request(app)
      .post('/api/v1/shopify/sync')
      .set('Authorization', `Bearer ${adminAToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('succeeded');
    expect(response.body.data.attempts).toBe(CATALOG_SYNC_MAX_ATTEMPTS);
    expect(response.body.data.errorSummary).toBeNull();
    expect(response.body.data.eligibleForBuild).toBe(true);

    const stored = await Store.findById(storeAId).select('catalogSync');
    expect(stored?.catalogSync?.status).toBe('succeeded');
    expect(stored?.catalogSync?.errorSummary).toBeUndefined();
  });

  test('Sync again while a fresh sync is running does not start a second run', async () => {
    await connectStore(storeAId, SHOP_A);
    await Store.updateOne(
      { _id: storeAId },
      {
        $set: {
          'catalogSync.status': 'syncing',
          'catalogSync.shop': SHOP_A,
          'catalogSync.startedAt': new Date(),
          'catalogSync.attempts': 1,
        },
      }
    );

    const response = await request(app)
      .post('/api/v1/shopify/sync')
      .set('Authorization', `Bearer ${adminAToken}`);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CATALOG_SYNC_IN_PROGRESS');
    expect(response.body.data.status).toBe('syncing');
    expect(response.body.data.storeId).toBe(storeAId);
    expect(performFullSyncMock).not.toHaveBeenCalled();
  });

  test('a stale syncing record can be claimed by Sync again', async () => {
    await connectStore(storeAId, SHOP_A);
    await Store.updateOne(
      { _id: storeAId },
      {
        $set: {
          'catalogSync.status': 'syncing',
          'catalogSync.shop': SHOP_A,
          'catalogSync.startedAt': new Date(Date.now() - CATALOG_SYNC_STALE_AFTER_MS - 1000),
          'catalogSync.attempts': 1,
        },
      }
    );

    const response = await request(app)
      .post('/api/v1/shopify/sync')
      .set('Authorization', `Bearer ${adminAToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('succeeded');
    expect(performFullSyncMock).toHaveBeenCalledTimes(1);
  });

  test('disconnect and a different shop both block build eligibility', async () => {
    await connectStore(storeAId, SHOP_A);
    await syncCatalogForStore(storeAId);
    await expect(getBuildEligibility(storeAId)).resolves.toEqual(
      expect.objectContaining({ eligible: true, code: 'BUILD_ELIGIBLE', reason: null })
    );

    await Store.updateOne({ _id: storeAId }, { $set: { 'shopify.isConnected': false } });
    const disconnected = await getBuildEligibility(storeAId);
    expect(disconnected.eligible).toBe(false);
    expect(disconnected.reason).toBe('shopify_not_connected');
    await expect(assertBuildEligible(storeAId)).rejects.toBeInstanceOf(BuildNotEligibleError);

    await Store.updateOne(
      { _id: storeAId },
      { $set: { 'shopify.isConnected': true, 'shopify.shop': SHOP_B } }
    );
    const otherShop = await getBuildEligibility(storeAId);
    expect(otherShop.eligible).toBe(false);
    expect(otherShop.reason).toBe('catalog_sync_not_succeeded');

    try {
      await assertBuildEligible(storeAId);
      throw new Error('expected build rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(BuildNotEligibleError);
      const body = buildEligibilityErrorBody(error as BuildNotEligibleError);
      expect(body).toEqual({
        success: false,
        error: 'Sync the catalog successfully before requesting a build. Use Sync again.',
        code: 'BUILD_NOT_ELIGIBLE',
        reason: 'catalog_sync_not_succeeded',
      });
      expect((error as BuildNotEligibleError).statusCode).toBe(409);
    }
  });

  test('a failed run stays ineligible even when an older success timestamp remains', async () => {
    await connectStore(storeAId, SHOP_A);
    await Store.updateOne(
      { _id: storeAId },
      {
        $set: {
          catalogSync: {
            status: 'failed',
            shop: SHOP_A,
            lastSucceededAt: new Date('2026-09-01T00:00:00.000Z'),
            finishedAt: new Date('2026-09-23T00:00:00.000Z'),
            errorSummary: 'Catalog sync failed. Use Sync again.',
            attempts: 3,
          },
        },
      }
    );

    const eligibility = await getBuildEligibility(storeAId);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.code).toBe('BUILD_NOT_ELIGIBLE');
    expect(eligibility.reason).toBe('catalog_sync_not_succeeded');
  });

  test('one store cannot read another store sync failure', async () => {
    await connectStore(storeBId, SHOP_B);
    await Store.updateOne(
      { _id: storeBId },
      {
        $set: {
          catalogSync: {
            status: 'failed',
            shop: SHOP_B,
            errorSummary: 'beta catalog exploded uniquely',
            attempts: 3,
            finishedAt: new Date(),
          },
        },
      }
    );

    const response = await request(app)
      .get('/api/v1/shopify/sync')
      .set('Authorization', `Bearer ${adminAToken}`)
      .query({ storeId: storeBId });

    expect(response.status).toBe(200);
    expect(response.body.data.storeId).toBe(storeAId);
    expect(response.body.data.status).toBe('idle');
    expect(JSON.stringify(response.body)).not.toContain('beta catalog exploded uniquely');
    expect(JSON.stringify(response.body)).not.toContain(SHOP_B);
  });

  test('customers and anonymous callers cannot read or trigger sync', async () => {
    const customerGet = await request(app)
      .get('/api/v1/shopify/sync')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(customerGet.status).toBe(403);

    const customerPost = await request(app)
      .post('/api/v1/shopify/sync')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(customerPost.status).toBe(403);

    const anonymous = await request(app).get('/api/v1/shopify/sync');
    expect(anonymous.status).toBe(401);
    expect(performFullSyncMock).not.toHaveBeenCalled();
  });

  test('a disconnected store cannot sync, and a missing store is not eligible', async () => {
    const response = await request(app)
      .post('/api/v1/shopify/sync')
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SHOPIFY_NOT_CONNECTED');
    expect(performFullSyncMock).not.toHaveBeenCalled();

    await expect(getBuildEligibility('0'.repeat(24))).rejects.toBeInstanceOf(NotFoundError);
    await expect(assertBuildEligible(storeBId)).rejects.toMatchObject({
      code: 'BUILD_NOT_ELIGIBLE',
      reason: 'shopify_not_connected',
    });
  });

  test('an in-memory sync already in progress does not stick the store in syncing', async () => {
    await connectStore(storeAId, SHOP_A);
    await Store.updateOne(
      { _id: storeAId },
      {
        $set: {
          catalogSync: {
            status: 'succeeded',
            shop: SHOP_A,
            lastSucceededAt: new Date('2026-09-20T00:00:00.000Z'),
            attempts: 1,
          },
        },
      }
    );
    performFullSyncMock.mockRejectedValue(new Error('Sync already in progress'));

    const response = await request(app)
      .post('/api/v1/shopify/sync')
      .set('Authorization', `Bearer ${adminAToken}`);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CATALOG_SYNC_IN_PROGRESS');
    expect(performFullSyncMock).toHaveBeenCalledTimes(1);

    const stored = await Store.findById(storeAId).select('catalogSync');
    expect(stored?.catalogSync?.status).toBe('succeeded');
    expect(stored?.catalogSync?.shop).toBe(SHOP_A);
  });
});
