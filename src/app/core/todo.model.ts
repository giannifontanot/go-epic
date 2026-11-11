import { DAYS, Day, DayPlan, dateKey, parseClock, timeline } from './week.model';

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

export interface PinnedTodo { todo: Todo; fraction: number; }

/**
 * Where a day's todos go on the Week board: each one with an hour is pinned over the activity running at that hour
 * (`onTask`, at the share of it already gone: 0 = its top); the rest (no hour, or an hour no activity covers) are
 * `loose`, shown at the top of the day, by hour.
 */
export function pinTodos(plan: DayPlan, todos: Todo[]): { onTask: Map<string, PinnedTodo[]>; loose: Todo[] } {
  const onTask = new Map<string, PinnedTodo[]>();
  const loose: Todo[] = [];
  const timed = timeline(plan).filter((t) => t.start !== null && t.end !== null && (t.end as number) > (t.start as number));
  for (const todo of [...todos].sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'))) {
    const at = parseClock(todo.time);
    const host = at === null ? undefined : timed.find((t) => at >= (t.start as number) && at < (t.end as number));
    if (!host || at === null) { loose.push(todo); continue; }
    const fraction = (at - (host.start as number)) / ((host.end as number) - (host.start as number));
    const list = onTask.get(host.task.id) ?? [];
    list.push({ todo, fraction });
    onTask.set(host.task.id, list);
  }
  return { onTask, loose };
}

/**
 * Pinned notes that would cover each other (closer than `minGap`, a share of the card's height) go together in one
 * stack, at the first one's place; the stack lists them one under another, so every note can be read and checked.
 */
export function stackPins(pins: PinnedTodo[], minGap: number): { fraction: number; todos: Todo[] }[] {
  const stacks: { fraction: number; todos: Todo[]; last: number }[] = [];
  for (const pin of [...pins].sort((a, b) => a.fraction - b.fraction)) {
    const top = stacks[stacks.length - 1];
    // a stack grows downwards: the next note fits only below the space its notes already take
    if (top && pin.fraction < top.last + minGap) { top.todos.push(pin.todo); top.last += minGap; }
    else stacks.push({ fraction: pin.fraction, todos: [pin.todo], last: pin.fraction });
  }
  return stacks.map(({ fraction, todos }) => ({ fraction, todos }));
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
