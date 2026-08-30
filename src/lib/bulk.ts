import type { ApplicationStatus, JobApplication } from './types';

/**
 * Part 10: bulk-action helpers, kept pure so the list view and the Archived tab
 * can never drift on what a bulk tag means or what the confirmations say.
 *
 * Persistence stays in the components: status/archive go through
 * `records.bulkPatch`, tags merge per row via `mergeTagIntoTags`, and permanent
 * delete goes through the one cascade path (`getStorage().purge` /
 * `bulkPurgeApplications`).
 */

/** Trim a tag candidate; empty/whitespace yields '' (callers treat that as a no-op). */
export function normalizeTag(tag: string): string {
  return tag.trim();
}

/**
 * Case-insensitive tag membership. Tags are free text, so "Qatar" and "qatar"
 * are the same tag — the casing that was saved first wins (see
 * `mergeTagIntoTags`).
 */
export function hasTag(tags: readonly string[], tag: string): boolean {
  const wanted = normalizeTag(tag).toLowerCase();
  if (!wanted) return false;
  return tags.some((existing) => existing.toLowerCase() === wanted);
}

/**
 * Append `tag` unless an equivalent tag (case-insensitive, trimmed) is already
 * present. Returns a fresh array with the existing casing kept when the tag is
 * a duplicate, so callers can compare to skip the write entirely.
 */
export function mergeTagIntoTags(tags: readonly string[], tag: string): string[] {
  const clean = normalizeTag(tag);
  if (!clean || hasTag(tags, clean)) return [...tags];
  return [...tags, clean];
}

/**
 * The rows that would actually change if `tag` were bulk-added. Rows that
 * already carry the tag (any casing) are excluded, so the bulk add doesn't
 * stamp `updatedAt` on rows it didn't touch.
 */
export function rowsToTag(rows: readonly JobApplication[], tag: string): JobApplication[] {
  const clean = normalizeTag(tag);
  if (!clean) return [];
  return rows.filter((row) => !hasTag(row.tags, clean));
}

/** The rows whose status differs from `status` (same no-op-skip rationale). */
export function rowsToChangeStatus(
  rows: readonly JobApplication[],
  status: ApplicationStatus,
): JobApplication[] {
  return rows.filter((row) => row.status !== status);
}

/** "1 application" vs "6 applications" — the confirmations state the count. */
function plural(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}

/** Plan copy for the bulk-archive confirmation, e.g. "Archive 6 applications?". */
export function bulkArchiveConfirm(count: number): string {
  return `Archive ${plural(count, 'application')}? You can restore them later from the Archived tab.`;
}

/** Plan copy for the bulk permanent-delete confirmation. This is the cascade path. */
export function bulkPurgeConfirm(count: number): string {
  return `Delete ${plural(count, 'application')} permanently? This removes the records and their attachments — it cannot be undone.`;
}
