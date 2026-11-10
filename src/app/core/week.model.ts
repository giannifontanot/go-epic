/**
 * The week: seven days, each a list of blocks (a named time window) holding tasks in order.
 * Pure functions only, so the rules are easy to test and shared by the Week board and Focus.
 */

export const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
export type Day = (typeof DAYS)[number];

export interface Task {
  id: string;
  title: string;
  minutes: number;
  /** A picked colour; null = the automatic pastel. */
  color: string | null;
  active: boolean;
  /** The library task this is a scheduled place of (one task can be in many blocks and days); null for an unfiled one. */
  ref: string | null;
}

export interface Block {
  id: string;
  name: string;
  /** 'HH:mm' (24h) or null. The start anchors the first task; the end is a hard limit. */
  start: string | null;
  end: string | null;
  tasks: Task[];
}

export interface DayPlan {
  blocks: Block[];
}

export type Week = Record<Day, DayPlan>;

/** The four pastels of the old board (lagoon, foam, lilac, peach). */
export const PASTELS = ['#a7e7e3', '#e1f3d0', '#e1d7ff', '#ffd5bd'];

/** The 8 colours a task can be given (the same as Epic Manager's Floating Canvas). */
export const COLOR_CHOICES: { color: string; label: string }[] = [
  { color: '#a7e7e3', label: 'color.lagoon' },
  { color: '#e1f3d0', label: 'color.foam' },
  { color: '#e1d7ff', label: 'color.lilac' },
  { color: '#ffd5bd', label: 'color.peach' },
  { color: '#ffc9d6', label: 'color.rose' },
  { color: '#fff0a6', label: 'color.butter' },
  { color: '#cde4ff', label: 'color.sky' },
  { color: '#eadcc8', label: 'color.sand' },
];

export const NEW_TASK_MINUTES = 15;

export function emptyWeek(): Week {
  return Object.fromEntries(DAYS.map((day) => [day, { blocks: [] }])) as unknown as Week;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Minutes since midnight for 'HH:mm' (24h); null for anything else. */
export function parseClock(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((value ?? '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 'HH:mm' for minutes since midnight (wraps past midnight). */
export function formatClock(total: number): string {
  const wrapped = ((Math.round(total) % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function validMinutes(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1440) : 0;
}

/** The minutes of all tasks of a block (inactive ones too: they keep their place). */
export function taskTotal(block: Block): number {
  return block.tasks.reduce((sum, task) => sum + validMinutes(task.minutes), 0);
}

/** The window's length, or null when the block has no full window. */
export function windowLength(block: Block): number | null {
  const start = parseClock(block.start);
  const end = parseClock(block.end);
  if (start === null || end === null || end <= start) return null;
  return end - start;
}

/** Free minutes left in the window (negative = over), or null without a window. */
export function freeMinutes(block: Block): number | null {
  const length = windowLength(block);
  return length === null ? null : length - taskTotal(block);
}

/** Pixels per minute on the Week board: a card is 46px + minutes × this, and a block's free time a band of the same scale. */
export const WEEK_PX_PER_MIN = 1.6;

/**
 * The block's end after the handle at its bottom is pulled by `delta` minutes (Gianni: pull and the hours follow): from
 * its current end (or the end of its tasks when it has no end yet), never before its tasks end (at least one minute
 * after the start) and never past 23:59. Null when the block has no start to anchor it.
 */
export function stretchedEnd(block: Block, delta: number): string | null {
  const start = parseClock(block.start);
  if (start === null) return null;
  const total = taskTotal(block);
  const length = windowLength(block);
  const current = start + (length ?? total);
  const next = Math.min(1439, Math.max(start + Math.max(total, 1), Math.round(current + delta)));
  return formatClock(next);
}

/** Start time of each task: the block's start plus the minutes of the tasks before it. */
export function taskStarts(block: Block): (number | null)[] {
  const start = parseClock(block.start);
  let cursor = start;
  return block.tasks.map((task) => {
    const at = cursor;
    if (cursor !== null) cursor += validMinutes(task.minutes);
    return at;
  });
}

/** Why a window cannot be saved, or null when it can. An empty start and end removes the window. */
export function windowError(start: string, end: string, total: number): 'end_without_start' | 'end_before_start' | 'too_small' | null {
  const s = parseClock(start);
  const e = parseClock(end);
  if (e !== null && s === null) return 'end_without_start';
  if (s !== null && e !== null && e <= s) return 'end_before_start';
  if (s !== null && e !== null && e - s < total) return 'too_small';
  return null;
}

/** Whether a block can take `extra` more minutes without passing its end. */
export function fits(block: Block, extra: number): boolean {
  const free = freeMinutes(block);
  return free === null || extra <= free;
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const copy = [...items];
  if (from < 0 || from >= copy.length || to < 0 || to >= copy.length) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/** `name`, or `name 2`, `name 3`… when another block of the day already uses it. */
export function uniqueName(names: string[], name: string): string {
  const used = new Set(names.map((n) => n.trim().toLowerCase()));
  const base = name.trim() || 'Block';
  if (!used.has(base.toLowerCase())) return base;
  let n = 2;
  while (used.has(`${base} ${n}`.toLowerCase())) n++;
  return `${base} ${n}`;
}

/** Inserts a block at its hour: before the first block that starts later; at the end when it has no start. */
export function placeBlock(blocks: Block[], block: Block): Block[] {
  const start = parseClock(block.start);
  const copy = [...blocks];
  if (start === null) return [...copy, block];
  const index = copy.findIndex((other) => {
    const otherStart = parseClock(other.start);
    return otherStart !== null && otherStart > start;
  });
  if (index < 0) copy.push(block);
  else copy.splice(index, 0, block);
  return copy;
}

/** A deep, independent copy of a block (new ids), for copying it to another day. */
export function cloneBlock(block: Block, name: string): Block {
  return { ...block, id: newId(), name, tasks: block.tasks.map((task) => ({ ...task, id: newId() })) };
}

/** Monday-first weekday of a date. */
export function dayOf(date: Date): Day {
  return DAYS[(date.getDay() + 6) % 7];
}

/** Local 'YYYY-MM-DD' of a date: the key of that day's done marks. */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Card colours of a block: a picked colour wins; otherwise a pastel from the title's hash, moved on when it
 * would repeat the card right above (lagoon and foam never touch, they look alike).
 */
export function blockColors(tasks: Task[]): string[] {
  const alike = (a: string, b: string) =>
    a === b || (a === PASTELS[0] && b === PASTELS[1]) || (a === PASTELS[1] && b === PASTELS[0]);
  const colors: string[] = [];
  for (const task of tasks) {
    if (task.color) {
      colors.push(task.color);
      continue;
    }
    let index = hash(task.title.trim().toLowerCase()) % PASTELS.length;
    const above = colors[colors.length - 1];
    for (let step = 0; above && step < PASTELS.length && alike(above, PASTELS[index]); step++) {
      index = (index + 1) % PASTELS.length;
    }
    colors.push(PASTELS[index]);
  }
  return colors;
}

export interface TimedTask {
  block: Block;
  task: Task;
  index: number;
  start: number | null;
  end: number | null;
}

/** The day's tasks in order, with their start and end minutes. */
export function timeline(plan: DayPlan): TimedTask[] {
  const out: TimedTask[] = [];
  for (const block of plan.blocks) {
    const starts = taskStarts(block);
    block.tasks.forEach((task, index) => {
      const start = starts[index];
      out.push({ block, task, index, start, end: start === null ? null : start + validMinutes(task.minutes) });
    });
  }
  return out;
}

/**
 * Where the now-line goes: inside the active task that started last (with a start time), at the share of it
 * already elapsed. Before the first task it sits at that task's top; after the last one at its bottom.
 */
export function nowPosition(plan: DayPlan, now: number): { taskId: string; fraction: number } | null {
  const timed = timeline(plan).filter((item) => item.task.active && item.start !== null);
  if (!timed.length) return null;
  const started = timed.filter((item) => (item.start as number) <= now);
  if (!started.length) return { taskId: timed[0].task.id, fraction: 0 };
  const current = started.reduce((a, b) => ((b.start as number) >= (a.start as number) ? b : a));
  const length = validMinutes(current.task.minutes);
  const fraction = length === 0 ? 1 : Math.min(1, Math.max(0, (now - (current.start as number)) / length));
  return { taskId: current.task.id, fraction };
}
