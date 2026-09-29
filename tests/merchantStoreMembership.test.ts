import express from 'express';
import request from 'supertest';
import User from '../src/models/User';
import Store from '../src/models/Store';
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
});
