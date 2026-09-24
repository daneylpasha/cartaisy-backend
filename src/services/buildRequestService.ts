import mongoose from 'mongoose';
import BuildRequest, {
  BUILD_PLATFORM_STATUSES,
  BuildPlatformStatus,
  IBuildRequest,
} from '../models/BuildRequest';
import Store from '../models/Store';
import { assertBuildEligible } from './catalogSyncService';
import { BusinessLogicError, NotFoundError } from '../utils/errors';

const ACCESS_NOTES_MAX = 280;
const LIST_LIMIT = 50;
const ADMIN_LIMIT_DEFAULT = 20;
const ADMIN_LIMIT_MAX = 50;
const ADMIN_PAGE_MAX = 1000;

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

export interface AdminBuildRequest extends PublicBuildRequest {
  store: {
    id: string;
    name: string | null;
    domain: string | null;
  };
}

export interface AdminBuildRequestPage {
  requests: AdminBuildRequest[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
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

const textOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const parsePositiveInt = (value: unknown, label: string, max: number): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new BuildRequestValidationError(`${label} must be a positive integer`);
  }
  const parsed = Number(value);
  if (parsed > max) {
    throw new BuildRequestValidationError(`${label} must be ${max} or fewer`);
  }
  return parsed;
};

const parsePlatformFilter = (value: unknown): 'android' | 'ios' | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === 'android' || value === 'ios') {
    return value;
  }
  throw new BuildRequestValidationError('platform must be android or ios');
};

const parseStatusFilter = (value: unknown): BuildPlatformStatus[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const parts: string[] = [];
  const collect = (item: unknown): void => {
    if (typeof item !== 'string') {
      throw new BuildRequestValidationError(`status must be one of: ${PLATFORM_STATUS_LIST}`);
    }
    parts.push(...item.split(','));
  };

  if (Array.isArray(value)) {
    value.forEach(collect);
  } else {
    collect(value);
  }

  const statuses: BuildPlatformStatus[] = [];
  for (const part of parts) {
    const token = part.trim();
    if (!BUILD_PLATFORM_STATUSES.includes(token as BuildPlatformStatus)) {
      throw new BuildRequestValidationError(`status must be one of: ${PLATFORM_STATUS_LIST}`);
    }
    const status = token as BuildPlatformStatus;
    if (!statuses.includes(status)) {
      statuses.push(status);
    }
  }

  if (statuses.length === 0) {
    throw new BuildRequestValidationError(`status must be one of: ${PLATFORM_STATUS_LIST}`);
  }
  return statuses;
};

const buildListFilter = (
  platform: 'android' | 'ios' | undefined,
  statuses: BuildPlatformStatus[] | undefined
): mongoose.FilterQuery<IBuildRequest> => {
  if (platform) {
    return platformStatusFilter(platform, statuses);
  }
  if (!statuses) {
    return {};
  }
  return {
    $or: [
      { 'platforms.android.status': { $in: statuses } },
      { 'platforms.ios.status': { $in: statuses } },
    ],
  };
};

const platformStatusFilter = (
  platform: 'android' | 'ios',
  statuses: BuildPlatformStatus[] | undefined
): mongoose.FilterQuery<IBuildRequest> => {
  const path = platform === 'android' ? 'platforms.android.status' : 'platforms.ios.status';
  if (statuses) {
    return { [path]: { $in: statuses } };
  }
  return { [path]: { $ne: 'not_requested' } };
};

interface StoreListIdentity {
  _id: mongoose.Types.ObjectId;
  name?: string;
  shopify?: { shop?: string };
}

/**
 * Cross-store queue for platform ops. The caller must already be a platform
 * admin. Store identity is joined for the page only. A missing store still
 * leaves the request in the queue.
 */
export const listPlatformBuildRequests = async (
  query: unknown
): Promise<AdminBuildRequestPage> => {
  if (!isRecord(query)) {
    throw new BuildRequestValidationError('Query must be an object');
  }
  assertOnlyKeys(query, ['page', 'limit', 'status', 'platform'], 'Query');

  const page = parsePositiveInt(query.page, 'page', ADMIN_PAGE_MAX) ?? 1;
  const limit = parsePositiveInt(query.limit, 'limit', ADMIN_LIMIT_MAX) ?? ADMIN_LIMIT_DEFAULT;
  const platform = parsePlatformFilter(query.platform);
  const statuses = parseStatusFilter(query.status);
  const filter = buildListFilter(platform, statuses);

  const [docs, total] = await Promise.all([
    BuildRequest.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<BuildRequestRecord[]>(),
    BuildRequest.countDocuments(filter),
  ]);

  const storeIds = [...new Set(docs.map((doc) => doc.storeId.toString()))];
  const stores = storeIds.length
    ? await Store.find({ _id: { $in: storeIds } })
        .select('name shopify.shop')
        .lean<StoreListIdentity[]>()
    : [];
  const storesById = new Map(stores.map((store) => [store._id.toString(), store]));

  return {
    requests: docs.map((doc) => {
      const store = storesById.get(doc.storeId.toString());
      return {
        ...toPublicBuildRequest(doc),
        store: {
          id: doc.storeId.toString(),
          name: textOrNull(store?.name),
          domain: textOrNull(store?.shopify?.shop),
        },
      };
    }),
    pagination: {
      page,
      limit,
      total,
      pages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
};
