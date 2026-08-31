import { useEffect, useMemo, useRef, useState } from 'react';
import type { TrackerSettings } from '../lib/storage/adapter';
import { KeyJournal } from '../lib/journal';
import {
  countUnread,
  deriveNotifications,
  NOTIFICATIONS_JOURNAL_KEY,
  type AppNotification,
} from '../lib/notifications';
import type { JobApplication } from '../lib/types';

interface NotificationCenterProps {
  rows: JobApplication[];
  settings: TrackerSettings;
  /** Persists a settings patch through the seam (App.tsx). */
  onPatch: (patch: Partial<TrackerSettings>) => void;
  onOpenRow: (row: JobApplication) => void;
}

const KIND_ICON: Record<AppNotification['kind'], string> = {
  'followup-overdue': '⚠️',
  'followup-today': '⏰',
  'interview-today': '📅',
  'interview-soon': '🗓️',
};

const KIND_TONE: Record<AppNotification['kind'], string> = {
  'followup-overdue': 'bg-red-500/15',
  'followup-today': 'bg-amber-500/15',
  'interview-today': 'bg-accent/15',
  'interview-soon': 'bg-surface',
};

/**
 * Part 13: the header bell. Dropdown shows derived reminders (follow-ups due,
 * interviews in the next couple of days) with a seen-state badge, and hosts
 * the reminder/alarm settings: master switches, the time of day reminders
 * fire at, interview lead days, and OS pop-up opt-in.
 */
export function NotificationCenter({ rows, settings, onPatch, onOpenRow }: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [seenVersion, setSeenVersion] = useState(0);
  const [permission, setPermission] = useState<string>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported',
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // `seenVersion` bumps after every mark, so the memo re-reads the journal and
  // the badge drops immediately. Rows are small; derivation is cheap.
  const items = useMemo(() => deriveNotifications(rows), [rows]);
  const seen = useMemo(() => new KeyJournal(NOTIFICATIONS_JOURNAL_KEY).keys(), [rows, seenVersion]);
  const unread = countUnread(items, seen);

  // Close on outside click / Escape while open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggleOpen = () => {
    setOpen((wasOpen) => !wasOpen);
    // Re-read the permission so a change made in browser settings shows up.
    if (typeof window !== 'undefined' && 'Notification' in window) setPermission(Notification.permission);
  };

  const markSeen = (keys: readonly string[]) => {
    new KeyJournal(NOTIFICATIONS_JOURNAL_KEY).mark(keys);
    setSeenVersion((n) => n + 1);
  };

  const openItem = (item: AppNotification) => {
    const row = rows.find((r) => r.id === item.rowId);
    markSeen([item.key]);
    setOpen(false);
    if (row) onOpenRow(row);
  };

  async function toggleBrowserAlerts(next: boolean): Promise<void> {
    if (!next) {
      onPatch({ browserAlerts: false });
      return;
    }
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      return;
    }
    const current = Notification.permission;
    if (current === 'granted') {
      onPatch({ browserAlerts: true });
      return;
    }
    if (current === 'denied') {
      setPermission('denied');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      onPatch({ browserAlerts: result === 'granted' });
    } catch {
      setPermission('denied');
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notifications and reminders"
        className={`relative inline-flex h-9 items-center gap-1.5 rounded-xl border border-hairline bg-surface px-2.5 text-sm shadow-sm transition hover:border-accent/50 ${
          settings.notificationsEnabled ? '' : 'opacity-50'
        }`}
      >
        <span aria-hidden>{settings.notificationsEnabled ? '🔔' : '🔕'}</span>
        {settings.notificationsEnabled && unread > 0 ? (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow"
            aria-hidden
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications and reminders"
          className="absolute right-0 top-full z-40 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-hairline bg-surface-raised shadow-2xl"
        >
          <header className="flex items-center gap-2 border-b border-hairline px-4 py-3">
            <h2 className="mr-auto text-sm font-semibold text-ink">Notifications</h2>
            {settings.notificationsEnabled && unread > 0 ? (
              <button
                type="button"
                onClick={() => markSeen(items.map((item) => item.key))}
                className="rounded-lg px-2 py-1 text-[11px] font-medium text-accent transition hover:bg-accent/10"
              >
                Mark all read
              </button>
            ) : null}
          </header>

          {!settings.notificationsEnabled ? (
            <p className="px-4 py-6 text-center text-xs leading-relaxed text-muted">
              Notifications are turned off. Enable them below to see follow-up and interview reminders here.
            </p>
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs leading-relaxed text-muted">
              Nothing due right now. Follow-ups and interviews appear here as they approach.
            </p>
          ) : (
            <ul className="max-h-72 divide-y divide-hairline overflow-y-auto">
              {items.map((item) => {
                const isUnread = !seen.has(item.key);
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      className="flex w-full items-start gap-2.5 px-4 py-3 text-left transition hover:bg-surface"
                    >
                      <span
                        aria-hidden
                        className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-sm ${KIND_TONE[item.kind]}`}
                      >
                        {KIND_ICON[item.kind]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-xs leading-relaxed ${isUnread ? 'font-medium text-ink' : 'text-muted'}`}>
                          {item.message}
                        </span>
                        <span className="mt-0.5 block font-mono text-[10px] text-faint">{item.date}</span>
                      </span>
                      {isUnread ? (
                        <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <footer className="border-t border-hairline bg-surface/60 px-4 py-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-faint">Reminders &amp; alarms</h3>
            <div className="mt-2 flex flex-col gap-2.5">
              <ToggleRow
                label="Notifications"
                hint="The bell and its badge"
                checked={settings.notificationsEnabled}
                onChange={(next) => onPatch({ notificationsEnabled: next })}
              />
              <ToggleRow
                label="Scheduled reminders"
                hint="In-app alarms for follow-ups and interviews"
                checked={settings.alarmsEnabled}
                onChange={(next) => onPatch({ alarmsEnabled: next })}
              />
              <div className={`flex flex-col gap-2.5 ${settings.alarmsEnabled ? '' : 'pointer-events-none opacity-40'}`}>
                <ToggleRow
                  label="Follow-up reminders"
                  checked={settings.followUpAlarms}
                  onChange={(next) => onPatch({ followUpAlarms: next })}
                />
                <ToggleRow
                  label="Interview reminders"
                  checked={settings.interviewAlarms}
                  onChange={(next) => onPatch({ interviewAlarms: next })}
                />
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="alarm-time" className="min-w-0 flex-1 text-xs text-muted">
                    Remind at
                  </label>
                  <input
                    id="alarm-time"
                    type="time"
                    value={settings.alarmTime}
                    onChange={(event) => onPatch({ alarmTime: event.target.value || '09:00' })}
                    className="rounded-lg border border-hairline bg-surface px-2 py-1 font-mono text-xs text-ink outline-none focus:border-accent/60"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="interview-lead" className="min-w-0 flex-1 text-xs text-muted">
                    Interview lead reminder
                  </label>
                  <select
                    id="interview-lead"
                    value={String(settings.interviewLeadDays)}
                    onChange={(event) => onPatch({ interviewLeadDays: Number(event.target.value) })}
                    className="rounded-lg border border-hairline bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-accent/60"
                  >
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((days) => (
                      <option key={days} value={days}>
                        {days === 0 ? 'Day of only' : `${days} day${days === 1 ? '' : 's'} before`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <ToggleRow
                label="System pop-ups"
                hint="OS alerts when the tab is in the background"
                checked={settings.browserAlerts}
                onChange={(next) => void toggleBrowserAlerts(next)}
              />
              {permission === 'denied' ? (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
                  Pop-ups are blocked by this browser. Allow notifications for this site in your browser settings,
                  then try again.
                </p>
              ) : permission === 'unsupported' ? (
                <p className="rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-[11px] leading-relaxed text-muted">
                  This browser doesn't support system notifications.
                </p>
              ) : null}
              <p className="text-[11px] leading-relaxed text-faint">
                Reminders fire while this app is open — it stores everything in your browser, so there is no server to
                wake a closed tab. Keep it open (or installed) on the days you want alarms.
              </p>
            </div>
          </footer>
        </div>
      ) : null}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-ink">{label}</p>
        {hint ? <p className="truncate text-[11px] text-faint">{hint}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-hairline'
        }`}
      >
        <span
          aria-hidden
          className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}
