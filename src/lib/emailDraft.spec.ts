import { describe, expect, it } from 'vitest';
import {
  buildEmailDraft,
  copyText,
  draftAsPlainText,
  EMAIL_TEMPLATE_IDS,
  EMAIL_TEMPLATES,
  extractEmailAddress,
  greetingFor,
  humanDate,
  mailtoHref,
  mailtoOverLimit,
  MAILTO_SOFT_LIMIT,
  placeholdersIn,
  placeholderSummary,
  recruiterFirstName,
  researchHook,
  SENDER_PLACEHOLDER,
  suggestTemplate,
  type EmailSource,
} from './emailDraft';
import type { ApplicationStatus } from './types';

/** A record with everything filled, so each test can blank one field at a time. */
function fullSource(patch: Partial<EmailSource> = {}): EmailSource {
  return {
    companyName: 'Acme Robotics',
    jobTitle: 'Staff Engineer',
    jobLocation: 'Doha',
    jobPortal: 'LinkedIn',
    jobLink: 'https://acme.example/jobs/42',
    recruiterName: 'Dr. Samir Khan',
    recruiterContact: 'samir.khan@acme.example · +974 5555 1234',
    status: 'Applied' as ApplicationStatus,
    applicationDate: '2026-03-05',
    interviewDate: '2026-03-20',
    interviewStatus: 'Not scheduled',
    companyResearch: 'Series B robotics. Strong engineering culture, shipped 3 products in 2025.',
    cvVersionUsed: 'v3-tailored',
    ...patch,
  };
}

describe('EMAIL_TEMPLATES', () => {
  it('lists every id exactly once, in picker order', () => {
    expect(EMAIL_TEMPLATES.map((t) => t.id)).toEqual([...EMAIL_TEMPLATE_IDS]);
    expect(new Set(EMAIL_TEMPLATES.map((t) => t.id)).size).toBe(EMAIL_TEMPLATE_IDS.length);
  });
});

describe('extractEmailAddress', () => {
  it('finds the address inside free-form contact text', () => {
    expect(extractEmailAddress('samir.khan@acme.example · +974 5555 1234')).toBe('samir.khan@acme.example');
    expect(extractEmailAddress('Call 5555 1234, or sam@acme.example')).toBe('sam@acme.example');
  });

  it('returns empty when there is only a phone number, or nothing at all', () => {
    expect(extractEmailAddress('+974 5555 1234')).toBe('');
    expect(extractEmailAddress('   ')).toBe('');
  });
});

describe('recruiterFirstName / greetingFor', () => {
  it('skips an honorific rather than greeting someone as "Dr."', () => {
    expect(recruiterFirstName('Dr. Samir Khan')).toBe('Samir');
    expect(recruiterFirstName('  Samir   Khan ')).toBe('Samir');
    expect(recruiterFirstName('')).toBe('');
  });

  it('greet by first name when known, neutrally when not', () => {
    expect(greetingFor('Ms Nadia Ali')).toBe('Hi Nadia,');
    expect(greetingFor('')).toBe('Hello,');
  });
});

describe('humanDate', () => {
  it('reads a date-only value as a day, month and year', () => {
    expect(humanDate('2026-03-05')).toBe('5 March 2026');
    expect(humanDate('2026-12-31')).toBe('31 December 2026');
  });

  it('is empty — never NaN — for a blank, form-empty or malformed date', () => {
    expect(humanDate('')).toBe('');
    expect(humanDate(null)).toBe('');
    expect(humanDate('next tuesday')).toBe('');
    expect(humanDate('2026-13-45')).toBe('');
  });
});

describe('researchHook', () => {
  it('takes the first sentence only', () => {
    expect(researchHook('Series B robotics. Shipped 3 products.')).toBe('Series B robotics.');
  });

  it('collapses whitespace and caps a very long note with an ellipsis', () => {
    expect(researchHook('  one   long\nline ')).toBe('one long line');
    const capped = researchHook('x'.repeat(400), 60);
    expect(capped.length).toBe(60);
    expect(capped.endsWith('…')).toBe(true);
  });

  it('is empty when there are no research notes', () => {
    expect(researchHook('')).toBe('');
    expect(researchHook('   \n ')).toBe('');
  });
});

describe('suggestTemplate', () => {
  const today = new Date('2026-03-10T09:00:00Z');

  it('suggests the application email for a Saved row', () => {
    expect(suggestTemplate(fullSource({ status: 'Saved' }), today)).toBe('application');
  });

  it('suggests a follow-up while the process is still running', () => {
    expect(suggestTemplate(fullSource({ status: 'Applied' }), today)).toBe('follow-up');
    expect(suggestTemplate(fullSource({ status: 'Shortlisted' }), today)).toBe('follow-up');
    expect(suggestTemplate(fullSource({ status: 'Offer' }), today)).toBe('follow-up');
  });

  it('suggests the thank-you once an interview is marked Completed', () => {
    expect(suggestTemplate(fullSource({ interviewStatus: 'Completed' }), today)).toBe('interview-thanks');
  });

  it('suggests the thank-you for a past interview date, but not a future one', () => {
    expect(suggestTemplate(fullSource({ status: 'Interview', interviewDate: '2026-03-01' }), today)).toBe(
      'interview-thanks',
    );
    expect(suggestTemplate(fullSource({ status: 'Interview', interviewDate: '2026-03-20' }), today)).toBe(
      'follow-up',
    );
    // An unparseable date is not "today": it must not flip the suggestion.
    expect(suggestTemplate(fullSource({ status: 'Interview', interviewDate: null }), today)).toBe('follow-up');
  });
});

describe('buildEmailDraft', () => {
  it('fills the application email from the record, recruiter address included', () => {
    const draft = buildEmailDraft({ template: 'application', source: fullSource(), senderName: 'Noor Ahmed' });
    expect(draft.to).toBe('samir.khan@acme.example');
    expect(draft.subject).toBe('Application: Staff Engineer at Acme Robotics');
    expect(draft.body).toContain('Hi Samir,');
    expect(draft.body).toContain("I'm applying for the Staff Engineer role at Acme Robotics, based in Doha.");
    expect(draft.body).toContain('I came across it on LinkedIn.');
    expect(draft.body).toContain('What draws me to Acme Robotics: Series B robotics.');
    expect(draft.body).toContain('My CV is attached (version: v3-tailored).');
    expect(draft.body).toContain('The posting is here: https://acme.example/jobs/42.');
    expect(draft.body).toContain('Kind regards,\nNoor Ahmed');
    expect(draft.body.endsWith('Noor Ahmed')).toBe(true);
  });

  it('leaves a bracketed placeholder for every field the record does not have', () => {
    const draft = buildEmailDraft({
      template: 'application',
      source: fullSource({
        companyName: '',
        jobTitle: '  ',
        jobLocation: '',
        jobPortal: '',
        jobLink: '',
        recruiterName: '',
        recruiterContact: '',
        companyResearch: '',
        cvVersionUsed: null,
      }),
    });
    expect(draft.to).toBe('');
    expect(draft.subject).toBe('Application: [Job title] at [Company]');
    expect(draft.body).toContain('Hello,');
    expect(draft.body).toContain('[Job title] role at [Company]');
    expect(draft.body).not.toContain('based in');
    expect(draft.body).not.toContain('I came across it on');
    expect(draft.body).not.toContain('The posting is here');
    expect(draft.body).toContain('My CV is attached.');
    expect(draft.body).toContain(SENDER_PLACEHOLDER);
    // No silent gaps: a missing field is always visible as a placeholder.
    expect(placeholdersIn(draft.body).length).toBeGreaterThan(0);
  });

  it('dates the follow-up from the application date, and says "recently" without one', () => {
    const dated = buildEmailDraft({ template: 'follow-up', source: fullSource() });
    expect(dated.subject).toBe('Following up: Staff Engineer application at Acme Robotics');
    expect(dated.body).toContain('I applied for the Staff Engineer role at Acme Robotics on 5 March 2026 (via LinkedIn),');

    const undated = buildEmailDraft({ template: 'follow-up', source: fullSource({ applicationDate: null }) });
    expect(undated.body).toContain('role at Acme Robotics recently (via LinkedIn),');
  });

  it('thanks for a dated interview, and falls back to an undated thank-you', () => {
    const dated = buildEmailDraft({ template: 'interview-thanks', source: fullSource() });
    expect(dated.subject).toBe('Thank you — Staff Engineer interview at Acme Robotics');
    expect(dated.body).toContain('Thank you for the time on 20 March 2026');

    const undated = buildEmailDraft({
      template: 'interview-thanks',
      source: fullSource({ interviewDate: null }),
    });
    expect(undated.body).toContain('Thank you for taking the time to speak with me');
    expect(undated.body).not.toContain('on null');
  });

  it('addresses a referral to the contact, never to the recruiter on the record', () => {
    const draft = buildEmailDraft({ template: 'referral', source: fullSource() });
    expect(draft.to).toBe('');
    expect(draft.body).toContain('Hi [first name],');
    expect(draft.body).not.toContain('Samir');
    expect(draft.body).not.toContain('samir.khan@acme.example');
    expect(draft.body).toContain('Would you be comfortable referring me');
    expect(draft.subject).toBe('Quick question about the Staff Engineer role at Acme Robotics');
  });

  it('accepts a form draft as a source (dates as empty strings, no record yet)', () => {
    const draft = buildEmailDraft({
      template: 'application',
      source: {
        companyName: 'Blue Harbor',
        jobTitle: 'Frontend Engineer',
        jobLocation: '',
        jobPortal: '',
        jobLink: '',
        recruiterName: '',
        recruiterContact: '',
        status: 'Saved',
        applicationDate: '',
        interviewDate: '',
        interviewStatus: '',
        companyResearch: '',
        cvVersionUsed: '',
      },
    });
    expect(draft.subject).toBe('Application: Frontend Engineer at Blue Harbor');
    expect(draft.body).toContain('Blue Harbor');
  });
});

describe('draftAsPlainText', () => {
  it('leads with To and Subject, then a blank line, then the body', () => {
    const draft = buildEmailDraft({ template: 'application', source: fullSource() });
    const text = draftAsPlainText(draft);
    expect(text.startsWith('To: samir.khan@acme.example\nSubject: Application: ')).toBe(true);
    expect(text).toContain('\n\nHi Samir,');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('omits the To line when there is no recipient', () => {
    const text = draftAsPlainText(buildEmailDraft({ template: 'referral', source: fullSource() }));
    expect(text.startsWith('Subject: ')).toBe(true);
    expect(text).not.toContain('To: ');
  });
});

describe('mailtoHref', () => {
  it('carries the recipient, subject and body, percent-encoded', () => {
    const draft = buildEmailDraft({ template: 'application', source: fullSource(), senderName: 'Noor Ahmed' });
    const href = mailtoHref(draft);
    expect(href.startsWith('mailto:samir.khan%40acme.example?')).toBe(true);
    expect(href).toContain('subject=Application%3A%20Staff%20Engineer%20at%20Acme%20Robotics');
    expect(href).toContain('body=Hi%20Samir%2C');
    // Spaces must be %20: a '+' shows up literally in several mail clients.
    expect(href).not.toContain('+');
    expect(href).toContain('%0A%0A');
  });

  it('still opens a compose window with no recipient', () => {
    const href = mailtoHref({ template: 'referral', to: '', subject: 'Hi', body: 'There' });
    expect(href).toBe('mailto:?subject=Hi&body=There');
  });

  it('flags a draft too long for some mail clients', () => {
    const short = mailtoHref({ template: 'application', to: 'a@b.co', subject: 'Hi', body: 'There' });
    expect(mailtoOverLimit(short)).toBe(false);
    const long = mailtoHref({ template: 'application', to: 'a@b.co', subject: 'Hi', body: 'x'.repeat(4000) });
    expect(mailtoOverLimit(long)).toBe(true);
    expect(MAILTO_SOFT_LIMIT).toBeLessThan(2000);
  });
});

describe('placeholdersIn / placeholderSummary', () => {
  it('lists each bracketed gap once, in order of appearance', () => {
    expect(placeholdersIn('[Your name] then [Job title] then [Your name] again')).toEqual([
      '[Your name]',
      '[Job title]',
    ]);
    expect(placeholdersIn('no gaps here')).toEqual([]);
  });

  it('counts gaps across subject and body, and says nothing when there are none', () => {
    const draft = buildEmailDraft({ template: 'application', source: fullSource(), senderName: 'Noor Ahmed' });
    expect(placeholderSummary(draft)).toMatch(/^\d+ placeholders? to fill in before sending$/);
    expect(placeholderSummary({ template: 'application', to: '', subject: 'Done', body: 'All filled in.' })).toBeNull();
  });
});

describe('copyText', () => {
  it('reports failure rather than throwing when no clipboard exists (node)', async () => {
    expect(globalThis.navigator?.clipboard).toBeUndefined();
    await expect(copyText('anything')).resolves.toBe(false);
  });
});
