import { Kind, LibNode, Library, PARENT_KIND, newNodeId } from '../../core/library.model';

/** Where an object sits on this device (its offset and order among siblings): a view preference, never hierarchy. */
export interface CanvasLayout { [id: string]: { x: number; y: number; order?: number }; }
interface Draft { nodes: LibNode[]; layout: CanvasLayout; }

/**
 * The Floating Canvas draft, as in Epic Manager: every change (create, rename, move, colour, delete) edits a draft with
 * undo/redo, and nothing is written until Save; Discard goes back to the saved library.
 */
export class CanvasState {
  saved: LibNode[] = [];
  nodes: LibNode[] = [];
  layout: CanvasLayout = {};
  private savedLayout: CanvasLayout = {};
  private past: Draft[] = [];
  private future: Draft[] = [];
  private dirtyState = false;
  private grouping = false;
  private indexedNodes?: LibNode[];
  private indexedLayout?: CanvasLayout;
  private childIndex = new Map<string | null, LibNode[]>();

  get dirty(): boolean { return this.dirtyState; }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  get areas(): LibNode[] { return this.nodes.filter((n) => n.kind === 'area'); }
  get library(): Library { return { nodes: this.nodes }; }

  load(lib: Library, layout: CanvasLayout = {}): void {
    this.saved = structuredClone(lib.nodes);
    this.nodes = structuredClone(lib.nodes);
    this.layout = structuredClone(layout);
    this.savedLayout = structuredClone(layout);
    this.past = [];
    this.future = [];
    this.dirtyState = false;
  }

  node(id: string | null | undefined): LibNode | undefined {
    return id ? this.nodes.find((n) => n.id === id) : undefined;
  }

  /** The children of a parent (null = the top: areas and Free Space objects), in arranged order. */
  children(parentId: string | null, kind?: Kind): LibNode[] {
    if (this.indexedNodes !== this.nodes || this.indexedLayout !== this.layout) {
      this.childIndex.clear();
      const order = new Map(this.nodes.map((node, index) => [node.id, index]));
      for (const node of this.nodes) {
        const children = this.childIndex.get(node.parentId) || [];
        children.push(node);
        this.childIndex.set(node.parentId, children);
      }
      for (const children of this.childIndex.values()) {
        children.sort((a, b) => (this.layout[a.id]?.order ?? order.get(a.id)!) - (this.layout[b.id]?.order ?? order.get(b.id)!));
      }
      this.indexedNodes = this.nodes;
      this.indexedLayout = this.layout;
    }
    const children = this.childIndex.get(parentId) || [];
    return kind ? children.filter((n) => n.kind === kind) : children;
  }

  /** Epics need an area; features, stories and tasks may also wait in Free Space (null). */
  canMove(id: string, parentId: string | null): boolean {
    const node = this.node(id);
    if (!node || node.kind === 'area') return false;
    if (parentId === null) return node.kind !== 'epic';
    return this.nodes.some((n) => n.id === parentId && n.kind === PARENT_KIND[node.kind]);
  }

  move(id: string, parentId: string | null, beforeId?: string, position?: { x: number; y: number }): boolean {
    if (!this.canMove(id, parentId)) return false;
    this.record();
    const node = this.node(id)!;
    const oldIndex = this.children(parentId).findIndex((n) => n.id === id);
    const siblings = this.children(parentId).filter((n) => n.id !== id);
    const index = node.parentId === parentId && position ? oldIndex : beforeId ? siblings.findIndex((n) => n.id === beforeId) : -1;
    siblings.splice(index < 0 ? siblings.length : index, 0, { ...node, parentId });
    this.nodes = [...this.nodes.filter((n) => n.id !== id && n.parentId !== parentId), ...siblings];
    this.layout = { ...this.layout, [id]: position || { x: 0, y: 0 } };
    siblings.forEach((n, order) => (this.layout[n.id] = { ...(this.layout[n.id] || { x: 0, y: 0 }), order }));
    this.changed();
    return true;
  }

  create(kind: Kind, title: string, parentId: string | null): LibNode | null {
    if (!title.trim()) return null;
    if (kind === 'area' ? parentId !== null
        : kind === 'epic' ? !this.nodes.some((n) => n.id === parentId && n.kind === 'area')
        : parentId !== null && !this.nodes.some((n) => n.id === parentId && n.kind === PARENT_KIND[kind])) return null;
    this.record();
    const node: LibNode = { kind, id: newNodeId(), title: title.trim(), parentId, color: null };
    this.nodes = [...this.nodes, node];
    this.changed();
    return node;
  }

  /** Renames a node; an epic may also change area. */
  edit(id: string, title: string, areaId?: string): void {
    if (!title.trim()) return;
    this.record();
    this.nodes = this.nodes.map((n) => (n.id === id ? { ...n, title: title.trim(), parentId: n.kind === 'epic' && areaId ? areaId : n.parentId } : n));
    this.changed();
  }

  setColor(id: string, color: string | null): void {
    this.record();
    this.nodes = this.nodes.map((n) => (n.id === id && n.kind === 'task' ? { ...n, color } : n));
    this.changed();
  }

  /** Only an empty container can go (as in Epic Manager); a task always (its places in the week go on Save). */
  canDelete(id: string): boolean {
    const node = this.node(id);
    return !!node && (node.kind === 'task' || !this.children(id).length);
  }

  delete(id: string): boolean {
    if (!this.canDelete(id)) return false;
    this.record();
    this.nodes = this.nodes.filter((n) => n.id !== id);
    this.changed();
    return true;
  }

  group(action: () => void): void {
    if (this.grouping) { action(); return; }
    this.record();
    this.grouping = true;
    try { action(); } finally { this.grouping = false; this.changed(); }
  }

  undo(): void { const previous = this.past.pop(); if (previous) { this.future.push(this.current()); this.restore(previous); } }
  redo(): void { const next = this.future.pop(); if (next) { this.past.push(this.current()); this.restore(next); } }
  discard(): void { this.load({ nodes: this.saved }, this.savedLayout); }
  /** After Save: the draft becomes the saved copy (undo history starts again). */
  commit(): void { this.load({ nodes: this.nodes }, this.layout); }

  private changed(): void {
    this.dirtyState = JSON.stringify(this.nodes) !== JSON.stringify(this.saved) || JSON.stringify(this.layout) !== JSON.stringify(this.savedLayout);
  }
  private current(): Draft { return structuredClone({ nodes: this.nodes, layout: this.layout }); }
  private restore(value: Draft): void { this.nodes = value.nodes; this.layout = value.layout; this.changed(); }
  private record(): void {
    if (this.grouping) return;
    this.past.push(this.current());
    if (this.past.length > 80) this.past.shift();
    this.future = [];
  }
}
