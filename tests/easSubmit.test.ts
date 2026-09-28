import { generateKeyPairSync } from 'crypto';
import express from 'express';
import { readdir, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import AuditLog from '../src/models/AuditLog';
import BuildRequest from '../src/models/BuildRequest';
import Store from '../src/models/Store';
import StoreAppCredentials from '../src/models/StoreAppCredentials';
import StoreSubmitJob from '../src/models/StoreSubmitJob';
import User from '../src/models/User';
import { auditLogger } from '../src/middleware/auditLogger';
import { redactCredentialQueryUrl } from '../src/middleware/redactCredentialQuery';
import { strictStoreValidation } from '../src/middleware/strictStoreValidation';
import storeSubmitRoutes from '../src/routes/storeSubmitRoutes';
import { EAS_SUBMIT_MESSAGES, pollInFlightStoreSubmits, redactSubmitLogText } from '../src/services/easSubmitService';
import {
  normalizePrivateKeyPem,
  responseContainsCredentialSecret,
  saveAppleCredentials,
  saveGoogleCredentials,
} from '../src/services/storeCredentialsService';
import { EPHEMERAL_SECRET_DIR_PREFIX, withEphemeralSecretFile } from '../src/utils/ephemeralSecretFile';
import { generateToken } from '../src/utils/jwt';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-0123456789abcdef';

const EXPO_TOKEN = 'expo-robot-token-value-not-a-real-secret';
const PROJECT_ID = 'a415eac6-231a-4b38-b481-3255a59f13b8';
const OTHER_PROJECT_ID = '99999999-9999-4999-8999-999999999999';
const BUILD_IOS = '33333333-3333-4333-8333-333333333333';
const BUILD_ANDROID = '44444444-4444-4444-8444-444444444444';
const SUBMISSION_IOS = '77777777-7777-4777-8777-777777777777';
const SUBMISSION_ANDROID = '88888888-8888-4888-8888-888888888888';
const APPLE_KEY_ID = 'AB12CD34EF';
const APPLE_ISSUER_ID = '57246542-96fe-1a63-e053-0824d011072a';
const GOOGLE_KEY_ID = 'abc123def4567890abcd';
const GOOGLE_EMAIL = 'play-submit@example-store.iam.gserviceaccount.com';
const GOOGLE_PROJECT = 'example-store-play';

const ENV_KEYS = ['EAS_SUBMIT_AUTOMATION', 'EXPO_TOKEN', 'EAS_PROJECT_ID', 'EAS_WORKFLOW_FILE', 'EAS_GIT_REF'] as const;

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

const googleAccount = () => ({
  type: 'service_account',
  project_id: GOOGLE_PROJECT,
  private_key_id: GOOGLE_KEY_ID,
  private_key: GOOGLE_PEM,
  client_email: GOOGLE_EMAIL,
  client_id: '123456789012345678901',
  token_uri: 'https://oauth2.googleapis.com/token',
});

interface RecordedCall {
  url: string;
  method: string;
  authorization: string;
  body?: string;
}

const buildTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', strictStoreValidation);
  app.use('/api/v1', auditLogger);
  app.use('/api/v1', storeSubmitRoutes);
  return app;
};

const leftoverSecretDirs = async (): Promise<string[]> => {
  const names = await readdir(tmpdir());
  return names.filter(name => name.startsWith(EPHEMERAL_SECRET_DIR_PREFIX));
};

describe('ephemeral submit files', () => {
  test('overwrites and deletes the secret file, including when the call throws', async () => {
    const secret = Buffer.from(APPLE_PEM, 'utf8');
    let sawFile = false;
    await withEphemeralSecretFile(secret, async (readBack) => {
      const names = await leftoverSecretDirs();
      expect(names).toHaveLength(1);
      expect(names[0]).not.toContain(APPLE_MARKER);
      const file = await readFile(join(tmpdir(), names[0], 'key'));
      expect(file.toString('utf8')).toContain(APPLE_MARKER);
      sawFile = true;
      const copy = await readBack();
      expect(copy.toString('utf8')).toContain(APPLE_MARKER);
      copy.fill(0);
    });
    expect(sawFile).toBe(true);
    expect(secret.every(byte => byte === 0)).toBe(true);
    expect(await leftoverSecretDirs()).toEqual([]);

    const again = Buffer.from(GOOGLE_PEM, 'utf8');
    await expect(withEphemeralSecretFile(again, async () => {
      throw new Error(`boom ${GOOGLE_MARKER}`);
    })).rejects.toThrow(GOOGLE_MARKER);
    expect(again.every(byte => byte === 0)).toBe(true);
    expect(await leftoverSecretDirs()).toEqual([]);
  });

  test('redacts pem blocks and strips key query params', () => {
    const previous = process.env.EXPO_TOKEN;
    process.env.EXPO_TOKEN = EXPO_TOKEN;
    const logged = redactSubmitLogText(`failed ${APPLE_PEM} token ${EXPO_TOKEN} {"private_key":"${GOOGLE_PEM}"}`);
    if (previous === undefined) {
      delete process.env.EXPO_TOKEN;
    } else {
      process.env.EXPO_TOKEN = previous;
    }
    expect(logged).not.toContain(APPLE_MARKER);
    expect(logged).not.toContain(GOOGLE_MARKER);
    expect(logged).not.toContain('BEGIN PRIVATE KEY');
    expect(logged).not.toContain(EXPO_TOKEN);

    const url = redactCredentialQueryUrl(
      `/api/v1/build-requests/abc/submits?keyP8=${encodeURIComponent(APPLE_PEM)}&platform=ios`
    );
    expect(url).toBe('/api/v1/build-requests/abc/submits?platform=ios');
    expect(url).not.toContain(APPLE_MARKER);
    expect(responseContainsCredentialSecret({ keyP8: APPLE_PEM })).toBe(true);
    expect(responseContainsCredentialSecret({ googleServiceAccountKeyJson: '{}' })).toBe(true);
  });
});

describe('EAS submit (issue #187)', () => {
  const app = buildTestApp();
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
  let storeAId: string;
  let storeBId: string;
  let adminAId: string;
  let adminAToken: string;
  let adminBToken: string;
  let customerToken: string;
  let calls: RecordedCall[];
  let logs: string[];
  let iosSubmissionStatus: string;
  let androidSubmissionStatus: string;
  let iosBuildProject: string;
  let createMode: 'ok' | 'graphql-error' | 'network';

  beforeEach(async () => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    calls = [];
    logs = [];
    iosSubmissionStatus = 'IN_QUEUE';
    androidSubmissionStatus = 'IN_QUEUE';
    iosBuildProject = PROJECT_ID;
    createMode = 'ok';
    jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
    });
    jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
    });
    jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
    });

    const [storeA, storeB] = await Promise.all([
      Store.create({ name: 'Submit Store A', slug: 'submit-store-a', shopify: {} }),
      Store.create({ name: 'Submit Store B', slug: 'submit-store-b', shopify: {} }),
    ]);
    storeAId = storeA._id.toString();
    storeBId = storeB._id.toString();

    const [adminA, adminB, customer] = await Promise.all([
      User.create({
        name: 'Submit Admin A',
        email: 'submit-admin-a@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: storeA._id,
      }),
      User.create({
        name: 'Submit Admin B',
        email: 'submit-admin-b@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: storeB._id,
      }),
      User.create({
        name: 'Submit Customer',
        email: 'submit-customer@example.com',
        password: 'password123',
        role: 'customer',
        isActive: true,
        storeId: storeA._id,
      }),
    ]);
    adminAId = adminA._id.toString();
    adminAToken = generateToken(adminA._id.toString());
    adminBToken = generateToken(adminB._id.toString());
    customerToken = generateToken(customer._id.toString());
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    expect(await leftoverSecretDirs()).toEqual([]);
  });

  const enableSubmit = () => {
    process.env.EAS_SUBMIT_AUTOMATION = '1';
    process.env.EXPO_TOKEN = EXPO_TOKEN;
    process.env.EAS_PROJECT_ID = PROJECT_ID;
  };

  const mockFetch = () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const headers = new Headers(init?.headers);
      const call: RecordedCall = {
        url: String(input),
        method: init?.method ?? 'GET',
        authorization: headers.get('authorization') ?? '',
        body: typeof init?.body === 'string' ? init.body : undefined,
      };
      calls.push(call);
      if (createMode === 'network' && call.body?.includes('Submission')) {
        throw new Error(`network down Authorization Bearer ${EXPO_TOKEN} ${APPLE_PEM}`);
      }
      const body = call.body ?? '';
      let json: unknown;
      if (body.includes('EasBuildById')) {
        const buildId = body.includes(BUILD_ANDROID) ? BUILD_ANDROID : BUILD_IOS;
        const platform = buildId === BUILD_ANDROID ? 'ANDROID' : 'IOS';
        json = {
          data: {
            builds: {
              byId: {
                id: buildId,
                status: 'FINISHED',
                platform,
                project: { id: platform === 'IOS' ? iosBuildProject : PROJECT_ID },
                artifacts: {
                  buildUrl: `https://expo.dev/accounts/cartaisy/projects/app/builds/${buildId}`,
                  applicationArchiveUrl: null,
                },
              },
            },
          },
        };
      } else if (body.includes('CreateIosSubmission') || body.includes('CreateAndroidSubmission')) {
        if (createMode === 'graphql-error') {
          json = {
            data: null,
            errors: [{ message: `Apple rejected the key ${APPLE_PEM} ${GOOGLE_PEM}` }],
          };
        } else if (body.includes('CreateIosSubmission')) {
          json = {
            data: {
              submission: {
                createIosSubmission: {
                  submission: { id: SUBMISSION_IOS, status: iosSubmissionStatus },
                },
              },
            },
          };
        } else {
          json = {
            data: {
              submission: {
                createAndroidSubmission: {
                  submission: { id: SUBMISSION_ANDROID, status: androidSubmissionStatus },
                },
              },
            },
          };
        }
      } else if (body.includes('SubmissionById')) {
        const ios = body.includes(SUBMISSION_IOS);
        json = {
          data: {
            submissions: {
              byId: {
                id: ios ? SUBMISSION_IOS : SUBMISSION_ANDROID,
                status: ios ? iosSubmissionStatus : androidSubmissionStatus,
                platform: ios ? 'IOS' : 'ANDROID',
                error: { errorCode: 'SUBMISSION_ERROR', message: `secret ${APPLE_PEM}` },
              },
            },
          },
        };
      } else {
        json = { data: null, errors: [{ message: APPLE_PEM }] };
      }
      return new Response(JSON.stringify(json), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  };

  const seedReady = async (storeId: string, requestedBy: string) => {
    const now = new Date();
    const created = await BuildRequest.create({
      storeId,
      requestedBy,
      platforms: {
        ios: {
          status: 'ready',
          updatedAt: now,
          installUrl: `https://expo.dev/accounts/cartaisy/projects/app/builds/${BUILD_IOS}`,
          eas: {
            workflowRunId: '11111111-1111-4111-8111-111111111111',
            buildId: BUILD_IOS,
            startedAt: now,
          },
        },
        android: {
          status: 'ready',
          updatedAt: now,
          installUrl: `https://expo.dev/accounts/cartaisy/projects/app/builds/${BUILD_ANDROID}`,
          eas: {
            workflowRunId: '22222222-2222-4222-8222-222222222222',
            buildId: BUILD_ANDROID,
            startedAt: now,
          },
        },
      },
    });
    return created._id.toString();
  };

  const connectApple = (storeId: string, userId: string) =>
    saveAppleCredentials({
      storeId,
      userId,
      body: { keyId: APPLE_KEY_ID, issuerId: APPLE_ISSUER_ID, privateKey: APPLE_PEM },
    });

  const connectGoogle = (storeId: string, userId: string) =>
    saveGoogleCredentials({
      storeId,
      userId,
      body: googleAccount(),
    });

  const postSubmit = (
    token: string,
    buildRequestId: string,
    body: Record<string, unknown>,
    headerStoreId?: string
  ) => {
    const req = request(app)
      .post(`/api/v1/build-requests/${buildRequestId}/submits`)
      .set('Authorization', `Bearer ${token}`);
    if (headerStoreId) {
      req.set('X-Store-ID', headerStoreId);
    }
    return req.send(body);
  };

  const assertNoSecrets = (value: unknown) => {
    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain(EXPO_TOKEN);
    expect(serialized).not.toContain(APPLE_MARKER);
    expect(serialized).not.toContain(GOOGLE_MARKER);
    expect(serialized).not.toContain('BEGIN PRIVATE KEY');
    expect(serialized).not.toContain(APPLE_KEY_ID);
    expect(serialized).not.toContain(APPLE_ISSUER_ID);
    expect(serialized).not.toContain(GOOGLE_KEY_ID);
    expect(serialized).not.toContain(GOOGLE_EMAIL);
    expect(serialized).not.toContain(GOOGLE_PROJECT);
    expect(serialized).not.toContain('private_key');
    expect(serialized).not.toContain('privateKey');
    expect(serialized).not.toContain('keyP8');
    expect(serialized).not.toContain('ciphertext');
    expect(serialized).not.toContain('easSubmissionId');
    expect(serialized).not.toContain('easBuildId');
    expect(serialized).not.toContain(BUILD_IOS);
    expect(serialized).not.toContain(BUILD_ANDROID);
    expect(serialized).not.toContain(SUBMISSION_IOS);
    expect(serialized).not.toContain(SUBMISSION_ANDROID);
    expect(serialized).not.toContain('Bearer ');
  };

  const assertLogsClean = () => {
    const serialized = logs.join('\n');
    expect(serialized).not.toContain(EXPO_TOKEN);
    expect(serialized).not.toContain(APPLE_MARKER);
    expect(serialized).not.toContain(GOOGLE_MARKER);
    expect(serialized).not.toContain('BEGIN PRIVATE KEY');
    expect(serialized).not.toContain(GOOGLE_EMAIL);
  };

  test('does not call Expo when the test guard is on, even if a token is present', async () => {
    const requestId = await seedReady(storeAId, adminAId);
    await connectApple(storeAId, adminAId);
    process.env.EXPO_TOKEN = EXPO_TOKEN;
    process.env.EAS_PROJECT_ID = PROJECT_ID;
    process.env.EAS_WORKFLOW_FILE = 'store-build.yml';
    mockFetch();

    const response = await postSubmit(adminAToken, requestId, { platform: 'ios' });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('SUBMIT_NOT_CONFIGURED');
    expect(response.body.error).toBe(EAS_SUBMIT_MESSAGES.notConfigured);
    expect(calls).toHaveLength(0);
    expect(await StoreSubmitJob.countDocuments()).toBe(0);
    assertNoSecrets(response.body);
    assertLogsClean();
  });

  test('rejects a missing Apple key and a needs-attention key without calling Expo', async () => {
    enableSubmit();
    mockFetch();
    const requestId = await seedReady(storeAId, adminAId);

    const missing = await postSubmit(adminAToken, requestId, { platform: 'ios' });
    expect(missing.status).toBe(409);
    expect(missing.body.code).toBe('SUBMIT_CREDENTIALS_MISSING');
    expect(missing.body.error).toBe(EAS_SUBMIT_MESSAGES.credentialsMissingApple);
    expect(calls).toHaveLength(0);
    assertNoSecrets(missing.body);

    await connectApple(storeAId, adminAId);
    const stored = await StoreAppCredentials.findOne({ storeId: storeAId }).select('+apple.ciphertext');
    const ciphertext = stored?.apple?.ciphertext ?? '';
    const flipped = ciphertext.endsWith('0') ? '1' : '0';
    await StoreAppCredentials.updateOne(
      { storeId: storeAId },
      { $set: { 'apple.ciphertext': `${ciphertext.slice(0, -1)}${flipped}` } }
    );

    const attention = await postSubmit(adminAToken, requestId, { platform: 'ios' });
    expect(attention.status).toBe(409);
    expect(attention.body.code).toBe('SUBMIT_CREDENTIALS_NEEDS_ATTENTION');
    expect(attention.body.error).toBe(EAS_SUBMIT_MESSAGES.credentialsNeedsAttentionApple);
    expect(calls).toHaveLength(0);
    expect(await StoreSubmitJob.countDocuments()).toBe(0);
    assertNoSecrets(attention.body);
    assertLogsClean();
  });

  test('rejects a missing Google key and a build that is not a finished artifact', async () => {
    enableSubmit();
    mockFetch();
    const requestId = await seedReady(storeAId, adminAId);
    await connectApple(storeAId, adminAId);

    const missingGoogle = await postSubmit(adminAToken, requestId, { platform: 'android' });
    expect(missingGoogle.status).toBe(409);
    expect(missingGoogle.body.code).toBe('SUBMIT_CREDENTIALS_MISSING');
    expect(missingGoogle.body.error).toBe(EAS_SUBMIT_MESSAGES.credentialsMissingGoogle);
    assertNoSecrets(missingGoogle.body);

    await BuildRequest.updateOne(
      { _id: requestId, storeId: storeAId },
      { $set: { 'platforms.ios.status': 'building' }, $unset: { 'platforms.ios.eas': '' } }
    );
    const noArtifact = await postSubmit(adminAToken, requestId, { platform: 'ios' });
    expect(noArtifact.status).toBe(409);
    expect(noArtifact.body.code).toBe('SUBMIT_ARTIFACT_MISSING');
    expect(calls).toHaveLength(0);
    assertNoSecrets(noArtifact.body);
  });

  test('submits iOS with the store key, then polls to submitted without leaking secrets', async () => {
    enableSubmit();
    mockFetch();
    const requestId = await seedReady(storeAId, adminAId);
    const otherRequestId = await seedReady(storeBId, adminAId);
    await connectApple(storeAId, adminAId);

    const created = await postSubmit(adminAToken, requestId, { platform: 'ios' });

    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('submitting');
    expect(created.body.data.platform).toBe('ios');
    expect(created.body.data.buildRequestId).toBe(requestId);
    assertNoSecrets(created.body);
    expect(calls).toHaveLength(2);
    expect(calls[0].authorization).toBe(`Bearer ${EXPO_TOKEN}`);
    expect(calls[0].body).not.toContain(APPLE_MARKER);
    expect(calls[1].body).toContain('CreateIosSubmission');
    expect(calls[1].body).toContain(APPLE_MARKER);
    expect(calls[1].body).toContain(APPLE_KEY_ID);
    expect(calls[1].body).toContain(APPLE_ISSUER_ID);
    expect(calls[1].body).toContain(BUILD_IOS);
    expect(calls[1].body).not.toContain(EXPO_TOKEN);
    expect(calls[1].url).toBe('https://api.expo.dev/graphql');
    expect(process.env.EAS_WORKFLOW_FILE).toBeUndefined();

    const stored = await StoreSubmitJob.findOne({ storeId: storeAId }).lean();
    expect(stored?.status).toBe('submitting');
    expect(stored?.easSubmissionId).toBe(SUBMISSION_IOS);
    expect(JSON.stringify(stored)).not.toContain(APPLE_MARKER);
    expect(JSON.stringify(stored)).not.toContain(EXPO_TOKEN);

    const isolated = await postSubmit(adminBToken, requestId, { platform: 'ios' });
    expect(isolated.status).toBe(404);
    expect(isolated.body.error).toBe('Build request not found');
    assertNoSecrets(isolated.body);

    const headerSwitch = await postSubmit(adminAToken, otherRequestId, { platform: 'ios' }, storeBId);
    expect(headerSwitch.status).toBe(404);

    iosSubmissionStatus = 'FINISHED';
    const polled = await request(app)
      .get(`/api/v1/build-requests/${requestId}/submits/ios`)
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(polled.status).toBe(200);
    expect(polled.body.data.status).toBe('submitted');
    expect(polled.body.data.message).toBeUndefined();
    assertNoSecrets(polled.body);

    const otherList = await request(app)
      .get(`/api/v1/build-requests/${requestId}/submits`)
      .set('Authorization', `Bearer ${adminBToken}`);
    expect(otherList.status).toBe(404);
    assertLogsClean();
  });

  test('submits Android from the temp service-account file and hides Expo error text', async () => {
    enableSubmit();
    mockFetch();
    const requestId = await seedReady(storeAId, adminAId);
    await connectGoogle(storeAId, adminAId);
    let fileDuringCall = '';

    const fetchSpy = jest.spyOn(global, 'fetch');
    fetchSpy.mockImplementation(async (input, init) => {
      const headers = new Headers(init?.headers);
      const call: RecordedCall = {
        url: String(input),
        method: init?.method ?? 'GET',
        authorization: headers.get('authorization') ?? '',
        body: typeof init?.body === 'string' ? init.body : undefined,
      };
      calls.push(call);
      if (call.body?.includes('CreateAndroidSubmission')) {
        const names = await leftoverSecretDirs();
        expect(names).toHaveLength(1);
        fileDuringCall = await readFile(join(tmpdir(), names[0], 'key'), 'utf8');
      }
      const body = call.body ?? '';
      if (body.includes('EasBuildById')) {
        return new Response(JSON.stringify({
          data: {
            builds: {
              byId: {
                id: BUILD_ANDROID,
                status: 'FINISHED',
                platform: 'ANDROID',
                project: { id: PROJECT_ID },
                artifacts: { buildUrl: null, applicationArchiveUrl: null },
              },
            },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        data: null,
        errors: [{ message: `Play rejected ${GOOGLE_PEM}` }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const created = await postSubmit(adminAToken, requestId, { platform: 'android' });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('failed');
    expect(created.body.data.message).toBe(EAS_SUBMIT_MESSAGES.startFailed);
    expect(created.body.data.message).not.toContain(GOOGLE_MARKER);
    expect(fileDuringCall).toContain(GOOGLE_MARKER);
    expect(fileDuringCall).toContain(GOOGLE_EMAIL);
    expect(calls.some(call => call.body?.includes('googleServiceAccountKeyJson'))).toBe(true);
    expect(calls.some(call => (call.body ?? '').includes(GOOGLE_MARKER))).toBe(true);
    assertNoSecrets(created.body);
    expect(await leftoverSecretDirs()).toEqual([]);

    const listed = await request(app)
      .get(`/api/v1/build-requests/${requestId}/submits`)
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.submits).toHaveLength(1);
    expect(listed.body.data.submits[0].status).toBe('failed');
    assertNoSecrets(listed.body);
    assertLogsClean();

    const audit = await AuditLog.findOne({ method: 'POST', statusCode: 201 });
    expect(audit).toBeTruthy();
    expect(JSON.stringify(audit?.requestBody)).not.toContain(GOOGLE_MARKER);
    expect(JSON.stringify(audit?.requestBody)).toContain('android');
  });

  test('blocks a second in-flight submit, another store, and a customer', async () => {
    enableSubmit();
    mockFetch();
    const requestId = await seedReady(storeAId, adminAId);
    await connectApple(storeAId, adminAId);

    const first = await postSubmit(adminAToken, requestId, { platform: 'ios' });
    expect(first.status).toBe(201);
    const callsAfterFirst = calls.length;

    const second = await postSubmit(adminAToken, requestId, { platform: 'ios' });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('SUBMIT_ALREADY_IN_PROGRESS');
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(second.body.data.status).toBe('submitting');
    expect(calls).toHaveLength(callsAfterFirst);
    assertNoSecrets(second.body);

    const wrongProject = await BuildRequest.findById(requestId);
    expect(wrongProject).toBeTruthy();
    iosBuildProject = OTHER_PROJECT_ID;
    await StoreSubmitJob.updateOne({ _id: first.body.data.id, storeId: storeAId }, { $set: { status: 'failed' } });
    const mismatch = await postSubmit(adminAToken, requestId, { platform: 'ios' });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.code).toBe('SUBMIT_ARTIFACT_MISSING');
    expect(calls.every(call => !(call.body ?? '').includes('CreateIosSubmission') || call.body?.includes(APPLE_MARKER))).toBe(true);
    const createCalls = calls.filter(call => call.body?.includes('CreateIosSubmission'));
    expect(createCalls).toHaveLength(1);

    const extra = await postSubmit(adminAToken, requestId, { platform: 'ios', storeId: storeBId });
    expect(extra.status).toBe(400);
    expect(extra.body.code).toBe('SUBMIT_INVALID');

    const customer = await postSubmit(customerToken, requestId, { platform: 'ios' });
    expect(customer.status).toBe(403);
    expect(customer.body.error).toBe('Admin access required');

    const signedOut = await request(app)
      .post(`/api/v1/build-requests/${requestId}/submits`)
      .send({ platform: 'ios' });
    expect(signedOut.status).toBe(401);
    assertLogsClean();
  });

  test('background poll marks a finished submission and drops an Expo error body', async () => {
    enableSubmit();
    mockFetch();
    const requestId = await seedReady(storeAId, adminAId);
    await connectApple(storeAId, adminAId);
    const created = await postSubmit(adminAToken, requestId, { platform: 'ios' });
    expect(created.status).toBe(201);

    iosSubmissionStatus = 'ERRORED';
    await pollInFlightStoreSubmits();
    const failed = await request(app)
      .get(`/api/v1/build-requests/${requestId}/submits/ios`)
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(failed.body.data.status).toBe('failed');
    expect(failed.body.data.message).toBe(EAS_SUBMIT_MESSAGES.submitFailed);
    assertNoSecrets(failed.body);
    assertLogsClean();
    expect(await leftoverSecretDirs()).toEqual([]);
  });
});
