import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import {
  addTag,
  applicationToDraft,
  emptyFormDraft,
  formHasErrors,
  removeTag,
  validateApplicationForm,
  type ApplicationFormDraft,
} from '../lib/form';
import {
  FINAL_RESULT_SUGGESTIONS,
  INTERVIEW_STATUS_SUGGESTIONS,
  STATUSES,
  type JobApplication,
} from '../lib/types';

interface ApplicationFormProps {
  open: boolean;
  initial: JobApplication | null;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: ApplicationFormDraft) => Promise<void>;
}

export function ApplicationForm({ open, initial, saving, onClose, onSave }: ApplicationFormProps) {
  const titleId = useId();
  const interviewListId = useId();
  const resultListId = useId();
  const companyRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<ApplicationFormDraft>(emptyFormDraft);
  const [tagInput, setTagInput] = useState('');
  const [errors, setErrors] = useState(validateApplicationForm(emptyFormDraft()));
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(initial ? applicationToDraft(initial) : emptyFormDraft());
    setTagInput('');
    setErrors({});
    setShowErrors(false);
    const frame = window.requestAnimationFrame(() => companyRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, initial]);

  if (!open) return null;

  const mode = initial ? 'Edit application' : 'Add application';

  function patch<K extends keyof ApplicationFormDraft>(key: K, value: ApplicationFormDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function commitTag() {
    setDraft((current) => ({ ...current, tags: addTag(current.tags, tagInput) }));
    setTagInput('');
  }

  function onTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commitTag();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors = validateApplicationForm(draft);
    setErrors(nextErrors);
    setShowErrors(true);
    if (formHasErrors(nextErrors)) return;
    await onSave(draft);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 py-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-2xl rounded-xl border border-hairline bg-surface p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-50">
            {mode}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-surface-raised hover:text-slate-200"
          >
            Close
          </button>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Company name" required error={showErrors ? errors.companyName : undefined}>
              <input
                ref={companyRef}
                value={draft.companyName}
                onChange={(e) => patch('companyName', e.target.value)}
                className={inputClass(showErrors && errors.companyName)}
                autoComplete="organization"
              />
            </Field>
            <Field label="Job title" required error={showErrors ? errors.jobTitle : undefined}>
              <input
                value={draft.jobTitle}
                onChange={(e) => patch('jobTitle', e.target.value)}
                className={inputClass(showErrors && errors.jobTitle)}
              />
            </Field>
            <Field label="Job location">
              <input
                value={draft.jobLocation}
                onChange={(e) => patch('jobLocation', e.target.value)}
                className={inputClass()}
              />
            </Field>
            <Field label="Application date">
              <input
                type="date"
                value={draft.applicationDate}
                onChange={(e) => patch('applicationDate', e.target.value)}
                className={inputClass()}
              />
            </Field>
            <Field label="Job portal / source">
              <input
                value={draft.jobPortal}
                onChange={(e) => patch('jobPortal', e.target.value)}
                className={inputClass()}
                placeholder="LinkedIn, Indeed, company website…"
              />
            </Field>
            <Field label="Status">
              <select
                value={draft.status}
                onChange={(e) => patch('status', e.target.value as ApplicationFormDraft['status'])}
                className={inputClass()}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Recruiter name">
              <input
                value={draft.recruiterName}
                onChange={(e) => patch('recruiterName', e.target.value)}
                className={inputClass()}
              />
            </Field>
            <Field label="Recruiter contact">
              <input
                value={draft.recruiterContact}
                onChange={(e) => patch('recruiterContact', e.target.value)}
                className={inputClass()}
                placeholder="email or phone"
              />
            </Field>
            <Field label="Follow-up date">
              <input
                type="date"
                value={draft.followUpDate}
                onChange={(e) => patch('followUpDate', e.target.value)}
                className={inputClass()}
              />
            </Field>
            <Field label="Interview date">
              <input
                type="date"
                value={draft.interviewDate}
                onChange={(e) => patch('interviewDate', e.target.value)}
                className={inputClass()}
              />
            </Field>
            <Field label="Interview status">
              <input
                value={draft.interviewStatus}
                onChange={(e) => patch('interviewStatus', e.target.value)}
                className={inputClass()}
                list={interviewListId}
              />
              <datalist id={interviewListId}>
                {INTERVIEW_STATUS_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="Salary / package">
              <input
                value={draft.salary}
                onChange={(e) => patch('salary', e.target.value)}
                className={inputClass()}
              />
            </Field>
            <Field label="Job posting link" className="sm:col-span-2">
              <input
                value={draft.jobLink}
                onChange={(e) => patch('jobLink', e.target.value)}
                className={inputClass()}
                inputMode="url"
                placeholder="https://"
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={draft.notes}
              onChange={(e) => patch('notes', e.target.value)}
              className={`${inputClass()} min-h-20`}
              rows={3}
            />
          </Field>

          <Field label="Company research">
            <textarea
              value={draft.companyResearch}
              onChange={(e) => patch('companyResearch', e.target.value)}
              className={`${inputClass()} min-h-24`}
              rows={4}
              placeholder="Background on the company, separate from application-process notes"
            />
          </Field>

          <div className="flex flex-col gap-1 text-xs text-slate-400">
            <span>Tags</span>
            <div className="flex flex-wrap gap-1.5">
              {draft.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-raised px-2 py-0.5 text-xs text-slate-200"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => patch('tags', removeTag(draft.tags, tag))}
                    className="text-slate-500 hover:text-slate-200"
                    aria-label={`Remove tag ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={onTagKeyDown}
              className={`${inputClass()} mt-0.5`}
              placeholder="Type a tag and press Enter"
              aria-label="Add tag"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Final result">
              <input
                value={draft.finalResult}
                onChange={(e) => patch('finalResult', e.target.value)}
                className={inputClass()}
                list={resultListId}
              />
              <datalist id={resultListId}>
                {FINAL_RESULT_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="Match score (0–100)">
              <input
                type="number"
                min={0}
                max={100}
                value={draft.matchScore}
                onChange={(e) => patch('matchScore', e.target.value)}
                className={inputClass()}
              />
            </Field>
            <Field label="CV version used" className="sm:col-span-2">
              <input
                value={draft.cvVersionUsed}
                onChange={(e) => patch('cvVersionUsed', e.target.value)}
                className={inputClass()}
              />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-hairline pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-hairline px-3 py-1.5 text-sm text-slate-300 hover:bg-surface-raised"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? 'Saving…' : initial ? 'Save changes' : 'Add application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  error,
  className = '',
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-slate-400 ${className}`}>
      <span>
        {label}
        {required ? <span className="ml-0.5 text-red-400">*</span> : null}
      </span>
      {children}
      {error ? <span className="text-red-400">{error}</span> : null}
    </label>
  );
}

function inputClass(invalid?: boolean | string): string {
  return [
    'w-full rounded-md border bg-surface-raised px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-600',
    invalid ? 'border-red-500/70' : 'border-hairline',
  ].join(' ');
}
