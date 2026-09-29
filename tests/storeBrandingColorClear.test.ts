import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import storeBrandingRoutes from '../src/routes/storeBrandingRoutes';
import storeConfigRoutes from '../src/routes/storeConfigRoutes';
import User from '../src/models/User';
import Store from '../src/models/Store';
import { generateToken } from '../src/utils/jwt';

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin', storeBrandingRoutes);
  app.use('/api/v1/store', storeConfigRoutes);
  return app;
};

describe('store branding color clear', () => {
  const app = buildTestApp();
  let storeId: Types.ObjectId;
  let otherStoreId: Types.ObjectId;
  let adminToken: string;

  beforeEach(async () => {
    const [store, otherStore] = await Promise.all([
      Store.create({
        name: 'Color Clear Store',
        slug: 'color-clear-store',
        shopify: { isConnected: false },
        branding: {
          primaryColor: '#112233',
          secondaryColor: '#ABCDEF',
          logoUrl: 'https://cdn.example.com/logo.png',
        },
      }),
      Store.create({
        name: 'Other Color Store',
        slug: 'other-color-store',
        shopify: {},
        branding: { primaryColor: '#010203', secondaryColor: '#040506' },
      }),
    ]);
    storeId = store._id;
    otherStoreId = otherStore._id;

    const admin = await User.create({
      name: 'Color Admin',
      email: 'color-admin@example.com',
      password: 'password123',
      role: 'admin',
      isActive: true,
      storeId,
    });
    adminToken = generateToken(admin._id.toString());
  });

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  it('clears one or both colors, keeps the clear after a later save, and omits them from store config', async () => {
    const clearPrimary = await request(app)
      .patch(`/api/v1/admin/stores/${storeId}/branding`)
      .set(auth())
      .send({ primaryColor: null });

    expect(clearPrimary.status).toBe(200);
    expect(clearPrimary.body.data.primaryColor).toBeNull();
    expect(clearPrimary.body.data.secondaryColor).toBe('#ABCDEF');
    expect(clearPrimary.body.data.logoUrl).toBe('https://cdn.example.com/logo.png');

    const clearSecondary = await request(app)
      .patch(`/api/v1/admin/stores/${storeId}/branding`)
      .set(auth())
      .send({ secondaryColor: null });

    expect(clearSecondary.status).toBe(200);
    expect(clearSecondary.body.data.primaryColor).toBeNull();
    expect(clearSecondary.body.data.secondaryColor).toBeNull();

    const branding = await request(app)
      .get(`/api/v1/admin/stores/${storeId}/branding`)
      .set(auth());

    expect(branding.status).toBe(200);
    expect(branding.body.data.primaryColor).toBeNull();
    expect(branding.body.data.secondaryColor).toBeNull();
    expect(branding.body.data.logoUrl).toBe('https://cdn.example.com/logo.png');

    const loaded = await Store.findById(storeId);
    if (!loaded) {
      throw new Error('expected the store to still exist');
    }
    expect(loaded.branding.primaryColor).toBeUndefined();
    expect(loaded.branding.secondaryColor).toBeUndefined();
    loaded.branding.logoUrl = 'https://cdn.example.com/logo-2.png';
    await loaded.save();

    const raw = await Store.collection.findOne({ _id: storeId });
    expect(raw?.branding?.primaryColor).toBeUndefined();
    expect(raw?.branding?.secondaryColor).toBeUndefined();
    expect(raw?.branding?.logoUrl).toBe('https://cdn.example.com/logo-2.png');

    const config = await request(app)
      .get('/api/v1/store/config')
      .set('X-Store-ID', storeId.toString());

    expect(config.status).toBe(200);
    expect(config.body.data).not.toHaveProperty('primaryColor');
    expect(config.body.data).not.toHaveProperty('secondaryColor');
    expect(config.body.data.logoUrl).toBe('https://cdn.example.com/logo-2.png');
  });

  it('can set one color and clear the other in the same request', async () => {
    const response = await request(app)
      .patch(`/api/v1/admin/stores/${storeId}/branding`)
      .set(auth())
      .send({ primaryColor: '#445566', secondaryColor: null });

    expect(response.status).toBe(200);
    expect(response.body.data.primaryColor).toBe('#445566');
    expect(response.body.data.secondaryColor).toBeNull();

    const stored = await Store.findById(storeId).select('branding').lean();
    expect(stored?.branding?.primaryColor).toBe('#445566');
    expect(stored?.branding?.secondaryColor).toBeUndefined();
  });

  it('leaves an omitted color unchanged and still rejects an invalid hex', async () => {
    const omitted = await request(app)
      .patch(`/api/v1/admin/stores/${storeId}/branding`)
      .set(auth())
      .send({ primaryColor: '#998877' });

    expect(omitted.status).toBe(200);
    expect(omitted.body.data.primaryColor).toBe('#998877');
    expect(omitted.body.data.secondaryColor).toBe('#ABCDEF');

    const invalid = await request(app)
      .patch(`/api/v1/admin/stores/${storeId}/branding`)
      .set(auth())
      .send({ primaryColor: 'red', secondaryColor: null });

    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toMatch(/Primary color must be a valid hex color/);

    const empty = await request(app)
      .patch(`/api/v1/admin/stores/${storeId}/branding`)
      .set(auth())
      .send({ secondaryColor: '' });

    expect(empty.status).toBe(400);

    const stored = await Store.findById(storeId).select('branding').lean();
    expect(stored?.branding?.primaryColor).toBe('#998877');
    expect(stored?.branding?.secondaryColor).toBe('#ABCDEF');
  });

  it('does not let another store admin clear these colors', async () => {
    const response = await request(app)
      .patch(`/api/v1/admin/stores/${otherStoreId}/branding`)
      .set(auth())
      .send({ primaryColor: null, secondaryColor: null });

    expect(response.status).toBe(403);

    const stored = await Store.findById(otherStoreId).select('branding').lean();
    expect(stored?.branding?.primaryColor).toBe('#010203');
    expect(stored?.branding?.secondaryColor).toBe('#040506');
  });
});
