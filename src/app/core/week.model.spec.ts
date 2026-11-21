import {
  Block, PASTELS, Task, blockColors, noteVar, toneVar, cloneBlock, dateKey, dayOf, fits, formatClock, freeMinutes, moveItem, stepTask, nowPosition, countdown,
  parseClock, placeBlock, stretchedEnd, resizedMinutes, taskStarts, taskTotal, timeline, uniqueName, validMinutes, windowError, moveToHour, addDayBlocks, snapDelta,
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
    // remembered: a card keeps its automatic colour when it moves, whatever is above it now
    const memo = new Map<string, string>();
    const before = blockColors(tasks, memo);
    expect(blockColors([...tasks].reverse(), memo)).toEqual([...before].reverse());
    expect(memo.size).toBe(tasks.filter((t) => !t.color).length);
  });

  it('draws a stored colour through the theme, keeping the stored value as the fallback (Epic)', () => {
    expect(toneVar('#a7e7e3')).toBe('var(--act-0, #a7e7e3)');
    expect(toneVar('#EADCC8')).toBe('var(--act-7, #eadcc8)');      // sand, the last of the 8 choices
    expect(toneVar('#ffcad7')).toBe('var(--act-4, #ffcad7)');      // an unknown colour: the nearest choice (rose), shown as itself in Epic
    expect(toneVar(null)).toBeNull();
    expect(toneVar('var(--x)')).toBe('var(--x)');
    expect(noteVar('#ffd5bd')).toBe('var(--note-3, #ffd5bd)');
    expect(noteVar('#fff0a6')).toMatch(/^var\(--note-[0-3], #fff0a6\)$/);   // a task's tone is one of the 4 paper tints
  });

  it('counts down only the activity running now, by the minutes still left', () => {
    const plan = { blocks: [block('b', '06:00', null, [task('a', 30), task('z', 0), task('c', 30, { active: false }), task('d', 60)])] };
    expect(countdown(plan, 300)).toBeNull();                                      // nothing started yet
    expect(countdown(plan, 360)).toEqual({ taskId: 'a', left: 30, share: 1 });     // just started: all of it left
    expect(countdown(plan, 375)).toEqual({ taskId: 'a', left: 15, share: 0.5 });
    expect(countdown(plan, 390)).toBeNull();                                      // a 0-minute task has nothing to count
    expect(countdown(plan, 400)).toBeNull();                                      // inactive ones are skipped: between tasks
    expect(countdown(plan, 435)).toEqual({ taskId: 'd', left: 45, share: 0.75 });
    expect(countdown(plan, 480)).toBeNull();                                      // over
  });

  it('steps a card up or down, across into the block above or below at its edges', () => {
    const day = () => [
      block('a', '06:00', '07:00', [task('a1', 20), task('a2', 20)]),
      block('b', '07:00', '07:30', [task('b1', 10)]),
      block('c', '08:00', null, [task('c1', 10)]),
    ];
    const ids = (r: ReturnType<typeof stepTask>) => (r && 'blocks' in r ? r.blocks.map((b) => b.id + ':' + b.tasks.map((t) => t.id).join(',')) : r);
    expect(ids(stepTask(day(), 'a', 0, 1))).toEqual(['a:a2,a1', 'b:b1', 'c:c1']);          // inside its block
    expect(ids(stepTask(day(), 'a', 1, 1))).toEqual(['a:a1', 'b:a2,b1', 'c:c1']);           // last ▼: first of the block below
    expect(ids(stepTask(day(), 'c', 0, -1))).toEqual(['a:a1,a2', 'b:b1,c1']);               // first ▲: last of the block above; its emptied block goes
    expect(stepTask(day(), 'a', 0, -1)).toBeNull();                                         // the day's first
    expect(stepTask(day(), 'c', 0, 1)).toBeNull();                                          // the day's last
    const full = day().map((b) => (b.id === 'b' ? { ...b, tasks: [task('b1', 25)] } : b));
    const times = (r: ReturnType<typeof stepTask>) => (r && 'blocks' in r ? r.blocks.map((b) => `${b.id} ${b.start}-${b.end}`) : r);
    // the boundary moves by exactly the card's minutes: the block below starts 20 earlier, the one above ends 20 earlier
    expect(times(stepTask(full, 'a', 1, 1))).toEqual(['a 06:00-06:40', 'b 06:40-07:30', 'c 08:00-null']);
    // even into free time (Gianni: the two blocks keep the same total): b had 5 free and still grows by the 20
    expect(times(stepTask(day(), 'a', 1, 1))).toEqual(['a 06:00-06:40', 'b 06:40-07:30', 'c 08:00-null']);
    // ▲ from a block's top: the block above grows by the card's minutes, this one starts later by the same
    const tight = [block('a', '06:00', '07:00', [task('a1', 60)]), block('b', '07:00', '08:00', [task('b1', 30), task('b2', 30)])];
    expect(times(stepTask(tight, 'b', 0, -1))).toEqual(['a 06:00-07:30', 'b 07:30-08:00']);
    const up = stepTask(tight, 'b', 0, -1) as { blocks: Block[] };
    expect(taskStarts(up.blocks[0])).toEqual([360, 420]);                                  // b1 keeps 07:00, now in a
    expect(taskStarts(up.blocks[1])).toEqual([450]);                                       // b2 keeps 07:30
    const late = [block('a', '23:00', '23:50', [task('a1', 50)]), block('b', '23:50', '23:59', [task('b1', 20)])];
    expect(stepTask(late, 'b', 0, -1)).toEqual({ noRoom: late[0] });                       // never past midnight
    // zero-minute cards left behind keep a real window (at least a minute), never an empty one that reads as unbounded
    const zero = [block('a', '07:00', '08:00', [task('z', 0), task('a1', 60)]), block('b', '08:00', '09:00', [task('b1', 60)])];
    expect(times(stepTask(zero, 'a', 1, 1))).toEqual(['a 07:00-07:01', 'b 07:00-09:00']);
    const zeroUp = [block('a', '06:00', '07:00', [task('a1', 60)]), block('b', '07:00', '08:00', [task('b1', 60), task('z', 0)])];
    expect(times(stepTask(zeroUp, 'b', 0, -1))).toEqual(['a 06:00-08:00', 'b 07:59-08:00']);
  });

  it('snaps a handle to 5-minute steps', () => {
    expect(snapDelta(20, 1.4)).toBe(0);        // a small pull stays put
    expect(snapDelta(20, 3)).toBe(5);
    expect(snapDelta(23, 0)).toBe(2);          // an odd value lands on the nearest step: 25
    expect(snapDelta(23, -4)).toBe(-3);        // 20
    expect(snapDelta(420, 12)).toBe(10);       // 07:00 → 07:10
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

  it('stretches a block\'s end with the handle, never before its tasks end nor past 23:59', () => {
    const block = (start: string | null, end: string | null, minutes: number[]) =>
      ({ id: 'b', name: 'B', start, end, tasks: minutes.map((m, i) => ({ id: 't' + i, title: 'T', minutes: m, color: null, active: true, ref: null })) });
    expect(stretchedEnd(block('20:00', '21:03', [23, 19]), 10)).toBe('21:13');
    expect(stretchedEnd(block('20:00', '21:03', [23, 19]), -30)).toBe('20:42');   // tasks end at 20:42: no further
    expect(stretchedEnd(block('20:00', null, [30]), 15)).toBe('20:45');          // no end yet: from the tasks' end
    expect(stretchedEnd(block('23:30', '23:50', [10]), 60)).toBe('23:59');
    expect(stretchedEnd(block('08:00', '08:30', []), -60)).toBe('08:01');        // an empty block keeps one minute
    expect(stretchedEnd(block(null, null, [10]), 10)).toBeNull();
  });

  it('stretches a task\'s minutes with its handle, only into the block\'s free time and never below zero', () => {
    const block = (end: string | null, minutes: number[]) =>
      ({ id: 'b', name: 'B', start: '08:00', end, tasks: minutes.map((m, i) => ({ id: 't' + i, title: 'T', minutes: m, color: null, active: true, ref: null })) });
    expect(resizedMinutes(block('09:00', [20, 10]), 't0', 10)).toBe(30);
    expect(resizedMinutes(block('09:00', [20, 10]), 't0', 100)).toBe(50);    // 30 free minutes: up to 50
    expect(resizedMinutes(block('09:00', [20, 10]), 't1', -30)).toBe(0);
    expect(resizedMinutes(block('08:20', [20, 10]), 't0', 5)).toBe(20);      // over already: only shrinks
    expect(resizedMinutes(block('08:20', [20, 10]), 't0', -5)).toBe(15);
    expect(resizedMinutes(block(null, [20]), 't0', 7.4)).toBe(27);           // no end: free to grow
    expect(resizedMinutes(block(null, [20]), 'missing', 5)).toBe(0);
  });

  it('moves a block whose start changed to its hour; a block with no start stays', () => {
    const b = (id: string, start: string | null): Block => ({ id, name: id, start, end: null, tasks: [] });
    const day = [b('a', '07:00'), b('x', '12:00'), b('c', '09:00'), b('n', null)];
    expect(moveToHour(day, 'x').map((x) => x.id)).toEqual(['a', 'c', 'n', 'x']);   // later than every timed block: to the end, as placeBlock does
    expect(moveToHour([b('a', '07:00'), b('n', null), b('c', '09:00')], 'n').map((x) => x.id)).toEqual(['a', 'n', 'c']);
    expect(moveToHour([b('a', '07:00'), b('c', '06:00')], 'c').map((x) => x.id)).toEqual(['c', 'a']);
  });

  it("copies or moves a whole day: each block at its hour, names unique, the target's blocks kept", () => {
    const b = (id: string, name: string, start: string | null): Block => ({ id, name, start, end: null, tasks: [task('t-' + id, 10)] });
    const target = [b('a', 'Gym', '07:00'), b('n', 'Notes', null)];
    const source = [b('x', 'Gym', '06:00'), b('y', 'Read', '08:00'), b('z', 'Free', null)];
    const moved = addDayBlocks(target, source, 'move');
    expect(moved.map((x) => x.id)).toEqual(['x', 'a', 'n', 'y', 'z']);
    expect(new Set(moved.map((x) => x.name.toLowerCase())).size).toBe(5);              // "Gym" gets a new name
    expect(moved[0].name).not.toBe('Gym');
    const copied = addDayBlocks(target, source, 'copy');
    expect(copied.map((x) => x.start)).toEqual(['06:00', '07:00', null, '08:00', null]);
    expect(copied.filter((x) => ['x', 'y', 'z'].includes(x.id))).toEqual([]);            // copies get new ids…
    expect(copied[0].tasks[0].id).not.toBe('t-x');                                      // …their tasks too
    expect(source.map((x) => x.name)).toEqual(['Gym', 'Read', 'Free']);                 // the source is untouched
    expect(target.length).toBe(2);
  });
});
