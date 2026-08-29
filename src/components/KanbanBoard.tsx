import { PIPELINE, STATUS_TONE } from '../lib/pipeline';
import { groupByStatus } from '../lib/query';
import { STATUSES, type ApplicationStatus, type JobApplication } from '../lib/types';

interface KanbanBoardProps {
  /** Live rows (non-archived, non-deleted), in whatever order the store returned them. */
  rows: JobApplication[];
  /**
   * Part 4: the ids matching the active filters. Cards outside the set are
   * dimmed, not removed or re-sorted — the board keeps its column layout,
   * and a dimmed card's status dropdown still works, so you can move it
   * back into whatever the filter is showing.
   */
  matchIds: ReadonlySet<string>;
  onStatusChange: (row: JobApplication, status: ApplicationStatus) => void;
  onCardClick: (row: JobApplication) => void;
}

/**
 * Part 3: the pipeline as a board — one column per stage, in the plan's exact
 * order. Only live rows reach it (the store's default `list()` hides archived
 * and deleted). Status changes through a dropdown on each card — no
 * drag-and-drop — and write through the same store as the list view, so the
 * two views can never disagree.
 */
export function KanbanBoard({ rows, matchIds, onStatusChange, onCardClick }: KanbanBoardProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-hairline bg-surface px-4 py-10 text-center text-sm text-slate-400">
        No applications yet — add your first one.
      </p>
    );
  }

  const columns = groupByStatus(rows);
  const isDimmed = (row: JobApplication) => !matchIds.has(row.id);

  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
      {PIPELINE.map((status) => {
        const cards = columns[status];
        return (
          <section
            key={status}
            aria-label={`${status} column`}
            className={`flex w-60 shrink-0 flex-col rounded-xl border bg-surface ${STATUS_TONE[status].column}`}
          >
            <header className="flex items-center gap-1.5 border-b border-hairline px-3 py-2">
              <span aria-hidden className={`size-1.5 rounded-full ${STATUS_TONE[status].dot}`} />
              <h2 className="text-xs font-semibold text-slate-200">{status}</h2>
              <span className="ml-auto rounded-full bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                {cards.length}
              </span>
            </header>
            <div className="flex flex-col gap-2 p-2">
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
  /** Outside the active Part 4 filters: visible but faded. */
  dimmed: boolean;
  onStatusChange: (row: JobApplication, status: ApplicationStatus) => void;
  onCardClick: (row: JobApplication) => void;
}) {
  return (
    <article
      onClick={() => onCardClick(row)}
      className={`cursor-pointer rounded-lg border border-hairline bg-surface-raised p-2.5 transition-all ${
        dimmed ? 'opacity-40 saturate-50' : 'hover:border-sky-500/40'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-slate-100">{row.companyName || '—'}</h3>
          <p className="truncate text-xs text-slate-400">{row.jobTitle || '—'}</p>
        </div>
        <select
          value={row.status}
          aria-label={`Status for ${row.companyName || 'application'}`}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onStatusChange(row, event.target.value as ApplicationStatus)}
          className="shrink-0 rounded-md border border-hairline bg-surface px-1.5 py-1 text-[11px] text-slate-300"
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-1.5 font-mono text-[11px] text-slate-500">Applied {row.applicationDate ?? '—'}</p>
      {row.tags.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {row.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-hairline bg-surface px-1.5 py-0.5 text-[10px] text-slate-400"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
