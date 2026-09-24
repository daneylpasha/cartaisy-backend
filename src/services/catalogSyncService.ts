import mongoose from 'mongoose';
import Store, { CatalogSyncState, ICatalogSync } from '../models/Store';
import { performFullSync } from './syncService';
import { BusinessLogicError, NotFoundError } from '../utils/errors';

/**
 * Durable catalog sync status for the authenticated store (issue #154).
 *
 * `POST /api/v1/shopify/sync` is the merchant Sync again entrypoint. A
 * successful Shopify OAuth callback (issue #166) starts the same sync without
 * a second route: it claims `syncing` and then runs detached so the dashboard
 * redirect is not blocked. There is no separate job queue.
 *
 * Quiet retries: the first failure is retried immediately up to
 * `CATALOG_SYNC_QUIET_RETRIES` more times (three attempts total) before the
 * stored status becomes `failed`. Status stays `syncing` for those retries.
 * The dashboard does not surface attempt numbers. Sync again waits for that
 * run. The connect callback does not. A `syncing` record older than
 * `CATALOG_SYNC_STALE_AFTER_MS` can be claimed again, so a process restart
 * does not leave the store stuck. A fresher `syncing` record is left alone.
 *
 * Build eligibility minimal bar: Shopify is connected for this store AND
 * `catalogSync.status` is `succeeded` for that same shop domain. `idle`,
 * `syncing`, `failed`, a success recorded for a different shop, and a
 * disconnected store are not eligible. Do not use `shopify.lastSyncAt`.
 * Connect does not stamp that field; a catalog sync writes it when it runs.
 */

export const CATALOG_SYNC_QUIET_RETRIES = 2;
export const CATALOG_SYNC_STALE_AFTER_MS = 15 * 60 * 1000;
export const CATALOG_SYNC_MAX_ATTEMPTS = 1 + CATALOG_SYNC_QUIET_RETRIES;
export const BUILD_NOT_ELIGIBLE_CODE = 'BUILD_NOT_ELIGIBLE' as const;
export const BUILD_ELIGIBLE_CODE = 'BUILD_ELIGIBLE' as const;
export const CATALOG_SYNC_PRIMARY_ACTION = 'Sync again' as const;

const ERROR_SUMMARY_MAX = 180;

export type BuildIneligibilityReason = 'shopify_not_connected' | 'catalog_sync_not_succeeded';

export interface BuildEligibility {
  eligible: boolean;
  code: typeof BUILD_ELIGIBLE_CODE | typeof BUILD_NOT_ELIGIBLE_CODE;
  reason: BuildIneligibilityReason | null;
  message: string;
}

export interface CatalogSyncStats {
  productsSync: number;
  customersSync: number;
  ordersSync: number;
}

export interface CatalogSyncPublicStatus {
  status: CatalogSyncState;
  shop: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastSucceededAt: string | null;
  errorSummary: string | null;
  attempts: number;
  eligibleForBuild: boolean;
  eligibilityCode: BuildEligibility['code'];
  eligibilityReason: BuildIneligibilityReason | null;
  /** Dashboard primary button label. Always Sync again. */
  primaryAction: typeof CATALOG_SYNC_PRIMARY_ACTION;
}

export interface CatalogSyncRunResult {
  outcome: 'succeeded' | 'failed';
  stats?: CatalogSyncStats;
  errorSummary?: string;
  data: CatalogSyncPublicStatus;
}

export class CatalogSyncNotConnectedError extends Error {
  readonly statusCode = 409;
  readonly code = 'SHOPIFY_NOT_CONNECTED';

  constructor() {
    super('Store is not connected to Shopify');
    this.name = 'CatalogSyncNotConnectedError';
  }
}

export class CatalogSyncStoreNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = 'STORE_NOT_FOUND';

  constructor() {
    super('Store not found');
    this.name = 'CatalogSyncStoreNotFoundError';
  }
}

export class CatalogSyncInProgressError extends Error {
  readonly statusCode = 409;
  readonly code = 'CATALOG_SYNC_IN_PROGRESS';
  readonly catalogSync: CatalogSyncPublicStatus;

  constructor(catalogSync: CatalogSyncPublicStatus) {
    super('Sync already in progress');
    this.name = 'CatalogSyncInProgressError';
    this.catalogSync = catalogSync;
  }
}

/**
 * Thrown by `assertBuildEligible` so build-request creation (issue #155) can
 * reject with one stable error code. `reason` tells the UI which gate failed.
 */
export class BuildNotEligibleError extends BusinessLogicError {
  readonly reason: BuildIneligibilityReason;

  constructor(message: string, reason: BuildIneligibilityReason) {
    super(message, BUILD_NOT_ELIGIBLE_CODE, 409, { reason });
    this.name = 'BuildNotEligibleError';
    this.reason = reason;
  }
}

export const buildEligibilityErrorBody = (
  error: BuildNotEligibleError
): {
  success: false;
  error: string;
  code: typeof BUILD_NOT_ELIGIBLE_CODE;
  reason: BuildIneligibilityReason;
} => ({
  success: false,
  error: error.message,
  code: BUILD_NOT_ELIGIBLE_CODE,
  reason: error.reason,
});

interface CatalogSyncStoreSlice {
  shopify?: {
    isConnected?: boolean;
    shop?: string;
  };
  catalogSync?: Partial<ICatalogSync>;
}

const EMPTY_STATS: CatalogSyncStats = {
  productsSync: 0,
  customersSync: 0,
  ordersSync: 0,
};

const shopKey = (shop?: string | null): string => (shop || '').trim().toLowerCase();

const iso = (value?: Date | string | null): string | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
};

/**
 * UI-safe failure text. Non-Error values are dropped so a Shopify payload
 * cannot be stringified into the dashboard. Token-shaped fragments are
 * redacted and the result is length-capped.
 */
export const toSafeSyncErrorSummary = (error: unknown): string => {
  const raw = error instanceof Error && error.message ? error.message : 'Catalog sync failed. Use Sync again.';
  const redacted = raw
    .replace(/shpat_[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/shpca_[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/shpct_[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/shpss_[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/shpua_[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  const summary = redacted || 'Catalog sync failed. Use Sync again.';
  if (summary.length <= ERROR_SUMMARY_MAX) {
    return summary;
  }
  return `${summary.slice(0, ERROR_SUMMARY_MAX - 3)}...`;
};

const isShopifyConnected = (store: CatalogSyncStoreSlice): boolean =>
  store.shopify?.isConnected === true && shopKey(store.shopify?.shop).length > 0;

/**
 * Minimal build bar. See the file comment. `lastSucceededAt` alone is not
 * enough: a later `failed` or `syncing` run is ineligible even if an older
 * success timestamp is still stored.
 */
export const evaluateBuildEligibility = (store: CatalogSyncStoreSlice): BuildEligibility => {
  if (!isShopifyConnected(store)) {
    return {
      eligible: false,
      code: BUILD_NOT_ELIGIBLE_CODE,
      reason: 'shopify_not_connected',
      message: 'Connect Shopify before requesting a build.',
    };
  }

  const syncShop = shopKey(store.catalogSync?.shop);
  const connectedShop = shopKey(store.shopify?.shop);
  const succeededForThisShop =
    store.catalogSync?.status === 'succeeded' && syncShop.length > 0 && syncShop === connectedShop;

  if (succeededForThisShop) {
    return {
      eligible: true,
      code: BUILD_ELIGIBLE_CODE,
      reason: null,
      message: 'Shopify is connected and the catalog sync succeeded.',
    };
  }

  return {
    eligible: false,
    code: BUILD_NOT_ELIGIBLE_CODE,
    reason: 'catalog_sync_not_succeeded',
    message: 'Sync the catalog successfully before requesting a build. Use Sync again.',
  };
};

export const toCatalogSyncPublicStatus = (store: CatalogSyncStoreSlice): CatalogSyncPublicStatus => {
  const eligibility = evaluateBuildEligibility(store);
  const sync = store.catalogSync;
  const status: CatalogSyncState = sync?.status || 'idle';

  return {
    status,
    shop: sync?.shop ? shopKey(sync.shop) : null,
    startedAt: iso(sync?.startedAt),
    finishedAt: iso(sync?.finishedAt),
    lastSucceededAt: iso(sync?.lastSucceededAt),
    errorSummary: status === 'failed' ? sync?.errorSummary || 'Catalog sync failed. Use Sync again.' : null,
    attempts: sync?.attempts ?? 0,
    eligibleForBuild: eligibility.eligible,
    eligibilityCode: eligibility.code,
    eligibilityReason: eligibility.reason,
    primaryAction: CATALOG_SYNC_PRIMARY_ACTION,
  };
};

const loadStore = async (storeId: string): Promise<CatalogSyncStoreSlice | null> => {
  if (!mongoose.Types.ObjectId.isValid(storeId)) {
    return null;
  }

  return Store.findById(storeId)
    .select('shopify.isConnected shopify.shop catalogSync')
    .lean<CatalogSyncStoreSlice | null>();
};

export const getCatalogSyncStatus = async (
  storeId: string
): Promise<CatalogSyncPublicStatus | null> => {
  const store = await loadStore(storeId);
  if (!store) {
    return null;
  }
  return toCatalogSyncPublicStatus(store);
};

export const getBuildEligibility = async (storeId: string): Promise<BuildEligibility> => {
  const store = await loadStore(storeId);
  if (!store) {
    throw new NotFoundError('Store not found', 'Store', storeId);
  }
  return evaluateBuildEligibility(store);
};

/**
 * Gate for build-request creation. Issue #155 should call this and, on
 * `BuildNotEligibleError`, respond with `buildEligibilityErrorBody(error)`
 * at HTTP 409. The code is always `BUILD_NOT_ELIGIBLE`.
 */
export const assertBuildEligible = async (storeId: string): Promise<BuildEligibility> => {
  const eligibility = await getBuildEligibility(storeId);
  if (!eligibility.eligible && eligibility.reason) {
    throw new BuildNotEligibleError(eligibility.message, eligibility.reason);
  }
  return eligibility;
};

/**
 * When OAuth connects a different shop, the previous catalog result no longer
 * applies. Returns the `$set` / `$unset` to merge into that same credential
 * write, or null when the shop did not change.
 */
export const catalogSyncShopChangeUpdate = (
  previousCatalogShop: string | undefined,
  previousConnectedShop: string | undefined,
  nextShop: string
): { set: Record<string, unknown>; unset: Record<string, string> } | null => {
  const next = shopKey(nextShop);
  const baseline = shopKey(previousCatalogShop) || shopKey(previousConnectedShop);
  if (!next || !baseline || baseline === next) {
    return null;
  }

  return {
    set: {
      'catalogSync.status': 'idle',
      'catalogSync.shop': next,
      'catalogSync.attempts': 0,
    },
    unset: {
      'catalogSync.startedAt': '',
      'catalogSync.finishedAt': '',
      'catalogSync.lastSucceededAt': '',
      'catalogSync.errorSummary': '',
    },
  };
};

const storedCatalogSync = (sync?: Partial<ICatalogSync>): Record<string, unknown> | null => {
  if (!sync?.status) {
    return null;
  }

  const stored: Record<string, unknown> = {
    status: sync.status,
    attempts: sync.attempts ?? 0,
  };
  if (sync.shop) {
    stored.shop = shopKey(sync.shop);
  }
  if (sync.startedAt) {
    stored.startedAt = sync.startedAt;
  }
  if (sync.finishedAt) {
    stored.finishedAt = sync.finishedAt;
  }
  if (sync.lastSucceededAt) {
    stored.lastSucceededAt = sync.lastSucceededAt;
  }
  if (sync.errorSummary) {
    stored.errorSummary = sync.errorSummary;
  }
  return stored;
};

const restoreCatalogSync = async (
  storeId: string,
  previous: Partial<ICatalogSync> | undefined
): Promise<void> => {
  const stored = storedCatalogSync(previous);
  if (!stored) {
    await Store.updateOne({ _id: storeId }, { $unset: { catalogSync: '' } });
    return;
  }
  await Store.updateOne({ _id: storeId }, { $set: { catalogSync: stored } });
};

const readPublicStatus = async (storeId: string): Promise<CatalogSyncPublicStatus> => {
  const status = await getCatalogSyncStatus(storeId);
  if (!status) {
    throw new CatalogSyncStoreNotFoundError();
  }
  return status;
};

const claimSync = async (storeId: string, shop: string): Promise<CatalogSyncStoreSlice> => {
  const staleBefore = new Date(Date.now() - CATALOG_SYNC_STALE_AFTER_MS);
  const claimed = await Store.findOneAndUpdate(
    {
      _id: storeId,
      'shopify.isConnected': true,
      'shopify.shop': shop,
      $or: [
        { 'catalogSync.status': { $ne: 'syncing' } },
        {
          'catalogSync.status': 'syncing',
          'catalogSync.startedAt': { $lte: staleBefore },
        },
        {
          'catalogSync.status': 'syncing',
          'catalogSync.startedAt': { $exists: false },
        },
      ],
    },
    {
      $set: {
        'catalogSync.status': 'syncing',
        'catalogSync.shop': shop,
        'catalogSync.startedAt': new Date(),
        'catalogSync.attempts': 1,
      },
      $unset: {
        'catalogSync.finishedAt': '',
        'catalogSync.errorSummary': '',
      },
    },
    { new: false }
  ).lean<CatalogSyncStoreSlice | null>();

  if (!claimed) {
    const current = await loadStore(storeId);
    if (!current) {
      throw new CatalogSyncStoreNotFoundError();
    }
    if (!isShopifyConnected(current) || shopKey(current.shopify?.shop) !== shopKey(shop)) {
      throw new CatalogSyncNotConnectedError();
    }
    throw new CatalogSyncInProgressError(toCatalogSyncPublicStatus(current));
  }

  return claimed;
};

/**
 * `syncProducts` swallows fetch failures and returns `{ synced: 0, errors }`
 * instead of throwing. That must not become `succeeded`: an empty catalog with
 * no errors is a real success, but zero products plus errors is a failed run.
 */
const resolvedSyncFailureMessage = (
  result: { errors?: unknown; stats?: { productsSync?: number } } | null | undefined
): string | null => {
  const productCount = result?.stats?.productsSync ?? 0;
  const errors = Array.isArray(result?.errors)
    ? result.errors.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  if (productCount > 0 || errors.length === 0) {
    return null;
  }
  return errors.join('; ');
};

const activeSyncFilter = (storeId: string, shop: string) => ({
  _id: storeId,
  'shopify.isConnected': true,
  'shopify.shop': shop,
  'catalogSync.status': 'syncing',
  'catalogSync.shop': shopKey(shop),
});

const markSucceeded = async (storeId: string, shop: string, attempts: number): Promise<void> => {
  const now = new Date();
  const updated = await Store.updateOne(activeSyncFilter(storeId, shop), {
    $set: {
      'catalogSync.status': 'succeeded',
      'catalogSync.shop': shopKey(shop),
      'catalogSync.finishedAt': now,
      'catalogSync.lastSucceededAt': now,
      'catalogSync.attempts': attempts,
    },
    $unset: {
      'catalogSync.errorSummary': '',
    },
  });
  if (updated.matchedCount === 0) {
    throw new CatalogSyncNotConnectedError();
  }
};

const markFailed = async (
  storeId: string,
  shop: string,
  errorSummary: string,
  attempts: number
): Promise<void> => {
  const updated = await Store.updateOne(activeSyncFilter(storeId, shop), {
    $set: {
      'catalogSync.status': 'failed',
      'catalogSync.shop': shopKey(shop),
      'catalogSync.finishedAt': new Date(),
      'catalogSync.errorSummary': errorSummary,
      'catalogSync.attempts': attempts,
    },
  });
  if (updated.matchedCount === 0) {
    throw new CatalogSyncNotConnectedError();
  }
};

/**
 * Body of a sync that has already claimed `syncing`. Shared by Sync again,
 * which waits for the result, and by the post-connect kickoff, which does not.
 */
const executeClaimedCatalogSync = async (
  storeId: string,
  shop: string,
  previous: CatalogSyncStoreSlice
): Promise<CatalogSyncRunResult> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= CATALOG_SYNC_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) {
      const bumped = await Store.updateOne(activeSyncFilter(storeId, shop), {
        $set: { 'catalogSync.attempts': attempt },
      });
      if (bumped.matchedCount === 0) {
        throw new CatalogSyncNotConnectedError();
      }
    }

    try {
      const result = await performFullSync(storeId);
      const failureMessage = resolvedSyncFailureMessage(result);
      if (failureMessage) {
        throw new Error(failureMessage);
      }
      await markSucceeded(storeId, shop, attempt);
      return {
        outcome: 'succeeded',
        stats: result?.stats ?? EMPTY_STATS,
        data: await readPublicStatus(storeId),
      };
    } catch (error) {
      if (error instanceof CatalogSyncNotConnectedError || error instanceof CatalogSyncStoreNotFoundError) {
        throw error;
      }
      if (error instanceof Error && error.message === 'Sync already in progress') {
        await restoreCatalogSync(storeId, previous.catalogSync);
        throw new CatalogSyncInProgressError(await readPublicStatus(storeId));
      }

      lastError = error;
      console.warn(
        `Catalog sync attempt ${attempt}/${CATALOG_SYNC_MAX_ATTEMPTS} failed for store ${storeId} shop ${shop}: ${toSafeSyncErrorSummary(error)}`
      );
    }
  }

  const errorSummary = toSafeSyncErrorSummary(lastError);
  await markFailed(storeId, shop, errorSummary, CATALOG_SYNC_MAX_ATTEMPTS);
  return {
    outcome: 'failed',
    errorSummary,
    data: await readPublicStatus(storeId),
  };
};

/** In-process runs started by `startCatalogSyncForStore`. Tests drain this. */
const inFlightCatalogSyncs = new Set<Promise<void>>();

const trackInFlightCatalogSync = (run: Promise<unknown>): void => {
  const tracked = run.then(
    () => undefined,
    () => undefined
  );
  inFlightCatalogSyncs.add(tracked);
  void tracked.then(() => {
    inFlightCatalogSyncs.delete(tracked);
  });
};

/** Resolves when every detached catalog sync started so far has finished. */
export const settleInFlightCatalogSyncs = async (): Promise<void> => {
  let snapshot = [...inFlightCatalogSyncs];
  while (snapshot.length > 0) {
    await Promise.all(snapshot);
    snapshot = [...inFlightCatalogSyncs].filter(run => !snapshot.includes(run));
  }
};

const claimCatalogSync = async (
  storeId: string
): Promise<{ shop: string; previous: CatalogSyncStoreSlice }> => {
  const store = await loadStore(storeId);
  if (!store) {
    throw new CatalogSyncStoreNotFoundError();
  }
  if (!isShopifyConnected(store)) {
    throw new CatalogSyncNotConnectedError();
  }

  const shop = (store.shopify?.shop || '').trim();
  const previous = await claimSync(storeId, shop);
  return { shop, previous };
};

/**
 * Sync again for one store. Overlapping calls while a fresh `syncing` record
 * exists do not start a second run. A `syncing` record older than
 * `CATALOG_SYNC_STALE_AFTER_MS` can be claimed again. A resolved run that
 * imported products is success even if some records reported errors. Zero
 * products plus errors is a failure (Shopify fetch failures return that way
 * instead of throwing) and is retried quietly, then stored as `failed`. An
 * empty catalog with no errors is success.
 */
export const syncCatalogForStore = async (storeId: string): Promise<CatalogSyncRunResult> => {
  const { shop, previous } = await claimCatalogSync(storeId);
  return executeClaimedCatalogSync(storeId, shop, previous);
};

/**
 * Claim `syncing` and run the catalog sync without awaiting it.
 * Returns after the status write so callers can redirect while the import
 * continues. A fresh in-progress sync returns `already_running` and does not
 * start another run. Failures are logged with the store id and shop; they
 * are not thrown to the caller after the run has been detached.
 */
export const startCatalogSyncForStore = async (
  storeId: string
): Promise<'started' | 'already_running'> => {
  let shop = '';
  try {
    const claimed = await claimCatalogSync(storeId);
    shop = claimed.shop;
    const run = executeClaimedCatalogSync(storeId, shop, claimed.previous)
      .then(result => {
        if (result.outcome === 'failed') {
          console.error(
            `Catalog sync failed for store ${storeId} shop ${shop}: ${result.errorSummary}`
          );
        }
      })
      .catch((error: unknown) => {
        console.error(
          `Catalog sync error for store ${storeId} shop ${shop}: ${toSafeSyncErrorSummary(error)}`
        );
      });
    trackInFlightCatalogSync(run);
    return 'started';
  } catch (error) {
    if (error instanceof CatalogSyncInProgressError) {
      return 'already_running';
    }
    throw error;
  }
};
