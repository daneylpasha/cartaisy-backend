import express from 'express';
import request from 'supertest';
import User from '../src/models/User';
import Store from '../src/models/Store';
import authRoutes from '../src/routes/authRoutes';
import { verifyToken } from '../src/utils/jwt';

const mockVerifyIdToken = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: (...args: unknown[]) => mockVerifyIdToken(...args),
  })),
}));

const GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
const ID_TOKEN = 'header.payload.signature';

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', authRoutes);
  return app;
};

const app = buildTestApp();

const verifiedPayload = (email: string, overrides: Record<string, unknown> = {}) => ({
  email,
  email_verified: true,
  sub: 'google-sub-admin',
  aud: GOOGLE_CLIENT_ID,
  ...overrides,
});

const mockTicket = (payload: Record<string, unknown> | undefined) => {
  mockVerifyIdToken.mockResolvedValue({
    getPayload: () => payload,
  });
};

describe('POST /api/v1/auth/google', () => {
  const originalClientId = process.env.GOOGLE_CLIENT_ID;

  beforeEach(() => {
    mockVerifyIdToken.mockReset();
    process.env.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;
  });

  afterEach(() => {
    if (originalClientId === undefined) {
      delete process.env.GOOGLE_CLIENT_ID;
    } else {
      process.env.GOOGLE_CLIENT_ID = originalClientId;
    }
  });

  const createStore = (slug: string, name = 'Northwind') =>
    Store.create({ name, slug, shopify: {} });

  test.each(['admin', 'super_admin', 'moderator'] as const)(
    'signs in a %s and matches the password login response shape',
    async role => {
      const store = await createStore(`google-${role.replace(/_/g, '-')}-store`, `${role} store`);
      const user = await User.create({
        name: 'Merchant User',
        email: 'Merchant@Example.com',
        password: 'password123',
        role,
        isActive: true,
        isVerified: true,
        storeId: store._id,
      });

      mockTicket(verifiedPayload('Merchant@Example.com', { sub: `sub-${role}` }));

      const response = await request(app).post('/api/v1/auth/google').send({ idToken: ID_TOKEN });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Login successful');
      expect(response.body.code).toBeUndefined();
      expect(response.body.data.user).toMatchObject({
        name: 'Merchant User',
        email: 'merchant@example.com',
        role,
        storeId: store._id.toString(),
        storeName: `${role} store`,
        isEmailVerified: true,
        isActive: true,
      });
      expect(response.body.data.user.id).toBe(user._id.toString());
      expect(response.body.data.user.lastLoginAt).toEqual(expect.any(String));
      expect(verifyToken(response.body.data.token).userId).toBe(user._id.toString());
      expect(response.body.data.refreshToken).toEqual(expect.any(String));
      expect(JSON.stringify(response.body)).not.toContain('password');
      expect(JSON.stringify(response.body)).not.toContain(ID_TOKEN);

      expect(mockVerifyIdToken).toHaveBeenCalledWith({
        idToken: ID_TOKEN,
        audience: [GOOGLE_CLIENT_ID],
      });

      const saved = await User.findById(user._id);
      expect(saved?.googleSub).toBe(`sub-${role}`);
      expect(saved?.authProvider).toBe('google');
      expect(saved?.lastLoginAt).toBeInstanceOf(Date);
      expect(saved?.isPlatformOperator).toBe(false);
      expect(response.body.data.user.isPlatformOperator).not.toBe(true);

      const passwordLogin = await request(app).post('/api/v1/auth/login').send({
        email: 'merchant@example.com',
        password: 'password123',
      });

      expect(passwordLogin.status).toBe(200);
      expect(passwordLogin.body.code).toBeUndefined();
      expect(Object.keys(passwordLogin.body).sort()).toEqual(Object.keys(response.body).sort());
      expect(Object.keys(passwordLogin.body.data).sort()).toEqual(
        Object.keys(response.body.data).sort()
      );
      expect(Object.keys(passwordLogin.body.data.user).sort()).toEqual(
        Object.keys(response.body.data.user).sort()
      );
      expect(passwordLogin.body.data.user.id).toBe(response.body.data.user.id);
      expect(passwordLogin.body.data.user.role).toBe(role);
    }
  );

  test('does not issue a dashboard session to a customer with the same email', async () => {
    const shopperStore = await createStore('shopper-store', 'Shopper Store');
    const merchantStore = await createStore('merchant-store', 'Merchant Store');
    const customer = await User.create({
      name: 'Shopper',
      email: 'shared@example.com',
      password: 'password123',
      role: 'customer',
      isActive: true,
      isVerified: true,
      storeId: shopperStore._id,
    });
    const admin = await User.create({
      name: 'Merchant',
      email: 'shared@example.com',
      password: 'password123',
      role: 'admin',
      isActive: true,
      isVerified: true,
      storeId: merchantStore._id,
    });

    mockTicket(verifiedPayload('shared@example.com', { sub: 'sub-shared' }));

    const response = await request(app).post('/api/v1/auth/google').send({ idToken: ID_TOKEN });

    expect(response.status).toBe(200);
    expect(response.body.data.user.id).toBe(admin._id.toString());
    expect(response.body.data.user.role).toBe('admin');
    expect(response.body.data.user.storeId).toBe(merchantStore._id.toString());
    expect(verifyToken(response.body.data.token).userId).toBe(admin._id.toString());

    const shopper = await User.findById(customer._id);
    expect(shopper?.googleSub).toBeUndefined();
    expect(shopper?.authProvider).toBeUndefined();
    expect(shopper?.lastLoginAt).toBeUndefined();
  });

  test.each(['customer', 'premium_customer'] as const)(
    'returns NO_MERCHANT_ACCOUNT for a %s and leaves password login unchanged',
    async role => {
      await User.create({
        name: 'Shopper Only',
        email: 'shopper@example.com',
        password: 'password123',
        role,
        isActive: true,
        isVerified: true,
      });
      mockTicket(verifiedPayload('shopper@example.com'));

      const response = await request(app).post('/api/v1/auth/google').send({ idToken: ID_TOKEN });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        status: 'error',
        code: 'NO_MERCHANT_ACCOUNT',
      });
      expect(response.body.data).toBeUndefined();

      const passwordLogin = await request(app).post('/api/v1/auth/login').send({
        email: 'shopper@example.com',
        password: 'password123',
      });
      expect(passwordLogin.status).toBe(200);
      expect(passwordLogin.body.code).toBeUndefined();
      expect(passwordLogin.body.data.user.role).toBe(role);
    }
  );

  test('returns NO_MERCHANT_ACCOUNT when no user exists', async () => {
    mockTicket(verifiedPayload('missing@example.com'));

    const response = await request(app).post('/api/v1/auth/google').send({ idToken: ID_TOKEN });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NO_MERCHANT_ACCOUNT');
    expect(await User.countDocuments()).toBe(0);
  });

  test('returns ACCOUNT_INACTIVE for an inactive dashboard user and does not update login fields', async () => {
    const store = await createStore('inactive-store');
    const user = await User.create({
      name: 'Inactive Admin',
      email: 'inactive@example.com',
      password: 'password123',
      role: 'admin',
      isActive: false,
      isVerified: true,
      storeId: store._id,
    });
    mockTicket(verifiedPayload('inactive@example.com'));

    const response = await request(app).post('/api/v1/auth/google').send({ idToken: ID_TOKEN });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      status: 'error',
      code: 'ACCOUNT_INACTIVE',
    });
    expect(response.body.data).toBeUndefined();

    const saved = await User.findById(user._id);
    expect(saved?.lastLoginAt).toBeUndefined();
    expect(saved?.googleSub).toBeUndefined();
    expect(saved?.authProvider).toBeUndefined();

    const passwordLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'inactive@example.com',
      password: 'password123',
    });
    expect(passwordLogin.status).toBe(403);
    expect(passwordLogin.body).toEqual({
      status: 'error',
      message: 'Account is inactive. Please contact your administrator.',
    });
  });

  test.each([
    [
      'verifier rejects the token',
      () => mockVerifyIdToken.mockRejectedValue(new Error('Token used too late')),
    ],
    [
      'email is not verified',
      () => mockTicket(verifiedPayload('admin@example.com', { email_verified: false })),
    ],
    [
      'email_verified is missing',
      () => mockTicket(verifiedPayload('admin@example.com', { email_verified: undefined })),
    ],
    [
      'email is missing',
      () => mockTicket(verifiedPayload('admin@example.com', { email: undefined })),
    ],
    [
      'audience does not match',
      () =>
        mockTicket(
          verifiedPayload('admin@example.com', { aud: 'other-client.apps.googleusercontent.com' })
        ),
    ],
  ])('returns GOOGLE_TOKEN_INVALID when %s', async (_label, arrange) => {
    await User.create({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'password123',
      role: 'admin',
      isActive: true,
    });
    arrange();

    const response = await request(app).post('/api/v1/auth/google').send({ idToken: ID_TOKEN });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      status: 'error',
      code: 'GOOGLE_TOKEN_INVALID',
    });
    expect(JSON.stringify(response.body)).not.toContain('Token used too late');
    expect(
      await User.findOne({ email: 'admin@example.com' }).then(user => user?.lastLoginAt)
    ).toBeUndefined();
  });

  test.each([undefined, '', ' , '])(
    'returns GOOGLE_NOT_CONFIGURED when GOOGLE_CLIENT_ID is %p and does not call Google',
    async raw => {
      if (raw === undefined) {
        delete process.env.GOOGLE_CLIENT_ID;
      } else {
        process.env.GOOGLE_CLIENT_ID = raw;
      }

      const response = await request(app).post('/api/v1/auth/google').send({ idToken: ID_TOKEN });

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        status: 'error',
        code: 'GOOGLE_NOT_CONFIGURED',
      });
      expect(mockVerifyIdToken).not.toHaveBeenCalled();
    }
  );

  test('passes a comma-separated GOOGLE_CLIENT_ID list as the audience', async () => {
    process.env.GOOGLE_CLIENT_ID =
      ' client-a.apps.googleusercontent.com , client-b.apps.googleusercontent.com ';
    const store = await createStore('audience-store');
    await User.create({
      name: 'Admin',
      email: 'audience@example.com',
      password: 'password123',
      role: 'admin',
      isActive: true,
      storeId: store._id,
    });
    mockTicket(
      verifiedPayload('audience@example.com', { aud: 'client-b.apps.googleusercontent.com' })
    );

    const response = await request(app).post('/api/v1/auth/google').send({ idToken: ID_TOKEN });

    expect(response.status).toBe(200);
    expect(mockVerifyIdToken).toHaveBeenCalledWith({
      idToken: ID_TOKEN,
      audience: ['client-a.apps.googleusercontent.com', 'client-b.apps.googleusercontent.com'],
    });
  });

  test('returns AMBIGUOUS_MERCHANT_ACCOUNT when two dashboard users share the email', async () => {
    const storeA = await createStore('ambiguous-a', 'Store A');
    const storeB = await createStore('ambiguous-b', 'Store B');
    await User.create({
      name: 'Admin A',
      email: 'ambiguous@example.com',
      password: 'password123',
      role: 'admin',
      isActive: true,
      storeId: storeA._id,
    });
    await User.create({
      name: 'Admin B',
      email: 'ambiguous@example.com',
      password: 'password123',
      role: 'super_admin',
      isActive: true,
      storeId: storeB._id,
    });
    mockTicket(verifiedPayload('ambiguous@example.com'));

    const response = await request(app).post('/api/v1/auth/google').send({ idToken: ID_TOKEN });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('AMBIGUOUS_MERCHANT_ACCOUNT');
    const users = await User.find({ email: 'ambiguous@example.com' });
    expect(users.every(user => user.googleSub == null && user.lastLoginAt == null)).toBe(true);
  });

  test('rejects a missing idToken before calling Google', async () => {
    const response = await request(app).post('/api/v1/auth/google').send({});

    expect(response.status).toBe(400);
    expect(response.body.status).toBe('error');
    expect(response.body.code).toBeUndefined();
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });
});
