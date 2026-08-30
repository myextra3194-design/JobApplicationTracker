import { BulkActionBar } from './BulkActionBar';
import { useRowSelection } from './useRowSelection';
import { STATUS_TONE } from '../lib/pipeline';
import { previewText } from '../lib/preview';
import type { ApplicationStatus, JobApplication } from '../lib/types';

interface ApplicationListProps {
  rows: JobApplication[];
  /** True when rows is the search/filter result rather than the whole collection. */
  filtered?: boolean;
  onRowClick: (row: JobApplication) => void;
  /** Part 9: the list archives instead of deleting — restore lives on the Archived tab. */
  onArchive: (row: JobApplication) => void;
  /** Part 10: bulk actions over the ticked rows. Returning true clears the selection. */
  onBulkStatus: (ids: readonly string[], status: ApplicationStatus) => Promise<boolean> | boolean;
  onBulkTag: (ids: readonly string[], tag: string) => Promise<boolean> | boolean;
  onBulkArchive: (ids: readonly string[]) => Promise<boolean> | boolean;
}

function dash(value: string | null): string {
  return value ? value : '—';
}

export function ApplicationList({
  rows,
  filtered = false,
  onRowClick,
  onArchive,
  onBulkStatus,
  onBulkTag,
  onBulkArchive,
}: ApplicationListProps) {
  const selection = useRowSelection(rows);

  async function runBulk(action: (ids: readonly string[]) => Promise<boolean> | boolean): Promise<void> {
    const ids = [...selection.selectedIds];
    if (ids.length === 0) return;
    if (await action(ids)) selection.clear();
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-hairline bg-surface px-4 py-10 text-center text-sm text-slate-400">
        {filtered
          ? 'No applications match your search or filters — clear them to see everything.'
          : 'No applications yet — add your first one.'}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {selection.count > 0 ? (
        <BulkActionBar
          selectedCount={selection.count}
          onStatusChange={(status) => void runBulk((ids) => onBulkStatus(ids, status))}
          onAddTag={(tag) => void runBulk((ids) => onBulkTag(ids, tag))}
          onArchive={() => void runBulk((ids) => onBulkArchive(ids))}
        />
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-hairline bg-surface">
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
                  aria-label={selection.allSelected ? 'Deselect all applications' : 'Select all applications'}
                  className="size-4 accent-sky-500"
                />
              </th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Job Title</th>
              <th className="px-3 py-2 font-medium">Job Link</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Applied Date</th>
              <th className="px-3 py-2 font-medium">Follow-up Date</th>
              <th className="px-3 py-2 font-medium">Interview Date</th>
              <th className="px-3 py-2 font-medium">Notes</th>
              <th className="px-3 py-2 font-medium">Company Research</th>
              <th className="px-3 py-2 font-medium">Tags</th>
              <th className="px-3 py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const checked = selection.selectedIds.has(row.id);
              return (
                <tr
                  key={row.id}
                  onClick={() => onRowClick(row)}
                  className={`cursor-pointer border-b border-hairline last:border-b-0 hover:bg-surface-raised/80 ${
                    checked ? 'bg-sky-500/10' : ''
                  }`}
                >
                  <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
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
                  <td className="px-3 py-2">
                    {row.jobLink ? (
                      <a
                        href={row.jobLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={row.jobLink}
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded-md border border-hairline bg-surface-raised px-2 py-1 text-xs text-sky-300 hover:border-sky-500/50 hover:text-sky-200"
                      >
                        Open posting
                        <span aria-hidden>↗</span>
                      </a>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[row.status].chip}`}
                    >
                      <span className={`size-1.5 rounded-full ${STATUS_TONE[row.status].dot}`} />
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">{dash(row.applicationDate)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">{dash(row.followUpDate)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">{dash(row.interviewDate)}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {previewText(row.notes) || <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {previewText(row.companyResearch) || <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {row.tags.length === 0 ? (
                        <span className="text-slate-600">—</span>
                      ) : (
                        row.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-hairline bg-surface-raised px-1.5 py-0.5 text-[11px] text-slate-300"
                          >
                            {tag}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onArchive(row);
                      }}
                      className="rounded-md px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
                    >
                      Archive
                    </button>
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
