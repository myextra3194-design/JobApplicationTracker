import { emptyJobApplication, normalizeJobApplication } from './normalize';
import { blobToArrayBuffer } from './blob';
import { isFollowUpDue, toPlainDate, weekKeyOf } from './pipeline';
import { purgeApplication } from './storage';
import { IdbAttachmentStore } from './storage/idbAttachmentStore';
import { corruptKeyFor, LocalRecordStore } from './storage/localRecordStore';

/**
 * Part 1 acceptance harness.
 *
 * The foundation is only done when persistence actually round-trips, so instead of
 * trusting the code by eye this runs the real adapter in the real browser: CRUD,
 * hide-on-delete, undo, archive, bulk edit, corrupt-data recovery, concurrent
 * writes, a Blob round-trip through IndexedDB and the attachment cascade that
 * Part 5 depends on.
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
      const created = await store.create({
        companyName: `Sample Power & Water ${SAMPLE}`,
        jobTitle: 'Substation Engineer',
      });
      const read = await store.get(created.id);
      assert(read?.companyName === created.companyName, 'read-back companyName differs from the created companyName');
      assert(read?.status === 'Saved', `new records must default to Saved, got ${read?.status}`);
      assert(read?.interviewStatus === 'Not scheduled', `interviewStatus default, got ${read?.interviewStatus}`);
      assert(read?.finalResult === 'Pending', `finalResult default, got ${read?.finalResult}`);
      assert(read?.isArchived === false, 'new records must default isArchived to false');
      assert(read?.createdAt === created.createdAt, 'createdAt was rewritten on read');
      assert(created.id.length > 8, 'id looks too short to be a uuid');
      return `wrote and re-read "${read?.companyName}"`;
    }),

    runCheck('update re-stamps updatedAt', async (store) => {
      const created = await store.create({ companyName: `Sample Update Co ${SAMPLE}` });
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
      const created = await store.create({ companyName: `Sample Delete Co ${SAMPLE}` });
      await store.remove(created.id);
      assert(!(await store.list()).some((r) => r.id === created.id), 'deleted record still visible in the default list');
      assert(
        (await store.list({ includeDeleted: true })).some((r) => r.id === created.id),
        'record vanished entirely — undo-delete impossible',
      );
      await store.restore(created.id);
      assert((await store.list()).some((r) => r.id === created.id), 'restore did not bring the record back');
      return 'undo-delete works in both directions, row never leaves the document';
    }),

    runCheck('archive is separate from delete', async (store) => {
      const created = await store.create({ companyName: `Sample Archive Co ${SAMPLE}` });
      const archived = await store.setArchived(created.id, true);
      assert(archived.isArchived === true, 'setArchived(id, true) must set isArchived boolean, not a timestamp');
      assert(!(await store.list()).some((r) => r.id === created.id), 'archived record leaked into the board');
      assert(
        (await store.list({ includeArchived: true })).some((r) => r.id === created.id),
        'archived record missing from archive view',
      );
      assert(
        !(await store.list({ includeDeleted: true })).some((r) => r.id === created.id),
        'archived must not appear as deleted',
      );
      await store.setArchived(created.id, false);
      const restored = await store.get(created.id);
      assert(restored?.isArchived === false, 'unarchive must set isArchived false');
      assert((await store.list()).some((r) => r.id === created.id), 'unarchive failed');
      return 'archived rows stay restorable and out of the default view';
    }),

    runCheck('bulk patch hits only the selection', async (store) => {
      const a = await store.create({ companyName: `Bulk A ${SAMPLE}` });
      const b = await store.create({ companyName: `Bulk B ${SAMPLE}` });
      const c = await store.create({ companyName: `Bulk C ${SAMPLE}` });
      const touched = await store.bulkPatch([a.id, b.id], { status: 'Withdrawn' });
      assert(touched.length === 2, `expected 2 touched, got ${touched.length}`);
      assert((await store.get(c.id))?.status === 'Saved', 'bulk patch modified an unselected record');
      assert((await store.bulkPatch([], {})).length === 0, 'empty selection must be a no-op');
      assert((await store.bulkRemove([a.id, b.id, 'ghost'])) === 2, 'bulkRemove must count only ids that exist');
      return '2 of 3 updated, third untouched, unknown ids ignored';
    }),

    runCheck('filters: search, status, multi-tag, portal, follow-up', async (store) => {
      await store.replaceAll([
        emptyJobApplication({
          id: 'f1',
          companyName: 'Alpha Utilities',
          status: 'Interview',
          followUpDate: todayIso(),
          interviewDate: todayIso(),
          jobPortal: 'LinkedIn',
          tags: ['qatar', 'referral'],
        }),
        emptyJobApplication({ id: 'f2', companyName: 'Beta Grid', status: 'Rejected', jobPortal: 'Indeed' }),
        emptyJobApplication({
          id: 'f3',
          companyName: 'Gamma Energy',
          status: 'Applied',
          tags: ['qatar'],
          jobPortal: 'Company website',
          followUpDate: '2099-01-01',
        }),
      ]);
      const interviews = await store.list({ statuses: ['Interview'] });
      assert(interviews.length === 1 && interviews[0]?.id === 'f1', 'status filter returned the wrong set');
      const search = await store.list({ search: 'gRID' });
      assert(search.length === 1 && search[0]?.id === 'f2', 'search must be case-insensitive across fields');
      const due = await store.list({ followUpDue: true });
      assert(due.length === 1 && due[0]?.id === 'f1', 'due/today follow-ups must surface, future ones must not');
      const singleTag = await store.list({ tag: 'referral' });
      assert(singleTag.length === 1 && singleTag[0]?.id === 'f1', 'single-tag filter must be case-insensitive');
      // Multi-tag is OR inside: f1 and f3 share 'qatar', 'never-used' matches nobody.
      const multiTag = (await store.list({ tags: ['QATAR', 'never-used'] })).map((r) => r.id).sort();
      assert(
        multiTag.length === 2 && multiTag.includes('f1') && multiTag.includes('f3'),
        `multi-tag filter must OR-match any selected tag, got [${multiTag.join(', ')}]`,
      );
      const portal = await store.list({ jobPortal: 'LINKEDIN' });
      assert(portal.length === 1 && portal[0]?.id === 'f1', 'portal filter must be case-insensitive');
      // Everything combines with AND — the spec's search+status example, plus tags and portal.
      const combined = await store.list({
        search: 'alpha',
        statuses: ['Interview'],
        tags: ['referral'],
        jobPortal: 'LinkedIn',
      });
      assert(combined.length === 1 && combined[0]?.id === 'f1', 'search + status + tags + portal must AND together');
      const andMisses = await store.list({ search: 'alpha', statuses: ['Applied'] });
      assert(andMisses.length === 0, 'search + status must exclude rows that miss either');
      const f1 = await store.get('f1');
      assert(f1 !== null && isFollowUpDue(f1), 'isFollowUpDue disagrees with the query filter');
      return 'search + status + multi-tag + portal all AND correctly; due-follow-up surfaces';
    }),

    runCheck('normaliser defends against garbage input', () => {
      const bad: ReturnType<typeof normalizeJobApplication> = normalizeJobApplication({
        companyName: 42,
        status: 'Hired',
        tags: ['qatar', '', '  ', 7, 'doha'],
        applicationDate: '15/08/2026',
        matchScore: 999,
        followUpDate: 'yesterday',
        interviewStatus: '',
        finalResult: '',
      });
      assert(bad !== null, 'normaliser returned null for an object input');
      const record = bad as Exclude<typeof bad, null>;
      assert(record.companyName === '', 'non-string companyName must coerce to empty, not "42"');
      assert(record.status === 'Saved', `unknown status must fall back to Saved, got ${record.status}`);
      assert(record.tags.join(',') === 'qatar,doha', `tags must trim and drop junk, got ${JSON.stringify(record.tags)}`);
      assert(record.applicationDate === null, 'non-ISO date must become null');
      assert(record.followUpDate === null, 'textual date must become null');
      assert(record.matchScore === 100, 'match score must clamp to 0-100');
      assert(record.interviewStatus === 'Not scheduled', 'empty interviewStatus defaults to Not scheduled');
      assert(record.finalResult === 'Pending', 'empty finalResult defaults to Pending');
      assert(record.isArchived === false, 'missing isArchived defaults to false');
      const custom = normalizeJobApplication({
        interviewStatus: 'Panel round 2',
        finalResult: 'Waiting on offer',
      });
      assert(custom?.interviewStatus === 'Panel round 2', 'free-text interviewStatus must be kept');
      assert(custom?.finalResult === 'Waiting on offer', 'free-text finalResult must be kept');
      assert(
        normalizeJobApplication('a string') === null && normalizeJobApplication(null) === null,
        'non-objects must be rejected, not coerced',
      );
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
      assert(
        globalThis.localStorage.getItem(corruptKeyFor(store.storageKey)) === junk,
        'quarantine must not be overwritten or duplicated',
      );
      return 'original bytes preserved byte-for-byte in one fixed .corrupt key, no duplicates on repeat reads';
    }),

    runCheck('parallel writes do not lose records', async (store) => {
      await Promise.all(Array.from({ length: 12 }, (_unused, i) => store.create({ companyName: `Race ${i} ${SAMPLE}` })));
      const count = (await store.all()).length;
      assert(count === 12, `12 concurrent creates wrote ${count} records — lost update in the store`);
      await Promise.all([
        store.update('nope', { status: 'Offer' }).catch(() => undefined),
        store.create({ companyName: `Mixed ${SAMPLE}` }),
      ]);
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
      assert(
        roundTripped.every((byte, i) => byte === bytes[i]),
        'blob bytes were corrupted in transit',
      );
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

    runCheck('permanent delete cascades files, soft delete keeps them', async (store) => {
      if (typeof indexedDB === 'undefined') throw new SkipError('indexedDB unavailable in this context');
      const record = await store.create({ companyName: `Sample Cascade Co ${SAMPLE}` });
      const payload = new TextEncoder().encode('%PDF-1.4 cascade probe');
      for (const name of ['Resume.pdf', 'CoverLetter.docx']) {
        await attachments.add({
          applicationId: record.id,
          name,
          blob: new Blob([payload], { type: 'application/pdf' }),
        });
      }
      assert((await attachments.listFor(record.id)).length === 2, 'the probe files were not stored');

      // Archive is not delete: the row is restorable, so its files must survive it.
      await store.setArchived(record.id, true);
      assert((await attachments.listFor(record.id)).length === 2, 'archive must not cascade files');

      // Soft delete is the undo window between "Delete" and Part 9's "Delete
      // permanently". Undo has to bring the CV back with the row.
      await store.remove(record.id);
      assert((await attachments.listFor(record.id)).length === 2, 'soft delete must keep files for undo');
      await store.restore(record.id);
      assert((await store.get(record.id)) !== null, 'restore did not bring the record back');

      // THE ONE CASCADE PATH. Same function `getStorage().purge` calls, so this
      // check is testing the code path the app actually takes, not a copy of it.
      await purgeApplication(record.id, { records: store, attachments });
      assert((await store.get(record.id)) === null, 'purge left the record behind');
      assert((await attachments.listFor(record.id)).length === 0, 'purge orphaned the files');

      // A sibling record's files must be untouched: the cascade keys by id.
      const other = await store.create({ companyName: `Sample Neighbour Co ${SAMPLE}` });
      await attachments.add({
        applicationId: other.id,
        name: 'Untouched.pdf',
        blob: new Blob([payload], { type: 'application/pdf' }),
      });
      assert((await attachments.listFor(other.id)).length === 1, 'neighbouring files were not stored');
      await purgeApplication(record.id, { records: store, attachments });
      assert((await attachments.listFor(other.id)).length === 1, 'cascade deleted another record\'s files');
      await purgeApplication(other.id, { records: store, attachments });
      assert((await store.get(other.id)) === null, 'purge left the neighbouring record behind');
      assert((await attachments.listFor(other.id)).length === 0, 'purge orphaned the neighbouring files');

      return 'archive and soft delete keep files; permanent delete takes record + files, one id at a time';
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
