// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_TYPE_LABEL,
  describeRejections,
  downloadNameFor,
  extensionOf,
  inspectAttachmentFile,
  listAttachments,
  MAX_ATTACHMENT_BYTES,
  removeAttachment,
  saveStagedAttachments,
  stageAttachmentFile,
  stemOf,
  type StagedAttachment,
} from './attachments';
import { draftToInput, emptyFormDraft } from './form';
import { emptyJobApplication } from './normalize';
import { purgeApplication } from './storage';
import { IdbAttachmentStore } from './storage/idbAttachmentStore';
import { LocalRecordStore } from './storage/localRecordStore';

/**
 * Part 5 — file attachments.
 *
 * The validation rules are pure and run in any environment; the storage half runs
 * against real IndexedDB (fake-indexeddb) so the round-trip is the one a phone
 * actually performs. Nothing here reaches past `getStorage()`.
 */

const KB = 1024;
const MB = 1024 * KB;

function pdfNamed(name: string, bytes = 64): File {
  return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
}

describe('extension helpers', () => {
  it('reads the lower-case extension and the stem', () => {
    expect(extensionOf('CV_FINAL.pdf')).toBe('pdf');
    expect(extensionOf('cover letter.DOCX')).toBe('docx');
    expect(extensionOf('no-extension')).toBeNull();
    expect(extensionOf('.pdf')).toBeNull();
    expect(extensionOf('trailing-dot.')).toBeNull();
    expect(stemOf('CV_FINAL.pdf')).toBe('CV_FINAL');
    expect(stemOf('no-extension')).toBe('no-extension');
  });
});

describe('inspectAttachmentFile — the one gate every picked file goes through', () => {
  it('accepts exactly PDF, DOC and DOCX, case-insensitively', () => {
    for (const name of ['cv.pdf', 'cv.PDF', 'letter.doc', 'letter.DOC', 'letter.docx', 'letter.DocX']) {
      expect(inspectAttachmentFile({ name, size: 10 * KB })).toMatchObject({ ok: true });
    }
    expect(ACCEPTED_EXTENSIONS).toEqual(['pdf', 'doc', 'docx']);
  });

  it('rejects a PNG as not PDF/DOC/DOCX, naming the type it saw', () => {
    const result = inspectAttachmentFile({ name: 'screenshot.png', size: 200 * KB });
    expect(result).toMatchObject({ ok: false, reason: 'unsupported-type' });
    const message = (result as { message: string }).message;
    expect(message).toContain('screenshot.png');
    expect(message).toContain('PNG');
    expect(message).toContain(ACCEPTED_TYPE_LABEL); // "PDF, DOC or DOCX"
  });

  it('rejects a file with no extension rather than guessing', () => {
    const result = inspectAttachmentFile({ name: 'resume', size: 10 * KB });
    expect(result).toMatchObject({ ok: false, reason: 'unsupported-type' });
    expect((result as { message: string }).message).toContain('no file extension');
  });

  it('rejects over 5 MB with the actual and allowed sizes in the message', () => {
    const result = inspectAttachmentFile({ name: 'scanned-cv.pdf', size: 6 * MB });
    expect(result).toMatchObject({ ok: false, reason: 'too-large' });
    const message = (result as { message: string }).message;
    expect(message).toContain('6 MB');
    expect(message).toContain('5 MB');
    expect(message).toContain('limit');
  });

  it('accepts a file at exactly the limit — the limit is inclusive', () => {
    expect(inspectAttachmentFile({ name: 'exactly.pdf', size: MAX_ATTACHMENT_BYTES })).toMatchObject({ ok: true });
    expect(inspectAttachmentFile({ name: 'one-over.pdf', size: MAX_ATTACHMENT_BYTES + 1 })).toMatchObject({
      ok: false,
      reason: 'too-large',
    });
    expect(MAX_ATTACHMENT_BYTES).toBe(5 * 1024 * 1024);
  });

  it('rejects an empty file before it reaches the store', () => {
    expect(inspectAttachmentFile({ name: 'empty.pdf', size: 0 })).toMatchObject({
      ok: false,
      reason: 'empty',
    });
  });
});

describe('readable rejection copy', () => {
  it('reports every rejected file in a multi-pick, not just the first', () => {
    expect(describeRejections([])).toBe('');
    expect(describeRejections(['one'])).toBe('one');
    const both = describeRejections(['"a.png" is a PNG file…', '"b.pdf" is 6 MB…']);
    expect(both).toContain('2 files were not attached');
    expect(both).toContain('• "a.png" is a PNG file…');
    expect(both).toContain('• "b.pdf" is 6 MB…');
  });
});

describe('downloadNameFor — the download is named after the typed label', () => {
  it('uses the label but keeps the real file extension', () => {
    expect(downloadNameFor('Resume', 'cv_final_v3.pdf')).toBe('Resume.pdf');
    expect(downloadNameFor('Cover letter', 'draft.docx')).toBe('Cover letter.docx');
  });

  it('falls back to the original stem when no label was typed', () => {
    expect(downloadNameFor('', 'cv_final_v3.pdf')).toBe('cv_final_v3.pdf');
    expect(downloadNameFor('   ', 'cv_final_v3.pdf')).toBe('cv_final_v3.pdf');
  });

  it('strips characters that would break a save dialog or escape the folder', () => {
    expect(downloadNameFor('Acme / Resume: final', 'cv.pdf')).toBe('Acme Resume final.pdf');
    expect(downloadNameFor('../../etc/passwd', 'cv.pdf')).toBe('etc passwd.pdf');
    expect(downloadNameFor('a'.repeat(200), 'cv.pdf')).toMatch(/^a{80}\.pdf$/);
  });
});

describe('stageAttachmentFile', () => {
  it('stages a valid pick with the label defaulted from the filename', () => {
    const { staged, message } = stageAttachmentFile(pdfNamed('cv_final_v3.pdf'));
    expect(message).toBeNull();
    expect(staged?.label).toBe('cv_final_v3');
    expect(staged?.file.name).toBe('cv_final_v3.pdf');
    expect(staged?.key).toMatch(/^staged_/);
  });

  it('refuses an invalid pick and returns the message instead', () => {
    const { staged, message } = stageAttachmentFile(new File([new Uint8Array(8)], 'photo.png'));
    expect(staged).toBeNull();
    expect(message).toContain('PNG');
  });

  it('gives two picks of the same file distinct keys', () => {
    const first = stageAttachmentFile(pdfNamed('cv.pdf')).staged;
    const second = stageAttachmentFile(pdfNamed('cv.pdf')).staged;
    expect(first?.key).not.toBe(second?.key);
  });
});

describe('files are keyed by application id, with no attachmentIds on the record', () => {
  it('keeps the record free of file references', () => {
    const record = emptyJobApplication({ companyName: 'Acme', jobTitle: 'Engineer' });
    expect(Object.keys(record)).not.toContain('attachmentIds');
    const input = draftToInput({ ...emptyFormDraft(), companyName: 'Acme', jobTitle: 'Engineer' });
    expect(Object.keys(input)).not.toContain('attachmentIds');
    expect(Object.keys(input)).not.toContain('files');
  });

  it('round-trips staged files through IndexedDB under their application id', async () => {
    const appId = 'app-round-trip';
    const staged: StagedAttachment[] = [
      { key: 'k1', label: 'Resume', file: pdfNamed('cv_final_v3.pdf', 128) },
      { key: 'k2', label: 'Cover letter', file: pdfNamed('cover.docx', 64) },
    ];

    const saved = await saveStagedAttachments(appId, staged);
    expect(saved).toHaveLength(2);
    expect(saved.map((m) => m.name)).toEqual(['Resume.pdf', 'Cover letter.docx']);

    const listed = await listAttachments(appId);
    expect(listed.map((m) => m.name).sort()).toEqual(['Cover letter.docx', 'Resume.pdf']);
    expect(listed.every((m) => m.applicationId === appId)).toBe(true);
    // Metadata only — the list must not pull 5 MB blobs into memory.
    expect(listed.every((m) => !('blob' in m))).toBe(true);
    expect(listed.find((m) => m.name === 'Resume.pdf')?.size).toBe(128);

    await purgeApplication(appId, { records: new LocalRecordStore('jat.spec.attachments'), attachments: new IdbAttachmentStore() });
    expect(await listAttachments(appId)).toEqual([]);
  });

  it('scopes files to one application: removing one row leaves the neighbour intact', async () => {
    const a = 'app-scope-a';
    const b = 'app-scope-b';
    await saveStagedAttachments(a, [{ key: 'k', label: 'Resume A', file: pdfNamed('a.pdf', 16) }]);
    await saveStagedAttachments(b, [{ key: 'k', label: 'Resume B', file: pdfNamed('b.pdf', 16) }]);

    const onlyA = await listAttachments(a);
    expect(onlyA).toHaveLength(1);
    await removeAttachment(onlyA[0]!.id);

    expect(await listAttachments(a)).toEqual([]);
    expect((await listAttachments(b)).map((m) => m.name)).toEqual(['Resume B.pdf']);
    await purgeApplication(b, {
      records: new LocalRecordStore('jat.spec.attachments'),
      attachments: new IdbAttachmentStore(),
    });
  });

  it('writes nothing when there is nothing staged', async () => {
    const appId = 'app-no-files';
    expect(await saveStagedAttachments(appId, [])).toEqual([]);
    expect(await listAttachments(appId)).toEqual([]);
  });
});

describe('staged files stay out of the persisted record', () => {
  it('keeps draft.files when the form is cancelled, so no blob is orphaned', async () => {
    const draft = { ...emptyFormDraft(), companyName: 'Acme', jobTitle: 'Engineer' };
    const staged = stageAttachmentFile(pdfNamed('cv.pdf', 32)).staged;
    draft.files = staged ? [staged] : [];
    expect(draft.files).toHaveLength(1);
    // Saving the record writes none of it — the file is only persisted once the
    // record has an id, via saveStagedAttachments(saved.id, draft.files).
    const input = draftToInput(draft);
    expect('files' in input).toBe(false);
    expect('attachmentIds' in input).toBe(false);
    expect(Object.keys(input)).not.toContain('files');
  });
});
