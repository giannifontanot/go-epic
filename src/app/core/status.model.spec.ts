import { DayMarks, Status, applyStatus, habits, isFinished, statusOf, statusPatch, streakInfo, streakOf } from './status.model';
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

  it('reads a longer history than it draws: the real streak and the first mark', () => {
    const week: Week = emptyWeek();
    for (const day of ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const) {
      week[day] = { blocks: [{ id: day, name: day, start: null, end: null, tasks: [task('t-' + day, 'Pray', { ref: 'lib-pray' })] }] };
    }
    const today = new Date(2026, 10, 9);
    const marks: Record<string, DayMarks> = {};
    for (let i = 1; i <= 30; i++) {                                         // done the 30 days before today
      const d = new Date(2026, 10, 9 - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const day = (['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const)[d.getDay()];
      marks[key] = { done: { ['t-' + day]: 1 } };
    }
    const [pray] = habits(week, marks, today, 14, 90);
    expect(pray.days.length).toBe(14);
    expect(pray.streak).toBe(30);
    expect(pray.streakCapped).toBe(false);
    expect(streakInfo(['done', 'done'])).toEqual({ streak: 2, capped: true });
  });

  it('a weekly habit marked on every planned day read shows its streak as "n+"', () => {
    const week: Week = emptyWeek();
    week.MONDAY = { blocks: [{ id: 'b', name: 'B', start: null, end: null, tasks: [task('m', 'Plan')] }] };
    const today = new Date(2026, 10, 9);                                     // a Monday
    const marks: Record<string, DayMarks> = {};
    for (let w = 0; w < 13; w++) {                                           // every Monday of the 90 days read
      const d = new Date(2026, 10, 9 - 7 * w);
      marks[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`] = { done: { m: 1 } };
    }
    const [plan] = habits(week, marks, today, 14, 90);
    expect(plan.streak).toBe(13);
    expect(plan.streakCapped).toBe(true);
  });
});
