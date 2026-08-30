import { useCallback, useEffect, useState } from 'react';
import { ApplicationForm } from './components/ApplicationForm';
import { ApplicationList } from './components/ApplicationList';
import { ArchivedList } from './components/ArchivedList';
import { FilterBar } from './components/FilterBar';
import { KanbanBoard } from './components/KanbanBoard';
import { SelfTestPanel } from './components/SelfTestPanel';
import { UpcomingDashboard } from './components/UpcomingDashboard';
import { archivedRows, countArchived } from './lib/archive';
import { saveStagedAttachments } from './lib/attachments';
import { draftToInput, type ApplicationFormDraft } from './lib/form';
import { applyQuery, DEFAULT_FILTERS, filterToQuery, type FilterState } from './lib/query';
import { getStorage } from './lib/storage';
import type { ApplicationStatus, JobApplication } from './lib/types';

type ViewMode = 'list' | 'board' | 'upcoming' | 'archived';

/**
 * Part 9: archive, restore & permanent delete. The list's Delete became
 * Archive (with the plan's exact "restore it later from the Archived tab"
 * confirmation), and an Archived tab shows those rows with Restore and
 * "Delete permanently" — the one action that removes the record AND its files,
 * via `getStorage().purge`. An "N archived" count sits next to the filters.
 *
 * The store snapshot is now `records.all()` so both the live rows and the
 * archived rows come from one read; `applyQuery` derives the visible list and
 * the board's match set, `archivedRows` feeds the Archived tab. Archive and
 * soft delete never touch files — only `purge` cascades them.
 */
export default function App() {
  const storage = getStorage();
  const [rows, setRows] = useState<JobApplication[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('list');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<JobApplication | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      // Part 9: everything, unfiltered — the live rows, the archived rows and
      // the "N archived" count all come from this one snapshot.
      const list = await storage.records.all();
      setRows(list);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [storage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Part 4: both views derive from the same store snapshot — the list shows
  // the filtered+sorted rows, the board dims the rows that did not match.
  const listRows = rows === null ? [] : applyQuery(rows, filterToQuery(filters));
  const matchIds = new Set(listRows.map((r) => r.id));

  // Live rows (non-archived, non-deleted, most recently updated first) feed the
  // board, the Upcoming dashboard and the filter option lists. Archived rows
  // feed the Archived tab and the "N archived" count.
  const liveRows = rows === null ? [] : applyQuery(rows, {});
  const archived = rows === null ? [] : archivedRows(rows);
  const archivedCount = rows === null ? 0 : countArchived(rows);

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
      // `draftToInput` deliberately excludes draft.files: a record never references
      // a file (no `attachmentIds` field — files are keyed by application id).
      const input = draftToInput(draft);
      const saved = editing
        ? await storage.records.update(editing.id, input)
        : await storage.records.create(input);
      // Part 5: staged files are written only now that the record has an id to be
      // keyed to. Saving them earlier would orphan blobs for a row that may never
      // be created (a validation failure or a closed dialog), and nothing would
      // ever cascade them away.
      await saveStagedAttachments(saved.id, draft.files);
      setFormOpen(false);
      setEditing(null);
      await reload();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(row: JobApplication, status: ApplicationStatus) {
    if (status === row.status) return;
    try {
      await storage.records.update(row.id, { status });
      await reload();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleArchive(row: JobApplication) {
    // The plan's exact, non-permanent wording: archive is reversible, and the
    // Archived tab is where it comes back. Files are untouched.
    if (!window.confirm('Archive this application? You can restore it later from the Archived tab.')) return;
    try {
      await storage.records.setArchived(row.id, true);
      await reload();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRestore(row: JobApplication) {
    try {
      await storage.records.setArchived(row.id, false);
      await reload();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDeletePermanent(row: JobApplication) {
    const label = [row.companyName, row.jobTitle].filter(Boolean).join(' — ') || 'this application';
    if (
      !window.confirm(
        `Delete ${label} permanently? This removes the record and its attachments — it cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      // THE one cascade path: record + files, via purgeApplication.
      await storage.purge(row.id);
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
            <p className="text-xs text-slate-400">
              Part 9 of 12 — archive, restore &amp; permanent delete
            </p>
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
          <>
            <div className="flex w-fit rounded-lg border border-hairline bg-surface p-0.5" role="tablist" aria-label="View">
              {(
                [
                  ['list', 'List View'],
                  ['board', 'Board View'],
                  ['upcoming', 'Upcoming'],
                  ['archived', 'Archived'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={view === mode}
                  onClick={() => setView(mode)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    view === mode ? 'bg-surface-raised text-slate-100' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {view === 'list' || view === 'board' ? (
              <div className="flex flex-wrap items-center gap-2">
                <FilterBar rows={liveRows} filters={filters} onChange={setFilters} />
                <button
                  type="button"
                  onClick={() => setView('archived')}
                  title="View the Archived tab"
                  className="rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-sky-500/50 hover:text-slate-100"
                >
                  {archivedCount} archived
                </button>
              </div>
            ) : null}

            {view === 'list' ? (
              <ApplicationList
                rows={listRows}
                filtered={liveRows.length > 0}
                onRowClick={openEdit}
                onArchive={(row) => void handleArchive(row)}
              />
            ) : view === 'board' ? (
              <KanbanBoard
                rows={liveRows}
                matchIds={matchIds}
                onStatusChange={(row, status) => void handleStatusChange(row, status)}
                onCardClick={openEdit}
              />
            ) : view === 'upcoming' ? (
              <UpcomingDashboard rows={liveRows} onOpen={openEdit} />
            ) : (
              <ArchivedList
                rows={archived}
                onRestore={(row) => void handleRestore(row)}
                onDeletePermanent={(row) => void handleDeletePermanent(row)}
              />
            )}
          </>
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
        liveRows={liveRows}
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
