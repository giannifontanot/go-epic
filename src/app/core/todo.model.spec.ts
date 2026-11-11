import { Todo, checkTodo, doneTodos, openTodos, overdueTodos, pastDueTodos, pinTodos, sanitizeTodo, stackPins, todosForDate, weekDate } from './todo.model';
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

  it('pins a todo over the activity running at its hour, else leaves it loose', () => {
    const plan: DayPlan = { blocks: [{ id: 'b', name: 'B', start: '09:00', end: '12:00', tasks: [
      { id: 't1', title: 'Work', minutes: 60, color: null, active: true, ref: null },
      { id: 't2', title: 'Read', minutes: 30, color: null, active: true, ref: null },
    ] }] };
    const { onTask, loose } = pinTodos(plan, [todo('a', { time: '09:30' }), todo('b', { time: '10:15' }), todo('c', { time: '13:00' }), todo('d')]);
    expect(onTask.get('t1')).toEqual([{ todo: expect.objectContaining({ id: 'a' }), fraction: 0.5 }]);
    expect(onTask.get('t2')).toEqual([{ todo: expect.objectContaining({ id: 'b' }), fraction: 0.5 }]);
    expect(loose.map((t) => t.id)).toEqual(['c', 'd']);
  });

  it('stacks pinned notes that would cover each other', () => {
    const pin = (id: string, fraction: number) => ({ todo: todo(id), fraction });
    const stacks = stackPins([pin('c', 0.9), pin('a', 0.5), pin('b', 0.5), pin('d', 0.55)], 0.1);
    expect(stacks.map((s) => [s.fraction, s.todos.map((t) => t.id)])).toEqual([[0.5, ['a', 'b', 'd']], [0.9, ['c']]]);
    expect(stackPins([pin('a', 0.1), pin('b', 0.6)], 0.2).length).toBe(2);
    expect(stackPins([pin('a', 0.5), pin('b', 0.5), pin('c', 0.65)], 0.1).map((s) => s.todos.length)).toEqual([3]);   // c would sit under the stack's notes
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

  it('checks a rolled-over task on the day it is ticked, and a repeating one per date', () => {
    expect(checkTodo(todo('late', { date: '2026-11-09' }), true, '2026-11-10', 5)).toEqual(expect.objectContaining({ done: 5, date: '2026-11-10' }));
    expect(checkTodo(todo('now', { date: '2026-11-12' }), true, '2026-11-10', 5)).toEqual(expect.objectContaining({ done: 5, date: '2026-11-12' }));
    expect(checkTodo(todo('x', { done: 5 }), false, '2026-11-10', 6)).toEqual(expect.objectContaining({ done: null, date: '2026-11-10' }));
    const gym = todo('gym', { repeat: ['MONDAY'], doneOn: { '2026-11-02': 1 } });
    expect(checkTodo(gym, true, '2026-11-09', 7).doneOn).toEqual({ '2026-11-02': 1, '2026-11-09': 7 });
    expect(checkTodo(gym, false, '2026-11-02', 7).doneOn).toEqual({});
  });
});
