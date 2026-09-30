import { Types } from 'mongoose';

/**
 * Merchant multi-store membership.
 * `storeId` is the active store. `storeIds` lists stores this user may open.
 * An empty membership with an active store is treated as `[storeId]`.
 */

/** Soft cap for stores on one merchant account. Not a billing gate. */
export const MAX_MERCHANT_STORES = 10;

export interface StoreMembershipRecord {
  storeId?: unknown;
  storeIds?: unknown;
}

export function normalizeStoreId(value: unknown): string | null {
  if (value == null || value === '') {
    return null;
  }

  const stringValue = String(value);
  if (!Types.ObjectId.isValid(stringValue) || !/^[0-9a-fA-F]{24}$/.test(stringValue)) {
    return null;
  }

  return stringValue;
}

/** Ids stored on `storeIds`, ignoring a missing or empty list. */
export function explicitStoreIds(user: StoreMembershipRecord | null | undefined): string[] {
  if (!user || !Array.isArray(user.storeIds)) {
    return [];
  }

  const ids: string[] = [];
  for (const entry of user.storeIds) {
    const id = normalizeStoreId(entry);
    if (id && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Stores the user may open. Empty `storeIds` with `storeId` set yields `[storeId]`.
 */
export function membershipStoreIds(user: StoreMembershipRecord | null | undefined): string[] {
  const explicit = explicitStoreIds(user);
  if (explicit.length > 0) {
    return explicit;
  }

  const active = normalizeStoreId(user?.storeId);
  return active ? [active] : [];
}

export function isStoreMember(
  user: StoreMembershipRecord | null | undefined,
  storeId: unknown
): boolean {
  const normalized = normalizeStoreId(storeId);
  if (!normalized) {
    return false;
  }
  return membershipStoreIds(user).includes(normalized);
}

/**
 * Membership after one store is removed.
 * Returns null when that id is not in membership.
 * `storeId` is null when nothing remains. The active store stays when it
 * is still in the list; otherwise it becomes the first remaining id.
 */
export function membershipWithoutStore(
  user: StoreMembershipRecord | null | undefined,
  removedStoreId: string
): { storeIds: string[]; storeId: string | null } | null {
  const removed = normalizeStoreId(removedStoreId);
  if (!removed) {
    return null;
  }

  const membership = membershipStoreIds(user);
  if (!membership.includes(removed)) {
    return null;
  }

  const storeIds = membership.filter(id => id !== removed);
  const active = normalizeStoreId(user?.storeId);
  const storeId = active && storeIds.includes(active) ? active : (storeIds[0] ?? null);
  return { storeIds, storeId };
}

/**
 * Mutates the user so an empty membership is `[storeId]`, and a missing active
 * store becomes the first membership id. Returns true when a field changed.
 */
export function backfillStoreMembership(user: StoreMembershipRecord): boolean {
  const explicit = explicitStoreIds(user);
  const active = normalizeStoreId(user.storeId);
  let changed = false;

  if (explicit.length === 0 && active) {
    user.storeIds = [new Types.ObjectId(active)];
    changed = true;
  }

  const membership = explicit.length > 0 ? explicit : active ? [active] : [];
  if (!active && membership[0]) {
    user.storeId = new Types.ObjectId(membership[0]);
    changed = true;
  }

  return changed;
}

export async function persistStoreMembership(
  user: StoreMembershipRecord & {
    save?: (options?: { validateBeforeSave?: boolean }) => Promise<unknown>;
  }
): Promise<void> {
  if (backfillStoreMembership(user) && typeof user.save === 'function') {
    await user.save({ validateBeforeSave: false });
  }
}

/** Slug for a new store. Fits Store.slug (max 50, lowercase, hyphenated). */
export function buildStoreSlug(storeName: string): string {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const maxBase = Math.max(1, 50 - suffix.length - 1);
  const base = storeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxBase)
    .replace(/-+$/g, '');
  const slug = `${base || 'store'}-${suffix}`;
  return slug.slice(0, 50).replace(/-+$/g, '');
}
