import type { StorageDriver } from '../types';
import { LocalRecordStore } from './localRecordStore';
import { IdbAttachmentStore } from './idbAttachmentStore';
import { LocalSettingsStore } from './localSettingsStore';
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

/**
 * THE ONE CASCADE PATH — Part 5.
 *
 * Permanent delete must take the record *and* its files, in that order, and it is
 * the only place in the app that does. Extracted (rather than inlined in `purge`)
 * so the self-test can run this exact function against isolated stores: a second
 * cascade written later would silently be the one that forgets a step, and files
 * keyed by application id are invisible to a record-only delete.
 *
 * Files first, record second: if the file write fails the record survives and can
 * be retried, whereas the reverse would leave blobs nobody can ever reach again.
 *
 * Soft delete (`records.remove`) and archive (`records.setArchived`) deliberately
 * do NOT go through here — files stay for the undo window, and PLAN.md is explicit
 * that archive is never permanent delete.
 */
export async function purgeApplication(
  id: string,
  stores: {
    records: Pick<RecordStore, 'all' | 'replaceAll'>;
    attachments: Pick<AttachmentStore, 'removeAllFor'>;
  },
): Promise<void> {
  await stores.attachments.removeAllFor(id);
  await stores.records.replaceAll((await stores.records.all()).filter((r) => r.id !== id));
}

/**
 * Part 10: bulk permanent delete — and deliberately NOT a second cascade
 * implementation. It loops the one cascade path (`purgeApplication`) once per
 * id, so the rule that "permanent delete takes the record and its files, in
 * that order" stays in a single function. Unknown ids are skipped (and not
 * double-counted when an id appears twice). Returns how many records were
 * actually removed, which is what the self-test asserts against.
 */
export async function bulkPurgeApplications(
  ids: readonly string[],
  stores: {
    records: Pick<RecordStore, 'all' | 'replaceAll'>;
    attachments: Pick<AttachmentStore, 'removeAllFor'>;
  },
): Promise<number> {
  const existing = new Set((await stores.records.all()).map((r) => r.id));
  let removed = 0;
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id) || !existing.has(id)) continue;
    seen.add(id);
    await purgeApplication(id, stores);
    existing.delete(id);
    removed += 1;
  }
  return removed;
}

export function getStorage(): TrackerStorage {
  if (cache) return cache;

  const driver = resolveDriver();
  if (driver === 'rest') buildRest();

  const records: RecordStore = new LocalRecordStore();
  const attachments: AttachmentStore = new IdbAttachmentStore();
  const settings = new LocalSettingsStore();

  cache = {
    driver: 'local',
    records,
    attachments,
    settings,
    // Files are keyed by application id (Part 5). Cascade only on permanent delete.
    purge: (id: string) => purgeApplication(id, { records, attachments }),
    // Part 10: the Archived tab's "Delete selected permanently" — same cascade, looped.
    bulkPurge: (ids: readonly string[]) => bulkPurgeApplications(ids, { records, attachments }),
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
