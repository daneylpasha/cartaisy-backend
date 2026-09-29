import mongoose from 'mongoose';
import BuildRequest, { IBuildRequest } from '../models/BuildRequest';
import Store from '../models/Store';
import {
  dispatchEasWorkflow,
  getEasBuild,
  getEasWorkflowRun,
  isEasUuid,
  redactEasLogText,
  type EasWorkflowJob,
  type EasWorkflowRun,
} from './easBuildClient';
import { hasTokenShapedText, safeExpoInstallUrl, safeHttpsUrl } from '../utils/expoInstallUrl';

/**
 * Starts and polls EAS Workflow builds for a store's build request.
 *
 * Credentials are Cartaisy's Expo robot token and project id from the
 * environment. A missing credential leaves the request queued so platform
 * ops can still paste installUrl. Store-owner Apple/Google connect and
 * EAS Submit are not part of this module.
 */

const BUILD_TIMEOUT_MS = 6 * 60 * 60 * 1000;
const POLL_BATCH = 20;

const WORKFLOW_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.ya?ml$/;
const GIT_REF_PATTERN = /^[A-Za-z0-9._/-]{1,256}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const EAS_MERCHANT_MESSAGES = {
  notConfigured:
    'Automated builds are not configured yet. An operator can still attach an install link.',
  startFailed:
    'The app build could not be started. An operator can still attach an install link.',
  buildFailed:
    'The app build did not finish. An operator can still attach an install link.',
  noInstallUrl:
    'The app build finished without an install link. An operator can still attach one.',
  timedOut:
    'The app build took too long. An operator can still attach an install link.',
  waiting:
    'The app build is waiting on Cartaisy. An operator can still attach an install link.',
} as const;

type BuildPlatformName = 'android' | 'ios';

interface EasConfig {
  token: string;
  appId: string;
  gitRef: string;
  fileName: string;
}

type AutomationDecision =
  | { mode: 'skip' }
  | { mode: 'unconfigured'; missing: string[] }
  | { mode: 'ready'; config: EasConfig };

const isWorkflowFile = (value: string | undefined): value is string =>
  typeof value === 'string' && WORKFLOW_FILE_PATTERN.test(value.trim());

const isGitRef = (value: string): boolean =>
  GIT_REF_PATTERN.test(value) && !value.includes('..') && !value.includes('//');

export const isEasAutomationConfigured = (): boolean => readAutomationDecision().mode === 'ready';

const readAutomationDecision = (): AutomationDecision => {
  // Existing suites must not call Expo, even if a developer shell has a token.
  if (process.env.NODE_ENV === 'test' && process.env.EAS_BUILD_AUTOMATION !== '1') {
    return { mode: 'skip' };
  }

  const missing: string[] = [];
  const token = process.env.EXPO_TOKEN?.trim() ?? '';
  if (token.length < 20 || /\s/.test(token)) {
    missing.push('EXPO_TOKEN');
  }

  const appId = process.env.EAS_PROJECT_ID?.trim() ?? '';
  if (!isEasUuid(appId)) {
    missing.push('EAS_PROJECT_ID');
  }

  const fileName = process.env.EAS_WORKFLOW_FILE?.trim() ?? '';
  if (!isWorkflowFile(fileName)) {
    missing.push('EAS_WORKFLOW_FILE');
  }

  const gitRefRaw = process.env.EAS_GIT_REF?.trim() || 'main';
  if (!isGitRef(gitRefRaw)) {
    missing.push('EAS_GIT_REF');
  }

  if (missing.length > 0) {
    return { mode: 'unconfigured', missing };
  }

  return {
    mode: 'ready',
    config: {
      token,
      appId,
      gitRef: gitRefRaw,
      fileName,
    },
  };
};

const safeLabel = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = Array.from(value.trim())
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join('');
  if (!trimmed || hasTokenShapedText(trimmed)) {
    return null;
  }
  return trimmed.slice(0, max);
};

const logEas = (event: string, details: Record<string, string | number | undefined>): void => {
  const safe: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined) {
      continue;
    }
    const lowered = key.toLowerCase();
    if (lowered.includes('token') || lowered.includes('authorization') || lowered.includes('secret')) {
      continue;
    }
    safe[key] = value;
  }
  console.warn(`[eas-build] ${event}`, safe);
};

const requestedPlatforms = (doc: {
  platforms: IBuildRequest['platforms'];
}): BuildPlatformName[] => {
  const names: BuildPlatformName[] = [];
  if (doc.platforms.android.status !== 'not_requested') {
    names.push('android');
  }
  if (doc.platforms.ios.status !== 'not_requested') {
    names.push('ios');
  }
  return names;
};

const installUrlPresent = (value: string | null | undefined): boolean =>
  typeof value === 'string' && value.trim().length > 0;

interface StoreBrand {
  name?: string;
  slug?: string;
  branding?: { iconUrl?: string; splashUrl?: string };
}

const workflowInputs = (
  platform: BuildPlatformName,
  storeId: string,
  store: StoreBrand | null
): Record<string, string> => {
  const inputs: Record<string, string> = { platform, storeId };
  const appName = safeLabel(store?.name, 80);
  const slug = typeof store?.slug === 'string' ? store.slug.trim().toLowerCase() : '';
  const iconUrl = safeHttpsUrl(store?.branding?.iconUrl);
  const splashUrl = safeHttpsUrl(store?.branding?.splashUrl);
  if (appName) {
    inputs.appName = appName;
  }
  if (SLUG_PATTERN.test(slug)) {
    inputs.storeSlug = slug;
  }
  if (iconUrl) {
    inputs.iconUrl = iconUrl;
  }
  if (splashUrl) {
    inputs.splashUrl = splashUrl;
  }
  return inputs;
};

const ownedIds = (doc: { _id: unknown; storeId: unknown }) => ({
  _id: new mongoose.Types.ObjectId(String(doc._id)),
  storeId: new mongoose.Types.ObjectId(String(doc.storeId)),
});

const platformWriteFilter = (
  doc: { _id: unknown; storeId: unknown },
  platform: BuildPlatformName,
  workflowRunId?: string
): mongoose.FilterQuery<IBuildRequest> => {
  const prefix = `platforms.${platform}`;
  const ids = ownedIds(doc);
  const filter: mongoose.FilterQuery<IBuildRequest> = {
    _id: ids._id,
    storeId: ids.storeId,
    [`${prefix}.status`]: { $in: ['queued', 'building'] },
    $or: [
      { [`${prefix}.installUrl`]: { $exists: false } },
      { [`${prefix}.installUrl`]: null },
      { [`${prefix}.installUrl`]: '' },
    ],
  };
  if (workflowRunId) {
    filter[`${prefix}.eas.workflowRunId`] = workflowRunId;
  }
  return filter;
};

const touchInFlight = async (
  doc: { _id: unknown; storeId: unknown },
  platform: BuildPlatformName,
  workflowRunId: string,
  now: Date
): Promise<void> => {
  const prefix = `platforms.${platform}`;
  await BuildRequest.updateOne(platformWriteFilter(doc, platform, workflowRunId), {
    $set: { [`${prefix}.updatedAt`]: now },
  });
};

const markPlatform = async (input: {
  doc: { _id: unknown; storeId: unknown };
  platform: BuildPlatformName;
  workflowRunId?: string;
  /** First write after dispatch. Do not replace a run already stored. */
  onlyWithoutRun?: boolean;
  status: 'queued' | 'building' | 'failed' | 'ready';
  message?: string;
  installUrl?: string;
  eas?: { workflowRunId: string; startedAt: Date; buildId?: string };
  now: Date;
}): Promise<boolean> => {
  const prefix = `platforms.${input.platform}`;
  const $set: Record<string, unknown> = {
    [`${prefix}.status`]: input.status,
    [`${prefix}.updatedAt`]: input.now,
  };
  const $unset: Record<string, string> = {};

  // Omit installUrl to leave a stored link in place. Never write null over it.
  if (input.installUrl) {
    $set[`${prefix}.installUrl`] = input.installUrl;
  }
  if (input.message) {
    $set[`${prefix}.message`] = input.message;
  } else {
    $unset[`${prefix}.message`] = '';
  }
  if (input.eas) {
    $set[`${prefix}.eas.workflowRunId`] = input.eas.workflowRunId;
    $set[`${prefix}.eas.startedAt`] = input.eas.startedAt;
    if (input.eas.buildId) {
      $set[`${prefix}.eas.buildId`] = input.eas.buildId;
    }
  }

  const update: { $set: Record<string, unknown>; $unset?: Record<string, string> } = { $set };
  if (Object.keys($unset).length > 0) {
    update.$unset = $unset;
  }

  const filter = platformWriteFilter(input.doc, input.platform, input.workflowRunId);
  if (input.onlyWithoutRun) {
    filter[`platforms.${input.platform}.eas.workflowRunId`] = { $exists: false };
  }
  const result = await BuildRequest.updateOne(filter, update);
  return result.matchedCount > 0;
};

const noteUnconfigured = async (
  doc: { _id: unknown; storeId: unknown },
  platform: BuildPlatformName,
  now: Date
): Promise<boolean> => {
  const prefix = `platforms.${platform}`;
  const result = await BuildRequest.updateOne(
    {
      ...platformWriteFilter(doc, platform),
      [`${prefix}.status`]: 'queued',
      [`${prefix}.eas.workflowRunId`]: { $exists: false },
    },
    {
      $set: {
        [`${prefix}.message`]: EAS_MERCHANT_MESSAGES.notConfigured,
        [`${prefix}.updatedAt`]: now,
      },
    }
  );
  return result.matchedCount > 0;
};

const loadOwnedRequest = async (
  requestId: string,
  storeId: string
): Promise<IBuildRequest | null> => {
  if (!mongoose.Types.ObjectId.isValid(requestId) || !mongoose.Types.ObjectId.isValid(storeId)) {
    return null;
  }
  return BuildRequest.findOne({
    _id: new mongoose.Types.ObjectId(requestId),
    storeId: new mongoose.Types.ObjectId(storeId),
  });
};

/**
 * Called after a store-admin create. Dispatches one EAS workflow run per
 * requested platform when Cartaisy credentials are configured.
 * Returns whether the stored request changed.
 */
export const startAutomatedEasBuilds = async (input: {
  requestId: string;
  storeId: string;
}): Promise<'unchanged' | 'updated'> => {
  const decision = readAutomationDecision();
  if (decision.mode === 'skip') {
    return 'unchanged';
  }

  try {
    return await enqueueConfiguredBuilds(input, decision);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'enqueue failed';
    logEas('enqueue failed', {
      requestId: input.requestId,
      storeId: input.storeId,
      message: redactEasLogText(message),
    });
    return 'updated';
  }
};

const enqueueConfiguredBuilds = async (
  input: { requestId: string; storeId: string },
  decision: Exclude<AutomationDecision, { mode: 'skip' }>
): Promise<'unchanged' | 'updated'> => {
  const doc = await loadOwnedRequest(input.requestId, input.storeId);
  if (!doc) {
    return 'unchanged';
  }

  const platforms = requestedPlatforms(doc).filter((platform) => {
    const state = doc.platforms[platform];
    return state.status === 'queued' && !state.eas?.workflowRunId && !installUrlPresent(state.installUrl);
  });
  if (platforms.length === 0) {
    return 'unchanged';
  }

  const now = new Date();
  if (decision.mode === 'unconfigured') {
    logEas('automation not configured', {
      requestId: input.requestId,
      storeId: input.storeId,
      missing: decision.missing.join(','),
    });
    let changed = false;
    for (const platform of platforms) {
      const wrote = await noteUnconfigured(doc, platform, now);
      changed = changed || wrote;
    }
    return changed ? 'updated' : 'unchanged';
  }

  const store = await Store.findOne({ _id: doc.storeId })
    .select('name slug branding.iconUrl branding.splashUrl')
    .lean<StoreBrand | null>();

  let changed = false;
  for (const platform of platforms) {
    const inputs = workflowInputs(platform, doc.storeId.toString(), store);
    const dispatched = await dispatchEasWorkflow({
      token: decision.config.token,
      appId: decision.config.appId,
      gitRef: decision.config.gitRef,
      fileName: decision.config.fileName,
      inputs,
    });

    if (dispatched.ok === false) {
      logEas('dispatch failed', {
        requestId: doc._id.toString(),
        storeId: doc.storeId.toString(),
        platform,
        status: dispatched.status,
        kind: dispatched.kind,
      });
      const wrote = await markPlatform({
        doc,
        platform,
        status: 'failed',
        message: EAS_MERCHANT_MESSAGES.startFailed,
        now,
        onlyWithoutRun: true,
      });
      changed = changed || wrote;
      continue;
    }

    const wrote = await markPlatform({
      doc,
      platform,
      status: 'building',
      now,
      onlyWithoutRun: true,
      eas: {
        workflowRunId: dispatched.workflowRunId,
        startedAt: now,
      },
    });
    changed = changed || wrote;
  }

  return changed ? 'updated' : 'unchanged';
};

const inFlightQuery = (): mongoose.FilterQuery<IBuildRequest> => ({
  $or: (['android', 'ios'] as const).map((platform) => ({
    [`platforms.${platform}.status`]: { $in: ['queued', 'building'] },
    [`platforms.${platform}.eas.workflowRunId`]: { $type: 'string' },
  })),
});

const startedAtOf = (
  state: IBuildRequest['platforms']['android'],
  fallback: Date
): Date => {
  const value = state.eas?.startedAt;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return fallback;
};

const isTimedOut = (startedAt: Date, now: Date): boolean =>
  now.getTime() - startedAt.getTime() > BUILD_TIMEOUT_MS;

const pickBuildJob = (jobs: EasWorkflowJob[], platform: BuildPlatformName): EasWorkflowJob | null => {
  const builds = jobs.filter((job) => job.type?.toLowerCase() === 'build' && job.buildId);
  const named = builds.find((job) => {
    const label = `${job.key ?? ''} ${job.name ?? ''}`.toLowerCase();
    return label.includes(platform);
  });
  return named ?? builds[0] ?? null;
};

const expectedBuildPlatform = (platform: BuildPlatformName): string =>
  platform === 'android' ? 'ANDROID' : 'IOS';

const containsExpoToken = (value: string, token: string): boolean => {
  const trimmed = token.trim();
  return trimmed.length >= 8 && value.includes(trimmed);
};

const installUrlFromBuild = (
  buildUrl: string | null,
  archiveUrl: string | null,
  token: string
): string | null => {
  const candidate = safeExpoInstallUrl(buildUrl) ?? safeExpoInstallUrl(archiveUrl);
  if (!candidate || containsExpoToken(candidate, token)) {
    return null;
  }
  return candidate;
};

/**
 * A device can scan an internal-distribution build page. Store and simulator
 * profiles still finish successfully, but Expo does not give them an install QR.
 * When Expo omits distribution, a safe public URL is still accepted.
 */
const buildHasScannableInstall = (build: {
  distribution: string | null;
  isForIosSimulator: boolean;
}): boolean => {
  if (build.isForIosSimulator) {
    return false;
  }
  if (!build.distribution) {
    return true;
  }
  return build.distribution === 'INTERNAL';
};

const publicInstallUrl = (
  build: {
    distribution: string | null;
    isForIosSimulator: boolean;
    buildUrl: string | null;
    applicationArchiveUrl: string | null;
  },
  token: string
): string | null => {
  if (!buildHasScannableInstall(build)) {
    return null;
  }
  return installUrlFromBuild(build.buildUrl, build.applicationArchiveUrl, token);
};

const finishFromRun = async (input: {
  doc: IBuildRequest;
  platform: BuildPlatformName;
  run: EasWorkflowRun;
  token: string;
  appId: string;
  now: Date;
}): Promise<void> => {
  const job = pickBuildJob(input.run.jobs, input.platform);
  if (!job?.buildId) {
    await markPlatform({
      doc: input.doc,
      platform: input.platform,
      workflowRunId: input.run.id,
      status: 'failed',
      message: EAS_MERCHANT_MESSAGES.noInstallUrl,
      now: input.now,
    });
    return;
  }

  const loaded = await getEasBuild({ token: input.token, buildId: job.buildId });
  if (loaded.ok === false) {
    logEas('build lookup failed', {
      requestId: input.doc._id.toString(),
      storeId: input.doc.storeId.toString(),
      platform: input.platform,
      status: loaded.status,
      kind: loaded.kind,
    });
    if (isTimedOut(startedAtOf(input.doc.platforms[input.platform], input.doc.updatedAt), input.now)) {
      await markPlatform({
        doc: input.doc,
        platform: input.platform,
        workflowRunId: input.run.id,
        status: 'failed',
        message: EAS_MERCHANT_MESSAGES.timedOut,
        now: input.now,
      });
    } else {
      await touchInFlight(input.doc, input.platform, input.run.id, input.now);
    }
    return;
  }

  const build = loaded.build;
  const startedAt = startedAtOf(input.doc.platforms[input.platform], input.now);
  const eas = {
    workflowRunId: input.run.id,
    startedAt,
    buildId: job.buildId,
  };
  const matchesAccount =
    build !== null &&
    build.projectId === input.appId &&
    build.platform === expectedBuildPlatform(input.platform);

  if (!build || !matchesAccount) {
    await markPlatform({
      doc: input.doc,
      platform: input.platform,
      workflowRunId: input.run.id,
      status: 'failed',
      message: EAS_MERCHANT_MESSAGES.noInstallUrl,
      now: input.now,
      eas,
    });
    return;
  }

  if (build.status === 'FINISHED') {
    const installUrl = publicInstallUrl(build, input.token);
    await markPlatform({
      doc: input.doc,
      platform: input.platform,
      workflowRunId: input.run.id,
      status: 'ready',
      ...(installUrl ? { installUrl } : {}),
      now: input.now,
      eas,
    });
    return;
  }

  if (build.status === 'ERRORED' || build.status === 'CANCELED') {
    await markPlatform({
      doc: input.doc,
      platform: input.platform,
      workflowRunId: input.run.id,
      status: 'failed',
      message: EAS_MERCHANT_MESSAGES.buildFailed,
      now: input.now,
      eas,
    });
    return;
  }

  if (isTimedOut(startedAt, input.now)) {
    await markPlatform({
      doc: input.doc,
      platform: input.platform,
      workflowRunId: input.run.id,
      status: 'failed',
      message: EAS_MERCHANT_MESSAGES.timedOut,
      now: input.now,
      eas,
    });
    return;
  }

  await markPlatform({
    doc: input.doc,
    platform: input.platform,
    workflowRunId: input.run.id,
    status: 'building',
    now: input.now,
    eas,
  });
};

const pollPlatform = async (
  doc: IBuildRequest,
  platform: BuildPlatformName,
  config: EasConfig,
  now: Date
): Promise<void> => {
  const state = doc.platforms[platform];
  const workflowRunId = state.eas?.workflowRunId?.trim() ?? '';
  if (!isEasUuid(workflowRunId) || installUrlPresent(state.installUrl)) {
    return;
  }
  if (state.status !== 'queued' && state.status !== 'building') {
    return;
  }

  const startedAt = startedAtOf(state, doc.updatedAt);
  const runResult = await getEasWorkflowRun({ token: config.token, workflowRunId });
  if (runResult.ok === false) {
    logEas('workflow poll failed', {
      requestId: doc._id.toString(),
      storeId: doc.storeId.toString(),
      platform,
      status: runResult.status,
      kind: runResult.kind,
    });
    if (runResult.status === 404 || isTimedOut(startedAt, now)) {
      await markPlatform({
        doc,
        platform,
        workflowRunId,
        status: 'failed',
        message: runResult.status === 404 ? EAS_MERCHANT_MESSAGES.buildFailed : EAS_MERCHANT_MESSAGES.timedOut,
        now,
      });
    } else {
      await touchInFlight(doc, platform, workflowRunId, now);
    }
    return;
  }

  const runStatus = runResult.run.status;
  if (runResult.run.id !== workflowRunId) {
    logEas('workflow run mismatch', {
      requestId: doc._id.toString(),
      storeId: doc.storeId.toString(),
      platform,
    });
    if (isTimedOut(startedAt, now)) {
      await markPlatform({
        doc,
        platform,
        workflowRunId,
        status: 'failed',
        message: EAS_MERCHANT_MESSAGES.timedOut,
        now,
      });
    } else {
      await touchInFlight(doc, platform, workflowRunId, now);
    }
    return;
  }

  if (runStatus === 'success') {
    await finishFromRun({
      doc,
      platform,
      run: runResult.run,
      token: config.token,
      appId: config.appId,
      now,
    });
    return;
  }

  if (runStatus === 'failure' || runStatus === 'canceled') {
    await markPlatform({
      doc,
      platform,
      workflowRunId,
      status: 'failed',
      message: EAS_MERCHANT_MESSAGES.buildFailed,
      now,
    });
    return;
  }

  if (isTimedOut(startedAt, now)) {
    await markPlatform({
      doc,
      platform,
      workflowRunId,
      status: 'failed',
      message: EAS_MERCHANT_MESSAGES.timedOut,
      now,
    });
    return;
  }

  await markPlatform({
    doc,
    platform,
    workflowRunId,
    status: 'building',
    message: runStatus === 'action-required' ? EAS_MERCHANT_MESSAGES.waiting : undefined,
    now,
    eas: {
      workflowRunId,
      startedAt,
    },
  });
};

const timeoutWithoutCredentials = async (now: Date): Promise<void> => {
  const docs = await BuildRequest.find(inFlightQuery()).sort({ updatedAt: 1 }).limit(POLL_BATCH);
  for (const doc of docs) {
    for (const platform of ['android', 'ios'] as const) {
      const state = doc.platforms[platform];
      const workflowRunId = state.eas?.workflowRunId?.trim() ?? '';
      if (!isEasUuid(workflowRunId) || installUrlPresent(state.installUrl)) {
        continue;
      }
      if (state.status !== 'queued' && state.status !== 'building') {
        continue;
      }
      if (!isTimedOut(startedAtOf(state, doc.updatedAt), now)) {
        continue;
      }
      await markPlatform({
        doc,
        platform,
        workflowRunId,
        status: 'failed',
        message: EAS_MERCHANT_MESSAGES.timedOut,
        now,
      });
    }
  }
};

/** Background poll. Safe to run on more than one instance. */
export const pollInFlightEasBuilds = async (): Promise<void> => {
  const decision = readAutomationDecision();
  if (decision.mode === 'skip') {
    return;
  }
  const now = new Date();
  if (decision.mode === 'unconfigured') {
    logEas('poll skipped, automation not configured', { missing: decision.missing.join(',') });
    await timeoutWithoutCredentials(now);
    return;
  }

  const docs = await BuildRequest.find(inFlightQuery()).sort({ updatedAt: 1 }).limit(POLL_BATCH);
  for (const doc of docs) {
    for (const platform of ['android', 'ios'] as const) {
      try {
        await pollPlatform(doc, platform, decision.config, now);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'poll item failed';
        logEas('poll item failed', {
          requestId: doc._id.toString(),
          storeId: doc.storeId.toString(),
          platform,
          message: redactEasLogText(message),
        });
      }
    }
  }
};
