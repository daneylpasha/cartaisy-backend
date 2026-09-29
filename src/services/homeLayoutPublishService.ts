import HomeLayout, { IHomeLayoutSection } from '../models/HomeLayout';

/**
 * Publish rules shared with the dashboard App Builder.
 *
 * The installed app reads `sections` only after a layout is live.
 * A draft save lives in `draftSections` and must not change that snapshot.
 * Layouts saved before `publishedAt` existed stay live when `sections` is
 * non-empty. An empty `sections` list with no `publishedAt` is not published.
 */

export interface StoredHomeLayout {
  sections?: readonly IHomeLayoutSection[] | null;
  draftSections?: readonly IHomeLayoutSection[] | null;
  publishedAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export function isPublishedAt(value: Date | string | null | undefined): boolean {
  if (value == null) return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function sortedSections(
  sections: readonly IHomeLayoutSection[] | null | undefined
): IHomeLayoutSection[] {
  return [...(sections ?? [])].sort((a, b) => a.position - b.position);
}

/**
 * True when the installed app should read `sections`.
 * Legacy documents with saved sections and no `publishedAt` count as live.
 */
export function homeLayoutIsLive(
  publishedAt: Date | string | null | undefined,
  storedSections: readonly IHomeLayoutSection[] | null | undefined
): boolean {
  if (isPublishedAt(publishedAt)) return true;
  return sortedSections(storedSections).length > 0;
}

/** True when a one-time backfill should set `publishedAt` and leave `sections` alone. */
export function needsLegacyPublishBackfill(
  publishedAt: Date | string | null | undefined,
  storedSections: readonly IHomeLayoutSection[] | null | undefined
): boolean {
  return !isPublishedAt(publishedAt) && sortedSections(storedSections).length > 0;
}

/** Prefer the document's last save time so the backfill is not "published just now". */
export function legacyPublishedAt(
  updatedAt: Date | string | null | undefined,
  now: Date = new Date()
): Date {
  if (updatedAt instanceof Date && !Number.isNaN(updatedAt.getTime())) return updatedAt;
  if (typeof updatedAt === 'string' && updatedAt.trim().length > 0) {
    const parsed = new Date(updatedAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return now;
}

/**
 * Section order and visibility the homescreen may serve.
 * Empty when the layout has never been published.
 */
export function publishedLayoutSections(
  publishedAt: Date | string | null | undefined,
  storedSections: readonly IHomeLayoutSection[] | null | undefined
): IHomeLayoutSection[] {
  if (!homeLayoutIsLive(publishedAt, storedSections)) return [];
  return sortedSections(storedSections);
}

/**
 * One-time backfill for layouts saved before publish existed.
 * Sets `publishedAt` from `updatedAt` and does not write `sections`.
 */
export async function backfillLegacyHomeLayoutPublishedAt<T extends StoredHomeLayout | null>(
  storeId: string,
  layout: T
): Promise<T> {
  if (!layout || !needsLegacyPublishBackfill(layout.publishedAt, layout.sections)) {
    return layout;
  }

  const publishedAt = legacyPublishedAt(layout.updatedAt);
  const updated = await HomeLayout.findOneAndUpdate(
    {
      storeId,
      publishedAt: null,
      'sections.0': { $exists: true },
    },
    { $set: { publishedAt } },
    { new: true, timestamps: false }
  ).lean();

  return (updated ?? layout) as T;
}
