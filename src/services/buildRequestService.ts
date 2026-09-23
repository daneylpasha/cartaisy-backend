import mongoose from 'mongoose';
import BuildRequest, {
  BUILD_PLATFORM_STATUSES,
  BuildPlatformStatus,
  IBuildRequest,
} from '../models/BuildRequest';
import { assertBuildEligible } from './catalogSyncService';
import { BusinessLogicError, NotFoundError } from '../utils/errors';

const ACCESS_NOTES_MAX = 280;
const LIST_LIMIT = 50;

const PLATFORM_STATUS_LIST = BUILD_PLATFORM_STATUSES.join(', ');

export class BuildRequestValidationError extends BusinessLogicError {
  constructor(message: string) {
    super(message, 'BUILD_REQUEST_INVALID', 400);
    this.name = 'BuildRequestValidationError';
  }
}

export interface PublicPlatformState {
  status: BuildPlatformStatus;
  updatedAt: string;
}

export interface PublicBuildRequest {
  id: string;
  storeId: string;
  requestedBy: string;
  platforms: {
    android: PublicPlatformState;
    ios: PublicPlatformState;
  };
  checklist: {
    accessNotes: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

interface BuildRequestRecord {
  _id: mongoose.Types.ObjectId;
  storeId: mongoose.Types.ObjectId;
  requestedBy: mongoose.Types.ObjectId;
  platforms: IBuildRequest['platforms'];
  checklist?: { accessNotes?: string | null };
  createdAt: Date;
  updatedAt: Date;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const assertOnlyKeys = (
  record: Record<string, unknown>,
  allowed: readonly string[],
  label: string
): void => {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      throw new BuildRequestValidationError(`${label} cannot include ${key}`);
    }
  }
};

const parseObjectId = (value: string, label: string): mongoose.Types.ObjectId => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new NotFoundError(`${label} not found`);
  }
  return new mongoose.Types.ObjectId(value);
};

const iso = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
};

export const toPublicBuildRequest = (doc: BuildRequestRecord): PublicBuildRequest => ({
  id: doc._id.toString(),
  storeId: doc.storeId.toString(),
  requestedBy: doc.requestedBy.toString(),
  platforms: {
    android: {
      status: doc.platforms.android.status,
      updatedAt: iso(doc.platforms.android.updatedAt),
    },
    ios: {
      status: doc.platforms.ios.status,
      updatedAt: iso(doc.platforms.ios.updatedAt),
    },
  },
  checklist: {
    accessNotes: doc.checklist?.accessNotes ? doc.checklist.accessNotes : null,
  },
  createdAt: iso(doc.createdAt),
  updatedAt: iso(doc.updatedAt),
});

const parseAccessNotes = (value: unknown): string | null => {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new BuildRequestValidationError('checklist.accessNotes must be a string');
  }
  const notes = value.trim();
  if (!notes) {
    throw new BuildRequestValidationError('checklist.accessNotes cannot be empty');
  }
  if (notes.length > ACCESS_NOTES_MAX) {
    throw new BuildRequestValidationError(
      `checklist.accessNotes must be ${ACCESS_NOTES_MAX} characters or fewer`
    );
  }
  return notes;
};

const parseChecklist = (value: unknown): { accessNotes: string | null } | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new BuildRequestValidationError('checklist must be an object');
  }
  assertOnlyKeys(value, ['accessNotes'], 'checklist');
  if (!Object.prototype.hasOwnProperty.call(value, 'accessNotes')) {
    return undefined;
  }
  return { accessNotes: parseAccessNotes(value.accessNotes) };
};

const parsePlatformChoice = (value: unknown, name: 'android' | 'ios'): boolean => {
  if (value === undefined) {
    return false;
  }
  if (typeof value !== 'boolean') {
    throw new BuildRequestValidationError(`${name} must be a boolean`);
  }
  return value;
};

const platformState = (requested: boolean, now: Date): IBuildRequest['platforms']['android'] => ({
  status: requested ? 'queued' : 'not_requested',
  updatedAt: now,
});

const parseStatus = (value: unknown, platform: 'android' | 'ios'): BuildPlatformStatus => {
  if (typeof value !== 'string' || !BUILD_PLATFORM_STATUSES.includes(value as BuildPlatformStatus)) {
    throw new BuildRequestValidationError(
      `${platform}.status must be one of: ${PLATFORM_STATUS_LIST}`
    );
  }
  return value as BuildPlatformStatus;
};

const parseOpsPlatform = (
  value: unknown,
  platform: 'android' | 'ios'
): BuildPlatformStatus | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new BuildRequestValidationError(`${platform} must be an object with status`);
  }
  assertOnlyKeys(value, ['status'], platform);
  return parseStatus(value.status, platform);
};

export const createStoreBuildRequest = async (input: {
  storeId: string;
  requestedBy: string;
  body: unknown;
}): Promise<PublicBuildRequest> => {
  if (!isRecord(input.body)) {
    throw new BuildRequestValidationError('Request body must be an object');
  }
  assertOnlyKeys(input.body, ['android', 'ios', 'checklist', 'storeId'], 'Request');

  const android = parsePlatformChoice(input.body.android, 'android');
  const ios = parsePlatformChoice(input.body.ios, 'ios');
  if (!android && !ios) {
    throw new BuildRequestValidationError('Choose Android, iOS, or both.');
  }

  const checklist = parseChecklist(input.body.checklist);
  const storeId = parseObjectId(input.storeId, 'Store');
  const requestedBy = parseObjectId(input.requestedBy, 'User');

  // Client storeId is ignored. Eligibility uses the authenticated store only.
  await assertBuildEligible(storeId.toString());

  const now = new Date();
  const created = await BuildRequest.create({
    storeId,
    requestedBy,
    platforms: {
      android: platformState(android, now),
      ios: platformState(ios, now),
    },
    checklist: checklist?.accessNotes ? { accessNotes: checklist.accessNotes } : {},
  });

  return toPublicBuildRequest(created.toObject() as BuildRequestRecord);
};

export const listStoreBuildRequests = async (storeId: string): Promise<PublicBuildRequest[]> => {
  const storeObjectId = parseObjectId(storeId, 'Store');
  const docs = await BuildRequest.find({ storeId: storeObjectId })
    .sort({ createdAt: -1, _id: -1 })
    .limit(LIST_LIMIT)
    .lean<BuildRequestRecord[]>();
  return docs.map(toPublicBuildRequest);
};

export const getStoreBuildRequest = async (
  storeId: string,
  requestId: string
): Promise<PublicBuildRequest> => {
  const storeObjectId = parseObjectId(storeId, 'Store');
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw new NotFoundError('Build request not found', 'BuildRequest', requestId);
  }

  const doc = await BuildRequest.findOne({
    _id: new mongoose.Types.ObjectId(requestId),
    storeId: storeObjectId,
  }).lean<BuildRequestRecord | null>();

  if (!doc) {
    throw new NotFoundError('Build request not found', 'BuildRequest', requestId);
  }
  return toPublicBuildRequest(doc);
};

export const updateStoreBuildRequestChecklist = async (input: {
  storeId: string;
  requestId: string;
  body: unknown;
}): Promise<PublicBuildRequest> => {
  if (!isRecord(input.body)) {
    throw new BuildRequestValidationError('Request body must be an object');
  }
  assertOnlyKeys(input.body, ['checklist', 'storeId'], 'Request');

  const checklist = parseChecklist(input.body.checklist);
  if (!checklist) {
    throw new BuildRequestValidationError('checklist.accessNotes is required');
  }

  const storeObjectId = parseObjectId(input.storeId, 'Store');
  if (!mongoose.Types.ObjectId.isValid(input.requestId)) {
    throw new NotFoundError('Build request not found', 'BuildRequest', input.requestId);
  }

  const update = checklist.accessNotes
    ? { $set: { 'checklist.accessNotes': checklist.accessNotes } }
    : { $unset: { 'checklist.accessNotes': '' } };

  const doc = await BuildRequest.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(input.requestId),
      storeId: storeObjectId,
    },
    update,
    { new: true }
  ).lean<BuildRequestRecord | null>();

  if (!doc) {
    throw new NotFoundError('Build request not found', 'BuildRequest', input.requestId);
  }
  return toPublicBuildRequest(doc);
};

/**
 * Platform status is ops-owned. The caller must already be a platform admin.
 * The update is by request id and may target any store. Only the platforms
 * named in the body change.
 */
export const updateBuildRequestPlatformStatus = async (input: {
  requestId: string;
  body: unknown;
}): Promise<PublicBuildRequest> => {
  if (!isRecord(input.body)) {
    throw new BuildRequestValidationError('Request body must be an object');
  }
  assertOnlyKeys(input.body, ['android', 'ios'], 'Request');

  const android = parseOpsPlatform(input.body.android, 'android');
  const ios = parseOpsPlatform(input.body.ios, 'ios');
  if (!android && !ios) {
    throw new BuildRequestValidationError('Provide android.status, ios.status, or both.');
  }

  if (!mongoose.Types.ObjectId.isValid(input.requestId)) {
    throw new NotFoundError('Build request not found', 'BuildRequest', input.requestId);
  }

  const now = new Date();
  const $set: Record<string, unknown> = {};
  if (android) {
    $set['platforms.android.status'] = android;
    $set['platforms.android.updatedAt'] = now;
  }
  if (ios) {
    $set['platforms.ios.status'] = ios;
    $set['platforms.ios.updatedAt'] = now;
  }

  const doc = await BuildRequest.findOneAndUpdate(
    { _id: new mongoose.Types.ObjectId(input.requestId) },
    { $set },
    { new: true }
  ).lean<BuildRequestRecord | null>();

  if (!doc) {
    throw new NotFoundError('Build request not found', 'BuildRequest', input.requestId);
  }
  return toPublicBuildRequest(doc);
};
