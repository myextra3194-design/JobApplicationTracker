import { useState } from 'react';
import { STATUSES, type ApplicationStatus } from '../lib/types';

interface BulkActionBarProps {
  /** How many rows the checkboxes currently mark. */
  selectedCount: number;
  onStatusChange: (status: ApplicationStatus) => void;
  onAddTag: (tag: string) => void;
  /** List View only: bulk archive (with its confirmation). */
  onArchive?: () => void;
  /** Archived tab only: bulk permanent delete — the cascade path (confirmed). */
  onPurge?: () => void;
}

/**
 * Part 10: the small action bar that appears above a table once one or more
 * rows are ticked. "Change status to…" and "Add tag…" are available on both
 * the list and the Archived tab; "Archive selected" only on the live list,
 * and "Delete selected permanently" only on the Archived tab (the plan's
 * gating). Every action applies to the whole selection and clears it.
 */
export function BulkActionBar({
  selectedCount,
  onStatusChange,
  onAddTag,
  onArchive,
  onPurge,
}: BulkActionBarProps) {
  const [tag, setTag] = useState('');

  function submitTag(): void {
    const value = tag.trim();
    if (!value) return;
    onAddTag(value);
    setTag('');
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-accent/40 bg-accent/10 px-3.5 py-2.5 shadow-sm">
      <span className="mr-1 shrink-0 text-xs font-semibold text-accent" aria-live="polite">
        {selectedCount} selected
      </span>

      <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted sm:flex-none">
        <span className="hidden lg:inline">Change status to…</span>
        <select
          value=""
          aria-label="Change status of selected applications"
          onChange={(event) => {
            if (event.target.value) onStatusChange(event.target.value as ApplicationStatus);
          }}
          className="w-full rounded-xl border border-hairline bg-surface px-2 py-1.5 text-xs text-ink shadow-sm sm:w-auto"
        >
          <option value="" disabled>
            Change status to…
          </option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>

      <span className="flex min-w-0 flex-1 items-center gap-1 sm:flex-none">
        <input
          type="text"
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submitTag();
            }
          }}
          placeholder="Add tag…"
          aria-label="Add a tag to selected applications"
          className="w-32 min-w-0 flex-1 rounded-xl border border-hairline bg-surface px-2 py-1.5 text-xs text-ink shadow-sm placeholder:text-faint"
        />
        <button
          type="button"
          onClick={submitTag}
          disabled={!tag.trim()}
          className="rounded-xl border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-muted shadow-sm transition hover:border-accent/50 hover:text-accent disabled:cursor-default disabled:opacity-40 disabled:hover:border-hairline disabled:hover:text-muted"
        >
          Add tag
        </button>
      </span>

      {onArchive ? (
        <button
          type="button"
          onClick={onArchive}
          className="rounded-xl border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-muted shadow-sm transition hover:border-amber-500/50 hover:text-amber-700 dark:hover:text-amber-200"
        >
          Archive selected
        </button>
      ) : null}

      {onPurge ? (
        <button
          type="button"
          onClick={onPurge}
          className="rounded-xl border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-500/20 dark:text-red-300"
        >
          Delete selected permanently
        </button>
      ) : null}
    </div>
  );
}
