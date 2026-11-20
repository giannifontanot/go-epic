import { Block, DAYS, Day, DayPlan, Task, dateKey, dayOf, formatClock, freeMinutes, minutesOfDay, parseClock, taskStarts, timeline, validMinutes } from './week.model';

/**
 * A task from Capture (Gianni): a one-off to-do, not an Activity of the library. It has a day (a date) and maybe an
 * hour, and a check: checked, it leaves Capture's open list and shows among the finished ones. On the Week board it is
 * pinned over the activity running at its hour on its day, or listed at the top of the day when no activity holds it.
 *   users/{uid}/todos/{id}  Todo
 */
export interface Todo {
  id: string;
  title: string;
  /** Local date 'YYYY-MM-DD', or null (no day yet: it waits in Capture only). */
  date: string | null;
  /** 'HH:mm' 24h, or null (any time that day). */
  time: string | null;
  /** When it was checked (millis), or null while open. */
  done: number | null;
  /** When it was captured (millis): its paper ages from then. */
  created: number;
  /** The weekdays it repeats on (Gianni: Mo…Su buttons); empty = once, on `date`. */
  repeat: Day[];
  /** A repeating task's checks, one per date: 'YYYY-MM-DD' → when (millis). */
  doneOn: Record<string, number>;
}

/** Repeats on some weekday: then it shows every week on those days and is checked per date. */
export function repeats(todo: Todo): boolean {
  return todo.repeat.length > 0;
}

/** Whether a task falls on a date (its own date, or one of its repeat weekdays). */
export function onDate(todo: Todo, date: string, day: Day): boolean {
  return repeats(todo) ? todo.repeat.includes(day) : todo.date === date;
}

/** Checked on that date: a repeating task by its check for that date, a single one by its own check. */
export function doneOnDate(todo: Todo, date: string): number | null {
  return repeats(todo) ? todo.doneOn[date] ?? null : todo.done;
}

/** The tasks of a date, as that date sees them (a repeating one carries that date's check in `done`). */
export function todosForDate(todos: Todo[], date: string, day: Day): Todo[] {
  return todos.filter((t) => onDate(t, date, day)).map((t) => (repeats(t) ? { ...t, done: doneOnDate(t, date) } : t));
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A todo read from Firestore (or anywhere): every field valid, never undefined (Firestore refuses it). */
export function sanitizeTodo(id: string, raw: unknown): Todo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r['title'] === 'string' ? r['title'].trim() : '';
  if (!title) return null;
  const date = typeof r['date'] === 'string' && DATE.test(r['date']) ? r['date'] : null;
  const time = typeof r['time'] === 'string' && parseClock(r['time']) !== null ? r['time'] : null;
  const done = typeof r['done'] === 'number' && Number.isFinite(r['done']) ? r['done'] : null;
  const created = typeof r['created'] === 'number' && Number.isFinite(r['created']) ? r['created'] : 0;
  const repeat = Array.isArray(r['repeat']) ? DAYS.filter((d) => (r['repeat'] as unknown[]).includes(d)) : [];
  const doneOn: Record<string, number> = {};
  if (r['doneOn'] && typeof r['doneOn'] === 'object') {
    for (const [k, v] of Object.entries(r['doneOn'] as Record<string, unknown>)) if (DATE.test(k) && typeof v === 'number' && Number.isFinite(v)) doneOn[k] = v;
  }
  return { id, title, date, time, done, created, repeat, doneOn };
}

/**
 * The open todos: the repeating ones first (they never finish: each date has its own check), by hour, then the single
 * ones soonest first (by day, then hour; no hour after the hours, no day last), then newest captured.
 */
export function openTodos(todos: Todo[]): Todo[] {
  const at = (t: Todo) => `${repeats(t) ? '0000-00-00' : t.date ?? '9999-99-99'} ${t.time ?? '99:99'}`;
  return todos.filter((t) => repeats(t) || t.done === null).sort((a, b) => at(a).localeCompare(at(b)) || b.created - a.created);
}

/** The finished single todos, last checked first (a repeating task is never finished). */
export function doneTodos(todos: Todo[]): Todo[] {
  return todos.filter((t) => !repeats(t) && t.done !== null).sort((a, b) => (b.done as number) - (a.done as number));
}

/** The date of a weekday in the week (Monday to Sunday) that holds `today`. */
export function weekDate(today: Date, day: Day): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + DAYS.indexOf(day));
  return dateKey(d);
}

/**
 * Where a day's todos go on the Week board (Gianni: on top of the closest activity, not hovering over it): each one
 * with an hour sits at the top of the activity running at that hour, or, when none runs then, of the activity closest
 * to it in time (the one ending last before it or starting first after it; a tie goes to the earlier one). Each card's
 * notes are listed by hour. The rest are `loose`, shown at the foot of the day by hour: those with no hour, and any
 * whose day has no activity with a time.
 */
export function pinTodos(plan: DayPlan, todos: Todo[]): { onTask: Map<string, Todo[]>; loose: Todo[] } {
  const onTask = new Map<string, Todo[]>();
  const loose: Todo[] = [];
  const timed = timedOf(plan);
  for (const todo of [...todos].sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'))) {
    const at = parseClock(todo.time);
    const host = at === null ? undefined : closestActivity(timed, at);
    if (!host) { loose.push(todo); continue; }
    const list = onTask.get(host) ?? [];
    list.push(todo);
    onTask.set(host, list);
  }
  return { onTask, loose };
}

/**
 * Only a task that sits inside a block can become an Activity (Gianni): it has an hour, and on its day of this week its
 * note is pinned on one of the day's activities. An all-day task (no hour), one rolled over from an earlier day or one
 * of today whose hour has passed (all in the tray at the foot of the Week board), one on a day with no timed activity
 * (the strip at the day's foot) and one of a later week never can. `time` is the editor's hour.
 */
export function canBecomeActivity(todo: Todo, time: string | null, day: Day | null, plan: DayPlan | null, now: Date): boolean {
  const at = parseClock(time);
  if (at === null || day === null || !plan || !timedOf(plan).length) return false;
  const today = dateKey(now);
  if (!repeats(todo) && todo.date === null) return false;                                              // undated: on no day of the board
  if (!repeats(todo) && todo.done === null && todo.date !== null && todo.date < today) return false;   // rolled over
  if (day === dayOf(now) && doneOnDate(todo, today) === null && at < minutesOfDay(now)) return false;  // past due today
  return true;
}

/**
 * A Capture task turned Activity takes the task's place on the Week board (Gianni: swapped in place, never sent away to
 * be brought back): its card goes into the block of the activity its note was pinned to (as `pinTodos`), right after
 * that activity when the hour falls on or after its start, else right before it, and takes the hour its place gives it.
 * The block grows by what its free time lacks, so its end limit still holds. Null when the task sits in no block (no
 * hour, or no timed activity that day: see `canBecomeActivity`) or the block cannot grow before midnight.
 */
export function placeActivity(plan: DayPlan, time: string | null, card: Task): Block[] | null {
  const blocks = plan.blocks;
  const at = parseClock(time);
  const host = at === null ? undefined : closestTimed(timedOf(plan), at);
  if (!host) return null;
  const bi = blocks.indexOf(host.block);
  const index = host.index + ((at as number) >= (host.start as number) ? 1 : 0);
  const block = blocks[bi];
  const free = freeMinutes(block);
  const short = free === null ? 0 : Math.max(0, validMinutes(card.minutes) - Math.max(0, free));
  const end = parseClock(block.end);
  if (short && end !== null && end + short > 1439) return null;
  const tasks = [...block.tasks];
  tasks.splice(index, 0, card);
  const grown: Block = { ...block, end: short && end !== null ? formatClock(end + short) : block.end, tasks };
  return pastMidnight(grown) ? null : blocks.map((b, i) => (i === bi ? grown : b));
}

/** Some task of the block would run past 23:59 (a block with no end grows freely, but never past midnight). */
function pastMidnight(block: Block): boolean {
  const starts = taskStarts(block);
  return block.tasks.some((t, i) => starts[i] !== null && (starts[i] as number) + validMinutes(t.minutes) > 1439);
}

/**
 * The day of this week where a Capture task's note shows, for turning it into an Activity from Capture's own list:
 * its date's weekday when it falls in this week (a finished task keeps its own day); today when it rolled over
 * (open, from an earlier day) or has no day; a
 * repeating task today when it repeats today, else its first day. Null for a later week (it waits in Free Space).
 */
export function convertDay(todo: Todo, now: Date): Day | null {
  const today = dayOf(now);
  if (repeats(todo)) return todo.repeat.includes(today) ? today : todo.repeat[0];
  if (todo.date === null || (todo.done === null && todo.date < dateKey(now))) return today;   // only open ones roll over
  return DAYS.find((d) => weekDate(now, d) === todo.date) ?? null;
}

function timedOf(plan: DayPlan) {
  return timeline(plan).filter((t) => t.start !== null && t.end !== null && (t.end as number) > (t.start as number));
}

function closestTimed<T extends { start: number | null; end: number | null }>(timed: T[], at: number): T | undefined {
  const running = timed.find((t) => at >= (t.start as number) && at < (t.end as number));
  if (running) return running;
  let best: { t: T; gap: number } | undefined;
  for (const t of timed) {
    const start = t.start as number, end = t.end as number;
    const gap = at < start ? start - at : at - end;   // minutes to its nearer edge
    if (!best || gap < best.gap || (gap === best.gap && start < (best.t.start as number))) best = { t, gap };
  }
  return best?.t;
}

/** The id of the activity running at `at`, else the one nearest to it in time (ties: the earlier one). */
function closestActivity(timed: { task: { id: string }; start: number | null; end: number | null }[], at: number): string | undefined {
  return closestTimed(timed, at)?.task.id;
}

/**
 * The single tasks left open on an earlier day (Gianni): they roll over to today and wait at the top of today's column,
 * since they no longer belong to any block; oldest first.
 */
export function overdueTodos(todos: Todo[], today: string): Todo[] {
  return todos
    .filter((t) => !repeats(t) && t.done === null && t.date !== null && t.date < today)
    .sort((a, b) => `${a.date} ${a.time ?? '99:99'}`.localeCompare(`${b.date} ${b.time ?? '99:99'}`));
}

/**
 * Today's tasks whose hour has already passed and are still open (Gianni): they join the rolled-over ones in the tray
 * at the foot of the Week board; a repeating one as today sees it. Soonest first.
 */
export function pastDueTodos(todos: Todo[], today: string, day: Day, nowMinutes: number): Todo[] {
  return todosForDate(todos, today, day)
    .filter((t) => t.done === null && t.time !== null && (parseClock(t.time) ?? Infinity) < nowMinutes)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
}

/**
 * Today's open tasks with no hour, for any time of the day (Gianni): they wait in the tray at the foot of the Week
 * board with the overdue ones, not at the top of the day; a repeating one as today sees it. Oldest captured first.
 */
export function allDayTodos(todos: Todo[], today: string, day: Day): Todo[] {
  return todosForDate(todos, today, day)
    .filter((t) => t.done === null && t.time === null)
    .sort((a, b) => a.created - b.created);
}

/**
 * The check, as a pure step. A single task checked on a later day than its own (it had rolled over to today) moves
 * to that day, so its checked note stays where it was ticked; a repeating task is checked for that date only.
 */
export function checkTodo(todo: Todo, done: boolean, date: string, now: number): Todo {
  if (repeats(todo)) {
    const doneOn = { ...todo.doneOn };
    if (done) doneOn[date] = now; else delete doneOn[date];
    return { ...todo, doneOn };
  }
  const moved = done && todo.date !== null && todo.date < date ? date : todo.date;
  return { ...todo, done: done ? now : null, date: moved };
}

/** One activity of the day overview, with its start and the timed tasks pinned to it. */
export interface OverviewActivity { task: Task; start: number | null; todos: Todo[] }
/**
 * The day at a glance (Gianni: a nested bullet list): the all-day tasks first (the ones rolled over from earlier days,
 * then the date's tasks with no hour), then each block in the day's order with its active activities and, under each,
 * the timed tasks pinned to it (as on the board: the activity running at their hour, else the closest one); `later`
 * holds timed tasks no activity can take (none is timed, or theirs is switched off), by hour.
 */
export interface DayOverview { allDay: Todo[]; blocks: { block: Block; activities: OverviewActivity[] }[]; later: Todo[] }
export function dayOverview(plan: DayPlan, todos: Todo[], date: string, day: Day, today = date): DayOverview {
  // The tasks rolled over from earlier days belong to today only: today lists them first, and another day's overview
  // (`today` is the real date) leaves them out, their own earlier day included, as the Week board does.
  const overdue = overdueTodos(todos, today);
  const rolled = new Set(overdue.map((t) => t.id));
  const own = todosForDate(todos, date, day).filter((t) => date === today || !rolled.has(t.id));
  const allDay = [...(date === today ? overdue : []), ...own.filter((t) => t.time === null).sort((a, b) => a.created - b.created)];
  const pins = pinTodos(plan, own.filter((t) => t.time !== null));
  const later = [...pins.loose];
  const blocks = plan.blocks.map((block) => {
    const starts = taskStarts(block);
    const activities: OverviewActivity[] = [];
    block.tasks.forEach((task, i) => {
      const pinned = pins.onTask.get(task.id) ?? [];
      if (task.active) activities.push({ task, start: starts[i], todos: pinned });
      else later.push(...pinned);
    });
    return { block, activities };
  }).filter((b) => b.activities.length);
  later.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  return { allDay, blocks, later };
}
