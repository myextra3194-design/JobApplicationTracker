import { describe, expect, it } from 'vitest';
import {
  bulkArchiveConfirm,
  bulkPurgeConfirm,
  hasTag,
  mergeTagIntoTags,
  normalizeTag,
  rowsToChangeStatus,
  rowsToTag,
} from './bulk';
import { emptyJobApplication } from './normalize';
import type { JobApplication } from './types';

/**
 * Part 10: the bulk-action bar drives a multi-row tag merge and count-bearing
 * confirmations. Those rules live here as pure functions so a bulk tag can
 * never duplicate or rewrite casing, and the confirmation always states the
 * exact number of records affected.
 */

function rec(id: string, patch: Partial<Parameters<typeof emptyJobApplication>[0]> = {}): JobApplication {
  return emptyJobApplication({ id, ...patch });
}

describe('normalizeTag', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeTag('  qatar ')).toBe('qatar');
    expect(normalizeTag('\t remote\n')).toBe('remote');
  });

  it('yields an empty string for whitespace-only input', () => {
    expect(normalizeTag('   ')).toBe('');
  });
});

describe('hasTag', () => {
  it('matches case-insensitively and trims the candidate', () => {
    expect(hasTag(['Qatar', 'remote'], 'QATAR')).toBe(true);
    expect(hasTag(['Qatar'], '  qatar ')).toBe(true);
    expect(hasTag(['Qatar'], 'Doha')).toBe(false);
  });

  it('is false for an empty or whitespace-only candidate or tag list', () => {
    expect(hasTag(['Qatar'], '')).toBe(false);
    expect(hasTag(['Qatar'], '   ')).toBe(false);
    expect(hasTag([], 'qatar')).toBe(false);
  });
});

describe('mergeTagIntoTags', () => {
  it('appends a new tag, trimmed', () => {
    expect(mergeTagIntoTags(['remote'], '  qatar ')).toEqual(['remote', 'qatar']);
  });

  it('does not duplicate a tag that matches case-insensitively, and keeps the original casing', () => {
    expect(mergeTagIntoTags(['Qatar'], 'qatar')).toEqual(['Qatar']);
    expect(mergeTagIntoTags(['Qatar'], 'QATAR')).toEqual(['Qatar']);
    expect(mergeTagIntoTags(['qatar'], 'Qatar')).toEqual(['qatar']);
  });

  it('ignores empty candidates without adding a blank chip', () => {
    expect(mergeTagIntoTags(['remote'], '   ')).toEqual(['remote']);
    expect(mergeTagIntoTags([], '')).toEqual([]);
  });

  it('always returns a new array', () => {
    const tags = ['remote'];
    expect(mergeTagIntoTags(tags, 'remote')).not.toBe(tags);
    expect(mergeTagIntoTags(tags, 'qatar')).not.toBe(tags);
  });
});

describe('rowsToTag', () => {
  it('selects only rows that do not already carry the tag', () => {
    const rows = [
      rec('a', { tags: ['qatar'] }),
      rec('b', { tags: ['QATAR'] }),
      rec('c', { tags: ['remote'] }),
      rec('d'),
    ];
    expect(rowsToTag(rows, 'qatar').map((r) => r.id)).toEqual(['c', 'd']);
  });

  it('is empty for a blank tag candidate', () => {
    expect(rowsToTag([rec('a')], '   ')).toEqual([]);
  });
});

describe('rowsToChangeStatus', () => {
  it('selects only rows whose status differs', () => {
    const rows = [
      rec('a', { status: 'Applied' }),
      rec('b', { status: 'Saved' }),
      rec('c', { status: 'Applied' }),
    ];
    expect(rowsToChangeStatus(rows, 'Applied').map((r) => r.id)).toEqual(['b']);
    expect(rowsToChangeStatus(rows, 'Offer').map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('bulkArchiveConfirm', () => {
  it('states the affected count, singular and plural', () => {
    expect(bulkArchiveConfirm(1)).toMatchInlineSnapshot(
      `"Archive 1 application? You can restore them later from the Archived tab."`,
    );
    expect(bulkArchiveConfirm(6)).toBe('Archive 6 applications? You can restore them later from the Archived tab.');
  });
});

describe('bulkPurgeConfirm', () => {
  it('states the affected count and warns it cannot be undone', () => {
    expect(bulkPurgeConfirm(1)).toMatchInlineSnapshot(
      `"Delete 1 application permanently? This removes the records and their attachments — it cannot be undone."`,
    );
    expect(bulkPurgeConfirm(3)).toBe(
      'Delete 3 applications permanently? This removes the records and their attachments — it cannot be undone.',
    );
  });
});
