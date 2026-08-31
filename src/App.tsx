import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ApplicationForm } from './components/ApplicationForm';
import { ApplicationList } from './components/ApplicationList';
import { ArchivedList } from './components/ArchivedList';
import { DataMenu } from './components/DataMenu';
import { FilterBar } from './components/FilterBar';
import { KanbanBoard } from './components/KanbanBoard';
import { SelfTestPanel } from './components/SelfTestPanel';
import { ToastHost } from './components/ToastHost';
import { UpcomingDashboard } from './components/UpcomingDashboard';
import { archivedRows, countArchived } from './lib/archive';
import { saveStagedAttachments } from './lib/attachments';
import {
  bulkArchiveConfirm,
  bulkPurgeConfirm,
  mergeTagIntoTags,
  rowsToChangeStatus,
  rowsToTag,
} from './lib/bulk';
import { draftToInput, type ApplicationFormDraft } from './lib/form';
import { applyQuery, DEFAULT_FILTERS, filterToQuery, type FilterState } from './lib/query';
import { getStorage } from './lib/storage';
import type { ThemeMode } from './lib/storage/adapter';
import { pushToast } from './lib/toast';
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
 *
 * Part 10 adds multi-select to both tables: bulk status/tag/archive on the
 * live list (status/tag everywhere, archive confirmed with its count), and
 * bulk permanent delete on the Archived tab — `bulkPurge` loops the one
 * `purgeApplication` cascade rather than growing a second delete path.
 *
 * Part 11 adds the header's Data menu: a JSON backup (every row plus every
 * attached file, base64'd) and a CSV of the structured fields, and an import that
 * merges — never wipes — through the same `records.create` / `attachments.add`
 * seams the add form uses. Export reads the unfiltered `records.all()` snapshot,
 * so the Archived tab and the undo window are in the backup too.
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
  const [theme, setTheme] = useState<ThemeMode>('dark');

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

  // Part 12 visual pass: the theme lives in the settings seam, never localStorage
  // directly. Legacy settings documents without `theme` resolve to dark.
  useEffect(() => {
    let cancelled = false;
    void storage.settings
      .get()
      .then((settings) => {
        if (!cancelled) setTheme(settings.theme);
      })
      .catch(() => {
        if (!cancelled) setTheme('dark');
      });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
    root.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', theme === 'dark' ? '#0b0f16' : '#f6f7fb');
  }, [theme]);

  async function toggleTheme() {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      await storage.settings.set({ theme: next });
      pushToast(next === 'dark' ? 'Dark theme enabled.' : 'Light theme enabled.');
    } catch (err) {
      setTheme(next === 'dark' ? 'light' : 'dark');
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }

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
      pushToast(editing ? 'Application updated.' : 'Application saved.');
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
      pushToast(`${row.companyName || 'Application'} moved to ${status}.`);
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
      pushToast(`${row.companyName || 'Application'} archived.`);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRestore(row: JobApplication) {
    try {
      await storage.records.setArchived(row.id, false);
      await reload();
      pushToast(`${row.companyName || 'Application'} restored.`);
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
      pushToast(`${label} permanently deleted.`);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }

  // --- Part 10: bulk actions. Each applies to every ticked row, reloads the
  // snapshot, and returns whether the selection should be cleared (false on a
  // declined confirmation or a failed write, so the user's ticks survive). ---

  async function handleBulkStatus(ids: readonly string[], status: ApplicationStatus): Promise<boolean> {
    if (rows === null) return false;
    // Skip rows already in that stage: no pointless updatedAt stamps.
    const targets = rowsToChangeStatus(
      rows.filter((r) => ids.includes(r.id)),
      status,
    );
    if (targets.length === 0) return true;
    try {
      await storage.records.bulkPatch(
        targets.map((r) => r.id),
        { status },
      );
      await reload();
      pushToast(`${targets.length} application${targets.length === 1 ? '' : 's'} moved to ${status}.`);
      return true;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  async function handleBulkTag(ids: readonly string[], tag: string): Promise<boolean> {
    if (rows === null || !tag.trim()) return false;
    // Per-row merge: a bulk tag appends to each row's existing tags (case-
    // insensitive dedupe), and rows that already have it are skipped entirely.
    const targets = rowsToTag(
      rows.filter((r) => ids.includes(r.id)),
      tag,
    );
    if (targets.length === 0) return true;
    try {
      for (const row of targets) {
        await storage.records.update(row.id, { tags: mergeTagIntoTags(row.tags, tag) });
      }
      await reload();
      pushToast(`Added “${tag.trim()}” to ${targets.length} application${targets.length === 1 ? '' : 's'}.`);
      return true;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  async function handleBulkArchive(ids: readonly string[]): Promise<boolean> {
    if (ids.length === 0) return false;
    if (!window.confirm(bulkArchiveConfirm(ids.length))) return false;
    try {
      await storage.records.bulkPatch(ids, { isArchived: true });
      await reload();
      pushToast(`${ids.length} application${ids.length === 1 ? '' : 's'} archived.`);
      return true;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  async function handleBulkPurge(ids: readonly string[]): Promise<boolean> {
    if (ids.length === 0) return false;
    // Confirmation states the count; the cascade is the same purgeApplication
    // path as single permanent delete, looped once per id by bulkPurge.
    if (!window.confirm(bulkPurgeConfirm(ids.length))) return false;
    try {
      await storage.bulkPurge(ids);
      await reload();
      pushToast(`${ids.length} application${ids.length === 1 ? '' : 's'} permanently deleted.`);
      return true;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-hairline bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3 sm:gap-3 sm:px-5 sm:py-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-lg text-white shadow-sm">
            📋
          </div>
          <div className="mr-auto min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-ink">Job Application Tracker</h1>
            <p className="hidden text-xs text-muted sm:block">
              Part 12 of 12 — polished, responsive, and local-first
            </p>
          </div>
          <div className="hidden md:inline-flex">
            <DriverBadge driver={storage.driver} />
          </div>
          <DataMenu onImported={() => void reload()} />
          <button
            type="button"
            onClick={() => void toggleTheme()}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-hairline bg-surface px-2.5 text-xs font-medium text-muted transition hover:border-accent/50 hover:text-accent"
          >
            <span aria-hidden>{theme === 'dark' ? '☀️' : '🌙'}</span>
            <span className="hidden sm:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="gradient-accent inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm font-semibold shadow-md"
          >
            Add <span className="hidden sm:inline">Application</span>
          </button>
        </div>
      </header>

      <main className="mx-auto flex min-w-0 max-w-6xl flex-col gap-5 px-4 py-5 pb-28 sm:px-5 sm:py-6 sm:pb-10">
        {loadError ? (
          <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 font-mono text-xs text-red-800 dark:text-red-200">
            {loadError}
          </p>
        ) : null}

        {rows === null ? (
          <p className="text-sm text-faint">Loading…</p>
        ) : (
          <>
            <div
              className="hidden w-fit rounded-xl border border-hairline bg-surface p-0.5 shadow-sm sm:flex"
              role="tablist"
              aria-label="View"
            >
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
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    view === mode ? 'bg-surface-raised text-ink shadow-sm' : 'text-muted hover:text-ink'
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
                  className="rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-muted shadow-sm hover:border-accent/50 hover:text-accent"
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
                onAdd={openAdd}
                onArchive={(row) => void handleArchive(row)}
                onBulkStatus={(ids, status) => handleBulkStatus(ids, status)}
                onBulkTag={(ids, tag) => handleBulkTag(ids, tag)}
                onBulkArchive={(ids) => handleBulkArchive(ids)}
              />
            ) : view === 'board' ? (
              <KanbanBoard
                rows={liveRows}
                matchIds={matchIds}
                onStatusChange={(row, status) => void handleStatusChange(row, status)}
                onCardClick={openEdit}
                onAdd={openAdd}
              />
            ) : view === 'upcoming' ? (
              <UpcomingDashboard rows={liveRows} onOpen={openEdit} />
            ) : (
              <ArchivedList
                rows={archived}
                onRestore={(row) => void handleRestore(row)}
                onDeletePermanent={(row) => void handleDeletePermanent(row)}
                onBulkStatus={(ids, status) => handleBulkStatus(ids, status)}
                onBulkTag={(ids, tag) => handleBulkTag(ids, tag)}
                onBulkPurge={(ids) => handleBulkPurge(ids)}
              />
            )}
          </>
        )}

        <details className="rounded-xl border border-hairline bg-surface shadow-sm">
          <summary className="cursor-pointer px-5 py-3 text-xs text-muted hover:text-ink">
            Foundation checks
          </summary>
          <div className="border-t border-hairline px-1 pb-1">
            <SelfTestPanel />
          </div>
        </details>
      </main>

      <MobileBottomNav view={view} archivedCount={archivedCount} onNavigate={setView} />
      <ApplicationForm
        open={formOpen}
        initial={editing}
        liveRows={liveRows}
        saving={saving}
        onClose={closeForm}
        onSave={handleSave}
      />
      <ToastHost />
    </div>
  );
}

function DriverBadge({ driver }: { driver: 'local' | 'rest' }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-raised px-2.5 py-1 text-[11px] font-medium text-muted"
      title={driver === 'local' ? 'localStorage + IndexedDB, this browser only' : 'Remote API'}
    >
      <span className={`size-1.5 rounded-full ${driver === 'local' ? 'bg-green-400' : 'bg-blue-400'}`} />
      {driver === 'local' ? 'local storage' : 'remote API'}
    </span>
  );
}

const MOBILE_NAV_ITEMS: readonly {
  mode: ViewMode;
  label: string;
  icon: ReactNode;
}[] = [
  {
    mode: 'list',
    label: 'Pipeline',
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" d="M4 4.5h12M4 7.5h12M4 10.5h12M4 13.5h12" />
      </svg>
    ),
  },
  {
    mode: 'board',
    label: 'Board',
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3" y="3.5" width="5.5" height="13" rx="1.5" />
        <rect x="11.5" y="3.5" width="5.5" height="13" rx="1.5" />
      </svg>
    ),
  },
  {
    mode: 'upcoming',
    label: 'Upcoming',
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
        <path strokeLinecap="round" d="M6.5 3.5v2M13.5 3.5v2M3.5 9h13" />
      </svg>
    ),
  },
  {
    mode: 'archived',
    label: 'Archived',
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 6.5h14M4.5 6.5l.8 8.6a1.6 1.6 0 0 0 1.6 1.4h6.2a1.6 1.6 0 0 0 1.6-1.4l.8-8.6M8 10h4" />
      </svg>
    ),
  },
];

function MobileBottomNav({
  view,
  archivedCount,
  onNavigate,
}: {
  view: ViewMode;
  archivedCount: number;
  onNavigate: (mode: ViewMode) => void;
}) {
  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface/95 px-2 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:hidden"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-between gap-1">
        {MOBILE_NAV_ITEMS.map((item) => {
          const active = view === item.mode;
          return (
            <button
              key={item.mode}
              type="button"
              onClick={() => onNavigate(item.mode)}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium transition ${
                active ? 'bg-accent/10 text-accent' : 'text-muted hover:text-accent'
              }`}
            >
              {item.icon}
              <span className="truncate">
                {item.label}
                {item.mode === 'archived' && archivedCount > 0 ? ` · ${archivedCount}` : ''}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
