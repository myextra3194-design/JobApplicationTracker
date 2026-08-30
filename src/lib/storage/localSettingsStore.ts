import { StorageFullError, type SettingsStore, type TrackerSettings } from './adapter';

/**
 * localStorage-backed settings document, isolated from `jat.applications.v1`.
 * Weekly goal lives here so a settings write can never rewrite the applications
 * envelope. UI still goes through `getStorage().settings`.
 */

export const SETTINGS_KEY = 'jat.settings.v1';
export const DEFAULT_WEEKLY_GOAL = 5;

export function clampWeeklyGoal(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_WEEKLY_GOAL;
  return Math.max(0, Math.min(99, Math.round(n)));
}

const defaults = (): TrackerSettings => ({ weeklyGoal: DEFAULT_WEEKLY_GOAL });

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
    const candidate = parsed as Record<string, unknown>;
    const goal = typeof candidate.weeklyGoal === 'number' ? candidate.weeklyGoal : DEFAULT_WEEKLY_GOAL;
    return { weeklyGoal: clampWeeklyGoal(goal) };
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
    const next: TrackerSettings = {
      weeklyGoal:
        patch.weeklyGoal === undefined ? current.weeklyGoal : clampWeeklyGoal(patch.weeklyGoal),
    };
    writeDocument(this.storageKey, next);
    return next;
  }

  async clear(): Promise<void> {
    globalThis.localStorage?.removeItem(this.storageKey);
  }
}
