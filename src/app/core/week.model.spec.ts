import {
  Block, PASTELS, Task, blockColors, cloneBlock, dateKey, dayOf, fits, formatClock, freeMinutes, moveItem, nowPosition,
  parseClock, placeBlock, taskStarts, taskTotal, timeline, uniqueName, validMinutes, windowError,
} from './week.model';

const task = (id: string, minutes: number, extra: Partial<Task> = {}): Task => ({ id, title: id, minutes, color: null, active: true, ref: null, ...extra });
const block = (id: string, start: string | null, end: string | null, tasks: Task[]): Block => ({ id, name: id, start, end, tasks });

describe('week model', () => {
  it('reads and writes 24h clock times', () => {
    expect(parseClock('06:30')).toBe(390);
    expect(parseClock('6:05')).toBe(365);
    expect(parseClock('24:00')).toBeNull();
    expect(parseClock('6')).toBeNull();
    expect(parseClock(null)).toBeNull();
    expect(formatClock(390)).toBe('06:30');
    expect(formatClock(1440 + 15)).toBe('00:15');
  });

  it('keeps minutes whole, positive and within a day', () => {
    expect(validMinutes('15')).toBe(15);
    expect(validMinutes(-3)).toBe(0);
    expect(validMinutes('abc')).toBe(0);
    expect(validMinutes(5000)).toBe(1440);
  });

  it('cascades task start times from the block start', () => {
    const b = block('b', '06:00', '07:00', [task('a', 15), task('c', 20), task('d', 10)]);
    expect(taskStarts(b)).toEqual([360, 375, 395]);
    expect(taskStarts(block('n', null, null, [task('a', 15)]))).toEqual([null]);
  });

  it('measures a window: total, free time and whether a task fits', () => {
    const b = block('b', '06:00', '06:45', [task('a', 15), task('c', 20)]);
    expect(taskTotal(b)).toBe(35);
    expect(freeMinutes(b)).toBe(10);
    expect(fits(b, 10)).toBe(true);
    expect(fits(b, 11)).toBe(false);
    expect(freeMinutes(block('n', '06:00', null, []))).toBeNull();
    expect(fits(block('n', null, null, []), 999)).toBe(true);
  });

  it('refuses windows that cannot hold their tasks', () => {
    expect(windowError('', '07:00', 0)).toBe('end_without_start');
    expect(windowError('07:00', '06:00', 0)).toBe('end_before_start');
    expect(windowError('06:00', '06:30', 45)).toBe('too_small');
    expect(windowError('06:00', '07:00', 45)).toBeNull();
    expect(windowError('', '', 45)).toBeNull();
  });

  it('moves items and names blocks uniquely', () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 0, 5)).toEqual([1, 2, 3]);
    expect(uniqueName(['Dawn', 'Dawn 2'], 'Dawn')).toBe('Dawn 3');
    expect(uniqueName(['Dawn'], 'Noon')).toBe('Noon');
  });

  it('places a copied block at its hour, or at the end without one', () => {
    const day = [block('early', '06:00', null, []), block('late', '20:00', null, [])];
    expect(placeBlock(day, block('noon', '12:00', null, [])).map((b) => b.id)).toEqual(['early', 'noon', 'late']);
    expect(placeBlock(day, block('any', null, null, [])).map((b) => b.id)).toEqual(['early', 'late', 'any']);
  });

  it('copies a block with new ids', () => {
    const original = block('b', '06:00', null, [task('a', 15)]);
    const copy = cloneBlock(original, 'b 2');
    expect(copy.name).toBe('b 2');
    expect(copy.id).not.toBe(original.id);
    expect(copy.tasks[0].id).not.toBe('a');
    expect(copy.tasks[0].title).toBe('a');
  });

  it('knows the weekday (Monday first) and the local date key', () => {
    const monday = new Date(2026, 10, 9, 8, 0);
    expect(dayOf(monday)).toBe('MONDAY');
    expect(dayOf(new Date(2026, 10, 15))).toBe('SUNDAY');
    expect(dateKey(monday)).toBe('2026-11-09');
  });

  it('colours cards: a picked colour wins, and no automatic card looks like the one above', () => {
    const tasks = Array.from({ length: 12 }, (_, i) => task('t' + i, 5));
    const colors = blockColors(tasks);
    const alike = (a: string, b: string) => a === b || (new Set([a, b]).size === 2 && [a, b].every((c) => c === PASTELS[0] || c === PASTELS[1]));
    for (let i = 1; i < colors.length; i++) expect(alike(colors[i - 1], colors[i])).toBe(false);
    expect(blockColors([task('x', 5, { color: '#ffc9d6' })])).toEqual(['#ffc9d6']);
  });

  it('puts the now-line inside the running task, at the share already gone', () => {
    const plan = { blocks: [block('b', '06:00', null, [task('a', 30), task('c', 30, { active: false }), task('d', 60)])] };
    expect(timeline(plan).map((t) => [t.start, t.end])).toEqual([[360, 390], [390, 420], [420, 480]]);
    expect(nowPosition(plan, 300)).toEqual({ taskId: 'a', fraction: 0 });        // before the first task: its top
    expect(nowPosition(plan, 375)).toEqual({ taskId: 'a', fraction: 0.5 });
    expect(nowPosition(plan, 400)).toEqual({ taskId: 'a', fraction: 1 });        // inactive tasks are skipped
    expect(nowPosition(plan, 450)).toEqual({ taskId: 'd', fraction: 0.5 });
    expect(nowPosition(plan, 600)).toEqual({ taskId: 'd', fraction: 1 });        // after the last: its bottom
    expect(nowPosition({ blocks: [block('n', null, null, [task('a', 10)])] }, 400)).toBeNull();
  });
});
