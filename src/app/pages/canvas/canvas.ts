import { Why } from '../../shared/why';
import { PageMenu } from '../../shared/title-fan';
import { Ask } from '../../shared/ask';
import { Component, DestroyRef, DoCheck, ElementRef, HostListener, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { closeDialog, isBackdropClick, openDialog, pressPoint } from '../../core/dialog';
import { I18n } from '../../core/i18n';
import { AuthService } from '../../core/auth.service';
import { Kind, LIFE_AREAS, LibNode, LifeArea, PARENT_KIND, emptyLibrary, followDay, lifeAreaKey, lifeAreaNodes, rebaseLibrary, undefinedTasks } from '../../core/library.model';
import { LibraryStore } from '../../core/library.store';
import { COLOR_CHOICES, DAYS, toneVar } from '../../core/week.model';
import { WeekStore, WeekWrite } from '../../core/week.store';
import { UnsavedWork } from '../../core/unsaved';
import { CaptureUi } from '../capture/capture-ui';
import { CanvasMotion } from './canvas-motion';
import { CanvasNode } from './canvas-node';
import { CanvasLayout, CanvasState } from './canvas-state';

interface Drag {
  node: LibNode; x: number; y: number; currentX: number; currentY: number; source: HTMLElement;
  ghost?: HTMLElement; target?: HTMLElement; pointerId: number; handle: HTMLElement;
}
type CascadeLevel = 'epic' | 'feature' | 'story';
/** `bare`: a new Activity born with its name only (Gianni), no place at all. */
interface Modal { kind: Kind; node?: LibNode; parentId: string | null; bare?: boolean; }

const LAYOUT_KEY = 'go-epic-canvas-layout';
/** The life area the Canvas shows (a view preference of this device). */
const AREA_KEY = 'go-epic-canvas-area';

/**
 * Floating Canvas, as in Epic Manager: Epic tabs of one of the four life areas with their Features, Stories and
 * Activities, and above them Undefined, the Activities with no place yet (Gianni). Objects are dragged by their grip (or
 * placed with the ✎ dialog's cascade, all four levels at once);
 * every change is a draft with undo/redo until Save. Saving also updates the week: renamed or recoloured tasks change
 * in every block, deleted ones leave the week.
 */
/** How long Save and leave waits for the server's answer before leaving (the write stays queued if it is slow). */
const LEAVE_SAVE_WAIT_MS = 6000;

@Component({
  selector: 'app-canvas',
  imports: [CanvasNode, Why],
  templateUrl: './canvas.html',
  styleUrl: './canvas.css',
})
export class Canvas implements DoCheck {
  protected readonly i18n = inject(I18n);
  protected readonly pageMenu = inject(PageMenu);
  /** The app's own question windows (never the browser's confirm/alert). */
  private readonly asks = inject(Ask);
  protected readonly capture = inject(CaptureUi);
  /** The edit bar (Aa / AV, Themes), opened by the action menu's Edit. */
  protected readonly lookOpen = signal(false);
  protected readonly libraryStore = inject(LibraryStore);
  private readonly week = inject(WeekStore);
  private readonly auth = inject(AuthService);
  /** The account the draft belongs to. */
  private owner: string | null | undefined;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly editor = viewChild<ElementRef<HTMLDialogElement>>('editor');
  private readonly leaveDialog = viewChild<ElementRef<HTMLDialogElement>>('leaveDialog');

  readonly state = new CanvasState();
  readonly motion = new CanvasMotion();
  /** Bumped after every draft change: the template reads the mutable draft through it. */
  protected readonly version = signal(0);
  protected readonly ready = computed(() => this.libraryStore.ready() && this.week.loaded());
  protected readonly colorChoices = COLOR_CHOICES;
  protected readonly toneVar = toneVar;
  protected readonly FREE = '__free';
  /** A level named new in the cascade (created on Apply). */
  protected readonly NEW = '__new';
  protected readonly lifeAreaKeys: LifeArea[] = LIFE_AREAS.map((a) => a.key);

  activeId = '';
  areaFilter: LifeArea = this.readArea();
  saving = false;
  error = '';
  announcement = '';
  modal: Modal | null = null;
  title = '';
  parentId = '';
  dragState?: Drag;
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
    // The action menu's Edit opens the edit bar here (Aa / AV, Themes); objects can always be moved on the Canvas.
    this.capture.menuEdit.set({ label: this.i18n.t('nav.edit'), run: () => this.lookOpen.update((v) => !v) });
    // Edit (the action menu): Aa, AV and the Themes at the bottom right, above a round ✓ Finish that takes the menu's place
    effect(() => {
      const on = this.lookOpen();
      this.capture.menuHidden.set(on);
      this.capture.lookTools.set(on ? { px: false, finish: () => this.lookOpen.set(false) } : null);
    });
    inject(DestroyRef).onDestroy(() => { this.capture.menuHidden.set(false); this.capture.lookTools.set(null); this.capture.menuEdit.set(null); this.cancelDrag(); this.motion.destroy(); this.unsaved.canvasDraft.set(false); });
  }

  // --- What the page shows ---

  /** The library's node of each life area (an area not created yet has none: it is made when something goes into it). */
  get lifeAreas(): Partial<Record<LifeArea, LibNode>> { return lifeAreaNodes(this.state.nodes); }
  get epics(): LibNode[] {
    const area = this.lifeAreas[this.areaFilter];
    return area ? this.state.children(area.id, 'epic') : [];
  }
  get active(): LibNode | undefined { return this.state.node(this.activeId); }
  get roots(): LibNode[] { return this.activeId ? this.state.children(this.activeId, 'feature') : []; }
  /** Every Activity with no whole place (Free Space, a loose Story, another area): shown in Undefined. */
  get undefinedList(): LibNode[] {
    if (this.undefinedFor !== this.state.nodes) { this.undefinedFor = this.state.nodes; this.undefinedCache = undefinedTasks(this.state.nodes); }
    return this.undefinedCache;
  }
  private undefinedFor?: LibNode[];
  private undefinedCache: LibNode[] = [];
  isUndefined(node: LibNode): boolean { return this.undefinedList.some((n) => n.id === node.id); }
  /** "El Templo - Salud" for a life area, else the area's own title. */
  areaLabel(id: string | null): string {
    const node = this.state.node(id);
    const key = node ? lifeAreaKey(node.title) : null;
    return key ? this.i18n.t('area.' + key) : node?.title || '';
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
    const ids = new Set(before.keys());
    for (const day of DAYS) {
      const next = followDay(this.week.week()[day].blocks, ids, after);
      const write = next ? this.week.stage(day, next) : null;
      if (write) writes.push(write);
    }
    return writes;
  }

  /** The server refused the last save (the library went back to its saved copy): the refused changes return as a draft. */
  restoreRejected(): void {
    const rejected = this.libraryStore.rejected();
    if (!rejected) return;
    this.mutate(() => {
      // The refused save merged into the draft (three-way, from the draft's saved copy): it covers a draft edited on
      // after the refused save (already holds it), one reloaded with the rollback, and one edited after that reload.
      // The saved copy then becomes the rolled-back library, so whatever was refused stays to be saved.
      this.state.replace(rebaseLibrary(this.state.saved, this.state.nodes, rejected.nodes));
      this.state.rebase(this.libraryStore.library().nodes);
    });
    this.dismissRejected();
  }
  dismissRejected(): void {
    this.libraryStore.rejected.set(null);
    this.libraryStore.error.set('');
  }

  async discard(): Promise<void> {
    if (this.saving) return;
    const yes = await this.asks.ask({ message: this.i18n.t('canvas.confirmDiscard'), ok: this.i18n.t('canvas.discard'), danger: true });
    if (yes && !this.saving) {
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
  /** The update prompt waits while the draft is unsaved (its reload would lose it): the draft's state, after every check. */
  private readonly unsaved = inject(UnsavedWork);
  ngDoCheck(): void {
    if (this.unsaved.canvasDraft() !== this.state.dirty) this.unsaved.canvasDraft.set(this.state.dirty);
  }

  /**
   * Leaving with an unsaved draft asks in a window of our own (Gianni: a plain "Leave anyway?" was ambiguous): it offers to
   * save first. Save and leave / Leave without saving / Keep editing; Esc or the backdrop keep editing.
   */
  canLeave(): boolean | Promise<boolean> {
    const dialog = this.leaveDialog()?.nativeElement;
    if (!this.state.dirty) return true;
    if (!dialog) return this.asks.ask({ message: this.i18n.t('canvas.leaveAsk'), ok: this.i18n.t('canvas.leaveDiscard'), danger: true });
    this.leaveAnswer?.(false);                                             // a second navigation replaces the first
    this.leaveError.set('');
    return new Promise<boolean>((resolve) => {
      this.leaveAnswer = resolve;
      openDialog(dialog, { escape: false });
    });
  }
  private leaveAnswer: ((leave: boolean) => void) | null = null;
  protected readonly leaveError = signal('');
  /** Save and leave is waiting for the server's answer. */
  protected readonly leaveSaving = signal(false);

  /**
   * The leave window's answer: save first, leave without saving, or keep editing. Saving waits (online, up to
   * LEAVE_SAVE_WAIT_MS) for the server: a refused save keeps the window open with the error, and the Canvas offers the
   * refused draft back as usual; offline, or with no answer yet, the save is queued and the page is left.
   */
  async answerLeave(choice: 'save' | 'discard' | 'stay'): Promise<void> {
    if (this.leaveSaving()) return;
    if (choice === 'save') {
      this.save();
      if (this.state.dirty) { this.leaveError.set(this.error || this.i18n.t('canvas.saveError')); return; }
      const commit = this.libraryStore.lastCommit;
      if (commit && (typeof navigator === 'undefined' || navigator.onLine)) {
        this.leaveSaving.set(true);
        const ok = await Promise.race([commit, new Promise<boolean>((r) => setTimeout(() => r(true), LEAVE_SAVE_WAIT_MS))]);
        this.leaveSaving.set(false);
        if (!ok) { this.leaveError.set(`${this.i18n.t('canvas.rejected')} ${this.libraryStore.error()}`.trim()); return; }
      }
    }
    const answer = this.leaveAnswer;
    this.leaveAnswer = null;
    void closeDialog(this.leaveDialog()?.nativeElement).then(() => answer?.(choice !== 'stay'));
  }
  onLeaveBackdrop(event: MouseEvent): void {
    const d = this.leaveDialog()?.nativeElement;
    if (d && isBackdropClick(event, d)) void this.answerLeave('stay');
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
  setAreaFilter(key: string): void {
    if (!this.lifeAreaKeys.includes(key as LifeArea)) return;
    this.areaFilter = key as LifeArea;
    try { localStorage.setItem(AREA_KEY, key); } catch { /* a view preference */ }
    this.ensureActive();
    this.bump();
  }

  // --- The action dialog (create / edit / move / colour / delete) ---

  /** The editor is shrinking away: nothing more is applied (a double click on Apply must not create twice). */
  editorClosing = false;

  open(kind: Kind, parentId: string | null = null, node?: LibNode, bare = false): void {
    this.editorClosing = false;
    this.modal = { kind, parentId, node, bare };
    this.title = node?.title || '';
    const parent = node?.parentId ?? parentId;
    this.epicArea = kind === 'epic' ? (this.keyOf(parent) || this.areaFilter) : '';
    this.fillCascade(parent);
    const from = pressPoint();                                              // read now: the dialog opens a tick later
    queueMicrotask(() => { const d = this.editor()?.nativeElement; if (d) openDialog(d, { from }); });
  }
  /** New activity (Gianni): just its name; it waits in Undefined until it gets its whole place. */
  newActivity(): void { this.open('task', null, undefined, true); }
  addChild(node: LibNode): void { this.open(node.kind === 'feature' ? 'story' : 'task', node.id); }
  close(): void {
    const d = this.editor()?.nativeElement;
    if (d?.open) {
      this.editorClosing = true;
      void closeDialog(d).then(() => (this.editorClosing = false));        // its close event clears the modal
    } else {
      this.modal = null;
    }
  }
  onBackdrop(event: MouseEvent): void {
    const d = this.editor()?.nativeElement;
    if (d && isBackdropClick(event, d)) this.close();
  }

  /** The life area an area node stands for (another area, or none: ''). */
  private keyOf(areaId: string | null): LifeArea | '' {
    const node = this.state.node(areaId);
    if (!node || node.kind !== 'area') return '';
    const key = lifeAreaKey(node.title);
    return key && this.lifeAreas[key]?.id === node.id ? key : '';
  }
  /** An Epic's area, chosen among the four. */
  epicArea: LifeArea | '' = '';

  // The place: a cascade of combos (Area → Epic → Feature → Story), each listing the children of the one above, or a new one
  // named right there (created on Apply). An Activity's area may also be Undefined.
  cascade: { area: LifeArea | '' | '__free'; epic: string; feature: string; story: string } = { area: '', epic: '', feature: '', story: '' };
  newName: Record<CascadeLevel, string> = { epic: '', feature: '', story: '' };
  get cascadeLevels(): CascadeLevel[] {
    const target = this.modal ? PARENT_KIND[this.modal.kind] : null;
    const levels: CascadeLevel[] = ['epic', 'feature', 'story'];
    return target && target !== 'area' ? levels.slice(0, levels.indexOf(target as CascadeLevel) + 1) : [];
  }
  /** The parent the level lists the children of: the area's node, or the level above (none when it is new or unset). */
  private cascadeParent(level: CascadeLevel): string {
    const levels = this.cascadeLevels;
    const index = levels.indexOf(level);
    if (index === 0) return this.cascade.area && this.cascade.area !== this.FREE ? this.lifeAreas[this.cascade.area]?.id ?? '' : '';
    const above = this.cascade[levels[index - 1]];
    return above === this.NEW ? '' : above;
  }
  cascadeOptions(level: CascadeLevel): LibNode[] {
    const parent = this.cascadeParent(level);
    return parent ? this.state.children(parent, level).filter((n) => n.id !== this.modal?.node?.id) : [];
  }
  /** Apply waits until every level is chosen or named: a place is never half given (Gianni). */
  get cascadeIncomplete(): boolean {
    const m = this.modal;
    if (!m || m.bare || m.kind === 'area') return false;
    if (m.kind === 'epic') return !this.epicArea;
    if (m.kind === 'task' && this.cascade.area === this.FREE) return false;
    if (!this.cascade.area) return true;
    return this.cascadeLevels.some((level) => !this.cascade[level] || (this.cascade[level] === this.NEW && !this.newName[level].trim()));
  }
  pickCascade(level: 'area' | CascadeLevel, id: string): void {
    const levels = this.cascadeLevels;
    if (level === 'area') this.cascade.area = id as LifeArea | '__free';
    else this.cascade[level] = id;
    const from = level === 'area' ? 0 : levels.indexOf(level) + 1;
    for (const below of levels.slice(from)) { this.cascade[below] = ''; this.newName[below] = ''; }
    if (level === 'area' && id === this.FREE) return;
    for (const below of levels.slice(from)) {
      const above = below === levels[0] ? '' : this.cascade[levels[levels.indexOf(below) - 1]];
      if (above === this.NEW) { this.cascade[below] = this.NEW; continue; }   // nothing exists under a new one yet
      const options = this.cascadeOptions(below);                             // a level with a single choice is chosen for you
      if (options.length !== 1) break;
      this.cascade[below] = options[0].id;
    }
  }
  private fillCascade(parentId: string | null): void {
    this.cascade = { area: '', epic: '', feature: '', story: '' };
    this.newName = { epic: '', feature: '', story: '' };
    const m = this.modal;
    if (!m || m.kind === 'epic' || m.kind === 'area') return;
    const chain: LibNode[] = [];
    for (let id = parentId, guard = 0; id && guard < 10; guard++) {
      const node = this.state.node(id);
      if (!node) break;
      chain.unshift(node);
      id = node.parentId;
    }
    const levels = this.cascadeLevels;
    const key = chain[0] ? this.keyOf(chain[0].id) : '';
    // Only a whole place under one of the four areas fills the cascade; anything else starts Undefined (an Activity) or empty.
    const whole = !!key && chain.length === levels.length + 1 && levels.every((level, i) => chain[i + 1].kind === level);
    if (whole) {
      this.cascade.area = key;
      levels.forEach((level, i) => (this.cascade[level] = chain[i + 1].id));
    } else if (m.kind === 'task') {
      this.cascade.area = this.FREE;
    }
  }

  get canApply(): boolean {
    return !!this.modal && !this.editorClosing && !!this.title.trim() && !this.saving && !this.cascadeIncomplete;
  }

  /** The area's node, made now (with its saved name) when the library has none yet. Inside a draft group. */
  private ensureArea(key: LifeArea): string | null {
    const found = this.lifeAreas[key];
    if (found) return found.id;
    return this.state.create('area', LIFE_AREAS.find((a) => a.key === key)!.title, null)?.id ?? null;
  }
  /** Where the dialog puts the object, creating the area and any level named new. Inside a draft group; undefined = failed. */
  private resolveParent(): string | null | undefined {
    const m = this.modal!;
    if (m.kind === 'area') return null;
    if (m.kind === 'epic') return this.epicArea ? this.ensureArea(this.epicArea) ?? undefined : undefined;
    if (m.bare || this.cascade.area === this.FREE) return null;
    if (!this.cascade.area) return undefined;
    let parent = this.ensureArea(this.cascade.area);
    for (const level of this.cascadeLevels) {
      if (!parent) return undefined;
      const value = this.cascade[level];
      parent = value === this.NEW ? this.state.create(level, this.newName[level], parent)?.id ?? null : value;
    }
    return parent ?? undefined;
  }
  /** The parent the dialog would end on, without creating anything ('new' when some level is new). */
  private plannedParent(): string | null {
    const m = this.modal!;
    if (m.kind === 'epic') return this.epicArea ? this.lifeAreas[this.epicArea]?.id ?? this.NEW : null;
    if (m.bare || this.cascade.area === this.FREE) return null;
    const levels = this.cascadeLevels;
    const last = levels.length ? this.cascade[levels[levels.length - 1]] : '';
    return !last || levels.some((l) => this.cascade[l] === this.NEW) ? this.NEW : last;
  }

  submit(): void {
    if (!this.modal || !this.canApply) return;
    const { node, kind } = this.modal;
    const title = this.title;
    const planned = this.plannedParent();
    const place = { area: this.cascade.area, epic: this.cascade.epic };
    let parentId: string | null | undefined;
    if (node) {
      const source = this.nodeElement(node.id);
      const ghost = source && !this.motion.reduced() && node.parentId !== planned ? this.motion.ghost(source) : undefined;
      this.mutate(() => this.state.group(() => {
        parentId = this.resolveParent();
        if (parentId === undefined) return;
        this.state.edit(node.id, title, kind === 'epic' ? parentId ?? undefined : undefined);
        if (kind !== 'epic' && kind !== 'area' && node.parentId !== parentId) this.state.move(node.id, parentId);
      }));
      this.followPlace(kind, place, node.id);
      if (ghost) void this.motion.land(ghost, this.nodeElement(node.id), this.destinationElement(parentId ?? null));
    } else {
      let createdId: string | undefined;
      this.mutate(() => this.state.group(() => {
        parentId = this.resolveParent();
        if (parentId === undefined) return;
        const created = this.state.create(kind, title, parentId);
        createdId = created?.id;
        if (created?.kind === 'epic') { this.areaFilter = this.epicArea || this.areaFilter; this.activeId = created.id; }
      }));
      if (kind !== 'epic' && createdId) this.followPlace(kind, place, createdId);   // its own ancestry names the Epic to show
    }
    this.announcement = this.i18n.t('canvas.draftUpdated');
    this.close();
  }

  /** Once something gets its place in another area or Epic, the Canvas shows it there (an Epic, its area). */
  private followPlace(kind: Kind, place: { area: string; epic: string }, id?: string): void {
    if (kind === 'epic' && id) {
      const key = this.keyOf(this.state.node(id)?.parentId ?? null);
      if (key) { this.setAreaFilter(key); this.activeId = id; }
      return;
    }
    if (!place.area || place.area === this.FREE || kind === 'area') return;
    const key = place.area as LifeArea;
    const epicId = place.epic === this.NEW || !place.epic ? this.pathEpic(id) : place.epic;
    if (key !== this.areaFilter) this.setAreaFilter(key);
    if (epicId && this.state.node(epicId)) this.activeId = epicId;
  }
  /** The Epic above a node (after it moved), for a place made with a new Epic. */
  private pathEpic(id?: string): string {
    for (let n = this.state.node(id), guard = 0; n && guard < 10; guard++, n = this.state.node(n.parentId)) if (n.kind === 'epic') return n.id;
    return '';
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
    if (this.editorClosing) return;
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

  async remove(): Promise<void> {
    const node = this.modal?.node;
    if (!node || this.saving || this.editorClosing) return;
    if (!this.state.canDelete(node.id)) { void this.asks.tell(this.i18n.t('canvas.deleteHint')); return; }
    const places = node.kind === 'task' ? this.weekPlaces(node.id) : 0;
    const question = places ? this.i18n.t('canvas.confirmDeleteTask', { n: places }) : this.i18n.t('canvas.confirmDelete');
    if (!(await this.asks.ask({ message: question, ok: this.i18n.t('task.delete'), danger: true }))) return;
    if (this.modal?.node !== node || this.saving || this.editorClosing || !this.state.canDelete(node.id)) return;   // the draft moved on meanwhile
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
    return this.host.nativeElement.querySelector('.undefined-box');
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
      if (kind === PARENT_KIND[d.node.kind] || (kind === 'FREE' && d.node.kind === 'task')) { target = el; break; }   // only an Activity waits in Undefined
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
      const spatial = d.node.kind === 'feature';
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

  // --- Device preferences ---

  private readArea(): LifeArea {
    let stored = '';
    try { stored = localStorage.getItem(AREA_KEY) || ''; } catch { /* optional */ }
    return LIFE_AREAS.some((a) => a.key === stored) ? (stored as LifeArea) : 'temple';
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
