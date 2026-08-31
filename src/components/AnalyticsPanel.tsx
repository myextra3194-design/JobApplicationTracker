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
    <section className="flex flex-col gap-5 rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-ink">Analytics</h2>
        <p className="mt-0.5 text-xs text-muted">How am I doing?</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-hairline bg-surface-raised/60 p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted">Total active applications</p>
          <p className="mt-1 font-mono text-3xl text-ink">{stats.total}</p>
          <p className="text-xs text-faint">Live, non-archived, non-deleted</p>
        </div>
        <div className="rounded-xl border border-hairline bg-surface-raised/60 p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted">Response rate</p>
          <p className="mt-1 font-mono text-3xl text-ink">{stats.responseRatePct}%</p>
          <p className="text-xs text-faint">Shortlisted / Interview / Offer, excluding Saved</p>
        </div>
      </div>

      <div>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Breakdown by status</h3>
        <ul className="flex flex-col gap-2">
          {STATUSES.map((status) => {
            const count = stats.byStatus[status];
            return (
              <li key={status} className="flex items-center gap-2">
                <span className={`size-2 shrink-0 rounded-full ${STATUS_TONE[status].dot}`} />
                <span className="w-24 shrink-0 text-xs text-muted">{status}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-soft">
                  <div
                    className={`h-full rounded-full ${STATUS_TONE[status].dot}`}
                    style={{ width: `${(count / maxStatus) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right font-mono text-[11px] text-muted">{count}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">By job portal / source</h3>
        {portals.length === 0 ? (
          <p className="text-sm text-muted">No portals recorded on live applications.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {portals.map((p) => (
              <li key={p.portal} className="flex items-center gap-2">
                <span className="w-32 shrink-0 truncate text-xs text-muted">{p.portal}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-soft">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                    style={{ width: `${(p.count / maxPortal) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right font-mono text-[11px] text-muted">{p.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Submitted — last 8 weeks</h3>
          <BarSeries buckets={weeks} max={maxWeek} />
        </div>
        <div>
          <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Submitted — last 6 months</h3>
          <BarSeries buckets={months} max={maxMonth} />
        </div>
      </div>

      <div className="rounded-xl border border-hairline bg-surface-raised/60 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Weekly goal</h3>
        <label className="mt-2.5 flex items-center gap-2 text-sm text-muted">
          Target applications per week
          <input
            type="number"
            min={0}
            max={99}
            value={goal}
            onChange={(e) => void commitGoal(Number(e.target.value))}
            className="w-16 rounded-lg border border-hairline bg-surface px-2 py-1 font-mono text-sm text-ink"
          />
        </label>
        <p className="mt-3 text-sm text-ink">
          {goal === 0 ? 'Set a goal to track this week.' : `${thisWeek} of ${goal} applications this week`}
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-soft">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
            style={{ width: `${goalPct}%` }}
          />
        </div>
        <h4 className="mt-4 text-[11px] uppercase tracking-wide text-muted">Last 4 weeks</h4>
        <ul className="mt-2 flex flex-col gap-1.5">
          {weekHistory.map((b, i) => (
            <li key={b.key} className="flex items-center gap-2 text-xs text-muted">
              <span className="w-24 font-mono text-[11px]">
                {b.key}
                {i === weekHistory.length - 1 ? ' (now)' : ''}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-soft">
                <div
                  className="h-full rounded-full bg-accent/60"
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
    <ul className="flex items-end gap-1.5">
      {buckets.map((b) => (
        <li key={b.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="font-mono text-[10px] text-muted">{b.count}</span>
          <div className="flex h-20 w-full items-end rounded-lg bg-surface-soft">
            <div
              className="w-full rounded-lg bg-gradient-to-t from-violet-500 to-indigo-400"
              style={{ height: `${(b.count / max) * 100}%` }}
            />
          </div>
          <span className="w-full truncate text-center font-mono text-[9px] text-faint">{b.key}</span>
        </li>
      ))}
    </ul>
  );
}
