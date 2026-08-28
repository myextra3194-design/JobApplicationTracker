import { getStorage } from './storage';
import type { JobApplication, NewJobApplication } from './types';

/**
 * Part 1 named helpers. Thin wrappers over the storage seam
 * (`getStorage().records` is LocalRecordStore today).
 *
 * UI code still goes through `getStorage()`; these exist because the plan names
 * them, and because a one-shot script / import path should not have to learn
 * the adapter.
 */

export async function getAllApplications(): Promise<JobApplication[]> {
  return getStorage().records.all();
}

/** Upsert by id: update if that id exists, otherwise create (keeping a supplied id). */
export async function saveApplication(app: NewJobApplication): Promise<JobApplication> {
  const { records } = getStorage();
  const id = typeof app.id === 'string' && app.id ? app.id : '';
  if (id) {
    const existing = await records.get(id);
    if (existing) return records.update(id, app);
  }
  return records.create(app);
}

/**
 * Soft-delete unless `{ permanent: true }`.
 * Archive is never this. Files cascade only on permanent delete (via `purge`).
 */
export async function deleteApplication(id: string, options: { permanent?: boolean } = {}): Promise<void> {
  const storage = getStorage();
  if (options.permanent) {
    await storage.purge(id);
  } else {
    await storage.records.remove(id);
  }
}
