import mongoose from 'mongoose';
import BuildRequest, { IBuildRequest } from '../models/BuildRequest';
import StoreSubmitJob, {
  IStoreSubmitJob,
  StoreSubmitPlatform,
  StoreSubmitStatus,
} from '../models/StoreSubmitJob';
import {
  createEasAndroidSubmission,
  createEasIosSubmission,
  getEasBuild,
  getEasSubmission,
  isEasUuid,
  redactEasLogText,
  type EasSubmissionCreateResult,
} from './easBuildClient';
import {
  openAppleCredentialForSubmit,
  openGoogleCredentialForSubmit,
  responseContainsCredentialSecret,
} from './storeCredentialsService';
import { hasTokenShapedText } from '../utils/expoInstallUrl';
import { withEphemeralSecretFile } from '../utils/ephemeralSecretFile';
import { BusinessLogicError, NotFoundError } from '../utils/errors';

/**
 * Starts and polls EAS Submit for a store's finished build.
 *
 * Expo auth is Cartaisy's EXPO_TOKEN and EAS_PROJECT_ID, the same values
 * build dispatch uses. Store Apple and Google keys are decrypted only for
 * the submit call, written to a temp file, then overwritten and deleted.
 * They are not stored on the job and are not returned to clients.
 */

const SUBMIT_TIMEOUT_MS = 6 * 60 * 60 * 1000;
const STALE_WITHOUT_ID_MS = 2 * 60 * 1000;
const POLL_BATCH = 20;

const PEM_BLOCK = /-----BEGIN [A-Z0-9 ]*-----[\s\S]*?-----END [A-Z0-9 ]*-----/g;
const JSON_PRIVATE_KEY = /"private_key"\s*:\s*"(?:\\.|[^"\\])*"/g;

export const EAS_SUBMIT_MESSAGES = {
  notConfigured: 'Store submit is not available yet. Try again later.',
  credentialsMissingApple: 'Connect an App Store Connect API key before submitting to the App Store.',
  credentialsMissingGoogle: 'Connect a Google Play service account before submitting to Play.',
  credentialsNeedsAttentionApple: 'Upload the App Store Connect API key again before submitting.',
  credentialsNeedsAttentionGoogle: 'Upload the Google Play service account JSON again before submitting.',
  artifactMissing: 'This platform does not have a finished build to submit yet.',
  alreadyInProgress: 'A submit is already in progress for this platform.',
  startFailed: 'The store submit could not be started. Try again in a few minutes.',
  submitFailed: 'The store did not accept this build. Check the store listing, then try again.',
  timedOut: 'The store submit took too long. Try again.',
  unavailable: 'The store submit could not be reached. Try again in a few minutes.',
  invalid: 'Choose ios or android.',
} as const;

type SafeSubmitMessage = (typeof EAS_SUBMIT_MESSAGES)[keyof typeof EAS_SUBMIT_MESSAGES];

export interface PublicStoreSubmit {
  id: string;
  buildRequestId: string;
  platform: StoreSubmitPlatform;
  status: StoreSubmitStatus;
  createdAt: string;
  updatedAt: string;
  message?: string;
}

export class StoreSubmitError extends BusinessLogicError {
  readonly job?: PublicStoreSubmit;

  constructor(message: SafeSubmitMessage, code: string, statusCode: number, job?: PublicStoreSubmit) {
    super(message, code, statusCode);
    this.name = 'StoreSubmitError';
    this.job = job;
  }
}

type SubmitDecision =
  | { mode: 'skip' }
  | { mode: 'unconfigured'; missing: string[] }
  | { mode: 'ready'; token: string; appId: string };

type HeldSecret =
  | { platform: 'ios'; keyId: string; issuerId: string; secret: Buffer }
  | { platform: 'android'; secret: Buffer };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const redactSubmitLogText = (text: string): string => {
  const withoutPem = text.replace(PEM_BLOCK, '[redacted]').replace(JSON_PRIVATE_KEY, '"private_key":"[redacted]"');
  return redactEasLogText(withoutPem);
};

const logSubmit = (event: string, details: Record<string, string | number | undefined>): void => {
  const safe: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined) {
      continue;
    }
    const lowered = key.toLowerCase();
    if (
      lowered.includes('token') ||
      lowered.includes('authorization') ||
      lowered.includes('secret') ||
      lowered.includes('key') ||
      lowered.includes('pem') ||
      lowered.includes('credential')
    ) {
      continue;
    }
    safe[key] = typeof value === 'string' ? redactSubmitLogText(value) : value;
  }
  console.warn(`[eas-submit] ${event}`, safe);
};

const readSubmitDecision = (): SubmitDecision => {
  if (process.env.NODE_ENV === 'test' && process.env.EAS_SUBMIT_AUTOMATION !== '1') {
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
  if (missing.length > 0) {
    return { mode: 'unconfigured', missing };
  }
  return { mode: 'ready', token, appId };
};

const requireReady = (): { token: string; appId: string } => {
  const decision = readSubmitDecision();
  if (decision.mode !== 'ready') {
    if (decision.mode === 'unconfigured') {
      logSubmit('not configured', { missing: decision.missing.join(',') });
    }
    throw new StoreSubmitError(EAS_SUBMIT_MESSAGES.notConfigured, 'SUBMIT_NOT_CONFIGURED', 503);
  }
  return { token: decision.token, appId: decision.appId };
};

const parsePlatformBody = (body: unknown): StoreSubmitPlatform => {
  if (!isRecord(body)) {
    throw new StoreSubmitError(EAS_SUBMIT_MESSAGES.invalid, 'SUBMIT_INVALID', 400);
  }
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'platform') {
    throw new StoreSubmitError(EAS_SUBMIT_MESSAGES.invalid, 'SUBMIT_INVALID', 400);
  }
  if (body.platform !== 'ios' && body.platform !== 'android') {
    throw new StoreSubmitError(EAS_SUBMIT_MESSAGES.invalid, 'SUBMIT_INVALID', 400);
  }
  return body.platform;
};

const parsePlatformParam = (value: string): StoreSubmitPlatform => {
  if (value !== 'ios' && value !== 'android') {
    throw new StoreSubmitError(EAS_SUBMIT_MESSAGES.invalid, 'SUBMIT_INVALID', 400);
  }
  return value;
};

const objectIdOrNotFound = (value: string, label: string): mongoose.Types.ObjectId => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new NotFoundError(`${label} not found`);
  }
  return new mongoose.Types.ObjectId(value);
};

const iso = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
};

const toPublic = (doc: {
  _id: unknown;
  buildRequestId: unknown;
  platform: StoreSubmitPlatform;
  status: StoreSubmitStatus;
  message?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): PublicStoreSubmit => {
  const job: PublicStoreSubmit = {
    id: String(doc._id),
    buildRequestId: String(doc.buildRequestId),
    platform: doc.platform,
    status: doc.status,
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
  };
  if (typeof doc.message === 'string' && doc.message.trim()) {
    job.message = doc.message.trim();
  }
  if (responseContainsCredentialSecret(job) || hasTokenShapedText(JSON.stringify(job))) {
    throw new StoreSubmitError(EAS_SUBMIT_MESSAGES.unavailable, 'SUBMIT_UNAVAILABLE', 500);
  }
  return job;
};

const loadOwnedRequest = async (
  storeId: string,
  buildRequestId: string
): Promise<IBuildRequest> => {
  const requestObjectId = objectIdOrNotFound(buildRequestId, 'Build request');
  const storeObjectId = objectIdOrNotFound(storeId, 'Build request');
  const doc = await BuildRequest.findOne({ _id: requestObjectId, storeId: storeObjectId });
  if (!doc) {
    throw new NotFoundError('Build request not found');
  }
  return doc;
};

const localBuildId = (
  doc: IBuildRequest,
  platform: StoreSubmitPlatform
): string => {
  const state = doc.platforms[platform];
  const buildId = state.eas?.buildId?.trim() ?? '';
  if (state.status !== 'ready' || !isEasUuid(buildId)) {
    throw new StoreSubmitError(EAS_SUBMIT_MESSAGES.artifactMissing, 'SUBMIT_ARTIFACT_MISSING', 409);
  }
  return buildId;
};

const expectedStorePlatform = (platform: StoreSubmitPlatform): string =>
  platform === 'android' ? 'ANDROID' : 'IOS';

const isDuplicateKey = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;

const findInFlight = async (
  storeId: unknown,
  buildRequestId: unknown,
  platform: StoreSubmitPlatform
): Promise<IStoreSubmitJob | null> =>
  StoreSubmitJob.findOne({
    storeId,
    buildRequestId,
    platform,
    status: { $in: ['queued', 'submitting'] },
  });

const reloadPublic = async (id: unknown, storeId: unknown): Promise<PublicStoreSubmit> => {
  const doc = await StoreSubmitJob.findOne({ _id: id, storeId });
  if (!doc) {
    throw new NotFoundError('Store submit not found');
  }
  return toPublic(doc);
};

const writeJob = async (input: {
  id: unknown;
  storeId: unknown;
  status: StoreSubmitStatus;
  message?: SafeSubmitMessage;
  easSubmissionId?: string;
}): Promise<void> => {
  const now = new Date();
  const $set: Record<string, unknown> = {
    status: input.status,
    updatedAt: now,
  };
  const $unset: Record<string, string> = {};
  if (input.status === 'failed' && input.message) {
    $set.message = input.message;
  } else {
    $unset.message = '';
  }
  if (input.easSubmissionId && isEasUuid(input.easSubmissionId)) {
    $set.easSubmissionId = input.easSubmissionId;
  }
  const update: { $set: Record<string, unknown>; $unset?: Record<string, string> } = { $set };
  if (Object.keys($unset).length > 0) {
    update.$unset = $unset;
  }
  await StoreSubmitJob.updateOne(
    {
      _id: input.id,
      storeId: input.storeId,
      status: { $in: ['queued', 'submitting'] },
    },
    update
  );
};

const credentialFailure = (
  platform: StoreSubmitPlatform,
  status: 'missing' | 'needsAttention'
): StoreSubmitError => {
  if (platform === 'ios') {
    return status === 'missing'
      ? new StoreSubmitError(
        EAS_SUBMIT_MESSAGES.credentialsMissingApple,
        'SUBMIT_CREDENTIALS_MISSING',
        409
      )
      : new StoreSubmitError(
        EAS_SUBMIT_MESSAGES.credentialsNeedsAttentionApple,
        'SUBMIT_CREDENTIALS_NEEDS_ATTENTION',
        409
      );
  }
  return status === 'missing'
    ? new StoreSubmitError(
      EAS_SUBMIT_MESSAGES.credentialsMissingGoogle,
      'SUBMIT_CREDENTIALS_MISSING',
      409
    )
    : new StoreSubmitError(
      EAS_SUBMIT_MESSAGES.credentialsNeedsAttentionGoogle,
      'SUBMIT_CREDENTIALS_NEEDS_ATTENTION',
      409
    );
};

const openSecret = async (
  storeId: string,
  platform: StoreSubmitPlatform
): Promise<HeldSecret> => {
  if (platform === 'ios') {
    const opened = await openAppleCredentialForSubmit(storeId);
    if (opened.status !== 'connected') {
      throw credentialFailure(platform, opened.status);
    }
    return {
      platform: 'ios',
      keyId: opened.keyId,
      issuerId: opened.issuerId,
      secret: opened.privateKey,
    };
  }
  const opened = await openGoogleCredentialForSubmit(storeId);
  if (opened.status !== 'connected') {
    throw credentialFailure(platform, opened.status);
  }
  return { platform: 'android', secret: opened.serviceAccountJson };
};

const confirmFinishedBuild = async (input: {
  token: string;
  appId: string;
  buildId: string;
  platform: StoreSubmitPlatform;
}): Promise<void> => {
  const loaded = await getEasBuild({ token: input.token, buildId: input.buildId });
  if (loaded.ok === false) {
    logSubmit('build lookup failed', { status: loaded.status, kind: loaded.kind, platform: input.platform });
    if (loaded.status === 0 || loaded.status >= 500) {
      throw new StoreSubmitError(EAS_SUBMIT_MESSAGES.unavailable, 'SUBMIT_UNAVAILABLE', 503);
    }
    throw new StoreSubmitError(EAS_SUBMIT_MESSAGES.artifactMissing, 'SUBMIT_ARTIFACT_MISSING', 409);
  }
  const build = loaded.build;
  const matches =
    build !== null &&
    build.id === input.buildId &&
    build.projectId === input.appId &&
    build.platform === expectedStorePlatform(input.platform) &&
    build.status === 'FINISHED';
  if (!matches) {
    throw new StoreSubmitError(EAS_SUBMIT_MESSAGES.artifactMissing, 'SUBMIT_ARTIFACT_MISSING', 409);
  }
};

const mapExpoStatus = (status: string): 'submitting' | 'submitted' | 'failed' => {
  const upper = status.toUpperCase();
  if (upper === 'FINISHED') {
    return 'submitted';
  }
  if (upper === 'ERRORED' || upper === 'CANCELED' || upper === 'CANCELLED') {
    return 'failed';
  }
  return 'submitting';
};

const dispatchSubmission = async (input: {
  token: string;
  appId: string;
  buildId: string;
  held: HeldSecret;
}): Promise<EasSubmissionCreateResult> => {
  const bytes = input.held.secret;
  return withEphemeralSecretFile(bytes, async (readBack) => {
    const fileBytes = await readBack();
    let text = '';
    try {
      text = fileBytes.toString('utf8');
      if (input.held.platform === 'ios') {
        return createEasIosSubmission({
          token: input.token,
          appId: input.appId,
          buildId: input.buildId,
          keyId: input.held.keyId,
          issuerId: input.held.issuerId,
          keyP8: text,
        });
      }
      return createEasAndroidSubmission({
        token: input.token,
        appId: input.appId,
        buildId: input.buildId,
        serviceAccountJson: text,
      });
    } finally {
      fileBytes.fill(0);
      text = '';
    }
  });
};

const applyDispatch = async (
  job: { _id: unknown; storeId: unknown },
  result: EasSubmissionCreateResult
): Promise<void> => {
  if (result.ok === false) {
    await writeJob({
      id: job._id,
      storeId: job.storeId,
      status: 'failed',
      message: EAS_SUBMIT_MESSAGES.startFailed,
    });
    return;
  }
  const status = mapExpoStatus(result.status);
  await writeJob({
    id: job._id,
    storeId: job.storeId,
    status,
    easSubmissionId: result.submissionId,
    message: status === 'failed' ? EAS_SUBMIT_MESSAGES.submitFailed : undefined,
  });
};

const ageMs = (value: Date | undefined, now: Date): number => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return 0;
  }
  return now.getTime() - value.getTime();
};

const refreshStoredJob = async (
  doc: IStoreSubmitJob,
  config: { token: string; appId: string },
  now: Date
): Promise<void> => {
  if (doc.status !== 'queued' && doc.status !== 'submitting') {
    return;
  }
  const submissionId = doc.easSubmissionId?.trim() ?? '';
  if (!isEasUuid(submissionId)) {
    if (ageMs(doc.updatedAt, now) > STALE_WITHOUT_ID_MS) {
      await writeJob({
        id: doc._id,
        storeId: doc.storeId,
        status: 'failed',
        message: EAS_SUBMIT_MESSAGES.startFailed,
      });
    }
    return;
  }

  if (ageMs(doc.createdAt, now) > SUBMIT_TIMEOUT_MS) {
    await writeJob({
      id: doc._id,
      storeId: doc.storeId,
      status: 'failed',
      message: EAS_SUBMIT_MESSAGES.timedOut,
    });
    return;
  }

  const loaded = await getEasSubmission({ token: config.token, submissionId });
  if (loaded.ok === false) {
    logSubmit('submission poll failed', {
      status: loaded.status,
      kind: loaded.kind,
      platform: doc.platform,
    });
    if (loaded.status === 404) {
      await writeJob({
        id: doc._id,
        storeId: doc.storeId,
        status: 'failed',
        message: EAS_SUBMIT_MESSAGES.submitFailed,
      });
    }
    return;
  }

  const submission = loaded.submission;
  if (!submission || submission.id !== submissionId) {
    return;
  }
  if (submission.platform !== expectedStorePlatform(doc.platform)) {
    await writeJob({
      id: doc._id,
      storeId: doc.storeId,
      status: 'failed',
      message: EAS_SUBMIT_MESSAGES.submitFailed,
    });
    return;
  }
  const status = mapExpoStatus(submission.status);
  if (status === doc.status) {
    await StoreSubmitJob.updateOne(
      { _id: doc._id, storeId: doc.storeId, status: { $in: ['queued', 'submitting'] } },
      { $set: { updatedAt: now } }
    );
    return;
  }
  await writeJob({
    id: doc._id,
    storeId: doc.storeId,
    status,
    message: status === 'failed' ? EAS_SUBMIT_MESSAGES.submitFailed : undefined,
  });
};

const refreshIfInFlight = async (doc: IStoreSubmitJob): Promise<void> => {
  const decision = readSubmitDecision();
  if (decision.mode !== 'ready') {
    return;
  }
  try {
    await refreshStoredJob(doc, decision, new Date());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'refresh failed';
    logSubmit('refresh failed', {
      platform: doc.platform,
      message: redactSubmitLogText(message),
    });
  }
};

/**
 * Merchant start. Store id is the auth store. A client store id is not read.
 */
export const startStoreSubmit = async (input: {
  storeId: string;
  userId: string;
  buildRequestId: string;
  body: unknown;
}): Promise<PublicStoreSubmit> => {
  const platform = parsePlatformBody(input.body);
  const request = await loadOwnedRequest(input.storeId, input.buildRequestId);
  const config = requireReady();
  const buildId = localBuildId(request, platform);

  const inFlight = await findInFlight(request.storeId, request._id, platform);
  if (inFlight) {
    throw new StoreSubmitError(
      EAS_SUBMIT_MESSAGES.alreadyInProgress,
      'SUBMIT_ALREADY_IN_PROGRESS',
      409,
      toPublic(inFlight)
    );
  }

  const held = await openSecret(input.storeId, platform);
  try {
    await confirmFinishedBuild({
      token: config.token,
      appId: config.appId,
      buildId,
      platform,
    });

    let created: IStoreSubmitJob;
    try {
      created = await StoreSubmitJob.create({
        storeId: request.storeId,
        buildRequestId: request._id,
        platform,
        status: 'queued',
        easBuildId: buildId,
        requestedBy: new mongoose.Types.ObjectId(input.userId),
      });
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error;
      }
      const raced = await findInFlight(request.storeId, request._id, platform);
      throw new StoreSubmitError(
        EAS_SUBMIT_MESSAGES.alreadyInProgress,
        'SUBMIT_ALREADY_IN_PROGRESS',
        409,
        raced ? toPublic(raced) : undefined
      );
    }

    await writeJob({
      id: created._id,
      storeId: created.storeId,
      status: 'submitting',
    });

    try {
      const dispatched = await dispatchSubmission({
        token: config.token,
        appId: config.appId,
        buildId,
        held,
      });
      if (dispatched.ok === false) {
        logSubmit('dispatch failed', { platform, status: dispatched.status, kind: dispatched.kind });
      }
      await applyDispatch(created, dispatched);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'dispatch failed';
      logSubmit('dispatch failed', { platform, message: redactSubmitLogText(message) });
      await writeJob({
        id: created._id,
        storeId: created.storeId,
        status: 'failed',
        message: EAS_SUBMIT_MESSAGES.startFailed,
      });
    }

    return reloadPublic(created._id, created.storeId);
  } finally {
    held.secret.fill(0);
  }
};

export const listStoreSubmits = async (input: {
  storeId: string;
  buildRequestId: string;
}): Promise<PublicStoreSubmit[]> => {
  const request = await loadOwnedRequest(input.storeId, input.buildRequestId);
  const jobs = await Promise.all(
    (['android', 'ios'] as const).map((platform) =>
      StoreSubmitJob.findOne({
        storeId: request.storeId,
        buildRequestId: request._id,
        platform,
      }).sort({ createdAt: -1 })
    )
  );
  const visible: PublicStoreSubmit[] = [];
  for (const job of jobs) {
    if (!job) {
      continue;
    }
    await refreshIfInFlight(job);
    const fresh = await StoreSubmitJob.findOne({ _id: job._id, storeId: request.storeId });
    if (fresh) {
      visible.push(toPublic(fresh));
    }
  }
  return visible;
};

export const getStoreSubmit = async (input: {
  storeId: string;
  buildRequestId: string;
  platform: string;
}): Promise<PublicStoreSubmit> => {
  const platformName = parsePlatformParam(input.platform);
  const request = await loadOwnedRequest(input.storeId, input.buildRequestId);
  const job = await StoreSubmitJob.findOne({
    storeId: request.storeId,
    buildRequestId: request._id,
    platform: platformName,
  }).sort({ createdAt: -1 });
  if (!job) {
    throw new NotFoundError('Store submit not found');
  }
  await refreshIfInFlight(job);
  return reloadPublic(job._id, request.storeId);
};

const failTimedOutWithoutCredentials = async (now: Date): Promise<void> => {
  const cutoff = new Date(now.getTime() - SUBMIT_TIMEOUT_MS);
  const docs = await StoreSubmitJob.find({
    status: { $in: ['queued', 'submitting'] },
    createdAt: { $lt: cutoff },
  })
    .sort({ updatedAt: 1 })
    .limit(POLL_BATCH);
  for (const doc of docs) {
    await writeJob({
      id: doc._id,
      storeId: doc.storeId,
      status: 'failed',
      message: EAS_SUBMIT_MESSAGES.timedOut,
    });
  }
};

/** Background poll. Safe to run on more than one instance. */
export const pollInFlightStoreSubmits = async (): Promise<void> => {
  const decision = readSubmitDecision();
  const now = new Date();
  if (decision.mode === 'skip') {
    return;
  }
  if (decision.mode === 'unconfigured') {
    logSubmit('poll skipped, submit not configured', { missing: decision.missing.join(',') });
    await failTimedOutWithoutCredentials(now);
    return;
  }

  const docs = await StoreSubmitJob.find({ status: { $in: ['queued', 'submitting'] } })
    .sort({ updatedAt: 1 })
    .limit(POLL_BATCH);
  for (const doc of docs) {
    try {
      await refreshStoredJob(doc, decision, now);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'poll item failed';
      logSubmit('poll item failed', {
        platform: doc.platform,
        message: redactSubmitLogText(message),
      });
    }
  }
};
