/**
 * The application record — the single data shape the whole app revolves around.
 *
 * Field names are the plan's contract (`job-application-tracker-build-plan.md`
 * Part 1). Any future rename gets a line in PLAN.md.
 *
 * Extra fields, documented:
 *  - `id` / `createdAt` / `updatedAt` — identity the plan implies but doesn't spell out
 *  - `deletedAt` — undo window between Part 2 "Delete" and Part 9 "Delete permanently"
 *    (deviation: Part 1 only specifies `isArchived`)
 *  - `matchScore` / `cvVersionUsed` — optional extras that tie this tracker to the
 *    job-search-agent Score Job / Generate CV pages
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

/**
 * Plan types interviewStatus as free TEXT with "e.g." examples — not a closed set.
 * A wrong stage on `status` would hide a card; a free-text interview status cannot.
 */
export const INTERVIEW_STATUS_SUGGESTIONS = [
  'Not scheduled',
  'Scheduled',
  'Completed',
  'Cancelled',
] as const;

/**
 * Plan types finalResult as free TEXT with "e.g." examples — not a closed set.
 */
export const FINAL_RESULT_SUGGESTIONS = ['Pending', 'Hired', 'Rejected', 'Ghosted'] as const;

/** Only the storage driver changes between today and the backend upgrade. */
export type StorageDriver = 'local' | 'rest';

export interface JobApplication {
  id: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Soft-delete timestamp. Null = not in the trash.
   * Deviation from Part 1 (which only has `isArchived`): this is the undo window
   * between "Delete" and Part 9's "Delete permanently". Archive is never this.
   */
  deletedAt: string | null;
  /** Plan: boolean, default false. Archived rows leave the board but stay restorable. */
  isArchived: boolean;

  // --- the plan's fields ---
  companyName: string;
  jobTitle: string;
  jobLocation: string;
  /** `YYYY-MM-DD`, or null when not yet applied (i.e. still Saved). */
  applicationDate: string | null;
  /** Where it was found: LinkedIn, Indeed, company website, ... */
  jobPortal: string;
  /** Closed set: a wrong stage = a card in no column. */
  status: ApplicationStatus;
  recruiterName: string;
  /** Free-form on purpose: email, phone, or both. */
  recruiterContact: string;
  followUpDate: string | null;
  interviewDate: string | null;
  /** Free text. Empty normalises to 'Not scheduled'. */
  interviewStatus: string;
  /** Free-form: "6,500 QAR + transport", "18 LPA", etc. */
  salary: string;
  jobLink: string;
  notes: string;
  companyResearch: string;
  tags: string[];
  /** Free text. Empty normalises to 'Pending'. */
  finalResult: string;

  // --- optional extras (job-search-agent Score Job / Generate CV) ---
  /** 0-100 from the Score Job page; null = not scored. */
  matchScore: number | null;
  cvVersionUsed: string | null;
}

/**
 * What a caller may supply when creating or importing. Identity and timestamps are
 * allowed but optional: a fresh row gets generated ones, while backup restore and
 * test fixtures must be able to keep their own ids so undo/archive links survive
 * the round-trip.
 */
export type NewJobApplication = Partial<JobApplication>;

/**
 * What an update may change. Identity and `createdAt` are excluded on purpose —
 * no code path should be able to rewrite which record it is or when it started.
 */
export type JobApplicationPatch = Partial<Omit<JobApplication, 'id' | 'createdAt'>>;
