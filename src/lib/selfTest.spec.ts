// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { emptyJobApplication, STORAGE_KEY } from './normalize';
import { runSelfTests, SELF_TEST_PREFIX } from './selfTest';
import { LocalRecordStore } from './storage/localRecordStore';

/**
 * The other spec files cover pure logic. This one executes the browser path for
 * real: jsdom supplies localStorage, fake-indexeddb supplies IndexedDB, so
 * `runSelfTests()` runs the same assertions the on-page panel runs — which is what
 * makes Part 1 verifiable without a human clicking it.
 */
describe('runSelfTests() against a real storage stack', () => {
  it('passes every check, including the IndexedDB blob round-trip', async () => {
    const results = await runSelfTests();
    const failures = results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.detail}`);
    expect(failures).toEqual([]);
    expect(results.length).toBe(14); // one per foundation guarantee; add one when you add a check

    const blobCheck = results.find((r) => r.name === 'IndexedDB blob round-trip');
    expect(blobCheck, 'blob check must run in this environment').toBeDefined();
    expect(blobCheck?.skipped, 'the blob check must not be skipped here').toBe(false);
    expect(blobCheck?.ok).toBe(true);
  });

  it('proves the Part 5 cascade: permanent delete takes the files, soft delete does not', async () => {
    const results = await runSelfTests();
    const cascade = results.find((r) => r.name === 'permanent delete cascades files, soft delete keeps them');
    expect(cascade, 'the attachment cascade check must be registered').toBeDefined();
    expect(cascade?.skipped, 'the cascade check must actually run here').toBe(false);
    expect(cascade?.ok, cascade?.detail).toBe(true);
  });

  it('is isolated: no self-test keys leak, real data is untouched', async () => {
    const real = new LocalRecordStore(STORAGE_KEY);
    await real.clear();
    await real.create(emptyJobApplication({ companyName: 'My Actual Application' }));
    const before = await real.all();

    await runSelfTests();

    const after = await real.all();
    expect(after.map((r) => r.companyName)).toEqual(before.map((r) => r.companyName));
    expect(after[0]?.companyName).toBe('My Actual Application');
    // Probe the keys the harness actually uses rather than enumerating localStorage,
    // whose key list is not reliable outside a real browser.
    for (const suffix of ['create-read-back', 'corrupt-document-is-quarantined-not-destroyed']) {
      const key = `${SELF_TEST_PREFIX}${suffix}`;
      expect(globalThis.localStorage.getItem(key), `${key} left behind`).toBeNull();
      expect(globalThis.localStorage.getItem(`${key}.corrupt`), `${key}.corrupt left behind`).toBeNull();
    }
    // The Part 5 cascade check adds two more probe keys.
    for (const suffix of ['permanent-delete-cascades-files-soft-delete-keeps-them']) {
      const key = `${SELF_TEST_PREFIX}${suffix}`;
      expect(globalThis.localStorage.getItem(key), `${key} left behind`).toBeNull();
    }
    await real.clear();
  });

  it('reads as empty when the document is absent, so first run cannot crash', async () => {
    const fresh = new LocalRecordStore('jat.brand-new-user');
    expect(await fresh.all()).toEqual([]);
    expect(await fresh.get('anything')).toBeNull();
    expect(await fresh.list({ includeArchived: true, includeDeleted: true })).toEqual([]);
  });
});
