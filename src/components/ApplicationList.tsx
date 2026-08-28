import { STATUS_TONE } from '../lib/pipeline';
import type { JobApplication } from '../lib/types';

interface ApplicationListProps {
  rows: JobApplication[];
  onRowClick: (row: JobApplication) => void;
  onDelete: (row: JobApplication) => void;
}

function dash(value: string | null): string {
  return value ? value : '—';
}

export function ApplicationList({ rows, onRowClick, onDelete }: ApplicationListProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-hairline bg-surface px-4 py-10 text-center text-sm text-slate-400">
        No applications yet — add your first one.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-hairline bg-surface">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-hairline text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">Company</th>
            <th className="px-3 py-2 font-medium">Job Title</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Applied Date</th>
            <th className="px-3 py-2 font-medium">Follow-up Date</th>
            <th className="px-3 py-2 font-medium">Interview Date</th>
            <th className="px-3 py-2 font-medium">Tags</th>
            <th className="px-3 py-2 font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick(row)}
              className="cursor-pointer border-b border-hairline last:border-b-0 hover:bg-surface-raised/80"
            >
              <td className="px-3 py-2 font-medium text-slate-100">{row.companyName || '—'}</td>
              <td className="px-3 py-2 text-slate-300">{row.jobTitle || '—'}</td>
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
                    onDelete(row);
                  }}
                  className="rounded-md px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
