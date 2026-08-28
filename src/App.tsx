import { useCallback, useEffect, useState } from 'react';
import { SelfTestPanel } from './components/SelfTestPanel';
import { PipelinePreview } from './components/PipelinePreview';
import { getStorage } from './lib/storage';

/**
 * Part 1 deliverable: the verified foundation.
 *
 * No CRUD screens yet by design — the plan sequences those into later parts. What
 * this page proves is that the pieces everything else sits on are real: the record
 * shape, the pipeline rules, and a storage seam that round-trips in the browser.
 */
export default function App() {
  const storage = getStorage();
  const [counts, setCounts] = useState<{ total: number; archived: number; deleted: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [live, archived, deleted] = await Promise.all([
        storage.records.list(),
        storage.records.list({ includeArchived: true }),
        storage.records.list({ includeDeleted: true }),
      ]);
      setCounts({
        total: live.length,
        archived: archived.filter((r) => r.isArchived).length,
        deleted: deleted.filter((r) => r.deletedAt).length,
      });
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [storage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="min-h-screen bg-canvas text-slate-200">
      <header className="border-b border-hairline bg-surface/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-5 py-4">
          <div className="flex size-9 items-center justify-center rounded-lg bg-sky-500/15 text-lg">📋</div>
          <div className="mr-auto">
            <h1 className="text-base font-semibold tracking-tight text-slate-50">Job Application Tracker</h1>
            <p className="text-xs text-slate-400">Part 1 of 12 — foundation: data model, pipeline rules, storage seam</p>
          </div>
          <DriverBadge driver={storage.driver} />
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-5 px-5 py-6">
        <section className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="text-sm font-semibold text-slate-100">Live store read-out</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Read straight from the storage adapter on page load — this is the number Parts 2–12 will render
            their views from. Nothing here is a mock.
          </p>
          {loadError ? (
            <p className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 font-mono text-xs text-rose-200">
              {loadError}
            </p>
          ) : (
            <dl className="mt-3 grid grid-cols-3 gap-3">
              {[
                { label: 'Active', value: counts?.total },
                { label: 'Archived', value: counts?.archived },
                { label: 'In trash', value: counts?.deleted },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border border-hairline bg-surface-raised px-3 py-2">
                  <dt className="text-[11px] uppercase tracking-wide text-slate-500">{stat.label}</dt>
                  <dd className="mt-0.5 text-xl font-semibold tabular-nums text-slate-100">
                    {stat.value ?? <span className="text-sm text-slate-500">reading…</span>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <PipelinePreview />
        <SelfTestPanel />
      </main>

      <footer className="mx-auto max-w-5xl px-5 pb-8 pt-2 text-xs leading-relaxed text-slate-500">
        Data never leaves this browser: records in localStorage, files in IndexedDB. Both sit behind a
        <code className="mx-1 rounded bg-surface-raised px-1.5 py-0.5 font-mono text-[11px] text-slate-300">RecordStore</code>
        /
        <code className="mx-1 rounded bg-surface-raised px-1.5 py-0.5 font-mono text-[11px] text-slate-300">AttachmentStore</code>
        interface, which is where a later REST + SQLite backend plugs in without touching components.
      </footer>
    </div>
  );
}

function DriverBadge({ driver }: { driver: 'local' | 'rest' }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-raised px-2.5 py-1 text-[11px] font-medium text-slate-300"
      title={driver === 'local' ? 'localStorage + IndexedDB, this browser only' : 'Remote API'}
    >
      <span className={`size-1.5 rounded-full ${driver === 'local' ? 'bg-emerald-400' : 'bg-sky-400'}`} />
      {driver === 'local' ? 'local storage' : 'remote API'}
    </span>
  );
}
