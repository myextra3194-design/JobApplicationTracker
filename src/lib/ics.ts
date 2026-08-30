/**
 * Part 7: per-event `.ics` download. Dates on a JobApplication are date-only
 * (`YYYY-MM-DD`), so the file is an all-day VEVENT — `DTSTART;VALUE=DATE`, no
 * timezone math. One event per click, never a bulk dump.
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
}

/** Company — Job Title. Em dash matches the rest of the app's labels. */
export function eventTitle(companyName: string, jobTitle: string): string {
  const company = companyName.trim() || 'Untitled company';
  const title = jobTitle.trim() || 'Untitled role';
  return `${company} — ${title}`;
}

/** `YYYY-MM-DD` → `YYYYMMDD` for `DTSTART;VALUE=DATE`. */
export function compactIcsDate(isoDate: string): string {
  const digits = isoDate.trim().replace(/-/g, '');
  return /^\d{8}$/.test(digits) ? digits : digits.replace(/\D/g, '').slice(0, 8);
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

/**
 * One all-day VEVENT. CRLF line endings. `DTSTART;VALUE=DATE` so Google Calendar
 * / Outlook import it as an all-day event rather than a timed one.
 */
export function buildIcsEvent({ title, date, uid }: IcsEventInput): string {
  const compact = compactIcsDate(date);
  const resolvedUid = (uid ?? '').trim() || `jat-${compact}`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Job Application Tracker//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${resolvedUid}`,
    `DTSTAMP:${compact}T000000Z`,
    `DTSTART;VALUE=DATE:${compact}`,
    `DTEND;VALUE=DATE:${nextCompactDate(compact)}`,
    `SUMMARY:${icsEscape(title)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
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

/** Build + name + download one follow-up or interview event. */
export function downloadDateAsIcs(opts: {
  companyName: string;
  jobTitle: string;
  date: string;
  uid?: string;
}): void {
  const title = eventTitle(opts.companyName, opts.jobTitle);
  const ics = buildIcsEvent({ title, date: opts.date, uid: opts.uid });
  downloadIcs(ics, icsFilename(opts.companyName, opts.jobTitle, opts.date));
}
