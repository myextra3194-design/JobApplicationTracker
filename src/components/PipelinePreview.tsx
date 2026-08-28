import { useEffect, useState } from 'react';
import { PIPELINE, STATUS_TONE } from '../lib/pipeline';
import { summarise, type PipelineCounts } from '../lib/query';
import { getStorage } from '../lib/storage';
import { STATUSES, type ApplicationRecord } from '../lib/types';

/**
 * Read-only preview of the 7-stage board, populated from the real store.
 * Part 4 turns this into the drag-and-drop board; here it exists to prove the
 * stage list, the colour tokens and the aggregate math all line up with the data
 * layer before any interaction is built on top of them.
 */
export function PipelinePreview() {
  const [records, setRecords] = useState<ApplicationRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getStorage()
      .records.list()
      .then((found) => {
        if (!cancelled) setRecords(found);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts: PipelineCounts = summarise(records);

  return (
    <section className="rounded-xl border border-hairline bg-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-100">Pipeline</h2>
        <p className="text-[11px] text-slate-500">
          response rate <span className="font-mono text-slate-300">{counts.responseRatePct}%</span> · this week{' '}
          <span className="font-mono text-slate-300">{counts.appliedThisWeek}</span> applied
        </p>
      </div>

      <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {PIPELINE.map((status) => (
          <li
            key={status}
            className={`rounded-lg border ${STATUS_TONE[status].column} bg-surface-raised px-2.5 py-2`}
          >
            <div className="flex items-center gap-1.5">
              <span className={`size-1.5 shrink-0 rounded-full ${STATUS_TONE[status].dot}`} />
              <span className="truncate text-[11px] font-medium text-slate-300">{status}</span>
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-slate-100">
              {counts.byStatus[status] ?? 0}
            </div>
          </li>
        ))}
      </ol>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <li>
          <span className="font-mono text-slate-300">{counts.dueFollowUps}</span> follow-up
          {counts.dueFollowUps === 1 ? '' : 's'} due
        </li>
        <li>
          <span className="font-mono text-slate-300">{counts.scheduledInterviews}</span> interviews booked
        </li>
        <li>
          {STATUSES.length} stages · terminal ones stop reminders
        </li>
      </ul>
    </section>
  );
}
