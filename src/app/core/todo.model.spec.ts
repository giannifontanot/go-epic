import { Todo, doneTodos, openTodos, pinTodos, sanitizeTodo, weekDate } from './todo.model';
import { DayPlan } from './week.model';

const todo = (id: string, extra: Partial<Todo> = {}): Todo => ({ id, title: id, date: '2026-11-10', time: null, done: null, created: 1, ...extra });

describe('todo model', () => {
  it('sanitizes what Firestore holds', () => {
    expect(sanitizeTodo('a', { title: ' Pay ', date: '2026-11-10', time: '9:30', done: null, created: 5 }))
      .toEqual({ id: 'a', title: 'Pay', date: '2026-11-10', time: '9:30', done: null, created: 5 });
    expect(sanitizeTodo('b', { title: 'x', date: 'tomorrow', time: '25:00' })).toEqual({ id: 'b', title: 'x', date: null, time: null, done: null, created: 0 });
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
});
