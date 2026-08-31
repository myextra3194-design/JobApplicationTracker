import { StorageFullError, type SettingsStore, type ThemeMode, type TrackerSettings } from './adapter';

/**
 * localStorage-backed settings document, isolated from `jat.applications.v1`.
 * Weekly goal, the UI theme and Part 13's notification/alarm preferences live
 * here so a settings write can never rewrite the applications envelope. UI
 * still goes through `getStorage().settings`, and legacy documents that
 * predate the newer fields load safely with their defaults.
 */

export const SETTINGS_KEY = 'jat.settings.v1';
export const DEFAULT_WEEKLY_GOAL = 5;
export const DEFAULT_THEME: ThemeMode = 'dark';
export const DEFAULT_ALARM_TIME = '09:00';
export const DEFAULT_INTERVIEW_LEAD_DAYS = 0;

const ALARM_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function clampWeeklyGoal(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_WEEKLY_GOAL;
  return Math.max(0, Math.min(99, Math.round(n)));
}

export function clampInterviewLeadDays(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_INTERVIEW_LEAD_DAYS;
  return Math.max(0, Math.min(14, Math.round(n)));
}

export function normalizeAlarmTime(value: unknown): string {
  return typeof value === 'string' && ALARM_TIME_PATTERN.test(value) ? value : DEFAULT_ALARM_TIME;
}

function normalizeTheme(value: unknown): ThemeMode {
  return value === 'light' ? 'light' : 'dark';
}

function normalizeBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

const defaults = (): TrackerSettings => ({
  weeklyGoal: DEFAULT_WEEKLY_GOAL,
  theme: DEFAULT_THEME,
  notificationsEnabled: true,
  alarmsEnabled: true,
  alarmTime: DEFAULT_ALARM_TIME,
  interviewLeadDays: DEFAULT_INTERVIEW_LEAD_DAYS,
  followUpAlarms: true,
  interviewAlarms: true,
  browserAlerts: false,
});

function normalizeDocument(candidate: Record<string, unknown>): TrackerSettings {
  const base = defaults();
  return {
    weeklyGoal:
      typeof candidate.weeklyGoal === 'number' ? clampWeeklyGoal(candidate.weeklyGoal) : base.weeklyGoal,
    theme: normalizeTheme(candidate.theme),
    notificationsEnabled: normalizeBool(candidate.notificationsEnabled, base.notificationsEnabled),
    alarmsEnabled: normalizeBool(candidate.alarmsEnabled, base.alarmsEnabled),
    alarmTime: normalizeAlarmTime(candidate.alarmTime),
    interviewLeadDays: clampInterviewLeadDays(Number(candidate.interviewLeadDays ?? base.interviewLeadDays)),
    followUpAlarms: normalizeBool(candidate.followUpAlarms, base.followUpAlarms),
    interviewAlarms: normalizeBool(candidate.interviewAlarms, base.interviewAlarms),
    browserAlerts: normalizeBool(candidate.browserAlerts, base.browserAlerts),
  };
}

function readDocument(key: string): TrackerSettings {
  let raw: string | null = null;
  try {
    raw = globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return defaults();
  }
  if (!raw) return defaults();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return defaults();
    return normalizeDocument(parsed as Record<string, unknown>);
  } catch {
    return defaults();
  }
}

function writeDocument(key: string, settings: TrackerSettings): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(settings));
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    throw new StorageFullError(name === 'QuotaExceededError' ? 'the ~5 MB quota ran out while saving settings' : String(err));
  }
}

export class LocalSettingsStore implements SettingsStore {
  constructor(readonly storageKey: string = SETTINGS_KEY) {}

  async get(): Promise<TrackerSettings> {
    return readDocument(this.storageKey);
  }

  async set(patch: Partial<TrackerSettings>): Promise<TrackerSettings> {
    const current = readDocument(this.storageKey);
    // Every field normalises on the way in, so a bad value can never reach the
    // alarm engine or the theme switcher.
    const next = normalizeDocument({
      weeklyGoal: patch.weeklyGoal === undefined ? current.weeklyGoal : patch.weeklyGoal,
      theme: patch.theme === undefined ? current.theme : patch.theme,
      notificationsEnabled:
        patch.notificationsEnabled === undefined ? current.notificationsEnabled : patch.notificationsEnabled,
      alarmsEnabled: patch.alarmsEnabled === undefined ? current.alarmsEnabled : patch.alarmsEnabled,
      alarmTime: patch.alarmTime === undefined ? current.alarmTime : patch.alarmTime,
      interviewLeadDays:
        patch.interviewLeadDays === undefined ? current.interviewLeadDays : patch.interviewLeadDays,
      followUpAlarms: patch.followUpAlarms === undefined ? current.followUpAlarms : patch.followUpAlarms,
      interviewAlarms: patch.interviewAlarms === undefined ? current.interviewAlarms : patch.interviewAlarms,
      browserAlerts: patch.browserAlerts === undefined ? current.browserAlerts : patch.browserAlerts,
    });
    writeDocument(this.storageKey, next);
    return next;
  }

  async clear(): Promise<void> {
    globalThis.localStorage?.removeItem(this.storageKey);
  }
}
