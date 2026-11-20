/**
 * Life balance (Progress → Areas of life, Gianni): one radar axis per Epic, grouped and coloured by its Area.
 * Each axis is the share of the Activities planned in that Epic during a period that were finished (done or late).
 * Read from the same data as the streaks: the current week plan (used for past days too) and the day documents
 * (users/{uid}/days). Pure functions only, with specs.
 *
 * Counting rules:
 * - every active card of the weekday's plan whose library Activity sits under an Epic is one planned occurrence that day;
 * - a skipped card is left out (a deliberate choice, like the streaks' pause); in progress or untouched on a past day
 *   counts as not done;
 * - today only counts the cards already finished, so an open morning never lowers the balance;
 * - days before the first day anything was ever marked never count, so a new plan does not start with weeks of misses;
 * - an Epic with nothing planned in the period has no value ("no plan"), which is not the same as 0%.
 */
import { Library, LibNode, areas, nodeById, pathOf } from './library.model';
import { DayMarks, isFinished, statusOf } from './status.model';
import { Week, dateKey, dayOf } from './week.model';

export const PERIODS = ['3w', 'quarter'] as const;
export type BalancePeriod = (typeof PERIODS)[number];

/** Inclusive date keys (YYYY-MM-DD). */
export interface DateWindow { from: string; to: string; }

const addDays = (date: Date, n: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

/**
 * The period shown and the one before it, for the faint comparison:
 * 3 weeks = the last 21 days ending today, against the 21 days before them;
 * quarter = the calendar quarter so far (e.g. Oct 1 to today), against the whole previous quarter.
 */
export function periodWindows(period: BalancePeriod, today: Date): { current: DateWindow; previous: DateWindow } {
  if (period === '3w') {
    return {
      current: { from: dateKey(addDays(today, -20)), to: dateKey(today) },
      previous: { from: dateKey(addDays(today, -41)), to: dateKey(addDays(today, -21)) },
    };
  }
  const q = Math.floor(today.getMonth() / 3) * 3;
  const start = new Date(today.getFullYear(), q, 1);
  const prevStart = new Date(today.getFullYear(), q - 3, 1);
  return {
    current: { from: dateKey(start), to: dateKey(today) },
    previous: { from: dateKey(prevStart), to: dateKey(addDays(start, -1)) },
  };
}

/** The earliest day key that holds any mark (done or another state), or null. */
export function firstMarkedKey(marksByDate: Record<string, DayMarks>): string | null {
  let first: string | null = null;
  for (const [key, marks] of Object.entries(marksByDate)) {
    const any = Object.keys(marks?.done ?? {}).length > 0 || Object.keys(marks?.status ?? {}).length > 0;
    if (any && (first === null || key < first)) first = key;
  }
  return first;
}

export interface ActivityCount { key: string; title: string; planned: number; done: number; }

export interface BalanceAxis {
  epicId: string;
  epicTitle: string;
  areaId: string;
  areaTitle: string;
  /** The area's place among the areas (0-based): picks its colour, in a fixed order. */
  areaIndex: number;
  planned: number;
  done: number;
  /** done / planned (0…1), or null when nothing was planned: "no plan". */
  value: number | null;
  /** The same for the previous period. */
  previous: number | null;
  prevPlanned: number;
  prevDone: number;
  /** The period's Activities in this Epic, most pending first. */
  activities: ActivityCount[];
}

/** Planned and finished occurrences per Epic (and per Activity) in a window. */
function countWindow(lib: Library, week: Week, marksByDate: Record<string, DayMarks>, win: DateWindow, todayKey: string, startKey: string | null) {
  const epicOf = new Map<string, LibNode | null>();
  const epicFor = (ref: string): LibNode | null => {
    if (!epicOf.has(ref)) {
      const node = nodeById(lib, ref);
      epicOf.set(ref, node?.kind === 'task' ? pathOf(lib, ref).find((n) => n.kind === 'epic') ?? null : null);
    }
    return epicOf.get(ref)!;
  };
  const byEpic = new Map<string, Map<string, ActivityCount>>();
  if (startKey === null) return byEpic;
  const from = win.from > startKey ? win.from : startKey;
  const to = win.to < todayKey ? win.to : todayKey;
  if (from > to) return byEpic;
  const [y, m, d] = from.split('-').map(Number);
  for (let date = new Date(y, m - 1, d); dateKey(date) <= to; date = addDays(date, 1)) {
    const key = dateKey(date);
    const isToday = key === todayKey;
    for (const block of week[dayOf(date)].blocks) {
      for (const task of block.tasks) {
        if (!task.active || !task.title.trim() || !task.ref) continue;
        const epic = epicFor(task.ref);
        if (!epic) continue;
        const status = statusOf(marksByDate[key], task.id);
        if (status === 'skipped') continue;
        const finished = isFinished(status);
        if (isToday && !finished) continue;
        const acts = byEpic.get(epic.id) ?? new Map<string, ActivityCount>();
        const act = acts.get(task.ref) ?? { key: task.ref, title: nodeById(lib, task.ref)?.title.trim() || task.title.trim(), planned: 0, done: 0 };
        act.planned++;
        if (finished) act.done++;
        acts.set(task.ref, act);
        byEpic.set(epic.id, acts);
      }
    }
  }
  return byEpic;
}

const sum = (acts: Iterable<ActivityCount>, field: 'planned' | 'done') => [...acts].reduce((n, a) => n + a[field], 0);

/**
 * One axis per Epic of the library (every Epic under an Area, in the areas' order, then the library's order).
 * `marksByDate` may be only part of the history (read from some day on); `olderFirstKey` is then the user's earliest
 * day document before that part, so a first mark older than what was read still counts as the start.
 */
export function balance(lib: Library, week: Week, marksByDate: Record<string, DayMarks>, period: BalancePeriod, today: Date, olderFirstKey: string | null = null): BalanceAxis[] {
  const { current, previous } = periodWindows(period, today);
  const todayKey = dateKey(today);
  const recent = firstMarkedKey(marksByDate);
  const start = olderFirstKey !== null && (recent === null || olderFirstKey < recent) ? olderFirstKey : recent;
  const now = countWindow(lib, week, marksByDate, current, todayKey, start);
  const before = countWindow(lib, week, marksByDate, previous, todayKey, start);
  const out: BalanceAxis[] = [];
  areas(lib).forEach((area, areaIndex) => {
    for (const epic of lib.nodes.filter((n) => n.kind === 'epic' && n.parentId === area.id)) {
      const acts = [...(now.get(epic.id)?.values() ?? [])];
      const planned = sum(acts, 'planned');
      const done = sum(acts, 'done');
      const prev = [...(before.get(epic.id)?.values() ?? [])];
      const prevPlanned = sum(prev, 'planned');
      const prevDone = sum(prev, 'done');
      out.push({
        epicId: epic.id, epicTitle: epic.title.trim(), areaId: area.id, areaTitle: area.title.trim(), areaIndex,
        planned, done, value: planned ? done / planned : null,
        previous: prevPlanned ? prevDone / prevPlanned : null, prevPlanned, prevDone,
        activities: acts.sort((a, b) => (b.planned - b.done) - (a.planned - a.done) || a.title.localeCompare(b.title)),
      });
    }
  });
  return out;
}

/** All axes together: finished / planned over the period, or null when nothing was planned. */
export function overall(axes: BalanceAxis[], previous = false): number | null {
  const planned = axes.reduce((n, a) => n + (previous ? a.prevPlanned : a.planned), 0);
  return planned ? axes.reduce((n, a) => n + (previous ? a.prevDone : a.done), 0) / planned : null;
}

/** The earliest day key the balance needs (start of the previous period), for reading the day documents. */
export function balanceFromKey(today: Date): string {
  return PERIODS.map((p) => periodWindows(p, today).previous.from).sort()[0];
}

/** A point on a radar of `count` axes: axis 0 points up, then clockwise; `r` from the centre. */
export function radarPoint(index: number, count: number, r: number, cx = 0, cy = 0): { x: number; y: number } {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(1, count);
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}
