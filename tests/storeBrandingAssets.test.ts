import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import storeBrandingRoutes from '../src/routes/storeBrandingRoutes';
import User from '../src/models/User';
import Store from '../src/models/Store';
import { generateToken } from '../src/utils/jwt';
import { cloudinaryService } from '../src/services/cloudinaryService';

jest.mock('../src/services/cloudinaryService', () => ({
  cloudinaryService: {
    isConfigured: jest.fn(),
    uploadImage: jest.fn(),
    deleteImage: jest.fn(),
  },
}));

const mockedCloudinary = cloudinaryService as jest.Mocked<typeof cloudinaryService>;

const ICON_URL = 'https://cdn.example.com/stores/icon.png';
const SPLASH_URL = 'https://cdn.example.com/stores/splash.png';
const LOGO_URL = 'https://cdn.example.com/stores/logo.png';
const ADMIN_TOKEN = 'shpat_branding_store_secret';

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin', storeBrandingRoutes);
  return app;
};

const uploadResult = (secureUrl: string, publicId = 'stores/brand/icon_image') => ({
  publicId,
  url: secureUrl.replace('https://', 'http://'),
  secureUrl,
  size: 1200,
  width: 512,
  height: 512,
  format: 'png',
});

describe('store branding icon and splash uploads', () => {
  const app = buildTestApp();
  let storeAId: Types.ObjectId;
  let storeBId: Types.ObjectId;
  let adminAToken: string;
  let superAdminToken: string;
  let shopperToken: string;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(async () => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockedCloudinary.isConfigured.mockReset();
    mockedCloudinary.uploadImage.mockReset();
    mockedCloudinary.deleteImage.mockReset();
    mockedCloudinary.isConfigured.mockReturnValue(true);
    mockedCloudinary.deleteImage.mockResolvedValue(true);

    const [storeA, storeB] = await Promise.all([
      Store.create({
        name: 'Brand Store A',
        slug: 'brand-icon-store-a',
        shopify: { accessToken: ADMIN_TOKEN, isConnected: true, shop: 'brand-a.myshopify.com' },
        branding: { primaryColor: '#112233', secondaryColor: '#ABCDEF' },
      }),
      Store.create({
        name: 'Brand Store B',
        slug: 'brand-icon-store-b',
        shopify: {},
      }),
    ]);
    storeAId = storeA._id;
    storeBId = storeB._id;

    const [adminA, superAdmin, customer] = await Promise.all([
      User.create({
        name: 'Brand Admin A',
        email: 'brand-admin-a@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: storeAId,
      }),
      User.create({
        name: 'Brand Super Admin',
        email: 'brand-super@example.com',
        password: 'password123',
        role: 'super_admin',
        isActive: true,
      }),
      User.create({
        name: 'Brand Customer',
        email: 'brand-customer@example.com',
        password: 'password123',
        role: 'customer',
        isActive: true,
        storeId: storeAId,
      }),
    ]);
    adminAToken = generateToken(adminA._id.toString());
    superAdminToken = generateToken(superAdmin._id.toString());
    shopperToken = generateToken(customer._id.toString());
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('rejects icon and splash uploads with no token', async () => {
    const icon = await request(app).post(`/api/v1/admin/stores/${storeAId}/branding/icon`);
    const splash = await request(app).post(`/api/v1/admin/stores/${storeAId}/branding/splash`);
    const read = await request(app).get(`/api/v1/admin/stores/${storeAId}/branding`);

    expect(icon.status).toBe(401);
    expect(splash.status).toBe(401);
    expect(read.status).toBe(401);
  });

  it('rejects a customer token', async () => {
    const response = await request(app)
      .post(`/api/v1/admin/stores/${storeAId}/branding/icon`)
      .set(auth(shopperToken))
      .attach('image', Buffer.from('png'), 'icon.png');

    expect(response.status).toBe(403);
    expect(mockedCloudinary.uploadImage).not.toHaveBeenCalled();
  });

  it('rejects an admin uploading to a different store', async () => {
    const response = await request(app)
      .post(`/api/v1/admin/stores/${storeBId}/branding/splash`)
      .set(auth(adminAToken))
      .attach('image', Buffer.from('png'), 'splash.png');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ success: false, error: 'Store access denied' });
    expect(mockedCloudinary.uploadImage).not.toHaveBeenCalled();

    const stored = await Store.findById(storeBId).select('branding').lean();
    expect(stored?.branding?.splashUrl).toBeUndefined();
  });

  it('persists icon and splash for the owning store and returns them on GET and PATCH', async () => {
    mockedCloudinary.uploadImage
      .mockResolvedValueOnce(uploadResult(ICON_URL, 'stores/brand/icon_image'))
      .mockResolvedValueOnce(uploadResult(SPLASH_URL, 'stores/brand/splash_image'));

    const icon = await request(app)
      .post(`/api/v1/admin/stores/${storeAId}/branding/icon`)
      .set(auth(adminAToken))
      .attach('image', Buffer.from('png'), 'shpat_secret-icon.png');

    expect(icon.status).toBe(200);
    expect(icon.body.data.url).toBe(ICON_URL);
    expect(icon.body.data.iconUrl).toBe(ICON_URL);
    expect(icon.body.data.appIconUrl).toBe(ICON_URL);
    expect(icon.body.data.publicId).toBe('stores/brand/icon_image');
    expect(JSON.stringify(icon.body)).not.toContain('shpat_');
    expect(mockedCloudinary.uploadImage).toHaveBeenCalledWith(
      expect.any(Buffer),
      storeAId.toString(),
      expect.stringMatching(/^icon_[a-zA-Z0-9_-]+$/)
    );
    expect(mockedCloudinary.uploadImage.mock.calls[0][2]).not.toMatch(/shpat_/);

    const splash = await request(app)
      .post(`/api/v1/admin/stores/${storeAId}/branding/splash`)
      .set(auth(adminAToken))
      .attach('image', Buffer.from('png'), 'splash.png');

    expect(splash.status).toBe(200);
    expect(splash.body.data.splashUrl).toBe(SPLASH_URL);
    expect(splash.body.data.splashImageUrl).toBe(SPLASH_URL);
    expect(splash.body.data.url).toBe(SPLASH_URL);

    const reloaded = await request(app)
      .get(`/api/v1/admin/stores/${storeAId}/branding`)
      .set(auth(adminAToken));

    expect(reloaded.status).toBe(200);
    expect(reloaded.body.data).toEqual({
      logoUrl: null,
      primaryColor: '#112233',
      secondaryColor: '#ABCDEF',
      iconUrl: ICON_URL,
      appIconUrl: ICON_URL,
      splashUrl: SPLASH_URL,
      splashImageUrl: SPLASH_URL,
    });
    expect(JSON.stringify(reloaded.body)).not.toContain(ADMIN_TOKEN);

    const patched = await request(app)
      .patch(`/api/v1/admin/stores/${storeAId}/branding`)
      .set(auth(adminAToken))
      .send({ primaryColor: '#445566' });

    expect(patched.status).toBe(200);
    expect(patched.body.data.primaryColor).toBe('#445566');
    expect(patched.body.data.iconUrl).toBe(ICON_URL);
    expect(patched.body.data.splashUrl).toBe(SPLASH_URL);
    expect(patched.body.data.appIconUrl).toBe(ICON_URL);
    expect(patched.body.data.splashImageUrl).toBe(SPLASH_URL);

    const stored = await Store.findById(storeAId).select('+shopify.accessToken branding');
    expect(stored?.shopify?.accessToken).toBe(ADMIN_TOKEN);
    expect(stored?.branding?.iconUrl).toBe(ICON_URL);
    expect(stored?.branding?.splashUrl).toBe(SPLASH_URL);
    expect(stored?.branding?.primaryColor).toBe('#445566');
  });

  it('lets a super admin upload an icon for another store', async () => {
    mockedCloudinary.uploadImage.mockResolvedValue(uploadResult(ICON_URL, 'stores/brand/icon_image'));

    const response = await request(app)
      .post(`/api/v1/admin/stores/${storeBId}/branding/icon`)
      .set(auth(superAdminToken))
      .attach('image', Buffer.from('png'), 'icon.png');

    expect(response.status).toBe(200);
    const stored = await Store.findById(storeBId).select('branding').lean();
    expect(stored?.branding?.iconUrl).toBe(ICON_URL);
  });

  it('does not persist or return a token-shaped upload URL', async () => {
    const leaked = 'https://cdn.example.com/icon.png?access_token=shpat_adminsecret';
    mockedCloudinary.uploadImage.mockResolvedValue(
      uploadResult(leaked, 'stores/brand/icon_image')
    );

    const response = await request(app)
      .post(`/api/v1/admin/stores/${storeAId}/branding/icon`)
      .set(auth(adminAToken))
      .attach('image', Buffer.from('png'), 'icon.png');

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ success: false, error: 'Failed to upload store icon' });
    expect(JSON.stringify(response.body)).not.toMatch(/shpat_|access_token/);
    expect(mockedCloudinary.deleteImage).toHaveBeenCalledWith('stores/brand/icon_image');

    const stored = await Store.findById(storeAId).select('branding').lean();
    expect(stored?.branding?.iconUrl).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain('shpat_adminsecret');
  });

  it('does not delete or log a token-shaped Cloudinary public id', async () => {
    mockedCloudinary.uploadImage.mockResolvedValue(
      uploadResult('https://cdn.example.com/icon.png?shpat_inurl', 'folder/shpat_publicid')
    );

    const response = await request(app)
      .post(`/api/v1/admin/stores/${storeAId}/branding/splash`)
      .set(auth(adminAToken))
      .attach('image', Buffer.from('png'), 'splash.png');

    expect(response.status).toBe(502);
    expect(mockedCloudinary.deleteImage).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toContain('shpat_');
    const logged = consoleErrorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).not.toContain('shpat_');
  });

  it('redacts Shopify tokens when an upload throws', async () => {
    mockedCloudinary.uploadImage.mockRejectedValue(new Error('upstream shpat_logleak failed'));

    const response = await request(app)
      .post(`/api/v1/admin/stores/${storeAId}/branding/icon`)
      .set(auth(adminAToken))
      .attach('image', Buffer.from('png'), 'icon.png');

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('shpat_');
    const logged = consoleErrorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).toContain('[redacted]');
    expect(logged).not.toContain('shpat_');
  });

  it('hides a token-shaped URL already stored on the branding document', async () => {
    await Store.updateOne(
      { _id: storeAId },
      {
        $set: {
          'branding.iconUrl': 'https://cdn.example.com/icon.png?x=shpat_storedsecret',
          'branding.splashUrl': SPLASH_URL,
        },
      }
    );

    const response = await request(app)
      .get(`/api/v1/admin/stores/${storeAId}/branding`)
      .set(auth(adminAToken));

    expect(response.status).toBe(200);
    expect(response.body.data.iconUrl).toBeNull();
    expect(response.body.data.appIconUrl).toBeNull();
    expect(response.body.data.splashUrl).toBe(SPLASH_URL);
    expect(JSON.stringify(response.body)).not.toContain('shpat_');
  });

  it('returns 400 when the image field is missing and 500 when upload is not configured', async () => {
    const missing = await request(app)
      .post(`/api/v1/admin/stores/${storeAId}/branding/icon`)
      .set(auth(adminAToken));

    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatch(/No file uploaded/);
    expect(mockedCloudinary.uploadImage).not.toHaveBeenCalled();

    mockedCloudinary.isConfigured.mockReturnValue(false);
    const unconfigured = await request(app)
      .post(`/api/v1/admin/stores/${storeAId}/branding/splash`)
      .set(auth(adminAToken))
      .attach('image', Buffer.from('png'), 'splash.png');

    expect(unconfigured.status).toBe(500);
    expect(unconfigured.body.error).toBe('Image upload service is not configured');
    expect(mockedCloudinary.uploadImage).not.toHaveBeenCalled();
  });

  it('keeps an existing icon when a logo is uploaded', async () => {
    await Store.updateOne({ _id: storeAId }, { $set: { 'branding.iconUrl': ICON_URL } });
    mockedCloudinary.uploadImage.mockResolvedValue(uploadResult(LOGO_URL, 'stores/brand/logo_image'));

    const response = await request(app)
      .post(`/api/v1/admin/stores/${storeAId}/branding/logo`)
      .set(auth(adminAToken))
      .attach('logo', Buffer.from('png'), 'logo.png');

    expect(response.status).toBe(200);
    expect(response.body.data.logoUrl).toBe(LOGO_URL);
    expect(response.body.data.publicId).toBe('stores/brand/logo_image');

    const stored = await Store.findById(storeAId).select('branding').lean();
    expect(stored?.branding?.logoUrl).toBe(LOGO_URL);
    expect(stored?.branding?.iconUrl).toBe(ICON_URL);
  });
});
