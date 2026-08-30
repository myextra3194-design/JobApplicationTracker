import { formatBytes } from './blob';
import { getStorage } from './storage';
import type { AttachmentMeta } from './storage/adapter';

/**
 * Part 5 — file attachments (resume / CV, optional cover letter).
 *
 * Files are keyed by **application id** in IndexedDB behind
 * `getStorage().attachments`. There is deliberately no `attachmentIds` field on
 * `JobApplication` (PLAN.md field table): the record never has to agree with the
 * file store, so a half-written save cannot leave the record pointing at a blob
 * that was never stored. Nothing here touches `indexedDB` directly — that is the
 * adapter's job, and swapping in the REST adapter must not require touching this
 * file.
 *
 * Split in two on purpose:
 *  - pure, synchronous validation/naming helpers (unit-tested in node)
 *  - thin async wrappers over `getStorage()` (exercised in jsdom + fake-indexeddb)
 */

/** Per-file ceiling from the spec: "Enforce a per-file size limit (e.g. 5MB)". */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** The spec's accepted set: "Accept PDF, DOC, DOCX." Nothing else gets in. */
export const ACCEPTED_EXTENSIONS = ['pdf', 'doc', 'docx'] as const;

export type AttachmentExtension = (typeof ACCEPTED_EXTENSIONS)[number];

/** Human phrasing used in every rejection message, so the UI can't drift. */
export const ACCEPTED_TYPE_LABEL = 'PDF, DOC or DOCX';

/** `accept` attribute for the file input — extensions *and* MIME types, because
 *  mobile Safari is unreliable about either one alone. */
export const ACCEPT_ATTRIBUTE = [
  '.pdf',
  '.doc',
  '.docx',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',');

export type AttachmentRejectionReason = 'empty' | 'too-large' | 'unsupported-type';

export type AttachmentInspection =
  | { ok: true; extension: AttachmentExtension }
  | { ok: false; reason: AttachmentRejectionReason; message: string };

/** Lower-case extension without the dot, or null when there is none. */
export function extensionOf(filename: string): string | null {
  const base = filename.trim();
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return null;
  return base.slice(dot + 1).toLowerCase();
}

/** Strip the trailing extension so a label can default to the file's own stem. */
export function stemOf(filename: string): string {
  const base = filename.trim();
  const ext = extensionOf(base);
  return ext === null ? base : base.slice(0, base.length - ext.length - 1).trim();
}

/**
 * The one gate every picked file goes through. `File` is not required in the
 * signature — only `name` and `size` are read — so the rule is testable in plain
 * node without constructing a Blob.
 */
export function inspectAttachmentFile(file: { name: string; size: number }): AttachmentInspection {
  const name = file.name.trim() || 'That file';
  const ext = extensionOf(file.name);

  // Type first: a wrong format cannot be fixed by shrinking the file, and saying
  // "too large" about a PNG would send the user looking for a smaller PNG.
  if (ext === null || !(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    return {
      ok: false,
      reason: 'unsupported-type',
      message:
        ext === null
          ? `"${name}" has no file extension — attachments accept ${ACCEPTED_TYPE_LABEL} only.`
          : `"${name}" is a ${ext.toUpperCase()} file — attachments accept ${ACCEPTED_TYPE_LABEL} only.`,
    };
  }

  if (file.size <= 0) {
    return { ok: false, reason: 'empty', message: `"${name}" is empty — pick a file that has content.` };
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      reason: 'too-large',
      message: `"${name}" is ${formatBytes(file.size)} — over the ${formatBytes(MAX_ATTACHMENT_BYTES)} limit per file.`,
    };
  }

  return { ok: true, extension: ext as AttachmentExtension };
}

/** One readable line covering every rejected file in a multi-pick, not just the first. */
export function describeRejections(messages: readonly string[]): string {
  if (messages.length === 0) return '';
  if (messages.length === 1) return messages[0] ?? '';
  return `${messages.length} files were not attached:\n${messages.map((m) => `• ${m}`).join('\n')}`;
}

/**
 * The label the user types becomes the download filename. Deliberate: "Resume.pdf"
 * tells you which CV you sent when two applications both came from "cv_final_v3.pdf".
 * Path separators and the characters Windows forbids are replaced, and the
 * extension always comes from the real file so the download still opens.
 */
export function downloadNameFor(label: string, originalName: string): string {
  const ext = extensionOf(originalName) ?? extensionOf(label);
  const wanted = label.trim() || stemOf(originalName) || 'attachment';
  const safe = wanted
    // Path separators and the characters Windows forbids become a space, which is
    // what every other file manager does — it also stops "../../etc/passwd" from
    // surviving as a traversal.
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
    .slice(0, 80)
    .trim();
  const stem = safe || 'attachment';
  return ext === null ? stem : `${stem}.${ext}`;
}

/**
 * A file the user has picked but not saved yet. Lives only in React state:
 * `draft.files` is kept out of the record input, so a cancel leaves no blob behind.
 * `key` is a local list key, never persisted — the store mints the real id.
 */
export interface StagedAttachment {
  key: string;
  label: string;
  file: File;
}

let stagedCounter = 0;

/** Build a staged row from a picked file, rejecting it with a readable message otherwise. */
export function stageAttachmentFile(file: File): { staged: StagedAttachment | null; message: string | null } {
  const inspection = inspectAttachmentFile(file);
  if (!inspection.ok) return { staged: null, message: inspection.message };
  return {
    staged: {
      key: `staged_${Date.now().toString(36)}_${(stagedCounter += 1)}`,
      label: stemOf(file.name),
      file,
    },
    message: null,
  };
}

// --- thin wrappers over getStorage().attachments -------------------------------

export function listAttachments(applicationId: string): Promise<AttachmentMeta[]> {
  return getStorage().attachments.listFor(applicationId);
}

/**
 * Write the staged files once — and only once — the record has an id. Called by
 * `App.handleSave` after create/update returns, so a failed save never leaves
 * orphaned blobs (files are keyed by an application id that has to exist).
 */
export async function saveStagedAttachments(
  applicationId: string,
  staged: readonly StagedAttachment[],
): Promise<AttachmentMeta[]> {
  const saved: AttachmentMeta[] = [];
  for (const item of staged) {
    saved.push(
      await getStorage().attachments.add({
        applicationId,
        name: downloadNameFor(item.label, item.file.name),
        blob: item.file,
      }),
    );
  }
  return saved;
}

export function removeAttachment(id: string): Promise<void> {
  return getStorage().attachments.remove(id);
}

export function loadAttachment(id: string) {
  return getStorage().attachments.get(id);
}

/** Total bytes of files held for this browser, for the storage readout. */
export function totalAttachmentBytes(): Promise<number> {
  return getStorage().attachments.totalBytes();
}

/**
 * Browser download. The anchor is appended and revoked rather than clicked in
 * place because Safari ignores a download from a detached anchor, and revoking
 * the object URL synchronously cancels the save in some builds.
 */
export async function downloadAttachment(meta: AttachmentMeta): Promise<void> {
  const found = await getStorage().attachments.get(meta.id);
  if (!found) throw new Error(`"${meta.name}" is no longer stored — it may have been removed elsewhere.`);
  const url = URL.createObjectURL(found.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = found.name || meta.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
