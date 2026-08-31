import type { JobApplication, JobApplicationPatch, NewJobApplication, StorageDriver } from '../types';
import type { ApplicationQuery } from '../query';

/**
 * THE SEAM. Nothing in the UI touches localStorage or IndexedDB directly; it goes
 * through these two interfaces. That is the whole backend-readiness promise from
 * the plan: swap these implementations for `fetch()`-based ones and the components
 * keep working (PLAN.md, Optional Later Upgrade).
 */

export class NotFoundError extends Error {
  constructor(readonly id: string) {
    super(`No application with id "${id}"`);
    this.name = 'NotFoundError';
  }
}

export class StorageFullError extends Error {
  constructor(readonly detail: string) {
    super(`Storage is full — ${detail}`);
    this.name = 'StorageFullError';
  }
}

export interface RecordStore {
  readonly driver: StorageDriver;
  /** Filtered, sorted, archived/deleted hidden unless requested. */
  list(query?: ApplicationQuery): Promise<JobApplication[]>;
  /** Everything, unfiltered, in insertion order. Used by export/import and the dashboard. */
  all(): Promise<JobApplication[]>;
  get(id: string): Promise<JobApplication | null>;
  create(input?: NewJobApplication): Promise<JobApplication>;
  /** Rejects with NotFoundError. Timestamps `updatedAt`. */
  update(id: string, patch: JobApplicationPatch): Promise<JobApplication>;
  /** Soft delete — undo-delete lives here, not in `purge`. */
  remove(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  setArchived(id: string, archived: boolean): Promise<JobApplication>;
  bulkPatch(ids: readonly string[], patch: JobApplicationPatch): Promise<JobApplication[]>;
  bulkRemove(ids: readonly string[]): Promise<number>;
  /** Replace the whole collection (restore from backup). */
  replaceAll(records: readonly JobApplication[]): Promise<JobApplication[]>;
}

export interface AttachmentMeta {
  id: string;
  applicationId: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface Attachment extends AttachmentMeta {
  blob: Blob;
}

export interface NewAttachment {
  applicationId: string;
  name: string;
  blob: Blob;
}

/**
 * Files never go through `RecordStore` — localStorage cannot hold a Blob.
 * Attachments live in IndexedDB, keyed by application id (Part 5). This store
 * exists now so the seam and the self-test are real; it stays inert until Part 5.
 */
export interface AttachmentStore {
  readonly driver: StorageDriver;
  add(input: NewAttachment): Promise<AttachmentMeta>;
  meta(id: string): Promise<AttachmentMeta | null>;
  get(id: string): Promise<Attachment | null>;
  listFor(applicationId: string): Promise<AttachmentMeta[]>;
  remove(id: string): Promise<void>;
  removeAllFor(applicationId: string): Promise<number>;
  /** Bytes held by the store, for the storage-used readout. */
  totalBytes(): Promise<number>;
}

/** The two supported application themes. Persisted inside `jat.settings.v1`. */
export type ThemeMode = 'dark' | 'light';

export interface TrackerSettings {
  weeklyGoal: number;
  theme: ThemeMode;
}

export interface SettingsStore {
  get(): Promise<TrackerSettings>;
  set(patch: Partial<TrackerSettings>): Promise<TrackerSettings>;
}

export interface TrackerStorage {
  readonly driver: StorageDriver;
  readonly records: RecordStore;
  readonly attachments: AttachmentStore;
  readonly settings: SettingsStore;
  /** Permanent delete of a record AND its files, so nothing is orphaned. */
  purge(id: string): Promise<void>;
  /**
   * Part 10: bulk permanent delete. Still the one cascade path — this loops
   * `purgeApplication` per id rather than offering a second delete mechanism,
   * so the files can never be forgotten. Returns how many records were
   * actually removed (unknown ids are skipped, not errors).
   */
  bulkPurge(ids: readonly string[]): Promise<number>;
}
