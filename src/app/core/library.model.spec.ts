import {
  LibNode, Library, STARTER_TEMPLATE, paperAge, canParent, planTemplateChanges, followDay, inboxTasks, planTemplate, storyOptions, fileTask, followLibrary, placeLabel, rebaseLibrary, sanitizeLibrary, tasksWithin, twinTask,
  emptyWhere, pickWhere, whereOf, whereOptions,
} from './library.model';

const n = (id: string, kind: LibNode['kind'], parentId: string | null, title = id): LibNode => ({ id, kind, title, parentId, color: null });
const lib = (): Library => ({
  nodes: [
    n('a', 'area', null, 'Health'), n('e', 'epic', 'a', 'Temple'), n('f', 'feature', 'e', 'Body'),
    n('s', 'story', 'f', 'Exercise'), n('t', 'task', 's', 'Run'), n('free', 'task', null, 'Read'),
  ],
});

describe('library model', () => {
  it('lists the choices of each Where level under the level above', () => {
    const w = { ...emptyWhere(), area: 'a' };
    expect(whereOptions(lib(), emptyWhere(), 'area').map((x) => x.id)).toEqual(['a']);
    expect(whereOptions(lib(), emptyWhere(), 'epic')).toEqual([]);                // no area yet
    expect(whereOptions(lib(), w, 'epic').map((x) => x.id)).toEqual(['e']);
  });

  it('picks a Where level: the levels below empty, single choices fill in', () => {
    expect(pickWhere(lib(), emptyWhere(), 'area', 'a')).toEqual({ area: 'a', epic: 'e', feature: 'f', story: 's' });
    expect(pickWhere(lib(), { area: 'a', epic: 'e', feature: 'f', story: 's' }, 'area', '')).toEqual(emptyWhere());
    const two: Library = { nodes: [...lib().nodes, n('s2', 'story', 'f', 'Rest')] };
    expect(pickWhere(two, emptyWhere(), 'area', 'a')).toEqual({ area: 'a', epic: 'e', feature: 'f', story: '' });
  });

  it('reads the Where of a task from its path (Free Space has none)', () => {
    expect(whereOf(lib(), 't')).toEqual({ area: 'a', epic: 'e', feature: 'f', story: 's' });
    expect(whereOf(lib(), 'free')).toEqual(emptyWhere());
  });

  it('checks parents level by level', () => {
    expect(canParent(lib(), 'area', null)).toBe(true);
    expect(canParent(lib(), 'epic', null)).toBe(false);
    expect(canParent(lib(), 'task', 's')).toBe(true);
    expect(canParent(lib(), 'task', 'f')).toBe(false);
    expect(canParent(lib(), 'story', null)).toBe(true);
  });

  it('names a place by its ancestors', () => {
    expect(placeLabel(lib(), 't')).toBe('Health › Temple › Body › Exercise');
  });

  it('files a week task: reuses the same title in the same story, else creates it there', () => {
    expect(fileTask(lib(), ' run ', 's', null).id).toBe('t');
    const created = fileTask(lib(), 'Run', null, '#ffc9d6');                // Free Space has no "Run"
    expect(created.id).not.toBe('t');
    expect(created.lib.nodes.find((x) => x.id === created.id)).toEqual(expect.objectContaining({ parentId: null, color: '#ffc9d6', kind: 'task' }));
    expect(fileTask(lib(), 'Read', null, null).id).toBe('free');
    expect(fileTask(lib(), 'Swim', 'f', null).lib.nodes.at(-1)?.parentId).toBeNull();   // a feature is no story: Free Space
    expect(twinTask(lib(), 'read', 's')).toBeUndefined();
  });

  it('lists the tasks under a level, or all of them', () => {
    expect(tasksWithin(lib(), 'a').map((x) => x.id)).toEqual(['t']);
    expect(tasksWithin(lib(), '').map((x) => x.id)).toEqual(['t', 'free']);
  });

  it('week tasks follow their library task', () => {
    const library = { nodes: lib().nodes.map((x) => (x.id === 't' ? { ...x, title: 'Run 5 km', color: '#cde4ff' } : x)) };
    const tasks = [{ title: 'Run', color: null, ref: 't' }, { title: 'Other', color: null, ref: null }];
    const next = followLibrary(tasks, library);
    expect(next[0]).toEqual({ title: 'Run 5 km', color: '#cde4ff', ref: 't' });
    expect(next[1]).toBe(tasks[1]);
  });

  it('repairs bad data: unknown kinds go, orphans wait in Free Space', () => {
    const clean = sanitizeLibrary({ nodes: [n('s', 'story', 'gone'), { id: 'x', kind: 'planet' }, { ...n('t', 'task', 's'), color: undefined }] });
    expect(clean.nodes.map((x) => [x.id, x.parentId, x.color])).toEqual([['s', null, null], ['t', 's', null]]);
    expect(sanitizeLibrary(undefined).nodes).toEqual([]);
  });

  it('rebases a draft onto changes made meanwhile elsewhere', () => {
    const base = lib().nodes;
    const mine = [...base.filter((x) => x.id !== 'free').map((x) => (x.id === 't' ? { ...x, title: 'Run 5 km' } : x)), n('mine', 'task', null)];
    const theirs = [...base.map((x) => (x.id === 's' ? { ...x, title: 'Sport' } : x)), n('quick', 'task', 's', 'Stretch')];
    const merged = rebaseLibrary(base, mine, theirs);
    const byId = new Map(merged.map((x) => [x.id, x]));
    expect(byId.get('t')?.title).toBe('Run 5 km');                       // my edit
    expect(byId.get('s')?.title).toBe('Sport');                          // their edit, untouched in the draft
    expect(byId.has('quick')).toBe(true);                                // their new task (another tab's quick-add)
    expect(byId.has('mine')).toBe(true);                                 // my new task
    expect(byId.has('free')).toBe(false);                                // my delete
    expect(rebaseLibrary(base, base, base.filter((x) => x.id !== 'free')).some((x) => x.id === 'free')).toBe(false);   // their delete
  });

  it('keeps a container the draft deleted when something was filed in it elsewhere', () => {
    const base = [n('a', 'area', null), n('b', 'area', null)];
    const mine = [n('b', 'area', null)];                                  // the draft deletes the empty area "a"
    const theirs = [...base, n('e', 'epic', 'a')];                        // another tab adds an epic to it
    const merged = rebaseLibrary(base, mine, theirs);
    expect(merged.find((x) => x.id === 'e')?.parentId).toBe('a');
    expect(merged.some((x) => x.id === 'a')).toBe(true);
    expect(rebaseLibrary(base, mine, base).some((x) => x.id === 'a')).toBe(false);   // still empty: deleted
  });

  it('keeps a container deleted elsewhere when the draft filed something in it', () => {
    const base = [n('a', 'area', null)];
    const mine = [...base, n('e', 'epic', 'a')];                          // the draft adds an epic to area "a"
    const merged = rebaseLibrary(base, mine, []);                         // another tab deleted "a" (empty then)
    expect(merged.find((x) => x.id === 'e')?.parentId).toBe('a');
    expect(merged.some((x) => x.id === 'a')).toBe(true);
  });

  it('merges a refused save into a draft edited after the rollback', () => {
    const rolledBack = lib().nodes;                                       // the library after the server's rollback
    const refused = rolledBack.map((x) => (x.id === 't' ? { ...x, title: 'Run 5 km' } : x));
    const draft = rolledBack.map((x) => (x.id === 'free' ? { ...x, title: 'Read a book' } : x));
    const merged = rebaseLibrary(rolledBack, draft, refused);
    expect(merged.find((x) => x.id === 't')?.title).toBe('Run 5 km');       // the refused rename comes back
    expect(merged.find((x) => x.id === 'free')?.title).toBe('Read a book'); // and the later edit stays
    expect(rebaseLibrary(refused, refused, refused)).toEqual(refused);      // a draft that still holds it: unchanged
  });

  it('plans the starter template once, reusing what already exists', () => {
    let i = 0;
    const id = () => `n${i++}`;
    const all = planTemplate([], STARTER_TEMPLATE, id);
    expect(all.filter((x) => x.kind === 'area').length).toBe(4);
    expect(all.filter((x) => x.kind === 'epic').length).toBe(8);
    expect(all.filter((x) => x.kind === 'feature').length).toBe(13);
    expect(all.filter((x) => x.kind === 'story').length).toBe(13);
    expect(all.filter((x) => x.kind === 'task').length).toBe(13);
    expect(sanitizeLibrary({ nodes: all }).nodes).toEqual(all);              // every parent is of the right kind
    expect(planTemplate(all, STARTER_TEMPLATE, id)).toEqual([]);             // twice: nothing more
    const mine = [n('t', 'area', null, ' el templo ')];                      // an area made by hand, other spacing/case
    const plan = planTemplate(mine, STARTER_TEMPLATE, id);
    expect(plan.some((x) => x.kind === 'area' && x.title === 'El Templo')).toBe(false);
    expect(plan.filter((x) => x.parentId === 't').map((x) => x.title)).toEqual(['Soy fuerte y saludable', 'Camino con Dios', 'Administro con sabiduría']);
  });

  it('Capture: the inbox is Free Space tasks, newest first; stories are offered by their place', () => {
    const library: Library = { nodes: [...lib().nodes, n('new', 'task', null, 'Call mom'), n('box', 'story', null, 'Loose story')] };
    expect(inboxTasks(library).map((x) => x.id)).toEqual(['new', 'free']);
    expect(storyOptions(library).map((x) => x.place)).toEqual(['Health › Temple › Body › Exercise', 'Loose story']);
  });

  it('the week follows a library change: renamed cards change, deleted ones leave with an emptied block', () => {
    const card = (id: string, ref: string | null, title = id) => ({ id, title, minutes: 5, color: null, active: true, ref });
    const blocks = [
      { id: 'b1', name: 'B1', start: null, end: null, tasks: [card('c1', 't', 'Run'), card('c2', null)] },
      { id: 'b2', name: 'B2', start: null, end: null, tasks: [card('c3', 'free', 'Read')] },
    ];
    const after = new Map([['t', { ...n('t', 'task', 's'), title: 'Run 5 km' }]]);
    const next = followDay(blocks, new Set(['t', 'free']), after)!;
    expect(next.map((b) => b.id)).toEqual(['b1']);
    expect(next[0].tasks.map((t) => t.title)).toEqual(['Run 5 km', 'c2']);
    expect(followDay(blocks, new Set(), after)).toBeNull();                  // unknown before: untouched
  });

  it('renames Epics, Features and Stories of an earlier template instead of duplicating them (and keeps their Activities)', () => {
    let i = 0;
    const id = () => `o${i++}`;
    // The library as the first template left it: the same tree, Epics, Features and Stories under their old names.
    const oldTemplate = STARTER_TEMPLATE.map((a) => ({ ...a, epics: a.epics.map((e) => ({ ...e, title: e.was[0], features: e.features.map((f) => ({ ...f, title: f.was[0], story: f.storyWas[0] })) })) }));
    const before = planTemplate([], oldTemplate, id);
    const { renames, add } = planTemplateChanges(before, STARTER_TEMPLATE, id);
    expect(renames.filter((r) => r.kind === 'epic').length).toBe(8);
    expect(renames.filter((r) => r.kind === 'feature').length).toBe(13);
    expect(renames.filter((r) => r.kind === 'story').length).toBe(13);
    expect(renames.find((r) => r.from === 'Revisar gastos')?.title).toBe('Como alguien que administra con sabiduría, quiero revisar mis gastos cada domingo, para saber a dónde va mi dinero');
    expect(renames.find((r) => r.from === 'Presupuesto y ahorro')?.title).toBe('Manejo un presupuesto y tengo ahorros');
    expect(renames.find((r) => r.from === 'Finanzas Sanas')?.title).toBe('Administro con sabiduría');
    expect(add).toEqual([]);                                                // Activities are found under the renamed Stories
    const after = before.map((x) => { const r = renames.find((y) => y.id === x.id); return r ? { ...x, title: r.title } : x; });
    expect(planTemplateChanges(after, STARTER_TEMPLATE, id)).toEqual({ renames: [], add: [] });
  });

  it('paper ages: fresh, parchment from 5 days, old stained paper from 21; none without a creation time', () => {
    const day = 86_400_000, now = 100 * day;
    expect(paperAge({ created: now }, now)).toBe(0);
    expect(paperAge({ created: now - 4.9 * day }, now)).toBe(0);
    expect(paperAge({ created: now - 5 * day }, now)).toBe(1);
    expect(paperAge({ created: now - 20.9 * day }, now)).toBe(1);
    expect(paperAge({ created: now - 21 * day }, now)).toBe(2);
    expect(paperAge({ created: now + day }, now)).toBe(0);               // a clock ahead never goes negative
    expect(paperAge({}, now)).toBeNull();
    expect(paperAge(undefined, now)).toBeNull();
  });

  it('keeps a task\'s creation time and never writes undefined', () => {
    const lib = sanitizeLibrary({ nodes: [
      { id: 't', kind: 'task', title: 'Call', parentId: null, color: null, created: 123 },
      { id: 'u', kind: 'task', title: 'Old', parentId: null, color: null },
      { id: 'a', kind: 'area', title: 'A', parentId: null, color: null, created: 5 },
    ] });
    expect(lib.nodes[0].created).toBe(123);
    expect('created' in lib.nodes[1]).toBe(false);
    expect('created' in lib.nodes[2]).toBe(false);                       // only tasks age
  });
});
