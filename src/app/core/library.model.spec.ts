import {
  LibNode, Library, canParent, fileTask, followLibrary, placeLabel, rebaseLibrary, sanitizeLibrary, tasksWithin, twinTask,
} from './library.model';

const n = (id: string, kind: LibNode['kind'], parentId: string | null, title = id): LibNode => ({ id, kind, title, parentId, color: null });
const lib = (): Library => ({
  nodes: [
    n('a', 'area', null, 'Health'), n('e', 'epic', 'a', 'Temple'), n('f', 'feature', 'e', 'Body'),
    n('s', 'story', 'f', 'Exercise'), n('t', 'task', 's', 'Run'), n('free', 'task', null, 'Read'),
  ],
});

describe('library model', () => {
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
});
