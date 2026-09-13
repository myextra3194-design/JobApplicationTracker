import { AnalyticsPanel } from './AnalyticsPanel';
import { StatusChip } from './StatusChip';
import { downloadDateAsIcs } from '../lib/ics';
import { daysFromToday, effectiveFollowUpDate, isAutoFollowUp, STATUS_TONE } from '../lib/pipeline';
import { dueFollowUps, upcomingInterviews } from '../lib/upcoming';
import type { JobApplication } from '../lib/types';

interface UpcomingDashboardProps {
  /** Same store snapshot the List/Board views use (`storage.records.list()`). */
  rows: JobApplication[];
  onOpen: (row: JobApplication) => void;
  /** Automatic follow-up cadence from settings (days after applying; 0 = off). */
  followUpDays?: number;
  /** Reminder time from settings — the exported follow-up event alarms at it. */
  alarmTime?: string;
}

/**
 * Part 7: "what do I need to do today?" — due follow-ups and upcoming
 * interviews, short and scannable. Not a data table. Each item opens that
 * application's edit form (the detail view); "Add to calendar" is a sibling
 * so it does not nest a button inside a button.
 */
export function UpcomingDashboard({ rows, onOpen, followUpDays = 0, alarmTime }: UpcomingDashboardProps) {
  const today = new Date();
  const followUps = dueFollowUps(rows, today, followUpDays);
  const interviews = upcomingInterviews(rows, today);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <header className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Follow-ups due</h2>
          <span className="rounded-full bg-surface-raised px-2 py-0.5 font-mono text-[11px] text-muted">
            {followUps.length}
          </span>
        </header>
        {followUps.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-hairline bg-surface px-4 py-8 text-center text-sm text-muted shadow-sm">
            Nothing due.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {followUps.map((row) => {
              const followUpDate = effectiveFollowUpDate(row, followUpDays);
              const overdue = followUpDate ? daysFromToday(followUpDate, today) < 0 : false;
              return (
                <DashboardItem
                  key={row.id}
                  row={row}
                  dateLabel="Follow-up"
                  kind="follow-up"
                  date={effectiveFollowUpDate(row, followUpDays)}
                  // A derived follow-up is labelled as one, so the user can see
                  // why a row nobody scheduled is on the list.
                  extra={isAutoFollowUp(row, followUpDays) ? `auto · ${followUpDays} days after applying` : ''}
                  tone={overdue ? 'overdue' : 'due'}
                  onOpen={onOpen}
                  alarmTime={alarmTime}
                />
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <header className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Upcoming interviews</h2>
          <span className="rounded-full bg-surface-raised px-2 py-0.5 font-mono text-[11px] text-muted">
            {interviews.length}
          </span>
        </header>
        {interviews.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-hairline bg-surface px-4 py-8 text-center text-sm text-muted shadow-sm">
            No upcoming interviews.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {interviews.map((row) => (
              <DashboardItem
                key={row.id}
                row={row}
                dateLabel="Interview"
                kind="interview"
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
  kind,
  date,
  extra,
  tone,
  onOpen,
  alarmTime,
}: {
  row: JobApplication;
  dateLabel: string;
  /** Which date this is — keeps the .ics UID distinct per event kind. */
  kind: 'follow-up' | 'interview';
  date: string | null;
  extra: string;
  tone: 'overdue' | 'due' | 'interview';
  onOpen: (row: JobApplication) => void;
  /** Follow-up events are timed at this hour and carry an alarm. */
  alarmTime?: string;
}) {
  const dateClass =
    tone === 'overdue'
      ? 'text-red-700 dark:text-red-300'
      : tone === 'due'
        ? 'text-amber-700 dark:text-amber-200'
        : 'text-accent';
  const statusBorder = STATUS_TONE[row.status].column;

  return (
    <li className={`flex items-stretch gap-2 rounded-2xl border bg-surface shadow-sm ${statusBorder}`}>
      <button
        type="button"
        onClick={() => onOpen(row)}
        className="min-w-0 flex-1 px-3.5 py-3 text-left"
      >
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-ink">{row.companyName || '—'}</p>
          <StatusChip status={row.status} />
        </div>
        <p className="truncate text-xs text-muted">{row.jobTitle || '—'}</p>
        <p className={`mt-1.5 font-mono text-[11px] ${dateClass}`}>
          {dateLabel} {date ?? '—'}
          {extra ? <span className="ml-2 font-sans text-muted">· {extra}</span> : null}
        </p>
      </button>
      {date ? (
        <div className="flex items-center pr-2.5">
          <button
            type="button"
            onClick={() =>
              downloadDateAsIcs({
                companyName: row.companyName,
                jobTitle: row.jobTitle,
                date,
                kind,
                // The kind is part of the UID: a follow-up and an interview on
                // the same day of the same application must not share one, or
                // importing both into a calendar overwrites the first event.
                uid: `${row.id}-${kind}-${date}`,
                // The exported entry carries the job: location and posting link
                // as their own properties, the rest as the description.
                details: row,
                // Only follow-ups become timed + alarmed events; an interview
                // stays an all-day marker the calendar blocks out.
                alarmAt: kind === 'follow-up' ? alarmTime : undefined,
              })
            }
            className="shrink-0 rounded-lg border border-hairline bg-surface px-2 py-1 text-[11px] text-muted shadow-sm transition hover:bg-surface-raised hover:text-ink"
          >
            Add to calendar
          </button>
        </div>
      ) : null}
    </li>
  );
}
