/**
 * The library: every task once, organised in five levels, Area → Epic → Feature → User story → Task.
 * Anything without a parent (except areas, the top) sits in Free Space until it is filed.
 * The Week board schedules library tasks: a week task points to one with `ref`.
 * Pure functions only, so the rules are easy to test.
 */
import { newId } from './week.model';

export const newNodeId = newId;

export const KINDS = ['area', 'epic', 'feature', 'story', 'task'] as const;
export type Kind = (typeof KINDS)[number];

/** The kind a node's parent must be (null: areas are the top level). */
export const PARENT_KIND: Record<Kind, Kind | null> = { area: null, epic: 'area', feature: 'epic', story: 'feature', task: 'story' };
/** The kind of a node's children (null: tasks have none). */
export const CHILD_KIND: Record<Kind, Kind | null> = { area: 'epic', epic: 'feature', feature: 'story', story: 'task', task: null };

export interface LibNode {
  id: string;
  kind: Kind;
  title: string;
  /** The parent's id, or null: an area, or an object waiting in Free Space. */
  parentId: string | null;
  /** Tasks only: a picked colour, null = the automatic pastel. */
  color: string | null;
}

export interface Library {
  /** In display order. */
  nodes: LibNode[];
}

export function emptyLibrary(): Library {
  return { nodes: [] };
}

export function nodeById(lib: Library, id: string | null | undefined): LibNode | undefined {
  return id ? lib.nodes.find((node) => node.id === id) : undefined;
}

/** The children of a node, in order. */
export function childrenOf(lib: Library, parentId: string): LibNode[] {
  return lib.nodes.filter((node) => node.parentId === parentId);
}

export function areas(lib: Library): LibNode[] {
  return lib.nodes.filter((node) => node.kind === 'area');
}

/** Objects in Free Space: no parent, and not an area. */
export function freeNodes(lib: Library): LibNode[] {
  return lib.nodes.filter((node) => node.parentId === null && node.kind !== 'area');
}

/** The node and its ancestors, from the top down. */
export function pathOf(lib: Library, id: string): LibNode[] {
  const path: LibNode[] = [];
  const seen = new Set<string>();
  let node = nodeById(lib, id);
  while (node && !seen.has(node.id)) {
    path.unshift(node);
    seen.add(node.id);
    node = nodeById(lib, node.parentId);
  }
  return path;
}

/** "Health › Body › Exercise › Run" — the ancestors' titles of a node, without the node itself. */
export function placeLabel(lib: Library, id: string): string {
  return pathOf(lib, id).slice(0, -1).map((node) => node.title).join(' › ');
}

export function descendants(lib: Library, id: string): LibNode[] {
  const out: LibNode[] = [];
  const walk = (parentId: string) => {
    for (const child of lib.nodes.filter((node) => node.parentId === parentId)) {
      out.push(child);
      walk(child.id);
    }
  };
  walk(id);
  return out;
}

/** The tasks under a node (all levels down), or the node itself when it is a task. */
export function tasksUnder(lib: Library, id: string): LibNode[] {
  const node = nodeById(lib, id);
  if (!node) return [];
  if (node.kind === 'task') return [node];
  return descendants(lib, id).filter((child) => child.kind === 'task');
}

/** Whether `parentId` may hold a node of this kind (null = Free Space, or the top for an area). */
export function canParent(lib: Library, kind: Kind, parentId: string | null): boolean {
  if (kind === 'area') return parentId === null;
  if (parentId === null) return true;
  return nodeById(lib, parentId)?.kind === PARENT_KIND[kind];
}

export function addNode(lib: Library, node: LibNode): Library {
  if (!canParent(lib, node.kind, node.parentId)) return lib;
  return { nodes: [...lib.nodes, node] };
}

export function updateNode(lib: Library, id: string, change: Partial<Pick<LibNode, 'title' | 'color'>>): Library {
  return { nodes: lib.nodes.map((node) => (node.id === id ? { ...node, ...change } : node)) };
}

/** Moves a node (with everything under it) to a new parent, at the end of its new siblings. */
export function moveNode(lib: Library, id: string, parentId: string | null): Library {
  const node = nodeById(lib, id);
  if (!node || !canParent(lib, node.kind, parentId) || node.parentId === parentId) return lib;
  const moved = { ...node, parentId };
  return { nodes: [...lib.nodes.filter((n) => n.id !== id), moved] };
}

/** Moves a node one place up or down among its siblings of the same kind. */
export function reorderNode(lib: Library, id: string, offset: number): Library {
  const node = nodeById(lib, id);
  if (!node) return lib;
  const siblings = lib.nodes.filter((n) => n.parentId === node.parentId && n.kind === node.kind);
  const at = siblings.findIndex((n) => n.id === id);
  const other = siblings[at + offset];
  if (!other) return lib;
  const nodes = [...lib.nodes];
  const i = nodes.findIndex((n) => n.id === id);
  const j = nodes.findIndex((n) => n.id === other.id);
  [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
  return { nodes };
}

/** A container can be deleted only when empty (like Epic Manager); a task always (its week places go with it). */
export function canRemove(lib: Library, id: string): boolean {
  const node = nodeById(lib, id);
  return !!node && (node.kind === 'task' || !lib.nodes.some((n) => n.parentId === id));
}

export function removeNode(lib: Library, id: string): Library {
  return canRemove(lib, id) ? { nodes: lib.nodes.filter((n) => n.id !== id) } : lib;
}

/** A library task with this title (case- and space-insensitive), to link a week task to instead of creating a twin. */
export function taskByTitle(lib: Library, title: string): LibNode | undefined {
  const key = title.trim().toLowerCase();
  return key ? lib.nodes.find((n) => n.kind === 'task' && n.title.trim().toLowerCase() === key) : undefined;
}

/** Every library task with the place it is filed in, sorted by place then title (for pickers). */
export function taskOptions(lib: Library): { node: LibNode; place: string }[] {
  return lib.nodes
    .filter((n) => n.kind === 'task')
    .map((node) => ({ node, place: placeLabel(lib, node.id) }))
    .sort((a, b) => (a.place || '￿').localeCompare(b.place || '￿') || a.node.title.localeCompare(b.node.title));
}

/** Firestore refuses `undefined`, and bad data is repaired on the way in and out. */
export function sanitizeLibrary(raw: unknown): Library {
  const list = (raw as { nodes?: unknown })?.nodes;
  if (!Array.isArray(list)) return emptyLibrary();
  const nodes: LibNode[] = [];
  for (const item of list) {
    const n = item as Partial<LibNode>;
    if (!n || typeof n.id !== 'string' || !KINDS.includes(n.kind as Kind)) continue;
    nodes.push({
      id: n.id,
      kind: n.kind as Kind,
      title: String(n.title ?? ''),
      parentId: typeof n.parentId === 'string' ? n.parentId : null,
      color: n.kind === 'task' && typeof n.color === 'string' && n.color ? n.color : null,
    });
  }
  // A parent that no longer exists, or of the wrong kind, sends the node to Free Space instead of hiding it.
  const lib = { nodes };
  return { nodes: nodes.map((n) => (n.parentId && !canParent(lib, n.kind, n.parentId) ? { ...n, parentId: null } : n)) };
}

/** A library task with this title (case- and space-insensitive) right under this parent (a story, or null = Free Space). */
export function twinTask(lib: Library, title: string, parentId: string | null): LibNode | undefined {
  const key = title.trim().toLowerCase();
  return key ? lib.nodes.find((n) => n.kind === 'task' && n.parentId === parentId && n.title.trim().toLowerCase() === key) : undefined;
}

/**
 * Files a week task in the library: the same-titled task of that story (or of Free Space) when there is one,
 * else a new library task there. Returns the library (unchanged when it reused one) and the task's id.
 */
export function fileTask(lib: Library, title: string, parentId: string | null, color: string | null): { lib: Library; id: string } {
  const story = parentId && nodeById(lib, parentId)?.kind === 'story' ? parentId : null;
  const twin = twinTask(lib, title, story);
  if (twin) return { lib, id: twin.id };
  const node: LibNode = { id: newNodeId(), kind: 'task', title: title.trim(), parentId: story, color };
  return { lib: addNode(lib, node), id: node.id };
}

/** The tasks of a story or any container above it (everything when `id` is empty), for the "Existing task" picker. */
export function tasksWithin(lib: Library, id: string): LibNode[] {
  return id ? tasksUnder(lib, id) : lib.nodes.filter((n) => n.kind === 'task');
}

/** Every week task that schedules a library task takes its title and colour (the library is the truth). */
export function followLibrary<T extends { title: string; color: string | null; ref: string | null }>(tasks: T[], lib: Library): T[] {
  return tasks.map((task) => {
    const node = task.ref ? nodeById(lib, task.ref) : undefined;
    return node && (node.title !== task.title || node.color !== task.color) ? { ...task, title: node.title, color: node.color } : task;
  });
}
