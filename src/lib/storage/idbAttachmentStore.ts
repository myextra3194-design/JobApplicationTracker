import { openDB, type IDBPDatabase } from 'idb';
import { newId } from '../normalize';
import { blobToArrayBuffer } from '../blob';
import type { StorageDriver } from '../types';
import type { Attachment, AttachmentMeta, AttachmentStore, NewAttachment } from './adapter';

/**
 * IndexedDB-backed `AttachmentStore` — resumes, cover letters, screenshots.
 *
 * Inert until Part 5: the seam and the self-test round-trip exist so Part 5 does
 * not invent persistence. Nothing in the UI calls this yet. Files are keyed by
 * application id; `purge()` cascades via `removeAllFor(applicationId)` only.
 *
 * This is why the plan puts files here rather than in localStorage: localStorage is a
 * string API, so a 5 MB PDF would cost ~6.7 MB of base64 inside the JSON document that
 * every other read has to parse.
 *
 * Bytes are persisted as a `Uint8Array`, not as the `Blob` object, and a Blob is
 * reconstructed on read. Deliberate: a `Blob` is a live handle whose shape differs
 * between engines (an environment where structured clone flattened it to `{}` was how
 * this was caught), while a typed array is plain data that survives any implementation.
 * The cost is holding one file in memory at a time, which is irrelevant for CVs and
 * screenshots, and it keeps the API Blob-in/Blob-out so callers never see the difference.
 */

const DB_NAME = 'jat-files';
const DB_VERSION = 1;
const STORE = 'attachments';

/**
 * What actually lives in the object store. `Uint8Array<ArrayBuffer>` rather than a
 * bare `Uint8Array`: TS 5.9 tracks the buffer kind, and only the non-shared variant is
 * a valid `BlobPart`.
 */
interface StoredAttachment extends AttachmentMeta {
  bytes: Uint8Array<ArrayBuffer>;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('applicationId', 'applicationId');
      }
    },
  });
  return dbPromise;
}

function toMeta(stored: StoredAttachment): AttachmentMeta {
  const { bytes: _bytes, ...meta } = stored;
  return meta;
}

function toAttachment(stored: StoredAttachment): Attachment {
  return { ...toMeta(stored), blob: new Blob([stored.bytes], { type: stored.mimeType }) };
}

export class IdbAttachmentStore implements AttachmentStore {
  readonly driver: StorageDriver = 'local';

  async add(input: NewAttachment): Promise<AttachmentMeta> {
    const bytes = new Uint8Array(await blobToArrayBuffer(input.blob));
    const stored: StoredAttachment = {
      id: newId(),
      applicationId: input.applicationId,
      name: input.name,
      mimeType: input.blob.type || 'application/octet-stream',
      size: bytes.byteLength,
      createdAt: new Date().toISOString(),
      bytes,
    };
    await (await db()).put(STORE, stored);
    return toMeta(stored);
  }

  async meta(id: string): Promise<AttachmentMeta | null> {
    const found: StoredAttachment | undefined = await (await db()).get(STORE, id);
    return found ? toMeta(found) : null;
  }

  async get(id: string): Promise<Attachment | null> {
    const found: StoredAttachment | undefined = await (await db()).get(STORE, id);
    return found ? toAttachment(found) : null;
  }

  async listFor(applicationId: string): Promise<AttachmentMeta[]> {
    const all: StoredAttachment[] = await (await db()).getAllFromIndex(STORE, 'applicationId', applicationId);
    return all.map(toMeta).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name));
  }

  async remove(id: string): Promise<void> {
    await (await db()).delete(STORE, id);
  }

  async removeAllFor(applicationId: string): Promise<number> {
    const database = await db();
    const keys = (await database.getAllKeysFromIndex(STORE, 'applicationId', applicationId)) as IDBValidKey[];
    if (keys.length === 0) return 0;
    const tx = database.transaction(STORE, 'readwrite');
    for (const key of keys) tx.store.delete(key);
    await tx.done;
    return keys.length;
  }

  async totalBytes(): Promise<number> {
    const all: StoredAttachment[] = await (await db()).getAll(STORE);
    // Sum the metadata size rather than materialising every file to count it.
    return all.reduce((sum, stored) => sum + (stored.size || stored.bytes?.byteLength || 0), 0);
  }
}
