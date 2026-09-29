import express from 'express';
import { Types } from 'mongoose';
import request from 'supertest';
import User from '../src/models/User';
import Store from '../src/models/Store';
import HomeLayout from '../src/models/HomeLayout';
import StoreAppCredentials from '../src/models/StoreAppCredentials';
import authRoutes from '../src/routes/authRoutes';
import { generateToken } from '../src/utils/jwt';

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', authRoutes);
  return app;
};

const app = buildTestApp();

const createStore = async (
  slug: string,
  name: string,
  branding: { logoUrl?: string; iconUrl?: string } = {}
) => {
  const store = await Store.create({
    name,
    slug,
    shopify: { isConnected: false },
    branding,
  });
  await Store.collection.updateOne(
    { _id: store._id },
    { $set: { 'shopify.accessToken': `shpat_${slug}` } }
  );
  return store;
};

describe('merchant store membership', () => {
  test('login backfills empty membership from storeId and returns the active store', async () => {
    const store = await createStore('legacy-login', 'Legacy Login');
    const user = await User.create({
      name: 'Legacy Merchant',
      email: 'legacy-login@example.com',
      password: 'password123',
      role: 'admin',
      isActive: true,
      isVerified: true,
      storeId: store._id,
    });
    await User.collection.updateOne({ _id: user._id }, { $unset: { storeIds: '' } });

    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'legacy-login@example.com',
      password: 'password123',
    });

    expect(response.status).toBe(200);
    expect(response.body.data.user.storeId).toBe(store._id.toString());
    expect(response.body.data.user.storeIds).toEqual([store._id.toString()]);
    expect(response.body.data.user.storeName).toBe('Legacy Login');

    const saved = await User.findById(user._id);
    expect(saved?.storeIds?.map(id => id.toString())).toEqual([store._id.toString()]);
  });

  test('lists only the caller stores and switches without rotating the access token', async () => {
    const storeA = await createStore('member-a', 'Member A', {
      logoUrl: 'https://cdn.example.com/a-logo.png',
      iconUrl: 'https://cdn.example.com/shpat_hidden',
    });
    const storeB = await createStore('member-b', 'Member B', {
      logoUrl: 'https://cdn.example.com/b-logo.png',
    });
    const storeC = await createStore('other-tenant', 'Other Tenant', {
      logoUrl: 'https://cdn.example.com/c-logo.png',
    });
    const user = await User.create({
      name: 'Switcher',
      email: 'switcher@example.com',
      password: 'password123',
      role: 'admin',
      isActive: true,
      isVerified: true,
      storeId: storeA._id,
      storeIds: [storeA._id, storeB._id],
    });
    const accessToken = generateToken(user._id.toString());

    const listed = await request(app)
      .get('/api/v1/auth/stores')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(listed.status).toBe(200);
    expect(listed.body.data.activeStoreId).toBe(storeA._id.toString());
    expect(listed.body.data.stores).toEqual([
      {
        id: storeA._id.toString(),
        name: 'Member A',
        slug: 'member-a',
        logoUrl: 'https://cdn.example.com/a-logo.png',
      },
      {
        id: storeB._id.toString(),
        name: 'Member B',
        slug: 'member-b',
        logoUrl: 'https://cdn.example.com/b-logo.png',
      },
    ]);
    const listedBody = JSON.stringify(listed.body);
    expect(listedBody).not.toContain(storeC._id.toString());
    expect(listedBody).not.toContain('shpat_');
    expect(listedBody).not.toContain('accessToken');
    expect(listedBody).not.toContain('expo');

    const switched = await request(app)
      .post('/api/v1/auth/stores/switch')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ storeId: storeB._id.toString() });

    expect(switched.status).toBe(200);
    expect(switched.body.data.token).toBeUndefined();
    expect(switched.body.data.refreshToken).toBeUndefined();
    expect(switched.body.data.user.storeId).toBe(storeB._id.toString());
    expect(switched.body.data.user.storeName).toBe('Member B');
    expect(switched.body.data.user.storeIds).toEqual([
      storeA._id.toString(),
      storeB._id.toString(),
    ]);
    expect(JSON.stringify(switched.body)).not.toContain('shpat_');

    const profile = await request(app)
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(profile.status).toBe(200);
    expect(profile.body.data.user.storeId).toBe(storeB._id.toString());
    expect(profile.body.data.user.storeName).toBe('Member B');

    const denied = await request(app)
      .post('/api/v1/auth/stores/switch')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ storeId: storeC._id.toString() });

    expect(denied.status).toBe(403);
    expect(denied.body.message).toBe('Store access denied');
    const still = await User.findById(user._id);
    expect(still?.storeId?.toString()).toBe(storeB._id.toString());

    const invalid = await request(app)
      .post('/api/v1/auth/stores/switch')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ storeId: 'not-a-store' });
    expect(invalid.status).toBe(400);
  });

  test('refresh returns the active storeId after a switch', async () => {
    const storeA = await createStore('refresh-a', 'Refresh A');
    const storeB = await createStore('refresh-b', 'Refresh B');
    await User.create({
      name: 'Refresher',
      email: 'refresher@example.com',
      password: 'password123',
      role: 'moderator',
      isActive: true,
      isVerified: true,
      storeId: storeA._id,
      storeIds: [storeA._id, storeB._id],
    });

    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'refresher@example.com',
      password: 'password123',
    });
    expect(login.status).toBe(200);
    expect(login.body.data.user.storeId).toBe(storeA._id.toString());
    const accessToken = login.body.data.token as string;

    const switched = await request(app)
      .post('/api/v1/auth/stores/switch')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ storeId: storeB._id.toString() });
    expect(switched.status).toBe(200);

    const refreshed = await request(app).post('/api/v1/auth/refresh-token').send({
      refreshToken: login.body.data.refreshToken,
    });

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.user.storeId).toBe(storeB._id.toString());
    expect(refreshed.body.data.user.storeName).toBe('Refresh B');
    expect(refreshed.body.data.user.storeIds).toEqual([
      storeA._id.toString(),
      storeB._id.toString(),
    ]);
  });

  test('a store owner can create another store on the same user', async () => {
    const storeA = await createStore('owner-a', 'Owner A');
    await Store.updateOne(
      { _id: storeA._id },
      {
        $set: {
          'branding.logoUrl': 'https://cdn.example.com/owner-a-only.png',
          'branding.iconUrl': 'https://cdn.example.com/owner-a-icon.png',
          'branding.splashUrl': 'https://cdn.example.com/owner-a-splash.png',
          'branding.primaryColor': '#112233',
          'shopify.shop': 'owner-a.myshopify.com',
          'shopify.isConnected': true,
        },
      }
    );
    await HomeLayout.create({
      storeId: storeA._id.toString(),
      sections: [{ type: 'carousel', position: 0, isVisible: true }],
    });
    await StoreAppCredentials.create({ storeId: storeA._id });
    const owner = await User.create({
      name: 'Owner',
      email: 'owner-create@example.com',
      password: 'password123',
      role: 'super_admin',
      isActive: true,
      isVerified: true,
      isPlatformOperator: false,
      storeId: storeA._id,
    });
    const teammate = await User.create({
      name: 'Teammate',
      email: 'teammate-create@example.com',
      password: 'password123',
      role: 'admin',
      isActive: true,
      isVerified: true,
      storeId: storeA._id,
    });
    await User.collection.updateOne({ _id: owner._id }, { $unset: { storeIds: '' } });
    const ownerToken = generateToken(owner._id.toString());
    const teammateToken = generateToken(teammate._id.toString());

    const denied = await request(app)
      .post('/api/v1/auth/stores')
      .set('Authorization', `Bearer ${teammateToken}`)
      .send({ storeName: 'Second App' });
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post('/api/v1/auth/stores')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ storeName: 'Second App' });

    expect(created.status).toBe(201);
    expect(created.body.data.token).toBeUndefined();
    expect(created.body.data.refreshToken).toBeUndefined();
    expect(created.body.data.store).toMatchObject({
      name: 'Second App',
    });
    expect(created.body.data.store.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(created.body.data.store.id).not.toBe(storeA._id.toString());
    expect(created.body.data.user.storeId).toBe(created.body.data.store.id);
    expect(created.body.data.user.storeIds).toEqual([
      storeA._id.toString(),
      created.body.data.store.id,
    ]);
    expect(created.body.data.user.storeName).toBe('Second App');
    const body = JSON.stringify(created.body);
    expect(body).not.toContain('shpat_');
    expect(body).not.toContain('accessToken');
    expect(body).not.toContain('expo');

    expect(await User.countDocuments({ email: 'owner-create@example.com' })).toBe(1);
    const saved = await User.findById(owner._id);
    expect(saved?.storeId?.toString()).toBe(created.body.data.store.id);
    expect(saved?.storeIds?.map(id => id.toString())).toEqual([
      storeA._id.toString(),
      created.body.data.store.id,
    ]);

    const fresh = await Store.findById(created.body.data.store.id).select('+shopify.accessToken');
    expect(fresh?.shopify.isConnected).toBe(false);
    expect(fresh?.shopify.accessToken).toBeUndefined();
    expect(fresh?.shopify.shop).toBeUndefined();
    expect(fresh?.branding?.logoUrl).toBeUndefined();
    expect(fresh?.branding?.iconUrl).toBeUndefined();
    expect(fresh?.branding?.splashUrl).toBeUndefined();
    expect(fresh?.branding?.primaryColor).not.toBe('#112233');
    expect(await HomeLayout.countDocuments({ storeId: created.body.data.store.id })).toBe(0);
    expect(await StoreAppCredentials.countDocuments({ storeId: fresh?._id })).toBe(0);
    expect(await HomeLayout.countDocuments({ storeId: storeA._id.toString() })).toBe(1);
    expect(await StoreAppCredentials.countDocuments({ storeId: storeA._id })).toBe(1);

    const profile = await request(app)
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(profile.status).toBe(200);
    expect(profile.body.data.user.storeId).toBe(created.body.data.store.id);

    const blocked = await request(app)
      .patch('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ storeId: storeA._id.toString() });
    expect(blocked.status).toBe(400);
    expect((await User.findById(owner._id))?.storeId?.toString()).toBe(created.body.data.store.id);
  });

  test('create rejects an empty name, a full account, and a non-owner', async () => {
    const store = await createStore('cap-store', 'Cap Store');
    const owner = await User.create({
      name: 'Capped Owner',
      email: 'capped-owner@example.com',
      password: 'password123',
      role: 'super_admin',
      isActive: true,
      isVerified: true,
      storeId: store._id,
    });
    const noStore = await User.create({
      name: 'No Store',
      email: 'no-store-owner@example.com',
      password: 'password123',
      role: 'super_admin',
      isActive: true,
      isVerified: true,
    });
    const moderator = await User.create({
      name: 'Moderator',
      email: 'moderator-create@example.com',
      password: 'password123',
      role: 'moderator',
      isActive: true,
      isVerified: true,
      storeId: store._id,
    });
    const ownerToken = generateToken(owner._id.toString());

    const empty = await request(app)
      .post('/api/v1/auth/stores')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: '   ' });
    expect(empty.status).toBe(400);
    expect(empty.body.message).toBe('Store name is required');

    const missing = await request(app)
      .post('/api/v1/auth/stores')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    expect(missing.status).toBe(400);

    const stranger = await request(app)
      .post('/api/v1/auth/stores')
      .set('Authorization', `Bearer ${generateToken(noStore._id.toString())}`)
      .send({ name: 'Orphan App' });
    expect(stranger.status).toBe(403);

    const staff = await request(app)
      .post('/api/v1/auth/stores')
      .set('Authorization', `Bearer ${generateToken(moderator._id.toString())}`)
      .send({ name: 'Staff App' });
    expect(staff.status).toBe(403);

    const membership = [
      store._id,
      ...Array.from({ length: 9 }, () => new Types.ObjectId()),
    ];
    await User.updateOne({ _id: owner._id }, { $set: { storeIds: membership } });

    const capped = await request(app)
      .post('/api/v1/auth/stores')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Eleventh App' });
    expect(capped.status).toBe(400);
    expect(capped.body.message).toBe('A merchant account can have at most 10 stores');
    expect(await Store.countDocuments({ name: 'Eleventh App' })).toBe(0);
    expect((await User.findById(owner._id))?.storeId?.toString()).toBe(store._id.toString());
  });
});
