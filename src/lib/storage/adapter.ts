import type { ApplicationRecord, ApplicationPatch, NewApplication, StorageDriver } from '../types';
import type { ApplicationQuery } from '../query';

/**
 * THE SEAM. Nothing in the UI touches localStorage or IndexedDB directly; it goes
 * through these two interfaces. That is the whole backend-readiness promise from
 * the plan: swap these implementations for `fetch()`-based ones and the components
 * keep working (PLAN.md §E).
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
  list(query?: ApplicationQuery): Promise<ApplicationRecord[]>;
  /** Everything, unfiltered, in insertion order. Used by export/import and the dashboard. */
  all(): Promise<ApplicationRecord[]>;
  get(id: string): Promise<ApplicationRecord | null>;
  create(input?: NewApplication): Promise<ApplicationRecord>;
  /** Rejects with NotFoundError. Timestamps `updatedAt`. */
  update(id: string, patch: ApplicationPatch): Promise<ApplicationRecord>;
  /** Soft delete — undo-delete lives here, not in `purge`. */
  remove(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  setArchived(id: string, archived: boolean): Promise<ApplicationRecord>;
  bulkPatch(ids: readonly string[], patch: ApplicationPatch): Promise<ApplicationRecord[]>;
  bulkRemove(ids: readonly string[]): Promise<number>;
  /** Replace the whole collection (restore from backup / CSV import). */
  replaceAll(records: readonly ApplicationRecord[]): Promise<ApplicationRecord[]>;
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
 * Files never go through `RecordStore` — localStorage cannot hold a Blob. Attachments
 * live in IndexedDB and the record only stores their ids.
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

export interface TrackerStorage {
  readonly driver: StorageDriver;
  readonly records: RecordStore;
  readonly attachments: AttachmentStore;
  /** Permanent delete of a record AND its files, so nothing is orphaned. */
  purge(id: string): Promise<void>;
}
