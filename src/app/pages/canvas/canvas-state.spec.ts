import { LibNode } from '../../core/library.model';
import { CanvasState } from './canvas-state';

const n = (id: string, kind: LibNode['kind'], parentId: string | null): LibNode => ({ id, kind, title: id, parentId, color: null });
const fixture = () => ({
  nodes: [
    n('area', 'area', null), n('epic', 'epic', 'area'), n('other-epic', 'epic', 'area'),
    n('feature', 'feature', 'epic'), n('other-feature', 'feature', 'other-epic'),
    n('story', 'story', 'feature'), n('other-story', 'story', 'other-feature'), n('task', 'task', 'story'),
  ],
});

describe('CanvasState (Floating Canvas draft)', () => {
  let state: CanvasState;
  beforeEach(() => { state = new CanvasState(); state.load(fixture()); });

  it('creates features, stories and tasks in Free Space only in the draft', () => {
    for (const kind of ['feature', 'story', 'task'] as const) expect(state.create(kind, 'Independent', null)?.parentId).toBeNull();
    expect(state.dirty).toBe(true);
    expect(state.children(null).filter((x) => x.kind !== 'area').length).toBe(3);
    expect(state.saved.length).toBe(8);
  });

  it('needs an area for an epic, and areas sit at the top', () => {
    expect(state.create('epic', 'Epic', null)).toBeNull();
    expect(state.create('epic', 'Epic', 'feature')).toBeNull();
    expect(state.create('area', 'Fun', null)?.kind).toBe('area');
    expect(state.create('area', 'Fun', 'area')).toBeNull();
    expect(state.create('task', '   ', null)).toBeNull();
  });

  it('moves a task in and out of stories, keeping its siblings and ancestors', () => {
    const free = state.create('task', 'New', null)!;
    expect(state.move(free.id, 'story')).toBe(true);
    expect(state.move('task', 'other-story')).toBe(true);
    expect(state.children('story').map((x) => x.id)).toEqual([free.id]);
    state.move('task', null);
    expect(state.children(null).some((x) => x.id === 'task')).toBe(true);
    expect(state.node('story')?.parentId).toBe('feature');
  });

  it('moves containers with their whole subtree', () => {
    state.move('story', 'other-feature');
    expect(state.children('story')[0].id).toBe('task');
    state.move('other-feature', null);
    expect(state.children('other-feature').map((x) => x.id)).toContain('story');
  });

  it('rejects wrong parents, Epics in Free Space and moving areas', () => {
    expect(state.move('feature', 'story')).toBe(false);
    expect(state.move('task', 'feature')).toBe(false);
    expect(state.move('story', 'story')).toBe(false);
    expect(state.move('task', 'missing')).toBe(false);
    expect(state.move('epic', null)).toBe(false);
    expect(state.move('area', null)).toBe(false);
    expect(state.dirty).toBe(false);
  });

  it('restores relationships and positions with undo, redo and discard', () => {
    state.move('feature', 'other-epic');
    state.move('feature', 'other-epic', undefined, { x: 24, y: 15 });
    state.undo();
    expect(state.layout['feature']).toEqual(expect.objectContaining({ x: 0, y: 0 }));
    state.undo();
    expect(state.dirty).toBe(false);
    state.redo();
    expect(state.children('other-epic').length).toBe(2);
    state.discard();
    expect(state.dirty).toBe(false);
    expect(state.canRedo).toBe(false);
  });

  it('deletes only empty containers, and tasks always', () => {
    expect(state.delete('epic')).toBe(false);
    expect(state.delete('task')).toBe(true);
    expect(state.delete('story')).toBe(true);
    expect(state.delete('feature')).toBe(true);
    expect(state.delete('epic')).toBe(true);
    expect(state.delete('area')).toBe(false);                                // other-epic is still inside
  });

  it('keeps the arranged order after the saved copy arrives in another order', () => {
    const a = state.create('task', 'A', 'story')!;
    const b = state.create('task', 'B', 'story')!;
    state.move(b.id, 'story', a.id);
    const expected = state.children('story').map((x) => x.id);
    state.load({ nodes: [...state.nodes].sort((x, y) => x.id.localeCompare(y.id)) }, state.layout);
    expect(state.children('story').map((x) => x.id)).toEqual(expected);
  });

  it('commits: the draft becomes the saved copy', () => {
    state.edit('task', 'Run');
    state.setColor('task', '#ffc9d6');
    state.commit();
    expect(state.dirty).toBe(false);
    expect(state.saved.find((x) => x.id === 'task')).toEqual(expect.objectContaining({ title: 'Run', color: '#ffc9d6' }));
  });

  it('puts refused nodes back as an undoable draft', () => {
    const refused = [...state.nodes, n('extra', 'task', null)];
    state.replace(refused);
    expect(state.dirty).toBe(true);
    expect(state.node('extra')).toBeTruthy();
    state.undo();
    expect(state.node('extra')).toBeUndefined();
  });

  it('stays dirty when the saved copy is rolled back under the draft', () => {
    const rolledBack = structuredClone(state.saved);
    state.create('task', 'Refused', null);
    state.commit();                                                        // the save that the server will refuse
    state.edit('task', 'Edited again');
    state.rebase(rolledBack);
    expect(state.dirty).toBe(true);
    expect(state.nodes.some((x) => x.title === 'Refused')).toBe(true);
    state.rebase(state.nodes);
    expect(state.dirty).toBe(false);
  });
});
