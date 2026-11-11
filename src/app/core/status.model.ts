/**
 * Task states for a day, as in Epic Manager: To do → Done → Late → In progress → Skipped.
 * Stored in users/{uid}/days/{YYYY-MM-DD} as { done: { [taskId]: millis }, status: { [taskId]: 'late'|'progress'|'skipped' } }:
 * `done` keeps when a task was finished (done and late), `status` the states that are not a plain "done".
 * Documents written before states existed only have `done`, and still read correctly (as done).
 * Pure functions only, with specs.
 */
import { DAYS, Day, Task, Week, dateKey, dayOf } from './week.model';

export const STATUSES = ['todo', 'done', 'late', 'progress', 'skipped'] as const;
export type Status = (typeof STATUSES)[number];

/** What a day document holds (any field may be missing). */
export interface DayMarks {
  done?: Record<string, number>;
  status?: Record<string, string>;
}

/** A task's state that day. */
export function statusOf(marks: DayMarks | undefined, taskId: string): Status {
  const extra = marks?.status?.[taskId];
  if (extra === 'progress' || extra === 'skipped') return extra;
  if (marks?.done && taskId in marks.done) return extra === 'late' ? 'late' : 'done';
  return 'todo';
}

/** Done or late: the task was finished. */
export function isFinished(status: Status): boolean {
  return status === 'done' || status === 'late';
}

/**
 * The field changes that set a state (null = delete the field), merged into the day document.
 * Finishing keeps the first finish time when the task was already finished (done ↔ late).
 */
export function statusPatch(marks: DayMarks | undefined, taskId: string, status: Status, now: number): {
  done: Record<string, number | null>;
  status: Record<string, string | null>;
} {
  const finishedAt = marks?.done?.[taskId];
  return {
    done: { [taskId]: isFinished(status) ? (typeof finishedAt === 'number' ? finishedAt : now) : null },
    status: { [taskId]: status === 'late' || status === 'progress' || status === 'skipped' ? status : null },
  };
}

/** The same change applied locally (shown at once, before Firestore answers). */
export function applyStatus(marks: DayMarks | undefined, taskId: string, status: Status, now: number): DayMarks {
  const patch = statusPatch(marks, taskId, status, now);
  const done = { ...(marks?.done ?? {}) };
  const extra = { ...(marks?.status ?? {}) };
  const d = patch.done[taskId];
  const s = patch.status[taskId];
  if (d === null) delete done[taskId]; else done[taskId] = d;
  if (s === null) delete extra[taskId]; else extra[taskId] = s;
  return { done, status: extra };
}

// --- Progress (streaks) ---

/** One day of a habit: planned or not, and what happened. */
export type DayResult = 'none' | 'done' | 'late' | 'skipped' | 'progress' | 'missed' | 'pending';

export interface Habit {
  /** The library task (ref) or, for a card without one, its lower-cased title. */
  key: string;
  title: string;
  /** Oldest first; the last one is today. */
  days: { date: string; result: DayResult }[];
  /** Days in a row it was finished (done or late), counting back from today; skipped days pause it, missed ones end it. */
  streak: number;
  /** The streak reaches the oldest day read: it may go back further ("n+ days"). */
  streakCapped: boolean;
}

/** What a repeating Capture task needs for Progress (todo.model's Todo has these fields). */
export interface RepeatingTask { id: string; title: string; created: number; repeat: Day[]; doneOn: Record<string, number>; }

/**
 * Capture's repeating tasks as habits too (Gianni): only the days a task repeats on are planned; a planned day is done
 * when it was checked that date (`doneOn`), today still open is pending, an earlier one missed. Days before the task
 * was created never count. Single tasks are not habits. Same streak rules as the Activities.
 */
export function taskHabits(tasks: RepeatingTask[], today: Date, count = 14, history = count): Habit[] {
  const span = Math.max(count, history);
  const dates: Date[] = [];
  for (let i = span - 1; i >= 0; i--) dates.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i));
  const todayKey = dateKey(today);
  const out: Habit[] = [];
  for (const task of tasks) {
    if (!task.repeat.length || !task.title.trim()) continue;
    const born = task.created > 0 ? dateKey(new Date(task.created)) : null;
    const days = dates.map((date) => {
      const k = dateKey(date);
      if (!task.repeat.includes(dayOf(date)) || (born !== null && k < born)) return { date: k, result: 'none' as DayResult };
      const result: DayResult = task.doneOn[k] !== undefined ? 'done' : k === todayKey ? 'pending' : 'missed';
      return { date: k, result };
    });
    const { streak, capped } = streakInfo(days.map((d) => d.result));
    const bornBefore = born !== null && born < dateKey(dates[0]);
    out.push({ key: 'todo:' + task.id, title: task.title.trim(), days: days.slice(-count), streak, streakCapped: capped && bornBefore });
  }
  return out.sort((a, b) => b.streak - a.streak || a.title.localeCompare(b.title));
}

const habitKey = (task: Task): string => task.ref || 'title:' + task.title.trim().toLowerCase();

/**
 * Every active, named task of the week as a habit, with its last `count` days (today included) read from the day
 * documents (by date key). A day is "planned" when the weekday's plan schedules the habit (the current week plan
 * is used for past days too). A planned past day with nothing marked is missed (but only from the first day the habit
 * was ever marked on); today with nothing marked is pending.
 */
export function habits(week: Week, marksByDate: Record<string, DayMarks>, today: Date, count = 14, history = count): Habit[] {
  const byKey = new Map<string, { title: string; ids: Record<Day, string[]> }>();
  for (const day of DAYS) {
    for (const block of week[day].blocks) {
      for (const task of block.tasks) {
        if (!task.active || !task.title.trim()) continue;
        const key = habitKey(task);
        const entry = byKey.get(key) ?? { title: task.title.trim(), ids: Object.fromEntries(DAYS.map((d) => [d, []])) as unknown as Record<Day, string[]> };
        entry.ids[day].push(task.id);
        byKey.set(key, entry);
      }
    }
  }
  const dates: Date[] = [];
  const span = Math.max(count, history);                                // the streak and the first mark read the whole history
  for (let i = span - 1; i >= 0; i--) dates.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i));
  const todayKey = dateKey(today);
  const out: Habit[] = [];
  for (const [key, { title, ids }] of byKey) {
    const days = dates.map((date) => {
      const k = dateKey(date);
      const cards = ids[dayOf(date)];
      if (!cards.length) return { date: k, result: 'none' as DayResult };
      const states = cards.map((id) => statusOf(marksByDate[k], id));
      const result: DayResult = states.includes('done') ? 'done'
        : states.includes('late') ? 'late'
        : states.includes('progress') ? 'progress'
        : states.includes('skipped') ? 'skipped'
        : k === todayKey ? 'pending' : 'missed';
      return { date: k, result };
    });
    // A habit's history starts the first day it was marked (any state): days before it never count as missed,
    // so a task added today does not show a week of misses.
    const first = days.findIndex((d) => d.result !== 'none' && d.result !== 'missed' && d.result !== 'pending');
    for (let i = 0; i < (first < 0 ? days.length : first); i++) if (days[i].result === 'missed') days[i] = { ...days[i], result: 'none' };
    const { streak, capped } = streakInfo(days.map((d) => d.result));
    // The streak may go back further only when the habit was already being marked on its first PLANNED day read
    // (days with nothing planned before it just pause the streak).
    const firstPlanned = days.findIndex((d, i) => ids[dayOf(dates[i])].length > 0);
    out.push({ key, title, days: days.slice(-count), streak, streakCapped: capped && first >= 0 && first === firstPlanned });
  }
  return out.sort((a, b) => b.streak - a.streak || a.title.localeCompare(b.title));
}

/** Counted back from the last day: finished days add one, unplanned/skipped days (and today still open) are passed over. */
export function streakOf(results: DayResult[]): number {
  return streakInfo(results).streak;
}

/** The streak, and whether counting it ran into the oldest day given (nothing ended it). */
export function streakInfo(results: DayResult[]): { streak: number; capped: boolean } {
  let streak = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i];
    if (r === 'done' || r === 'late') streak++;
    else if (r === 'none' || r === 'skipped' || (i === results.length - 1 && (r === 'pending' || r === 'progress'))) continue;
    else return { streak, capped: false };
  }
  return { streak, capped: streak > 0 };
}
