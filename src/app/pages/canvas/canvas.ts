import { Component, DestroyRef, ElementRef, HostListener, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { isBackdropClick } from '../../core/dialog';
import { I18n } from '../../core/i18n';
import { AuthService } from '../../core/auth.service';
import { Kind, LibNode, PARENT_KIND, emptyLibrary, rebaseLibrary } from '../../core/library.model';
import { LibraryStore } from '../../core/library.store';
import { COLOR_CHOICES, DAYS } from '../../core/week.model';
import { WeekStore, WeekWrite } from '../../core/week.store';
import { CanvasMotion } from './canvas-motion';
import { CanvasNode } from './canvas-node';
import { CanvasLayout, CanvasState } from './canvas-state';

interface Drag {
  node: LibNode; x: number; y: number; currentX: number; currentY: number; source: HTMLElement;
  ghost?: HTMLElement; target?: HTMLElement; pointerId: number; handle: HTMLElement;
}
type CascadeLevel = 'epic' | 'feature' | 'story';
interface Modal { kind: Kind; node?: LibNode; parentId: string | null; }

const LAYOUT_KEY = 'go-epic-canvas-layout';
const FREE_KEY = 'go-epic-canvas-free-space';

/**
 * Floating Canvas, as in Epic Manager: Epic tabs (filtered by area) with their Features, User stories and Tasks, and
 * Free Space for what is not filed yet. Objects are dragged by their grip (or moved with the ••• dialog's cascade);
 * every change is a draft with undo/redo until Save. Saving also updates the week: renamed or recoloured tasks change
 * in every block, deleted ones leave the week.
 */
@Component({
  selector: 'app-canvas',
  imports: [CanvasNode],
  templateUrl: './canvas.html',
  styleUrl: './canvas.css',
})
export class Canvas {
  protected readonly i18n = inject(I18n);
  protected readonly libraryStore = inject(LibraryStore);
  private readonly week = inject(WeekStore);
  private readonly auth = inject(AuthService);
  /** The account the draft belongs to. */
  private owner: string | null | undefined;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly editor = viewChild<ElementRef<HTMLDialogElement>>('editor');

  readonly state = new CanvasState();
  readonly motion = new CanvasMotion();
  /** Bumped after every draft change: the template reads the mutable draft through it. */
  protected readonly version = signal(0);
  protected readonly ready = computed(() => this.libraryStore.ready() && this.week.loaded());
  protected readonly colorChoices = COLOR_CHOICES;
  protected readonly FREE = '__free';

  activeId = '';
  areaFilter = '';
  search = '';
  freeWidth = 33;
  showFree = this.readFree();
  saving = false;
  error = '';
  announcement = '';
  modal: Modal | null = null;
  title = '';
  parentId = '';
  dragState?: Drag;
  resizing = false;
  private scrollFrame = 0;

  constructor() {
    // The saved library arrives (or changes on another device): load it, unless there is an unsaved draft.
    effect(() => {
      const lib = this.libraryStore.library();
      const uid = this.auth.user()?.uid ?? null;
      untracked(() => {
        // Another account (or none): the previous account's draft never survives, dirty or not.
        if (uid !== this.owner) {
          this.owner = uid;
          this.cancelDrag();
          this.close();
          this.state.load(emptyLibrary(), {});
          this.activeId = '';
          this.bump();
        }
      });
      if (!this.libraryStore.ready()) return;
      untracked(() => {
        if (this.state.dirty || this.saving) return;
        this.state.load(lib, this.readLayout());
        this.ensureActive();
        this.bump();
      });
    });
    inject(DestroyRef).onDestroy(() => { this.cancelDrag(); this.motion.destroy(); });
  }

  // --- What the page shows ---

  get epics(): LibNode[] {
    return this.state.nodes.filter((n) => n.kind === 'epic' && (!this.areaFilter || n.parentId === this.areaFilter));
  }
  get active(): LibNode | undefined { return this.state.node(this.activeId); }
  get roots(): LibNode[] { return this.activeId ? this.state.children(this.activeId, 'feature') : []; }
  get freeRoots(): LibNode[] { return this.state.children(null).filter((n) => n.kind !== 'area' && this.matches(n)); }
  areaName(id: string | null): string { return this.state.node(id)?.title || ''; }

  private matches(node: LibNode): boolean {
    const term = this.search.trim().toLocaleLowerCase();
    return !term || node.title.toLocaleLowerCase().includes(term) || this.state.children(node.id).some((child) => this.matches(child));
  }

  private bump(): void { this.version.update((v) => v + 1); }

  // --- Save / discard / undo ---

  save(): void {
    if (this.saving || !this.state.dirty || !this.ready()) return;
    this.saving = true;
    this.error = '';
    // Rebased onto the library as it is now: changes made meanwhile (another tab's quick-add…) are kept.
    const current = this.libraryStore.library().nodes;
    const before = new Map(current.map((n) => [n.id, n]));
    const nodes = rebaseLibrary(this.state.saved, this.state.nodes, current);
    if (!this.libraryStore.ready()) {
      this.error = this.i18n.t('canvas.saveError');
      this.saving = false;
      return;
    }
    // The week days it changes go in the same batch: a refused save leaves neither side half done.
    this.libraryStore.save({ nodes }, this.syncWeek(before, new Map(nodes.map((n) => [n.id, n]))));
    this.writeLayout(this.state.layout);
    this.state.load({ nodes }, this.state.layout);
    this.saving = false;
    this.announcement = this.i18n.t('canvas.saved');
    this.bump();
  }

  /** The week follows the library: a renamed or recoloured task changes in every block, a deleted one leaves the week. */
  private syncWeek(before: Map<string, LibNode>, after: Map<string, LibNode>): WeekWrite[] {
    const writes: WeekWrite[] = [];
    for (const day of DAYS) {
      const blocks = this.week.week()[day].blocks;
      let changed = false;
      const next = blocks
        .map((block) => ({
          ...block,
          tasks: block.tasks.flatMap((task) => {
            if (!task.ref || !before.has(task.ref)) return [task];
            const node = after.get(task.ref);
            if (!node) { changed = true; return []; }
            if (node.title !== task.title || node.color !== task.color) { changed = true; return [{ ...task, title: node.title, color: node.color }]; }
            return [task];
          }),
        }))
        .filter((block) => block.tasks.length > 0);
      const write = changed ? this.week.stage(day, next) : null;
      if (write) writes.push(write);
    }
    return writes;
  }

  /** The server refused the last save (the library went back to its saved copy): the refused changes return as a draft. */
  restoreRejected(): void {
    const rejected = this.libraryStore.rejected();
    if (!rejected) return;
    this.mutate(() => {
      // Edited again after the refused save: the draft already holds those changes. Otherwise it was reloaded with
      // the rolled-back library, so the refused nodes come back. Either way the saved copy is the rolled-back one.
      if (!this.state.dirty) this.state.replace(rejected.nodes);
      this.state.rebase(this.libraryStore.library().nodes);
    });
    this.dismissRejected();
  }
  dismissRejected(): void {
    this.libraryStore.rejected.set(null);
    this.libraryStore.error.set('');
  }

  discard(): void {
    if (!this.saving && confirm(this.i18n.t('canvas.confirmDiscard'))) {
      this.mutate(() => { this.state.load(this.libraryStore.library(), this.readLayout()); this.ensureActive(); });
    }
  }
  undo(): void { this.mutate(() => { this.state.undo(); this.ensureActive(); }); }
  redo(): void { this.mutate(() => { this.state.redo(); this.ensureActive(); }); }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.state.dirty) { event.preventDefault(); event.returnValue = ''; }
  }
  /** Leaving the page with an unsaved draft asks first (route guard). */
  canLeave(): boolean { return !this.state.dirty || confirm(this.i18n.t('canvas.confirmLeave')); }

  toggleFree(): void {
    this.showFree = !this.showFree;
    try { localStorage.setItem(FREE_KEY, this.showFree ? '1' : '0'); } catch { /* a view preference */ }
  }

  selectEpic(id: string): void {
    this.activeId = id;
    const panel = this.host.nativeElement.querySelector<HTMLElement>('.epic-objects');
    if (panel && !this.motion.reduced()) this.motion.animate(panel, [{ opacity: 0.35, transform: 'translateY(7px)' }, { opacity: 1, transform: 'none' }]);
  }
  ensureActive(): void { if (!this.epics.some((n) => n.id === this.activeId)) this.activeId = this.epics[0]?.id || ''; }
  tabKey(event: KeyboardEvent, index: number): void {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? this.epics.length - 1 : (index + delta + this.epics.length) % this.epics.length;
    this.selectEpic(this.epics[next].id);
    this.host.nativeElement.querySelector<HTMLElement>(`[data-tab="${CSS.escape(this.activeId)}"]`)?.focus();
  }
  setAreaFilter(id: string): void { this.areaFilter = id; this.ensureActive(); this.bump(); }

  // --- The action dialog (create / edit / move / colour / delete) ---

  open(kind: Kind, parentId: string | null = null, node?: LibNode): void {
    this.modal = { kind, parentId, node };
    this.title = node?.title || '';
    this.parentId = node?.parentId || parentId || (kind === 'epic' ? this.areaFilter || this.state.areas[0]?.id || '' : '');
    this.fillCascade(this.parentId || null);
    queueMicrotask(() => { const d = this.editor()?.nativeElement; if (d && !d.open) d.showModal(); });
  }
  addChild(node: LibNode): void { this.open(node.kind === 'feature' ? 'story' : 'task', node.id); }
  close(): void {
    const d = this.editor()?.nativeElement;
    if (d?.open) d.close();
    this.modal = null;
  }
  onBackdrop(event: MouseEvent): void {
    const d = this.editor()?.nativeElement;
    if (d && isBackdropClick(event, d)) this.close();
  }

  /** Epics pick their area from a list; areas sit at the top. */
  get areaOptions(): LibNode[] { return this.state.areas; }

  // "Move to": a cascade of combos (Area → Epic → Feature → Story), each listing only the children of the one above.
  cascade: Record<'area' | CascadeLevel, string> = { area: '', epic: '', feature: '', story: '' };
  freeParent = '';
  get cascadeLevels(): CascadeLevel[] {
    const target = this.modal ? PARENT_KIND[this.modal.kind] : null;
    const levels: CascadeLevel[] = ['epic', 'feature', 'story'];
    return target && target !== 'area' ? levels.slice(0, levels.indexOf(target as CascadeLevel) + 1) : [];
  }
  cascadeOptions(level: CascadeLevel): LibNode[] {
    const levels = this.cascadeLevels;
    const index = levels.indexOf(level);
    const parent = index === 0 ? this.cascade.area : this.cascade[levels[index - 1]];
    return parent ? this.state.children(parent, level) : [];
  }
  get freeOptions(): { id: string; title: string }[] {
    const kind = this.modal ? PARENT_KIND[this.modal.kind] : null;
    if (!kind) return [];
    const inFree = (node: LibNode): boolean => {
      for (let n: LibNode | undefined = node, guard = 0; n && guard < 10; guard++) {
        if (n.parentId === null) return n.kind !== 'area';
        n = this.state.node(n.parentId);
      }
      return false;
    };
    return this.state.nodes.filter((n) => n.kind === kind && n.id !== this.modal?.node?.id && inFree(n)).map((n) => ({ id: n.id, title: this.freePath(n) }));
  }
  private freePath(node: LibNode): string {
    const parent = this.state.node(node.parentId);
    return parent ? `${this.freePath(parent)} / ${node.title}` : node.title;
  }
  /** Chosen an area but not yet the last level: Apply waits (an unfinished choice never means Free Space). */
  get cascadeIncomplete(): boolean {
    if (!this.modal || this.modal.kind === 'epic' || this.modal.kind === 'area' || this.cascade.area === this.FREE) return false;
    const last = this.cascadeLevels[this.cascadeLevels.length - 1];
    return !last || !this.cascade[last];
  }
  pickCascade(level: 'area' | CascadeLevel, id: string): void {
    this.cascade[level] = id;
    const levels = this.cascadeLevels;
    const from = level === 'area' ? 0 : levels.indexOf(level) + 1;
    for (const below of levels.slice(from)) this.cascade[below] = '';
    if (level === 'area') this.freeParent = '';
    for (const below of levels.slice(from)) {                    // a level with a single choice is chosen for you
      const options = this.cascadeOptions(below);
      if (options.length !== 1) break;
      this.cascade[below] = options[0].id;
    }
    this.syncCascade();
  }
  pickFree(id: string): void { this.freeParent = id; this.syncCascade(); }
  private syncCascade(): void {
    const last = this.cascadeLevels[this.cascadeLevels.length - 1];
    this.parentId = this.cascade.area === this.FREE ? this.freeParent : last ? this.cascade[last] : '';
  }
  private fillCascade(parentId: string | null): void {
    this.cascade = { area: '', epic: '', feature: '', story: '' };
    this.freeParent = '';
    if (!this.modal || this.modal.kind === 'epic' || this.modal.kind === 'area') return;
    const chain: LibNode[] = [];
    for (let id = parentId, guard = 0; id && guard < 10; guard++) {
      const node = this.state.node(id);
      if (!node) break;
      chain.unshift(node);
      id = node.parentId;
    }
    const top = chain[0];
    if (top?.kind === 'area') {
      this.cascade.area = top.id;
      for (const node of chain.slice(1)) if (node.kind === 'epic' || node.kind === 'feature' || node.kind === 'story') this.cascade[node.kind] = node.id;
    } else {
      this.cascade.area = this.FREE;
      this.freeParent = parentId || '';
    }
  }

  get canApply(): boolean {
    if (!this.modal || !this.title.trim() || this.saving || this.cascadeIncomplete) return false;
    return this.modal.kind !== 'epic' || !!this.parentId;
  }

  submit(): void {
    if (!this.modal || !this.canApply) return;
    const { node, kind } = this.modal;
    const title = this.title;
    const parentId = kind === 'area' ? null : this.parentId || null;
    if (node) {
      const source = this.nodeElement(node.id);
      const ghost = source && !this.motion.reduced() && node.parentId !== parentId ? this.motion.ghost(source) : undefined;
      this.mutate(() => this.state.group(() => {
        this.state.edit(node.id, title, kind === 'epic' ? parentId ?? undefined : undefined);
        if (kind !== 'epic' && kind !== 'area' && node.parentId !== parentId) this.state.move(node.id, parentId);
      }));
      if (ghost) void this.motion.land(ghost, this.nodeElement(node.id), this.destinationElement(parentId));
    } else {
      this.mutate(() => {
        const created = this.state.create(kind, title, parentId);
        if (created?.kind === 'epic') { this.areaFilter = ''; this.activeId = created.id; }
      });
    }
    this.announcement = this.i18n.t('canvas.draftUpdated');
    this.close();
  }

  setColor(color: string | null): void {
    const node = this.modal?.node;
    if (!node) return;
    this.mutate(() => this.state.setColor(node.id, color));
    this.modal = { ...this.modal!, node: this.state.node(node.id) };
  }
  colorOf(node: LibNode | undefined): string | null { return node ? this.state.node(node.id)?.color ?? null : null; }

  arrange(delta: number): void {
    const node = this.modal?.node;
    if (!node || node.kind === 'epic' || node.kind === 'area') return;
    const siblings = this.state.children(node.parentId);
    const index = siblings.findIndex((n) => n.id === node.id);
    const destination = index + delta;
    if (destination < 0 || destination >= siblings.length) return;
    const before = delta < 0 ? siblings[destination]?.id : siblings[destination + 1]?.id;
    this.mutate(() => this.state.move(node.id, node.parentId, before));
    this.announcement = this.i18n.t('canvas.draftUpdated');
  }

  /** A week place count for the delete question of a task. */
  private weekPlaces(id: string): number {
    return DAYS.reduce((sum, day) => sum + this.week.week()[day].blocks.reduce((n, b) => n + b.tasks.filter((t) => t.ref === id).length, 0), 0);
  }

  remove(): void {
    const node = this.modal?.node;
    if (!node || this.saving) return;
    if (!this.state.canDelete(node.id)) { alert(this.i18n.t('canvas.deleteHint')); return; }
    const places = node.kind === 'task' ? this.weekPlaces(node.id) : 0;
    const question = places ? this.i18n.t('canvas.confirmDeleteTask', { n: places }) : this.i18n.t('canvas.confirmDelete');
    if (!confirm(question)) return;
    this.mutate(() => { this.state.delete(node.id); this.ensureActive(); });
    this.close();
  }

  private mutate(action: () => void, excluded?: string): void {
    const before = this.motion.capture(this.host.nativeElement);
    action();
    this.ensureActive();
    this.bump();
    queueMicrotask(() => this.motion.layout(this.host.nativeElement, before, excluded));
  }

  // --- Drag and drop (pointer), with a floating ghost and a landing animation ---

  private nodeElement(id: string): HTMLElement | null { return this.host.nativeElement.querySelector(`[data-node="${CSS.escape(id)}"]`); }
  private destinationElement(id: string | null): HTMLElement | null {
    const visited = new Set<string>();
    while (id && !visited.has(id)) {
      visited.add(id);
      const visible = this.host.nativeElement.querySelector<HTMLElement>(`[data-tab="${CSS.escape(id)}"], [data-node="${CSS.escape(id)}"]`);
      if (visible) return visible;
      const node = this.state.node(id);
      if (node?.kind === 'epic') return this.host.nativeElement.querySelector('.epic-tabs');
      id = node?.parentId || null;
    }
    return this.host.nativeElement.querySelector('.free-space');
  }

  startDrag({ event, node }: { event: PointerEvent; node: LibNode }): void {
    if (this.saving || event.button !== 0 || this.dragState) return;
    event.preventDefault();
    event.stopPropagation();
    const source = this.nodeElement(node.id);
    const handle = event.currentTarget as HTMLElement;
    if (!source) return;
    handle.setPointerCapture(event.pointerId);
    this.dragState = { node, x: event.clientX, y: event.clientY, currentX: event.clientX, currentY: event.clientY, source, pointerId: event.pointerId, handle };
  }

  @HostListener('window:pointermove', ['$event'])
  pointerMove(event: PointerEvent): void {
    if (this.resizing) {
      const bounds = this.host.nativeElement.querySelector('.split')!.getBoundingClientRect();
      this.freeWidth = Math.max(20, Math.min(50, (100 * (bounds.right - event.clientX)) / bounds.width));
      return;
    }
    const d = this.dragState;
    if (!d || event.pointerId !== d.pointerId) return;
    d.currentX = event.clientX;
    d.currentY = event.clientY;
    if (!d.ghost && Math.hypot(event.clientX - d.x, event.clientY - d.y) < 5) return;
    if (!d.ghost) { d.ghost = this.motion.ghost(d.source); d.source.classList.add('is-carried'); this.autoScroll(); }
    d.ghost.style.transform = `translate(${event.clientX - d.x}px,${event.clientY - d.y}px)`;
    this.findTarget(event.clientX, event.clientY);
  }

  private findTarget(x: number, y: number): void {
    const d = this.dragState;
    if (!d) return;
    let el = document.elementFromPoint(x, y) as HTMLElement | null;
    let target: HTMLElement | undefined;
    while (el && this.host.nativeElement.contains(el)) {
      const kind = el.dataset['dropKind'];
      if (kind === PARENT_KIND[d.node.kind] || kind === 'FREE') { target = el; break; }
      el = el.parentElement;
    }
    d.target?.classList.remove('drop-hot');
    d.target = target;
    target?.classList.add('drop-hot');
  }

  private autoScroll(): void {
    const tick = () => {
      const d = this.dragState;
      if (!d?.ghost) return;
      const panel = document.elementFromPoint(d.currentX, d.currentY)?.closest<HTMLElement>('.scroll-panel');
      if (panel) {
        const r = panel.getBoundingClientRect();
        if (d.currentY < r.top + 55) panel.scrollTop -= 8;
        if (d.currentY > r.bottom - 55) panel.scrollTop += 8;
      }
      this.findTarget(d.currentX, d.currentY);
      this.scrollFrame = requestAnimationFrame(tick);
    };
    this.scrollFrame = requestAnimationFrame(tick);
  }

  @HostListener('window:pointerup', ['$event'])
  endDrag(event: PointerEvent): void {
    this.resizing = false;
    const d = this.dragState;
    if (!d || d.pointerId !== event.pointerId) return;
    if (!d.ghost) { this.cancelDrag(); return; }
    const target = d.target;
    const parentId = target?.dataset['dropKind'] === 'FREE' ? null : target?.dataset['parent'];
    d.source.classList.remove('is-carried');
    target?.classList.remove('drop-hot');
    if (target && parentId !== undefined && this.state.canMove(d.node.id, parentId)) {
      const same = parentId === d.node.parentId;
      const old = this.state.layout[d.node.id] || { x: 0, y: 0 };
      // Coordinates only affect this device's arrangement, never the hierarchy.
      const spatial = d.node.kind === 'feature' || parentId === null;
      let position: { x: number; y: number } | undefined;
      if (same && spatial) {
        const rect = d.source.getBoundingClientRect();
        const bounds = (target.closest('.scroll-panel') || target.querySelector('.scroll-panel') || target).getBoundingClientRect();
        position = {
          x: old.x + Math.max(bounds.left + 8 - rect.left, Math.min(bounds.right - rect.right - 8, event.clientX - d.x)),
          y: old.y + Math.max(bounds.top + 8 - rect.top, event.clientY - d.y),
        };
      }
      const before = !spatial ? this.state.children(parentId).find((n) => {
        const r = this.nodeElement(n.id)?.getBoundingClientRect();
        return n.id !== d.node.id && r && event.clientY < r.top + r.height / 2;
      })?.id : undefined;
      const ghost = d.ghost;
      const nodeId = d.node.id;
      this.mutate(() => this.state.move(nodeId, parentId, before, position), nodeId);
      queueMicrotask(() => void this.motion.land(ghost, this.nodeElement(nodeId), target));
      this.announcement = this.i18n.t('canvas.draftUpdated');
    } else {
      void this.motion.land(d.ghost, d.source, null);
    }
    this.releaseDrag();
  }

  @HostListener('window:pointercancel')
  cancelDrag(): void {
    const d = this.dragState;
    if (d) { d.source.classList.remove('is-carried'); d.target?.classList.remove('drop-hot'); d.ghost?.remove(); }
    this.resizing = false;
    this.releaseDrag();
  }

  private releaseDrag(): void {
    const d = this.dragState;
    if (d?.handle.hasPointerCapture(d.pointerId)) d.handle.releasePointerCapture(d.pointerId);
    this.dragState = undefined;
    cancelAnimationFrame(this.scrollFrame);
  }

  @HostListener('window:keydown.escape')
  escape(): void { this.cancelDrag(); }

  resizeStart(event: PointerEvent): void {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.resizing = true;
  }
  resizeKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      this.freeWidth = Math.max(20, Math.min(50, this.freeWidth + (event.key === 'ArrowLeft' ? 2 : -2)));
    }
  }

  // --- Device preferences ---

  private readFree(): boolean {
    try { return localStorage.getItem(FREE_KEY) !== '0'; } catch { return true; }
  }
  private readLayout(): CanvasLayout {
    const layout: CanvasLayout = {};
    try {
      const cached: unknown = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}');
      if (cached && typeof cached === 'object' && !Array.isArray(cached)) {
        for (const [id, p] of Object.entries(cached as Record<string, { x: number; y: number; order?: number }>)) {
          if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) layout[id] = { x: p.x, y: p.y, ...(Number.isFinite(p.order) ? { order: p.order } : {}) };
        }
      }
    } catch { /* optional */ }
    return layout;
  }
  private writeLayout(layout: CanvasLayout): void {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* the library is saved anyway */ }
  }
}
