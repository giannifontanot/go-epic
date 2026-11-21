import { addDays, daysBetween } from './period.model';

/**
 * The Year screen (Gianni): the year as 4 quarters, one per season, winter first. Each quarter starts on the Monday
 * nearest its season's astronomical start (solstice or equinox, as a local date in Central time) and is made of 4 sprints
 * of 3 weeks (12 weeks) plus the weeks left before the next season, the rest and review week (1 in 2027). Pure rules.
 */
export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export interface SeasonStart { season: Season; date: string }

/**
 * The 2027 Go Epic year: its seasons' astronomical start days, Central time (NWS, Equinoxes and Solstices through 2030),
 * and the next winter, which ends it. Dec 21 2026 20:50 UT, Mar 20 2027 20:25 UT, Jun 21 14:11 UT, Sep 23 06:02 UT
 * (1:02 am CDT), Dec 22 02:42 UT (Dec 21, 8:42 pm CST).
 */
export const YEAR_2027: { year: number; seasons: SeasonStart[]; next: string } = {
  year: 2027,
  seasons: [
    { season: 'winter', date: '2026-12-21' },
    { season: 'spring', date: '2027-03-20' },
    { season: 'summer', date: '2027-06-21' },
    { season: 'autumn', date: '2027-09-23' },
  ],
  next: '2027-12-21',
};

export const SPRINTS = 4;
export const SPRINT_WEEKS = 3;

/** The day of the week of a date key, 0 = Monday … 6 = Sunday. */
export function weekdayOf(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

/** The Monday nearest a day: back up to 3 days (Tuesday to Thursday), forward up to 3 (Friday to Sunday). */
export function nearestMonday(key: string): string {
  const w = weekdayOf(key);
  return addDays(key, w <= 3 ? -w : 7 - w);
}

/** The week starting on a Monday, as its 7 date keys. */
function weekFrom(monday: string): string[] {
  return Array.from({ length: 7 }, (_, d) => addDays(monday, d));
}

export interface Sprint { n: number; weeks: string[][] }
export interface Quarter {
  season: Season;
  /** The astronomical start of its season. */
  astro: string;
  /** Its first day (a Monday) and its last (a Sunday). */
  start: string;
  end: string;
  sprints: Sprint[];
  /** The weeks after the sprints, before the next season: rest and review. */
  rest: string[][];
}

/** The year's 4 quarters, each from the Monday nearest its season to the day before the next one's. */
export function yearPlan(seasons: SeasonStart[], next: string): Quarter[] {
  return seasons.map((s, i) => {
    const start = nearestMonday(s.date);
    const following = nearestMonday(i + 1 < seasons.length ? seasons[i + 1].date : next);
    const weeks = Math.max(0, Math.round(daysBetween(start, following) / 7));
    const all = Array.from({ length: weeks }, (_, w) => weekFrom(addDays(start, w * 7)));
    const sprints: Sprint[] = [];
    for (let n = 0; n < SPRINTS && n * SPRINT_WEEKS < all.length; n++) {
      sprints.push({ n: n + 1, weeks: all.slice(n * SPRINT_WEEKS, (n + 1) * SPRINT_WEEKS) });
    }
    return { season: s.season, astro: s.date, start, end: addDays(following, -1), sprints, rest: all.slice(SPRINTS * SPRINT_WEEKS) };
  });
}

/** Where a day falls in the year: its quarter, its sprint (null in the rest week) and the week (1…). Null outside. */
export interface YearPlace { quarter: number; season: Season; sprint: number | null; week: number }
export function placeOf(plan: Quarter[], key: string): YearPlace | null {
  for (let q = 0; q < plan.length; q++) {
    const quarter = plan[q];
    if (key < quarter.start || key > quarter.end) continue;
    const week = Math.floor(daysBetween(quarter.start, key) / 7);
    const inSprints = week < SPRINTS * SPRINT_WEEKS;
    return {
      quarter: q,
      season: quarter.season,
      sprint: inSprints ? Math.floor(week / SPRINT_WEEKS) + 1 : null,
      week: inSprints ? (week % SPRINT_WEEKS) + 1 : week - SPRINTS * SPRINT_WEEKS + 1,
    };
  }
  return null;
}

/** An important date's name, cleaned (trimmed, at most 80 characters); null when there is none. */
export function cleanDateName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 80);
  return clean || null;
}
