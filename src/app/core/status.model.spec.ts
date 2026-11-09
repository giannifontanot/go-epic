import { DayMarks, Status, applyStatus, habits, isFinished, statusOf, statusPatch, streakOf } from './status.model';
import { Task, Week, emptyWeek } from './week.model';

const task = (id: string, title = id, extra: Partial<Task> = {}): Task => ({ id, title, minutes: 10, color: null, active: true, ref: null, ...extra });

describe('task states', () => {
  it('reads old documents (done only) and the new states', () => {
    expect(statusOf({ done: { a: 1 } }, 'a')).toBe('done');
    expect(statusOf({ done: { a: 1 }, status: { a: 'late' } }, 'a')).toBe('late');
    expect(statusOf({ status: { a: 'skipped' } }, 'a')).toBe('skipped');
    expect(statusOf({ status: { a: 'progress' } }, 'a')).toBe('progress');
    expect(statusOf(undefined, 'a')).toBe('todo');
    expect(isFinished('late')).toBe(true);
    expect(isFinished('skipped')).toBe(false);
  });

  it('writes each state, keeping the first finish time', () => {
    expect(statusPatch({}, 'a', 'done', 5)).toEqual({ done: { a: 5 }, status: { a: null } });
    expect(statusPatch({ done: { a: 3 } }, 'a', 'late', 9)).toEqual({ done: { a: 3 }, status: { a: 'late' } });
    expect(statusPatch({ done: { a: 3 } }, 'a', 'skipped', 9)).toEqual({ done: { a: null }, status: { a: 'skipped' } });
    expect(statusPatch({}, 'a', 'todo', 9)).toEqual({ done: { a: null }, status: { a: null } });
    for (const s of ['todo', 'done', 'late', 'progress', 'skipped'] as Status[]) {
      expect(statusOf(applyStatus({ done: { a: 1 }, status: { a: 'late' } }, 'a', s, 2), 'a')).toBe(s);
    }
  });
});

describe('streaks', () => {
  it('counts finished days back from today; skipped and unplanned days pause, a missed day ends it', () => {
    expect(streakOf(['done', 'none', 'late', 'skipped', 'done', 'pending'])).toBe(3);
    expect(streakOf(['done', 'missed', 'done', 'done'])).toBe(2);
    expect(streakOf(['done', 'done', 'missed'])).toBe(0);
    expect(streakOf([])).toBe(0);
  });

  it('builds habits from the week plan and the day documents', () => {
    const week: Week = emptyWeek();
    // Monday 2026-11-09 is "today"; the habit is planned every day, by library ref, on two different cards.
    week.MONDAY = { blocks: [{ id: 'b', name: 'B', start: null, end: null, tasks: [task('m', 'Run', { ref: 'lib-run' })] }] };
    week.SUNDAY = { blocks: [{ id: 'c', name: 'C', start: null, end: null, tasks: [task('s', 'Run', { ref: 'lib-run' }), task('off', 'Off', { active: false })] }] };
    const marks: Record<string, DayMarks> = { '2026-11-08': { done: { s: 1 } }, '2026-11-02': { status: { m: 'skipped' } } };
    const [run, ...rest] = habits(week, marks, new Date(2026, 10, 9), 8);
    expect(rest).toEqual([]);                                            // inactive tasks are not habits
    expect(run.title).toBe('Run');
    expect(run.days.map((d) => d.result)).toEqual(['skipped', 'none', 'none', 'none', 'none', 'none', 'done', 'pending']);
    expect(run.streak).toBe(1);
  });

  it('starts a habit on its first marked day: earlier planned days are not misses', () => {
    const week: Week = emptyWeek();
    week.MONDAY = { blocks: [{ id: 'b', name: 'B', start: null, end: null, tasks: [task('m', 'Read')] }] };
    const [fresh] = habits(week, {}, new Date(2026, 10, 9), 8);              // never marked: last Monday is not a miss
    expect(fresh.days.map((d) => d.result)).toEqual(['none', 'none', 'none', 'none', 'none', 'none', 'none', 'pending']);
    const [later] = habits(week, { '2026-11-02': { done: { m: 1 } } }, new Date(2026, 10, 16), 15);
    expect(later.days[0].result).toBe('done');                               // 11-02, first mark
    expect(later.days[7].result).toBe('missed');                             // 11-09, after it: a real miss
  });
});
