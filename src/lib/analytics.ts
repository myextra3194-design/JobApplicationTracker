import { isLive, toPlainDate, weekKeyOf } from './pipeline';
import type { JobApplication } from './types';

export interface TimeBucket {
  key: string;
  count: number;
}

function addUtcDays(isoDate: string, days: number): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  const d = new Date(ms);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthKeyOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function addMonths(yyyyMm: string, delta: number): string {
  const year = Number(yyyyMm.slice(0, 4));
  const month = Number(yyyyMm.slice(5, 7));
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${`${d.getUTCMonth() + 1}`.padStart(2, '0')}`;
}

function liveDated(records: JobApplication[]): JobApplication[] {
  return records.filter((r) => isLive(r) && r.applicationDate);
}

/**
 * Applications whose `applicationDate` falls in each of the last `weeks`
 * Monday–Sunday buckets (oldest → newest). Empty weeks still appear as 0.
 * Archived, deleted, and undated rows do not count.
 */
export function applicationsByWeek(
  records: JobApplication[],
  today: Date = new Date(),
  weeks = 8,
): TimeBucket[] {
  const current = weekKeyOf(toPlainDate(today));
  const keys: string[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    keys.push(addUtcDays(current, -i * 7));
  }
  const counts = new Map(keys.map((k) => [k, 0]));
  for (const r of liveDated(records)) {
    const key = weekKeyOf(r.applicationDate as string);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return keys.map((key) => ({ key, count: counts.get(key) ?? 0 }));
}

/**
 * Applications whose `applicationDate` falls in each of the last `months`
 * calendar months (`YYYY-MM`, oldest → newest). Empty months still appear as 0.
 * Archived, deleted, and undated rows do not count.
 */
export function applicationsByMonth(
  records: JobApplication[],
  today: Date = new Date(),
  months = 6,
): TimeBucket[] {
  const current = monthKeyOf(toPlainDate(today));
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    keys.push(addMonths(current, -i));
  }
  const counts = new Map(keys.map((k) => [k, 0]));
  for (const r of liveDated(records)) {
    const key = monthKeyOf(r.applicationDate as string);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return keys.map((key) => ({ key, count: counts.get(key) ?? 0 }));
}
