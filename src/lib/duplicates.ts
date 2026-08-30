import type { JobApplication } from './types';

/**
 * Part 6: duplicate detection on add.
 *
 * Two applications count as the same role when companyName AND jobTitle match,
 * compared case-insensitively after trimming. Archived rows are out — archive is
 * not an application for the same role — and soft-deleted rows are out too, they
 * sit in the undo window rather than in the live queue. (PLAN.md: duplicate-key
 * helpers wait for the part that uses them; this is that part.)
 */

export interface DuplicateCandidate {
  companyName: string;
  jobTitle: string;
}

/**
 * Case-insensitive, whitespace-trimmed identity of a role. A blank company or
 * title has no identity: the form requires both before saving, and matching two
 * blank placeholders would be a false "already applied".
 */
export function duplicateKey(companyName: string, jobTitle: string): string {
  const company = companyName.trim().toLowerCase();
  const title = jobTitle.trim().toLowerCase();
  if (!company || !title) return '';
  return `${company}\u0000${title}`;
}

/**
 * Live records already holding the same role as the candidate. `excludeId` lets
 * the caller skip the record being edited — a record is never a duplicate of
 * itself. Archived and deleted rows never enter the claim.
 */
export function findDuplicates(
  records: readonly JobApplication[],
  candidate: DuplicateCandidate,
  excludeId?: string,
): JobApplication[] {
  const key = duplicateKey(candidate.companyName, candidate.jobTitle);
  if (!key) return [];
  return records.filter(
    (record) =>
      record.id !== excludeId &&
      !record.deletedAt &&
      !record.isArchived &&
      duplicateKey(record.companyName, record.jobTitle) === key,
  );
}
