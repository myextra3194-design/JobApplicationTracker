import { describe, expect, it } from 'vitest';
import { emptyJobApplication } from './normalize';
import { countUnread, deriveNotifications } from './notifications';

/** Fixed local reference date: Sat 29 Aug 2026 — same fixture as pipeline.spec. */
const TODAY = new Date(2026, 7, 29);

describe('deriveNotifications', () => {
  it('surfaces overdue and due-today follow-ups with the right urgency order', () => {
    const records = [
      emptyJobApplication({ id: 'today', status: 'Applied', followUpDate: '2026-08-29', companyName: 'Acme' }),
      emptyJobApplication({ id: 'overdue', status: 'Shortlisted', followUpDate: '2026-08-27', companyName: 'Globex' }),
      emptyJobApplication({ id: 'future', status: 'Interview', followUpDate: '2026-09-01' }),
      emptyJobApplication({ id: 'done', status: 'Rejected', followUpDate: '2026-08-27' }),
    ];

    const items = deriveNotifications(records, TODAY);
    expect(items.map((item) => item.rowId)).toEqual(['overdue', 'today']);
    const [overdue, today] = items;
    expect(overdue).toMatchObject({
      kind: 'followup-overdue',
      key: 'follow-up:overdue:2026-08-27',
    });
    expect(overdue?.message).toContain('overdue by 2 days');
    expect(today?.message).toContain('due today');
  });

  it('surfaces interviews today and within the window, most urgent first', () => {
    const records = [
      emptyJobApplication({ id: 'two-days', status: 'Interview', interviewDate: '2026-08-31', companyName: 'Acme' }),
      emptyJobApplication({ id: 'tomorrow', status: 'Interview', interviewDate: '2026-08-30', companyName: 'Globex' }),
      emptyJobApplication({ id: 'today', status: 'Interview', interviewDate: '2026-08-29', companyName: 'Initech' }),
      emptyJobApplication({ id: 'past', status: 'Interview', interviewDate: '2026-08-28' }),
    ];

    const items = deriveNotifications(records, TODAY);
    expect(items.map((item) => item.rowId)).toEqual(['today', 'tomorrow', 'two-days']);
    const [todayItem, tomorrowItem, twoDaysItem] = items;
    expect(todayItem?.kind).toBe('interview-today');
    expect(tomorrowItem?.message).toContain('tomorrow');
    expect(twoDaysItem?.message).toContain('in 2 days');
  });

  it('ignores archived and deleted rows', () => {
    const records = [
      emptyJobApplication({ id: 'arch', status: 'Applied', followUpDate: '2026-08-27', isArchived: true }),
      emptyJobApplication({ id: 'del', status: 'Applied', followUpDate: '2026-08-27', deletedAt: '2026-08-20T00:00:00.000Z' }),
      emptyJobApplication({ id: 'live', status: 'Applied', followUpDate: '2026-08-27' }),
    ];
    expect(deriveNotifications(records, TODAY).map((item) => item.rowId)).toEqual(['live']);
  });

  it('mixes follow-ups and interviews into one urgency-ordered list', () => {
    const records = [
      emptyJobApplication({ id: 'interview-today', status: 'Interview', interviewDate: '2026-08-29' }),
      emptyJobApplication({ id: 'followup-today', status: 'Applied', followUpDate: '2026-08-29' }),
      emptyJobApplication({ id: 'followup-overdue', status: 'Applied', followUpDate: '2026-08-20' }),
    ];
    const items = deriveNotifications(records, TODAY);
    expect(items.map((item) => item.kind)).toEqual([
      'followup-overdue',
      'followup-today',
      'interview-today',
    ]);
    for (let i = 1; i < items.length; i += 1) {
      expect(items[i - 1]!.urgency).toBeLessThanOrEqual(items[i]!.urgency);
    }
  });
});

describe('countUnread', () => {
  it('counts items whose keys are not in the seen set', () => {
    const items = deriveNotifications(
      [
        emptyJobApplication({ id: 'a', status: 'Applied', followUpDate: '2026-08-29' }),
        emptyJobApplication({ id: 'b', status: 'Interview', interviewDate: '2026-08-30' }),
      ],
      TODAY,
    );
    expect(countUnread(items, new Set())).toBe(2);
    expect(countUnread(items, new Set([items[0]!.key]))).toBe(1);
    expect(countUnread(items, new Set(items.map((item) => item.key)))).toBe(0);
  });
});
