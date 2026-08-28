import type { StorageDriver } from '../types';
import { LocalRecordStore } from './localRecordStore';
import { IdbAttachmentStore } from './idbAttachmentStore';
import type { AttachmentStore, RecordStore, TrackerStorage } from './adapter';

/**
 * Single entry point for persistence. Components call `getStorage()`, never a
 * concrete class, and never `localStorage` themselves.
 *
 * Swapping in the backend later is one new class pair plus `VITE_STORAGE_DRIVER=rest`
 * — see PLAN.md §E "Optional Later Upgrade".
 */

let cache: TrackerStorage | null = null;

function resolveDriver(): StorageDriver {
  const raw = import.meta.env?.VITE_STORAGE_DRIVER;
  return raw === 'rest' ? 'rest' : 'local';
}

function buildRest(): never {
  throw new Error(
    'VITE_STORAGE_DRIVER=rest was requested, but the REST/SQLite adapter is the "Optional Later ' +
      'Upgrade" in PLAN.md §E and is not implemented in the client-only build. Unset the variable to ' +
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
      // Cascade here rather than in either store: the record store knows the ids,
      // the attachment store knows the files, and only this facade knows both.
      const record = await records.get(id);
      if (record) {
        for (const attachmentId of record.attachmentIds) await attachments.remove(attachmentId);
      }
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
