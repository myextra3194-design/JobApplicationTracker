import { blobToArrayBuffer, formatBytes, writeBytesToBlob } from './blob';
import { newId, normalizeJobApplicationList } from './normalize';
import type { AttachmentStore, RecordStore } from './storage/adapter';
import type { JobApplication } from './types';

/**
 * Part 11 — backup: export / import, attachments included.
 *
 * Same split as `src/lib/attachments.ts`, on purpose:
 *  - pure, synchronous logic (payload shape, base64, the CSV text, the merge
 *    decisions) — unit-tested in plain node in `src/lib/backup.spec.ts`
 *  - thin async helpers that are *handed* the stores instead of reaching for
 *    `getStorage()` themselves, so `src/lib/selfTest.ts` can run the identical
 *    code against an isolated document plus a real IndexedDB store
 *
 * Nothing here touches `localStorage` or `indexedDB`. Reads and writes go through
 * the existing seam only: `records.all()` / `records.create()` and
 * `attachments.listFor()` / `attachments.get()` / `attachments.add()`. There is
 * deliberately **no** `replaceAll` on the import path: a merge must never be able
 * to rewrite (and so lose) rows it did not look at, while `create()` only appends.
 * Permanent delete stays whatever `purge` is — a backup restores, it removes nothing.
 */

/** Written into every export, so a foreign JSON file can be named as such. */
export const BACKUP_KIND = 'job-application-tracker-backup';
/** Bump only when the payload shape changes; version 1 keeps being readable. */
export const BACKUP_VERSION = 1;

const MB = 1024 * 1024;

/** The plan's own threshold: "warn me if the export is getting large (e.g. over 20MB)". */
export const EXPORT_WARN_BYTES = 20 * MB;

/** Said in the menu, not implied by the code: a CSV cannot carry files. */
export const CSV_BINARY_NOTE =
  'CSV holds the structured fields only. Attached files are binary data, so they are not in a CSV — use the JSON backup to move those too.';

/** Excel reads a UTF-8 CSV as Windows-1252 unless the file starts with a BOM. */
export const CSV_BOM = '\uFEFF';

export const JSON_MIME = 'application/json';
export const CSV_MIME = 'text/csv';

export interface BackupFileEntry {
  /** The record this file is keyed to — attachments are keyed by application id. */
  applicationId: string;
  name: string;
  mimeType: string;
  /** Byte count as written; re-checked against the decoded length on import. */
  size: number;
  base64: string;
}

export interface BackupPayload {
  kind: typeof BACKUP_KIND;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  /**
   * Every row the store had, `isArchived` and `deletedAt` included: a backup that
   * quietly omits the Archived tab is not a backup.
   */
  applications: JobApplication[];
  files: BackupFileEntry[];
}

// --- base64 -------------------------------------------------------------------
//
// Hand-rolled rather than `btoa`: that pair only speaks latin-1, so the bytes
// first have to become a binary *string* — a second full copy of the file, and a
// `String.fromCharCode(...bytes)` spread that throws outright on a several-megabyte
// resume. This walks the bytes once in each direction.

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Reverse lookup; -1 for anything that is not a base64 digit. */
const B64_VALUES = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < B64_ALPHABET.length; i++) {
    const code = B64_ALPHABET.charCodeAt(i);
    if (code < 128) table[code] = i;
  }
  // base64url (a file copied out of a URL, or hand-edited) decodes too; it never encodes.
  table[45] = 62; // '-'
  table[95] = 63; // '_'
  return table;
})();

function b64Value(code: number): number {
  return code < 128 ? (B64_VALUES[code] ?? -1) : -1;
}

/** Standard alphabet, padded, never folded over lines. Empty input → empty output. */
export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    parts.push(
      `${B64_ALPHABET[(n >> 18) & 63]}${B64_ALPHABET[(n >> 12) & 63]}${B64_ALPHABET[(n >> 6) & 63]}${B64_ALPHABET[n & 63]}`,
    );
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = (bytes[i] ?? 0) << 16;
    parts.push(`${B64_ALPHABET[(n >> 18) & 63]}${B64_ALPHABET[(n >> 12) & 63]}==`);
  } else if (rest === 2) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8);
    parts.push(
      `${B64_ALPHABET[(n >> 18) & 63]}${B64_ALPHABET[(n >> 12) & 63]}${B64_ALPHABET[(n >> 6) & 63]}=`,
    );
  }
  return parts.join('');
}

/**
 * Decode, tolerating the whitespace an editor may have folded in and `=` padding
 * that lies. Throws a readable message rather than returning garbage — every
 * caller prefixes the error with the file it was decoding.
 */
export function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const body = text.replace(/\s+/g, '').replace(/=+$/, '');
  if (body.length === 0) return new Uint8Array(0);
  const rest = body.length % 4;
  if (rest === 1) throw new Error('truncated base64 data — one character left over');

  const bytes = new Uint8Array(Math.floor(body.length / 4) * 3 + (rest === 0 ? 0 : rest - 1));
  let at = 0;
  for (let i = 0; i < body.length; i += 4) {
    const quad = [0, 0, 0, 0];
    const present = Math.min(4, body.length - i);
    for (let j = 0; j < present; j++) {
      const value = b64Value(body.charCodeAt(i + j));
      if (value < 0) {
        throw new Error(`"${body[i + j]}" at position ${i + j + 1} is not a base64 character`);
      }
      quad[j] = value;
    }
    const n = ((quad[0] ?? 0) << 18) | ((quad[1] ?? 0) << 12) | ((quad[2] ?? 0) << 6) | (quad[3] ?? 0);
    bytes[at] = (n >> 16) & 255;
    at += 1;
    if (present >= 3) {
      bytes[at] = (n >> 8) & 255;
      at += 1;
    }
    if (present >= 4) {
      bytes[at] = n & 255;
      at += 1;
    }
  }
  return bytes;
}

// --- payload -------------------------------------------------------------------

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * One export entry per stored file. `size` is the decoded byte count, so an
 * import can notice a paste that lost characters off the end.
 */
export function encodeBackupFile(input: {
  applicationId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}): BackupFileEntry {
  return {
    applicationId: input.applicationId,
    name: input.name,
    mimeType: input.mimeType,
    size: input.bytes.byteLength,
    base64: bytesToBase64(input.bytes),
  };
}

/** The payload as a plain object. Pure: callers hand it the rows and the entries. */
export function buildBackupPayload(
  applications: readonly JobApplication[],
  files: readonly BackupFileEntry[],
  exportedAt: string,
): BackupPayload {
  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt,
    applications: applications.map((row) => ({ ...row, tags: [...row.tags] })),
    files: files.map((file) => ({ ...file })),
  };
}

/**
 * An uploaded file's text. `File.prototype.text()` is the obvious call, but this is
 * the same engine gap `blob.ts` documents (jsdom has `Blob` without `text()`, and
 * `arrayBuffer()` too), so it walks down to the FileReader-backed byte read rather
 * than crashing on a browser that lacks the shorthand.
 */
export async function readFileAsText(file: Blob): Promise<string> {
  const withText = file as Blob & { text?: () => Promise<string> };
  if (typeof withText.text === 'function') return withText.text();
  return new TextDecoder().decode(await blobToArrayBuffer(file));
}

/** Compact on purpose: two-space indentation on a base64-heavy file is pure size. */
export function serializeBackup(payload: BackupPayload): string {
  return JSON.stringify(payload);
}

export function byteLengthOf(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/** `job-applications-backup-2026-08-30.json`, the plan's filename. */
export function backupFilename(dateOnly: string, extension: 'json' | 'csv' = 'json'): string {
  const digits = dateOnly.replace(/\D/g, '');
  const day =
    digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : '';
  return `job-applications-backup${day ? `-${day}` : ''}.${extension}`;
}

export function isHeavyExport(bytes: number): boolean {
  return bytes > EXPORT_WARN_BYTES;
}

/** The warning asked *before* the download, so a huge export stays a choice. */
export function exportSizeNote(bytes: number): string | null {
  if (!isHeavyExport(bytes)) return null;
  return `This backup is ${formatBytes(bytes)} — over ${formatBytes(EXPORT_WARN_BYTES)}. Base64 attachments make the file heavy, so the download and any re-import of it will be slow. Export it anyway?`;
}

/** What the menu reports after an export. */
export function describeExport(payload: BackupPayload, bytes: number): string {
  const fileCount = payload.files.length;
  const fileBytes = payload.files.reduce((sum, file) => sum + (Number.isFinite(file.size) ? file.size : 0), 0);
  return `${payload.applications.length} application${payload.applications.length === 1 ? '' : 's'}, ${fileCount} file${fileCount === 1 ? '' : 's'} (${formatBytes(fileBytes)}) — ${formatBytes(bytes)} of JSON.`;
}

// --- parse ---------------------------------------------------------------------

export interface ParsedBackup {
  applications: JobApplication[];
  files: BackupFileEntry[];
  exportedAt: string;
  /** Rows the file listed that the normaliser had to discard (no company, no title). */
  droppedRecords: number;
  /** Files that could not be tied to a record in the same file, so they are left out. */
  droppedFiles: number;
}

export type BackupParseResult = { ok: true; backup: ParsedBackup } | { ok: false; message: string };

const NOT_A_BACKUP =
  'This is not a Job Application Tracker backup: it has no list of applications. Pick the file the Export button wrote (job-applications-backup-YYYY-MM-DD.json).';

function parseFileEntries(
  raw: unknown,
  known: ReadonlySet<string>,
): { files: BackupFileEntry[]; dropped: number } {
  if (!Array.isArray(raw)) return { files: [], dropped: 0 };
  const files: BackupFileEntry[] = [];
  let dropped = 0;
  for (const item of raw) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      dropped += 1;
      continue;
    }
    const candidate = item as Record<string, unknown>;
    const applicationId = str(candidate.applicationId).trim();
    const base64 = str(candidate.base64);
    // A file with no record to land on is worse than useless: it would sit in
    // IndexedDB under an id nothing can ever list.
    if (!applicationId || !known.has(applicationId) || base64 === '') {
      dropped += 1;
      continue;
    }
    const declared =
      typeof candidate.size === 'number' && Number.isFinite(candidate.size) ? candidate.size : 0;
    files.push({
      applicationId,
      name: str(candidate.name).trim() || 'attachment',
      mimeType: str(candidate.mimeType).trim() || 'application/octet-stream',
      size: Math.max(0, Math.round(declared)),
      base64,
    });
  }
  return { files, dropped };
}

/**
 * An uploaded file's text, turned into records + file entries. Never throws: every
 * rejection comes back as `{ ok: false, message }` for the UI to show, and every
 * record passes through the one normaliser on the way in. A row that is blank
 * apart from its id is dropped, so a foreign array cannot import as a pile of
 * empties.
 */
export function parseBackupJson(text: string): BackupParseResult {
  if (text.trim() === '') return { ok: false, message: 'That file is empty — nothing to import.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `That file is not valid JSON, so it cannot be imported (${reason}).` };
  }

  // Accepted shapes: this payload, the raw store document `{ version, records }`
  // (a copy made by hand), or a bare array of records.
  let rawApplications: unknown = null;
  let rawFiles: unknown = null;
  let exportedAt = '';
  if (Array.isArray(parsed)) {
    rawApplications = parsed;
  } else if (typeof parsed === 'object' && parsed !== null) {
    const document = parsed as Record<string, unknown>;
    rawApplications = Array.isArray(document.applications)
      ? document.applications
      : Array.isArray(document.records)
        ? document.records
        : null;
    rawFiles = document.files;
    exportedAt = str(document.exportedAt);
  }
  if (!Array.isArray(rawApplications)) return { ok: false, message: NOT_A_BACKUP };

  const normalized = normalizeJobApplicationList(rawApplications);
  const applications = normalized.filter((row) => row.companyName !== '' || row.jobTitle !== '');
  if (applications.length === 0) {
    return {
      ok: false,
      message:
        rawApplications.length === 0
          ? 'That backup has no applications in it — there is nothing to import.'
          : `None of the ${rawApplications.length} rows in that file has a company name or a job title, so nothing could be imported.`,
    };
  }

  const known = new Set(applications.map((row) => row.id));
  const { files, dropped } = parseFileEntries(rawFiles, known);
  return {
    ok: true,
    backup: {
      applications,
      files,
      exportedAt,
      droppedRecords: Math.max(0, rawApplications.length - applications.length),
      droppedFiles: dropped,
    },
  };
}

// --- merge ---------------------------------------------------------------------

/**
 * The import's "exact duplicate": same company + same job title + same
 * application date, trimmed and case-insensitive. Deliberately **not**
 * `src/lib/duplicates.ts` — that one warns while typing (where an archived row is
 * not a live duplicate) and keys on company + title only. Here an archived row
 * must block a re-import, or re-importing a backup would double every archived
 * application. A row with neither company nor title has no identity and never
 * matches, so two blank rows cannot swallow each other.
 */
export function backupDedupeKey(
  row: Pick<JobApplication, 'companyName' | 'jobTitle' | 'applicationDate'>,
): string {
  const company = row.companyName.trim().toLowerCase();
  const title = row.jobTitle.trim().toLowerCase();
  if (!company && !title) return '';
  return `${company}\u0000${title}\u0000${row.applicationDate ?? ''}`;
}

export interface PlannedRecord {
  /** The row as it will be written — the file's id, unless that id is taken. */
  record: JobApplication;
  /** The file's id when a local row already owned it and a fresh one was minted. */
  remappedFrom: string | null;
  /** Files keyed to this record, already re-keyed to `record.id`. */
  files: BackupFileEntry[];
}

export interface ImportPlan {
  toCreate: PlannedRecord[];
  skippedDuplicates: number;
  remapped: number;
}

/**
 * The merge, decided in full before a single write: "MERGING with existing data
 * rather than wiping it, and skipping exact duplicates".
 *
 * Every row in the file is compared against *every* local row — archived and
 * undo-window rows included, because an import has to be able to restore archived
 * items, so they count as already present. A new row keeps its id unless a local
 * row already owns it (re-importing a backup into a browser with unrelated data),
 * in which case a fresh id is minted and that row's files are re-keyed to it —
 * files are keyed by application id, and two rows sharing an id is the one thing
 * `normalizeJobApplicationList` cannot undo on the next read.
 *
 * Rows already created *by this plan* are added to the same key set, so a file
 * that lists the same application twice contributes it once.
 */
export function planImport(
  backup: ParsedBackup,
  existing: readonly JobApplication[],
  mintId: () => string = newId,
): ImportPlan {
  const takenIds = new Set(existing.map((row) => row.id));
  const seenKeys = new Set(existing.map((row) => backupDedupeKey(row)).filter((key) => key !== ''));

  const filesByOriginalId = new Map<string, BackupFileEntry[]>();
  for (const file of backup.files) {
    const bucket = filesByOriginalId.get(file.applicationId);
    if (bucket) bucket.push(file);
    else filesByOriginalId.set(file.applicationId, [file]);
  }

  const toCreate: PlannedRecord[] = [];
  let skippedDuplicates = 0;
  let remapped = 0;

  for (const candidate of backup.applications) {
    const key = backupDedupeKey(candidate);
    if (key !== '' && seenKeys.has(key)) {
      skippedDuplicates += 1;
      continue;
    }
    let record = candidate;
    let remappedFrom: string | null = null;
    if (takenIds.has(candidate.id)) {
      remappedFrom = candidate.id;
      record = { ...candidate, id: mintId() };
      remapped += 1;
    }
    const files = (filesByOriginalId.get(remappedFrom ?? candidate.id) ?? []).map((file) => ({
      ...file,
      applicationId: record.id,
    }));
    toCreate.push({ record, remappedFrom, files });
    if (key !== '') seenKeys.add(key);
    takenIds.add(record.id);
  }

  return { toCreate, skippedDuplicates, remapped };
}

// --- write ---------------------------------------------------------------------

export interface ImportStores {
  records: Pick<RecordStore, 'all' | 'create'>;
  attachments: Pick<AttachmentStore, 'add'>;
}

export interface ImportResult {
  created: number;
  skippedDuplicates: number;
  remapped: number;
  filesWritten: number;
  /** One line per file that could not be restored — the record still landed. */
  fileErrors: string[];
  /** New rows that came back inside the delete-undo window, so the list looks short. */
  inUndoWindow: number;
}

/**
 * Write the plan: the record first, then its files — the ordering rule Part 5 set
 * for the form, because a blob keyed to an id that does not exist can never be
 * listed or cascaded. `create()` appends, so an import that fails halfway leaves
 * the rows it already wrote and never touches the rows it did not.
 */
export async function applyImport(stores: ImportStores, plan: ImportPlan): Promise<ImportResult> {
  const result: ImportResult = {
    created: 0,
    skippedDuplicates: plan.skippedDuplicates,
    remapped: plan.remapped,
    filesWritten: 0,
    fileErrors: [],
    inUndoWindow: 0,
  };

  for (const item of plan.toCreate) {
    const saved = await stores.records.create(item.record);
    result.created += 1;
    if (saved.deletedAt !== null) result.inUndoWindow += 1;

    for (const file of item.files) {
      try {
        const bytes = base64ToBytes(file.base64);
        if (file.size > 0 && bytes.byteLength !== file.size) {
          throw new Error(`the backup says ${file.size} bytes but only ${bytes.byteLength} are in it`);
        }
        await stores.attachments.add({
          applicationId: saved.id,
          name: file.name,
          blob: await writeBytesToBlob(bytes, file.mimeType),
        });
        result.filesWritten += 1;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        const owner = saved.companyName || saved.jobTitle || 'a restored application';
        result.fileErrors.push(`"${file.name}" on ${owner}: ${reason}`);
      }
    }
  }

  return result;
}

/** The Data menu's whole import: plan against what is here now, then write. */
export async function runImport(stores: ImportStores, backup: ParsedBackup): Promise<ImportResult> {
  const plan = planImport(backup, await stores.records.all());
  return applyImport(stores, plan);
}

/** One readable line for the menu, in the app's own words rather than per component. */
export function importSummary(result: ImportResult, backup: ParsedBackup): string {
  const plural = (count: number, noun: string) =>
    count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
  const parts: string[] = [
    result.created === 0 ? 'nothing new to add' : `added ${plural(result.created, 'application')}`,
  ];
  if (result.filesWritten > 0) parts.push(`restored ${plural(result.filesWritten, 'attachment')}`);
  if (result.skippedDuplicates > 0) {
    parts.push(`skipped ${plural(result.skippedDuplicates, 'row')} already here on company + title + date`);
  }
  if (result.remapped > 0) {
    parts.push(`${plural(result.remapped, 'row')} given a new id because that id was in use`);
  }
  if (result.inUndoWindow > 0) {
    parts.push(`${plural(result.inUndoWindow, 'row')} came back inside the delete-undo window`);
  }
  if (backup.droppedRecords > 0) {
    parts.push(`${plural(backup.droppedRecords, 'row')} with no company or title left out`);
  }
  if (backup.droppedFiles > 0) {
    parts.push(`${plural(backup.droppedFiles, 'file')} with no matching application left out`);
  }
  if (result.fileErrors.length > 0) {
    parts.push(`${plural(result.fileErrors.length, 'file')} could not be restored`);
  }
  return `${parts.join(' · ')}.`;
}

// --- read (export) ---------------------------------------------------------------

export interface BackupSources {
  records: Pick<RecordStore, 'all'>;
  attachments: Pick<AttachmentStore, 'listFor' | 'get'>;
}

export interface PreparedExport {
  payload: BackupPayload;
  /** The exact text the download writes, so the size warning is about the real file. */
  json: string;
  bytes: number;
  /** Files a record listed that the blob store could not return. */
  unreadableFiles: string[];
}

/**
 * Every row, plus every file those rows have, base64-encoded. `records.all()` is
 * the store's unfiltered read — the one its own comment names for export — so the
 * backup holds archived rows and undo-window rows too, unlike the list on screen.
 */
export async function collectBackup(
  sources: BackupSources,
  exportedAt: string,
): Promise<PreparedExport> {
  const applications = await sources.records.all();
  const files: BackupFileEntry[] = [];
  const unreadableFiles: string[] = [];

  for (const record of applications) {
    for (const meta of await sources.attachments.listFor(record.id)) {
      const found = await sources.attachments.get(meta.id);
      if (!found) {
        unreadableFiles.push(
          `"${meta.name}" (${formatBytes(meta.size)}) on ${record.companyName || record.jobTitle || record.id}`,
        );
        continue;
      }
      files.push(
        encodeBackupFile({
          applicationId: record.id,
          name: meta.name,
          mimeType: meta.mimeType,
          bytes: new Uint8Array(await blobToArrayBuffer(found.blob)),
        }),
      );
    }
  }

  const payload = buildBackupPayload(applications, files, exportedAt);
  const json = serializeBackup(payload);
  return { payload, json, bytes: byteLengthOf(json), unreadableFiles };
}

// --- CSV -------------------------------------------------------------------------

export interface CsvColumn {
  readonly header: string;
  readonly value: (row: JobApplication) => string;
}

const yesNo = (value: boolean): string => (value ? 'yes' : 'no');
const nullable = (value: string | number | null): string => (value === null ? '' : String(value));

/**
 * The structured fields, in the plan's own order, plus the bookkeeping a
 * spreadsheet reader needs to know why a row is not on the board. Notes and
 * company research are included — `csvField` handles their newlines — and the
 * attached files are not, because CSV cannot hold binary data.
 */
export const CSV_COLUMNS: readonly CsvColumn[] = [
  { header: 'Company Name', value: (row) => row.companyName },
  { header: 'Job Title', value: (row) => row.jobTitle },
  { header: 'Location', value: (row) => row.jobLocation },
  { header: 'Status', value: (row) => row.status },
  { header: 'Application Date', value: (row) => nullable(row.applicationDate) },
  { header: 'Job Portal', value: (row) => row.jobPortal },
  { header: 'Job Link', value: (row) => row.jobLink },
  { header: 'Follow-up Date', value: (row) => nullable(row.followUpDate) },
  { header: 'Interview Date', value: (row) => nullable(row.interviewDate) },
  { header: 'Interview Status', value: (row) => row.interviewStatus },
  { header: 'Salary', value: (row) => row.salary },
  { header: 'Recruiter Name', value: (row) => row.recruiterName },
  { header: 'Recruiter Contact', value: (row) => row.recruiterContact },
  { header: 'Final Result', value: (row) => row.finalResult },
  { header: 'Match Score', value: (row) => nullable(row.matchScore) },
  { header: 'CV Version Used', value: (row) => nullable(row.cvVersionUsed) },
  { header: 'Tags', value: (row) => row.tags.join(', ') },
  { header: 'Notes', value: (row) => row.notes },
  { header: 'Company Research', value: (row) => row.companyResearch },
  { header: 'Archived', value: (row) => yesNo(row.isArchived) },
  { header: 'Created At', value: (row) => row.createdAt },
  { header: 'Updated At', value: (row) => row.updatedAt },
  { header: 'Deleted At', value: (row) => nullable(row.deletedAt) },
];

/** RFC 4180: `"` is doubled, and a value with a comma, quote, newline or stray
 *  leading/trailing space is wrapped in quotes. Everything else stays bare. */
export function csvField(value: string): string {
  const escaped = value.replace(/"/g, '""');
  const mustQuote = /[",\r\n]/.test(value) || value !== value.trim();
  return mustQuote ? `"${escaped}"` : escaped;
}

/** Header row + one row per application, CRLF-terminated lines (the CSV spec's). */
export function buildCsv(rows: readonly JobApplication[]): string {
  const lines = [CSV_COLUMNS.map((column) => csvField(column.header)).join(',')];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((column) => csvField(column.value(row))).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Thin UI wrapper — Blob + `<a download>`, the same shape as `downloadIcs` in
 * `src/lib/ics.ts`. A file leaving the browser is not persistence: no store is
 * written, and the export path never mutates a record.
 */
export function downloadTextFile(text: string, filename: string, mimeType: string): void {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
