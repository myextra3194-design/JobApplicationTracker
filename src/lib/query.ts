import type { ApplicationRecord, ApplicationStatus } from './types';
import { isFollowUpDue, weekKeyOf, toPlainDate } from './pipeline';
import { STATUSES } from './types';

/**
 * Pure read-side logic. The local store runs these; a REST store would send the
 * same `ApplicationQuery` as request params instead. Keeping them pure (no
 * `this`, no DOM) means they are unit-testable and reusable on a server later.
 */

export type SortKey = 'updatedAt' | 'company' | 'status' | 'applicationDate' | 'followUpDate' | 'matchScore';
export type SortDir = 'asc' | 'desc';

export interface ApplicationQuery {
  search?: string;
  statuses?: ApplicationStatus[];
  tag?: string;
  followUpDue?: boolean;
  includeArchived?: boolean;
  includeDeleted?: boolean;
  sortBy?: SortKey;
  sortDir?: SortDir;
}

const DEFAULTS = {
  includeArchived: false,
  includeDeleted: false,
  sortBy: 'updatedAt' as SortKey,
  sortDir: 'desc' as SortDir,
};

export function applyQuery(records: ApplicationRecord[], query: ApplicationQuery = {}): ApplicationRecord[] {
  const q = { ...DEFAULTS, ...query };
  const needle = q.search?.trim().toLowerCase() ?? '';
  const statuses = q.statuses?.length ? new Set(q.statuses) : null;
  const tag = q.tag?.trim().toLowerCase();

  const filtered = records.filter((r) => {
    if (r.deletedAt) return q.includeDeleted;
    if (r.archivedAt && !q.includeArchived) return false;
    if (statuses && !statuses.has(r.status)) return false;
    if (q.followUpDue && !isFollowUpDue(r)) return false;
    if (tag && !r.tags.some((t) => t.toLowerCase() === tag)) return false;
    if (needle && !searchableText(r).includes(needle)) return false;
    return true;
  });

  return sortRecords(filtered, q.sortBy, q.sortDir);
}

/** Fields a free-text search looks at. Deliberately excludes internal ids. */
export function searchableText(r: ApplicationRecord): string {
  return [
    r.company,
    r.jobTitle,
    r.jobLocation,
    r.jobPortal,
    r.recruiterName,
    r.recruiterContact,
    r.notes,
    r.companyResearchNotes,
    r.salary,
    ...r.tags,
  ]
    .join(' \u0000 ')
    .toLowerCase();
}

export function sortRecords(records: ApplicationRecord[], key: SortKey, dir: SortDir): ApplicationRecord[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...records].sort((a, b) => {
    switch (key) {
      case 'company':
        return factor * a.company.localeCompare(b.company, undefined, { sensitivity: 'base' });
      case 'status':
        return factor * a.status.localeCompare(b.status);
      case 'matchScore':
        return factor * ((a.matchScore ?? -1) - (b.matchScore ?? -1));
      default: {
        // `YYYY-MM-DD` and ISO timestamps compare correctly as strings.
        // Empty dates are pushed to the bottom regardless of direction.
        const av = String(a[key] ?? '');
        const bv = String(b[key] ?? '');
        // Blank always last, independent of direction: an undated row should never
        // sit at either end of the column depending on which way it is sorted.
        if (!av || !bv) return av === bv ? 0 : av ? -1 : 1;
        return factor * av.localeCompare(bv);
      }
    }
  });
}

export interface PipelineCounts {
  /** Live, non-archived records. */
  total: number;
  byStatus: Record<ApplicationStatus, number>;
  archived: number;
  deleted: number;
  dueFollowUps: number;
  scheduledInterviews: number;
  appliedThisWeek: number;
  /** Shortlisted-or-better / everything but Saved, in percent. */
  responseRatePct: number;
}

/** Dashboard aggregates. Same definition as legacy `tracker.py stats()` so numbers reconcile. */
export function summarise(records: ApplicationRecord[], today: Date = new Date()): PipelineCounts {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<ApplicationStatus, number>;
  const thisWeek = weekKeyOf(toPlainDate(today));
  const PROGRESSION = new Set<ApplicationStatus>(['Shortlisted', 'Interview', 'Offer']);

  let archived = 0;
  let deleted = 0;
  let total = 0;
  let dueFollowUps = 0;
  let scheduledInterviews = 0;
  let appliedThisWeek = 0;
  let applied = 0;
  let progressed = 0;

  for (const r of records) {
    if (r.deletedAt) {
      deleted += 1;
      continue;
    }
    if (r.archivedAt) {
      archived += 1;
      continue;
    }
    total += 1;
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (isFollowUpDue(r, today)) dueFollowUps += 1;
    if (r.status === 'Interview' && r.interviewDate) scheduledInterviews += 1;
    if (r.applicationDate && weekKeyOf(r.applicationDate) === thisWeek) appliedThisWeek += 1;
    if (r.status !== 'Saved') applied += 1;
    if (PROGRESSION.has(r.status)) progressed += 1;
  }

  return {
    total,
    byStatus,
    archived,
    deleted,
    dueFollowUps,
    scheduledInterviews,
    appliedThisWeek,
    responseRatePct: applied === 0 ? 0 : Math.round((progressed / applied) * 1000) / 10,
  };
}

export interface TagCount {
  tag: string;
  count: number;
}

/**
 * Distinct tags across non-deleted records with usage counts, most-used first.
 * Case variants are merged (`Qatar` + `qatar` = one chip) because the filter is
 * case-insensitive — two chips for one tag would invite contradictory UI state.
 * Display uses the most-used spelling, ties going to the first one typed.
 */
export function collectTags(records: ApplicationRecord[]): TagCount[] {
  const groups = new Map<string, { display: Map<string, number>; count: number }>();

  for (const r of records) {
    if (r.deletedAt) continue;
    for (const raw of r.tags) {
      const tag = raw.trim();
      if (!tag) continue;
      const key = tag.toLowerCase();
      const group = groups.get(key) ?? { display: new Map<string, number>(), count: 0 };
      group.display.set(tag, (group.display.get(tag) ?? 0) + 1);
      group.count += 1;
      groups.set(key, group);
    }
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      // Most-used spelling wins; ties keep the first spelling seen. Deliberately not
      // localeCompare-based: casing order is locale-dependent and would flip between machines.
      let display = key;
      let best = 0;
      for (const [spelling, count] of group.display) {
        if (count > best) {
          best = count;
          display = spelling;
        }
      }
      return { tag: display, count: group.count };
    })
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
