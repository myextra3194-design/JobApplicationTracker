import type { JobApplication } from './types';
import { daysFromToday, isFollowUpDue, isLive } from './pipeline';

/**
 * Part 7: the Upcoming dashboard's two lists, derived from the same store
 * snapshot the List/Board views use. Both helpers are pure so the dashboard
 * cannot drift from what the tests assert, and both exclude archived and
 * deleted rows (follow-ups via `isFollowUpDue` → `isLive`; interviews via
 * `isLive` directly).
 */

/**
 * Follow-ups due: wraps `isFollowUpDue` rather than reimplementing it.
 * That rule is: a date is set, it is today or earlier, status is in-progress
 * (not Rejected/Withdrawn/Offer — and not Saved), and the row is live.
 * Sorted soonest first (earliest `followUpDate` first).
 */
export function dueFollowUps(
  records: readonly JobApplication[],
  today: Date = new Date(),
): JobApplication[] {
  return records
    .filter((record) => isFollowUpDue(record, today))
    .sort((a, b) => (a.followUpDate ?? '').localeCompare(b.followUpDate ?? ''));
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
