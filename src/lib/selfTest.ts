import { emptyApplication, normalizeApplication } from './normalize';
import { blobToArrayBuffer } from './blob';
import { isFollowUpDue, toPlainDate, weekKeyOf } from './pipeline';
import { IdbAttachmentStore } from './storage/idbAttachmentStore';
import { corruptKeyFor, LocalRecordStore } from './storage/localRecordStore';

/**
 * Part 1 acceptance harness.
 *
 * The foundation is only done when persistence actually round-trips, so instead of
 * trusting the code by eye this runs the real adapter in the real browser: CRUD,
 * hide-on-delete, undo, archive, bulk edit, corrupt-data recovery, concurrent
 * writes and a Blob round-trip through IndexedDB.
 *
 * Each check gets its own localStorage key, because they run concurrently —
 * sharing one document would let `replaceAll` in one check clear another's rows.
 * Nothing here ever reads or writes the user's real `jat.applications.v1`.
 */

export const SELF_TEST_PREFIX = 'jat.selftest.';

export interface CheckResult {
  name: string;
  ok: boolean;
  skipped: boolean;
  detail: string;
  ms: number;
}

/** Today in the app's date-only format. */
function todayIso(): string {
  return toPlainDate(new Date());
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/** A skipped check is not a failure — it means the browser feature is unavailable. */
class SkipError extends Error {}

async function runCheck(name: string, fn: (store: LocalRecordStore) => Promise<string> | string): Promise<CheckResult> {
  const key = `${SELF_TEST_PREFIX}${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  const store = new LocalRecordStore(key);
  await store.clear();
  const started = performance.now();
  try {
    const detail = await fn(store);
    return { name, ok: true, skipped: false, detail, ms: Math.max(0, Math.round(performance.now() - started)) };
  } catch (err) {
    if (err instanceof SkipError) {
      return { name, ok: true, skipped: true, detail: err.message, ms: 0 };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { name, ok: false, skipped: false, detail: message, ms: Math.max(0, Math.round(performance.now() - started)) };
  } finally {
    await store.clear();
  }
}

const SAMPLE = '(self-test)';

export async function runSelfTests(): Promise<CheckResult[]> {
  const attachmentAppId = `${SAMPLE}-${Date.now()}`;
  const attachments = new IdbAttachmentStore();

  const checks: Promise<CheckResult>[] = [
    runCheck('create + read back', async (store) => {
      const created = await store.create({ company: `Sample Power & Water ${SAMPLE}`, jobTitle: 'Substation Engineer' });
      const read = await store.get(created.id);
      assert(read?.company === created.company, 'read-back company differs from the created company');
      assert(read?.status === 'Saved', `new records must default to Saved, got ${read?.status}`);
      assert(read?.createdAt === created.createdAt, 'createdAt was rewritten on read');
      assert(created.id.length > 8, 'id looks too short to be a uuid');
      return `wrote and re-read "${read?.company}"`;
    }),

    runCheck('update re-stamps updatedAt', async (store) => {
      const created = await store.create({ company: `Sample Update Co ${SAMPLE}` });
      const before = created.updatedAt;
      await new Promise((resolve) => setTimeout(resolve, 3));
      const updated = await store.update(created.id, { status: 'Applied', applicationDate: todayIso() });
      assert(updated.status === 'Applied', 'status did not persist');
      assert(updated.applicationDate === todayIso(), 'applicationDate did not persist');
      assert(updated.updatedAt > before, `updatedAt was not advanced (${before} → ${updated.updatedAt})`);
      assert(updated.createdAt === created.createdAt, 'update must never rewrite createdAt');
      return `updatedAt advanced ${before.slice(11, 23)} → ${updated.updatedAt.slice(11, 23)}`;
    }),

    runCheck('unknown id rejects with NotFound', async (store) => {
      let caught: unknown = null;
      try {
        await store.update('does-not-exist', { status: 'Offer' });
      } catch (err) {
        caught = err;
      }
      assert(caught instanceof Error && caught.name === 'NotFoundError', 'expected NotFoundError, got a silent no-op');
      assert((await store.get('does-not-exist')) === null, 'get() on a missing id must be null, not undefined-cast');
      return 'NotFoundError raised instead of silently doing nothing';
    }),

    runCheck('soft delete hides, restore brings back', async (store) => {
      const created = await store.create({ company: `Sample Delete Co ${SAMPLE}` });
      await store.remove(created.id);
      assert(!(await store.list()).some((r) => r.id === created.id), 'deleted record still visible in the default list');
      assert((await store.list({ includeDeleted: true })).some((r) => r.id === created.id), 'record vanished entirely — undo-delete impossible');
      await store.restore(created.id);
      assert((await store.list()).some((r) => r.id === created.id), 'restore did not bring the record back');
      return 'undo-delete works in both directions, row never leaves the document';
    }),

    runCheck('archive is separate from delete', async (store) => {
      const created = await store.create({ company: `Sample Archive Co ${SAMPLE}` });
      await store.setArchived(created.id, true);
      assert(!(await store.list()).some((r) => r.id === created.id), 'archived record leaked into the board');
      assert((await store.list({ includeArchived: true })).some((r) => r.id === created.id), 'archived record missing from archive view');
      assert(!(await store.list({ includeDeleted: true })).some((r) => r.id === created.id), 'archived must not appear as deleted');
      await store.setArchived(created.id, false);
      assert((await store.list()).some((r) => r.id === created.id), 'unarchive failed');
      return 'archived rows stay restorable and out of the default view';
    }),

    runCheck('bulk patch hits only the selection', async (store) => {
      const a = await store.create({ company: `Bulk A ${SAMPLE}` });
      const b = await store.create({ company: `Bulk B ${SAMPLE}` });
      const c = await store.create({ company: `Bulk C ${SAMPLE}` });
      const touched = await store.bulkPatch([a.id, b.id], { status: 'Withdrawn' });
      assert(touched.length === 2, `expected 2 touched, got ${touched.length}`);
      assert((await store.get(c.id))?.status === 'Saved', 'bulk patch modified an unselected record');
      assert((await store.bulkPatch([], {})).length === 0, 'empty selection must be a no-op');
      assert((await store.bulkRemove([a.id, b.id, 'ghost'])) === 2, 'bulkRemove must count only ids that exist');
      return '2 of 3 updated, third untouched, unknown ids ignored';
    }),

    runCheck('filters: status, search, tag, due follow-up', async (store) => {
      await store.replaceAll([
        emptyApplication({ id: 'f1', company: 'Alpha Utilities', status: 'Interview', followUpDate: todayIso(), interviewDate: todayIso() }),
        emptyApplication({ id: 'f2', company: 'Beta Grid', status: 'Rejected' }),
        emptyApplication({ id: 'f3', company: 'Gamma Energy', status: 'Applied', tags: ['qatar'], followUpDate: '2099-01-01' }),
      ]);
      const interviews = await store.list({ statuses: ['Interview'] });
      assert(interviews.length === 1 && interviews[0]?.id === 'f1', 'status filter returned the wrong set');
      const search = await store.list({ search: 'gRID' });
      assert(search.length === 1 && search[0]?.id === 'f2', 'search must be case-insensitive across fields');
      const due = await store.list({ followUpDue: true });
      assert(due.length === 1 && due[0]?.id === 'f1', 'due/today follow-ups must surface, future ones must not');
      const tagged = await store.list({ tag: 'Qatar' });
      assert(tagged.length === 1 && tagged[0]?.id === 'f3', 'tag filter must be case-insensitive');
      const f1 = await store.get('f1');
      assert(f1 !== null && isFollowUpDue(f1), 'isFollowUpDue disagrees with the query filter');
      return 'status + fuzzy search + due-follow-up + tag all agree';
    }),

    runCheck('normaliser defends against garbage input', () => {
      const bad: ReturnType<typeof normalizeApplication> = normalizeApplication({ company: 42, status: 'Hired', tags: ['qatar', '', '  ', 7, 'doha'], applicationDate: '15/08/2026', matchScore: 999, followUpDate: 'yesterday' });
      assert(bad !== null, 'normaliser returned null for an object input');
      const record = bad as Exclude<typeof bad, null>;
      assert(record.company === '', 'non-string company must coerce to empty, not "42"');
      assert(record.status === 'Saved', `unknown status must fall back to Saved, got ${record.status}`);
      assert(record.tags.join(',') === 'qatar,doha', `tags must trim and drop junk, got ${JSON.stringify(record.tags)}`);
      assert(record.applicationDate === null, 'non-ISO date must become null');
      assert(record.followUpDate === null, 'textual date must become null');
      assert(record.matchScore === 100, 'match score must clamp to 0-100');
      assert(normalizeApplication('a string') === null && normalizeApplication(null) === null, 'non-objects must be rejected, not coerced');
      return 'bad types, bad dates, junk tags and out-of-range scores all sanitised';
    }),

    runCheck('corrupt document is quarantined, not destroyed', async (store) => {
      const junk = '{ this is not json';
      globalThis.localStorage.setItem(store.storageKey, junk);
      assert((await store.all()).length === 0, 'corrupt data must read as empty rather than throw');
      // Read the known backup key instead of enumerating storage: localStorage key
      // enumeration is not reliable outside browsers, and one fixed key is the design.
      const backup = globalThis.localStorage.getItem(corruptKeyFor(store.storageKey));
      assert(backup === junk, 'corrupt payload was not preserved byte-for-byte for recovery');
      // A second failed read must not pile up duplicates.
      await store.all();
      assert(globalThis.localStorage.getItem(corruptKeyFor(store.storageKey)) === junk, 'quarantine must not be overwritten or duplicated');
      return 'original bytes preserved byte-for-byte in one fixed .corrupt key, no duplicates on repeat reads';
    }),

    runCheck('parallel writes do not lose records', async (store) => {
      await Promise.all(Array.from({ length: 12 }, (_unused, i) => store.create({ company: `Race ${i} ${SAMPLE}` })));
      const count = (await store.all()).length;
      assert(count === 12, `12 concurrent creates wrote ${count} records — lost update in the store`);
      await Promise.all([store.update('nope', { status: 'Offer' }).catch(() => undefined), store.create({ company: `Mixed ${SAMPLE}` })]);
      assert((await store.all()).length === 13, 'a failing write must not corrupt the queue for later writes');
      return '12 concurrent writes all survived; a rejected write did not wedge the queue';
    }),

    runCheck('IndexedDB blob round-trip', async () => {
      if (typeof indexedDB === 'undefined') throw new SkipError('indexedDB unavailable in this context');
      const bytes = new TextEncoder().encode('%PDF-1.4 sample resume payload');
      const meta = await attachments.add({
        applicationId: attachmentAppId,
        name: 'CV_SAMPLE.pdf',
        blob: new Blob([bytes], { type: 'application/pdf' }),
      });
      const fetched = await attachments.get(meta.id);
      assert(fetched !== null, 'blob vanished after put()');
      const roundTripped = new Uint8Array(await blobToArrayBuffer((fetched as Exclude<typeof fetched, null>).blob));
      assert(roundTripped.length === bytes.length, `byte length changed: ${bytes.length} → ${roundTripped.length}`);
      assert(roundTripped.every((byte, i) => byte === bytes[i]), 'blob bytes were corrupted in transit');
      assert(meta.mimeType === 'application/pdf', 'mime type not recorded');
      const listed = await attachments.listFor(attachmentAppId);
      assert(listed.length === 1 && listed[0]?.name === 'CV_SAMPLE.pdf', 'listFor index lookup failed');
      assert((await attachments.totalBytes()) >= bytes.length, 'totalBytes under-reports usage');
      const bareMeta = await attachments.meta(meta.id);
      assert(bareMeta !== null && !('blob' in bareMeta), 'meta() must return the descriptor, not the file bytes');
      assert((await attachments.removeAllFor(attachmentAppId)) === 1, 'cascade delete removed the wrong count');
      assert((await attachments.listFor(attachmentAppId)).length === 0, 'attachment survived cascade delete');
      return `${bytes.length} bytes written, verified byte-for-byte, then deleted`;
    }),

    runCheck('week key groups applications for the goal tracker', () => {
      const monday = weekKeyOf('2026-08-24');
      assert(monday === '2026-08-24', `expected the week to start Monday 24 Aug, got ${monday}`);
      assert(weekKeyOf('2026-08-30') === monday, 'Sunday must belong to the same week');
      assert(weekKeyOf('2026-08-31') === '2026-08-31', 'the following Monday must start a new week');
      assert(weekKeyOf('not-a-date') === 'not-a-date', 'unparseable dates must pass through, not become NaN');
      return 'Monday-based, so "10 applications this week" means Mon-Sun';
    }),
  ];

  const results = await Promise.all(checks);
  await attachments.removeAllFor(attachmentAppId).catch(() => 0);
  return results;
}
