import { useCallback, useEffect, useState } from 'react';
import { ApplicationForm } from './components/ApplicationForm';
import { ApplicationList } from './components/ApplicationList';
import { SelfTestPanel } from './components/SelfTestPanel';
import { draftToInput, type ApplicationFormDraft } from './lib/form';
import { getStorage } from './lib/storage';
import type { JobApplication } from './lib/types';

/**
 * Part 2: list of live (non-archived) applications, plus add / edit / delete.
 * Mutations go through getStorage(); the list reloads immediately after each one.
 */
export default function App() {
  const storage = getStorage();
  const [rows, setRows] = useState<JobApplication[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<JobApplication | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      const list = await storage.records.list();
      setRows(list);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [storage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(row: JobApplication) {
    setEditing(row);
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditing(null);
  }

  async function handleSave(draft: ApplicationFormDraft) {
    setSaving(true);
    try {
      const input = draftToInput(draft);
      if (editing) {
        await storage.records.update(editing.id, input);
      } else {
        await storage.records.create(input);
      }
      setFormOpen(false);
      setEditing(null);
      await reload();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: JobApplication) {
    const label = [row.companyName, row.jobTitle].filter(Boolean).join(' — ') || 'this application';
    if (!window.confirm(`Delete ${label}?`)) return;
    try {
      await storage.records.remove(row.id);
      await reload();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="min-h-screen bg-canvas text-slate-200">
      <header className="border-b border-hairline bg-surface/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-4">
          <div className="flex size-9 items-center justify-center rounded-lg bg-blue-500/15 text-lg">📋</div>
          <div className="mr-auto">
            <h1 className="text-base font-semibold tracking-tight text-slate-50">Job Application Tracker</h1>
            <p className="text-xs text-slate-400">Part 2 of 12 — list, add, edit, delete</p>
          </div>
          <DriverBadge driver={storage.driver} />
          <button
            type="button"
            onClick={openAdd}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            Add Application
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-6">
        {loadError ? (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 font-mono text-xs text-red-200">
            {loadError}
          </p>
        ) : null}

        {rows === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <ApplicationList rows={rows} onRowClick={openEdit} onDelete={(row) => void handleDelete(row)} />
        )}

        <details className="rounded-xl border border-hairline bg-surface">
          <summary className="cursor-pointer px-5 py-3 text-xs text-slate-500 hover:text-slate-300">
            Foundation checks
          </summary>
          <div className="border-t border-hairline px-1 pb-1">
            <SelfTestPanel />
          </div>
        </details>
      </main>

      <ApplicationForm
        open={formOpen}
        initial={editing}
        saving={saving}
        onClose={closeForm}
        onSave={handleSave}
      />
    </div>
  );
}

function DriverBadge({ driver }: { driver: 'local' | 'rest' }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-raised px-2.5 py-1 text-[11px] font-medium text-slate-300"
      title={driver === 'local' ? 'localStorage + IndexedDB, this browser only' : 'Remote API'}
    >
      <span className={`size-1.5 rounded-full ${driver === 'local' ? 'bg-green-400' : 'bg-blue-400'}`} />
      {driver === 'local' ? 'local storage' : 'remote API'}
    </span>
  );
}
