import { Todo, allDayTodos, dayOverview, checkTodo, doneTodos, openTodos, overdueTodos, pastDueTodos, pinTodos, sanitizeTodo, todosForDate, weekDate } from './todo.model';
import { DayPlan } from './week.model';

const todo = (id: string, extra: Partial<Todo> = {}): Todo => ({ id, title: id, date: '2026-11-10', time: null, done: null, created: 1, repeat: [], doneOn: {}, ...extra });

describe('todo model', () => {
  it('sanitizes what Firestore holds', () => {
    expect(sanitizeTodo('a', { title: ' Pay ', date: '2026-11-10', time: '9:30', done: null, created: 5 }))
      .toEqual({ id: 'a', title: 'Pay', date: '2026-11-10', time: '9:30', done: null, created: 5, repeat: [], doneOn: {} });
    expect(sanitizeTodo('b', { title: 'x', date: 'tomorrow', time: '25:00' })).toEqual({ id: 'b', title: 'x', date: null, time: null, done: null, created: 0, repeat: [], doneOn: {} });
    expect(sanitizeTodo('c', { title: '  ' })).toBeNull();
  });

  it('lists the open ones soonest first and the finished ones last checked first', () => {
    const list = [todo('late', { time: '18:00' }), todo('none', { date: null }), todo('early', { time: '08:00' }), todo('done', { done: 9 }), todo('done2', { done: 20 })];
    expect(openTodos(list).map((t) => t.id)).toEqual(['early', 'late', 'none']);
    expect(doneTodos(list).map((t) => t.id)).toEqual(['done2', 'done']);
  });

  it('finds the date of each weekday in the week of today (Monday first)', () => {
    const tuesday = new Date(2026, 10, 10);
    expect(weekDate(tuesday, 'MONDAY')).toBe('2026-11-09');
    expect(weekDate(tuesday, 'SUNDAY')).toBe('2026-11-15');
    expect(weekDate(new Date(2026, 10, 15), 'MONDAY')).toBe('2026-11-09');   // a Sunday belongs to the week before
  });

  it('puts a timed todo on top of the activity running at its hour, else the closest one in time', () => {
    const plan: DayPlan = { blocks: [
      { id: 'b', name: 'B', start: '09:00', end: '12:00', tasks: [
        { id: 't1', title: 'Work', minutes: 60, color: null, active: true, ref: null },
        { id: 't2', title: 'Read', minutes: 30, color: null, active: true, ref: null },
      ] },
      { id: 'e', name: 'E', start: '18:00', end: '19:00', tasks: [{ id: 't3', title: 'Dinner', minutes: 60, color: null, active: true, ref: null }] },
    ] };
    const list = [todo('a2', { time: '09:45' }), todo('a', { time: '09:30' }), todo('b', { time: '10:15' }), todo('c', { time: '13:00' }),
      todo('early', { time: '07:00' }), todo('late', { time: '22:00' }), todo('mid', { time: '14:00' }), todo('d')];
    const { onTask, loose } = pinTodos(plan, list);
    expect(onTask.get('t1')?.map((t) => t.id)).toEqual(['early', 'a', 'a2']);   // before the day's first activity: on it
    expect(onTask.get('t2')?.map((t) => t.id)).toEqual(['b', 'c', 'mid']);       // 13:00 and 14:00 are nearer Read's end (10:30) than Dinner (18:00)
    expect(onTask.get('t3')?.map((t) => t.id)).toEqual(['late']);
    expect(loose.map((t) => t.id)).toEqual(['d']);                               // only the ones with no hour
  });

  it('breaks a tie between two activities in favour of the earlier one, and prefers the one running', () => {
    const plan: DayPlan = { blocks: [
      { id: 'm', name: 'M', start: '09:00', end: '10:00', tasks: [{ id: 'am', title: 'Am', minutes: 60, color: null, active: true, ref: null }] },
      { id: 'n', name: 'N', start: '12:00', end: '13:00', tasks: [{ id: 'pm', title: 'Pm', minutes: 60, color: null, active: true, ref: null }] },
    ] };
    const { onTask } = pinTodos(plan, [todo('half', { time: '11:00' }), todo('edge', { time: '12:00' }), todo('ended', { time: '10:00' })]);
    expect(onTask.get('am')?.map((t) => t.id)).toEqual(['ended', 'half']);   // 11:00 is 60 min from both: the earlier wins
    expect(onTask.get('pm')?.map((t) => t.id)).toEqual(['edge']);            // 12:00 is when Pm starts: it is running
  });

  it('leaves timed todos loose when the day has no activity with a time', () => {
    const plan: DayPlan = { blocks: [{ id: 'b', name: 'B', start: null, end: null, tasks: [
      { id: 't1', title: 'Work', minutes: 60, color: null, active: true, ref: null }] }] };
    expect(pinTodos(plan, [todo('a', { time: '09:30' })]).loose.map((t) => t.id)).toEqual(['a']);
    expect(pinTodos({ blocks: [] }, [todo('a', { time: '09:30' })]).loose.map((t) => t.id)).toEqual(['a']);
  });

  it('reads repeat days and per-date checks, dropping anything invalid', () => {
    expect(sanitizeTodo('r', { title: 'Gym', repeat: ['FRIDAY', 'MONDAY', 'NOPE'], doneOn: { '2026-11-09': 5, bad: 1, '2026-11-13': 'x' } }))
      .toEqual(expect.objectContaining({ repeat: ['MONDAY', 'FRIDAY'], doneOn: { '2026-11-09': 5 } }));
  });

  it('puts a repeating task on its weekdays, checked per date, and never in Finished', () => {
    const gym = todo('gym', { date: null, repeat: ['MONDAY', 'WEDNESDAY'], doneOn: { '2026-11-09': 7 } });
    expect(todosForDate([gym], '2026-11-09', 'MONDAY')).toEqual([expect.objectContaining({ id: 'gym', done: 7 })]);
    expect(todosForDate([gym], '2026-11-11', 'WEDNESDAY')).toEqual([expect.objectContaining({ id: 'gym', done: null })]);
    expect(todosForDate([gym], '2026-11-10', 'TUESDAY')).toEqual([]);
    expect(openTodos([gym, todo('one', { done: 3 })]).map((t) => t.id)).toEqual(['gym']);
    expect(doneTodos([gym, todo('one', { done: 3 })]).map((t) => t.id)).toEqual(['one']);
  });

  it('rolls the open single tasks of earlier days over to today, oldest first', () => {
    const list = [todo('mon', { date: '2026-11-09', time: '10:00' }), todo('sun', { date: '2026-11-08' }), todo('done', { date: '2026-11-09', done: 1 }),
      todo('today', { date: '2026-11-10' }), todo('rep', { date: '2026-11-01', repeat: ['MONDAY'] }), todo('none', { date: null })];
    expect(overdueTodos(list, '2026-11-10').map((t) => t.id)).toEqual(['sun', 'mon']);
  });

  it("lists today's open tasks whose hour has passed, a repeating one as today sees it", () => {
    const list = [todo('late', { date: '2026-11-11', time: '10:00' }), todo('early', { date: '2026-11-11', time: '08:30' }),
      todo('later', { date: '2026-11-11', time: '18:00' }), todo('free', { date: '2026-11-11' }), todo('done', { date: '2026-11-11', time: '07:00', done: 1 }),
      todo('gym', { date: null, time: '07:00', repeat: ['WEDNESDAY'] }), todo('gymDone', { date: null, time: '07:00', repeat: ['WEDNESDAY'], doneOn: { '2026-11-11': 2 } }),
      todo('yesterday', { date: '2026-11-10', time: '07:00' })];
    expect(pastDueTodos(list, '2026-11-11', 'WEDNESDAY', 12 * 60).map((t) => t.id)).toEqual(['gym', 'early', 'late']);
  });

  it("lists today's open tasks with no hour, a repeating one as today sees it, oldest captured first", () => {
    const list = [todo('b', { date: '2026-11-11', created: 20 }), todo('a', { date: '2026-11-11', created: 10 }),
      todo('timed', { date: '2026-11-11', time: '18:00' }), todo('done', { date: '2026-11-11', done: 1 }),
      todo('gym', { date: null, repeat: ['WEDNESDAY'], created: 5 }), todo('gymDone', { date: null, repeat: ['WEDNESDAY'], doneOn: { '2026-11-11': 2 } }),
      todo('yesterday', { date: '2026-11-10' }), todo('tomorrow', { date: '2026-11-12' })];
    expect(allDayTodos(list, '2026-11-11', 'WEDNESDAY').map((t) => t.id)).toEqual(['gym', 'a', 'b']);
  });

  it('checks a rolled-over task on the day it is ticked, and a repeating one per date', () => {
    expect(checkTodo(todo('late', { date: '2026-11-09' }), true, '2026-11-10', 5)).toEqual(expect.objectContaining({ done: 5, date: '2026-11-10' }));
    expect(checkTodo(todo('now', { date: '2026-11-12' }), true, '2026-11-10', 5)).toEqual(expect.objectContaining({ done: 5, date: '2026-11-12' }));
    expect(checkTodo(todo('x', { done: 5 }), false, '2026-11-10', 6)).toEqual(expect.objectContaining({ done: null, date: '2026-11-10' }));
    const gym = todo('gym', { repeat: ['MONDAY'], doneOn: { '2026-11-02': 1 } });
    expect(checkTodo(gym, true, '2026-11-09', 7).doneOn).toEqual({ '2026-11-02': 1, '2026-11-09': 7 });
    expect(checkTodo(gym, false, '2026-11-02', 7).doneOn).toEqual({});
  });

  it('lays out the day overview: all-day tasks first, then blocks, activities and their timed tasks', () => {
    const plan: DayPlan = { blocks: [
      { id: 'b1', name: 'Morning', start: '07:00', end: '09:00', tasks: [
        { id: 'run', title: 'Run', minutes: 30, color: null, active: true, ref: null },
        { id: 'off', title: 'Off', minutes: 30, color: null, active: false, ref: null },
      ] },
      { id: 'b2', name: 'Empty', start: null, end: null, tasks: [{ id: 'gone', title: 'Gone', minutes: 10, color: null, active: false, ref: null }] },
      { id: 'b3', name: 'Work', start: '09:00', end: '12:00', tasks: [{ id: 'mail', title: 'Mail', minutes: 60, color: null, active: true, ref: null }] },
    ] };
    const list = [
      todo('old', { date: '2026-11-09' }),
      todo('free2', { created: 3 }), todo('free1', { created: 2 }),
      todo('call', { time: '10:15' }), todo('jog', { time: '07:10' }), todo('late', { time: '07:40' }),
      todo('other', { date: '2026-11-11', time: '10:00' }),
    ];
    const view = dayOverview(plan, list, '2026-11-10', 'TUESDAY');
    expect(view.allDay.map((t) => t.id)).toEqual(['old', 'free1', 'free2']);
    expect(view.blocks.map((b) => b.block.name)).toEqual(['Morning', 'Work']);
    expect(view.blocks[0].activities.map((a) => [a.task.id, a.start, a.todos.map((t) => t.id)])).toEqual([['run', 420, ['jog']]]);
    expect(view.blocks[1].activities[0].todos.map((t) => t.id)).toEqual(['call']);
    expect(view.later.map((t) => t.id)).toEqual(['late']);   // it sat on the switched-off activity
  });
});
