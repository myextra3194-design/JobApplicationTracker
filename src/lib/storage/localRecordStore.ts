import { applyQuery, type ApplicationQuery } from '../query';
import type { JobApplication, JobApplicationPatch, NewJobApplication, StorageDriver } from '../types';
import {
  emptyJobApplication,
  mergeJobApplication,
  normalizeJobApplicationList,
  SCHEMA_VERSION,
  STORAGE_KEY,
} from '../normalize';
import { NotFoundError, StorageFullError, type RecordStore } from './adapter';

/**
 * localStorage-backed `RecordStore`.
 *
 * Storage layout: one JSON document `{ version, savedAt, records: [...] }` under
 * `jat.applications.v1`. Rewriting the whole array is deliberate: at a few hundred
 * applications it is sub-millisecond, and it keeps the format trivially exportable
 * (which is what the backup/restore part needs). If the collection ever outgrows
 * this, the fix stays inside this class rather than spreading across the app.
 */

interface Envelope {
  version: number;
  savedAt: string;
  records: JobApplication[];
}

const emptyEnvelope = (): Envelope => ({ version: SCHEMA_VERSION, savedAt: '', records: [] });

/** Where a document that failed to parse is stashed, so a bad save can be recovered by hand. */
export function corruptKeyFor(key: string): string {
  return `${key}.corrupt`;
}

function readEnvelope(key: string): Envelope {
  let raw: string | null = null;
  try {
    raw = globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    // Storage blocked (Safari private mode, disabled cookies): read as empty rather than crash the UI.
    return emptyEnvelope();
  }
  if (!raw) return emptyEnvelope();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Accept a bare array: a hand-edited file, or an export pasted back in.
      return { version: SCHEMA_VERSION, savedAt: '', records: normalizeJobApplicationList(parsed) };
    }
    if (typeof parsed !== 'object' || parsed === null) return emptyEnvelope();
    const candidate = parsed as Record<string, unknown>;
    return {
      version: SCHEMA_VERSION,
      savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt : '',
      records: normalizeJobApplicationList(candidate.records),
    };
  } catch {
    // Corrupt JSON must not destroy the user's data: stash the original bytes, then
    // read as empty. One fixed key, and never overwritten — a bounded quarantine.
    // (A `${Date.now()}` suffix here leaked one uncleaned key per failed read.)
    const backupKey = corruptKeyFor(key);
    try {
      if (globalThis.localStorage && globalThis.localStorage.getItem(backupKey) === null) {
        globalThis.localStorage.setItem(backupKey, raw);
      }
    } catch {
      /* nothing further we can do */
    }
    return emptyEnvelope();
  }
}

function writeEnvelope(key: string, records: JobApplication[]): void {
  const envelope: Envelope = { version: SCHEMA_VERSION, savedAt: new Date().toISOString(), records };
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(envelope));
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    throw new StorageFullError(name === 'QuotaExceededError' ? 'the ~5 MB quota ran out while saving' : String(err));
  }
}

/**
 * Serialises mutations. Without it, two un-awaited `update()` calls would each read
 * the same snapshot and the second write would silently undo the first.
 */
function createMutex() {
  let tail: Promise<unknown> = Promise.resolve();
  return function tx<T>(work: () => T | Promise<T>): Promise<T> {
    const run = tail.then(work, work);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

export class LocalRecordStore implements RecordStore {
  readonly driver: StorageDriver = 'local';
  private tx = createMutex();

  /**
   * `storageKey` is a constructor argument so the self-test and any fixture can run
   * against an isolated document instead of the user's real data.
   */
  constructor(readonly storageKey: string = STORAGE_KEY) {}

  private read(): Envelope {
    return readEnvelope(this.storageKey);
  }

  private write(records: JobApplication[]): void {
    writeEnvelope(this.storageKey, records);
  }

  async all(): Promise<JobApplication[]> {
    return this.tx(() => this.read().records);
  }

  async list(query: ApplicationQuery = {}): Promise<JobApplication[]> {
    return this.tx(() => applyQuery(this.read().records, query));
  }

  async get(id: string): Promise<JobApplication | null> {
    return this.tx(() => this.read().records.find((r) => r.id === id) ?? null);
  }

  async create(input: NewJobApplication = {}): Promise<JobApplication> {
    return this.tx(() => {
      const record = emptyJobApplication(input);
      this.write([...this.read().records, record]);
      return record;
    });
  }

  async update(id: string, patch: JobApplicationPatch): Promise<JobApplication> {
    return this.tx(() => {
      const { records } = this.read();
      const index = records.findIndex((r) => r.id === id);
      const current = index === -1 ? undefined : records[index];
      if (!current) throw new NotFoundError(id);
      const next = mergeJobApplication(current, { ...patch, updatedAt: new Date().toISOString() });
      const copy = [...records];
      copy[index] = next;
      this.write(copy);
      return next;
    });
  }

  async remove(id: string): Promise<void> {
    await this.update(id, { deletedAt: new Date().toISOString() });
  }

  async restore(id: string): Promise<void> {
    await this.update(id, { deletedAt: null, isArchived: false });
  }

  async setArchived(id: string, archived: boolean): Promise<JobApplication> {
    return this.update(id, { isArchived: archived });
  }

  async bulkPatch(ids: readonly string[], patch: JobApplicationPatch): Promise<JobApplication[]> {
    if (ids.length === 0) return [];
    const wanted = new Set(ids);
    return this.tx(() => {
      const { records } = this.read();
      const stamp = new Date().toISOString();
      const touched: JobApplication[] = [];
      const next = records.map((r) => {
        if (!wanted.has(r.id)) return r;
        const merged = mergeJobApplication(r, { ...patch, updatedAt: stamp });
        touched.push(merged);
        return merged;
      });
      this.write(next);
      return touched;
    });
  }

  async bulkRemove(ids: readonly string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const touched = await this.bulkPatch(ids, { deletedAt: new Date().toISOString() });
    return touched.length;
  }

  async replaceAll(records: readonly JobApplication[]): Promise<JobApplication[]> {
    return this.tx(() => {
      const normalized = normalizeJobApplicationList(records);
      this.write(normalized);
      return normalized;
    });
  }

  /**
   * Wipes this store's document and its quarantine copy. Both, always: leaving the
   * `.corrupt` sibling behind is how deleted data would resurface after a restore.
   * Awaited on purpose — an unawaitable clear races whatever write follows it.
   */
  async clear(): Promise<void> {
    await this.tx(() => {
      globalThis.localStorage?.removeItem(this.storageKey);
      globalThis.localStorage?.removeItem(corruptKeyFor(this.storageKey));
    });
  }
}
