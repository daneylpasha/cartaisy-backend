import crypto from 'crypto';
import express from 'express';
import { ValidationChain } from 'express-validator';
import request from 'supertest';
import User from '../src/models/User';
import Store from '../src/models/Store';
import authRoutes from '../src/routes/authRoutes';
import {
  handleValidationErrors,
  validateLogin,
  validatePasswordReset,
  validateRegister,
} from '../src/middleware/validation';

const mockSendWelcomeEmail = jest.fn();
const mockSendMerchantPasswordResetEmail = jest.fn();

jest.mock('../src/utils/email', () => {
  const actual = jest.requireActual('../src/utils/email');
  return {
    ...actual,
    sendWelcomeEmail: (...args: unknown[]) => mockSendWelcomeEmail(...args),
    sendMerchantPasswordResetEmail: (...args: unknown[]) =>
      mockSendMerchantPasswordResetEmail(...args),
    sendMerchantGoogleSignInEmail: jest.fn().mockResolvedValue(true),
  };
});

const DOTTED_GMAIL = 'daniyal.pasha7@gmail.com';
const UNDOTTED_GMAIL = 'daniyalpasha7@gmail.com';
const MIXED_CASE_GMAIL = '  Daniyal.Pasha7@Gmail.com  ';

const buildAuthApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', authRoutes);
  return app;
};

const authApp = buildAuthApp();

const echoValidatedEmail = (rules: ValidationChain[]) => {
  const app = express();
  app.use(express.json());
  app.post('/check', rules, handleValidationErrors, (req, res) => {
    res.status(200).json({ email: req.body.email });
  });
  return app;
};

const createStore = (slug: string) => Store.create({ name: slug, slug, shopify: {} });

const createDottedGmailUser = async () => {
  const slug = `gmail-dots-${crypto.randomBytes(4).toString('hex')}`;
  const store = await createStore(slug);
  return User.create({
    name: 'Daniyal Pasha',
    email: DOTTED_GMAIL,
    password: 'password1',
    role: 'admin',
    isActive: true,
    isVerified: true,
    storeId: store._id,
  });
};

describe('auth email normalization', () => {
  beforeEach(() => {
    mockSendWelcomeEmail.mockReset();
    mockSendWelcomeEmail.mockResolvedValue(true);
    mockSendMerchantPasswordResetEmail.mockReset();
    mockSendMerchantPasswordResetEmail.mockResolvedValue(true);
  });

  test.each([
    ['login', validateLogin, { email: MIXED_CASE_GMAIL, password: 'secret' }],
    ['register', validateRegister, { email: MIXED_CASE_GMAIL, password: 'password1' }],
    ['forgot-password', validatePasswordReset, { email: MIXED_CASE_GMAIL }],
  ] as const)('%s keeps Gmail dots and only trims and lowercases', async (_label, rules, body) => {
    const response = await request(echoValidatedEmail([...rules]))
      .post('/check')
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body.email).toBe(DOTTED_GMAIL);
    expect(response.body.email).not.toBe(UNDOTTED_GMAIL);
  });

  test('password login finds a user stored with Gmail dots', async () => {
    const user = await createDottedGmailUser();

    const login = await request(authApp).post('/api/v1/auth/login').send({
      email: MIXED_CASE_GMAIL,
      password: 'password1',
    });

    expect(login.status).toBe(200);
    expect(login.body.data.user.id).toBe(user._id.toString());
    expect(login.body.data.user.email).toBe(DOTTED_GMAIL);

    const undotted = await request(authApp).post('/api/v1/auth/login').send({
      email: UNDOTTED_GMAIL,
      password: 'password1',
    });

    expect(undotted.status).toBe(401);
    expect(undotted.body).toEqual({
      status: 'error',
      message: 'Invalid email or password',
    });
  });

  test('forgot-password finds a user stored with Gmail dots', async () => {
    const user = await createDottedGmailUser();

    const response = await request(authApp).post('/api/v1/auth/forgot-password').send({
      email: MIXED_CASE_GMAIL,
    });

    expect(response.status).toBe(200);
    expect(mockSendMerchantPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(mockSendMerchantPasswordResetEmail).toHaveBeenCalledWith(
      DOTTED_GMAIL,
      expect.stringMatching(/^[a-f0-9]{64}$/)
    );

    const saved = await User.findById(user._id).select('+passwordResetToken');
    expect(saved?.email).toBe(DOTTED_GMAIL);
    expect(saved?.passwordResetToken).toEqual(expect.any(String));
    expect(await User.findOne({ email: UNDOTTED_GMAIL })).toBeNull();
  });

  test('register stores the dotted Gmail address', async () => {
    const response = await request(authApp).post('/api/v1/auth/register').send({
      email: MIXED_CASE_GMAIL,
      password: 'password1',
      name: 'Daniyal Pasha',
      storeName: 'Dots',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.user.email).toBe(DOTTED_GMAIL);

    const stored = await User.findOne({ email: DOTTED_GMAIL });
    expect(stored).not.toBeNull();
    expect(stored?.email).toBe(DOTTED_GMAIL);
    expect(await User.findOne({ email: UNDOTTED_GMAIL })).toBeNull();
    expect(mockSendWelcomeEmail).toHaveBeenCalledWith(DOTTED_GMAIL, 'Daniyal Pasha');
  });
});
