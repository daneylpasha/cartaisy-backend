import express from 'express';
import { Types } from 'mongoose';
import request from 'supertest';
import User from '../src/models/User';
import Store from '../src/models/Store';
import HomeLayout from '../src/models/HomeLayout';
import Order from '../src/models/Order';
import StoreAppCredentials from '../src/models/StoreAppCredentials';
import authRoutes from '../src/routes/authRoutes';
import { requireOwnedStoreContext, requireOwnedStoreParam } from '../src/middleware/storeOwnership';
import * as shopifyOAuth from '../src/services/shopifyOAuthService';
import { AuthenticatedRequest } from '../src/types';
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

  test('a store owner can remove a membership store, and the last store stays', async () => {
    const keep = await createStore('keep-app', 'Keep App');
    const extra = await createStore('extra-app', 'Extra App');
    const other = await createStore('foreign-app', 'Foreign App');
    await HomeLayout.create({
      storeId: extra._id.toString(),
      sections: [{ type: 'carousel', position: 0, isVisible: true }],
    });
    await StoreAppCredentials.create({ storeId: extra._id });
    await Order.create({
      storeId: extra._id,
      orderNumber: `ORDER-${new Types.ObjectId().toString()}`,
      customer: new Types.ObjectId(),
      email: 'buyer-extra@example.com',
      lineItems: [{ quantity: 1, price: 10, title: 'Scoped Product' }],
      subtotalPrice: 10,
      totalTax: 0,
      totalPrice: 10,
      currency: 'USD',
      shippingAddress: {
        firstName: 'Test',
        lastName: 'Buyer',
        address1: '123 Test Street',
        city: 'Test City',
        province: 'CA',
        country: 'US',
        zip: '94105',
      },
      mobileStatus: { current: 'placed' },
    });
    const owner = await User.create({
      name: 'Owner',
      email: 'owner-delete@example.com',
      password: 'password123',
      role: 'super_admin',
      isActive: true,
      isVerified: true,
      storeId: extra._id,
      storeIds: [keep._id, extra._id],
    });
    const teammate = await User.create({
      name: 'Teammate',
      email: 'teammate-delete@example.com',
      password: 'password123',
      role: 'admin',
      isActive: true,
      isVerified: true,
      storeId: extra._id,
      storeIds: [extra._id],
    });
    const staff = await User.create({
      name: 'Staff',
      email: 'staff-delete@example.com',
      password: 'password123',
      role: 'admin',
      isActive: true,
      isVerified: true,
      storeId: keep._id,
      storeIds: [keep._id, extra._id],
    });
    const stranger = await User.create({
      name: 'Stranger',
      email: 'stranger-delete@example.com',
      password: 'password123',
      role: 'super_admin',
      isActive: true,
      isVerified: true,
      storeId: other._id,
      storeIds: [other._id],
    });
    const ownerToken = generateToken(owner._id.toString());
    const extraId = extra._id.toString();

    const mismatch = await request(app)
      .delete(`/api/v1/auth/stores/${extraId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Wrong name' });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.code).toBe('NAME_MISMATCH');
    const stillThere = await Store.findById(extra._id).select('+shopify.accessToken');
    expect(stillThere?.isActive).not.toBe(false);
    expect(stillThere?.shopify.accessToken).toBe('shpat_extra-app');

    const missingName = await request(app)
      .delete(`/api/v1/auth/stores/${extraId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    expect(missingName.status).toBe(400);
    expect(missingName.body.code).toBe('NAME_MISMATCH');

    const deniedStaff = await request(app)
      .delete(`/api/v1/auth/stores/${extraId}`)
      .set('Authorization', `Bearer ${generateToken(staff._id.toString())}`)
      .send({ name: 'Extra App' });
    expect(deniedStaff.status).toBe(403);
    expect(deniedStaff.body.code).toBe('NOT_OWNER');

    const deniedStranger = await request(app)
      .delete(`/api/v1/auth/stores/${extraId}`)
      .set('Authorization', `Bearer ${generateToken(stranger._id.toString())}`)
      .send({ name: 'Extra App' });
    expect(deniedStranger.status).toBe(403);
    expect(deniedStranger.body.message).toBe('Store access denied');
    expect(deniedStranger.body.code).toBeUndefined();

    const invalid = await request(app)
      .delete('/api/v1/auth/stores/not-a-store')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Extra App' });
    expect(invalid.status).toBe(400);

    const removed = await request(app)
      .delete(`/api/v1/auth/stores/${extraId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: '  Extra App  ' });

    expect(removed.status).toBe(200);
    expect(removed.body.message).toBe('Store removed');
    expect(removed.body.data.token).toBeUndefined();
    expect(removed.body.data.refreshToken).toBeUndefined();
    expect(removed.body.data.removedStoreId).toBe(extraId);
    expect(removed.body.data.user.storeId).toBe(keep._id.toString());
    expect(removed.body.data.user.storeIds).toEqual([keep._id.toString()]);
    expect(removed.body.data.user.storeName).toBe('Keep App');
    const removedBody = JSON.stringify(removed.body);
    expect(removedBody).not.toContain('shpat_');
    expect(removedBody).not.toContain('accessToken');
    expect(removedBody).not.toContain('expo');

    const extraAfter = await Store.findById(extra._id).select('+shopify.accessToken');
    expect(extraAfter?.isActive).toBe(false);
    expect(extraAfter?.shopify.isConnected).toBe(false);
    expect(extraAfter?.shopify.accessToken).toBeUndefined();
    expect(extraAfter?.name).toBe('Extra App');
    expect(await Store.countDocuments({ _id: extra._id })).toBe(1);
    expect(await HomeLayout.countDocuments({ storeId: extra._id.toString() })).toBe(1);
    expect(await StoreAppCredentials.countDocuments({ storeId: extra._id })).toBe(1);
    expect(await Order.countDocuments({ storeId: extra._id })).toBe(1);

    const keepAfter = await Store.findById(keep._id).select('+shopify.accessToken');
    expect(keepAfter?.isActive).toBe(true);
    expect(keepAfter?.shopify.accessToken).toBe('shpat_keep-app');
    const otherAfter = await Store.findById(other._id).select('+shopify.accessToken');
    expect(otherAfter?.isActive).toBe(true);
    expect(otherAfter?.shopify.accessToken).toBe('shpat_foreign-app');

    const savedOwner = await User.findById(owner._id);
    expect(savedOwner?.storeId?.toString()).toBe(keep._id.toString());
    expect(savedOwner?.storeIds?.map(id => id.toString())).toEqual([keep._id.toString()]);
    const savedTeammate = await User.findById(teammate._id);
    expect(savedTeammate).toBeTruthy();
    expect(savedTeammate?.isActive).toBe(false);
    expect(savedTeammate?.storeId).toBeFalsy();
    expect(savedTeammate?.storeIds ?? []).toHaveLength(0);
    const savedStaff = await User.findById(staff._id);
    expect(savedStaff?.isActive).toBe(true);
    expect(savedStaff?.storeId?.toString()).toBe(keep._id.toString());
    expect(savedStaff?.storeIds?.map(id => id.toString())).toEqual([keep._id.toString()]);
    expect(await User.countDocuments({ email: 'owner-delete@example.com' })).toBe(1);
    expect(await User.countDocuments({ email: 'teammate-delete@example.com' })).toBe(1);

    const profile = await request(app)
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(profile.status).toBe(200);
    expect(profile.body.data.user.storeId).toBe(keep._id.toString());
    expect(profile.body.data.token).toBeUndefined();

    const listed = await request(app)
      .get('/api/v1/auth/stores')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.activeStoreId).toBe(keep._id.toString());
    expect(listed.body.data.stores.map((store: { id: string }) => store.id)).toEqual([
      keep._id.toString(),
    ]);

    const last = await request(app)
      .delete(`/api/v1/auth/stores/${keep._id.toString()}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Keep App' });
    expect(last.status).toBe(409);
    expect(last.body.code).toBe('LAST_STORE');
    expect((await Store.findById(keep._id))?.isActive).toBe(true);
    expect((await User.findById(owner._id))?.storeId?.toString()).toBe(keep._id.toString());
    expect((await User.findById(stranger._id))?.storeId?.toString()).toBe(other._id.toString());
  });

  test('a member whose only store is removed is deactivated and cannot open another tenant', async () => {
    const keep = await createStore('second-owner-keep', 'Second Owner Keep');
    const extra = await createStore('second-owner-extra', 'Second Owner Extra');
    const foreign = await createStore('second-owner-foreign', 'Second Owner Foreign');
    await HomeLayout.create({
      storeId: extra._id.toString(),
      sections: [{ type: 'carousel', position: 0, isVisible: true }],
    });
    await StoreAppCredentials.create({ storeId: extra._id });
    await Order.create({
      storeId: extra._id,
      orderNumber: `ORDER-${new Types.ObjectId().toString()}`,
      customer: new Types.ObjectId(),
      email: 'buyer-second-owner@example.com',
      lineItems: [{ quantity: 1, price: 10, title: 'Scoped Product' }],
      subtotalPrice: 10,
      totalTax: 0,
      totalPrice: 10,
      currency: 'USD',
      shippingAddress: {
        firstName: 'Test',
        lastName: 'Buyer',
        address1: '123 Test Street',
        city: 'Test City',
        province: 'CA',
        country: 'US',
        zip: '94105',
      },
      mobileStatus: { current: 'placed' },
      paymentStatus: 'paid',
    });
    const caller = await User.create({
      name: 'Caller',
      email: 'caller-second-owner@example.com',
      password: 'password123',
      role: 'super_admin',
      isActive: true,
      isVerified: true,
      storeId: extra._id,
      storeIds: [keep._id, extra._id],
    });
    const secondOwner = await User.create({
      name: 'Second Owner',
      email: 'second-owner-only@example.com',
      password: 'password123',
      role: 'super_admin',
      isActive: true,
      isVerified: true,
      isPlatformOperator: false,
      storeId: extra._id,
      storeIds: [extra._id],
    });
    const callerToken = generateToken(caller._id.toString());
    const secondToken = generateToken(secondOwner._id.toString());

    const removed = await request(app)
      .delete(`/api/v1/auth/stores/${extra._id.toString()}`)
      .set('Authorization', `Bearer ${callerToken}`)
      .send({ name: 'Second Owner Extra' });

    expect(removed.status).toBe(200);
    expect(removed.body.data.user.storeId).toBe(keep._id.toString());
    expect(removed.body.data.user.storeIds).toEqual([keep._id.toString()]);

    const savedCaller = await User.findById(caller._id);
    expect(savedCaller?.isActive).toBe(true);
    expect(savedCaller?.storeIds?.map(id => id.toString())).toEqual([keep._id.toString()]);

    const savedSecond = await User.findById(secondOwner._id);
    expect(savedSecond).toBeTruthy();
    expect(savedSecond?.isActive).toBe(false);
    expect(savedSecond?.storeId).toBeFalsy();
    expect(savedSecond?.storeIds ?? []).toHaveLength(0);
    expect(await User.countDocuments({ email: 'second-owner-only@example.com' })).toBe(1);
    expect(await Store.countDocuments({ _id: extra._id })).toBe(1);
    expect(await HomeLayout.countDocuments({ storeId: extra._id.toString() })).toBe(1);
    expect(await StoreAppCredentials.countDocuments({ storeId: extra._id })).toBe(1);
    expect(await Order.countDocuments({ storeId: extra._id })).toBe(1);

    const profile = await request(app)
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${secondToken}`);
    expect(profile.status).toBe(403);
    expect(profile.body.message).toBe('Your account has been deactivated. Please contact support.');

    const ownershipReq = {
      params: { storeId: foreign._id.toString() },
      query: {},
      body: {},
      headers: {},
      user: {
        _id: savedSecond?._id,
        id: savedSecond?._id.toString(),
        storeId: savedSecond?.storeId,
        storeIds: savedSecond?.storeIds,
        email: savedSecond?.email,
        role: savedSecond?.role,
        name: savedSecond?.name,
        isActive: savedSecond?.isActive,
        isVerified: savedSecond?.isVerified,
        isPlatformOperator: false,
      },
    } as AuthenticatedRequest;
    const ownershipRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();

    await requireOwnedStoreParam()(ownershipReq, ownershipRes as any, next);
    expect(next).not.toHaveBeenCalled();
    expect(ownershipRes.status).toHaveBeenCalledWith(403);
    expect(ownershipRes.json).toHaveBeenCalledWith({
      success: false,
      error: 'User account is inactive',
    });

    next.mockClear();
    ownershipRes.status.mockClear();
    ownershipRes.json.mockClear();
    await requireOwnedStoreContext()(ownershipReq, ownershipRes as any, next);
    expect(next).not.toHaveBeenCalled();
    expect(ownershipRes.status).toHaveBeenCalledWith(403);
    expect(ownershipRes.json).toHaveBeenCalledWith({
      success: false,
      error: 'User account is inactive',
    });

    const last = await request(app)
      .delete(`/api/v1/auth/stores/${keep._id.toString()}`)
      .set('Authorization', `Bearer ${callerToken}`)
      .send({ name: 'Second Owner Keep' });
    expect(last.status).toBe(409);
    expect(last.body.code).toBe('LAST_STORE');
    expect((await User.findById(caller._id))?.isActive).toBe(true);
    expect((await User.findById(caller._id))?.storeId?.toString()).toBe(keep._id.toString());
    expect((await Store.findById(keep._id))?.isActive).toBe(true);
  });

  test('switching the active store onto an email collision leaves the store unchanged', async () => {
    const keep = await createStore('conflict-keep', 'Conflict Keep');
    const extra = await createStore('conflict-extra', 'Conflict Extra');
    const owner = await User.create({
      name: 'Owner',
      email: 'owner-conflict@example.com',
      password: 'password123',
      role: 'super_admin',
      isActive: true,
      isVerified: true,
      storeId: extra._id,
      storeIds: [keep._id, extra._id],
    });
    await User.create({
      name: 'Other account',
      email: 'owner-conflict@example.com',
      password: 'password123',
      role: 'admin',
      isActive: true,
      isVerified: true,
      storeId: keep._id,
      storeIds: [keep._id],
    });

    const response = await request(app)
      .delete(`/api/v1/auth/stores/${extra._id.toString()}`)
      .set('Authorization', `Bearer ${generateToken(owner._id.toString())}`)
      .send({ name: 'Conflict Extra' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ACTIVE_STORE_CONFLICT');
    const extraAfter = await Store.findById(extra._id).select('+shopify.accessToken');
    expect(extraAfter?.isActive).not.toBe(false);
    expect(extraAfter?.shopify.accessToken).toBe('shpat_conflict-extra');
    expect(extraAfter?.shopify.isConnected).toBe(false);
    const savedOwner = await User.findById(owner._id);
    expect(savedOwner?.storeId?.toString()).toBe(extra._id.toString());
    expect(savedOwner?.storeIds?.map(id => id.toString())).toEqual([
      keep._id.toString(),
      extra._id.toString(),
    ]);
  });

  test('refuses removal when another member cannot leave the store', async () => {
    const keep = await createStore('member-conflict-keep', 'Member Conflict Keep');
    const extra = await createStore('member-conflict-extra', 'Member Conflict Extra');
    const owner = await User.create({
      name: 'Owner',
      email: 'owner-member-conflict@example.com',
      password: 'password123',
      role: 'super_admin',
      isActive: true,
      isVerified: true,
      storeId: extra._id,
      storeIds: [keep._id, extra._id],
    });
    const teammate = await User.create({
      name: 'Teammate',
      email: 'teammate-member-conflict@example.com',
      password: 'password123',
      role: 'admin',
      isActive: true,
      isVerified: true,
      storeId: extra._id,
      storeIds: [extra._id],
    });
    await User.create({
      name: 'Same email',
      email: 'teammate-member-conflict@example.com',
      password: 'password123',
      role: 'customer',
      isActive: true,
      isVerified: true,
    });

    const response = await request(app)
      .delete(`/api/v1/auth/stores/${extra._id.toString()}`)
      .set('Authorization', `Bearer ${generateToken(owner._id.toString())}`)
      .send({ name: 'Member Conflict Extra' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ACTIVE_STORE_CONFLICT');
    const extraAfter = await Store.findById(extra._id).select('+shopify.accessToken');
    expect(extraAfter?.isActive).toBe(true);
    expect(extraAfter?.shopify.accessToken).toBe('shpat_member-conflict-extra');
    const savedOwner = await User.findById(owner._id);
    expect(savedOwner?.storeId?.toString()).toBe(extra._id.toString());
    expect(savedOwner?.storeIds?.map(id => id.toString())).toEqual([
      keep._id.toString(),
      extra._id.toString(),
    ]);
    const savedTeammate = await User.findById(teammate._id);
    expect(savedTeammate?.storeId?.toString()).toBe(extra._id.toString());
    expect(savedTeammate?.storeIds?.map(id => id.toString())).toEqual([extra._id.toString()]);
  });

  test('moves an active store that was missing from storeIds', async () => {
    const keep = await createStore('legacy-keep', 'Legacy Keep');
    const extra = await createStore('legacy-extra', 'Legacy Extra');
    const owner = await User.create({
      name: 'Owner',
      email: 'owner-legacy-active@example.com',
      password: 'password123',
      role: 'super_admin',
      isActive: true,
      isVerified: true,
      storeId: keep._id,
      storeIds: [keep._id, extra._id],
    });
    const legacy = await User.create({
      name: 'Legacy',
      email: 'legacy-active@example.com',
      password: 'password123',
      role: 'admin',
      isActive: true,
      isVerified: true,
      storeId: extra._id,
      storeIds: [keep._id],
    });

    const response = await request(app)
      .delete(`/api/v1/auth/stores/${extra._id.toString()}`)
      .set('Authorization', `Bearer ${generateToken(owner._id.toString())}`)
      .send({ name: 'Legacy Extra' });

    expect(response.status).toBe(200);
    const savedLegacy = await User.findById(legacy._id);
    expect(savedLegacy?.storeId?.toString()).toBe(keep._id.toString());
    expect(savedLegacy?.storeIds?.map(id => id.toString())).toEqual([keep._id.toString()]);
    expect((await Store.findById(extra._id))?.isActive).toBe(false);
  });

  test('a failed Shopify disconnect leaves membership unchanged', async () => {
    const keep = await createStore('disconnect-keep', 'Disconnect Keep');
    const extra = await createStore('disconnect-extra', 'Disconnect Extra');
    const owner = await User.create({
      name: 'Owner',
      email: 'owner-disconnect@example.com',
      password: 'password123',
      role: 'super_admin',
      isActive: true,
      isVerified: true,
      storeId: extra._id,
      storeIds: [keep._id, extra._id],
    });
    const disconnectSpy = jest
      .spyOn(shopifyOAuth, 'disconnect')
      .mockRejectedValue(new Error('revoke failed'));

    const response = await request(app)
      .delete(`/api/v1/auth/stores/${extra._id.toString()}`)
      .set('Authorization', `Bearer ${generateToken(owner._id.toString())}`)
      .send({ name: 'Disconnect Extra' });

    expect(response.status).toBe(502);
    expect(response.body.code).toBe('SHOPIFY_DISCONNECT_FAILED');
    expect(disconnectSpy).toHaveBeenCalledWith(extra._id.toString());
    const extraAfter = await Store.findById(extra._id).select('+shopify.accessToken');
    expect(extraAfter?.isActive).not.toBe(false);
    expect(extraAfter?.shopify.accessToken).toBe('shpat_disconnect-extra');
    const savedOwner = await User.findById(owner._id);
    expect(savedOwner?.storeId?.toString()).toBe(extra._id.toString());
    expect(savedOwner?.storeIds?.map(id => id.toString())).toEqual([
      keep._id.toString(),
      extra._id.toString(),
    ]);
  });
});
