import { aiContext, aiQuestion, applyPlan, parsePlan, plainReply, withoutPlan } from './ai.model';
import { LibNode, Library } from './library.model';
import { emptyWeek } from './week.model';

const n = (id: string, kind: LibNode['kind'], parentId: string | null, title = id): LibNode => ({ id, kind, title, parentId, color: null });
const lib = (): Library => ({
  nodes: [
    n('a', 'area', null, 'El Templo'), n('e', 'epic', 'a', 'Soy atleta'), n('f', 'feature', 'e', 'Correr'),
    n('s', 'story', 'f', 'Como corredor'), n('t', 'task', 's', 'Correr 20 min'), n('free', 'task', null, 'Leer'),
  ],
});

describe('ai model', () => {
  it('tells Claude the Canvas, the week with today\'s states, the habits and the open tasks', () => {
    const week = emptyWeek();
    week.MONDAY.blocks = [{ id: 'b', name: 'Mañana', start: '07:00', end: '08:00', tasks: [
      { id: 'c', title: 'Correr 20 min', minutes: 20, color: null, active: true, ref: 't' },
    ] }];
    const text = aiContext({
      now: new Date(2026, 10, 23, 9, 5), todayKey: '2026-11-23', today: 'MONDAY', lang: 'es', library: lib(), week,
      status: () => 'done',
      habits: [{ key: 't', title: 'Correr 20 min', days: [{ date: '2026-11-23', result: 'done' }], streak: 3, streakCapped: false }],
      taskHabits: [{ key: 'r', title: 'Orar', days: [{ date: '2026-11-23', result: 'done' }], streak: 5, streakCapped: false }],
      todos: [
        { id: 'x', title: 'Llamar a mamá', date: '2026-11-20', time: null, done: null, created: 0, repeat: [], doneOn: {} },
        { id: 'r', title: 'Orar', date: null, time: '06:00', done: null, created: 0, repeat: ['MONDAY'], doneOn: { '2026-11-23': 1 } },
      ],
      place: { quarter: 3, season: 'autumn', sprint: 3, week: 1 },
      levelNames: ['Área', 'Objetivo', 'Proyecto', 'Entrega', 'Acción'],
      sprintEpics: ['Soy atleta'],
    });
    expect(text).toContain('Epics chosen to push in this sprint: Soy atleta.');
    expect(text).toContain('Área > Objetivo > Proyecto > Entrega > Acción');
    expect(text).toContain('09:05');
    expect(text).toContain('sprint 3 of 4');
    expect(text).toContain('epic: Soy atleta');
    expect(text).toContain('07:00 Correr 20 min 20 min {epic: Soy atleta} [today: done]');
    expect(text).toContain('Undefined activities (no place yet): Leer');
    expect(text).toContain('Correr 20 min: ✓ streak 3');
    expect(text).toContain('Llamar a mamá (2026-11-20 (overdue))');
    expect(text).toContain('area: El Castillo (empty)');
    expect(text).toContain('REPEATING TASKS');
    expect(text).toContain('Orar: ✓ streak 5');
    expect(text).toContain('Orar (repeats MONDAY 06:00, done today)');
  });

  it('asks each preset question in the user\'s language', () => {
    expect(aiQuestion('how', 'es')).toMatch(/^¿Cómo voy\?/);
    expect(aiQuestion('attention', 'en')).toMatch(/^What should I pay attention to\?/);
  });

  it('reads the plan from a reply only when it is complete, with one of the four areas', () => {
    const reply = 'Listo.\n```json\n{"area":"el templo","epic":"Soy atleta","feature":"Nadar","story":"Como nadador","activity":"Nadar","minutes":30}\n```';
    expect(parsePlan(reply)).toEqual({ area: 'El Templo', epic: 'Soy atleta', feature: 'Nadar', story: 'Como nadador', activity: 'Nadar', minutes: 30 });
    expect(withoutPlan(reply)).toBe('Listo.');
    expect(parsePlan('¿Qué quieres lograr?')).toBeNull();
    expect(parsePlan('```json\n{"area":"Salud","epic":"a","feature":"b","story":"c","activity":"d"}\n```')).toBeNull();
    expect(parsePlan('```json\nnot json\n```')).toBeNull();
  });

  it('applies a plan reusing the levels that exist and making the rest', () => {
    let i = 0;
    const plan = { area: 'El Templo', epic: 'soy atleta', feature: 'Nadar', story: 'Como nadador', activity: 'Nadar', minutes: 30 };
    const { lib: next, id } = applyPlan(lib(), plan, 5, () => `new${i++}`);
    const made = next.nodes.filter((x) => x.id.startsWith('new'));
    expect(made.map((x) => [x.kind, x.parentId])).toEqual([['feature', 'e'], ['story', 'new0'], ['task', 'new1']]);
    expect(id).toBe('new2');
    expect(made[2]).toMatchObject({ created: 5, minutes: 30 });
    // the same plan again changes nothing and finds the same Activity
    const again = applyPlan(next, plan, 9, () => 'other');
    expect(again.lib.nodes.length).toBe(next.nodes.length);
    expect(again.id).toBe('new2');
  });

  it('creates the life area when the library has none yet', () => {
    const plan = { area: 'La Torre', epic: 'Soy maestro', feature: 'Enseñar', story: 'Como maestro', activity: 'Preparar clase', minutes: null };
    const { lib: next } = applyPlan({ nodes: [] }, plan, 1, (() => { let i = 0; return () => `n${i++}`; })());
    expect(next.nodes.map((x) => x.kind)).toEqual(['area', 'epic', 'feature', 'story', 'task']);
    expect(next.nodes[0].title).toBe('La Torre');
  });

  it('shows a reply as plain words, without Markdown marks', () => {
    expect(plainReply('## Bien\n**Vas bien** en `Correr`.\n- Uno\n* Dos\n\n\n\nFin')).toBe('Bien\nVas bien en Correr.\n• Uno\n• Dos\n\nFin');
  });
});
