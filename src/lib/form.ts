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

export function validateApplicationForm(draft: ApplicationFormDraft): FormErrors {
  const errors: FormErrors = {};
  if (!draft.companyName.trim()) errors.companyName = 'Company name is required.';
  if (!draft.jobTitle.trim()) errors.jobTitle = 'Job title is required.';
  return errors;
}

export function formHasErrors(errors: FormErrors): boolean {
  return Boolean(errors.companyName || errors.jobTitle);
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
