import { StatusChip } from './StatusChip';
import { TagChip } from './TagChip';
import { PIPELINE, STATUS_TONE } from '../lib/pipeline';
import { groupByStatus } from '../lib/query';
import { STATUSES, type ApplicationStatus, type JobApplication } from '../lib/types';

interface KanbanBoardProps {
  /** Live rows (non-archived, non-deleted), in whatever order the store returned them. */
  rows: JobApplication[];
  /** Part 4: ids matching the active filters; unmatched cards are dimmed. */
  matchIds: ReadonlySet<string>;
  onStatusChange: (row: JobApplication, status: ApplicationStatus) => void;
  onCardClick: (row: JobApplication) => void;
  onAdd: () => void;
}

/**
 * Part 3: the pipeline as a board — one column per stage, in the plan's exact
 * order. The board intentionally keeps its seven fixed-width columns so a
 * narrow screen can scan them with a horizontal swipe instead of compressing
 * every card into an unusable sliver.
 */
export function KanbanBoard({ rows, matchIds, onStatusChange, onCardClick, onAdd }: KanbanBoardProps) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-hairline bg-surface px-4 py-12 text-center">
        <p className="text-sm font-medium text-slate-200">No applications yet — add your first one</p>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-500"
        >
          Add your first application
        </button>
      </div>
    );
  }

  const columns = groupByStatus(rows);
  const isDimmed = (row: JobApplication) => !matchIds.has(row.id);

  return (
    <div className="-mx-1 flex min-w-0 snap-x gap-3 overflow-x-auto overscroll-x-contain px-1 pb-2">
      {PIPELINE.map((status) => {
        const cards = columns[status];
        return (
          <section
            key={status}
            aria-label={`${status} column`}
            className={`flex w-64 shrink-0 snap-start flex-col rounded-xl border bg-surface ${STATUS_TONE[status].column}`}
          >
            <header className="flex items-center gap-1.5 border-b border-hairline px-3 py-2.5">
              <span aria-hidden className={`size-1.5 rounded-full ${STATUS_TONE[status].dot}`} />
              <h2 className="text-xs font-semibold text-slate-200">{status}</h2>
              <span className="ml-auto rounded-full bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                {cards.length}
              </span>
            </header>
            <div className="flex min-h-24 flex-col gap-2 p-2">
              {cards.length === 0 ? (
                <p className="px-1 py-3 text-center text-[11px] text-slate-600">Empty</p>
              ) : (
                cards.map((row) => (
                  <BoardCard
                    key={row.id}
                    row={row}
                    dimmed={isDimmed(row)}
                    onStatusChange={onStatusChange}
                    onCardClick={onCardClick}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BoardCard({
  row,
  dimmed,
  onStatusChange,
  onCardClick,
}: {
  row: JobApplication;
  dimmed: boolean;
  onStatusChange: (row: JobApplication, status: ApplicationStatus) => void;
  onCardClick: (row: JobApplication) => void;
}) {
  return (
    <article
      onClick={() => onCardClick(row)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onCardClick(row);
        }
      }}
      role="button"
      tabIndex={0}
      className={`cursor-pointer rounded-lg border border-hairline bg-surface-raised p-2.5 transition-all ${
        dimmed ? 'opacity-40 saturate-50' : 'hover:border-sky-500/40'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-slate-100">{row.companyName || '—'}</h3>
          <p className="truncate text-xs text-slate-400">{row.jobTitle || '—'}</p>
        </div>
        <StatusChip status={row.status} className="shrink-0" />
      </div>
      <select
        value={row.status}
        aria-label={`Move ${row.companyName || 'application'} to status`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onChange={(event) => onStatusChange(row, event.target.value as ApplicationStatus)}
        className="mt-2 w-full rounded-md border border-hairline bg-surface px-2 py-1.5 text-[11px] text-slate-300"
      >
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            Move to {status}
          </option>
        ))}
      </select>
      <p className="mt-1.5 font-mono text-[11px] text-slate-500">Applied {row.applicationDate ?? '—'}</p>
      {row.jobLink ? (
        <a
          href={row.jobLink}
          target="_blank"
          rel="noopener noreferrer"
          title={row.jobLink}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-sky-300 hover:text-sky-200"
        >
          Open posting <span aria-hidden>↗</span>
        </a>
      ) : null}
      {row.tags.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {row.tags.map((tag) => <TagChip key={tag} tag={tag} className="text-[10px]" />)}
        </div>
      ) : null}
    </article>
  );
}
