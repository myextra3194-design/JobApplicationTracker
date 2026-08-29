import { useEffect, useRef, useState } from 'react';
import {
  collectPortals,
  collectTags,
  DEFAULT_FILTERS,
  hasActiveFilters,
  type FilterState,
  type SortKey,
} from '../lib/query';
import { STATUSES, type JobApplication } from '../lib/types';

/** The plan's list-sort options; 'Recently updated' is the unchanged default. */
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'updatedAt', label: 'Recently updated' },
  { key: 'applicationDate', label: 'Application date' },
  { key: 'followUpDate', label: 'Follow-up date' },
  { key: 'interviewDate', label: 'Interview date' },
  { key: 'companyName', label: 'Company name' },
];

interface FilterBarProps {
  /** Live rows — the source of the portal and tag options. */
  rows: JobApplication[];
  filters: FilterState;
  onChange: (next: FilterState) => void;
}

/**
 * Part 4 toolbar: search as you type, multi-select status and tags, a portal
 * filter, sort with direction, and "Clear filters". Every control maps onto
 * `filterToQuery` — the list hides non-matching rows, the board dims them;
 * search and filters combine with AND.
 */
export function FilterBar({ rows, filters, onChange }: FilterBarProps) {
  const portals = collectPortals(rows).map((p) => p.portal);
  const tags = collectTags(rows).map((t) => t.tag);
  const active = hasActiveFilters(filters);

  function patch(next: Partial<FilterState>): void {
    onChange({ ...filters, ...next });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={filters.search}
        onChange={(e) => patch({ search: e.target.value })}
        placeholder="Search company or job title…"
        aria-label="Search company or job title"
        className="min-w-44 flex-1 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
      />

      <MultiSelect
        label={filters.statuses.length === 0 ? 'Status' : `Status · ${filters.statuses.length}`}
        options={[...STATUSES]}
        selected={filters.statuses}
        onToggle={(value) => patch({ statuses: toggleIn(filters.statuses, value) })}
      />

      <label className="flex items-center gap-1.5 text-xs text-slate-400">
        <span className="hidden sm:inline">Portal</span>
        <select
          value={filters.jobPortal}
          onChange={(e) => patch({ jobPortal: e.target.value })}
          aria-label="Filter by job portal"
          className="max-w-36 rounded-lg border border-hairline bg-surface px-2 py-1.5 text-xs text-slate-200"
        >
          <option value="">All portals</option>
          {portals.map((portal) => (
            <option key={portal} value={portal}>
              {portal}
            </option>
          ))}
        </select>
      </label>

      <MultiSelect
        label={filters.tags.length === 0 ? 'Tags' : `Tags · ${filters.tags.length}`}
        options={tags}
        selected={filters.tags}
        onToggle={(value) => patch({ tags: toggleIn(filters.tags, value) })}
      />

      <label className="flex items-center gap-1.5 text-xs text-slate-400">
        <span className="hidden sm:inline">Sort</span>
        <select
          value={filters.sortKey}
          onChange={(e) => patch({ sortKey: e.target.value as SortKey })}
          aria-label="Sort by"
          className="rounded-lg border border-hairline bg-surface px-2 py-1.5 text-xs text-slate-200"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => patch({ sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' })}
        title={
          filters.sortDir === 'asc'
            ? 'Ascending — tap for descending'
            : 'Descending — tap for ascending'
        }
        className="rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-sky-500/50 hover:text-slate-100"
      >
        {filters.sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
      </button>

      <button
        type="button"
        onClick={() => onChange({ ...DEFAULT_FILTERS })}
        disabled={!active}
        title={active ? 'Reset search, filters and sort' : 'Nothing to clear yet'}
        className="rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-red-500/50 hover:text-red-300 disabled:cursor-default disabled:opacity-40 disabled:hover:border-hairline disabled:hover:text-slate-300"
      >
        Clear filters
      </button>
    </div>
  );
}

function toggleIn<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Small checkbox dropdown (no component library): a button that shows how
 * many options are selected, opening a scrollable list of checkboxes. Closes
 * on outside tap, Escape, or the button itself.
 */
function MultiSelect<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: T[];
  selected: T[];
  onToggle: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: globalThis.PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
          selected.length > 0
            ? 'border-sky-500/50 bg-sky-500/10 text-sky-200'
            : 'border-hairline bg-surface text-slate-300 hover:border-sky-500/50'
        }`}
      >
        {label} ▾
      </button>
      {open ? (
        <div className="absolute left-0 z-20 mt-1 max-h-64 w-48 overflow-y-auto rounded-lg border border-hairline bg-surface-raised p-1 shadow-xl">
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-[11px] text-slate-500">Nothing to filter on yet</p>
          ) : (
            options.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-200 hover:bg-surface"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={() => onToggle(option)}
                  className="accent-sky-500"
                />
                <span className="truncate">{option}</span>
              </label>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
