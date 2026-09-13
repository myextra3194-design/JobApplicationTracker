/**
 * Part 7: per-event `.ics` download. Dates on a JobApplication are date-only
 * (`YYYY-MM-DD`), so the file is an all-day VEVENT — `DTSTART;VALUE=DATE`, no
 * timezone math. One event per click, never a bulk dump.
 *
 * Follow-up exports (Part 14) can additionally be *timed* events at the user's
 * reminder time with a `VALARM`, so the calendar app rings instead of relying
 * on its own all-day notification. Times are floating local wall-clock values
 * (`DTSTART:20260920T090000`, no `TZID`) for the same reason the all-day form
 * avoids timezones: a date-only field has no zone to interpret.
 *
 * The builder is pure. The download is a thin Blob + `<a download>` wrapper and
 * is not persistence: no storage writes, no new adapter methods.
 */

export interface IcsEventInput {
  title: string;
  /** Date-only `YYYY-MM-DD`. */
  date: string;
  /** Deterministic when provided; defaults to `jat-${compactDate}`. */
  uid?: string;
  /** Multi-line TEXT for `DESCRIPTION`; newlines escape to `\n`. */
  description?: string | null;
  location?: string | null;
  /** Absolute URL for the `URL` property. Left unescaped so it stays clickable. */
  url?: string | null;
  /**
   * Local wall-clock `HH:MM`. When set, the event is a timed event at that
   * moment with a `VALARM` on it — i.e. an alarm the calendar app fires.
   * Omit for an all-day marker.
   */
  alarmAt?: string | null;
}

/**
 * The job fields that travel with a calendar event, so the exported entry says
 * what to chase and who to contact without opening the tracker. Every field is
 * optional: an unsaved form's draft has the same shape as a record.
 */
export interface IcsJobDetails {
  jobLocation?: string | null;
  jobPortal?: string | null;
  applicationDate?: string | null;
  status?: string | null;
  recruiterName?: string | null;
  recruiterContact?: string | null;
  salary?: string | null;
  jobLink?: string | null;
  notes?: string | null;
  companyResearch?: string | null;
  tags?: readonly string[] | null;
}

/** Notes are capped: a calendar entry is a pointer, not the whole record. */
export const ICS_NOTES_LIMIT = 600;
/** How long a timed (alarmed) event blocks in the calendar. */
const TIMED_EVENT_MINUTES = 30;

/** Company — Job Title. Em dash matches the rest of the app's labels. */
export function eventTitle(companyName: string, jobTitle: string): string {
  const company = companyName.trim() || 'Untitled company';
  const title = jobTitle.trim() || 'Untitled role';
  return `${company} — ${title}`;
}

/** A follow-up entry reads as an instruction, not just a label. */
export function followUpTitle(companyName: string, jobTitle: string): string {
  return `Follow up: ${eventTitle(companyName, jobTitle)}`;
}

/** `YYYY-MM-DD` → `YYYYMMDD` for `DTSTART;VALUE=DATE`. */
export function compactIcsDate(isoDate: string): string {
  const digits = isoDate.trim().replace(/-/g, '');
  return /^\d{8}$/.test(digits) ? digits : digits.replace(/\D/g, '').slice(0, 8);
}

/** `HH:MM` → `HHMMSS`, or null when it is not a valid wall-clock time. */
export function compactIcsTime(time: string): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!match) return null;
  return `${match[1]}${match[2]}00`;
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\n|\r/g, '\\n');
}

function nextCompactDate(compact: string): string {
  if (!/^\d{8}$/.test(compact)) return compact;
  const iso = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) return compact;
  return new Date(ms + 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');
}

/** `HHMMSS` plus a whole number of minutes → `HHMMSS`, wrapped within the day. */
function shiftCompactTime(compactTime: string, minutes: number): string {
  const hours = Number(compactTime.slice(0, 2));
  const mins = Number(compactTime.slice(2, 4));
  const total = (hours * 60 + mins + minutes + 24 * 60) % (24 * 60);
  return `${`${Math.floor(total / 60)}`.padStart(2, '0')}${`${total % 60}`.padStart(2, '0')}00`;
}

/**
 * The `DESCRIPTION` body for a job: only the fields that are actually filled,
 * one per line, in the order the form presents them. Returns null when there
 * is nothing to say, so no empty property is emitted.
 */
export function eventDescription(details: IcsJobDetails | null | undefined): string | null {
  if (!details) return null;
  const lines: string[] = [];
  const add = (label: string, value: unknown) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text) lines.push(`${label}: ${text}`);
  };

  add('Location', details.jobLocation);
  add('Source', details.jobPortal);
  add('Applied', details.applicationDate);
  add('Stage', details.status);
  add('Recruiter', details.recruiterName);
  add('Contact', details.recruiterContact);
  add('Package', details.salary);
  if (details.tags && details.tags.length > 0) add('Tags', details.tags.map((tag) => tag.trim()).filter(Boolean).join(', '));

  const capped = (label: string, value: string | null | undefined) => {
    const text = (value ?? '').trim();
    if (text) lines.push(`${label}: ${text.length > ICS_NOTES_LIMIT ? `${text.slice(0, ICS_NOTES_LIMIT)}…` : text}`);
  };
  capped('Notes', details.notes);
  capped('Research', details.companyResearch);

  return lines.length > 0 ? lines.join('\n') : null;
}

/**
 * One VEVENT. CRLF line endings. All-day (`DTSTART;VALUE=DATE`) unless
 * `alarmAt` is given, in which case it is a floating-time event at that moment
 * with a `VALARM` on it.
 */
export function buildIcsEvent({ title, date, uid, description, location, url, alarmAt }: IcsEventInput): string {
  const compact = compactIcsDate(date);
  const resolvedUid = (uid ?? '').trim() || `jat-${compact}`;
  const time = alarmAt ? compactIcsTime(alarmAt) : null;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Job Application Tracker//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${resolvedUid}`,
    `DTSTAMP:${compact}T000000Z`,
  ];

  if (time) {
    // Floating local time: no TZID, no trailing `Z`. 30-minute block so the
    // entry is visible as an appointment rather than a zero-length dot.
    lines.push(`DTSTART:${compact}T${time}`);
    lines.push(`DTEND:${compact}T${shiftCompactTime(time, TIMED_EVENT_MINUTES)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compact}`);
    lines.push(`DTEND;VALUE=DATE:${nextCompactDate(compact)}`);
  }

  lines.push(`SUMMARY:${icsEscape(title)}`);
  if (location && location.trim()) lines.push(`LOCATION:${icsEscape(location.trim())}`);
  if (description && description.trim()) lines.push(`DESCRIPTION:${icsEscape(description.trim())}`);
  if (url && url.trim()) lines.push(`URL:${url.trim()}`);

  if (time) {
    // `-PT0S` is the "at the time of the event" trigger Google Calendar itself
    // writes for a reminder with no offset.
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(title)}`, 'TRIGGER:-PT0S', 'END:VALARM');
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Slugged filename ending in `.ics`. Non-ascii / punctuation collapse to
 * hyphens; a completely empty input still produces a downloadable name.
 */
export function icsFilename(companyName: string, jobTitle: string, date: string): string {
  const slug = [companyName, jobTitle, date]
    .map((part) =>
      part
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter(Boolean)
    .join('-')
    .replace(/-+/g, '-')
    .slice(0, 80);
  return `${slug || 'event'}.ics`;
}

/** Thin UI wrapper: Blob + anchor click. Not persistence. */
export function downloadIcs(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Build + name + download one follow-up or interview event, carrying the job's
 * details with it. `alarmAt` (`HH:MM`) makes it a timed, alarmed event — the
 * form and the dashboard pass the user's reminder time for follow-ups.
 */
export function downloadDateAsIcs(opts: {
  companyName: string;
  jobTitle: string;
  date: string;
  uid?: string;
  /** Which date this is — a follow-up entry is titled as an instruction. */
  kind?: 'follow-up' | 'interview';
  /** Job fields for `DESCRIPTION` / `LOCATION` / `URL`. */
  details?: IcsJobDetails | null;
  /** Local wall-clock time for the alarm; omit for an all-day marker. */
  alarmAt?: string | null;
}): void {
  const isFollowUp = opts.kind === 'follow-up';
  const title = isFollowUp
    ? followUpTitle(opts.companyName, opts.jobTitle)
    : eventTitle(opts.companyName, opts.jobTitle);
  const details = opts.details ?? null;
  const ics = buildIcsEvent({
    title,
    date: opts.date,
    uid: opts.uid,
    description: eventDescription(details),
    location: details?.jobLocation ?? null,
    url: details?.jobLink ?? null,
    alarmAt: opts.alarmAt ?? null,
  });
  downloadIcs(ics, icsFilename(opts.companyName, isFollowUp ? `Follow up ${opts.jobTitle}` : opts.jobTitle, opts.date));
}
