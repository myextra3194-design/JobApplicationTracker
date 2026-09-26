import { useState, type ReactNode } from 'react';
import {
  buildEmailDraft,
  copyText,
  draftAsPlainText,
  EMAIL_TEMPLATES,
  mailtoHref,
  mailtoOverLimit,
  placeholderSummary,
  suggestTemplate,
  type EmailSource,
  type EmailTemplateId,
} from '../lib/emailDraft';
import { pushToast } from '../lib/toast';

/**
 * Part 14 — the email draft panel inside the add/edit form.
 *
 * It reads the record (or the form's unsaved draft: both satisfy `EmailSource`),
 * so the email follows what is typed — company, role, recruiter, link, dates and
 * research notes — instead of being a blank template to fill in from scratch.
 *
 * All the text lives in `src/lib/emailDraft.ts` (pure, unit-tested). This
 * component holds three pieces of state and no persistence:
 *  - which template is chosen,
 *  - the sender's signature name, typed here and never stored — a draft is not a
 *    record, and this adds no settings field or storage capability,
 *  - the fields the user has edited by hand.
 *
 * Editing is per-field on purpose. A field left alone keeps re-deriving from the
 * record, so fixing a typo in the company name above rewrites the email; a field
 * the user has typed into stays theirs until they press "Reset text". That is
 * plain derived state, computed during render — no effect, no sync bug.
 *
 * Nothing here sends anything. "Open in mail app" is a `mailto:` link, and the
 * app makes no network calls at all.
 */
interface EmailDraftPanelProps {
  source: EmailSource;
}

export function EmailDraftPanel({ source }: EmailDraftPanelProps) {
  const suggested = suggestTemplate(source);
  const [template, setTemplate] = useState<EmailTemplateId>(suggested);
  const [templateTouched, setTemplateTouched] = useState(false);
  const [lastSuggested, setLastSuggested] = useState(suggested);
  const [senderName, setSenderName] = useState('');
  /** Hand-typed text per field; absent = still following the record. */
  const [edits, setEdits] = useState<{ to?: string; subject?: string; body?: string }>({});

  // Follow the record's own suggestion — Saved → application, a completed
  // interview → thank-you — until the picker is used by hand. Setting state
  // during render is React's documented "adjust state when a prop changes"
  // pattern; an effect would paint one stale draft first.
  if (!templateTouched && suggested !== lastSuggested) {
    setLastSuggested(suggested);
    setTemplate(suggested);
    setEdits({});
  }

  const built = buildEmailDraft({ template, source, senderName });
  const draft = {
    template,
    to: edits.to ?? built.to,
    subject: edits.subject ?? built.subject,
    body: edits.body ?? built.body,
  };
  const edited = edits.to !== undefined || edits.subject !== undefined || edits.body !== undefined;
  const href = mailtoHref(draft);
  const gaps = placeholderSummary(draft);
  const hint = EMAIL_TEMPLATES.find((option) => option.id === template)?.hint ?? '';

  function choose(id: EmailTemplateId): void {
    setTemplateTouched(true);
    setTemplate(id);
    // A new template means new text: the previous one's hand edits would
    // otherwise sit on top of a subject and body they no longer belong to.
    setEdits({});
  }

  function edit(field: 'to' | 'subject' | 'body', value: string): void {
    setEdits((current) => ({ ...current, [field]: value }));
  }

  async function onCopy(): Promise<void> {
    const ok = await copyText(draftAsPlainText(draft));
    pushToast(
      ok
        ? 'Email draft copied — paste it into your mail app.'
        : 'Could not reach the clipboard — select the text and copy it yourself.',
      ok ? 'success' : 'warning',
    );
  }

  return (
    <section className="flex flex-col gap-2.5 border-t border-hairline pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium text-ink">Email draft</h3>
        <span className="text-[11px] text-muted">Filled from this record · nothing is sent, nothing is saved</span>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Email template">
        {EMAIL_TEMPLATES.map((option) => {
          const active = option.id === template;
          return (
            <button
              key={option.id}
              type="button"
              title={option.hint}
              aria-pressed={active}
              onClick={() => choose(option.id)}
              className={`rounded-xl border px-2.5 py-1 text-xs font-medium transition ${
                active
                  ? 'border-accent/60 bg-accent/10 text-accent'
                  : 'border-hairline bg-surface-raised text-muted hover:border-accent/40 hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {hint ? <p className="text-[11px] text-faint">{hint}</p> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PanelField label="Your name (signature)">
          <input
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            className={inputClass}
            placeholder={SENDER_HINT}
            autoComplete="name"
          />
        </PanelField>
        <PanelField label="To">
          <input
            value={draft.to}
            onChange={(e) => edit('to', e.target.value)}
            className={inputClass}
            placeholder="recruiter@company.com"
            inputMode="email"
            spellCheck={false}
          />
        </PanelField>
      </div>

      <PanelField label="Subject">
        <input value={draft.subject} onChange={(e) => edit('subject', e.target.value)} className={inputClass} />
      </PanelField>

      <PanelField label="Message">
        <textarea
          value={draft.body}
          onChange={(e) => edit('body', e.target.value)}
          rows={14}
          className={`${inputClass} min-h-56 leading-relaxed`}
        />
      </PanelField>

      {gaps ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
          Square brackets are placeholders — {gaps}.
        </p>
      ) : null}
      {mailtoOverLimit(href) ? (
        <p className="text-[11px] leading-relaxed text-faint">
          This one is long, and some mail apps truncate a very long link — copying is the safer hand-off.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void onCopy()}
          className="rounded-xl border border-hairline bg-surface-raised px-3 py-1.5 text-sm font-medium text-ink shadow-sm hover:border-accent/50"
        >
          Copy email
        </button>
        <a
          href={href}
          className="rounded-xl border border-hairline px-3 py-1.5 text-sm font-medium text-muted shadow-sm transition hover:bg-surface-raised hover:text-ink"
        >
          Open in mail app
        </a>
        {edited ? (
          <button type="button" onClick={() => setEdits({})} className={RESET_ACTION}>
            Reset text
          </button>
        ) : null}
        {!draft.to.trim() ? (
          <span className="text-[11px] text-faint">
            No address on this record yet — the draft still copies; the mail app will ask who to send it to.
          </span>
        ) : null}
      </div>
    </section>
  );
}

const SENDER_HINT = 'Signs the email off';

const inputClass =
  'w-full rounded-xl border border-hairline bg-surface-raised px-2.5 py-1.5 text-sm text-ink placeholder:text-faint';

const RESET_ACTION = 'rounded-xl px-2 py-1 text-xs text-muted hover:bg-surface-raised hover:text-ink';

function PanelField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      <span>{label}</span>
      {children}
    </label>
  );
}
