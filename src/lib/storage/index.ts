import type { StorageDriver } from '../types';
import { LocalRecordStore } from './localRecordStore';
import { IdbAttachmentStore } from './idbAttachmentStore';
import type { AttachmentStore, RecordStore, TrackerStorage } from './adapter';

/**
 * Single entry point for persistence. Components call `getStorage()`, never a
 * concrete class, and never `localStorage` themselves.
 *
 * Swapping in the backend later is one new class pair plus `VITE_STORAGE_DRIVER=rest`
 * — see PLAN.md "Optional Later Upgrade".
 */

let cache: TrackerStorage | null = null;

function resolveDriver(): StorageDriver {
  const raw = import.meta.env?.VITE_STORAGE_DRIVER;
  return raw === 'rest' ? 'rest' : 'local';
}

function buildRest(): never {
  throw new Error(
    'VITE_STORAGE_DRIVER=rest was requested, but the REST/SQLite adapter is the "Optional Later ' +
      'Upgrade" in PLAN.md and is not implemented in the client-only build. Unset the variable to ' +
      'use local storage.',
  );
}

export function getStorage(): TrackerStorage {
  if (cache) return cache;

  const driver = resolveDriver();
  if (driver === 'rest') buildRest();

  const records: RecordStore = new LocalRecordStore();
  const attachments: AttachmentStore = new IdbAttachmentStore();

  cache = {
    driver: 'local',
    records,
    attachments,
    async purge(id: string): Promise<void> {
      // Files are keyed by application id (Part 5). Cascade only on permanent delete.
      // The IndexedDB store is inert until then; calling removeAllFor is still the
      // one path so Part 5 cannot grow a second cascade.
      await attachments.removeAllFor(id);
      await records.replaceAll((await records.all()).filter((r) => r.id !== id));
    },
  };
  return cache;
}

/** Test/demo helper: drop everything, including files. */
export async function resetStorage(): Promise<void> {
  const storage = getStorage();
  for (const record of await storage.records.all()) {
    await storage.purge(record.id);
  }
}
