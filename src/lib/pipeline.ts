import type { ApplicationRecord, ApplicationStatus } from './types';
import { STATUSES } from './types';

/**
 * Pipeline semantics in one place, so Parts 2-12 (board, table, dashboard,
 * reminders, CSV/ICS export) all agree on what a stage means.
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

/** Tailwind classes per stage — kept here so the board/table/badges match. */
export const STATUS_TONE: Record<ApplicationStatus, { dot: string; chip: string; column: string }> = {
  Saved: { dot: 'bg-slate-400', chip: 'bg-slate-500/15 text-slate-300', column: 'border-slate-500/30' },
  Applied: { dot: 'bg-sky-400', chip: 'bg-sky-500/15 text-sky-300', column: 'border-sky-500/30' },
  Shortlisted: {
    dot: 'bg-violet-400',
    chip: 'bg-violet-500/15 text-violet-300',
    column: 'border-violet-500/30',
  },
  Interview: {
    dot: 'bg-amber-400',
    chip: 'bg-amber-500/15 text-amber-300',
    column: 'border-amber-500/30',
  },
  Offer: { dot: 'bg-emerald-400', chip: 'bg-emerald-500/15 text-emerald-300', column: 'border-emerald-500/30' },
  Rejected: {
    dot: 'bg-rose-400',
    chip: 'bg-rose-500/15 text-rose-300',
    column: 'border-rose-500/30',
  },
  Withdrawn: {
    dot: 'bg-zinc-500',
    chip: 'bg-zinc-500/15 text-zinc-400',
    column: 'border-zinc-500/30',
  },
};

export function isTerminal(status: ApplicationStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** True while an application still needs attention from the candidate. */
export function isLive(record: ApplicationRecord): boolean {
  return record.deletedAt === null && record.archivedAt === null;
}

export function isInProgress(record: ApplicationRecord): boolean {
  return isLive(record) && IN_PROGRESS_STATUSES.includes(record.status);
}

/**
 * Follow-up is due when a date is set, it is today or earlier, and the record
 * hasn't reached a terminal stage. Part 9 (reminders) consumes this.
 */
export function isFollowUpDue(record: ApplicationRecord, today: Date = new Date()): boolean {
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
