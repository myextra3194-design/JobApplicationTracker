import type { JobApplication } from './types';
import { daysFromToday, effectiveFollowUpDate, isFollowUpDueOn, isLive } from './pipeline';

/**
 * Part 7: the Upcoming dashboard's two lists, derived from the same store
 * snapshot the List/Board views use. Both helpers are pure so the dashboard
 * cannot drift from what the tests assert, and both exclude archived and
 * deleted rows (follow-ups via `isFollowUpDue` → `isLive`; interviews via
 * `isLive` directly).
 */

/**
 * Follow-ups due: wraps `isFollowUpDueOn` rather than reimplementing it.
 * That rule is: a date is in play, it is today or earlier, status is
 * in-progress (not Rejected/Withdrawn/Offer — and not Saved), and the row is
 * live. Sorted soonest first (earliest follow-up date first).
 *
 * The date in play is `effectiveFollowUpDate`: the typed follow-up, or
 * `applicationDate + followUpDays` for a row nobody scheduled one for. Pass the
 * user's cadence (0 = explicit dates only).
 */
export function dueFollowUps(
  records: readonly JobApplication[],
  today: Date = new Date(),
  followUpDays = 0,
): JobApplication[] {
  return records
    .filter((record) => isFollowUpDueOn(record, effectiveFollowUpDate(record, followUpDays), today))
    .sort((a, b) =>
      (effectiveFollowUpDate(a, followUpDays) ?? '').localeCompare(effectiveFollowUpDate(b, followUpDays) ?? ''),
    );
}

/**
 * Upcoming interviews: live rows whose `interviewDate` is strictly in the
 * future. Past and today are out — those are not upcoming. Sorted soonest first.
 */
export function upcomingInterviews(
  records: readonly JobApplication[],
  today: Date = new Date(),
): JobApplication[] {
  return records
    .filter((record) => {
      if (!isLive(record) || !record.interviewDate) return false;
      return daysFromToday(record.interviewDate, today) > 0;
    })
    .sort((a, b) => (a.interviewDate ?? '').localeCompare(b.interviewDate ?? ''));
}
