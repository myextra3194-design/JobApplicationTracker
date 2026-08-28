import type { ApplicationStatus, JobApplication, JobApplicationPatch, NewJobApplication } from './types';
import { STATUSES } from './types';

/**
 * Every value that comes out of storage passes through here. localStorage is
 * user-editable and a future REST API is only as trustworthy as its client, so
 * the app must never assume a record is well-formed.
 */

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'jat.applications.v1';

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function trimmedStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Date-only ISO string, validated by shape so a bad value can't poison sorting. */
function isoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function intInRange(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : Number(str(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function url(value: unknown): string {
  const raw = str(value).trim();
  if (!raw) return '';
  // Bare "bayt.com/xyz" is what people actually paste; make it clickable.
  const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : raw;
  } catch {
    return raw;
  }
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function emptyJobApplication(input: NewJobApplication = {}): JobApplication {
  const stamp = nowIso();
  return {
    id: str(input.id) || newId(),
    createdAt: str(input.createdAt) || stamp,
    updatedAt: str(input.updatedAt) || stamp,
    deletedAt: input.deletedAt ?? null,
    isArchived: bool(input.isArchived, false),

    companyName: str(input.companyName).trim(),
    jobTitle: str(input.jobTitle).trim(),
    jobLocation: str(input.jobLocation).trim(),
    applicationDate: isoDate(input.applicationDate),
    jobPortal: str(input.jobPortal).trim(),
    status: oneOf<ApplicationStatus>(input.status, STATUSES, 'Saved'),
    recruiterName: str(input.recruiterName).trim(),
    recruiterContact: str(input.recruiterContact).trim(),
    followUpDate: isoDate(input.followUpDate),
    interviewDate: isoDate(input.interviewDate),
    interviewStatus: str(input.interviewStatus).trim() || 'Not scheduled',
    salary: str(input.salary).trim(),
    jobLink: url(input.jobLink),
    notes: str(input.notes).trim(),
    companyResearch: str(input.companyResearch).trim(),
    tags: trimmedStrings(input.tags),
    finalResult: str(input.finalResult).trim() || 'Pending',

    matchScore: intInRange(input.matchScore, 0, 100),
    cvVersionUsed: str(input.cvVersionUsed).trim() || null,
  };
}

/** Unknown input -> a valid record. Returns null only for non-objects. */
export function normalizeJobApplication(raw: unknown): JobApplication | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  return emptyJobApplication(raw as NewJobApplication);
}

export function normalizeJobApplicationList(raw: unknown): JobApplication[] {
  if (!Array.isArray(raw)) return [];
  const out: JobApplication[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const record = normalizeJobApplication(item);
    // Deduplicate ids: two rows sharing an id would corrupt every update.
    if (record && !seen.has(record.id)) {
      seen.add(record.id);
      out.push(record);
    }
  }
  return out;
}

/** Merge a patch onto a record, keeping the normalisation rules authoritative. */
export function mergeJobApplication(base: JobApplication, patch: JobApplicationPatch): JobApplication {
  return emptyJobApplication({ ...base, ...patch, id: base.id, createdAt: base.createdAt });
}
