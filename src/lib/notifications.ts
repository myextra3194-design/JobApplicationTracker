/**
 * Part 13: what the bell should show. Pure derivation from the same store
 * snapshot every other view uses, plus the seen-keys journal that decides
 * what counts as unread.
 *
 * The rules mirror the Upcoming dashboard so the two never disagree:
 *  - follow-ups due today or earlier while in progress (overdue = red urgency)
 *  - interviews today, tomorrow, or within `windowDays` days
 * Both exclude archived and deleted rows via `isLive`/`isFollowUpDue`.
 */

import type { JobApplication } from './types';
import { daysFromToday, isFollowUpDue, isLive } from './pipeline';

export const NOTIFICATIONS_JOURNAL_KEY = 'jat.notifications.v1';
/** How many days ahead interview reminders surface in the bell. */
export const INTERVIEW_NOTICE_WINDOW_DAYS = 2;

export type NotificationKind = 'followup-overdue' | 'followup-today' | 'interview-today' | 'interview-soon';

export interface AppNotification {
  /** Stable per row+date: the journal marks these seen, so edits keep the state. */
  key: string;
  kind: NotificationKind;
  rowId: string;
  companyName: string;
  jobTitle: string;
  /** The `YYYY-MM-DD` calendar day the item is anchored to. */
  date: string;
  /** Short, complete sentence fragment for the list item. */
  message: string;
  /** Sort weight — lower = more urgent. */
  urgency: number;
}

const URGENCY: Record<NotificationKind, number> = {
  'followup-overdue': 0,
  'followup-today': 1,
  'interview-today': 2,
  'interview-soon': 3,
};

function companyLabel(row: JobApplication): string {
  return row.companyName.trim() || 'Untitled company';
}

function titleLine(row: JobApplication): string {
  const job = row.jobTitle.trim();
  return job ? `${companyLabel(row)} — ${job}` : companyLabel(row);
}

function overdueLabel(days: number): string {
  return days === 1 ? 'overdue since yesterday' : `overdue by ${days} days`;
}

export function deriveNotifications(
  records: readonly JobApplication[],
  today: Date = new Date(),
  windowDays: number = INTERVIEW_NOTICE_WINDOW_DAYS,
): AppNotification[] {
  const items: AppNotification[] = [];

  for (const row of records) {
    if (!isLive(row)) continue;

    if (row.followUpDate && isFollowUpDue(row, today)) {
      const days = -daysFromToday(row.followUpDate, today);
      items.push({
        key: `follow-up:${row.id}:${row.followUpDate}`,
        kind: days > 0 ? 'followup-overdue' : 'followup-today',
        rowId: row.id,
        companyName: row.companyName,
        jobTitle: row.jobTitle,
        date: row.followUpDate,
        message:
          days > 0 ? `Follow-up ${overdueLabel(days)} — ${titleLine(row)}` : `Follow-up due today — ${titleLine(row)}`,
        urgency: URGENCY[days > 0 ? 'followup-overdue' : 'followup-today'],
      });
    }

    if (row.interviewDate) {
      const days = daysFromToday(row.interviewDate, today);
      if (days >= 0 && days <= windowDays) {
        const when = days === 0 ? 'Interview today' : days === 1 ? 'Interview tomorrow' : `Interview in ${days} days`;
        items.push({
          key: `interview:${row.id}:${row.interviewDate}`,
          kind: days === 0 ? 'interview-today' : 'interview-soon',
          rowId: row.id,
          companyName: row.companyName,
          jobTitle: row.jobTitle,
          date: row.interviewDate,
          message: `${when} — ${titleLine(row)}`,
          urgency: URGENCY[days === 0 ? 'interview-today' : 'interview-soon'],
        });
      }
    }
  }

  // Most urgent first; same urgency = soonest date first, then by key for a
  // deterministic order.
  return items.sort(
    (a, b) =>
      a.urgency - b.urgency ||
      a.date.localeCompare(b.date) ||
      a.key.localeCompare(b.key),
  );
}

/** How many of `items` have not been seen yet, for the bell badge. */
export function countUnread(items: readonly AppNotification[], seen: ReadonlySet<string>): number {
  return items.filter((item) => !seen.has(item.key)).length;
}
