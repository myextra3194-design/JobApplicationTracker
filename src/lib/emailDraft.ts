/**
 * Part 14 — email drafts.
 *
 * A record already holds everything an outreach email needs: company, role,
 * recruiter name and contact, the posting link, the dates and the research
 * notes. This module turns that into a subject + body the user can edit, copy,
 * or hand to their mail client through a `mailto:` link.
 *
 * Same split as `src/lib/ics.ts`, on purpose: pure builders here (unit-tested in
 * plain node in `src/lib/emailDraft.spec.ts`) and one thin DOM helper for the
 * clipboard. **Nothing is persisted.** A draft is not a record: generating one
 * writes no storage, adds no adapter method, and leaves nothing behind when the
 * form closes — which is also why the sender's name is typed in the panel
 * rather than becoming a new settings field.
 *
 * Two rules every template follows:
 *  - a field the record does not have becomes a `[bracketed placeholder]`,
 *    never a silent gap. A blank reads as a finished sentence; a bracket does not.
 *  - the output is plain prose with no markup, so it survives a paste into any
 *    mail client and a `mailto:` body without translation.
 */

import { daysFromToday } from './pipeline';
import type { ApplicationStatus } from './types';

export const EMAIL_TEMPLATE_IDS = ['application', 'follow-up', 'interview-thanks', 'referral'] as const;

export type EmailTemplateId = (typeof EMAIL_TEMPLATE_IDS)[number];

export interface EmailTemplateOption {
  id: EmailTemplateId;
  label: string;
  /** One line under the picker, so choosing is not a guess. */
  hint: string;
}

export const EMAIL_TEMPLATES: readonly EmailTemplateOption[] = [
  { id: 'application', label: 'Application', hint: 'Send your CV to the recruiter or hiring manager.' },
  { id: 'follow-up', label: 'Follow-up', hint: 'Chase an application you have already sent.' },
  { id: 'interview-thanks', label: 'Thank-you', hint: 'After an interview, while it is still fresh.' },
  { id: 'referral', label: 'Referral ask', hint: 'To a contact who works at, or knows, the company.' },
];

/**
 * The fields a draft reads. Deliberately structural rather than
 * `JobApplication`: the add/edit form holds an `ApplicationFormDraft` (dates as
 * `''`, no id yet), and both shapes satisfy this without a translation step —
 * so the panel can draft from what is typed *before* the row is ever saved.
 */
export interface EmailSource {
  companyName: string;
  jobTitle: string;
  jobLocation: string;
  jobPortal: string;
  jobLink: string;
  recruiterName: string;
  recruiterContact: string;
  status: ApplicationStatus;
  applicationDate: string | null;
  interviewDate: string | null;
  interviewStatus: string;
  companyResearch: string;
  cvVersionUsed: string | null;
}

export interface EmailDraft {
  template: EmailTemplateId;
  /** Resolved recipient; `''` when the record has no usable address. */
  to: string;
  subject: string;
  body: string;
}

/**
 * Longer than this and some mail clients quietly drop the `mailto:` URL
 * (Windows/Outlook cap a URL around 2000 characters). The draft is still
 * copyable — the UI says so instead of failing silently.
 */
export const MAILTO_SOFT_LIMIT = 1800;

const PLACEHOLDER_PATTERN = /\[[^\]\n]{1,200}\]/g;

const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;

const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'prof', 'professor']);

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Your name, unknown. Every template signs off with it when nothing is typed. */
export const SENDER_PLACEHOLDER = '[Your name]';

// --- field readers ------------------------------------------------------------

/** Trim, or a bracketed placeholder. One rule, so a blank never reads as prose. */
function fill(value: string | null | undefined, placeholder: string): string {
  const text = (value ?? '').trim();
  return text === '' ? placeholder : text;
}

/**
 * `recruiterContact` is free-form on purpose (email, phone, or both), so the
 * address is *found* in it rather than assumed to be all of it. `''` when there
 * is no address — the UI then asks for one instead of mailing a phone number.
 */
export function extractEmailAddress(contact: string): string {
  return (contact ?? '').match(EMAIL_IN_TEXT)?.[0] ?? '';
}

/** "Dr. Samir Khan" → "Samir". An honorific is not a first name. */
export function recruiterFirstName(name: string): string {
  const tokens = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const given = tokens.find((token) => !HONORIFICS.has(token.toLowerCase().replace(/\.$/, '')));
  return given ?? '';
}

/** A greeting that works whether or not the recruiter is known. */
export function greetingFor(name: string): string {
  const first = recruiterFirstName(name);
  return first ? `Hi ${first},` : 'Hello,';
}

/** `YYYY-MM-DD` → `5 March 2026`. Anything unparseable is `''`, never `NaN`. */
export function humanDate(iso: string | null | undefined): string {
  const value = (iso ?? '').trim();
  if (!DATE_ONLY.test(value)) return '';
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms)) return '';
  const date = new Date(ms);
  const month = MONTHS[date.getUTCMonth()] ?? value.slice(5, 7);
  return `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}`;
}

/**
 * The first sentence of the research notes, capped — the "why this company"
 * line. Split on punctuation rather than a lookbehind regex: a lookbehind in a
 * literal is a parse-time SyntaxError on older Safari, and this app installs as
 * a PWA on phones.
 */
export function researchHook(research: string, maxChars = 180): string {
  const text = (research ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  const end = text.search(/[.!?](\s|$)/);
  const sentence = end === -1 ? text : text.slice(0, end + 1);
  return sentence.length > maxChars ? `${sentence.slice(0, maxChars - 1).trimEnd()}…` : sentence;
}

// --- template choice ----------------------------------------------------------

/**
 * The template this record is probably waiting for. Status drives it, with two
 * interview refinements: an interview marked Completed, or an interview date
 * that has already passed, means the thank-you note is the next email to send.
 * A *future* interview date must not suggest one.
 */
export function suggestTemplate(source: EmailSource, today: Date = new Date()): EmailTemplateId {
  if (/complet/i.test(source.interviewStatus ?? '')) return 'interview-thanks';
  if (source.status === 'Interview' && isPastDate(source.interviewDate, today)) return 'interview-thanks';
  if (source.status === 'Saved') return 'application';
  return 'follow-up';
}

function isPastDate(iso: string | null | undefined, today: Date): boolean {
  const value = (iso ?? '').trim();
  // `daysFromToday` returns 0 for an unparseable date, which would read as
  // "today" — so the shape is checked here first.
  if (!DATE_ONLY.test(value)) return false;
  return daysFromToday(value, today) < 0;
}

// --- the drafts ---------------------------------------------------------------

export interface BuildEmailDraftOptions {
  template: EmailTemplateId;
  source: EmailSource;
  /** Signature name. Blank leaves the `[Your name]` placeholder in place. */
  senderName?: string;
}

/** Subject + body for one template, filled from the record. */
export function buildEmailDraft({ template, source, senderName = '' }: BuildEmailDraftOptions): EmailDraft {
  const company = fill(source.companyName, '[Company]');
  const role = fill(source.jobTitle, '[Job title]');
  const sender = fill(senderName, SENDER_PLACEHOLDER);
  const signOff = `Kind regards,\n${sender}`;

  switch (template) {
    case 'application':
      return applicationDraft({ source, company, role, signOff });
    case 'follow-up':
      return followUpDraft({ source, company, role, signOff });
    case 'interview-thanks':
      return interviewThanksDraft({ source, company, role, signOff });
    case 'referral':
      return referralDraft({ source, company, role, signOff });
  }
}

interface DraftParts {
  source: EmailSource;
  company: string;
  role: string;
  signOff: string;
}

/** ", based in Doha" — only when the record has a location. */
function locationClause(source: EmailSource): string {
  const location = (source.jobLocation ?? '').trim();
  return location ? `, based in ${location}` : '';
}

/** "The posting is here: …" as its own sentence, only when there is a link. */
function linkSentence(source: EmailSource): string {
  const link = (source.jobLink ?? '').trim();
  return link ? ` The posting is here: ${link}.` : '';
}

/** " (CV version: v3-tailored)" — only when the record tracks one. */
function cvClause(source: EmailSource): string {
  const version = (source.cvVersionUsed ?? '').trim();
  return version ? ` (version: ${version})` : '';
}

/**
 * The "why this company" line. Research notes are the user's own words about
 * this company, so they are the best available seed; without them the line is a
 * placeholder rather than a generic sentence that reads as if it were finished.
 */
function whyLine(source: EmailSource): string {
  const hook = researchHook(source.companyResearch);
  if (!hook) return '[One line on why this role, and this company, is the one you want.]';
  return `What draws me to ${fill(source.companyName, '[Company]')}: ${hook}`;
}

function applicationDraft({ source, company, role, signOff }: DraftParts): EmailDraft {
  const portal = (source.jobPortal ?? '').trim();
  const paragraphs = [
    greetingFor(source.recruiterName),
    `I'm applying for the ${role} role at ${company}${locationClause(source)}.${
      portal ? ` I came across it on ${portal}.` : ''
    }`,
    whyLine(source),
    '[Two or three lines on your closest experience — the stack, the domain, or the scale you have worked at.]',
    `My CV is attached${cvClause(source)}.${linkSentence(source)}`,
    "I'd welcome a short call at your convenience, and I'm happy to work around your schedule.",
    signOff,
  ];
  return {
    template: 'application',
    to: extractEmailAddress(source.recruiterContact),
    subject: `Application: ${role} at ${company}`,
    body: paragraphs.join('\n\n'),
  };
}

function followUpDraft({ source, company, role, signOff }: DraftParts): EmailDraft {
  const applied = humanDate(source.applicationDate);
  const portal = (source.jobPortal ?? '').trim();
  const when = applied ? ` on ${applied}` : ' recently';
  const via = portal ? ` (via ${portal})` : '';
  const paragraphs = [
    greetingFor(source.recruiterName),
    `I applied for the ${role} role at ${company}${when}${via}, and I wanted to check in on where things stand.`,
    "[One line on why you are still interested — or anything new since you applied: a project shipped, a course finished, a conversation you had.]",
    `Happy to send whatever would help next: references, a work sample, or fifteen minutes on a call.${linkSentence(source)}`,
    signOff,
  ];
  return {
    template: 'follow-up',
    to: extractEmailAddress(source.recruiterContact),
    subject: `Following up: ${role} application at ${company}`,
    body: paragraphs.join('\n\n'),
  };
}

function interviewThanksDraft({ source, company, role, signOff }: DraftParts): EmailDraft {
  const when = humanDate(source.interviewDate);
  const opening = when
    ? `Thank you for the time on ${when} — I enjoyed learning more about the ${role} role and the team at ${company}.`
    : `Thank you for taking the time to speak with me — I enjoyed learning more about the ${role} role and the team at ${company}.`;
  const paragraphs = [
    greetingFor(source.recruiterName),
    opening,
    '[One specific thing from the conversation, and how it connects to something you have done.]',
    "It confirmed my interest in the role. I'd be glad to answer anything further, and I look forward to hearing about next steps.",
    signOff,
  ];
  return {
    template: 'interview-thanks',
    to: extractEmailAddress(source.recruiterContact),
    subject: `Thank you — ${role} interview at ${company}`,
    body: paragraphs.join('\n\n'),
  };
}

/**
 * The referral ask goes to the user's own contact, not to the recruiter on the
 * record — so the greeting and the recipient stay placeholders even when
 * `recruiterName` / `recruiterContact` are filled. Mailing a recruiter a
 * "would you refer me?" note is a mistake this template refuses to make.
 */
function referralDraft({ source, company, role, signOff }: DraftParts): EmailDraft {
  const paragraphs = [
    'Hi [first name],',
    `I'm looking at the ${role} opening at ${company}${locationClause(source)}, and I thought of you.`,
    '[One or two lines on why you are a fit — enough for them to repeat to a hiring manager.]',
    `Would you be comfortable referring me, or pointing me towards whoever is hiring for the team? My CV is attached${cvClause(source)}.${linkSentence(source)} No pressure at all if now is not the right moment.`,
    signOff,
  ];
  return {
    template: 'referral',
    to: '',
    subject: `Quick question about the ${role} role at ${company}`,
    body: paragraphs.join('\n\n'),
  };
}

// --- hand-off -----------------------------------------------------------------

/** Everything a mail client needs, in the order a person reads it. */
export function draftAsPlainText(draft: EmailDraft): string {
  const head = [
    draft.to.trim() ? `To: ${draft.to.trim()}` : '',
    `Subject: ${draft.subject.trim()}`,
  ].filter(Boolean);
  return `${head.join('\n')}\n\n${draft.body.trim()}\n`;
}

/**
 * A `mailto:` URL. Hand-encoded rather than `URLSearchParams`: that encoder
 * turns spaces into `+`, which several mail clients show literally in the body.
 * With no recipient the link still opens a blank compose window pre-filled.
 */
export function mailtoHref(draft: EmailDraft): string {
  const query = [
    draft.subject.trim() ? `subject=${encodeURIComponent(draft.subject.trim())}` : '',
    draft.body.trim() ? `body=${encodeURIComponent(draft.body.trim())}` : '',
  ].filter(Boolean);
  return `mailto:${encodeURIComponent(draft.to.trim())}${query.length > 0 ? `?${query.join('&')}` : ''}`;
}

export function mailtoOverLimit(href: string): boolean {
  return href.length > MAILTO_SOFT_LIMIT;
}

/** The `[bracketed]` placeholders still in a draft, in order, de-duplicated. */
export function placeholdersIn(text: string): string[] {
  const found = (text ?? '').match(PLACEHOLDER_PATTERN) ?? [];
  return [...new Set(found)];
}

/** How many gaps are left, said in UI copy: "3 details to fill in". */
export function placeholderSummary(draft: EmailDraft): string | null {
  const items = placeholdersIn(`${draft.subject}\n${draft.body}`);
  if (items.length === 0) return null;
  return `${items.length} placeholder${items.length === 1 ? '' : 's'} to fill in before sending`;
}

/**
 * Copy to the clipboard, with the older textarea + `execCommand` path behind it
 * (Safari without the async-clipboard permission, and any non-secure context).
 * Resolves `false` when neither worked so the UI can say "select it and copy"
 * instead of claiming success. Never throws: a failed copy is not a broken app.
 */
export async function copyText(text: string): Promise<boolean> {
  const clipboard = globalThis.navigator?.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Denied or unavailable — fall through to the legacy path.
    }
  }
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
