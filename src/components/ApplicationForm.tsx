import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import {
  ACCEPT_ATTRIBUTE,
  describeRejections,
  downloadAttachment,
  listAttachments,
  MAX_ATTACHMENT_BYTES,
  removeAttachment,
  stageAttachmentFile,
  type StagedAttachment,
} from '../lib/attachments';
import { formatBytes } from '../lib/blob';
import { findDuplicates } from '../lib/duplicates';
import {
  addTag,
  applicationToDraft,
  emptyFormDraft,
  formHasErrors,
  needsFinalResultNudge,
  removeTag,
  validateApplicationForm,
  type ApplicationFormDraft,
} from '../lib/form';
import type { AttachmentMeta } from '../lib/storage/adapter';
import { downloadDateAsIcs } from '../lib/ics';
import {
  FINAL_RESULT_SUGGESTIONS,
  INTERVIEW_STATUS_SUGGESTIONS,
  STATUSES,
  type JobApplication,
} from '../lib/types';

interface ApplicationFormProps {
  open: boolean;
  initial: JobApplication | null;
  /**
   * Part 6: live records (non-archived, non-deleted) to check for duplicates
   * against. Only the add mode warns — edit mode never does.
   */
  liveRows: JobApplication[];
  saving: boolean;
  onClose: () => void;
  onSave: (draft: ApplicationFormDraft) => Promise<void>;
}

export function ApplicationForm({
  open,
  initial,
  liveRows,
  saving,
  onClose,
  onSave,
}: ApplicationFormProps) {
  const titleId = useId();
  const interviewListId = useId();
  const resultListId = useId();
  const companyRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<ApplicationFormDraft>(emptyFormDraft);
  const [tagInput, setTagInput] = useState('');
  const [errors, setErrors] = useState(validateApplicationForm(emptyFormDraft()));
  const [showErrors, setShowErrors] = useState(false);
  // Part 5: files already stored for this application. `null` while loading so the
  // panel can say so instead of flashing "no files" at a row that has a CV.
  const [existing, setExisting] = useState<AttachmentMeta[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(initial ? applicationToDraft(initial) : emptyFormDraft());
    setTagInput('');
    setErrors({});
    setShowErrors(false);
    setFileError(null);
    setBusyId(null);
    const frame = window.requestAnimationFrame(() => companyRef.current?.focus());

    // Files are keyed by application id and live in the attachment store, not on
    // the record — so they cannot be read from `initial`, only looked up.
    let cancelled = false;
    if (initial) {
      setExisting(null);
      void listAttachments(initial.id)
        .then((files) => {
          if (!cancelled) setExisting(files);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setExisting([]);
          setFileError(err instanceof Error ? err.message : String(err));
        });
    } else {
      setExisting([]);
    }

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [open, initial]);

  if (!open) return null;

  const mode = initial ? 'Edit application' : 'Add application';

  // Part 6: duplicate warning is add-only and never blocks saving — the user can
  // proceed even when a live record already holds the same role. Archived and
  // deleted rows never count (findDuplicates), and edit mode does not warn at all.
  const duplicateMatches = initial ? [] : findDuplicates(liveRows, draft);

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

  // --- Part 5: attachments -----------------------------------------------------
  // Picked files are staged in the draft, never written here. The record has to
  // exist before a file can be keyed to its id, so App saves them after the
  // record is created/updated (see App.handleSave).
  function onFilesPicked(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    // Reset immediately: picking the same file twice must still fire onChange.
    event.target.value = '';
    if (picked.length === 0) return;

    const accepted: StagedAttachment[] = [];
    const rejected: string[] = [];
    for (const file of picked) {
      const { staged, message } = stageAttachmentFile(file);
      if (staged) accepted.push(staged);
      else if (message) rejected.push(message);
    }

    if (accepted.length > 0) {
      setDraft((current) => ({ ...current, files: [...current.files, ...accepted] }));
    }
    setFileError(describeRejections(rejected) || null);
  }

  function setStagedLabel(key: string, label: string) {
    setDraft((current) => ({
      ...current,
      files: current.files.map((item) => (item.key === key ? { ...item, label } : item)),
    }));
  }

  function dropStaged(key: string) {
    setDraft((current) => ({ ...current, files: current.files.filter((item) => item.key !== key) }));
  }

  /** Saved files go away now: they are already keyed to a real application id. */
  async function dropExisting(meta: AttachmentMeta) {
    if (!window.confirm(`Remove "${meta.name}"? This cannot be undone.`)) return;
    setBusyId(meta.id);
    try {
      await removeAttachment(meta.id);
      setExisting((current) => (current ?? []).filter((item) => item.id !== meta.id));
      setFileError(null);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onDownload(meta: AttachmentMeta) {
    setBusyId(meta.id);
    try {
      await downloadAttachment(meta);
      setFileError(null);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
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
          {duplicateMatches.length > 0 ? (
            <p
              role="status"
              className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-200"
            >
              You already applied to this role — continue anyway?
            </p>
          ) : null}
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
            <DateWithCalendar
              label="Follow-up date"
              value={draft.followUpDate}
              onChange={(value) => patch('followUpDate', value)}
              companyName={draft.companyName}
              jobTitle={draft.jobTitle}
              applicationId={initial?.id}
            />
            <DateWithCalendar
              label="Interview date"
              value={draft.interviewDate}
              onChange={(value) => patch('interviewDate', value)}
              companyName={draft.companyName}
              jobTitle={draft.jobTitle}
              applicationId={initial?.id}
            />
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
              {needsFinalResultNudge(draft.status, draft.finalResult) ? (
                <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] leading-relaxed text-sky-200">
                  Marked {draft.status} — want to record the final result too? Saving works either way.
                </span>
              ) : null}
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

          <section className="flex flex-col gap-2 border-t border-hairline pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-xs font-medium text-slate-200">Attachments</h3>
              <span className="text-[11px] text-slate-500">
                PDF, DOC or DOCX · {formatBytes(MAX_ATTACHMENT_BYTES)} each
              </span>
            </div>

            {fileError ? (
              <p
                role="alert"
                className="rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs leading-relaxed whitespace-pre-line text-red-200"
              >
                {fileError}
              </p>
            ) : null}

            {existing === null ? (
              <p className="text-xs text-slate-500">Loading files…</p>
            ) : existing.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {existing.map((meta) => (
                  <li
                    key={meta.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-hairline bg-surface-raised px-2.5 py-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-100" title={meta.name}>
                      {meta.name}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-slate-500">{formatBytes(meta.size)}</span>
                    <button
                      type="button"
                      onClick={() => void onDownload(meta)}
                      disabled={busyId === meta.id}
                      className={FILE_ACTION}
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => void dropExisting(meta)}
                      disabled={busyId === meta.id}
                      className={FILE_ACTION_DANGER}
                      aria-label={`Remove ${meta.name}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {draft.files.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {draft.files.map((item) => (
                  <li
                    key={item.key}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-blue-500/40 bg-blue-500/5 px-2.5 py-1.5"
                  >
                    <input
                      value={item.label}
                      onChange={(e) => setStagedLabel(item.key, e.target.value)}
                      className={`${inputClass()} w-36 flex-none px-2 py-1 text-xs`}
                      placeholder="Label"
                      aria-label={`Label for ${item.file.name}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-300" title={item.file.name}>
                      {item.file.name}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-slate-500">
                      {formatBytes(item.file.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => dropStaged(item.key)}
                      className={FILE_ACTION_DANGER}
                      aria-label={`Remove ${item.file.name}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-hairline bg-surface-raised px-3 py-1.5 text-sm text-slate-200 hover:border-blue-500/50 hover:bg-surface-raised/80"
              >
                Attach resume/CV
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPT_ATTRIBUTE}
                onChange={onFilesPicked}
                className="hidden"
                aria-label="Attach resume/CV"
              />
              <span className="text-[11px] text-slate-500">
                {initial
                  ? 'Resume + cover letter both allowed; new files save with this application.'
                  : 'Files are saved once the application is added.'}
              </span>
            </div>
          </section>

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

/**
 * Date input plus an "Add to calendar" button that only appears when the date
 * is set. Not a `<label>` wrapping the button — clicking the download must not
 * also focus the date picker.
 */
function DateWithCalendar({
  label,
  value,
  onChange,
  companyName,
  jobTitle,
  applicationId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  companyName: string;
  jobTitle: string;
  applicationId?: string;
}) {
  return (
    <div className="flex flex-col gap-1 text-xs text-slate-400">
      <span>{label}</span>
      <div className="flex items-center gap-2">
        <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass()} />
        {value ? (
          <button
            type="button"
            onClick={() =>
              downloadDateAsIcs({
                companyName,
                jobTitle,
                date: value,
                uid: applicationId ? `${applicationId}-${value}` : undefined,
              })
            }
            className="shrink-0 rounded-md border border-hairline px-2 py-1.5 text-xs text-slate-300 hover:bg-surface-raised hover:text-slate-100"
          >
            Add to calendar
          </button>
        ) : null}
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

const FILE_ACTION =
  'rounded-md border border-hairline px-2 py-1 text-xs text-slate-300 hover:bg-surface hover:text-slate-100 disabled:opacity-50';

const FILE_ACTION_DANGER =
  'rounded-md px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50';

function inputClass(invalid?: boolean | string): string {
  return [
    'w-full rounded-md border bg-surface-raised px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-600',
    invalid ? 'border-red-500/70' : 'border-hairline',
  ].join(' ');
}
