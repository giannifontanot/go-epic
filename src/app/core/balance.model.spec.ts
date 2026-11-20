import { balance, balanceFromKey, firstMarkedKey, overall, periodWindows, radarPoint } from './balance.model';
import { Library, LibNode } from './library.model';
import { Task, Week, emptyWeek } from './week.model';

const node = (id: string, kind: LibNode['kind'], parentId: string | null, title = id): LibNode => ({ id, kind, title, parentId, color: null });
const task = (id: string, ref: string | null, extra: Partial<Task> = {}): Task => ({ id, title: id, minutes: 10, color: null, active: true, ref, ...extra });

// Two areas; Health has two Epics, Home one. "run" and "read" are Activities under Body and Mind; Free Space "loose".
const lib: Library = {
  nodes: [
    node('health', 'area', null, 'Health'), node('body', 'epic', 'health', 'Body'), node('mind', 'epic', 'health', 'Mind'),
    node('home', 'area', null, 'Home'), node('order', 'epic', 'home', 'Order'),
    node('f1', 'feature', 'body'), node('s1', 'story', 'f1'), node('run', 'task', 's1', 'Run'),
    node('f2', 'feature', 'mind'), node('s2', 'story', 'f2'), node('read', 'task', 's2', 'Read'),
    node('loose', 'task', null, 'Loose'),
  ],
};

function weekEveryDay(tasks: Task[]): Week {
  const week = emptyWeek();
  for (const day of Object.keys(week) as (keyof Week)[]) week[day] = { blocks: [{ id: 'b', name: 'B', start: null, end: null, tasks: structuredClone(tasks) }] };
  return week;
}

describe('balance periods', () => {
  it('3 weeks is the last 21 days against the 21 before', () => {
    const w = periodWindows('3w', new Date(2026, 10, 20));
    expect(w.current).toEqual({ from: '2026-10-31', to: '2026-11-20' });
    expect(w.previous).toEqual({ from: '2026-10-10', to: '2026-10-30' });
  });

  it('the quarter is the calendar quarter so far against the whole previous one (across a year)', () => {
    expect(periodWindows('quarter', new Date(2026, 10, 20))).toEqual({
      current: { from: '2026-10-01', to: '2026-11-20' }, previous: { from: '2026-07-01', to: '2026-09-30' },
    });
    expect(periodWindows('quarter', new Date(2026, 1, 3)).previous).toEqual({ from: '2025-10-01', to: '2025-12-31' });
    expect(balanceFromKey(new Date(2026, 10, 20))).toBe('2026-07-01');
  });
});

describe('balance', () => {
  const today = new Date(2026, 10, 20);   // a Friday

  it('gives each Epic the share finished, no plan when nothing was planned, grouped by area', () => {
    const week = weekEveryDay([task('r', 'run'), task('loose-card', 'loose'), task('plain', null)]);
    const marks = {
      '2026-11-17': { done: { r: 1 } },
      '2026-11-18': { done: { r: 1 }, status: { r: 'late' } },
      '2026-11-19': { status: { r: 'progress' } },
    };
    const axes = balance(lib, week, marks, '3w', today);
    expect(axes.map((a) => [a.epicTitle, a.areaIndex])).toEqual([['Body', 0], ['Mind', 0], ['Order', 1]]);
    const body = axes[0];
    // 17th, 18th, 19th counted (from the first mark on); today untouched is left out
    expect([body.planned, body.done]).toEqual([3, 2]);
    expect(body.value).toBeCloseTo(2 / 3);
    expect(body.activities).toEqual([{ key: 'run', title: 'Run', planned: 3, done: 2 }]);
    expect(axes[1].value).toBeNull();
    expect(axes[2].value).toBeNull();
    expect(overall(axes)).toBeCloseTo(2 / 3);
  });

  it('counts today only once finished, leaves skipped out, and compares with the previous period', () => {
    const week = weekEveryDay([task('r', 'run'), task('m', 'read'), task('off', 'read', { active: false })]);
    const marks = {
      '2026-10-28': { done: { r: 1 } },                 // previous period: run 1 of 3 (28, 29, 30), read 0 of 3
      '2026-11-19': { status: { r: 'skipped' } },
      '2026-11-20': { done: { m: 1 } },
    };
    const axes = balance(lib, week, marks, '3w', today);
    const [body, mind] = axes;
    // current: Oct 31 … Nov 19 = 20 days, minus the skipped 19th → 19 planned, none done
    expect([body.planned, body.done]).toEqual([19, 0]);
    expect(body.value).toBe(0);
    expect(body.previous).toBeCloseTo(1 / 3);
    // read: 20 past days not done + today done = 21 planned, 1 done
    expect([mind.planned, mind.done]).toEqual([21, 1]);
    expect(mind.previous).toBe(0);
    expect(overall(axes, true)).toBeCloseTo(1 / 6);
  });

  it('nothing counts before anything was ever marked', () => {
    expect(firstMarkedKey({ '2026-11-02': {}, '2026-11-05': { status: { a: 'skipped' } }, '2026-11-09': { done: { a: 1 } } })).toBe('2026-11-05');
    const axes = balance(lib, weekEveryDay([task('r', 'run')]), {}, 'quarter', today);
    expect(axes.every((a) => a.value === null && a.previous === null)).toBe(true);
    expect(overall(axes)).toBeNull();
  });

  it('a first mark older than the history read still starts the count', () => {
    const week = weekEveryDay([task('r', 'run')]);
    const marks = { '2026-11-19': { done: { r: 1 } } };
    // only the 19th and on were read: the 19th is the start, today is open
    expect(balance(lib, week, marks, '3w', today)[0].planned).toBe(1);
    // the user's day documents go back to June: the whole 3 weeks count
    const body = balance(lib, week, marks, '3w', today, '2026-06-02')[0];
    expect([body.planned, body.done]).toEqual([20, 1]);
    expect(body.previous).toBe(0);
  });

  it('places axis 0 at the top, then clockwise', () => {
    const top = radarPoint(0, 4, 10);
    const right = radarPoint(1, 4, 10);
    expect(top.x).toBeCloseTo(0);
    expect(top.y).toBeCloseTo(-10);
    expect(right.x).toBeCloseTo(10);
    expect(right.y).toBeCloseTo(0);
  });
});
