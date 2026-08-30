import type { JobApplication } from './types';

/**
 * Part 9: archive semantics in one place, so the Archived tab, the "N archived"
 * count, and the list/board's "hidden when archived" rule can never disagree.
 *
 * Archive is not delete: an archived row keeps `isArchived === true`, stays
 * restorable, and its files stay in IndexedDB. `deletedAt` is the separate
 * undo window — a row that is both archived and soft-deleted is in the trash,
 * not the archive, so it is out of the Archived tab too.
 */

/** An archived row: `isArchived` set and not in the undo window. */
export function isArchivedRow(record: JobApplication): boolean {
  return record.isArchived && record.deletedAt === null;
}

/**
 * All archived rows, most recently updated first. Only non-deleted rows: a row
 * that was archived and then soft-deleted belongs to the undo window, not here.
 */
export function archivedRows(records: readonly JobApplication[]): JobApplication[] {
  return records.filter(isArchivedRow).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** The count shown as "N archived" near the filters. */
export function countArchived(records: readonly JobApplication[]): number {
  let count = 0;
  for (const record of records) {
    if (isArchivedRow(record)) count += 1;
  }
  return count;
}
