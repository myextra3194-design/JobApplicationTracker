import { AnalyticsPanel } from './AnalyticsPanel';
import { downloadDateAsIcs } from '../lib/ics';
import { daysFromToday } from '../lib/pipeline';
import { dueFollowUps, upcomingInterviews } from '../lib/upcoming';
import type { JobApplication } from '../lib/types';

interface UpcomingDashboardProps {
  /** Same store snapshot the List/Board views use (`storage.records.list()`). */
  rows: JobApplication[];
  onOpen: (row: JobApplication) => void;
}

/**
 * Part 7: "what do I need to do today?" — due follow-ups and upcoming
 * interviews, short and scannable. Not a data table. Each item opens that
 * application's edit form (the detail view); "Add to calendar" is a sibling
 * so it does not nest a button inside a button.
 */
export function UpcomingDashboard({ rows, onOpen }: UpcomingDashboardProps) {
  const today = new Date();
  const followUps = dueFollowUps(rows, today);
  const interviews = upcomingInterviews(rows, today);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <header className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100">Follow-ups due</h2>
          <span className="font-mono text-[11px] text-slate-500">{followUps.length}</span>
        </header>
        {followUps.length === 0 ? (
          <p className="rounded-xl border border-dashed border-hairline bg-surface px-4 py-8 text-center text-sm text-slate-400">
            Nothing due.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {followUps.map((row) => {
              const overdue = row.followUpDate ? daysFromToday(row.followUpDate, today) < 0 : false;
              return (
                <DashboardItem
                  key={row.id}
                  row={row}
                  dateLabel="Follow-up"
                  date={row.followUpDate}
                  extra={row.status}
                  tone={overdue ? 'overdue' : 'due'}
                  onOpen={onOpen}
                />
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <header className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100">Upcoming interviews</h2>
          <span className="font-mono text-[11px] text-slate-500">{interviews.length}</span>
        </header>
        {interviews.length === 0 ? (
          <p className="rounded-xl border border-dashed border-hairline bg-surface px-4 py-8 text-center text-sm text-slate-400">
            No upcoming interviews.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {interviews.map((row) => (
              <DashboardItem
                key={row.id}
                row={row}
                dateLabel="Interview"
                date={row.interviewDate}
                extra={row.interviewStatus}
                tone="interview"
                onOpen={onOpen}
              />
            ))}
          </ul>
        )}
      </section>

      <AnalyticsPanel rows={rows} />
    </div>
  );
}

function DashboardItem({
  row,
  dateLabel,
  date,
  extra,
  tone,
  onOpen,
}: {
  row: JobApplication;
  dateLabel: string;
  date: string | null;
  extra: string;
  tone: 'overdue' | 'due' | 'interview';
  onOpen: (row: JobApplication) => void;
}) {
  const toneClass =
    tone === 'overdue'
      ? 'border-red-500/50 bg-red-500/10'
      : tone === 'due'
        ? 'border-amber-500/40 bg-amber-500/10'
        : 'border-sky-500/30 bg-sky-500/10';
  const dateClass =
    tone === 'overdue' ? 'text-red-300' : tone === 'due' ? 'text-amber-200' : 'text-sky-200';

  return (
    <li className={`flex items-stretch gap-2 rounded-xl border ${toneClass}`}>
      <button
        type="button"
        onClick={() => onOpen(row)}
        className="min-w-0 flex-1 px-3 py-2.5 text-left"
      >
        <p className="truncate text-sm font-medium text-slate-50">{row.companyName || '—'}</p>
        <p className="truncate text-xs text-slate-400">{row.jobTitle || '—'}</p>
        <p className={`mt-1 font-mono text-[11px] ${dateClass}`}>
          {dateLabel} {date ?? '—'}
          {extra ? <span className="ml-2 font-sans text-slate-400">· {extra}</span> : null}
        </p>
      </button>
      {date ? (
        <div className="flex items-center pr-2">
          <button
            type="button"
            onClick={() =>
              downloadDateAsIcs({
                companyName: row.companyName,
                jobTitle: row.jobTitle,
                date,
                uid: `${row.id}-${date}`,
              })
            }
            className="shrink-0 rounded-md border border-hairline bg-surface/60 px-2 py-1 text-[11px] text-slate-300 hover:bg-surface-raised hover:text-slate-100"
          >
            Add to calendar
          </button>
        </div>
      ) : null}
    </li>
  );
}
