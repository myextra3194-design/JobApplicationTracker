import { describe, expect, it } from 'vitest';
import { applicationsByMonth, applicationsByWeek } from './analytics';
import { emptyJobApplication } from './normalize';
import type { JobApplication } from './types';

/** Sat 29 Aug 2026; that Monday (24th) starts the current week. */
const TODAY = new Date(2026, 7, 29);

const rec = (over: Parameters<typeof emptyJobApplication>[0]): JobApplication => emptyJobApplication(over);

describe('applicationsByWeek', () => {
  it('includes empty weeks as 0, oldest → newest, current week last', () => {
    const rows = [
      rec({ id: 'a', applicationDate: '2026-08-24' }), // this week
      rec({ id: 'b', applicationDate: '2026-08-26' }), // this week
      rec({ id: 'c', applicationDate: '2026-08-10' }), // two weeks earlier (Mon 10 Aug week)
    ];
    const buckets = applicationsByWeek(rows, TODAY, 8);
    expect(buckets).toHaveLength(8);
    expect(buckets[0]?.key).toBe('2026-07-06');
    expect(buckets[7]?.key).toBe('2026-08-24');
    expect(buckets.map((b) => b.key)).toEqual([...buckets].sort((a, b) => a.key.localeCompare(b.key)).map((b) => b.key));
    const byKey = Object.fromEntries(buckets.map((b) => [b.key, b.count]));
    expect(byKey['2026-08-24']).toBe(2);
    expect(byKey['2026-08-10']).toBe(1);
    expect(byKey['2026-08-17']).toBe(0);
    expect(buckets.filter((b) => b.count === 0).length).toBe(6);
  });

  it('ignores archived, deleted, and undated rows', () => {
    const rows = [
      rec({ id: 'a', applicationDate: '2026-08-24' }),
      rec({ id: 'b', applicationDate: '2026-08-24', isArchived: true }),
      rec({ id: 'c', applicationDate: '2026-08-24', deletedAt: '2026-08-25T00:00:00.000Z' }),
      rec({ id: 'd', applicationDate: null }),
    ];
    const buckets = applicationsByWeek(rows, TODAY, 4);
    expect(buckets[3]?.count).toBe(1);
  });
});

describe('applicationsByMonth', () => {
  it('includes empty months as 0, oldest → newest', () => {
    const rows = [
      rec({ id: 'a', applicationDate: '2026-08-24' }),
      rec({ id: 'b', applicationDate: '2026-08-01' }),
      rec({ id: 'c', applicationDate: '2026-06-15' }),
    ];
    const buckets = applicationsByMonth(rows, TODAY, 6);
    expect(buckets).toHaveLength(6);
    expect(buckets[0]?.key).toBe('2026-03');
    expect(buckets[5]?.key).toBe('2026-08');
    const byKey = Object.fromEntries(buckets.map((b) => [b.key, b.count]));
    expect(byKey['2026-08']).toBe(2);
    expect(byKey['2026-06']).toBe(1);
    expect(byKey['2026-07']).toBe(0);
    expect(byKey['2026-03']).toBe(0);
  });

  it('ignores archived, deleted, and undated rows', () => {
    const rows = [
      rec({ id: 'a', applicationDate: '2026-08-10' }),
      rec({ id: 'b', applicationDate: '2026-08-10', isArchived: true }),
      rec({ id: 'c', applicationDate: '2026-08-10', deletedAt: '2026-08-11T00:00:00.000Z' }),
      rec({ id: 'd' }),
    ];
    expect(applicationsByMonth(rows, TODAY, 6)[5]?.count).toBe(1);
  });
});
