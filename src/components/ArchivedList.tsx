import { BulkActionBar } from './BulkActionBar';
import { MobileSelectAll } from './MobileSelectAll';
import { StatusChip } from './StatusChip';
import { TagChip } from './TagChip';
import { useRowSelection } from './useRowSelection';
import type { ApplicationStatus, JobApplication } from '../lib/types';

interface ArchivedListProps {
  /** Already-filtered archived rows (see `archivedRows` in `lib/archive.ts`). */
  rows: JobApplication[];
  onRestore: (row: JobApplication) => void;
  onDeletePermanent: (row: JobApplication) => void;
  /** Part 10: bulk actions over the ticked rows. Returning true clears the selection. */
  onBulkStatus: (ids: readonly string[], status: ApplicationStatus) => Promise<boolean> | boolean;
  onBulkTag: (ids: readonly string[], tag: string) => Promise<boolean> | boolean;
  onBulkPurge: (ids: readonly string[]) => Promise<boolean> | boolean;
}

function dash(value: string | null): string {
  return value ? value : '—';
}

/**
 * Part 9: the Archived tab. Every row here can come back with Restore (files
 * and all — archive never touched them), or go for good with "Delete
 * permanently", which is the one path that cascades the attachments away via
 * `getStorage().purge`.
 *
 * Part 10: rows multi-select with checkboxes; the bulk bar here shows status,
 * tag and "Delete selected permanently" — archived rows are already archived,
 * so the plan gates bulk archive to the live list view.
 */
export function ArchivedList({
  rows,
  onRestore,
  onDeletePermanent,
  onBulkStatus,
  onBulkTag,
  onBulkPurge,
}: ArchivedListProps) {
  const selection = useRowSelection(rows);

  async function runBulk(action: (ids: readonly string[]) => Promise<boolean> | boolean): Promise<void> {
    const ids = [...selection.selectedIds];
    if (ids.length === 0) return;
    if (await action(ids)) selection.clear();
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-hairline bg-surface px-4 py-12 text-center">
        <p className="text-sm font-medium text-slate-200">No archived applications</p>
        <p className="max-w-md text-xs text-slate-500">
          Archived applications stay out of your active pipeline and can be restored whenever you need them.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <MobileSelectAll
        count={selection.count}
        allSelected={selection.allSelected}
        someSelected={selection.someSelected}
        onToggleAll={selection.toggleAll}
        label="archived applications"
      />
      {selection.count > 0 ? (
        <BulkActionBar
          selectedCount={selection.count}
          onStatusChange={(status) => void runBulk((ids) => onBulkStatus(ids, status))}
          onAddTag={(tag) => void runBulk((ids) => onBulkTag(ids, tag))}
          onPurge={() => void runBulk((ids) => onBulkPurge(ids))}
        />
      ) : null}

      <div className="flex flex-col gap-2 sm:hidden">
        {rows.map((row) => (
          <ArchivedCard
            key={row.id}
            row={row}
            checked={selection.selectedIds.has(row.id)}
            onToggle={() => selection.toggle(row.id)}
            onRestore={onRestore}
            onDeletePermanent={onDeletePermanent}
          />
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-hairline bg-surface sm:block">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-hairline text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2" scope="col">
                <input
                  type="checkbox"
                  checked={selection.allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = selection.someSelected;
                  }}
                  onChange={selection.toggleAll}
                  aria-label={selection.allSelected ? 'Deselect all archived applications' : 'Select all archived applications'}
                  className="size-4 accent-sky-500"
                />
              </th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Job Title</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Applied Date</th>
              <th className="px-3 py-2 font-medium">Archived</th>
              <th className="px-3 py-2 font-medium">Tags</th>
              <th className="px-3 py-2 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const checked = selection.selectedIds.has(row.id);
              return (
                <tr
                  key={row.id}
                  className={`border-b border-hairline last:border-b-0 hover:bg-surface-raised/60 ${
                    checked ? 'bg-sky-500/10' : ''
                  }`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => selection.toggle(row.id)}
                      aria-label={`Select ${row.companyName || row.jobTitle || row.id}`}
                      className="size-4 accent-sky-500"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-100">{row.companyName || '—'}</td>
                  <td className="px-3 py-2 text-slate-300">{row.jobTitle || '—'}</td>
                  <td className="px-3 py-2"><StatusChip status={row.status} /></td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">{dash(row.applicationDate)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">{row.updatedAt.slice(0, 10)}</td>
                  <td className="px-3 py-2"><TagList tags={row.tags} /></td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onRestore(row)}
                        className="whitespace-nowrap rounded-md px-2 py-1 text-xs text-sky-300 transition hover:bg-sky-500/10 hover:text-sky-200"
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeletePermanent(row)}
                        className="whitespace-nowrap rounded-md px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/10"
                      >
                        Delete permanently
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ArchivedCard({
  row,
  checked,
  onToggle,
  onRestore,
  onDeletePermanent,
}: {
  row: JobApplication;
  checked: boolean;
  onToggle: () => void;
  onRestore: (row: JobApplication) => void;
  onDeletePermanent: (row: JobApplication) => void;
}) {
  return (
    <article className={`rounded-xl border border-hairline bg-surface p-3 shadow-sm ${checked ? 'border-sky-500/50 bg-sky-500/10' : ''}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`Select ${row.companyName || row.jobTitle || row.id}`}
          className="mt-1 size-4 shrink-0 accent-sky-500"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-slate-50">{row.companyName || '—'}</h2>
              <p className="truncate text-xs text-slate-400">{row.jobTitle || '—'}</p>
            </div>
            <StatusChip status={row.status} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-hairline pt-2 text-[11px]">
            <p className="text-slate-500">Applied <span className="font-mono text-slate-300">{dash(row.applicationDate)}</span></p>
            <p className="text-slate-500">Archived <span className="font-mono text-slate-300">{row.updatedAt.slice(0, 10)}</span></p>
          </div>
          {row.tags.length > 0 ? <div className="mt-2"><TagList tags={row.tags} /></div> : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-1 border-t border-hairline pt-2">
        <button
          type="button"
          onClick={() => onRestore(row)}
          className="rounded-md px-2 py-1 text-xs text-sky-300 transition hover:bg-sky-500/10 hover:text-sky-200"
        >
          Restore
        </button>
        <button
          type="button"
          onClick={() => onDeletePermanent(row)}
          className="rounded-md px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/10"
        >
          Delete permanently
        </button>
      </div>
    </article>
  );
}

function TagList({ tags }: { tags: readonly string[] }) {
  if (tags.length === 0) return <span className="text-slate-600">—</span>;
  return <div className="flex flex-wrap gap-1">{tags.map((tag) => <TagChip key={tag} tag={tag} />)}</div>;
}
