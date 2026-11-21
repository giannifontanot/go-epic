import { dateKey } from './week.model';

/**
 * The tracking period (Gianni): 126 days drawn as 6 rows of 3 weeks of 7 days. For now it starts on the first day of
 * autumn 2026; where to set its start and end will come later (Settings).
 */
export const TRACK_START = '2026-09-22';
export const PERIOD_ROWS = 6;
export const PERIOD_WEEKS = 3;
export const PERIOD_DAYS = PERIOD_ROWS * PERIOD_WEEKS * 7;

function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The key `days` days after `key` (local dates, so summer time never shifts it). */
export function addDays(key: string, days: number): string {
  const date = parseKey(key);
  return dateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

/** Whole days from `from` to `to` (0 on the same day, negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = parseKey(from), b = parseKey(to);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

/** The period's last day: start + 125 days. */
export function periodEnd(start: string): string {
  return addDays(start, PERIOD_DAYS - 1);
}

/** The period's days as rows › weeks › days (date keys), the weeks starting on the start's weekday. */
export function periodGrid(start: string): string[][][] {
  const rows: string[][][] = [];
  for (let r = 0; r < PERIOD_ROWS; r++) {
    const row: string[][] = [];
    for (let w = 0; w < PERIOD_WEEKS; w++) {
      const week: string[] = [];
      for (let d = 0; d < 7; d++) week.push(addDays(start, (r * PERIOD_WEEKS + w) * 7 + d));
      row.push(week);
    }
    rows.push(row);
  }
  return rows;
}

/** Which day of the period today is (1…126), 0 before it starts and PERIOD_DAYS + 1 once it has ended. */
export function periodDay(start: string, today: string): number {
  const n = daysBetween(start, today) + 1;
  return n < 1 ? 0 : n > PERIOD_DAYS ? PERIOD_DAYS + 1 : n;
}
