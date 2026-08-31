/**
 * Part 13: the in-app alarm engine. Pure derivation + a scheduler contract —
 * no timers, no DOM here, so every rule is testable in isolation.
 *
 * Model: dates on a JobApplication are date-only `YYYY-MM-DD` local calendar
 * days, so an alarm is "on this local day, at the user's chosen `alarmTime`".
 * `fireAtFor` builds that local wall-clock instant directly (no UTC drift).
 *
 * The engine only runs while the app is open (there is no server to wake a
 * closed tab — PLAN.md Optional Later Upgrade). App.tsx drives it with a
 * setTimeout loop that re-checks every minute (and on tab visibility), and the
 * `KeyJournal` at `jat.alarms.v1` guarantees each event key fires at most once.
 */

import type { JobApplication } from './types';
import { daysFromToday, isFollowUpDue, isLive } from './pipeline';

export const ALARM_JOURNAL_KEY = 'jat.alarms.v1';
/** How late an alarm may fire and still count as "just missed" (24 hours). */
export const ALARM_CATCH_UP_MS = 24 * 60 * 60 * 1000;
/** The scheduler re-polls at least this often so a tab left open stays honest. */
export const ALARM_MIN_POLL_MS = 60_000;

export type AlarmKind = 'follow-up' | 'interview';

export interface AlarmEvent {
  /**
   * Stable across recomputes for the same row/date/lead-day, so the journal can
   * remember "already fired". Contains the row id, so deleting and re-adding a
   * row with the same name still produces a fresh event.
   */
  key: string;
  kind: AlarmKind;
  rowId: string;
  companyName: string;
  jobTitle: string;
  /** The `YYYY-MM-DD` calendar day the event is anchored to. */
  date: string;
  /** Local wall-clock epoch ms this event should fire at. */
  fireAt: number;
  message: string;
}

/** The settings slice the engine reads — anything wider would couple it to the store. */
export interface AlarmSettingsLike {
  alarmsEnabled: boolean;
  alarmTime: string;
  interviewLeadDays: number;
  followUpAlarms: boolean;
  interviewAlarms: boolean;
}

export function parseAlarmTime(time: string): { hours: number; minutes: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!match) return null;
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

/** `YYYY-MM-DD` (minus `leadDays`) at `HH:MM` as a LOCAL wall-clock instant. */
export function fireAtFor(dateIso: string, time: string, leadDays = 0): number | null {
  const parsed = parseAlarmTime(time);
  if (!parsed) return null;
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso.trim());
  if (!dateMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]) - leadDays;
  const fireAt = new Date(year, month, day, parsed.hours, parsed.minutes, 0, 0).getTime();
  return Number.isNaN(fireAt) ? null : fireAt;
}

function leadDays(settings: AlarmSettingsLike): number {
  const n = Math.round(settings.interviewLeadDays);
  return Number.isFinite(n) ? Math.max(0, Math.min(14, n)) : 0;
}

function rowLabel(row: JobApplication): string {
  const company = row.companyName.trim() || 'Untitled company';
  const title = row.jobTitle.trim() || 'Untitled role';
  return `${company} — ${title}`;
}

/**
 * Every alarm event the current records + settings imply, soonest first.
 * Derivation rules:
 *  - follow-ups: only while due (`isFollowUpDue` — live, in-progress, date set,
 *    today or earlier), on the follow-up date at `alarmTime`.
 *  - interviews: live rows with an interview date today-or-later, on interview
 *    day at `alarmTime` plus one per lead day before it (0 = day of only).
 */
export function computeAlarmEvents(
  records: readonly JobApplication[],
  settings: AlarmSettingsLike,
  now: Date = new Date(),
): AlarmEvent[] {
  if (!settings.alarmsEnabled) return [];
  const lead = leadDays(settings);
  const events: AlarmEvent[] = [];

  for (const row of records) {
    if (!isLive(row)) continue;

    if (settings.followUpAlarms && row.followUpDate && isFollowUpDue(row, now)) {
      const fireAt = fireAtFor(row.followUpDate, settings.alarmTime);
      if (fireAt !== null) {
        const overdueBy = -daysFromToday(row.followUpDate, now);
        events.push({
          key: `follow-up:${row.id}:${row.followUpDate}`,
          kind: 'follow-up',
          rowId: row.id,
          companyName: row.companyName,
          jobTitle: row.jobTitle,
          date: row.followUpDate,
          fireAt,
          message:
            overdueBy > 0
              ? `Follow-up overdue by ${overdueBy} day${overdueBy === 1 ? '' : 's'} — ${rowLabel(row)}`
              : `Follow-up due today — ${rowLabel(row)}`,
        });
      }
    }

    if (settings.interviewAlarms && row.interviewDate) {
      const days = daysFromToday(row.interviewDate, now);
      if (days < 0) continue; // interviews in the past are not upcoming
      for (let l = 0; l <= lead; l += 1) {
        if (days < l) break; // lead reminders already behind this interview
        const fireAt = fireAtFor(row.interviewDate, settings.alarmTime, l);
        if (fireAt === null) continue;
        const when = l === 0 ? 'today' : l === 1 ? 'tomorrow' : `in ${l} days`;
        events.push({
          key: `interview:${row.id}:${row.interviewDate}:${l}`,
          kind: 'interview',
          rowId: row.id,
          companyName: row.companyName,
          jobTitle: row.jobTitle,
          date: row.interviewDate,
          fireAt,
          message: `Interview ${when} — ${rowLabel(row)}`,
        });
      }
    }
  }

  return events.sort((a, b) => a.fireAt - b.fireAt);
}

export interface AlarmCheckOutcome {
  /** Due within the catch-up window and not yet fired — sound these. */
  fire: AlarmEvent[];
  /** Past the catch-up window — mark handled so they never fire late. */
  dismiss: string[];
  /** ms until the next future event, or null when nothing is scheduled. */
  nextInMs: number | null;
}

/**
 * Decides what to do with a derived event list at a given instant.
 * `fired` is the journal's already-handled key set (computed once by the
 * caller — cheap, and keeps this function pure).
 */
export function alarmCheck(
  events: readonly AlarmEvent[],
  fired: ReadonlySet<string>,
  nowMs: number = Date.now(),
  catchUpMs: number = ALARM_CATCH_UP_MS,
): AlarmCheckOutcome {
  const fire: AlarmEvent[] = [];
  const dismiss: string[] = [];
  let nextInMs: number | null = null;

  for (const event of events) {
    if (fired.has(event.key)) continue;
    const delta = event.fireAt - nowMs;
    if (delta <= 0) {
      if (-delta <= catchUpMs) fire.push(event);
      else dismiss.push(event.key);
    } else if (nextInMs === null || delta < nextInMs) {
      nextInMs = delta;
    }
  }

  return { fire, dismiss, nextInMs };
}
