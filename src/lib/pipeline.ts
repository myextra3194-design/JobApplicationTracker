import type { ApplicationStatus, JobApplication } from './types';
import { STATUSES } from './types';

/**
 * Pipeline semantics in one place, so Parts 2-12 (board, table, dashboard,
 * reminders, calendar export) all agree on what a stage means.
 */

/** Order the board columns appear in. */
export const PIPELINE: readonly ApplicationStatus[] = STATUSES;

/** Stages that end the pipeline: nothing further is expected. */
export const TERMINAL_STATUSES: readonly ApplicationStatus[] = ['Offer', 'Rejected', 'Withdrawn'];

/** Stages where the candidate is live in the process and shouldn't go quiet. */
export const IN_PROGRESS_STATUSES: readonly ApplicationStatus[] = [
  'Applied',
  'Shortlisted',
  'Interview',
];

/**
 * Part 12 palette, used from Part 1 so list/board/dashboard never drift:
 * gray=Saved, blue=Applied, purple=Shortlisted, amber=Interview,
 * green=Offer, red=Rejected, slate=Withdrawn.
 * Saved and Withdrawn are both gray-family — separate by weight (slate-400 vs
 * slate-600), not hue.
 */
export const STATUS_TONE: Record<ApplicationStatus, { dot: string; chip: string; column: string }> = {
  Saved: {
    dot: 'bg-slate-400',
    chip: 'bg-slate-400/15 text-slate-700 dark:text-slate-300',
    column: 'border-slate-400/40',
  },
  Applied: {
    dot: 'bg-blue-400',
    chip: 'bg-blue-500/15 text-blue-800 dark:text-blue-300',
    column: 'border-blue-500/40',
  },
  Shortlisted: {
    dot: 'bg-purple-400',
    chip: 'bg-purple-500/15 text-purple-800 dark:text-purple-300',
    column: 'border-purple-500/40',
  },
  Interview: {
    dot: 'bg-amber-400',
    chip: 'bg-amber-500/15 text-amber-900 dark:text-amber-300',
    column: 'border-amber-500/40',
  },
  Offer: {
    dot: 'bg-green-400',
    chip: 'bg-green-500/15 text-green-800 dark:text-green-300',
    column: 'border-green-500/40',
  },
  Rejected: {
    dot: 'bg-red-400',
    chip: 'bg-red-500/15 text-red-800 dark:text-red-300',
    column: 'border-red-500/40',
  },
  Withdrawn: {
    dot: 'bg-slate-600',
    chip: 'bg-slate-600/15 text-slate-600 dark:text-slate-400',
    column: 'border-slate-600/40',
  },
};

export function isTerminal(status: ApplicationStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** True while an application still needs attention from the candidate. */
export function isLive(record: JobApplication): boolean {
  return record.deletedAt === null && !record.isArchived;
}

export function isInProgress(record: JobApplication): boolean {
  return isLive(record) && IN_PROGRESS_STATUSES.includes(record.status);
}

/**
 * Follow-up is due when a date is set, it is today or earlier, and the record
 * hasn't reached a terminal stage. Part 7 (reminders) consumes this.
 */
export function isFollowUpDue(record: JobApplication, today: Date = new Date()): boolean {
  if (!isInProgress(record) || !record.followUpDate) return false;
  return daysFromToday(record.followUpDate, today) <= 0;
}

/** Positive = in the future, negative = in the past. Date-only, no time zone drift. */
export function daysFromToday(isoDate: string, today: Date = new Date()): number {
  const target = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(target)) return 0;
  const base = Date.parse(toPlainDate(today));
  return Math.round((target - base) / 86_400_000);
}

/** Local calendar day as `YYYY-MM-DD`. */
export function toPlainDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Monday-based week key, e.g. `2026-08-24`. Used by the weekly goal tracker. */
export function weekKeyOf(isoDate: string): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(ms)) return isoDate;
  const d = new Date(ms);
  const weekday = (d.getUTCDay() + 6) % 7; // Mon = 0
  d.setUTCDate(d.getUTCDate() - weekday);
  return d.toISOString().slice(0, 10);
}

export function isSameWeek(isoDate: string, today: Date = new Date()): boolean {
  return weekKeyOf(isoDate) === weekKeyOf(toPlainDate(today));
}
