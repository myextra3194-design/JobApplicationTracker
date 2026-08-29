import type { ApplicationStatus, JobApplication } from './types';
import { isFollowUpDue, toPlainDate, weekKeyOf } from './pipeline';
import { STATUSES } from './types';

/**
 * Pure read-side logic. The local store runs these; a REST store would send the
 * same `ApplicationQuery` as request params instead. Keeping them pure (no
 * `this`, no DOM) means they are unit-testable and reusable on a server later.
 */

export type SortKey =
  | 'updatedAt'
  | 'companyName'
  | 'status'
  | 'applicationDate'
  | 'followUpDate'
  | 'interviewDate'
  | 'matchScore';
export type SortDir = 'asc' | 'desc';

export interface ApplicationQuery {
  search?: string;
  statuses?: ApplicationStatus[];
  /** Single-tag filter (original shape). */
  tag?: string;
  /** Multi-select tags: a row matches if it has at least one of them (OR inside). */
  tags?: string[];
  /** Job portal/source, compared case-insensitively after trimming. */
  jobPortal?: string;
  followUpDue?: boolean;
  includeArchived?: boolean;
  includeDeleted?: boolean;
  sortBy?: SortKey;
  sortDir?: SortDir;
}

/**
 * UI state of the Part 4 toolbar — flat and JSON-plain so a component can hold
 * it in a single `useState` and map it onto a query with `filterToQuery`.
 */
export interface FilterState {
  search: string;
  statuses: ApplicationStatus[];
  jobPortal: string;
  tags: string[];
  sortKey: SortKey;
  sortDir: SortDir;
}

/** The list's original behaviour: everything, most recently updated first. */
export const DEFAULT_FILTERS: FilterState = {
  search: '',
  statuses: [],
  jobPortal: '',
  tags: [],
  sortKey: 'updatedAt',
  sortDir: 'desc',
};

/** Maps toolbar state onto a store query, omitting blank conditions. */
export function filterToQuery(state: FilterState): ApplicationQuery {
  const query: ApplicationQuery = { sortBy: state.sortKey, sortDir: state.sortDir };
  const search = state.search.trim();
  if (search) query.search = search;
  if (state.statuses.length > 0) query.statuses = [...state.statuses];
  const portal = state.jobPortal.trim();
  if (portal) query.jobPortal = portal;
  const tags = state.tags.map((t) => t.trim()).filter(Boolean);
  if (tags.length > 0) query.tags = tags;
  return query;
}

/**
 * Does any toolbar control deviate from the defaults? Drives the enabled
 * state of "Clear filters". Mirrors `filterToQuery` exactly: a control whose
 * value would trim away is inactive, so the two never disagree.
 */
export function hasActiveFilters(state: FilterState): boolean {
  return (
    state.search.trim() !== '' ||
    state.statuses.length > 0 ||
    state.jobPortal.trim() !== '' ||
    state.tags.some((t) => t.trim() !== '') ||
    state.sortKey !== DEFAULT_FILTERS.sortKey ||
    state.sortDir !== DEFAULT_FILTERS.sortDir
  );
}

const DEFAULTS = {
  includeArchived: false,
  includeDeleted: false,
  sortBy: 'updatedAt' as SortKey,
  sortDir: 'desc' as SortDir,
};

export function applyQuery(records: JobApplication[], query: ApplicationQuery = {}): JobApplication[] {
  const q = { ...DEFAULTS, ...query };
  const needle = q.search?.trim().toLowerCase() ?? '';
  const statuses = q.statuses?.length ? new Set(q.statuses) : null;
  const wantedTags = selectedTags(q);
  const portal = q.jobPortal?.trim().toLowerCase();

  const filtered = records.filter((r) => {
    if (r.deletedAt) return q.includeDeleted;
    if (r.isArchived && !q.includeArchived) return false;
    if (statuses && !statuses.has(r.status)) return false;
    if (q.followUpDue && !isFollowUpDue(r)) return false;
    if (wantedTags && !r.tags.some((t) => wantedTags.has(t.trim().toLowerCase()))) return false;
    if (portal && r.jobPortal.trim().toLowerCase() !== portal) return false;
    if (needle && !searchableText(r).includes(needle)) return false;
    return true;
  });

  return sortRecords(filtered, q.sortBy, q.sortDir);
}

/**
 * The tag selection, as a lower-cased set: the union of the legacy single
 * `tag` and the multi-select `tags`. A row matches when it has at least one
 * (OR inside the selection, AND against every other condition).
 */
function selectedTags(q: ApplicationQuery): Set<string> | null {
  const wanted = new Set(
    [...(q.tags ?? []), ...(q.tag ? [q.tag] : [])]
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  );
  return wanted.size > 0 ? wanted : null;
}

/** Fields a free-text search looks at. Deliberately excludes internal ids. */
export function searchableText(r: JobApplication): string {
  return [
    r.companyName,
    r.jobTitle,
    r.jobLocation,
    r.jobPortal,
    r.recruiterName,
    r.recruiterContact,
    r.notes,
    r.companyResearch,
    r.salary,
    ...r.tags,
  ]
    .join(' \u0000 ')
    .toLowerCase();
}

export function sortRecords(records: JobApplication[], key: SortKey, dir: SortDir): JobApplication[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...records].sort((a, b) => {
    switch (key) {
      case 'companyName':
        return factor * a.companyName.localeCompare(b.companyName, undefined, { sensitivity: 'base' });
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

/**
 * Group records into the board's columns — one per stage, in pipeline order.
 * Callers pass already-visible rows (the store's default `list()` hides
 * archived and deleted), so no visibility rules live here. A record can never
 * land in "no column": the normaliser constrains `status` to the closed set.
 */
export function groupByStatus(records: JobApplication[]): Record<ApplicationStatus, JobApplication[]> {
  const columns = {} as Record<ApplicationStatus, JobApplication[]>;
  for (const status of STATUSES) columns[status] = [];
  for (const record of records) columns[record.status].push(record);
  return columns;
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

/** Dashboard aggregates. */
export function summarise(records: JobApplication[], today: Date = new Date()): PipelineCounts {
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
    if (r.isArchived) {
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

export interface PortalCount {
  portal: string;
  count: number;
}

interface SpellingCount {
  value: string;
  count: number;
}

/**
 * Merge case variants into one entry (`Qatar` + `qatar` = one chip) because the
 * filters are case-insensitive — two chips for one value would invite
 * contradictory UI state. Display uses the most-used spelling, ties going to
 * the first one typed. Deliberately not localeCompare-based for the spelling
 * choice: casing order is locale-dependent and would flip between machines.
 */
function groupSpellings(rawValues: string[]): SpellingCount[] {
  const groups = new Map<string, { display: Map<string, number>; count: number }>();

  for (const raw of rawValues) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    const group = groups.get(key) ?? { display: new Map<string, number>(), count: 0 };
    group.display.set(value, (group.display.get(value) ?? 0) + 1);
    group.count += 1;
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      let value = key;
      let best = 0;
      for (const [spelling, count] of group.display) {
        if (count > best) {
          best = count;
          value = spelling;
        }
      }
      return { value, count: group.count };
    })
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * Distinct tags across non-deleted records with usage counts, most-used first.
 */
export function collectTags(records: JobApplication[]): TagCount[] {
  return groupSpellings(records.flatMap((r) => (r.deletedAt ? [] : r.tags))).map((g) => ({
    tag: g.value,
    count: g.count,
  }));
}

/**
 * Distinct job portal/source values across non-deleted records, most-used first.
 * Feeds the Part 4 portal filter's option list.
 */
export function collectPortals(records: JobApplication[]): PortalCount[] {
  return groupSpellings(records.flatMap((r) => (r.deletedAt ? [] : [r.jobPortal]))).map((g) => ({
    portal: g.value,
    count: g.count,
  }));
}
