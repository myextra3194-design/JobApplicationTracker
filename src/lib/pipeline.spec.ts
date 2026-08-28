import { describe, expect, it } from 'vitest';
import { emptyJobApplication } from './normalize';
import { daysFromToday, isFollowUpDue, isLive, isTerminal, toPlainDate, weekKeyOf } from './pipeline';
import { isSameWeek } from './pipeline';

/** Fixed local reference date: Sat 29 Aug 2026. */
const TODAY = new Date(2026, 7, 29);

describe('date helpers', () => {
  it('formats a local calendar day without timezone drift', () => {
    expect(toPlainDate(new Date(2026, 7, 29))).toBe('2026-08-29');
    expect(toPlainDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('counts whole days between dates in both directions', () => {
    expect(daysFromToday('2026-08-29', TODAY)).toBe(0);
    expect(daysFromToday('2026-08-31', TODAY)).toBe(2);
    expect(daysFromToday('2026-08-20', TODAY)).toBe(-9);
  });

  it('treats an unparseable date as today rather than NaN', () => {
    expect(daysFromToday('tomorrow', TODAY)).toBe(0);
    expect(daysFromToday('', TODAY)).toBe(0);
  });

  it('keys weeks on Monday', () => {
    expect(weekKeyOf('2026-08-24')).toBe('2026-08-24'); // Mon
    expect(weekKeyOf('2026-08-29')).toBe('2026-08-24'); // Sat, same week
    expect(weekKeyOf('2026-08-30')).toBe('2026-08-24'); // Sun, still that week
    expect(weekKeyOf('2026-08-31')).toBe('2026-08-31'); // next Mon
    expect(isSameWeek('2026-08-27', TODAY)).toBe(true);
    expect(isSameWeek('2026-08-23', TODAY)).toBe(false);
  });
});

describe('status rules', () => {
  it('only terminal stages stop follow-ups', () => {
    expect(isTerminal('Offer')).toBe(true);
    expect(isTerminal('Rejected')).toBe(true);
    expect(isTerminal('Withdrawn')).toBe(true);
    expect(isTerminal('Applied')).toBe(false);
    expect(isTerminal('Interview')).toBe(false);
  });

  it('follow-up is due today or earlier, only while in progress', () => {
    const overdue = emptyJobApplication({ status: 'Applied', followUpDate: '2026-08-20' });
    expect(isFollowUpDue(overdue, TODAY)).toBe(true);

    const future = emptyJobApplication({ status: 'Applied', followUpDate: '2026-09-10' });
    expect(isFollowUpDue(future, TODAY)).toBe(false);

    const noDate = emptyJobApplication({ status: 'Applied' });
    expect(isFollowUpDue(noDate, TODAY)).toBe(false);

    const rejected = emptyJobApplication({ status: 'Rejected', followUpDate: '2026-08-20' });
    expect(isFollowUpDue(rejected, TODAY)).toBe(false);

    const saved = emptyJobApplication({ status: 'Saved', followUpDate: '2026-08-20' });
    expect(isFollowUpDue(saved, TODAY)).toBe(false);

    // An offer still outstanding is worth chasing; an archived one is not.
    const offer = emptyJobApplication({ status: 'Offer', followUpDate: '2026-08-20' });
    expect(isFollowUpDue(offer, TODAY)).toBe(false);

    const archived = emptyJobApplication({
      status: 'Interview',
      followUpDate: '2026-08-20',
      isArchived: true,
    });
    expect(isLive(archived)).toBe(false);
    expect(isFollowUpDue(archived, TODAY)).toBe(false);

    const deleted = emptyJobApplication({
      status: 'Interview',
      followUpDate: '2026-08-20',
      deletedAt: '2026-08-21T00:00:00.000Z',
    });
    expect(isLive(deleted)).toBe(false);
  });
});
