import { addDays, daysBetween } from './period.model';
import type { Lang, Texts } from './i18n';

/**
 * The Year screen (Gianni): each year as 4 quarters, one per season, winter first. Each quarter starts on the Monday
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
export interface GoEpicYear { year: number; seasons: SeasonStart[]; next: string }

/**
 * The 2026 Go Epic year (Gianni: there is still work to do in it): Dec 21 2025 15:03 UT (9:03 am CST), Mar 20 2026
 * 14:46 UT, Jun 21 08:24 UT (3:24 am CDT), Sep 23 00:05 UT (Sep 22, 7:05 pm CDT), and the next winter, Dec 21 2026,
 * where 2027 begins.
 */
export const YEAR_2026: GoEpicYear = {
  year: 2026,
  seasons: [
    { season: 'winter', date: '2025-12-21' },
    { season: 'spring', date: '2026-03-20' },
    { season: 'summer', date: '2026-06-21' },
    { season: 'autumn', date: '2026-09-22' },
  ],
  next: '2026-12-21',
};

export const YEAR_2027: GoEpicYear = {
  year: 2027,
  seasons: [
    { season: 'winter', date: '2026-12-21' },
    { season: 'spring', date: '2027-03-20' },
    { season: 'summer', date: '2027-06-21' },
    { season: 'autumn', date: '2027-09-23' },
  ],
  next: '2027-12-21',
};

/** The years the Year screen offers, in order; each one ends the day before the next one begins. */
export const YEARS: GoEpicYear[] = [YEAR_2026, YEAR_2027];

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

/**
 * The quarters in the order the screen shows them (Gianni: the season we are in goes at the top): when today falls in
 * the year, its quarter comes first and the others follow in their order, the earlier ones of the year after them; a
 * year today is not in keeps winter first.
 */
export function currentFirst(plan: Quarter[], today: string): Quarter[] {
  const i = plan.findIndex((q) => today >= q.start && today <= q.end);
  return i <= 0 ? plan : [...plan.slice(i), ...plan.slice(0, i)];
}

/** A sprint's first and last day (Monday of its first week, Sunday of its last). */
export function sprintRange(sprint: Sprint): { from: string; to: string } {
  const last = sprint.weeks[sprint.weeks.length - 1];
  return { from: sprint.weeks[0][0], to: last[last.length - 1] };
}

/** Three-letter months for the sprint ranges; a language added later without its own list uses its locale's. */
const MONTHS: Texts<string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
};
/** A day as a sprint's range shows it (Gianni): two-digit day and three-letter month, "05 Oct". */
export function dayMonth(key: string, lang: Lang): string {
  const m = Number(key.slice(5, 7)) - 1;
  return `${key.slice(8, 10)} ${MONTHS[lang]?.[m] ?? localeMonth(m, lang)}`;
}
function localeMonth(month: number, lang: Lang): string {
  const name = new Intl.DateTimeFormat(lang, { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2026, month, 15))).replace('.', '');
  return name.charAt(0).toLocaleUpperCase(lang) + name.slice(1);
}
/** A sprint's range as its line shows it after its name (Gianni): "05 Oct - 18 Oct". */
export function sprintRangeLabel(sprint: Sprint, lang: Lang): string {
  const { from, to } = sprintRange(sprint);
  return `${dayMonth(from, lang)} - ${dayMonth(to, lang)}`;
}

/** An important date's name, cleaned (trimmed, at most 80 characters); null when there is none. */
export function cleanDateName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 80);
  return clean || null;
}

/** The year to open on: the one today falls in, else the next to come, else the last one. */
export function yearFor(years: GoEpicYear[], today: string): GoEpicYear {
  for (const y of years) {
    const plan = yearPlan(y.seasons, y.next);
    if (today <= plan[plan.length - 1].end) return y;
  }
  return years[years.length - 1];
}
