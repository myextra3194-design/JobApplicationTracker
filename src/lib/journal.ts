/**
 * Part 13: a tiny, capped "keys we have already handled" journal on
 * localStorage. Two instances exist:
 *
 *  - `jat.alarms.v1`    — alarm event keys that already fired (or were skipped
 *                         as too stale), so a reminder never fires twice.
 *  - `jat.notifications.v1` — notification keys the user has seen, so the bell
 *                         badge only counts genuinely new items.
 *
 * Stored as a plain JSON array of keys, newest last, capped so a long-lived
 * profile cannot grow the document without bound. Like `localSettingsStore`,
 * this is the seam implementation, not UI code — components only see the
 * journal through its methods.
 */

const MAX_KEYS = 300;

export interface JournalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): JournalStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readKeys(storage: JournalStorage, storageKey: string): string[] {
  let raw: string | null = null;
  try {
    raw = storage.getItem(storageKey);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export class KeyJournal {
  constructor(
    private readonly storageKey: string,
    private readonly storage: JournalStorage | null = defaultStorage(),
  ) {}

  keys(): Set<string> {
    if (!this.storage) return new Set();
    return new Set(readKeys(this.storage, this.storageKey));
  }

  has(key: string): boolean {
    return this.keys().has(key);
  }

  /** Merge the given keys in; anything beyond the newest `MAX_KEYS` drops off. */
  mark(keys: readonly string[]): void {
    if (!this.storage || keys.length === 0) return;
    const next = [...this.keys(), ...keys.filter((key) => key.trim() !== '')];
    const capped = next.slice(-MAX_KEYS);
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(capped));
    } catch {
      // A full quota must not break reminders — the journal is best-effort.
    }
  }

  clear(): void {
    if (!this.storage) return;
    try {
      this.storage.removeItem(this.storageKey);
    } catch {
      // Same as above: nothing to recover from, nothing to propagate.
    }
  }
}
