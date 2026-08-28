import { describe, expect, it } from 'vitest';
import { emptyJobApplication } from './normalize';
import { applyQuery, collectTags, sortRecords, summarise } from './query';
import type { JobApplication } from './types';

/** Sat 29 Aug 2026; that Monday (24th) starts the current week. */
const TODAY = new Date(2026, 7, 29);

const rec = (over: Parameters<typeof emptyJobApplication>[0]): JobApplication => emptyJobApplication(over);

const FIXTURES: JobApplication[] = [
  rec({
    id: 'a',
    companyName: 'Alpha Utilities',
    status: 'Interview',
    applicationDate: '2026-08-24',
    interviewDate: '2026-08-28',
    followUpDate: '2026-08-20',
    tags: ['Qatar', 'utility'],
    matchScore: 82,
  }),
  rec({
    id: 'b',
    companyName: 'beta grid',
    status: 'Applied',
    applicationDate: '2026-08-26',
    notes: 'referral from H.',
    tags: ['qatar'],
  }),
  rec({ id: 'c', companyName: 'Gamma Energy', status: 'Rejected', applicationDate: '2026-08-10', finalResult: 'Rejected' }),
  // 'd' deliberately has no applicationDate: an Offer recorded after the fact.
  rec({ id: 'd', companyName: 'Delta Power', status: 'Offer', salary: '7000 QAR' }),
  rec({ id: 'e', companyName: 'Epsilon KEIC', status: 'Saved', isArchived: true }),
  rec({ id: 'f', companyName: 'Zeta Rejected', status: 'Rejected', deletedAt: '2026-08-22T00:00:00.000Z' }),
];

const LIVE_IDS = ['a', 'b', 'c', 'd'];

function pick(id: string): JobApplication {
  const found = FIXTURES.find((r) => r.id === id);
  if (!found) throw new Error(`missing fixture ${id}`);
  return found;
}

describe('applyQuery', () => {
  it('hides archived and deleted rows by default', () => {
    expect(
      applyQuery(FIXTURES)
        .map((r) => r.id)
        .sort(),
    ).toEqual(LIVE_IDS);
  });

  it('shows them only when explicitly asked', () => {
    expect(applyQuery(FIXTURES, { includeArchived: true }).map((r) => r.id)).toContain('e');
    expect(applyQuery(FIXTURES, { includeDeleted: true }).map((r) => r.id)).toContain('f');
    // includeArchived must not leak deleted rows, and vice versa.
    expect(applyQuery(FIXTURES, { includeArchived: true }).map((r) => r.id)).not.toContain('f');
    expect(applyQuery(FIXTURES, { includeDeleted: true }).map((r) => r.id)).not.toContain('e');
  });

  it('filters by status set', () => {
    expect(
      applyQuery(FIXTURES, { statuses: ['Applied', 'Offer'] })
        .map((r) => r.id)
        .sort(),
    ).toEqual(['b', 'd']);
  });

  it('treats an empty status array as "no filter"', () => {
    expect(applyQuery(FIXTURES, { statuses: [] }).length).toBe(LIVE_IDS.length);
  });

  it('searches several fields, case-insensitively', () => {
    expect(applyQuery(FIXTURES, { search: 'REFERRAL' }).map((r) => r.id)).toEqual(['b']);
    expect(applyQuery(FIXTURES, { search: 'alpha' }).map((r) => r.id)).toEqual(['a']);
    expect(applyQuery(FIXTURES, { search: '7000 qar' }).map((r) => r.id)).toEqual(['d']);
    expect(applyQuery(FIXTURES, { search: 'no-such-company' })).toEqual([]);
  });

  it('matches tags case-insensitively regardless of how they were typed', () => {
    expect(
      applyQuery(FIXTURES, { tag: 'QATAR' })
        .map((r) => r.id)
        .sort(),
    ).toEqual(['a', 'b']);
    expect(applyQuery(FIXTURES, { tag: 'utility' }).map((r) => r.id)).toEqual(['a']);
    // Archived rows keep their tags out of the default view.
    expect(applyQuery(FIXTURES, { tag: 'qatar', includeArchived: true }).length).toBe(2);
  });

  it('filters to overdue/today follow-ups only', () => {
    expect(applyQuery(FIXTURES, { followUpDue: true }).map((r) => r.id)).toEqual(['a']);
  });

  it('sorts by companyName case-insensitively', () => {
    const asc = applyQuery(FIXTURES, { sortBy: 'companyName', sortDir: 'asc' }).map((r) => r.companyName);
    expect(asc).toEqual(['Alpha Utilities', 'beta grid', 'Delta Power', 'Gamma Energy']);
    expect(applyQuery(FIXTURES, { sortBy: 'companyName', sortDir: 'desc' }).map((r) => r.id)).toEqual([
      'c',
      'd',
      'b',
      'a',
    ]);
  });

  it('pushes missing dates to the bottom in either direction', () => {
    const asc = applyQuery(FIXTURES, { sortBy: 'applicationDate', sortDir: 'asc' }).map((r) => r.id);
    expect(asc).toEqual(['c', 'a', 'b', 'd']);
    const desc = applyQuery(FIXTURES, { sortBy: 'applicationDate', sortDir: 'desc' }).map((r) => r.id);
    expect(desc).toEqual(['b', 'a', 'c', 'd']);
  });
});

describe('sortRecords', () => {
  it('does not mutate the input array', () => {
    const snapshot = FIXTURES.map((r) => r.id);
    sortRecords(FIXTURES, 'companyName', 'asc');
    expect(FIXTURES.map((r) => r.id)).toEqual(snapshot);
  });

  it('ranks null match scores below every real score', () => {
    const ids = sortRecords([pick('c'), pick('a')], 'matchScore', 'desc').map((r) => r.id);
    expect(ids).toEqual(['a', 'c']);
    expect(sortRecords([pick('c'), pick('a')], 'matchScore', 'asc').map((r) => r.id)).toEqual(['c', 'a']);
  });
});

describe('summarise', () => {
  it('counts only live rows and buckets them by status', () => {
    const stats = summarise(FIXTURES, TODAY);
    expect(stats.total).toBe(4);
    expect(stats.archived).toBe(1);
    expect(stats.deleted).toBe(1);
    expect(stats.byStatus.Interview).toBe(1);
    expect(stats.byStatus.Offer).toBe(1);
    expect(stats.byStatus.Rejected).toBe(1);
    expect(stats.byStatus.Saved).toBe(0); // the only Saved row is archived
    expect(Object.values(stats.byStatus).reduce((a, b) => a + b, 0)).toBe(stats.total);
  });

  it('derives response rate as progressed / applied, excluding Saved', () => {
    // applied = a,b,c,d (4); progressed = Shortlisted|Interview|Offer = a,d (2)
    expect(summarise(FIXTURES, TODAY).responseRatePct).toBe(50);
    expect(summarise([], TODAY).responseRatePct).toBe(0);
    expect(summarise([pick('b')], TODAY).responseRatePct).toBe(0); // applied but nothing beyond
    expect(summarise([pick('a')], TODAY).responseRatePct).toBe(100);
  });

  it('flags due follow-ups and booked interviews separately', () => {
    const stats = summarise(FIXTURES, TODAY);
    expect(stats.dueFollowUps).toBe(1);
    expect(stats.scheduledInterviews).toBe(1);
  });

  it('counts applications made in the current week', () => {
    // a (24th) and b (26th) are in the Mon-24 week; c (10th) is not; d has no date.
    expect(summarise(FIXTURES, TODAY).appliedThisWeek).toBe(2);
    expect(summarise(FIXTURES, new Date(2026, 6, 1)).appliedThisWeek).toBe(0);
  });
});

describe('collectTags', () => {
  it('merges case variants into one chip, ordered by usage', () => {
    expect(collectTags(FIXTURES)).toEqual([
      { tag: 'Qatar', count: 2 }, // 'Qatar' (a) + 'qatar' (b), most-used spelling wins
      { tag: 'utility', count: 1 },
    ]);
  });

  it('ignores deleted records but not archived ones', () => {
    const withDeleted = [
      ...FIXTURES,
      rec({ id: 'z', companyName: 'Z', tags: ['nope'], deletedAt: '2026-08-22T00:00:00.000Z' }),
    ];
    expect(collectTags(withDeleted).some((t) => t.tag === 'nope')).toBe(false);
    expect(collectTags(FIXTURES).length).toBe(2);
  });

  it('drops blanks and trims padding', () => {
    expect(collectTags([rec({ id: 'x', companyName: 'X', tags: ['', '   ', '  qatar  '] })])).toEqual([
      { tag: 'qatar', count: 1 },
    ]);
  });
});
