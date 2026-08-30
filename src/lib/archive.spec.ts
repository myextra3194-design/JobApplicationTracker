import { describe, expect, it } from 'vitest';
import { archivedRows, countArchived, isArchivedRow } from './archive';
import { emptyJobApplication } from './normalize';

/**
 * Part 9: the archive helpers the Archived tab and the "N archived" count rely
 * on. Pure, so the archive view can never drift from what these tests assert.
 */

function rec(id: string, patch: Partial<Parameters<typeof emptyJobApplication>[0]> = {}) {
  return emptyJobApplication({ id, ...patch });
}

describe('isArchivedRow', () => {
  it('is true only for archived, non-deleted rows', () => {
    expect(isArchivedRow(rec('archived', { isArchived: true }))).toBe(true);
    expect(isArchivedRow(rec('live'))).toBe(false);
    expect(isArchivedRow(rec('deleted', { deletedAt: '2026-08-21T00:00:00.000Z' }))).toBe(false);
    expect(
      isArchivedRow(rec('both', { isArchived: true, deletedAt: '2026-08-21T00:00:00.000Z' })),
    ).toBe(false);
  });
});

describe('archivedRows', () => {
  it('returns only archived, non-deleted rows, most recently updated first', () => {
    const rows = [
      rec('live-1'),
      rec('archived-old', { isArchived: true, updatedAt: '2026-08-20T09:00:00.000Z' }),
      rec('archived-new', { isArchived: true, updatedAt: '2026-08-29T09:00:00.000Z' }),
      rec('deleted', { deletedAt: '2026-08-21T00:00:00.000Z' }),
      rec('both', { isArchived: true, deletedAt: '2026-08-22T00:00:00.000Z' }),
    ];
    expect(archivedRows(rows).map((r) => r.id)).toEqual(['archived-new', 'archived-old']);
  });

  it('returns an empty array when nothing is archived', () => {
    expect(archivedRows([rec('live-1'), rec('deleted', { deletedAt: '2026-08-21T00:00:00.000Z' })])).toEqual([]);
    expect(archivedRows([])).toEqual([]);
  });
});

describe('countArchived', () => {
  it('counts archived, non-deleted rows only', () => {
    const rows = [
      rec('live-1'),
      rec('archived-1', { isArchived: true }),
      rec('archived-2', { isArchived: true }),
      rec('deleted', { deletedAt: '2026-08-21T00:00:00.000Z' }),
      rec('both', { isArchived: true, deletedAt: '2026-08-22T00:00:00.000Z' }),
    ];
    expect(countArchived(rows)).toBe(2);
  });

  it('is zero for an empty or all-active collection', () => {
    expect(countArchived([])).toBe(0);
    expect(countArchived([rec('live-1'), rec('live-2')])).toBe(0);
  });
});
