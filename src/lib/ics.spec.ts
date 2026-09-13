import { describe, expect, it } from 'vitest';
import {
  buildIcsEvent,
  compactIcsDate,
  compactIcsTime,
  eventDescription,
  eventTitle,
  followUpTitle,
  icsFilename,
} from './ics';

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

describe('eventDescription', () => {
  it('lists only the fields that are filled, one per line', () => {
    const description = eventDescription({
      jobLocation: 'Doha, Qatar',
      jobPortal: 'LinkedIn',
      applicationDate: '2026-09-06',
      status: 'Applied',
      recruiterName: 'Jane Doe',
      recruiterContact: 'jane@acme.test',
      salary: '6,500 QAR',
      notes: 'Referred by Sam.',
      tags: ['priority', 'remote'],
    });
    expect(description).toBe(
      [
        'Location: Doha, Qatar',
        'Source: LinkedIn',
        'Applied: 2026-09-06',
        'Stage: Applied',
        'Recruiter: Jane Doe',
        'Contact: jane@acme.test',
        'Package: 6,500 QAR',
        'Tags: priority, remote',
        'Notes: Referred by Sam.',
      ].join('\n'),
    );
  });

  it('returns null when there is nothing to say', () => {
    expect(eventDescription(null)).toBeNull();
    expect(eventDescription(undefined)).toBeNull();
    expect(eventDescription({ jobLocation: '   ', notes: '', tags: [] })).toBeNull();
  });

  it('caps a long note instead of writing the whole record', () => {
    const description = eventDescription({ notes: 'x'.repeat(900) })!;
    expect(description.startsWith('Notes: ')).toBe(true);
    expect(description.length).toBeLessThan(700);
    expect(description.endsWith('…')).toBe(true);
  });
});

describe('compactIcsTime', () => {
  it('turns HH:MM into HHMMSS and rejects junk', () => {
    expect(compactIcsTime('09:00')).toBe('090000');
    expect(compactIcsTime('23:59')).toBe('235900');
    expect(compactIcsTime('9am')).toBeNull();
    expect(compactIcsTime('24:00')).toBeNull();
  });
});

describe('buildIcsEvent with an alarm time', () => {
  const ics = buildIcsEvent({
    title: followUpTitle('Acme', 'Staff Engineer'),
    date: '2026-09-05',
    uid: 'app-123-follow-up-2026-09-05',
    description: eventDescription({ jobLocation: 'Doha', notes: 'Ask about the panel loop.' }),
    location: 'Doha',
    url: 'https://acme.test/jobs/42',
    alarmAt: '09:00',
  });

  it('titles a follow-up as an instruction', () => {
    expect(followUpTitle('Acme', 'Staff Engineer')).toBe('Follow up: Acme — Staff Engineer');
    expect(ics).toContain('SUMMARY:Follow up: Acme — Staff Engineer\r\n');
  });

  it('becomes a timed event at the alarm time, not an all-day one', () => {
    expect(ics).toContain('DTSTART:20260905T090000\r\n');
    expect(ics).toContain('DTEND:20260905T093000\r\n');
    expect(ics).not.toContain('VALUE=DATE');
    // Floating local time: no TZID and no trailing Z on the start.
    expect(ics).not.toContain('TZID');
    expect(ics).not.toMatch(/DTSTART:\d{8}T\d{6}Z/);
  });

  it('carries a VALARM that fires at the event', () => {
    expect(ics).toContain('BEGIN:VALARM\r\n');
    expect(ics).toContain('ACTION:DISPLAY\r\n');
    expect(ics).toContain('TRIGGER:-PT0S\r\n');
    expect(ics).toContain('END:VALARM\r\n');
    // The alarm block sits inside the event.
    expect(ics.indexOf('BEGIN:VALARM')).toBeGreaterThan(ics.indexOf('BEGIN:VEVENT'));
    expect(ics.indexOf('END:VALARM')).toBeLessThan(ics.indexOf('END:VEVENT'));
  });

  it('puts the job details in DESCRIPTION, LOCATION and URL', () => {
    expect(ics).toContain('LOCATION:Doha\r\n');
    expect(ics).toContain('DESCRIPTION:Location: Doha\\nNotes: Ask about the panel loop.\r\n');
    expect(ics).toContain('URL:https://acme.test/jobs/42\r\n');
  });

  it('keeps CRLF endings and stays one document', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '').includes('\n')).toBe(false);
  });
});

describe('buildIcsEvent without an alarm time', () => {
  it('stays an all-day marker with no VALARM', () => {
    const ics = buildIcsEvent({
      title: eventTitle('Acme', 'Staff Engineer'),
      date: '2026-09-05',
      description: eventDescription({ status: 'Interview' }),
    });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260905\r\n');
    expect(ics).toContain('DESCRIPTION:Stage: Interview\r\n');
    expect(ics).not.toContain('BEGIN:VALARM');
  });

  it('falls back to an all-day event when the alarm time is junk', () => {
    const ics = buildIcsEvent({ title: 'Acme — Engineer', date: '2026-09-05', alarmAt: 'nine' });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260905\r\n');
    expect(ics).not.toContain('BEGIN:VALARM');
  });

  it('omits empty description, location and url properties', () => {
    const ics = buildIcsEvent({
      title: 'Acme — Engineer',
      date: '2026-09-05',
      description: null,
      location: '   ',
      url: '',
    });
    expect(ics).not.toContain('DESCRIPTION:');
    expect(ics).not.toContain('LOCATION:');
    expect(ics).not.toContain('URL:');
  });
});
