import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import Store from '../src/models/Store';
import User from '../src/models/User';
import BuildRequest from '../src/models/BuildRequest';
import { generateToken } from '../src/utils/jwt';
import { strictStoreValidation } from '../src/middleware/strictStoreValidation';
import buildRequestRoutes from '../src/routes/buildRequestRoutes';
import { EAS_MERCHANT_MESSAGES, pollInFlightEasBuilds } from '../src/services/easBuildService';

const SHOP_A = 'alpha.myshopify.com';
const SHOP_B = 'beta.myshopify.com';
const TOKEN_MARKER = 'shpat_should_not_appear_in_build_responses';
const EXPO_TOKEN = 'expo-robot-token-value-not-a-real-secret';
const PROJECT_ID = 'a415eac6-231a-4b38-b481-3255a59f13b8';
const OTHER_PROJECT_ID = '99999999-9999-4999-8999-999999999999';
const RUN_ANDROID = '11111111-1111-4111-8111-111111111111';
const RUN_IOS = '22222222-2222-4222-8222-222222222222';
const RUN_B = '55555555-5555-4555-8555-555555555555';
const BUILD_ANDROID = '33333333-3333-4333-8333-333333333333';
const BUILD_B = '66666666-6666-4666-8666-666666666666';
const ICON_URL = 'https://cdn.example.com/store-a-icon.png';
const UNSAFE_SPLASH = 'https://cdn.example.com/splash.png?x=shpat_should_not_send';

const ENV_KEYS = [
  'EAS_BUILD_AUTOMATION',
  'EXPO_TOKEN',
  'EAS_PROJECT_ID',
  'EAS_WORKFLOW_FILE',
  'EAS_GIT_REF',
] as const;

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
  app.use('/api/v1', buildRequestRoutes);
  return app;
};

const setShopifyState = async (
  storeId: string,
  state: {
    isConnected?: boolean;
    shop?: string;
    accessToken?: string;
    catalogStatus?: string;
    catalogShop?: string;
  }
) => {
  const $set: Record<string, unknown> = {};
  if (state.isConnected !== undefined) {
    $set['shopify.isConnected'] = state.isConnected;
  }
  if (state.shop !== undefined) {
    $set['shopify.shop'] = state.shop;
  }
  if (state.accessToken) {
    $set['shopify.accessToken'] = state.accessToken;
  }
  if (state.catalogStatus !== undefined) {
    $set['catalogSync.status'] = state.catalogStatus;
    $set['catalogSync.shop'] = state.catalogShop;
  }
  await Store.collection.updateOne({ _id: new mongoose.Types.ObjectId(storeId) }, { $set });
};

const markEligible = (storeId: string, shop: string) =>
  setShopifyState(storeId, {
    isConnected: true,
    shop,
    accessToken: TOKEN_MARKER,
    catalogStatus: 'succeeded',
    catalogShop: shop,
  });

describe('EAS build automation (issue #182)', () => {
  const app = buildTestApp();
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
  let storeAId: string;
  let storeBId: string;
  let adminAId: string;
  let adminAToken: string;
  let adminBToken: string;
  let opsToken: string;
  let calls: RecordedCall[];

  beforeEach(async () => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    calls = [];

    const [storeA, storeB] = await Promise.all([
      Store.create({ name: 'Build Store A', slug: 'build-store-a', shopify: {} }),
      Store.create({ name: 'Build Store B', slug: 'build-store-b', shopify: {} }),
    ]);
    storeAId = storeA._id.toString();
    storeBId = storeB._id.toString();

    const [adminA, adminB, ops] = await Promise.all([
      User.create({
        name: 'Build Admin A',
        email: 'eas-admin-a@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: storeA._id,
      }),
      User.create({
        name: 'Build Admin B',
        email: 'eas-admin-b@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: storeB._id,
      }),
      User.create({
        name: 'Build Ops',
        email: 'eas-ops@example.com',
        password: 'password123',
        role: 'super_admin',
        isActive: true,
        isVerified: false,
        isPlatformOperator: true,
        storeId: storeA._id,
      }),
    ]);
    adminAId = adminA._id.toString();
    adminAToken = generateToken(adminA._id.toString());
    adminBToken = generateToken(adminB._id.toString());
    opsToken = generateToken(ops._id.toString());
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  const enableAutomation = () => {
    process.env.EAS_BUILD_AUTOMATION = '1';
    process.env.EXPO_TOKEN = EXPO_TOKEN;
    process.env.EAS_PROJECT_ID = PROJECT_ID;
    process.env.EAS_WORKFLOW_FILE = 'store-build.yml';
    process.env.EAS_GIT_REF = 'main';
  };

  const mockFetch = (
    handler: (call: RecordedCall) => { status: number; json?: unknown; text?: string } | 'throw'
  ) => {
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const headers = new Headers(init?.headers);
      const call: RecordedCall = {
        url: String(input),
        method: init?.method ?? 'GET',
        authorization: headers.get('authorization') ?? '',
        body: typeof init?.body === 'string' ? init.body : undefined,
      };
      calls.push(call);
      const result = handler(call);
      if (result === 'throw') {
        throw new Error(`network down Authorization Bearer ${EXPO_TOKEN}`);
      }
      const payload = result.json !== undefined ? JSON.stringify(result.json) : (result.text ?? '');
      return new Response(payload, {
        status: result.status,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  };

  const createRequest = (token: string, body: Record<string, unknown>, headerStoreId?: string) => {
    const req = request(app).post('/api/v1/build-requests').set('Authorization', `Bearer ${token}`);
    if (headerStoreId) {
      req.set('X-Store-ID', headerStoreId);
    }
    return req.send(body);
  };

  const assertNoSecrets = (value: unknown) => {
    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain(EXPO_TOKEN);
    expect(serialized).not.toContain(TOKEN_MARKER);
    expect(serialized).not.toContain('shpat_');
    expect(serialized).not.toContain('Bearer ');
  };

  test('leaves the manual queue alone when the test guard is on, even if a token is present', async () => {
    await markEligible(storeAId, SHOP_A);
    process.env.EXPO_TOKEN = EXPO_TOKEN;
    process.env.EAS_PROJECT_ID = PROJECT_ID;
    process.env.EAS_WORKFLOW_FILE = 'store-build.yml';
    mockFetch(() => ({ status: 500, text: EXPO_TOKEN }));

    const created = await createRequest(adminAToken, { android: true });

    expect(created.status).toBe(201);
    expect(created.body.data.platforms.android.status).toBe('queued');
    expect(created.body.data.platforms.android.message).toBeUndefined();
    expect(calls).toHaveLength(0);
    assertNoSecrets(created.body);
  });

  test('stays queued with a merchant-safe message when Expo credentials are missing', async () => {
    await markEligible(storeAId, SHOP_A);
    process.env.EAS_BUILD_AUTOMATION = '1';
    mockFetch(() => ({ status: 200, json: { data: { id: RUN_ANDROID } } }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const created = await createRequest(adminAToken, { android: true, ios: false });

    expect(created.status).toBe(201);
    expect(created.body.data.platforms.android.status).toBe('queued');
    expect(created.body.data.platforms.android.installUrl).toBeNull();
    expect(created.body.data.platforms.android.message).toBe(EAS_MERCHANT_MESSAGES.notConfigured);
    expect(created.body.data.platforms.ios.status).toBe('not_requested');
    expect(created.body.data.platforms.ios.message).toBeUndefined();
    expect(calls).toHaveLength(0);
    assertNoSecrets(created.body);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(EXPO_TOKEN);
    expect(JSON.stringify(warn.mock.calls)).toContain('EXPO_TOKEN');

    const pasted = await request(app)
      .patch(`/api/v1/admin/build-requests/${created.body.data.id}/status`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        android: {
          status: 'ready',
          installUrl: 'https://expo.dev/accounts/cartaisy/projects/app/builds/manual',
        },
      });
    expect(pasted.status).toBe(200);
    expect(pasted.body.data.platforms.android.status).toBe('ready');
    expect(pasted.body.data.platforms.android.installUrl).toBe(
      'https://expo.dev/accounts/cartaisy/projects/app/builds/manual'
    );
    expect(pasted.body.data.platforms.android.message).toBeUndefined();
  });

  test('does not call Expo when the store is not eligible to build', async () => {
    enableAutomation();
    mockFetch(() => ({ status: 200, json: { data: { id: RUN_ANDROID } } }));

    const created = await createRequest(adminAToken, { android: true });

    expect(created.status).toBe(409);
    expect(calls).toHaveLength(0);
    expect(await BuildRequest.countDocuments()).toBe(0);
  });

  test('dispatches one workflow per requested platform and hides the token and run id', async () => {
    await markEligible(storeAId, SHOP_A);
    await markEligible(storeBId, SHOP_B);
    await Store.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(storeAId) },
      {
        $set: {
          'branding.iconUrl': ICON_URL,
          'branding.splashUrl': UNSAFE_SPLASH,
        },
      }
    );
    enableAutomation();
    mockFetch((call) => {
      const body = call.body ? (JSON.parse(call.body) as { inputs?: { platform?: string } }) : {};
      const id = body.inputs?.platform === 'ios' ? RUN_IOS : RUN_ANDROID;
      return {
        status: 200,
        json: { data: { id, url: `https://expo.dev/accounts/cartaisy/workflows/${id}` } },
      };
    });

    const created = await createRequest(
      adminAToken,
      { android: true, ios: true, storeId: storeBId },
      storeBId
    );

    expect(created.status).toBe(201);
    expect(created.body.data.storeId).toBe(storeAId);
    expect(created.body.data.platforms.android.status).toBe('building');
    expect(created.body.data.platforms.ios.status).toBe('building');
    expect(created.body.data.platforms.android.installUrl).toBeNull();
    expect(created.body.data.platforms.android.message).toBeUndefined();
    assertNoSecrets(created.body);
    expect(JSON.stringify(created.body)).not.toContain(RUN_ANDROID);
    expect(JSON.stringify(created.body)).not.toContain(RUN_IOS);

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.url).toBe('https://api.expo.dev/v2/workflows/dispatch');
      expect(call.method).toBe('POST');
      expect(call.authorization).toBe(`Bearer ${EXPO_TOKEN}`);
      expect(call.url).not.toContain(EXPO_TOKEN);
      expect(call.body ?? '').not.toContain(EXPO_TOKEN);
      expect(call.body ?? '').not.toContain(TOKEN_MARKER);
      expect(call.body ?? '').not.toContain('shpat_');
      expect(call.body ?? '').not.toContain(UNSAFE_SPLASH);
      expect(call.body ?? '').not.toContain('Build Store B');
      const parsed = JSON.parse(call.body ?? '{}') as {
        appId: string;
        gitRef: string;
        fileName: string;
        inputs: Record<string, string>;
      };
      expect(parsed.appId).toBe(PROJECT_ID);
      expect(parsed.gitRef).toBe('main');
      expect(parsed.fileName).toBe('store-build.yml');
      expect(parsed.inputs.storeId).toBe(storeAId);
      expect(parsed.inputs.appName).toBe('Build Store A');
      expect(parsed.inputs.storeSlug).toBe('build-store-a');
      expect(parsed.inputs.iconUrl).toBe(ICON_URL);
      expect(parsed.inputs.splashUrl).toBeUndefined();
    }
    expect(calls.map((call) => JSON.parse(call.body ?? '{}').inputs.platform)).toEqual([
      'android',
      'ios',
    ]);

    const stored = await BuildRequest.findById(created.body.data.id).lean();
    expect(stored?.platforms.android.eas?.workflowRunId).toBe(RUN_ANDROID);
    expect(stored?.platforms.ios.eas?.workflowRunId).toBe(RUN_IOS);
    expect(stored?.storeId.toString()).toBe(storeAId);
  });

  test('refuses a second automated build for the same store while one is in progress', async () => {
    await markEligible(storeAId, SHOP_A);
    await markEligible(storeBId, SHOP_B);
    enableAutomation();
    mockFetch((call) => {
      const body = call.body ? (JSON.parse(call.body) as { inputs?: { platform?: string; storeId?: string } }) : {};
      const id = body.inputs?.storeId === storeBId ? RUN_B : RUN_ANDROID;
      return { status: 200, json: { data: { id } } };
    });

    const first = await createRequest(adminAToken, { android: true });
    expect(first.status).toBe(201);
    expect(first.body.data.platforms.android.status).toBe('building');

    const second = await createRequest(adminAToken, { android: true, ios: true });
    expect(second.status).toBe(409);
    expect(second.body).toEqual({
      success: false,
      error: 'A build is already in progress for this store. Wait until it finishes before requesting another.',
      code: 'BUILD_ALREADY_IN_PROGRESS',
    });
    expect(await BuildRequest.countDocuments({ storeId: storeAId })).toBe(1);
    expect(calls).toHaveLength(1);

    const otherStore = await createRequest(adminBToken, { android: true });
    expect(otherStore.status).toBe(201);
    expect(otherStore.body.data.storeId).toBe(storeBId);
    expect(otherStore.body.data.platforms.android.status).toBe('building');

    await BuildRequest.updateOne(
      { _id: first.body.data.id, storeId: storeAId },
      { $set: { 'platforms.android.status': 'failed' } }
    );
    const retry = await createRequest(adminAToken, { ios: true });
    expect(retry.status).toBe(201);
    expect(retry.body.data.platforms.ios.status).toBe('building');
    expect(retry.body.data.platforms.android.status).toBe('not_requested');
  });

  test('marks the platform failed with a fixed message when EAS rejects the dispatch', async () => {
    await markEligible(storeAId, SHOP_A);
    enableAutomation();
    const expoBody = `workflow invalid ${EXPO_TOKEN} shpat_from_expo`;
    mockFetch(() => ({ status: 400, text: expoBody }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const created = await createRequest(adminAToken, { android: true, ios: false });

    expect(created.status).toBe(201);
    expect(created.body.data.platforms.android.status).toBe('failed');
    expect(created.body.data.platforms.android.message).toBe(EAS_MERCHANT_MESSAGES.startFailed);
    expect(created.body.data.platforms.android.installUrl).toBeNull();
    expect(created.body.data.platforms.ios.status).toBe('not_requested');
    assertNoSecrets(created.body);
    expect(JSON.stringify(created.body)).not.toContain('workflow invalid');
    expect(JSON.stringify(warn.mock.calls)).not.toContain(EXPO_TOKEN);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('shpat_from_expo');

    const pasted = await request(app)
      .patch(`/api/v1/admin/build-requests/${created.body.data.id}/status`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        android: { installUrl: 'https://u.expo.dev/accounts/cartaisy/builds/override' },
      });
    expect(pasted.status).toBe(200);
    expect(pasted.body.data.platforms.android.status).toBe('failed');
    expect(pasted.body.data.platforms.android.installUrl).toBe(
      'https://u.expo.dev/accounts/cartaisy/builds/override'
    );
  });

  test('keeps the saved request when the Expo call cannot connect', async () => {
    await markEligible(storeAId, SHOP_A);
    enableAutomation();
    mockFetch(() => 'throw');
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const created = await createRequest(adminAToken, { android: true });

    expect(created.status).toBe(201);
    expect(created.body.data.platforms.android.status).toBe('failed');
    expect(created.body.data.platforms.android.message).toBe(EAS_MERCHANT_MESSAGES.startFailed);
    assertNoSecrets(created.body);
    expect(await BuildRequest.countDocuments({ storeId: storeAId })).toBe(1);
  });

  const workflowSuccess = (runId: string, buildId: string, platform: 'ANDROID' | 'IOS') => ({
    status: 200,
    json: {
      data: {
        id: runId,
        status: 'success',
        jobs: [
          {
            key: platform === 'ANDROID' ? 'build_android' : 'build_ios',
            name: platform === 'ANDROID' ? 'Build Android' : 'Build iOS',
            type: 'build',
            status: 'success',
            buildId,
          },
        ],
      },
    },
  });

  const buildRecord = (input: {
    buildId: string;
    platform: 'ANDROID' | 'IOS';
    projectId?: string;
    buildUrl?: string | null;
    applicationArchiveUrl?: string | null;
    status?: string;
    distribution?: string | null;
    isForIosSimulator?: boolean;
  }) => ({
    status: 200,
    json: {
      data: {
        builds: {
          byId: {
            id: input.buildId,
            status: input.status ?? 'FINISHED',
            platform: input.platform,
            distribution: input.distribution === undefined ? 'INTERNAL' : input.distribution,
            isForIosSimulator: input.isForIosSimulator ?? false,
            project: { id: input.projectId ?? PROJECT_ID },
            artifacts: {
              buildUrl:
                input.buildUrl === undefined
                  ? `https://expo.dev/accounts/cartaisy/projects/app/builds/${input.buildId}`
                  : input.buildUrl,
              applicationArchiveUrl: input.applicationArchiveUrl ?? null,
            },
          },
        },
      },
    },
  });

  const seedBuilding = async (input: {
    storeId: string;
    requestedBy: string;
    platform?: 'android' | 'ios';
    workflowRunId: string;
    startedAt?: Date;
    installUrl?: string;
    otherStoreNote?: string;
  }) => {
    const platform = input.platform ?? 'android';
    const now = new Date('2026-09-28T12:00:00.000Z');
    const state = {
      status: 'building' as const,
      updatedAt: now,
      ...(input.installUrl ? { installUrl: input.installUrl } : {}),
      eas: { workflowRunId: input.workflowRunId, startedAt: input.startedAt ?? now },
    };
    const idle = { status: 'not_requested' as const, updatedAt: now };
    return BuildRequest.create({
      storeId: input.storeId,
      requestedBy: input.requestedBy,
      platforms: {
        android: platform === 'android' ? state : idle,
        ios: platform === 'ios' ? state : idle,
      },
      checklist: input.otherStoreNote ? { accessNotes: input.otherStoreNote } : {},
    });
  };

  test('poll writes the Expo install URL for the owning store and ignores archive hosts', async () => {
    enableAutomation();
    const archive = 'https://artifacts.example.com/app.apk?X-Amz-Signature=secret-signature';
    mockFetch((call) => {
      if (call.url === `https://api.expo.dev/v2/workflows/runs/${RUN_ANDROID}`) {
        return workflowSuccess(RUN_ANDROID, BUILD_ANDROID, 'ANDROID');
      }
      expect(call.url).toBe('https://api.expo.dev/graphql');
      expect(call.authorization).toBe(`Bearer ${EXPO_TOKEN}`);
      expect(call.body ?? '').not.toContain(EXPO_TOKEN);
      const parsed = JSON.parse(call.body ?? '{}') as { variables?: { buildId?: string } };
      expect(parsed.variables?.buildId).toBe(BUILD_ANDROID);
      return buildRecord({
        buildId: BUILD_ANDROID,
        platform: 'ANDROID',
        distribution: null,
        applicationArchiveUrl: archive,
      });
    });

    const doc = await seedBuilding({
      storeId: storeAId,
      requestedBy: adminAId,
      workflowRunId: RUN_ANDROID,
    });

    await pollInFlightEasBuilds();

    const stored = await BuildRequest.findById(doc._id).lean();
    const installUrl = `https://expo.dev/accounts/cartaisy/projects/app/builds/${BUILD_ANDROID}`;
    expect(stored?.platforms.android.status).toBe('ready');
    expect(stored?.platforms.android.installUrl).toBe(installUrl);
    expect(stored?.platforms.android.message).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain('secret-signature');
    expect(JSON.stringify(stored)).not.toContain(EXPO_TOKEN);

    const merchant = await request(app)
      .get(`/api/v1/build-requests/${doc._id.toString()}`)
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(merchant.status).toBe(200);
    expect(merchant.body.data.platforms.android.installUrl).toBe(installUrl);
    expect(merchant.body.data.platforms.android.status).toBe('ready');
    expect(JSON.stringify(merchant.body)).not.toContain(RUN_ANDROID);
    assertNoSecrets(merchant.body);
  });

  test('does not copy another store artifact onto this store', async () => {
    enableAutomation();
    const urlA = `https://expo.dev/accounts/cartaisy/projects/app/builds/${BUILD_ANDROID}`;
    const urlB = `https://expo.dev/accounts/cartaisy/projects/app/builds/${BUILD_B}`;
    mockFetch((call) => {
      if (call.url.endsWith(RUN_ANDROID)) {
        return workflowSuccess(RUN_ANDROID, BUILD_ANDROID, 'ANDROID');
      }
      if (call.url.endsWith(RUN_B)) {
        return workflowSuccess(RUN_B, BUILD_B, 'ANDROID');
      }
      const parsed = JSON.parse(call.body ?? '{}') as { variables?: { buildId?: string } };
      const buildId = parsed.variables?.buildId;
      if (buildId === BUILD_ANDROID) {
        return buildRecord({ buildId, platform: 'ANDROID', buildUrl: urlA });
      }
      if (buildId === BUILD_B) {
        return buildRecord({ buildId: BUILD_B, platform: 'ANDROID', buildUrl: urlB });
      }
      return { status: 404, text: 'missing' };
    });

    const docA = await seedBuilding({
      storeId: storeAId,
      requestedBy: adminAId,
      workflowRunId: RUN_ANDROID,
      otherStoreNote: 'store A note',
    });
    const docB = await seedBuilding({
      storeId: storeBId,
      requestedBy: adminAId,
      workflowRunId: RUN_B,
      otherStoreNote: 'store B secret note',
    });

    await pollInFlightEasBuilds();

    const storedA = await BuildRequest.findById(docA._id).lean();
    const storedB = await BuildRequest.findById(docB._id).lean();
    expect(storedA?.platforms.android.installUrl).toBe(urlA);
    expect(storedA?.platforms.android.status).toBe('ready');
    expect(storedB?.platforms.android.installUrl).toBe(urlB);
    expect(JSON.stringify(storedA)).not.toContain(urlB);
    expect(JSON.stringify(storedB)).not.toContain(urlA);

    const leaked = await request(app)
      .get(`/api/v1/build-requests/${docB._id.toString()}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .set('X-Store-ID', storeBId);
    expect(leaked.status).toBe(404);
    expect(JSON.stringify(leaked.body)).not.toContain(urlB);
    expect(JSON.stringify(leaked.body)).not.toContain('store B secret note');

    const own = await request(app)
      .get('/api/v1/build-requests')
      .set('Authorization', `Bearer ${adminBToken}`);
    expect(own.status).toBe(200);
    expect(own.body.data.requests).toHaveLength(1);
    expect(own.body.data.requests[0].platforms.android.installUrl).toBe(urlB);
    expect(JSON.stringify(own.body)).not.toContain(urlA);
    expect(JSON.stringify(own.body)).not.toContain('store A note');
  });

  test('fails closed when the build belongs to another Expo project or platform', async () => {
    enableAutomation();
    const foreignUrl = 'https://expo.dev/accounts/other/projects/foreign/builds/1';
    mockFetch((call) => {
      if (call.method === 'GET') {
        return workflowSuccess(RUN_ANDROID, BUILD_ANDROID, 'ANDROID');
      }
      return buildRecord({
        buildId: BUILD_ANDROID,
        platform: 'IOS',
        projectId: OTHER_PROJECT_ID,
        buildUrl: foreignUrl,
      });
    });

    const doc = await seedBuilding({
      storeId: storeAId,
      requestedBy: adminAId,
      workflowRunId: RUN_ANDROID,
    });
    await pollInFlightEasBuilds();

    const stored = await BuildRequest.findById(doc._id).lean();
    expect(stored?.platforms.android.status).toBe('failed');
    expect(stored?.platforms.android.installUrl).toBeUndefined();
    expect(stored?.platforms.android.message).toBe(EAS_MERCHANT_MESSAGES.noInstallUrl);
    expect(JSON.stringify(stored)).not.toContain(foreignUrl);
    expect(JSON.stringify(stored)).not.toContain(OTHER_PROJECT_ID);
  });

  test('rejects an install link that is not an Expo https URL', async () => {
    enableAutomation();
    const unsafe = 'https://expo.dev/accounts/cartaisy/builds/shpat_should_not_store';
    mockFetch((call) => {
      if (call.method === 'GET') {
        return workflowSuccess(RUN_ANDROID, BUILD_ANDROID, 'ANDROID');
      }
      return buildRecord({
        buildId: BUILD_ANDROID,
        platform: 'ANDROID',
        distribution: 'INTERNAL',
        buildUrl: unsafe,
        applicationArchiveUrl: 'https://example.com/app.apk',
      });
    });

    const doc = await seedBuilding({
      storeId: storeAId,
      requestedBy: adminAId,
      workflowRunId: RUN_ANDROID,
    });
    await pollInFlightEasBuilds();

    const stored = await BuildRequest.findById(doc._id).lean();
    expect(stored?.platforms.android.status).toBe('ready');
    expect(stored?.platforms.android.installUrl).toBeUndefined();
    expect(stored?.platforms.android.message).toBeUndefined();
    expect(stored?.platforms.android.eas?.buildId).toBe(BUILD_ANDROID);
    expect(JSON.stringify(stored)).not.toContain('shpat_');
    expect(JSON.stringify(stored)).not.toContain('example.com');
    expect(JSON.stringify(stored)).not.toContain(EXPO_TOKEN);
  });

  test('does not store an install URL that contains the Expo token', async () => {
    enableAutomation();
    const unsafe = `https://expo.dev/accounts/cartaisy/projects/app/builds/${BUILD_ANDROID}?access=${EXPO_TOKEN}`;
    mockFetch((call) => {
      if (call.method === 'GET') {
        return workflowSuccess(RUN_ANDROID, BUILD_ANDROID, 'ANDROID');
      }
      return buildRecord({
        buildId: BUILD_ANDROID,
        platform: 'ANDROID',
        distribution: 'INTERNAL',
        buildUrl: unsafe,
        applicationArchiveUrl: null,
      });
    });

    const doc = await seedBuilding({
      storeId: storeAId,
      requestedBy: adminAId,
      workflowRunId: RUN_ANDROID,
    });
    await pollInFlightEasBuilds();

    const stored = await BuildRequest.findById(doc._id).lean();
    expect(stored?.platforms.android.status).toBe('ready');
    expect(stored?.platforms.android.installUrl).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain(EXPO_TOKEN);

    const merchant = await request(app)
      .get(`/api/v1/build-requests/${doc._id.toString()}`)
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(merchant.body.data.platforms.android.installUrl).toBeNull();
    assertNoSecrets(merchant.body);
  });

  test('leaves installUrl unset when a finished build has no public install URL', async () => {
    enableAutomation();
    const archive = 'https://artifacts.example.com/app.apk?X-Amz-Signature=secret-signature';
    mockFetch((call) => {
      if (call.method === 'GET') {
        return workflowSuccess(RUN_ANDROID, BUILD_ANDROID, 'ANDROID');
      }
      return buildRecord({
        buildId: BUILD_ANDROID,
        platform: 'ANDROID',
        distribution: 'INTERNAL',
        buildUrl: null,
        applicationArchiveUrl: archive,
      });
    });

    const doc = await seedBuilding({
      storeId: storeAId,
      requestedBy: adminAId,
      workflowRunId: RUN_ANDROID,
    });
    await pollInFlightEasBuilds();

    const stored = await BuildRequest.findById(doc._id).lean();
    expect(stored?.platforms.android.status).toBe('ready');
    expect(stored?.platforms.android.installUrl).toBeUndefined();
    expect(stored?.platforms.android.message).toBeUndefined();
    expect(stored?.platforms.android.eas?.buildId).toBe(BUILD_ANDROID);
    expect(JSON.stringify(stored)).not.toContain('secret-signature');
    expect(JSON.stringify(stored)).not.toContain(EXPO_TOKEN);

    const merchant = await request(app)
      .get(`/api/v1/build-requests/${doc._id.toString()}`)
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(merchant.status).toBe(200);
    expect(merchant.body.data.platforms.android.status).toBe('ready');
    expect(merchant.body.data.platforms.android.installUrl).toBeNull();
    expect(JSON.stringify(merchant.body)).not.toContain(BUILD_ANDROID);
    assertNoSecrets(merchant.body);
  });

  test('leaves installUrl unset for a store profile even when Expo returns a build page', async () => {
    enableAutomation();
    const page = `https://expo.dev/accounts/cartaisy/projects/app/builds/${BUILD_ANDROID}`;
    mockFetch((call) => {
      if (call.method === 'GET') {
        return workflowSuccess(RUN_IOS, BUILD_ANDROID, 'IOS');
      }
      return buildRecord({
        buildId: BUILD_ANDROID,
        platform: 'IOS',
        distribution: 'STORE',
        buildUrl: page,
      });
    });

    const doc = await seedBuilding({
      storeId: storeAId,
      requestedBy: adminAId,
      platform: 'ios',
      workflowRunId: RUN_IOS,
    });
    await pollInFlightEasBuilds();

    const stored = await BuildRequest.findById(doc._id).lean();
    expect(stored?.platforms.ios.status).toBe('ready');
    expect(stored?.platforms.ios.installUrl).toBeUndefined();
    expect(stored?.platforms.ios.eas?.buildId).toBe(BUILD_ANDROID);
    expect(JSON.stringify(stored)).not.toContain(page);
    expect(stored?.platforms.android.status).toBe('not_requested');
  });

  test('leaves installUrl unset for an iOS simulator build', async () => {
    enableAutomation();
    const page = `https://expo.dev/accounts/cartaisy/projects/app/builds/${BUILD_ANDROID}`;
    mockFetch((call) => {
      if (call.method === 'GET') {
        return workflowSuccess(RUN_IOS, BUILD_ANDROID, 'IOS');
      }
      return buildRecord({
        buildId: BUILD_ANDROID,
        platform: 'IOS',
        distribution: 'INTERNAL',
        isForIosSimulator: true,
        buildUrl: page,
      });
    });

    const doc = await seedBuilding({
      storeId: storeAId,
      requestedBy: adminAId,
      platform: 'ios',
      workflowRunId: RUN_IOS,
    });
    await pollInFlightEasBuilds();

    const stored = await BuildRequest.findById(doc._id).lean();
    expect(stored?.platforms.ios.status).toBe('ready');
    expect(stored?.platforms.ios.installUrl).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain(page);
  });

  test('re-sync does not wipe a stored install URL when Expo omits it', async () => {
    enableAutomation();
    const installUrl = `https://expo.dev/accounts/cartaisy/projects/app/builds/${BUILD_ANDROID}`;
    let exposeUrl = true;
    mockFetch((call) => {
      if (call.method === 'GET') {
        return workflowSuccess(RUN_ANDROID, BUILD_ANDROID, 'ANDROID');
      }
      return buildRecord({
        buildId: BUILD_ANDROID,
        platform: 'ANDROID',
        distribution: 'INTERNAL',
        buildUrl: exposeUrl ? installUrl : null,
        applicationArchiveUrl: exposeUrl
          ? null
          : `https://expo.dev/accounts/cartaisy/builds/${EXPO_TOKEN}`,
      });
    });

    const doc = await seedBuilding({
      storeId: storeAId,
      requestedBy: adminAId,
      workflowRunId: RUN_ANDROID,
    });

    await pollInFlightEasBuilds();
    const first = await BuildRequest.findById(doc._id).lean();
    expect(first?.platforms.android.status).toBe('ready');
    expect(first?.platforms.android.installUrl).toBe(installUrl);

    exposeUrl = false;
    await pollInFlightEasBuilds();
    const stillReady = await BuildRequest.findById(doc._id).lean();
    expect(stillReady?.platforms.android.status).toBe('ready');
    expect(stillReady?.platforms.android.installUrl).toBe(installUrl);

    await BuildRequest.updateOne(
      { _id: doc._id },
      { $set: { 'platforms.android.status': 'building' } }
    );
    await pollInFlightEasBuilds();

    const stored = await BuildRequest.findById(doc._id).lean();
    expect(stored?.platforms.android.installUrl).toBe(installUrl);
    expect(JSON.stringify(stored)).not.toContain(EXPO_TOKEN);

    const merchant = await request(app)
      .get(`/api/v1/build-requests/${doc._id.toString()}`)
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(merchant.status).toBe(200);
    expect(merchant.body.data.platforms.android.installUrl).toBe(installUrl);
    assertNoSecrets(merchant.body);
  });

  test('sets a merchant-safe failure when the workflow fails', async () => {
    enableAutomation();
    mockFetch(() => ({
      status: 200,
      json: {
        data: {
          id: RUN_IOS,
          status: 'failure',
          jobs: [{ type: 'build', status: 'failure', errors: [`token ${EXPO_TOKEN}`] }],
        },
      },
    }));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const doc = await seedBuilding({
      storeId: storeAId,
      requestedBy: adminAId,
      platform: 'ios',
      workflowRunId: RUN_IOS,
    });
    await pollInFlightEasBuilds();

    const stored = await BuildRequest.findById(doc._id).lean();
    expect(stored?.platforms.ios.status).toBe('failed');
    expect(stored?.platforms.ios.message).toBe(EAS_MERCHANT_MESSAGES.buildFailed);
    expect(stored?.platforms.android.status).toBe('not_requested');
    expect(JSON.stringify(stored)).not.toContain(EXPO_TOKEN);

    const merchant = await request(app)
      .get(`/api/v1/build-requests/${doc._id.toString()}`)
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(merchant.body.data.platforms.ios.message).toBe(EAS_MERCHANT_MESSAGES.buildFailed);
    assertNoSecrets(merchant.body);
  });

  test('times out a run that never finishes', async () => {
    enableAutomation();
    mockFetch(() => ({
      status: 200,
      json: { data: { id: RUN_ANDROID, status: 'in-progress', jobs: [] } },
    }));

    const doc = await seedBuilding({
      storeId: storeAId,
      requestedBy: adminAId,
      workflowRunId: RUN_ANDROID,
      startedAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
    });
    await pollInFlightEasBuilds();

    const stored = await BuildRequest.findById(doc._id).lean();
    expect(stored?.platforms.android.status).toBe('failed');
    expect(stored?.platforms.android.message).toBe(EAS_MERCHANT_MESSAGES.timedOut);
    expect(stored?.platforms.android.installUrl).toBeUndefined();
  });

  test('does not replace an install URL that platform ops already pasted', async () => {
    enableAutomation();
    const manual = 'https://expo.dev/accounts/cartaisy/projects/app/builds/manual-override';
    mockFetch(() => buildRecord({ buildId: BUILD_ANDROID, platform: 'ANDROID' }));

    const doc = await seedBuilding({
      storeId: storeAId,
      requestedBy: adminAId,
      workflowRunId: RUN_ANDROID,
      installUrl: manual,
    });
    await pollInFlightEasBuilds();

    const stored = await BuildRequest.findById(doc._id).lean();
    expect(stored?.platforms.android.status).toBe('building');
    expect(stored?.platforms.android.installUrl).toBe(manual);
    expect(calls).toHaveLength(0);
  });

  test('omits a stored automation message that contains a token marker', async () => {
    const doc = await BuildRequest.create({
      storeId: storeAId,
      requestedBy: adminAId,
      platforms: {
        android: {
          status: 'failed',
          updatedAt: new Date(),
          message: 'failed because shpat_should_not_appear_in_build_responses',
        },
        ios: { status: 'not_requested', updatedAt: new Date() },
      },
    });

    const merchant = await request(app)
      .get(`/api/v1/build-requests/${doc._id.toString()}`)
      .set('Authorization', `Bearer ${adminAToken}`);
    expect(merchant.status).toBe(200);
    expect(merchant.body.data.platforms.android.message).toBeUndefined();
    expect(JSON.stringify(merchant.body)).not.toContain('shpat_');
  });
});
