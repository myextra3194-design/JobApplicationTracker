// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { emptyApplication, STORAGE_KEY } from './normalize';
import { runSelfTests, SELF_TEST_PREFIX } from './selfTest';
import { LocalRecordStore } from './storage/localRecordStore';

/**
 * The other two spec files cover pure logic. This one executes the browser path for
 * real: jsdom supplies localStorage, fake-indexeddb supplies IndexedDB, so
 * `runSelfTests()` runs the same assertions the on-page panel runs — which is what
 * makes Part 1 verifiable without a human clicking it.
 */
describe('runSelfTests() against a real storage stack', () => {
  it('passes every check, including the IndexedDB blob round-trip', async () => {
    const results = await runSelfTests();
    const failures = results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.detail}`);
    expect(failures).toEqual([]);
    expect(results.length).toBe(12); // one per foundation guarantee; add one when you add a check

    const blobCheck = results.find((r) => r.name === 'IndexedDB blob round-trip');
    expect(blobCheck, 'blob check must run in this environment').toBeDefined();
    expect(blobCheck?.skipped, 'the blob check must not be skipped here').toBe(false);
    expect(blobCheck?.ok).toBe(true);
  });

  it('is isolated: no self-test keys leak, real data is untouched', async () => {
    const real = new LocalRecordStore(STORAGE_KEY);
    real.clear();
    await real.create(emptyApplication({ company: 'My Actual Application' }));
    const before = await real.all();

    await runSelfTests();

    const after = await real.all();
    expect(after.map((r) => r.company)).toEqual(before.map((r) => r.company));
    expect(after[0]?.company).toBe('My Actual Application');
    // Probe the keys the harness actually uses rather than enumerating localStorage,
    // whose key list is not reliable outside a real browser.
    for (const suffix of ['create-read-back', 'corrupt-document-is-quarantined-not-destroyed']) {
      const key = `${SELF_TEST_PREFIX}${suffix}`;
      expect(globalThis.localStorage.getItem(key), `${key} left behind`).toBeNull();
      expect(globalThis.localStorage.getItem(`${key}.corrupt`), `${key}.corrupt left behind`).toBeNull();
    }
    real.clear();
  });

  it('reads as empty when the document is absent, so first run cannot crash', async () => {
    const fresh = new LocalRecordStore('jat.brand-new-user');
    expect(await fresh.all()).toEqual([]);
    expect(await fresh.get('anything')).toBeNull();
    expect(await fresh.list({ includeArchived: true, includeDeleted: true })).toEqual([]);
  });
});
