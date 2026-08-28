/**
 * The application record — the single data shape the whole app revolves around.
 *
 * Field list comes from Part 1 of the build plan (18 fields), plus:
 *  - identity/audit keys the plan implies but doesn't spell out (id, timestamps),
 *  - `archivedAt` / `deletedAt` for archive + undo-delete instead of hard delete,
 *  - `matchScore` / `cvVersionUsed` for lossless round-trips with the legacy
 *    `job-search-agent` CSV schema (decision D3 in PLAN.md).
 *
 * Everything is a plain JSON-serialisable value so the same shape can be stored in
 * localStorage today and POSTed to a REST endpoint later without a translation layer.
 */

export const STATUSES = [
  'Saved',
  'Applied',
  'Shortlisted',
  'Interview',
  'Offer',
  'Rejected',
  'Withdrawn',
] as const;

export type ApplicationStatus = (typeof STATUSES)[number];

export const INTERVIEW_STATUSES = [
  'Not scheduled',
  'Scheduled',
  'Completed',
  'Cancelled',
  'No show',
] as const;

export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const FINAL_RESULTS = [
  'Pending',
  'Offer accepted',
  'Offer declined',
  'Rejected',
  'Withdrawn',
  'No response',
] as const;

export type FinalResult = (typeof FINAL_RESULTS)[number];

/** Only the storage driver changes between today and the backend upgrade. */
export type StorageDriver = 'local' | 'rest';

export interface ApplicationRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Set instead of hard-deleting for archived rows (plan: archive/undo-delete). */
  archivedAt: string | null;
  /** Soft delete: null = live. Non-null = recoverable until purged. */
  deletedAt: string | null;

  // --- the plan's 18 fields ---
  company: string;
  jobTitle: string;
  jobLocation: string;
  /** `YYYY-MM-DD`, or null when not yet applied (i.e. still Saved). */
  applicationDate: string | null;
  /** Where it was found: Bayt, GulfTalent, LinkedIn, referral, ... */
  jobPortal: string;
  status: ApplicationStatus;
  recruiterName: string;
  /** Free-form on purpose: email, phone, or both. */
  recruiterContact: string;
  followUpDate: string | null;
  interviewDate: string | null;
  interviewStatus: InterviewStatus;
  /** Free-form: "6,500 QAR + transport", "18 LPA", etc. */
  salary: string;
  jobPostingUrl: string;
  notes: string;
  companyResearchNotes: string;
  tags: string[];
  /** Keys into the AttachmentStore (IndexedDB now, object storage later). */
  attachmentIds: string[];
  finalResult: FinalResult;

  // --- legacy compatibility (job-search-agent/utils/tracker.py) ---
  /** 0-100 from the Score Job page; null = not scored. */
  matchScore: number | null;
  cvVersionUsed: string | null;
}

/**
 * What a caller may supply when creating or importing. Identity and timestamps are
 * allowed but optional: a fresh row gets generated ones, while CSV import, backup
 * restore and test fixtures must be able to keep their own ids so undo/archive links
 * survive the round-trip.
 */
export type NewApplication = Partial<ApplicationRecord>;

/**
 * What an update may change. Identity and `createdAt` are excluded on purpose —
 * no code path should be able to rewrite which record it is or when it started.
 */
export type ApplicationPatch = Partial<Omit<ApplicationRecord, 'id' | 'createdAt'>>;

/**
 * Which fields hold a date. Used by reminders, calendar export and sorting, so
 * those features don't hard-code field names in three places.
 */
export const DATE_FIELDS = ['applicationDate', 'followUpDate', 'interviewDate'] as const;
export type DateField = (typeof DATE_FIELDS)[number];

export const TEXT_FIELDS = [
  'company',
  'jobTitle',
  'jobLocation',
  'recruiterName',
  'recruiterContact',
  'salary',
  'jobPostingUrl',
  'notes',
  'companyResearchNotes',
] as const satisfies readonly (keyof ApplicationRecord)[];
