import { useCallback, useEffect, useState } from 'react';
import { runSelfTests, type CheckResult } from '../lib/selfTest';

/**
 * Runs the Part 1 acceptance harness in the real browser and reports it inline.
 * Clickable on purpose: after changing anything in the storage layer, re-run it
 * instead of re-deriving correctness by eye.
 */
export function SelfTestPanel() {
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      setResults(await runSelfTests());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const passed = results?.filter((r) => r.ok).length ?? 0;
  const failed = results?.filter((r) => !r.ok).length ?? 0;
  const totalMs = results?.reduce((sum, r) => sum + r.ms, 0) ?? 0;

  return (
    <section className="rounded-xl border border-hairline bg-surface p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-sm font-semibold text-ink">Foundation checks</h2>
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="rounded-xl border border-hairline bg-surface-raised px-3 py-1.5 text-xs font-medium text-muted shadow-sm transition hover:border-accent/50 hover:bg-accent/10 hover:text-accent disabled:opacity-50"
        >
          {running ? 'Running…' : 'Re-run'}
        </button>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Exercises the live storage adapter end to end — CRUD, undo-delete, archive, bulk edits, corrupt-data
        recovery, concurrent writes, an IndexedDB blob round-trip, the attachment cascade (files survive
        archive and undo-delete, and go with the record on permanent delete) and the backup round-trip (export
        → empty → import restores the records and the file bytes, and a second import adds nothing). Runs
        against its own isolated key, so your own data is never touched.
      </p>

      {error && (
        <p className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 font-mono text-xs text-rose-800 dark:text-rose-200">{error}</p>
      )}

      {results && !error && (
        <>
          <p className="mt-3 text-xs text-muted">
            <span className={failed === 0 ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'font-semibold text-rose-700 dark:text-rose-300'}>
              {passed}/{results.length} passed
            </span>
            {failed > 0 && <span className="ml-1 text-rose-700 dark:text-rose-300">· {failed} failed</span>}
            <span className="ml-1 text-faint">in {totalMs} ms</span>
          </p>

          <ul className="mt-3 divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
            {results.map((check) => (
              <li key={check.name} className="flex items-start gap-2.5 bg-surface-raised/60 px-3 py-2">
                <span aria-hidden className="mt-0.5 w-4 shrink-0 text-center font-mono text-xs">
                  {check.ok ? (check.skipped ? '·' : '✓') : '✗'}
                </span>
                <span className={`min-w-0 flex-1 text-xs leading-relaxed ${check.ok ? 'text-muted' : 'text-rose-800 dark:text-rose-200'}`}>
                  <span className="font-medium text-ink">{check.name}</span>
                  <span className="mx-1.5 text-faint">—</span>
                  {check.detail}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-faint">{check.skipped ? '—' : `${check.ms}ms`}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
