import { useEffect, useState } from 'react';
import { applicationsByMonth, applicationsByWeek } from '../lib/analytics';
import { STATUS_TONE } from '../lib/pipeline';
import { collectPortals, summarise } from '../lib/query';
import { getStorage } from '../lib/storage';
import { clampWeeklyGoal, DEFAULT_WEEKLY_GOAL } from '../lib/storage/localSettingsStore';
import { STATUSES } from '../lib/types';
import type { JobApplication } from '../lib/types';
import { isLive } from '../lib/pipeline';

interface AnalyticsPanelProps {
  rows: JobApplication[];
}

export function AnalyticsPanel({ rows }: AnalyticsPanelProps) {
  const today = new Date();
  const stats = summarise(rows, today);
  const live = rows.filter(isLive);
  const portals = collectPortals(live);
  const weeks = applicationsByWeek(rows, today, 8);
  const months = applicationsByMonth(rows, today, 6);
  const weekHistory = applicationsByWeek(rows, today, 4);

  const [goal, setGoal] = useState(DEFAULT_WEEKLY_GOAL);
  const storage = getStorage();

  useEffect(() => {
    void storage.settings.get().then((s) => setGoal(s.weeklyGoal));
  }, [storage]);

  async function commitGoal(raw: number) {
    const next = clampWeeklyGoal(raw);
    setGoal(next);
    await storage.settings.set({ weeklyGoal: next });
  }

  const maxStatus = Math.max(1, ...STATUSES.map((s) => stats.byStatus[s]));
  const maxPortal = Math.max(1, ...portals.map((p) => p.count));
  const maxWeek = Math.max(1, ...weeks.map((b) => b.count));
  const maxMonth = Math.max(1, ...months.map((b) => b.count));
  const thisWeek = stats.appliedThisWeek;
  const goalPct = goal === 0 ? 0 : Math.min(100, (thisWeek / goal) * 100);

  return (
    <section className="flex flex-col gap-5 border-t border-hairline pt-6">
      <h2 className="text-sm font-semibold text-slate-100">Analytics</h2>
      <p className="text-xs text-slate-500">How am I doing?</p>

      <div className="rounded-xl border border-hairline bg-surface px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">Total active applications</p>
        <p className="mt-1 font-mono text-2xl text-slate-50">{stats.total}</p>
        <p className="text-xs text-slate-500">Live, non-archived, non-deleted</p>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Breakdown by status</h3>
        <ul className="flex flex-col gap-1.5">
          {STATUSES.map((status) => {
            const count = stats.byStatus[status];
            return (
              <li key={status} className="flex items-center gap-2">
                <span className={`size-2 shrink-0 rounded-full ${STATUS_TONE[status].dot}`} />
                <span className="w-24 shrink-0 text-xs text-slate-300">{status}</span>
                <div className="h-2 flex-1 overflow-hidden rounded bg-surface-raised">
                  <div
                    className={`h-full ${STATUS_TONE[status].dot}`}
                    style={{ width: `${(count / maxStatus) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right font-mono text-[11px] text-slate-400">{count}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-xl border border-hairline bg-surface px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">Response rate</p>
        <p className="mt-1 font-mono text-2xl text-slate-50">{stats.responseRatePct}%</p>
        <p className="text-xs text-slate-500">
          Shortlisted / Interview / Offer, as a share of everything but Saved
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">By job portal / source</h3>
        {portals.length === 0 ? (
          <p className="text-sm text-slate-500">No portals recorded on live applications.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {portals.map((p) => (
              <li key={p.portal} className="flex items-center gap-2">
                <span className="w-32 shrink-0 truncate text-xs text-slate-300">{p.portal}</span>
                <div className="h-2 flex-1 overflow-hidden rounded bg-surface-raised">
                  <div className="h-full bg-blue-400" style={{ width: `${(p.count / maxPortal) * 100}%` }} />
                </div>
                <span className="w-6 text-right font-mono text-[11px] text-slate-400">{p.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Submitted — last 8 weeks</h3>
        <BarSeries buckets={weeks} max={maxWeek} />
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Submitted — last 6 months</h3>
        <BarSeries buckets={months} max={maxMonth} />
      </div>

      <div className="rounded-xl border border-hairline bg-surface px-4 py-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Weekly goal</h3>
        <label className="mt-2 flex items-center gap-2 text-sm text-slate-300">
          Target applications per week
          <input
            type="number"
            min={0}
            max={99}
            value={goal}
            onChange={(e) => void commitGoal(Number(e.target.value))}
            className="w-16 rounded-md border border-hairline bg-canvas px-2 py-1 font-mono text-sm text-slate-100"
          />
        </label>
        <p className="mt-3 text-sm text-slate-100">
          {goal === 0
            ? 'Set a goal to track this week.'
            : `${thisWeek} of ${goal} applications this week`}
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded bg-surface-raised">
          <div className="h-full bg-blue-400" style={{ width: `${goalPct}%` }} />
        </div>
        <h4 className="mt-4 text-[11px] uppercase tracking-wide text-slate-500">Last 4 weeks</h4>
        <ul className="mt-2 flex flex-col gap-1">
          {weekHistory.map((b, i) => (
            <li key={b.key} className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-24 font-mono text-[11px]">
                {b.key}
                {i === weekHistory.length - 1 ? ' (now)' : ''}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded bg-canvas">
                <div
                  className="h-full bg-slate-400"
                  style={{ width: `${(b.count / Math.max(1, ...weekHistory.map((w) => w.count))) * 100}%` }}
                />
              </div>
              <span className="w-6 text-right font-mono text-[11px]">{b.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function BarSeries({ buckets, max }: { buckets: { key: string; count: number }[]; max: number }) {
  return (
    <ul className="flex items-end gap-1">
      {buckets.map((b) => (
        <li key={b.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="font-mono text-[10px] text-slate-500">{b.count}</span>
          <div className="flex h-16 w-full items-end rounded bg-surface-raised">
            <div className="w-full rounded-t bg-blue-400" style={{ height: `${(b.count / max) * 100}%` }} />
          </div>
          <span className="w-full truncate text-center font-mono text-[9px] text-slate-500">{b.key}</span>
        </li>
      ))}
    </ul>
  );
}
