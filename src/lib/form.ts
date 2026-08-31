import type { StagedAttachment } from './attachments';
import type { ApplicationStatus, JobApplication, NewJobApplication } from './types';

/** Editable fields for the Part 2 add/edit form. Dates are `YYYY-MM-DD` or ''. */
export interface ApplicationFormDraft {
  companyName: string;
  jobTitle: string;
  jobLocation: string;
  applicationDate: string;
  jobPortal: string;
  status: ApplicationStatus;
  recruiterName: string;
  recruiterContact: string;
  followUpDate: string;
  interviewDate: string;
  interviewStatus: string;
  salary: string;
  jobLink: string;
  notes: string;
  companyResearch: string;
  tags: string[];
  finalResult: string;
  matchScore: string;
  cvVersionUsed: string;
  /**
   * Part 5: files picked in this form session that are not saved yet. In-memory
   * only — `draftToInput` deliberately drops them, so files never enter the record
   * and a cancelled form leaves no orphaned blob (files are keyed by application
   * id; PLAN.md has no `attachmentIds` field). Already-saved files are read from
   * the attachment store by the form, not held here.
   */
  files: StagedAttachment[];
}

export interface FormErrors {
  companyName?: string;
  jobTitle?: string;
  matchScore?: string;
}

export function emptyFormDraft(): ApplicationFormDraft {
  return {
    companyName: '',
    jobTitle: '',
    jobLocation: '',
    applicationDate: '',
    jobPortal: '',
    status: 'Saved',
    recruiterName: '',
    recruiterContact: '',
    followUpDate: '',
    interviewDate: '',
    interviewStatus: 'Not scheduled',
    salary: '',
    jobLink: '',
    notes: '',
    companyResearch: '',
    tags: [],
    finalResult: 'Pending',
    matchScore: '',
    cvVersionUsed: '',
    files: [],
  };
}

export function applicationToDraft(app: JobApplication): ApplicationFormDraft {
  return {
    companyName: app.companyName,
    jobTitle: app.jobTitle,
    jobLocation: app.jobLocation,
    applicationDate: app.applicationDate ?? '',
    jobPortal: app.jobPortal,
    status: app.status,
    recruiterName: app.recruiterName,
    recruiterContact: app.recruiterContact,
    followUpDate: app.followUpDate ?? '',
    interviewDate: app.interviewDate ?? '',
    interviewStatus: app.interviewStatus,
    salary: app.salary,
    jobLink: app.jobLink,
    notes: app.notes,
    companyResearch: app.companyResearch,
    tags: [...app.tags],
    finalResult: app.finalResult,
    matchScore: app.matchScore == null ? '' : String(app.matchScore),
    cvVersionUsed: app.cvVersionUsed ?? '',
    // Existing files are not part of the record, so they cannot be read from it.
    files: [],
  };
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Record input only. `draft.files` is intentionally absent: files live in the
 * attachment store keyed by application id and are written after the record has
 * one, so a record never carries a reference to a file (no `attachmentIds`).
 */
export function draftToInput(draft: ApplicationFormDraft): NewJobApplication {
  const scoreRaw = draft.matchScore.trim();
  const score = scoreRaw === '' ? null : Number(scoreRaw);
  return {
    companyName: draft.companyName,
    jobTitle: draft.jobTitle,
    jobLocation: draft.jobLocation,
    applicationDate: blankToNull(draft.applicationDate),
    jobPortal: draft.jobPortal,
    status: draft.status,
    recruiterName: draft.recruiterName,
    recruiterContact: draft.recruiterContact,
    followUpDate: blankToNull(draft.followUpDate),
    interviewDate: blankToNull(draft.interviewDate),
    interviewStatus: draft.interviewStatus,
    salary: draft.salary,
    jobLink: draft.jobLink,
    notes: draft.notes,
    companyResearch: draft.companyResearch,
    tags: draft.tags,
    finalResult: draft.finalResult,
    matchScore: score !== null && Number.isFinite(score) ? score : null,
    cvVersionUsed: blankToNull(draft.cvVersionUsed),
  };
}

/**
 * Match score is optional (null = not scored), but when it is filled in it must
 * be a whole-ish number from 0 to 100. The normaliser would silently clamp
 * "250" to 100 and "-5" to 0, so the form has to reject the value instead of
 * quietly saving something different from what the user typed.
 */
function matchScoreError(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const score = Number(trimmed);
  if (!Number.isFinite(score)) return 'Match score must be a number.';
  if (score < 0 || score > 100) return 'Match score must be between 0 and 100.';
  return undefined;
}

export function validateApplicationForm(draft: ApplicationFormDraft): FormErrors {
  const errors: FormErrors = {};
  if (!draft.companyName.trim()) errors.companyName = 'Company name is required.';
  if (!draft.jobTitle.trim()) errors.jobTitle = 'Job title is required.';
  const score = matchScoreError(draft.matchScore);
  if (score) errors.matchScore = score;
  return errors;
}

export function formHasErrors(errors: FormErrors): boolean {
  return Boolean(errors.companyName || errors.jobTitle || errors.matchScore);
}

/**
 * The draft exactly as a submit must persist it. A tag the user typed into the
 * tag input but never committed with Enter joins `tags` here instead of being
 * silently dropped when the form saves — clicking "Add application" with the
 * tag input still holding text must not lose that text.
 *
 * Referentially stable: a blank or duplicate pending tag returns the same draft
 * object, so the component can skip a state write it does not need.
 */
export function commitPendingTag(
  draft: ApplicationFormDraft,
  pendingTag: string,
): ApplicationFormDraft {
  const tag = pendingTag.trim();
  if (!tag) return draft;
  const tags = addTag(draft.tags, tag);
  // `addTag` returns a same-length copy when nothing was appended.
  return tags.length === draft.tags.length ? draft : { ...draft, tags };
}

/**
 * Part 6: the normaliser defaults finalResult to 'Pending' when blank, so the
 * record is never literally ''. Blank or the default counts as "not filled in"
 * — that rule lives here so the nudge can never drift from its tests.
 */
export function finalResultIsFilled(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== '' && trimmed.toLowerCase() !== 'pending';
}

/**
 * Gentle inline guidance, never a block: when the status is Rejected or
 * Withdrawn and the final result is still not filled in, suggest filling it.
 */
export function needsFinalResultNudge(status: ApplicationStatus, finalResult: string): boolean {
  return (status === 'Rejected' || status === 'Withdrawn') && !finalResultIsFilled(finalResult);
}

/** Type a tag and press Enter. Blank and case-insensitive duplicates are ignored. */
export function addTag(tags: readonly string[], raw: string): string[] {
  const tag = raw.trim();
  if (!tag) return [...tags];
  if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return [...tags];
  return [...tags, tag];
}

export function removeTag(tags: readonly string[], tag: string): string[] {
  return tags.filter((t) => t !== tag);
}
