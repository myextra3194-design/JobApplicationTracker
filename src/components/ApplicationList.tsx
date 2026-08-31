import { BulkActionBar } from './BulkActionBar';
import { MobileSelectAll } from './MobileSelectAll';
import { StatusChip } from './StatusChip';
import { TagChip } from './TagChip';
import { useRowSelection } from './useRowSelection';
import { previewText } from '../lib/preview';
import type { ApplicationStatus, JobApplication } from '../lib/types';

interface ApplicationListProps {
  rows: JobApplication[];
  /** True when rows is the search/filter result rather than the whole collection. */
  filtered?: boolean;
  onRowClick: (row: JobApplication) => void;
  onAdd: () => void;
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
  onAdd,
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
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-hairline bg-surface px-4 py-12 text-center">
        <div>
          <p className="text-sm font-medium text-slate-200">
            {filtered ? 'No applications match your search or filters' : 'No applications yet — add your first one'}
          </p>
          {filtered ? (
            <p className="mt-1 text-xs text-slate-500">Clear the filters to see everything.</p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">Keep every opportunity, note and follow-up in one place.</p>
          )}
        </div>
        {!filtered ? (
          <button
            type="button"
            onClick={onAdd}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-500"
          >
            Add your first application
          </button>
        ) : null}
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
      />
      {selection.count > 0 ? (
        <BulkActionBar
          selectedCount={selection.count}
          onStatusChange={(status) => void runBulk((ids) => onBulkStatus(ids, status))}
          onAddTag={(tag) => void runBulk((ids) => onBulkTag(ids, tag))}
          onArchive={() => void runBulk((ids) => onBulkArchive(ids))}
        />
      ) : null}

      <div className="flex flex-col gap-2 sm:hidden">
        {rows.map((row) => (
          <ApplicationCard
            key={row.id}
            row={row}
            checked={selection.selectedIds.has(row.id)}
            onToggle={() => selection.toggle(row.id)}
            onRowClick={onRowClick}
            onArchive={onArchive}
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
                    <JobLink href={row.jobLink} />
                  </td>
                  <td className="px-3 py-2">
                    <StatusChip status={row.status} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">{dash(row.applicationDate)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">{dash(row.followUpDate)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">{dash(row.interviewDate)}</td>
                  <td className="max-w-44 px-3 py-2 text-xs text-slate-400">
                    <span className="block truncate" title={row.notes || undefined}>
                      {previewText(row.notes) || <span className="text-slate-600">—</span>}
                    </span>
                  </td>
                  <td className="max-w-44 px-3 py-2 text-xs text-slate-400">
                    <span className="block truncate" title={row.companyResearch || undefined}>
                      {previewText(row.companyResearch) || <span className="text-slate-600">—</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <TagList tags={row.tags} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onArchive(row);
                      }}
                      className="whitespace-nowrap rounded-md px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/10"
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

function ApplicationCard({
  row,
  checked,
  onToggle,
  onRowClick,
  onArchive,
}: {
  row: JobApplication;
  checked: boolean;
  onToggle: () => void;
  onRowClick: (row: JobApplication) => void;
  onArchive: (row: JobApplication) => void;
}) {
  return (
    <article
      className={`rounded-xl border border-hairline bg-surface p-3 shadow-sm transition hover:border-sky-500/40 ${
        checked ? 'border-sky-500/50 bg-sky-500/10' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`Select ${row.companyName || row.jobTitle || row.id}`}
          className="mt-1 size-4 shrink-0 accent-sky-500"
        />
        <button type="button" onClick={() => onRowClick(row)} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-slate-50">{row.companyName || '—'}</h2>
              <p className="truncate text-xs text-slate-400">{row.jobTitle || '—'}</p>
            </div>
            <StatusChip status={row.status} />
          </div>
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-hairline pt-2 text-[11px]">
        <p className="text-slate-500">Applied <span className="font-mono text-slate-300">{dash(row.applicationDate)}</span></p>
        <p className="text-slate-500">Follow-up <span className="font-mono text-slate-300">{dash(row.followUpDate)}</span></p>
        <p className="text-slate-500">Interview <span className="font-mono text-slate-300">{dash(row.interviewDate)}</span></p>
        <p className="truncate text-slate-500" title={row.jobLocation || undefined}>Location <span className="text-slate-300">{row.jobLocation || '—'}</span></p>
      </div>

      {row.jobLink ? <JobLink href={row.jobLink} mobile /> : null}
      {previewText(row.notes) ? <p className="mt-2 truncate text-xs text-slate-400">{previewText(row.notes)}</p> : null}
      {previewText(row.companyResearch) ? (
        <p className="mt-1 truncate text-xs text-slate-500">Research: {previewText(row.companyResearch)}</p>
      ) : null}
      {row.tags.length > 0 ? <div className="mt-2"><TagList tags={row.tags} /></div> : null}

      <div className="mt-3 flex justify-end border-t border-hairline pt-2">
        <button
          type="button"
          onClick={() => onArchive(row)}
          className="rounded-md px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/10"
        >
          Archive
        </button>
      </div>
    </article>
  );
}

function JobLink({ href, mobile = false }: { href: string; mobile?: boolean }) {
  if (!href) return <span className="text-slate-600">—</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
      onClick={(event) => event.stopPropagation()}
      className={`${mobile ? 'mt-2' : ''} inline-flex items-center gap-1 rounded-md border border-hairline bg-surface-raised px-2 py-1 text-xs text-sky-300 transition hover:border-sky-500/50 hover:text-sky-200`}
    >
      Open posting <span aria-hidden>↗</span>
    </a>
  );
}

function TagList({ tags }: { tags: readonly string[] }) {
  if (tags.length === 0) return <span className="text-slate-600">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => <TagChip key={tag} tag={tag} />)}
    </div>
  );
}
