import { generateKeyPairSync } from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import AuditLog from '../src/models/AuditLog';
import Store from '../src/models/Store';
import StoreAppCredentials from '../src/models/StoreAppCredentials';
import User from '../src/models/User';
import { auditLogger } from '../src/middleware/auditLogger';
import { strictStoreValidation } from '../src/middleware/strictStoreValidation';
import storeCredentialsRoutes from '../src/routes/storeCredentialsRoutes';
import {
  protectCredentialJson,
  readCredentialJson,
  normalizePrivateKeyPem,
  responseContainsCredentialSecret,
  StoreCredentialsUnreadableError,
} from '../src/services/storeCredentialsService';
import { redactCredentialQueryUrl } from '../src/middleware/redactCredentialQuery';
import { storeCredentialJsonErrorHandler } from '../src/middleware/storeCredentialJsonError';
import { decrypt } from '../src/utils/encryption';
import { generateToken } from '../src/utils/jwt';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-0123456789abcdef';

const APPLE_KEY_ID = 'AB12CD34EF';
const APPLE_ISSUER_ID = '57246542-96fe-1a63-e053-0824d011072a';

const GOOGLE_KEY_ID = 'abc123def4567890abcd';
const GOOGLE_EMAIL = 'play-submit@example-store.iam.gserviceaccount.com';
const GOOGLE_PROJECT = 'example-store-play';

/**
 * Runtime PKCS#8 material. Apple ASC keys are P-256. Google service accounts
 * are RSA. Nothing here is committed as a PEM block.
 */
function generatePkcs8Pem(kind: 'apple' | 'google'): string {
  if (kind === 'apple') {
    const { privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    return privateKey;
  }

  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return privateKey;
}

function requireNormalizedPem(kind: 'apple' | 'google'): string {
  const normalized = normalizePrivateKeyPem(generatePkcs8Pem(kind));
  if (!normalized) {
    throw new Error('Generated key was not a PKCS#8 private key');
  }
  return normalized;
}

function markerFromPem(pem: string): string {
  const body = pem.split('\n').filter(line => !line.startsWith('-----')).join('');
  for (let index = 0; index <= body.length - 24; index += 1) {
    const slice = body.slice(index, index + 24);
    if (/[^0-9a-f]/i.test(slice)) {
      return slice;
    }
  }
  return body.slice(0, 24);
}

const APPLE_PEM = requireNormalizedPem('apple');
const GOOGLE_PEM = requireNormalizedPem('google');
const APPLE_MARKER = markerFromPem(APPLE_PEM);
const GOOGLE_MARKER = markerFromPem(GOOGLE_PEM);

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(storeCredentialJsonErrorHandler);
  app.use('/api/v1/*', strictStoreValidation);
  app.use('/api/v1/*', auditLogger);
  app.use('/api/v1', storeCredentialsRoutes);
  app.use((err: { message?: string; body?: unknown }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const serialized = `${err?.message ?? ''} ${typeof err?.body === 'string' ? err.body : ''}`;
    res.status(500).json({
      fallback: true,
      leaked: serialized.includes(APPLE_MARKER),
    });
  });
  return app;
};

const googleAccount = (overrides: Record<string, unknown> = {}) => ({
  type: 'service_account',
  project_id: GOOGLE_PROJECT,
  private_key_id: GOOGLE_KEY_ID,
  private_key: GOOGLE_PEM,
  client_email: GOOGLE_EMAIL,
  client_id: '123456789012345678901',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/play-submit%40example-store.iam.gserviceaccount.com',
  universe_domain: 'googleapis.com',
  ...overrides,
});

const expectNoSecrets = (value: unknown) => {
  const json = JSON.stringify(value);
  expect(json).not.toContain('BEGIN PRIVATE KEY');
  expect(json).not.toContain(APPLE_MARKER);
  expect(json).not.toContain(GOOGLE_MARKER);
  expect(json).not.toContain('"private_key"');
  expect(json).not.toContain('"privateKey"');
  expect(json).not.toContain(APPLE_KEY_ID);
  expect(json).not.toContain(APPLE_ISSUER_ID);
  expect(json).not.toContain(GOOGLE_KEY_ID);
  expect(json).not.toContain(GOOGLE_PROJECT);
  expect(json).not.toContain('ciphertext');
  expect(json).not.toContain('serviceAccount');
};

const flushAudit = async () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise(resolve => setImmediate(resolve));
    const saved = await AuditLog.findOne({ method: 'POST', statusCode: 200 });
    if (saved) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
};

describe('store credential encryption', () => {
  test('seals the Apple and Google payloads and opens them without echoing secrets on failure', () => {
    const appleBlob = protectCredentialJson({
      kind: 'apple-asc-api-key',
      keyId: APPLE_KEY_ID,
      issuerId: APPLE_ISSUER_ID,
      privateKey: APPLE_PEM,
    });
    const googleBlob = protectCredentialJson({
      kind: 'google-play-service-account',
      serviceAccount: googleAccount(),
    });

    expect(appleBlob).not.toContain(APPLE_MARKER);
    expect(appleBlob).not.toContain('BEGIN');
    expect(googleBlob).not.toContain(GOOGLE_MARKER);
    expect(googleBlob).not.toContain(GOOGLE_EMAIL);
    expect(googleBlob.split(':')).toHaveLength(3);

    const apple = readCredentialJson(appleBlob);
    expect(apple.kind).toBe('apple-asc-api-key');
    expect(apple.keyId).toBe(APPLE_KEY_ID);
    expect(apple.privateKey).toBe(APPLE_PEM);

    const google = readCredentialJson(googleBlob);
    const account = google.serviceAccount as { private_key: string; project_id: string; client_email: string };
    expect(account.private_key).toContain(GOOGLE_MARKER);
    expect(account.project_id).toBe(GOOGLE_PROJECT);
    expect(account.client_email).toBe(GOOGLE_EMAIL);

    const flipped = appleBlob.endsWith('0') ? '1' : '0';
    const tampered = `${appleBlob.slice(0, -1)}${flipped}`;
    expect(() => readCredentialJson(tampered)).toThrow(StoreCredentialsUnreadableError);
    expect(() => readCredentialJson(APPLE_PEM)).toThrow(StoreCredentialsUnreadableError);
    try {
      readCredentialJson(APPLE_PEM);
    } catch (error) {
      expect((error as Error).message).not.toContain(APPLE_MARKER);
      expect((error as Error).message).not.toContain('BEGIN PRIVATE KEY');
    }

    expect(() => decrypt(APPLE_PEM)).toThrow('Failed to decrypt data');
  });

  test('strips credential query params so access logs cannot keep the key', () => {
    const url = redactCredentialQueryUrl(
      `/api/v1/store-credentials/apple?storeId=abc&privateKey=${encodeURIComponent(APPLE_PEM)}`
    );
    expect(url).toBe('/api/v1/store-credentials/apple?storeId=abc');
    expect(url).not.toContain(APPLE_MARKER);
    expect(url).not.toContain('BEGIN');
  });

  test('flags private keys and service-account objects as unsafe to send', () => {
    expect(responseContainsCredentialSecret({
      apple: { status: 'connected', keyIdLast4: '34EF' },
    })).toBe(false);
    expect(responseContainsCredentialSecret({ privateKey: APPLE_PEM })).toBe(true);
    expect(responseContainsCredentialSecret({
      google: { private_key: GOOGLE_PEM },
    })).toBe(true);
    expect(responseContainsCredentialSecret({
      note: `prefix ${APPLE_PEM}`,
    })).toBe(true);
  });
});

describe('Store credentials API (issue #185)', () => {
  const app = buildTestApp();
  let storeAId: string;
  let storeBId: string;
  let ownerAToken: string;
  let adminBToken: string;
  let customerToken: string;
  let opsToken: string;

  beforeEach(async () => {
    const [storeA, storeB] = await Promise.all([
      Store.create({ name: 'Credential Store A', slug: 'credential-store-a', shopify: {} }),
      Store.create({ name: 'Credential Store B', slug: 'credential-store-b', shopify: {} }),
    ]);
    storeAId = storeA._id.toString();
    storeBId = storeB._id.toString();

    const [ownerA, adminB, customer, ops] = await Promise.all([
      User.create({
        name: 'Credential Owner A',
        email: 'credential-owner-a@example.com',
        password: 'password123',
        role: 'super_admin',
        isActive: true,
        isPlatformOperator: false,
        storeId: storeA._id,
      }),
      User.create({
        name: 'Credential Admin B',
        email: 'credential-admin-b@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: storeB._id,
      }),
      User.create({
        name: 'Credential Customer',
        email: 'credential-customer@example.com',
        password: 'password123',
        role: 'customer',
        isActive: true,
        storeId: storeA._id,
      }),
      User.create({
        name: 'Credential Ops',
        email: 'credential-ops@example.com',
        password: 'password123',
        role: 'super_admin',
        isActive: true,
        isVerified: false,
        isPlatformOperator: true,
        storeId: storeA._id,
      }),
    ]);

    ownerAToken = generateToken(ownerA._id.toString());
    adminBToken = generateToken(adminB._id.toString());
    customerToken = generateToken(customer._id.toString());
    opsToken = generateToken(ops._id.toString());
  });

  const auth = (token?: string, headerStoreId?: string) => {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (headerStoreId) {
      headers['X-Store-ID'] = headerStoreId;
    }
    return headers;
  };

  test('store owner can upsert, read status, and delete without leaking secrets', async () => {
    const missing = await request(app)
      .get('/api/v1/store-credentials')
      .set(auth(ownerAToken, storeBId));
    expect(missing.status).toBe(200);
    expect(missing.body).toEqual({
      success: true,
      data: {
        apple: { status: 'missing' },
        google: { status: 'missing' },
      },
    });

    const apple = await request(app)
      .post('/api/v1/store-credentials/apple')
      .set(auth(ownerAToken, storeBId))
      .field('keyId', APPLE_KEY_ID)
      .field('issuerId', APPLE_ISSUER_ID)
      .field('storeId', storeBId)
      .attach('privateKey', Buffer.from(APPLE_PEM), {
        filename: `AuthKey_${APPLE_KEY_ID}.p8`,
        contentType: 'application/octet-stream',
      });

    expect(apple.status).toBe(200);
    expect(apple.body.success).toBe(true);
    expect(apple.body.data.apple.status).toBe('connected');
    expect(apple.body.data.apple.keyIdLast4).toBe('34EF');
    expect(apple.body.data.apple.issuerIdLast4).toBe('072a');
    expect(apple.body.data.apple.updatedAt).toEqual(expect.any(String));
    expect(apple.body.data.google.status).toBe('missing');
    expect(Object.keys(apple.body.data.apple).sort()).toEqual(
      ['issuerIdLast4', 'keyIdLast4', 'status', 'updatedAt'].sort()
    );
    expectNoSecrets(apple.body);

    const google = await request(app)
      .post('/api/v1/store-credentials/google')
      .set(auth(ownerAToken))
      .send({ serviceAccount: googleAccount(), storeId: storeBId });
    expect(google.status).toBe(200);
    expect(google.body.data.google).toMatchObject({
      status: 'connected',
      clientEmail: GOOGLE_EMAIL,
      privateKeyIdLast4: 'abcd',
    });
    expect(google.body.data.apple.status).toBe('connected');
    expectNoSecrets(google.body);

    const stored = await StoreAppCredentials.findOne({ storeId: storeAId }).lean();
    expect(stored?.apple?.ciphertext).toBeUndefined();
    expect(stored?.google?.ciphertext).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain(APPLE_MARKER);
    expect(JSON.stringify(stored)).not.toContain(GOOGLE_MARKER);

    const raw = await StoreAppCredentials.collection.findOne({
      storeId: new mongoose.Types.ObjectId(storeAId),
    });
    const appleCiphertext = (raw as { apple?: { ciphertext?: string } } | null)?.apple?.ciphertext;
    const googleCiphertext = (raw as { google?: { ciphertext?: string } } | null)?.google?.ciphertext;
    expect(appleCiphertext).toEqual(expect.any(String));
    expect(googleCiphertext).toEqual(expect.any(String));
    expect(appleCiphertext).not.toContain(APPLE_MARKER);
    expect(googleCiphertext).not.toContain(GOOGLE_MARKER);
    expect(decrypt(appleCiphertext as string)).toContain(APPLE_MARKER);
    expect(decrypt(appleCiphertext as string)).toContain(APPLE_KEY_ID);
    const googlePlain = decrypt(googleCiphertext as string);
    expect(googlePlain).toContain(GOOGLE_MARKER);
    expect(googlePlain).toContain(GOOGLE_PROJECT);
    expect(googlePlain).toContain('https://oauth2.googleapis.com/token');

    const otherStore = await StoreAppCredentials.collection.findOne({
      storeId: new mongoose.Types.ObjectId(storeBId),
    });
    expect(otherStore).toBeNull();

    const listed = await request(app)
      .get('/api/v1/store-credentials')
      .set(auth(adminBToken));
    expect(listed.status).toBe(200);
    expect(listed.body.data.apple.status).toBe('missing');
    expect(listed.body.data.google.status).toBe('missing');
    expectNoSecrets(listed.body);

    const removedApple = await request(app)
      .delete('/api/v1/store-credentials/apple')
      .set(auth(ownerAToken));
    expect(removedApple.status).toBe(200);
    expect(removedApple.body.data.apple.status).toBe('missing');
    expect(removedApple.body.data.google.status).toBe('connected');
    expectNoSecrets(removedApple.body);

    const removedGoogle = await request(app)
      .delete('/api/v1/store-credentials/google')
      .set(auth(ownerAToken));
    expect(removedGoogle.status).toBe(200);
    expect(removedGoogle.body.data.google.status).toBe('missing');
    expect(await StoreAppCredentials.countDocuments({ storeId: storeAId })).toBe(0);

    const removedAgain = await request(app)
      .delete('/api/v1/store-credentials/apple')
      .set(auth(ownerAToken));
    expect(removedAgain.status).toBe(200);
    expect(removedAgain.body.data.apple.status).toBe('missing');
  });

  test('JSON Apple upload and a Google file upload stay on the caller store', async () => {
    const apple = await request(app)
      .post('/api/v1/store-credentials/apple')
      .set(auth(adminBToken, storeAId))
      .send({
        keyId: APPLE_KEY_ID,
        issuerId: APPLE_ISSUER_ID,
        privateKey: APPLE_PEM,
        storeId: storeAId,
      });
    expect(apple.status).toBe(200);
    expect(apple.body.data.apple.keyIdLast4).toBe('34EF');
    expectNoSecrets(apple.body);

    const google = await request(app)
      .post('/api/v1/store-credentials/google')
      .set(auth(adminBToken))
      .attach('serviceAccount', Buffer.from(JSON.stringify(googleAccount())), {
        filename: 'play-service-account.json',
        contentType: 'application/json',
      });
    expect(google.status).toBe(200);
    expect(google.body.data.google.clientEmail).toBe(GOOGLE_EMAIL);
    expectNoSecrets(google.body);

    const onA = await StoreAppCredentials.countDocuments({ storeId: storeAId });
    const onB = await StoreAppCredentials.countDocuments({ storeId: storeBId });
    expect(onA).toBe(0);
    expect(onB).toBe(1);

    const stolen = await request(app)
      .delete('/api/v1/store-credentials/google')
      .set(auth(ownerAToken, storeBId));
    expect(stolen.status).toBe(200);
    expect(stolen.body.data.google.status).toBe('missing');
    expect(await StoreAppCredentials.countDocuments({ storeId: storeBId })).toBe(1);
  });

  test('invalid uploads do not persist or echo the private key', async () => {
    const apple = await request(app)
      .post('/api/v1/store-credentials/apple')
      .set(auth(ownerAToken))
      .send({
        keyId: APPLE_PEM,
        issuerId: APPLE_PEM,
        privateKey: APPLE_PEM,
      });
    expect(apple.status).toBe(400);
    expect(apple.body.code).toBe('STORE_CREDENTIALS_INVALID');
    expect(typeof apple.body.error).toBe('string');
    expectNoSecrets(apple.body);

    const google = await request(app)
      .post('/api/v1/store-credentials/google')
      .set(auth(ownerAToken))
      .send({
        type: 'not_a_service_account',
        private_key: GOOGLE_PEM,
        client_email: GOOGLE_EMAIL,
      });
    expect(google.status).toBe(400);
    expect(google.body.code).toBe('STORE_CREDENTIALS_INVALID');
    expectNoSecrets(google.body);
    expect(await StoreAppCredentials.countDocuments()).toBe(0);
  });

  test('malformed JSON does not return the pasted private key', async () => {
    const raw = `{"keyId":"${APPLE_KEY_ID}","issuerId":"${APPLE_ISSUER_ID}","privateKey":"${APPLE_PEM}"}`;
    const apple = await request(app)
      .post('/api/v1/store-credentials/apple')
      .set(auth(ownerAToken))
      .set('Content-Type', 'application/json')
      .send(raw);

    expect(apple.status).toBe(400);
    expect(apple.body).toEqual({
      success: false,
      error: 'Check the key ID and issuer ID, then upload the App Store Connect API key (.p8) again.',
      code: 'STORE_CREDENTIALS_INVALID',
    });
    expectNoSecrets(apple.body);
    expect(apple.body.fallback).toBeUndefined();
    expect(await StoreAppCredentials.countDocuments()).toBe(0);

    const other = await request(app)
      .post('/api/v1/not-credentials')
      .set('Content-Type', 'application/json')
      .send(raw);
    expect(other.status).toBe(500);
    expect(other.body).toEqual({ fallback: true, leaked: true });
    expect(JSON.stringify(other.body)).not.toContain(APPLE_MARKER);
  });

  test('query-string keys are rejected and audit logs do not store the private key', async () => {
    const rejected = await request(app)
      .post(`/api/v1/store-credentials/apple?privateKey=${encodeURIComponent(APPLE_PEM)}`)
      .set(auth(ownerAToken))
      .send({
        keyId: APPLE_KEY_ID,
        issuerId: APPLE_ISSUER_ID,
        privateKey: APPLE_PEM,
      });
    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe('STORE_CREDENTIALS_INVALID');
    expectNoSecrets(rejected.body);
    expect(await StoreAppCredentials.countDocuments()).toBe(0);

    const saved = await request(app)
      .post('/api/v1/store-credentials/apple')
      .set(auth(ownerAToken))
      .send({
        keyId: APPLE_KEY_ID,
        issuerId: APPLE_ISSUER_ID,
        privateKey: APPLE_PEM,
      });
    expect(saved.status).toBe(200);
    await flushAudit();

    const logs = await AuditLog.find().lean();
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain(APPLE_MARKER);
    expect(JSON.stringify(logs)).not.toContain('BEGIN PRIVATE KEY');
    expect(JSON.stringify(logs)).not.toContain(APPLE_KEY_ID);
    const savedLog = logs.find(log => log.method === 'POST' && log.statusCode === 200);
    expect(savedLog?.requestBody).toEqual({ redacted: true });
  });

  test('a stored secret that cannot be decrypted is needsAttention and is not returned', async () => {
    await request(app)
      .post('/api/v1/store-credentials/apple')
      .set(auth(ownerAToken))
      .send({
        keyId: APPLE_KEY_ID,
        issuerId: APPLE_ISSUER_ID,
        privateKey: APPLE_PEM,
      });

    await StoreAppCredentials.collection.updateOne(
      { storeId: new mongoose.Types.ObjectId(storeAId) },
      { $set: { 'apple.ciphertext': APPLE_PEM, 'apple.keyIdLast4': APPLE_MARKER } }
    );

    const status = await request(app)
      .get('/api/v1/store-credentials')
      .set(auth(ownerAToken));
    expect(status.status).toBe(200);
    expect(status.body.data.apple.status).toBe('needsAttention');
    expect(status.body.data.apple.message).toBe('Upload the App Store Connect API key again.');
    expect(status.body.data.apple.keyIdLast4).toBeUndefined();
    expectNoSecrets(status.body);

    const originalKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = 'different-encryption-key-0123456789abc';
    try {
      await StoreAppCredentials.collection.updateOne(
        { storeId: new mongoose.Types.ObjectId(storeAId) },
        {
          $set: {
            'apple.ciphertext': protectCredentialJson({
              kind: 'apple-asc-api-key',
              keyId: APPLE_KEY_ID,
              issuerId: APPLE_ISSUER_ID,
              privateKey: APPLE_PEM,
            }),
            'apple.keyIdLast4': '34EF',
          },
        }
      );
      process.env.ENCRYPTION_KEY = originalKey;
      const rotated = await request(app)
        .get('/api/v1/store-credentials')
        .set(auth(ownerAToken));
      expect(rotated.body.data.apple.status).toBe('needsAttention');
      expectNoSecrets(rotated.body);
    } finally {
      process.env.ENCRYPTION_KEY = originalKey;
    }
  });

  test('customers and anonymous callers cannot read or change credentials', async () => {
    const customerGet = await request(app)
      .get('/api/v1/store-credentials')
      .set(auth(customerToken));
    expect(customerGet.status).toBe(403);
    expect(customerGet.body.success).toBe(false);

    const anon = await request(app)
      .post('/api/v1/store-credentials/google')
      .send(googleAccount());
    expect(anon.status).toBe(401);
    expect(JSON.stringify(anon.body)).not.toContain(GOOGLE_MARKER);
    expect(await StoreAppCredentials.countDocuments()).toBe(0);
  });

  test('platform ops can read another store status and merchants cannot', async () => {
    await request(app)
      .post('/api/v1/store-credentials/google')
      .set(auth(adminBToken))
      .send(googleAccount());

    const ops = await request(app)
      .get(`/api/v1/admin/store-credentials/${storeBId}`)
      .set(auth(opsToken, storeAId));
    expect(ops.status).toBe(200);
    expect(ops.body.data.storeId).toBe(storeBId);
    expect(ops.body.data.google).toMatchObject({
      status: 'connected',
      clientEmail: GOOGLE_EMAIL,
      privateKeyIdLast4: 'abcd',
    });
    expect(ops.body.data.apple.status).toBe('missing');
    expectNoSecrets(ops.body);

    const merchant = await request(app)
      .get(`/api/v1/admin/store-credentials/${storeBId}`)
      .set(auth(ownerAToken));
    expect(merchant.status).toBe(403);
    expect(merchant.body).toEqual({
      success: false,
      error: 'Platform admin access required',
    });
    expectNoSecrets(merchant.body);

    const missing = await request(app)
      .get(`/api/v1/admin/store-credentials/${new mongoose.Types.ObjectId().toString()}`)
      .set(auth(opsToken));
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ success: false, error: 'Store not found' });

    const invalid = await request(app)
      .get('/api/v1/admin/store-credentials/not-a-store')
      .set(auth(opsToken));
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('STORE_CREDENTIALS_INVALID');

    const unsigned = await request(app).get(`/api/v1/admin/store-credentials/${storeBId}`);
    expect(unsigned.status).toBe(401);
  });

  test('oversized uploads are rejected without saving', async () => {
    const huge = Buffer.alloc(70 * 1024, 1);
    const response = await request(app)
      .post('/api/v1/store-credentials/apple')
      .set(auth(ownerAToken))
      .field('keyId', APPLE_KEY_ID)
      .field('issuerId', APPLE_ISSUER_ID)
      .attach('privateKey', huge, {
        filename: 'AuthKey.p8',
        contentType: 'application/octet-stream',
      });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('STORE_CREDENTIALS_INVALID');
    expect(response.body.error).not.toContain(APPLE_MARKER);
    expect(await StoreAppCredentials.countDocuments()).toBe(0);
  });
});
