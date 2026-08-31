import { describe, expect, it } from 'vitest';
import { alarmCheck, ALARM_CATCH_UP_MS, computeAlarmEvents, fireAtFor, parseAlarmTime, type AlarmSettingsLike } from './alarms';
import { emptyJobApplication } from './normalize';

/** Fixed local reference date: Sat 29 Aug 2026 — same fixture as pipeline.spec. */
const TODAY = new Date(2026, 7, 29, 10, 0, 0, 0);

const SETTINGS: AlarmSettingsLike = {
  alarmsEnabled: true,
  alarmTime: '09:00',
  interviewLeadDays: 1,
  followUpAlarms: true,
  interviewAlarms: true,
};

describe('parseAlarmTime', () => {
  it('accepts valid 24-hour times and rejects junk', () => {
    expect(parseAlarmTime('09:00')).toEqual({ hours: 9, minutes: 0 });
    expect(parseAlarmTime('23:59')).toEqual({ hours: 23, minutes: 59 });
    expect(parseAlarmTime('24:00')).toBeNull();
    expect(parseAlarmTime('9am')).toBeNull();
    expect(parseAlarmTime('')).toBeNull();
  });
});

describe('fireAtFor', () => {
  it('builds a LOCAL wall-clock instant on the given calendar day', () => {
    const ms = fireAtFor('2026-08-29', '09:00');
    expect(ms).toBe(new Date(2026, 7, 29, 9, 0, 0, 0).getTime());
  });

  it('subtracts lead days and normalises across month boundaries', () => {
    expect(fireAtFor('2026-08-01', '08:30', 2)).toBe(new Date(2026, 6, 30, 8, 30, 0, 0).getTime());
  });

  it('returns null for a bad date or time', () => {
    expect(fireAtFor('not-a-date', '09:00')).toBeNull();
    expect(fireAtFor('2026-08-29', '25:00')).toBeNull();
  });
});

describe('computeAlarmEvents', () => {
  it('returns nothing when alarms are disabled', () => {
    const row = emptyJobApplication({ id: 'r', status: 'Applied', followUpDate: '2026-08-29' });
    expect(computeAlarmEvents([row], { ...SETTINGS, alarmsEnabled: false }, TODAY)).toEqual([]);
  });

  it('derives a follow-up event for due follow-ups only', () => {
    const dueToday = emptyJobApplication({ id: 'due', status: 'Applied', followUpDate: '2026-08-29', companyName: 'Acme' });
    const overdue = emptyJobApplication({ id: 'over', status: 'Shortlisted', followUpDate: '2026-08-20', companyName: 'Globex' });
    const future = emptyJobApplication({ id: 'future', status: 'Interview', followUpDate: '2026-09-05' });
    const terminal = emptyJobApplication({ id: 'term', status: 'Rejected', followUpDate: '2026-08-20' });
    const archived = emptyJobApplication({ id: 'arch', status: 'Applied', followUpDate: '2026-08-29', isArchived: true });

    const events = computeAlarmEvents([future, overdue, dueToday, terminal, archived], SETTINGS, TODAY);
    expect(events.map((e) => e.rowId)).toEqual(['over', 'due']);
    const [first, second] = events;
    expect(first).toMatchObject({
      kind: 'follow-up',
      key: 'follow-up:over:2026-08-20',
      fireAt: new Date(2026, 7, 20, 9, 0, 0, 0).getTime(),
    });
    expect(first?.message).toContain('overdue by 9 days');
    expect(second?.message).toContain('due today');
  });

  it('derives interview-day plus lead-day events, and none for past interviews', () => {
    const inTwoDays = emptyJobApplication({ id: 'soon', status: 'Interview', interviewDate: '2026-08-31', companyName: 'Acme', jobTitle: 'Eng' });
    const today = emptyJobApplication({ id: 'today', status: 'Interview', interviewDate: '2026-08-29' });
    const past = emptyJobApplication({ id: 'past', status: 'Interview', interviewDate: '2026-08-27' });

    const events = computeAlarmEvents([inTwoDays, today, past], SETTINGS, TODAY);
    // inTwoDays: day-of (Aug 31) + 1 lead day (Aug 30). today: day-of only. past: none.
    expect(events.map((e) => e.key)).toEqual([
      'interview:today:2026-08-29:0',
      'interview:soon:2026-08-31:1',
      'interview:soon:2026-08-31:0',
    ]);
    const [, leadDay, dayOf] = events;
    expect(leadDay?.fireAt).toBe(new Date(2026, 7, 30, 9, 0, 0, 0).getTime());
    expect(leadDay?.message).toContain('tomorrow');
    expect(dayOf?.fireAt).toBe(new Date(2026, 7, 31, 9, 0, 0, 0).getTime());
    expect(dayOf?.message).toContain('today');
  });

  it('respects the per-kind switches', () => {
    const row = emptyJobApplication({ id: 'r', status: 'Applied', followUpDate: '2026-08-29', interviewDate: '2026-08-31' });
    const noFollowUps = computeAlarmEvents([row], { ...SETTINGS, followUpAlarms: false }, TODAY);
    expect(noFollowUps.every((e) => e.kind === 'interview')).toBe(true);
    const noInterviews = computeAlarmEvents([row], { ...SETTINGS, interviewAlarms: false }, TODAY);
    expect(noInterviews.every((e) => e.kind === 'follow-up')).toBe(true);
  });
});

describe('alarmCheck', () => {
  const events = computeAlarmEvents(
    [
      emptyJobApplication({ id: 'due', status: 'Applied', followUpDate: '2026-08-29' }),
      emptyJobApplication({ id: 'stale', status: 'Applied', followUpDate: '2026-08-10' }),
      emptyJobApplication({ id: 'soon', status: 'Interview', interviewDate: '2026-08-31' }),
    ],
    SETTINGS,
    TODAY,
  );

  it('fires due events inside the catch-up window exactly once', () => {
    const now = TODAY.getTime(); // 10:00 — both follow-ups are at 09:00
    const first = alarmCheck(events, new Set(), now);
    expect(first.fire.map((e) => e.rowId)).toEqual(['due']);
    expect(first.dismiss).toContain('follow-up:stale:2026-08-10');
    expect(first.nextInMs).toBe(new Date(2026, 7, 30, 9, 0, 0, 0).getTime() - now);

    const again = alarmCheck(events, new Set(['follow-up:due:2026-08-29']), now);
    expect(again.fire).toEqual([]);
  });

  it('fires nothing and schedules the next event when the day is young', () => {
    const early = new Date(2026, 7, 29, 8, 0, 0, 0).getTime();
    const outcome = alarmCheck(events, new Set(), early);
    expect(outcome.fire).toEqual([]);
    expect(outcome.nextInMs).toBe(new Date(2026, 7, 29, 9, 0, 0, 0).getTime() - early);
  });

  it('reports null nextInMs when nothing future is scheduled', () => {
    const outcome = alarmCheck([], new Set(), TODAY.getTime());
    expect(outcome.nextInMs).toBeNull();
    expect(outcome.fire).toEqual([]);
  });

  it('respects a custom catch-up window', () => {
    // With a 1-second window, even the one-hour-late "due" event is too stale.
    const outcome = alarmCheck(events, new Set(), TODAY.getTime(), 1_000);
    expect(outcome.fire).toEqual([]);
    expect(outcome.dismiss).toEqual(['follow-up:stale:2026-08-10', 'follow-up:due:2026-08-29']);
    expect(ALARM_CATCH_UP_MS).toBe(24 * 60 * 60 * 1000);
  });
});
