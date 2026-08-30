import { describe, expect, it } from 'vitest';
import { buildIcsEvent, compactIcsDate, eventTitle, icsFilename } from './ics';

describe('eventTitle', () => {
  it('joins company and job title with an em dash', () => {
    expect(eventTitle('Acme', 'Staff Engineer')).toBe('Acme — Staff Engineer');
  });

  it('falls back when either side is blank', () => {
    expect(eventTitle('  ', 'Engineer')).toBe('Untitled company — Engineer');
    expect(eventTitle('Acme', '   ')).toBe('Acme — Untitled role');
  });
});

describe('compactIcsDate', () => {
  it('strips hyphens from a date-only ISO string', () => {
    expect(compactIcsDate('2026-08-29')).toBe('20260829');
    expect(compactIcsDate(' 2026-01-05 ')).toBe('20260105');
  });
});

describe('buildIcsEvent', () => {
  const ics = buildIcsEvent({
    title: eventTitle('Acme', 'Staff Engineer'),
    date: '2026-08-29',
    uid: 'app-123-2026-08-29',
  });

  it('is a VCALENDAR 2.0 document with a PRODID', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('VERSION:2.0\r\n');
    expect(ics).toContain('PRODID:-//Job Application Tracker//EN\r\n');
    expect(ics).toContain('BEGIN:VEVENT\r\n');
    expect(ics).toContain('END:VEVENT\r\n');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('uses DTSTART;VALUE=DATE (all-day, no timezone) for the date-only value', () => {
    expect(ics).toContain('DTSTART;VALUE=DATE:20260829\r\n');
    expect(ics).not.toContain('TZID');
    expect(ics).not.toMatch(/DTSTART[^:\n]*:\d{8}T/);
  });

  it('puts company name and job title in SUMMARY', () => {
    expect(ics).toContain('SUMMARY:Acme — Staff Engineer\r\n');
  });

  it('uses the supplied deterministic UID', () => {
    expect(ics).toContain('UID:app-123-2026-08-29\r\n');
  });

  it('uses CRLF line endings throughout', () => {
    expect(ics.includes('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '').includes('\n')).toBe(false);
  });

  it('escapes ICS-special characters in SUMMARY', () => {
    const escaped = buildIcsEvent({
      title: 'Acme, Inc.; "Labs"',
      date: '2026-08-30',
      uid: 'x-2026-08-30',
    });
    expect(escaped).toContain('SUMMARY:Acme\\, Inc.\\; "Labs"\r\n');
  });

  it('defaults UID to jat-{compactDate} when omitted', () => {
    const fallback = buildIcsEvent({ title: 'Acme — Engineer', date: '2026-09-01' });
    expect(fallback).toContain('UID:jat-20260901\r\n');
  });
});

describe('icsFilename', () => {
  it('slugs company, title and date and ends in .ics', () => {
    expect(icsFilename('Acme Corp', 'Staff Engineer', '2026-08-29')).toBe(
      'acme-corp-staff-engineer-2026-08-29.ics',
    );
  });

  it('collapses punctuation and whitespace', () => {
    expect(icsFilename('ACME!!!', 'C++ Engineer', '2026-08-29')).toBe('acme-c-engineer-2026-08-29.ics');
  });

  it('still ends in .ics when names are blank', () => {
    expect(icsFilename('', '', '2026-08-29')).toBe('2026-08-29.ics');
    expect(icsFilename('  ', '  ', '')).toBe('event.ics');
    expect(icsFilename('Acme', 'Engineer', '2026-08-29').endsWith('.ics')).toBe(true);
  });
});
