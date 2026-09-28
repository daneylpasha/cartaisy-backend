import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import User from '../src/models/User';
import Store from '../src/models/Store';
import authRoutes from '../src/routes/authRoutes';
import { tenantConfig } from '../src/config/tenant';
import { isSessionRevokedByPasswordChange } from '../src/utils/jwt';
import { MERCHANT_FORGOT_PASSWORD_MESSAGE } from '../src/services/merchantPasswordResetService';

const mockSendMerchantPasswordResetEmail = jest.fn();
const mockSendMerchantGoogleSignInEmail = jest.fn();

jest.mock('../src/utils/email', () => {
  const actual = jest.requireActual('../src/utils/email');
  return {
    ...actual,
    sendMerchantPasswordResetEmail: (...args: unknown[]) =>
      mockSendMerchantPasswordResetEmail(...args),
    sendMerchantGoogleSignInEmail: (...args: unknown[]) =>
      mockSendMerchantGoogleSignInEmail(...args),
  };
});

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', authRoutes);
  return app;
};

const app = buildTestApp();

const GENERIC_SUCCESS = {
  status: 'success',
  message: MERCHANT_FORGOT_PASSWORD_MESSAGE,
};

const createStore = (slug: string) => Store.create({ name: slug, slug, shopify: {} });

const createDashboardUser = async (overrides: Record<string, unknown> = {}) => {
  const slug = `store-${crypto.randomBytes(4).toString('hex')}`;
  const store = await createStore(slug);
  return User.create({
    name: 'Merchant User',
    email: 'merchant@example.com',
    password: 'password123',
    role: 'admin',
    isActive: true,
    isVerified: true,
    storeId: store._id,
    ...overrides,
  });
};

const forgot = (email: string) =>
  request(app).post('/api/v1/auth/forgot-password').send({ email });

const reset = (token: string, newPassword = 'resetpass123') =>
  request(app).post('/api/v1/auth/reset-password').send({ token, newPassword });

const latestResetToken = (): string => {
  const calls = mockSendMerchantPasswordResetEmail.mock.calls;
  const token = calls[calls.length - 1]?.[1];
  if (typeof token !== 'string') {
    throw new Error('Expected a reset token to be emailed');
  }
  return token;
};

describe('merchant password reset', () => {
  beforeEach(() => {
    mockSendMerchantPasswordResetEmail.mockReset();
    mockSendMerchantPasswordResetEmail.mockResolvedValue(true);
    mockSendMerchantGoogleSignInEmail.mockReset();
    mockSendMerchantGoogleSignInEmail.mockResolvedValue(true);
  });

  test('returns the same success body for unknown, password, and Google-only emails', async () => {
    await createDashboardUser();
    await createDashboardUser({
      email: 'google-only@example.com',
      authProvider: 'google',
      googleSub: 'google-sub-1',
      password: undefined,
    });

    const unknown = await forgot('missing@example.com');
    const known = await forgot('merchant@example.com');
    const googleOnly = await forgot('google-only@example.com');

    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(GENERIC_SUCCESS);
    expect(known.body).toEqual(unknown.body);
    expect(googleOnly.body).toEqual(unknown.body);
    expect(JSON.stringify(unknown.body)).not.toContain('merchant@example.com');
    expect(mockSendMerchantPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(mockSendMerchantPasswordResetEmail).toHaveBeenCalledWith(
      'merchant@example.com',
      expect.stringMatching(/^[a-f0-9]{64}$/)
    );
    expect(mockSendMerchantGoogleSignInEmail).toHaveBeenCalledTimes(1);
    expect(mockSendMerchantGoogleSignInEmail).toHaveBeenCalledWith('google-only@example.com');
    expect(JSON.stringify(googleOnly.body)).not.toContain('google-only@example.com');
  });

  test('stores only the SHA-256 hash and omits the raw token from the response', async () => {
    const user = await createDashboardUser();
    const response = await forgot('Merchant@Example.com');
    const rawToken = latestResetToken();

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain(rawToken);

    const saved = await User.findById(user._id).select('+passwordResetToken +passwordResetExpires');
    expect(saved?.passwordResetToken).toBe(
      crypto.createHash('sha256').update(rawToken).digest('hex')
    );
    expect(saved?.passwordResetToken).not.toBe(rawToken);
    expect(saved?.passwordResetExpires).toBeInstanceOf(Date);
    const remainingMs = (saved?.passwordResetExpires?.getTime() ?? 0) - Date.now();
    expect(remainingMs).toBeGreaterThan(9 * 60 * 1000);
    expect(remainingMs).toBeLessThanOrEqual(10 * 60 * 1000);
  });

  test('rejects an expired token and leaves the password unchanged', async () => {
    const user = await createDashboardUser();
    await forgot('merchant@example.com');
    const rawToken = latestResetToken();

    await User.updateOne(
      { _id: user._id },
      { $set: { passwordResetExpires: new Date(Date.now() - 1000) } }
    );

    const response = await reset(rawToken, 'resetpass123');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: 'error',
      message: 'Invalid or expired reset token',
    });

    const saved = await User.findById(user._id).select('+password');
    expect(await saved?.comparePassword('password123')).toBe(true);
    expect(await saved?.comparePassword('resetpass123')).toBe(false);
  });

  test('rejects reuse of a token after a successful reset', async () => {
    const user = await createDashboardUser();
    await forgot('merchant@example.com');
    const rawToken = latestResetToken();

    const first = await reset(rawToken, 'resetpass123');
    expect(first.status).toBe(200);
    expect(first.body.data.token).toEqual(expect.any(String));
    expect(first.body.data.refreshToken).toEqual(expect.any(String));
    expect(JSON.stringify(first.body)).not.toContain(rawToken);
    expect(JSON.stringify(first.body)).not.toContain('resetpass123');

    const second = await reset(rawToken, 'anotherpass1');
    expect(second.status).toBe(400);
    expect(second.body.message).toBe('Invalid or expired reset token');

    const saved = await User.findById(user._id).select('+password +passwordResetToken');
    expect(saved?.passwordResetToken).toBeFalsy();
    expect(await saved?.comparePassword('resetpass123')).toBe(true);
    expect(await saved?.comparePassword('anotherpass1')).toBe(false);
    expect(await saved?.comparePassword('password123')).toBe(false);
  });

  test('replaces the previous token when reset is requested again', async () => {
    await createDashboardUser();
    await forgot('merchant@example.com');
    const firstToken = latestResetToken();
    await forgot('merchant@example.com');
    const secondToken = latestResetToken();

    expect(secondToken).not.toBe(firstToken);
    expect((await reset(firstToken)).status).toBe(400);
    expect((await reset(secondToken)).status).toBe(200);
  });

  test('keeps the generic response and clears the token when email sending fails', async () => {
    const user = await createDashboardUser();
    mockSendMerchantPasswordResetEmail.mockResolvedValueOnce(false);

    const response = await forgot('merchant@example.com');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(GENERIC_SUCCESS);

    const saved = await User.findById(user._id).select('+passwordResetToken');
    expect(saved?.passwordResetToken).toBeFalsy();
  });

  test('does not log the reset token or the new password', async () => {
    const logs: string[] = [];
    const spyLog = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(part => (typeof part === 'string' ? part : JSON.stringify(part))).join(' '));
    });
    const spyErr = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(part => (typeof part === 'string' ? part : JSON.stringify(part))).join(' '));
    });

    try {
      await createDashboardUser();
      await forgot('merchant@example.com');
      const rawToken = latestResetToken();
      await reset(rawToken, 'resetpass123');
      const dumped = logs.join('\n');
      expect(dumped).not.toContain(rawToken);
      expect(dumped).not.toContain('resetpass123');
      expect(dumped).not.toContain('password123');
    } finally {
      spyLog.mockRestore();
      spyErr.mockRestore();
    }
  });

  test('sends Google guidance and no reset token for an account with no password', async () => {
    const user = await createDashboardUser({
      email: 'google-only@example.com',
      authProvider: 'google',
      googleSub: 'google-sub-2',
      password: undefined,
    });

    const response = await forgot('google-only@example.com');
    expect(response.body).toEqual(GENERIC_SUCCESS);
    expect(mockSendMerchantPasswordResetEmail).not.toHaveBeenCalled();
    expect(mockSendMerchantGoogleSignInEmail).toHaveBeenCalledWith('google-only@example.com');

    const saved = await User.findById(user._id).select('+password +passwordResetToken');
    expect(saved?.password).toBeFalsy();
    expect(saved?.passwordResetToken).toBeFalsy();
  });

  test('still emails a reset link when Google is linked and a password exists', async () => {
    await createDashboardUser({
      authProvider: 'google',
      googleSub: 'google-sub-3',
    });

    await forgot('merchant@example.com');
    expect(mockSendMerchantPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(mockSendMerchantGoogleSignInEmail).not.toHaveBeenCalled();
  });

  test('does not reset a shopper or an inactive dashboard user', async () => {
    const store = await createStore('shopper-store');
    await User.create({
      name: 'Shopper',
      email: 'shopper@example.com',
      password: 'password123',
      role: 'customer',
      isActive: true,
      isVerified: true,
      storeId: store._id,
    });
    await createDashboardUser({
      email: 'inactive@example.com',
      isActive: false,
    });

    expect((await forgot('shopper@example.com')).body).toEqual(GENERIC_SUCCESS);
    expect((await forgot('inactive@example.com')).body).toEqual(GENERIC_SUCCESS);
    expect(mockSendMerchantPasswordResetEmail).not.toHaveBeenCalled();
    expect(mockSendMerchantGoogleSignInEmail).not.toHaveBeenCalled();
  });

  test('does not choose an account when two dashboard users share an email', async () => {
    await createDashboardUser({ email: 'shared@example.com', role: 'admin' });
    await createDashboardUser({ email: 'shared@example.com', role: 'super_admin' });

    const logs: string[] = [];
    const spyErr = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(part => String(part)).join(' '));
    });

    try {
      const response = await forgot('shared@example.com');
      expect(response.body).toEqual(GENERIC_SUCCESS);
      expect(mockSendMerchantPasswordResetEmail).not.toHaveBeenCalled();
      expect(mockSendMerchantGoogleSignInEmail).not.toHaveBeenCalled();
      expect(logs.join('\n')).not.toContain('shared@example.com');
      expect(logs.join('\n')).not.toContain('password123');
    } finally {
      spyErr.mockRestore();
    }

    const saved = await User.find({ email: 'shared@example.com' }).select('+passwordResetToken');
    expect(saved).toHaveLength(2);
    expect(saved.every(user => !user.passwordResetToken)).toBe(true);
  });

  test('rejects a weak password with the signup rules and keeps the token usable', async () => {
    const user = await createDashboardUser();
    await forgot('merchant@example.com');
    const rawToken = latestResetToken();

    const missingNumber = await reset(rawToken, 'longpassword');
    expect(missingNumber.status).toBe(400);
    expect(missingNumber.body.message).toBe('Validation failed');

    const tooShort = await reset(rawToken, 'a1');
    expect(tooShort.status).toBe(400);

    const success = await reset(rawToken, 'resetpass123');
    expect(success.status).toBe(200);

    const saved = await User.findById(user._id).select('+password');
    expect(await saved?.comparePassword('resetpass123')).toBe(true);
  });

  test('invalidates access and refresh tokens issued before the reset', async () => {
    await createDashboardUser();
    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'merchant@example.com',
      password: 'password123',
    });
    expect(login.status).toBe(200);
    const oldAccess = login.body.data.token as string;
    const oldRefresh = login.body.data.refreshToken as string;

    await new Promise(resolve => setTimeout(resolve, 1200));

    await forgot('merchant@example.com');
    const resetResponse = await reset(latestResetToken(), 'resetpass123');
    expect(resetResponse.status).toBe(200);

    const oldProfile = await request(app)
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${oldAccess}`);
    expect(oldProfile.status).toBe(401);

    const oldRefreshResponse = await request(app)
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken: oldRefresh });
    expect(oldRefreshResponse.status).toBe(401);

    const newProfile = await request(app)
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${resetResponse.body.data.token}`);
    expect(newProfile.status).toBe(200);
    expect(newProfile.body.data.user.email).toBe('merchant@example.com');

    const newRefreshResponse = await request(app)
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken: resetResponse.body.data.refreshToken });
    expect(newRefreshResponse.status).toBe(200);
  });

  test('builds the dashboard reset link and keeps the token out of the Google email', () => {
    const previous = process.env.DASHBOARD_URL;
    process.env.DASHBOARD_URL = 'https://dashboard.example.com/';
    const token = 'ab'.repeat(32);

    const actual = jest.requireActual('../src/utils/email') as typeof import('../src/utils/email');
    const resetUrl = actual.buildMerchantPasswordResetUrl(token);
    expect(resetUrl).toBe(`https://dashboard.example.com/reset-password?token=${token}`);

    const resetMail = actual.renderMerchantPasswordResetEmail(token);
    expect(resetMail?.subject).toBe('Reset your Cartaisy password');
    expect(resetMail?.html).toContain(resetUrl);
    expect(resetMail?.html).toContain('10 minutes');
    expect(resetMail?.html).not.toContain('cartaisy://');

    const googleMail = actual.renderMerchantGoogleSignInEmail();
    expect(googleMail?.html).toContain('Continue with Google');
    expect(googleMail?.html).not.toContain('reset-password');
    expect(googleMail?.html).not.toContain(token);

    delete process.env.DASHBOARD_URL;
    const fallback = actual.buildMerchantPasswordResetUrl(token);
    const fallbackBase = tenantConfig.api.frontendUrl.replace(/\/+$/, '');
    expect(fallback).toBe(`${fallbackBase}/reset-password?token=${token}`);

    if (previous === undefined) {
      delete process.env.DASHBOARD_URL;
    } else {
      process.env.DASHBOARD_URL = previous;
    }
  });

  test('treats a same-second token as still valid and an older token as revoked', () => {
    const changedAt = new Date('2026-09-28T12:00:01.900Z');
    const changedSecond = Math.floor(changedAt.getTime() / 1000);
    expect(isSessionRevokedByPasswordChange(changedSecond, changedAt)).toBe(false);
    expect(isSessionRevokedByPasswordChange(changedSecond - 1, changedAt)).toBe(true);
    expect(isSessionRevokedByPasswordChange(undefined, changedAt)).toBe(true);
    expect(isSessionRevokedByPasswordChange(changedSecond - 10, undefined)).toBe(false);
  });
});
