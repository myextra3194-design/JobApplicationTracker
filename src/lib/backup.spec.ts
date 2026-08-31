// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  applyImport,
  BACKUP_KIND,
  BACKUP_VERSION,
  backupDedupeKey,
  backupFilename,
  base64ToBytes,
  byteLengthOf,
  buildBackupPayload,
  buildCsv,
  bytesToBase64,
  collectBackup,
  CSV_BOM,
  CSV_COLUMNS,
  csvField,
  describeExport,
  encodeBackupFile,
  EXPORT_WARN_BYTES,
  exportSizeNote,
  importSummary,
  isHeavyExport,
  parseBackupJson,
  readFileAsText,
  planImport,
  runImport,
  serializeBackup,
  type ParsedBackup,
} from './backup';
import { emptyJobApplication } from './normalize';
import type { JobApplication, NewJobApplication } from './types';
import { blobToArrayBuffer } from './blob';
import { IdbAttachmentStore } from './storage/idbAttachmentStore';
import { LocalRecordStore } from './storage/localRecordStore';

/**
 * Part 11 — backup: export / import.
 *
 * The payload shape, the base64 pair, the merge decisions and the CSV text are all
 * pure and tested directly. The two ends that need a store — `collectBackup` and
 * `runImport` — run against the real ones (an isolated localStorage document plus
 * fake IndexedDB), because "export then re-import restores the attachment" is only
 * worth asserting against the code that actually keeps bytes.
 */

const row = (over: NewJobApplication = {}): JobApplication => emptyJobApplication(over);

/** The rejection half of the parse contract: a message, never a throw. */
function rejection(text: string): string {
  const parsed = parseBackupJson(text);
  if (parsed.ok) throw new Error('expected this file to be rejected, but it parsed');
  return parsed.message;
}

function parsedFrom(text: string): ParsedBackup {
  const parsed = parseBackupJson(text);
  if (!parsed.ok) throw new Error(`parse failed: ${parsed.message}`);
  return parsed.backup;
}

describe('base64', () => {
  it('matches the RFC 4648 vectors', () => {
    const encode = (s: string) => bytesToBase64(new TextEncoder().encode(s));
    expect(encode('')).toBe('');
    expect(encode('f')).toBe('Zg==');
    expect(encode('fo')).toBe('Zm8=');
    expect(encode('foo')).toBe('Zm9v');
    expect(encode('foob')).toBe('Zm9vYg==');
    expect(encode('fooba')).toBe('Zm9vYmE=');
    expect(encode('foobar')).toBe('Zm9vYmFy');
  });

  it('decodes the same vectors back', () => {
    const decode = (s: string) => new TextDecoder().decode(base64ToBytes(s));
    expect(decode('Zg==')).toBe('f');
    expect(decode('Zm9vYmFy')).toBe('foobar');
    expect(decode('')).toBe('');
  });

  it('round-trips every byte value, in each of the three tail positions', () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) all[i] = i;
    for (const offset of [0, 1, 2]) {
      const bytes = all.slice(offset);
      const roundTripped = base64ToBytes(bytesToBase64(bytes));
      expect(roundTripped.length, `length after offset ${offset}`).toBe(bytes.length);
      expect(Array.from(roundTripped)).toEqual(Array.from(bytes));
    }
  });

  it('survives a large buffer without the btoa binary-string step', () => {
    const bytes = new Uint8Array(1024 * 512);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) & 255;
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it('ignores folded whitespace and lying padding', () => {
    const encoded = bytesToBase64(new TextEncoder().encode('hello world'));
    const folded = `${encoded.slice(0, 4)}\n${encoded.slice(4, 8)}  \r${encoded.slice(8)}`;
    expect(new TextDecoder().decode(base64ToBytes(folded))).toBe('hello world');
    // A caller that left the '=' off, or added too many, still gets the same bytes.
    expect(new TextDecoder().decode(base64ToBytes(encoded.replace(/=+$/, '')))).toBe('hello world');
    expect(new TextDecoder().decode(base64ToBytes(`${encoded}===`))).toBe('hello world');
  });

  it('accepts base64url digits too, and never emits them', () => {
    // 0xFB 0xFF is '+/8=' in the standard alphabet and '-_8=' in base64url.
    expect(bytesToBase64(new Uint8Array([0xfb, 0xff]))).toBe('+/8=');
    expect(Array.from(base64ToBytes('-_8='))).toEqual([0xfb, 0xff]);
  });

  it('rejects a character that is not base64, naming the position', () => {
    expect(() => base64ToBytes('Zm9v*GJhcg==')).toThrow(/position 5/);
  });

  it('decodes a 3-character group, and rejects a 1-character remainder', () => {
    expect(Array.from(base64ToBytes('Zm9'))).toEqual(Array.from(new TextEncoder().encode('fo')));
    expect(() => base64ToBytes('Zm9vY')).toThrow(/truncated/);
  });
});

describe('payload shape', () => {
  it('carries the plan fields the contract names, and stamps the file as ours', () => {
    const payload = buildBackupPayload(
      [
        row({
          id: 'a1',
          companyName: 'Acme Robotics',
          isArchived: true,
          companyResearch: 'Series B, 120 people.',
          tags: ['referral'],
          deletedAt: null,
        }),
      ],
      [],
      '2026-08-30T09:00:00.000Z',
    );
    expect(payload.kind).toBe(BACKUP_KIND);
    expect(payload.version).toBe(BACKUP_VERSION);
    expect(payload.exportedAt).toBe('2026-08-30T09:00:00.000Z');
    expect(payload.applications[0]?.companyResearch).toBe('Series B, 120 people.');
    expect(payload.applications[0]?.isArchived).toBe(true);
    expect(payload.files).toEqual([]);
  });

  it('copies rows so mutating the export cannot mutate the store snapshot', () => {
    const original = row({ id: 'a1', tags: ['qatar'] });
    const payload = buildBackupPayload([original], [], 'now');
    const copy = payload.applications[0]!;
    copy.tags.push('referral');
    copy.companyName = 'Someone Else';
    expect(original.tags).toEqual(['qatar']);
    expect(original.companyName).toBe('');
  });

  it('round-trips through JSON exactly, files included', () => {
    const bytes = new TextEncoder().encode('%PDF-1.4 resume\nwith é and \u0000');
    const records = [row({ id: 'a1', companyName: 'Acme' }), row({ id: 'a2', companyName: 'Blue', jobTitle: 'Eng' })];
    const payload = buildBackupPayload(
      records,
      [
        encodeBackupFile({ applicationId: 'a1', name: 'CV.pdf', mimeType: 'application/pdf', bytes }),
        encodeBackupFile({ applicationId: 'a2', name: 'Cover.docx', mimeType: 'word', bytes: new Uint8Array(0) }),
      ],
      '2026-08-30T09:00:00.000Z',
    );
    const backup = parsedFrom(serializeBackup(payload));
    expect(backup.applications).toEqual(records);
    // A zero-byte entry is indistinguishable from "no data", so it is dropped
    // rather than imported as an empty file — and the count says so.
    expect(backup.files.map((f) => f.name)).toEqual(['CV.pdf']);
    expect(backup.droppedFiles).toBe(1);
    expect(Array.from(base64ToBytes(backup.files[0]!.base64))).toEqual(Array.from(bytes));
  });

  it('names the decoded size, and re-serialising is stable', () => {
    const entry = encodeBackupFile({
      applicationId: 'a1',
      name: 'CV.pdf',
      mimeType: 'application/pdf',
      bytes: new Uint8Array([1, 2, 3, 4, 5]),
    });
    expect(entry.size).toBe(5);
    expect(entry.base64).toBe('AQIDBAU=');
    const payload = buildBackupPayload([], [entry], 'now');
    expect(serializeBackup(payload)).toBe(serializeBackup(buildBackupPayload([], [entry], 'now')));
  });

  it('reports the byte count of the JSON text, not its character count', () => {
    const text = 'é'; // one character, two UTF-8 bytes
    expect(text.length).toBe(1);
    expect(byteLengthOf(text)).toBe(2);
  });
});

describe('parse', () => {
  it('reads a bare array and the raw store document, not just our own payload', () => {
    const one = row({ id: 'a1', companyName: 'Acme' });
    expect(parsedFrom(JSON.stringify([one])).applications).toEqual([one]);
    expect(parsedFrom(JSON.stringify({ version: 1, savedAt: 'x', records: [one] })).applications).toEqual([one]);
  });

  it('runs every row through the normaliser, so junk input cannot poison a record', () => {
    const backup = parsedFrom(
      JSON.stringify({
        applications: [
          {
            id: 'a1',
            companyName: 42,
            jobTitle: '  Substation Engineer ',
            status: 'Hired',
            tags: ['qatar', '', 7, 'referral'],
            applicationDate: '15/08/2026',
            isArchived: 'yes',
          },
        ],
      }),
    );
    const record = backup.applications[0]!;
    expect(record.companyName).toBe('');
    expect(record.jobTitle).toBe('Substation Engineer');
    expect(record.status).toBe('Saved');
    expect(record.tags).toEqual(['qatar', 'referral']);
    expect(record.applicationDate).toBeNull();
    expect(record.isArchived).toBe(false);
  });

  it('drops rows with neither company nor title, and counts them', () => {
    const backup = parsedFrom(
      JSON.stringify({ applications: [row({ id: 'a1' }), row({ id: 'a2', companyName: 'Acme' })] }),
    );
    expect(backup.applications.map((r) => r.id)).toEqual(['a2']);
    expect(backup.droppedRecords).toBe(1);
  });

  it('collapses repeated ids instead of importing a corrupted document', () => {
    const backup = parsedFrom(
      JSON.stringify({
        applications: [row({ id: 'a1', companyName: 'First' }), row({ id: 'a1', companyName: 'Second' })],
      }),
    );
    expect(backup.applications.length).toBe(1);
    expect(backup.applications[0]?.companyName).toBe('First');
  });

  it('drops a file that has no record to attach to', () => {
    const backup = parsedFrom(
      JSON.stringify({
        applications: [row({ id: 'a1', companyName: 'Acme' })],
        files: [
          { applicationId: 'ghost', name: 'x.pdf', mimeType: 'application/pdf', size: 3, base64: 'YQ==' },
          { applicationId: 'a1', name: 'ok.pdf', mimeType: 'application/pdf', size: 1, base64: 'YQ==' },
          { applicationId: 'a1', name: 'empty.pdf', base64: '' },
        ],
      }),
    );
    expect(backup.files.map((f) => f.name)).toEqual(['ok.pdf']);
    expect(backup.droppedFiles).toBe(2);
  });

  it('falls back to a usable name and mime type rather than importing empties', () => {
    const backup = parsedFrom(
      JSON.stringify({
        applications: [row({ id: 'a1', companyName: 'Acme' })],
        files: [{ applicationId: 'a1', base64: 'YQ==' }],
      }),
    );
    expect(backup.files[0]).toEqual({
      applicationId: 'a1',
      name: 'attachment',
      mimeType: 'application/octet-stream',
      size: 0,
      base64: 'YQ==',
    });
  });

  it('surfaces a readable message for each way a file can be wrong, and never throws', () => {
    expect(rejection('   ')).toMatch(/empty/);
    expect(rejection('{ not json')).toMatch(/not valid JSON/);
    expect(rejection('{"todos": []}')).toMatch(/not a Job Application Tracker backup/);
    expect(rejection('"just a string"')).toMatch(/not a Job Application Tracker backup/);
    expect(rejection('{"applications": []}')).toMatch(/no applications in it/);
    expect(rejection(`{"applications": [${JSON.stringify(row({ id: 'a1' }))}]}`)).toMatch(
      /has a company name or a job title/,
    );
  });
});

describe('merge decisions', () => {
  const key = backupDedupeKey;

  it('keys on company + job title + application date, trimmed and case-insensitive', () => {
    expect(key({ companyName: ' Acme ', jobTitle: 'STAFF Engineer', applicationDate: '2026-01-14' })).toBe(
      key({ companyName: 'acme', jobTitle: 'staff engineer', applicationDate: '2026-01-14' }),
    );
    expect(
      key({ companyName: 'Acme', jobTitle: 'Engineer', applicationDate: '2026-01-14' }) ===
        key({ companyName: 'Acme', jobTitle: 'Engineer', applicationDate: '2026-01-15' }),
    ).toBe(false);
    expect(
      key({ companyName: 'Acme', jobTitle: 'Engineer', applicationDate: null }) ===
        key({ companyName: 'Acme', jobTitle: 'Engineer', applicationDate: '2026-01-14' }),
    ).toBe(false);
  });

  it('gives a blank row no identity, so two of them never match each other', () => {
    expect(key({ companyName: '   ', jobTitle: '', applicationDate: null })).toBe('');
  });

  it('skips exact duplicates and keeps everything else, considering archived rows too', () => {
    const existing = [
      row({ id: 'a1', companyName: 'Acme', jobTitle: 'Engineer', applicationDate: '2026-01-14' }),
      row({ id: 'a2', companyName: 'Archived Co', jobTitle: 'Role', applicationDate: '2026-02-02', isArchived: true }),
    ];
    const backup = parsedFrom(
      JSON.stringify({
        applications: [
          row({ id: 'a1', companyName: '  ACME ', jobTitle: 'engineer', applicationDate: '2026-01-14' }),
          row({ id: 'a2', companyName: 'Archived Co', jobTitle: 'Role', applicationDate: '2026-02-02', isArchived: true }),
          row({ id: 'a3', companyName: 'Brand New', jobTitle: 'Role', applicationDate: '2026-03-03' }),
        ],
      }),
    );
    const plan = planImport(backup, existing);
    expect(plan.skippedDuplicates).toBe(2);
    expect(plan.toCreate.map((p) => p.record.id)).toEqual(['a3']);
  });

  it('restores an archived row into a store that does not have it (import is not the filter)', () => {
    const backup = parsedFrom(
      JSON.stringify({ applications: [row({ id: 'a1', companyName: 'Gone', jobTitle: 'Role', isArchived: true })] }),
    );
    const plan = planImport(backup, []);
    expect(plan.toCreate.length).toBe(1);
    expect(plan.toCreate[0]?.record.isArchived).toBe(true);
  });

  it('never imports the same row twice from one file', () => {
    const backup = parsedFrom(
      JSON.stringify({
        applications: [
          row({ id: 'a1', companyName: 'Acme', jobTitle: 'Engineer', applicationDate: '2026-01-14' }),
          row({ id: 'a2', companyName: 'acme', jobTitle: 'Engineer', applicationDate: '2026-01-14' }),
        ],
      }),
    );
    const plan = planImport(backup, []);
    expect(plan.toCreate.map((p) => p.record.id)).toEqual(['a1']);
    expect(plan.skippedDuplicates).toBe(1);
  });

  it('mints a new id when a local row already owns one, and re-keys that record\'s files', () => {
    const bytes = new TextEncoder().encode('%PDF');
    const backup = parsedFrom(
      serializeBackup(
        buildBackupPayload(
          [row({ id: 'shared', companyName: 'From Backup', jobTitle: 'Role' })],
          [encodeBackupFile({ applicationId: 'shared', name: 'CV.pdf', mimeType: 'application/pdf', bytes })],
          'now',
        ),
      ),
    );
    const plan = planImport(backup, [row({ id: 'shared', companyName: 'Unrelated Local', jobTitle: 'Other' })], () => 'fresh');
    expect(plan.remapped).toBe(1);
    expect(plan.toCreate.length).toBe(1);
    const created = plan.toCreate[0]!;
    expect(created.record.id).toBe('fresh');
    expect(created.remappedFrom).toBe('shared');
    expect(created.files.map((f) => f.applicationId)).toEqual(['fresh']);
    expect(created.files[0]?.base64).toBe(bytesToBase64(bytes));
  });
});

describe('csv', () => {
  it('quotes only what needs quoting, doubling the quotes inside', () => {
    expect(csvField('Plain')).toBe('Plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
    expect(csvField('carriage\rreturn')).toBe('"carriage\rreturn"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField(' padded ')).toBe('" padded "');
    expect(csvField('')).toBe('');
  });

  it('writes a header row and one CRLF-terminated line per application', () => {
    const csv = buildCsv([
      row({
        id: 'a1',
        companyName: 'Acme, Inc.',
        jobTitle: 'Engineer "Lead"',
        applicationDate: '2026-01-14',
        tags: ['qatar', 'referral'],
        notes: 'two\nlines',
        isArchived: true,
        matchScore: 80,
      }),
    ]);
    const [header = '', line = ''] = csv.split('\r\n');
    expect(header.split(',').length).toBe(CSV_COLUMNS.length);
    expect(header.startsWith('Company Name,')).toBe(true);
    // The note the UI shows, in practice: no attachment column exists in a CSV.
    expect(header.toLowerCase()).not.toContain('attachment');
    expect(line).toContain('"Acme, Inc."');
    expect(line).toContain('"Engineer ""Lead"""');
    expect(line).toContain('"qatar, referral"');
    expect(line).toContain('"two\nlines"');
    expect(line).toContain('yes');
    expect(line).toContain('80');
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(buildCsv([]).split('\r\n')[0]).toBe(header);
  });

  it('leaves null dates and numbers blank, not "null"', () => {
    const csv = buildCsv([row({ id: 'a1', companyName: 'Acme' })]);
    const line = csv.split('\r\n')[1]!;
    expect(line).not.toContain('null');
    expect(line).not.toContain('undefined');
  });

  it('reads an uploaded file through whichever text path the engine offers', async () => {
    const text = serializeBackup(buildBackupPayload([row({ id: 'a1', companyName: 'Acme' })], [], 'now'));
    // jsdom's Blob has no text() (nor arrayBuffer()), which is exactly why
    // readFileAsText falls back to the FileReader-backed byte read.
    expect(await readFileAsText(new Blob([text], { type: 'application/json' }))).toBe(text);
    expect(await readFileAsText({ text: async () => 'from the shorthand' } as unknown as Blob)).toBe(
      'from the shorthand',
    );
  });

  it('has a column for every structured field the record carries', () => {
    const headers = CSV_COLUMNS.map((c) => c.header);
    for (const wanted of [
      'Company Name',
      'Job Title',
      'Application Date',
      'Job Portal',
      'Job Link',
      'Status',
      'Follow-up Date',
      'Interview Date',
      'Salary',
      'Notes',
      'Company Research',
      'Tags',
      'Archived',
    ]) {
      expect(headers).toContain(wanted);
    }
  });

  it('needs a BOM before Excel will read it as UTF-8', () => {
    expect(CSV_BOM).toBe('\uFEFF');
  });
});

describe('filenames and size warnings', () => {
  it('names the file as the plan asks, and stays valid without a usable date', () => {
    expect(backupFilename('2026-08-30')).toBe('job-applications-backup-2026-08-30.json');
    expect(backupFilename('2026-08-03', 'csv')).toBe('job-applications-backup-2026-08-03.csv');
    expect(backupFilename('not a date')).toBe('job-applications-backup.json');
  });

  it('warns past 20 MB and not before', () => {
    expect(isHeavyExport(EXPORT_WARN_BYTES)).toBe(false);
    expect(isHeavyExport(EXPORT_WARN_BYTES + 1)).toBe(true);
    expect(exportSizeNote(1024)).toBeNull();
    expect(exportSizeNote(EXPORT_WARN_BYTES + 1024)).toMatch(/20 MB/);
    expect(exportSizeNote(EXPORT_WARN_BYTES + 1024)).toMatch(/Export it anyway\?/);
  });

  it('describes an export with counts that read like a sentence', () => {
    const payload = buildBackupPayload(
      [row({ id: 'a1', companyName: 'Acme' }), row({ id: 'a2', companyName: 'Blue' })],
      [{ applicationId: 'a1', name: 'CV.pdf', mimeType: 'application/pdf', size: 2048, base64: 'AA==' }],
      'now',
    );
    expect(describeExport(payload, 4096)).toBe('2 applications, 1 file (2 KB) — 4 KB of JSON.');
    expect(describeExport(buildBackupPayload([row({ id: 'a1', companyName: 'Acme' })], [], 'now'), 10)).toBe(
      '1 application, 0 files (0 B) — 10 B of JSON.',
    );
  });

  it('summarises an import including what it skipped', () => {
    const backup: ParsedBackup = { applications: [], files: [], exportedAt: '', droppedRecords: 1, droppedFiles: 0 };
    const summary = importSummary(
      { created: 3, skippedDuplicates: 4, remapped: 1, filesWritten: 2, fileErrors: ['a'], inUndoWindow: 1 },
      backup,
    );
    expect(summary).toContain('added 3 applications');
    expect(summary).toContain('restored 2 attachments');
    expect(summary).toContain('skipped 4 rows already here on company + title + date');
    expect(summary).toContain('1 row given a new id');
    expect(summary).toContain('1 row came back inside the delete-undo window');
    expect(summary).toContain('1 row with no company or title left out');
    expect(summary).toContain('1 file could not be restored');
    expect(
      importSummary(
        { created: 0, skippedDuplicates: 2, remapped: 0, filesWritten: 0, fileErrors: [], inUndoWindow: 0 },
        { applications: [], files: [], exportedAt: '', droppedRecords: 0, droppedFiles: 0 },
      ),
    ).toBe('nothing new to add · skipped 2 rows already here on company + title + date.');
  });
});

describe('against the real stores', () => {
  /** Each test gets its own document, so a run cannot see another's rows. */
  let counter = 0;
  function isolated() {
    counter += 1;
    const store = new LocalRecordStore(`jat.selftest.backup-spec-${counter}`);
    return { store, attachments: new IdbAttachmentStore() };
  }

  it('exports what the store holds, including archived rows and attachment bytes', async () => {
    const { store, attachments } = isolated();
    await store.clear();
    const record = await store.create({ companyName: 'Acme Robotics', jobTitle: 'Staff Engineer', isArchived: true });
    const bytes = new TextEncoder().encode('%PDF-1.4 the real resume bytes');
    await attachments.add({ applicationId: record.id, name: 'CV.pdf', blob: new Blob([bytes], { type: 'application/pdf' }) });

    const prepared = await collectBackup({ records: store, attachments }, '2026-08-30T00:00:00.000Z');
    expect(prepared.payload.applications.length).toBe(1);
    expect(prepared.unreadableFiles).toEqual([]);
    expect(prepared.bytes).toBe(byteLengthOf(prepared.json));
    const backup = parsedFrom(prepared.json);
    expect(backup.files[0]?.name).toBe('CV.pdf');
    expect(Array.from(base64ToBytes(backup.files[0]!.base64))).toEqual(Array.from(bytes));

    await store.clear();
    await attachments.removeAllFor(record.id);
  });

  it('restores a full backup into an empty store, and a second import adds nothing', async () => {
    const { store, attachments } = isolated();
    await store.clear();
    const first = await store.create({
      companyName: 'Acme Robotics',
      jobTitle: 'Staff Engineer',
      applicationDate: '2026-01-14',
      companyResearch: 'Series B.',
      tags: ['referral'],
      isArchived: true,
    });
    const second = await store.create({ companyName: 'Blue Harbor', jobTitle: 'Eng', applicationDate: '2026-02-02' });
    const bytes = new TextEncoder().encode('%PDF-1.4 payload that must survive \u0000\u00fe');
    await attachments.add({ applicationId: first.id, name: 'CV.pdf', blob: new Blob([bytes], { type: 'application/pdf' }) });
    await attachments.add({ applicationId: second.id, name: 'Cover.docx', blob: new Blob(['docx'], { type: 'application/msword' }) });

    const before = await store.all();
    const backup = parsedFrom((await collectBackup({ records: store, attachments }, 'now')).json);

    await store.replaceAll([]);
    await attachments.removeAllFor(first.id);
    await attachments.removeAllFor(second.id);
    expect(await store.all()).toEqual([]);

    const result = await runImport({ records: store, attachments }, backup);
    expect(result).toMatchObject({ created: 2, skippedDuplicates: 0, remapped: 0, filesWritten: 2, inUndoWindow: 0 });
    expect(result.fileErrors).toEqual([]);

    // Same rows, same ids, same fields — the archived flag and the research note and all.
    expect(await store.all()).toEqual(before);

    const restoredFirst = await attachments.listFor(first.id);
    expect(restoredFirst.map((f) => f.name)).toEqual(['CV.pdf']);
    const file = restoredFirst[0];
    const found = file ? await attachments.get(file.id) : null;
    expect(found).not.toBeNull();
    expect(Array.from(new Uint8Array(await blobToArrayBuffer((found as NonNullable<typeof found>).blob)))).toEqual(
      Array.from(bytes),
    );

    // The plan's test: the same file again must not duplicate anything.
    const again = await runImport({ records: store, attachments }, backup);
    expect(again).toMatchObject({ created: 0, skippedDuplicates: 2, remapped: 0, filesWritten: 0 });
    expect((await store.all()).length).toBe(2);
    expect((await attachments.listFor(first.id)).length).toBe(1);
    expect((await attachments.listFor(second.id)).length).toBe(1);

    await store.clear();
    await attachments.removeAllFor(first.id);
    await attachments.removeAllFor(second.id);
  });

  it('writes files onto a record it just created, under the id it minted', async () => {
    const { store, attachments } = isolated();
    await store.clear();
    const local = await store.create({ id: 'shared-id', companyName: 'Local Co', jobTitle: 'Local Role' });
    const bytes = new TextEncoder().encode('%PDF collision probe');
    const backup = parsedFrom(
      serializeBackup(
        buildBackupPayload(
          [row({ id: 'shared-id', companyName: 'Backup Co', jobTitle: 'Backup Role' })],
          [encodeBackupFile({ applicationId: 'shared-id', name: 'CV.pdf', mimeType: 'application/pdf', bytes })],
          'now',
        ),
      ),
    );

    const result = await runImport({ records: store, attachments }, backup);
    expect(result).toMatchObject({ created: 1, remapped: 1, filesWritten: 1 });

    const created = (await store.all()).find((r) => r.companyName === 'Backup Co');
    expect(created).toBeDefined();
    expect(created!.id).not.toBe('shared-id');
    // The local row is intact, and the file went to the new record only.
    expect((await store.get(local.id))?.companyName).toBe('Local Co');
    expect(await attachments.listFor('shared-id')).toEqual([]);
    const files = await attachments.listFor(created!.id);
    expect(files.map((f) => f.name)).toEqual(['CV.pdf']);
    const written = files[0] ? await attachments.get(files[0].id) : null;
    expect(
      Array.from(new Uint8Array(await blobToArrayBuffer((written as NonNullable<typeof written>).blob))),
    ).toEqual(Array.from(bytes));

    await store.clear();
    await attachments.removeAllFor(created!.id);
  });

  it('keeps going past a file it cannot decode, and reports which one', async () => {
    const { store, attachments } = isolated();
    await store.clear();
    const good = new TextEncoder().encode('%PDF good');
    const backup: ParsedBackup = {
      applications: [
        row({ id: 'r1', companyName: 'Good Co', jobTitle: 'Role' }),
        row({ id: 'r2', companyName: 'Broken Co', jobTitle: 'Role' }),
        row({ id: 'r3', companyName: 'Short Co', jobTitle: 'Role' }),
      ],
      files: [
        { applicationId: 'r1', name: 'good.pdf', mimeType: 'application/pdf', size: good.length, base64: bytesToBase64(good) },
        { applicationId: 'r2', name: 'broken.pdf', mimeType: 'application/pdf', size: 4, base64: 'not base64 @@@' },
        { applicationId: 'r3', name: 'short.pdf', mimeType: 'application/pdf', size: 99, base64: bytesToBase64(good) },
      ],
      exportedAt: '',
      droppedRecords: 0,
      droppedFiles: 0,
    };

    const result = await applyImport({ records: store, attachments }, planImport(backup, []));
    expect(result.created).toBe(3);
    expect(result.filesWritten).toBe(1);
    expect(result.fileErrors.length).toBe(2);
    expect(result.fileErrors.join('\n')).toMatch(/broken.pdf.*not a base64 character/);
    expect(result.fileErrors.join('\n')).toMatch(new RegExp(`short\.pdf.*only ${good.length} are in it`));

    const withGoodFile = await store.get('r1');
    expect(withGoodFile?.companyName).toBe('Good Co');
    expect((await attachments.listFor('r1')).length).toBe(1);
    expect((await attachments.listFor('r2')).length).toBe(0);

    await store.clear();
    await attachments.removeAllFor('r1');
  });

  it('restores a row that is inside the undo window as still inside it', async () => {
    const { store, attachments } = isolated();
    await store.clear();
    const deleted = new Date().toISOString();
    const backup = parsedFrom(
      JSON.stringify({ applications: [row({ id: 'd1', companyName: 'Deleted Co', jobTitle: 'Role', deletedAt: deleted })] }),
    );
    const result = await runImport({ records: store, attachments }, backup);
    expect(result).toMatchObject({ created: 1, inUndoWindow: 1 });
    expect((await store.get('d1'))?.deletedAt).toBe(deleted);
    expect(await store.list()).toEqual([]);
    expect((await store.list({ includeDeleted: true })).length).toBe(1);

    await store.clear();
  });

  it('never touches the store when the file is rejected, existing rows included', async () => {
    const { store } = isolated();
    await store.clear();
    await store.create({ companyName: 'Keep Me', jobTitle: 'Role' });
    const before = await store.all();

    expect(rejection('{"todos": []}')).toMatch(/not a Job Application Tracker backup/);
    expect(await store.all()).toEqual(before);

    expect(rejection('{}')).toMatch(/not a Job Application Tracker backup/);
    expect(await store.all()).toEqual(before);

    // A rejected file leaves the row exactly as it was — same id, same timestamps.
    expect((await store.all())[0]?.companyName).toBe('Keep Me');

    await store.clear();
  });
});
