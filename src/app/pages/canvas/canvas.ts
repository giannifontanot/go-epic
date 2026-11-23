import { Why } from '../../shared/why';
import { ThemeService } from '../../core/theme';
import { PageMenu } from '../../shared/title-fan';
import { Ask } from '../../shared/ask';
import { Component, DestroyRef, DoCheck, ElementRef, HostListener, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { closeDialog, isBackdropClick, openDialog, pressPoint } from '../../core/dialog';
import { I18n } from '../../core/i18n';
import { AuthService } from '../../core/auth.service';
import { Kind, LIFE_AREAS, LibNode, LifeArea, PARENT_KIND, emptyLibrary, followDay, lifeAreaKey, lifeAreaNodes, rebaseLibrary, undefinedTasks } from '../../core/library.model';
import { LibraryStore } from '../../core/library.store';
import { DAYS, Task, blockColors, toneVar } from '../../core/week.model';
import { WeekStore, WeekWrite } from '../../core/week.store';
import { UnsavedWork } from '../../core/unsaved';
import { CaptureUi } from '../capture/capture-ui';
import { CanvasMotion } from './canvas-motion';
import { CanvasNode } from './canvas-node';
import { CanvasLayout, CanvasState } from './canvas-state';
import { PlaceCard, PlaceLevel, PlaceOption, PlacePick } from './place-card';
import { PickItem, PickMenu } from './pick-menu';

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
/** What the area tabs show: one life area, or «Todas» (every area's Epics). */
type AreaView = LifeArea | 'all';

/**
 * Floating Canvas, as in Epic Manager: Epic tabs of one of the four life areas with their Features, Stories and
 * Activities; the Activities with no place yet wait in the Undefined window (Gianni). Objects are dragged by their grip; an
 * Activity's ✎ grows its own card in place, editable (name, Delete, and its place on the Canvas's own card: each level «Por
 * definir» until it is chosen in a floating menu, saved once all four are chosen), and Features, Stories and Epics keep
 * their window. Every change saves by itself (Gianni: no Undo, Redo, Save
 * or Discard), and the week follows: renamed or recoloured tasks change in every block, deleted ones leave the week.
 */

/** The Epic tabs' content: it closes, then the next one opens (ms). */
const PANE_CLOSE_MS = 180;
const PANE_OPEN_MS = 320;

@Component({
  selector: 'app-canvas',
  imports: [CanvasNode, Why, PlaceCard, PickMenu],
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
  private readonly injector = inject(Injector);
  private readonly themes = inject(ThemeService);
  private readonly editor = viewChild<ElementRef<HTMLDialogElement>>('editor');
  private readonly undefinedWindow = viewChild<ElementRef<HTMLDialogElement>>('undefinedWindow');

  readonly state = new CanvasState();
  readonly motion = new CanvasMotion();
  /** Bumped after every draft change: the template reads the mutable draft through it. */
  protected readonly version = signal(0);
  protected readonly ready = computed(() => this.libraryStore.ready() && this.week.loaded());
  /** A level named new in the cascade (created on Apply). */
  protected readonly NEW = '__new';
  protected readonly lifeAreaKeys: LifeArea[] = LIFE_AREAS.map((a) => a.key);
  /** The areas' menu: «Todas» first (Gianni: to see every Epic at once), then the four life areas. */
  protected readonly areaViews: AreaView[] = ['all', ...this.lifeAreaKeys];

  activeId = '';
  areaFilter: AreaView = this.readArea();
  saving = false;
  error = '';
  announcement = '';
  modal: Modal | null = null;
  title = '';
  /** The window's name box is open in its card (a tap on the name; a new one starts open). */
  nameOpen = false;
  private readonly modalNameBox = viewChild<ElementRef<HTMLInputElement>>('modalNameBox');
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
          this.endEdit();
          this.state.load(emptyLibrary(), {});
          this.activeId = '';
          this.pendingId = '';
          this.pendingArea = '';
          this.areaSwap++;
          this.swap++;   // a switch still closing belongs to the other account
          this.pane()?.getAnimations().forEach((a) => a.cancel());
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
    // The first Epic opens softly too, once the Canvas is drawn
    effect(() => { if (this.ready()) untracked(() => this.openPane()); });
    // The action menu's Edit opens the edit bar here (Aa / AV, Themes); objects can always be moved on the Canvas.
    this.capture.menuEdit.set({ label: this.i18n.t('nav.edit'), run: () => this.lookOpen.update((v) => !v) });
    // Edit (the action menu): Aa, AV and the Themes at the bottom right, above a round ✓ Finish that takes the menu's place
    effect(() => {
      const on = this.lookOpen();
      this.capture.menuHidden.set(on);
      this.capture.lookTools.set(on ? { px: false, finish: () => this.lookOpen.set(false) } : null);
    });
    // The Canvas and its windows always wear the original Epic look, whatever theme is chosen (Gianni)
    this.themes.hold('epic');
    inject(DestroyRef).onDestroy(() => { this.themes.hold(null); this.capture.menuHidden.set(false); this.capture.lookTools.set(null); this.capture.menuEdit.set(null); this.cancelDrag(); this.motion.destroy(); this.unsaved.canvasDraft.set(false); });
  }

  // --- What the page shows ---

  /** The library's node of each life area (an area not created yet has none: it is made when something goes into it). */
  get lifeAreas(): Partial<Record<LifeArea, LibNode>> { return lifeAreaNodes(this.state.nodes); }
  get epics(): LibNode[] {
    const keys = this.areaFilter === 'all' ? this.lifeAreaKeys : [this.areaFilter];
    return keys.flatMap((key) => {
      const area = this.lifeAreas[key];
      return area ? this.state.children(area.id, 'epic') : [];
    });
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
  /** "El Templo - Salud" for a life area, else the area's own title. */
  areaLabel(id: string | null): string {
    const node = this.state.node(id);
    const key = node ? lifeAreaKey(node.title) : null;
    return key ? this.i18n.t('area.' + key) : node?.title || '';
  }
  /** A life area's name and its description apart («El Castillo» and «Familia»; Gianni: the description a shade softer). */
  areaName(key: string): string { return this.areaParts(key)[0]; }
  areaDesc(key: string): string { return this.areaParts(key)[1]; }
  private areaParts(key: string): [string, string] {
    const text = this.i18n.t('area.' + key);
    const cut = text.indexOf(' - ');
    return cut < 0 ? [text, ''] : [text.slice(0, cut), text.slice(cut + 3)];
  }

  /** A row's colour in the Undefined window: its own, else the automatic pastel, never like the row above. */
  undefinedTone(index: number): string | null {
    if (this.tonesFor !== this.undefinedList) { this.tonesFor = this.undefinedList; this.tones = blockColors(this.undefinedList as unknown as Task[]).map(toneVar); }
    return this.tones[index];
  }
  private tonesFor?: LibNode[];
  private tones: (string | null)[] = [];

  private bump(): void { this.version.update((v) => v + 1); }

  // --- The Undefined window ---

  openUndefined(): void {
    const d = this.undefinedWindow()?.nativeElement;
    if (d && !d.open) openDialog(d);
  }
  closeUndefined(): void { void closeDialog(this.undefinedWindow()?.nativeElement); }
  /** The window is gone: a card open in it closes with it (its name kept). */
  undefinedClosed(): void {
    if (this.editId && !this.nodeElement(this.editId)?.closest('.epic-pane')) { this.commitTitle(); this.endEdit(); }
  }
  onUndefinedBackdrop(event: MouseEvent): void {
    const d = this.undefinedWindow()?.nativeElement;
    if (d && isBackdropClick(event, d)) this.closeUndefined();
  }

  // --- Saving: every change saves at once ---

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

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.state.dirty) { event.preventDefault(); event.returnValue = ''; }
  }
  /** The update prompt waits while a change is not saved yet (a save refused before the library loaded). */
  private readonly unsaved = inject(UnsavedWork);
  ngDoCheck(): void {
    const edited = this.editNode;
    if (this.editId && !edited) this.endEdit();                            // deleted meanwhile (here or on another device)
    const dirty = this.state.dirty || (!!edited && this.editTitle.trim() !== '' && this.editTitle !== edited.title);
    if (this.unsaved.canvasDraft() !== dirty) this.unsaved.canvasDraft.set(dirty);
  }

  /** The tab being opened while the old Epic's content is still closing (the tab answers at once). */
  pendingId = '';
  get openTab(): string { return this.pendingId || this.activeId; }
  private swap = 0;
  /** Switching Epic (Gianni): the open one's content closes softly, then the other's opens softly; the last tap wins. */
  selectEpic(id: string): void {
    if (id === this.openTab) return;
    const token = ++this.swap;
    const pane = this.pane();
    if (!pane || this.motion.reduced() || !this.activeId) { this.pendingId = ''; this.activeId = id; this.toTop(); this.bump(); this.openPane(); return; }
    this.pendingId = id;
    this.bump();
    const from = getComputedStyle(pane).opacity;
    pane.getAnimations().forEach((a) => a.cancel());
    const out = pane.animate([{ opacity: from, transform: 'none' }, { opacity: 0, transform: 'translateY(6px)' }],
      { duration: PANE_CLOSE_MS, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    const show = () => {
      if (token !== this.swap) return;
      this.pendingId = '';
      this.activeId = id;
      this.toTop();
      this.bump();
      this.openPane();
    };
    out.finished.then(show, show);
  }
  /** The Epic's content opens softly: it rises a little and fades in, once the new content is drawn. */
  private openPane(): void {
    if (this.motion.reduced()) return;
    const token = this.swap;
    afterNextRender(() => {
      const pane = this.pane();
      if (!pane || token !== this.swap) return;
      const held = pane.getAnimations();
      pane.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
        { duration: PANE_OPEN_MS, easing: 'cubic-bezier(0,0,.2,1)' });
      held.forEach((a) => a.cancel());   // after the new one starts, so no frame shows it uncovered
    }, { injector: this.injector });
  }
  private pane(): HTMLElement | null { return this.host.nativeElement.querySelector<HTMLElement>('.epic-pane'); }
  /** Only the Epic's content scrolls (Gianni: ÁREA and EPIC stay still above it), so another Epic opens at its top. */
  private toTop(): void { const pane = this.pane(); if (pane) pane.scrollTop = 0; }
  ensureActive(): void { if (!this.epics.some((n) => n.id === this.activeId)) this.activeId = this.epics[0]?.id || ''; }
  /** Shows an area's Epics at once (an Epic created or placed elsewhere, or the end of a soft switch). */
  setAreaFilter(key: string, softly = false): void {
    if (!this.areaViews.includes(key as AreaView)) return;
    if (!softly) { this.areaSwap++; this.pendingArea = ''; }                // a soft area switch still closing gives way
    this.areaFilter = key as AreaView;
    try { localStorage.setItem(AREA_KEY, key); } catch { /* a view preference */ }
    const before = this.activeId;
    const wasSwapping = !!this.pendingId;
    this.swap++;   // a switch still closing gives way to the new area
    this.pendingId = '';
    this.ensureActive();
    this.bump();
    if (softly || this.activeId !== before || wasSwapping) this.openPane();
  }

  // --- The Área and Epic menus (Gianni: floating menus like the pages', not tabs) ---

  /** The area being opened while the old Epic's content is still closing (the button answers at once). */
  pendingArea: AreaView | '' = '';
  get areaTab(): AreaView { return this.pendingArea || this.areaFilter; }
  private areaSwap = 0;
  get areaItems(): PickItem[] { return this.areaViews.map((id) => ({ id, label: this.areaName(id), desc: this.areaDesc(id) })); }
  get epicItems(): PickItem[] { return this.epics.map((e) => ({ id: e.id, label: e.title })); }
  /** The Epic the Epic button shows: the one opening, else the open one. */
  get openEpic(): LibNode | undefined { return this.state.node(this.openTab); }
  /** Switching area: the open Epic's content closes softly, then the new area's first Epic opens softly; the last pick wins. */
  selectArea(key: AreaView): void {
    if (key === this.areaTab) return;
    const pane = this.pane();
    if (!pane || this.motion.reduced()) { this.toTop(); this.setAreaFilter(key); return; }
    const token = ++this.areaSwap;
    this.swap++;
    this.pendingArea = key;
    this.pendingId = '';
    this.bump();
    const from = getComputedStyle(pane).opacity;
    pane.getAnimations().forEach((a) => a.cancel());
    const out = pane.animate([{ opacity: from, transform: 'none' }, { opacity: 0, transform: 'translateY(6px)' }],
      { duration: PANE_CLOSE_MS, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    const show = () => {
      if (token !== this.areaSwap) return;
      this.pendingArea = '';
      this.toTop();
      this.setAreaFilter(key, true);
    };
    out.finished.then(show, show);
  }

  // --- The action dialog (create / edit / move / colour / delete) ---

  // --- An Activity's own card, grown in place and editable (Gianni: not a window) ---

  /** The Activity whose card is open ('' = none) and its name as typed. */
  editId = '';
  editTitle = '';
  /** Bumped on every open or close, so a card still shrinking never closes the next one. */
  private editToken = 0;
  get editNode(): LibNode | undefined { return this.editId ? this.state.node(this.editId) : undefined; }
  /** What the cascade, Move and Delete work on: the window's object, else the open card's Activity. */
  private get subject(): Modal | null {
    if (this.modal) return this.modal;
    const node = this.editNode;
    return node ? { kind: node.kind, node, parentId: node.parentId } : null;
  }

  /** ✎ on a card: an Activity grows in place; a Feature or Story still opens its window. ✓ (the same button) closes it. */
  act(node: LibNode): void {
    if (node.kind !== 'task') { this.open(node.kind, node.parentId, node); return; }
    if (this.editId === node.id) { void this.finishEdit(); return; }
    this.startEdit(node);
  }
  startEdit(node: LibNode): void {
    if (this.saving) return;
    if (this.editId) { this.commitTitle(); this.endEdit(); }               // one card at a time
    const token = ++this.editToken;
    this.editId = node.id;
    this.editTitle = node.title;
    this.fillCascade(node.parentId);
    this.bump();
    afterNextRender(() => {
      const card = this.editElement();
      const body = card?.querySelector<HTMLElement>('.card-edit');
      if (!card || !body || token !== this.editToken) return;
      if (!this.motion.reduced()) {
        // It grows softly out of the card's own foot: the body opens from nothing while the card keeps its shape.
        const height = body.getBoundingClientRect().height;
        body.style.overflow = 'clip';
        body.animate([{ height: '0px', opacity: 0, transform: 'translateY(-6px)' }, { height: `${height}px`, opacity: 1, transform: 'none' }],
          { duration: 360, easing: 'cubic-bezier(0,0,.2,1)' }).finished.catch(() => {}).finally(() => (body.style.overflow = ''));
        card.animate([{ scale: '.98' }, { scale: '1.015', offset: .6 }, { scale: '1' }], { duration: 360, easing: 'ease-out' });
      }
      setTimeout(() => { if (token === this.editToken) card.scrollIntoView({ block: 'nearest', behavior: this.motion.reduced() ? 'auto' : 'smooth' }); }, 380);
    }, { injector: this.injector });
  }
  /** Its name is kept as soon as the box is left (an empty name keeps the old one). */
  commitTitle(): void {
    const node = this.editNode;
    const title = this.editTitle.trim();
    if (!node || !title || title === node.title || this.saving) return;
    this.mutate(() => this.state.edit(node.id, title));
    this.announcement = this.i18n.t('canvas.saved');
  }
  /** ✓, a tap outside or Esc: the name is kept and the card shrinks back softly. */
  async finishEdit(): Promise<void> {
    if (!this.editId) return;
    this.commitTitle();
    const token = ++this.editToken;
    const body = this.editElement()?.querySelector<HTMLElement>('.card-edit');
    if (body && !this.motion.reduced()) {
      const height = body.getBoundingClientRect().height;
      body.style.overflow = 'clip';
      await body.animate([{ height: `${height}px`, opacity: 1 }, { height: '0px', opacity: 0 }],
        { duration: 260, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).finished.catch(() => {});
    }
    if (token === this.editToken) this.endEdit();
  }
  /** Closes the card at once. */
  private endEdit(): void {
    if (!this.editId) return;
    this.editToken++;
    this.editId = '';
    if (!this.modal) this.fillCascade(null);
    this.bump();
  }
  private editElement(): HTMLElement | null {
    return this.editId ? document.querySelector<HTMLElement>(`[data-editing="${CSS.escape(this.editId)}"]`) : null;
  }

  /** A tap anywhere but the open card closes it (a question window over it, like Delete's, leaves it open). */
  @HostListener('document:click', ['$event'])
  outsideClick(event: MouseEvent): void {
    if (!this.editId) return;
    const card = this.editElement();
    const target = event.target as Element | null;
    if (!card || !target || card.contains(target)) return;
    const window = target.closest('dialog');
    if (window && !window.contains(card)) return;
    void this.finishEdit();
  }

  /** Its whole place at once, as soon as the card's last level is chosen (area, Epic, Feature and Story; Gianni: never
   *  half a place). The Undefined window stays open for the next one while any is left. */
  applyMove(): void {
    const node = this.editNode;
    if (!node || this.saving || this.cascadeIncomplete) return;
    const title = this.editTitle.trim() || node.title;
    const planned = this.plannedParent();
    const place = { area: this.cascade.area, epic: this.cascade.epic };
    const inWindow = !!this.undefinedWindow()?.nativeElement.contains(this.editElement());
    const source = this.nodeElement(node.id);
    const moves = node.parentId !== planned;
    const ghost = source && moves && !inWindow && !this.motion.reduced() ? this.motion.ghost(source) : undefined;
    let parentId: string | null | undefined;
    this.mutate(() => this.state.group(() => {
      parentId = this.resolveParent(node);
      if (parentId === undefined) return;
      if (title !== node.title) this.state.edit(node.id, title);
      if (node.parentId !== parentId) this.state.move(node.id, parentId);
    }));
    if (parentId === undefined) { ghost?.remove(); return; }
    this.endEdit();                                                         // it lands closed in its new place
    if (inWindow && !this.undefinedList.length) this.closeUndefined();
    this.followPlace('task', place, node.id);
    if (ghost) void this.motion.land(ghost, this.nodeElement(node.id), this.destinationElement(parentId ?? null));
    this.announcement = this.i18n.t('canvas.saved');
  }

  /** The editor is shrinking away: nothing more is applied (a double click on Apply must not create twice). */
  editorClosing = false;

  open(kind: Kind, parentId: string | null = null, node?: LibNode, bare = false): void {
    if (this.editId) { this.commitTitle(); this.endEdit(); }
    this.editorClosing = false;
    this.modal = { kind, parentId, node, bare };
    this.title = node?.title || '';
    this.nameOpen = false;
    const parent = node?.parentId ?? parentId;
    this.epicArea = kind === 'epic' ? (this.keyOf(parent) || (this.areaFilter === 'all' ? '' : this.areaFilter)) : '';
    this.fillCascade(parent);
    const from = pressPoint();                                              // read now: the dialog opens a tick later
    queueMicrotask(() => { const d = this.editor()?.nativeElement; if (d) openDialog(d, { from }); });
  }
  /** New activity (Gianni): just its name; it waits in Undefined until it gets its whole place. */
  newActivity(): void { this.open('task', null, undefined, true); }
  /** A tap on the name in its own box of the card: it becomes the name box right there, ready to type (he tapped it). */
  openName(): void {
    this.nameOpen = true;
    afterNextRender(() => { const box = this.modalNameBox()?.nativeElement; box?.focus(); box?.select(); }, { injector: this.injector });
  }
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
  /** The window has closed: an open card's Move panel works on its own Activity again. */
  editorClosed(): void {
    this.modal = null;
    if (this.editNode) this.fillCascade(this.editNode.parentId);
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

  // The place: Area → Epic → Feature → Story on the place card, each level an existing one under the level above, or a new
  // one named right there (created when the place is applied).
  cascade: Record<PlaceLevel, string> = { area: '', epic: '', feature: '', story: '' };
  newName: Record<CascadeLevel, string> = { epic: '', feature: '', story: '' };
  get cascadeLevels(): CascadeLevel[] {
    const subject = this.subject;
    const target = subject ? PARENT_KIND[subject.kind] : null;
    const levels: CascadeLevel[] = ['epic', 'feature', 'story'];
    return target && target !== 'area' ? levels.slice(0, levels.indexOf(target as CascadeLevel) + 1) : [];
  }
  /** The parent the level lists the children of: the area's node, or the level above (none when it is new or unset). */
  private cascadeParent(level: CascadeLevel): string {
    const levels = this.cascadeLevels;
    const index = levels.indexOf(level);
    if (index === 0) return this.cascade.area ? this.lifeAreas[this.cascade.area as LifeArea]?.id ?? '' : '';
    const above = this.cascade[levels[index - 1]];
    return above === this.NEW ? '' : above;
  }
  cascadeOptions(level: CascadeLevel): LibNode[] {
    const parent = this.cascadeParent(level);
    const self = this.subject?.node?.id;
    return parent ? this.state.children(parent, level).filter((n) => n.id !== self) : [];
  }
  /** Apply waits until every level is chosen or named: a place is never half given (Gianni). */
  get cascadeIncomplete(): boolean {
    const m = this.subject;
    if (!m || m.bare || m.kind === 'area') return false;
    if (m.kind === 'epic') return !this.epicArea;
    if (!this.cascade.area) return true;
    return this.cascadeLevels.some((level) => !this.cascade[level] || (this.cascade[level] === this.NEW && !this.newName[level].trim()));
  }
  /** A level chosen on the place card clears the ones below it (Gianni: they read «Por definir» again). On an Activity's
   *  open card the place is applied as soon as its last level is chosen; a window applies it with its Apply. */
  pickPlace(pick: PlacePick): void {
    const levels: PlaceLevel[] = ['area', ...this.cascadeLevels];
    const index = levels.indexOf(pick.level);
    if (index < 0) return;
    const name = pick.id === this.NEW ? (pick.name ?? '').trim() : '';
    if (pick.id === this.NEW && !name) return;
    if (pick.level === 'area' && !this.lifeAreaKeys.includes(pick.id as LifeArea)) return;
    const cascade = { ...this.cascade, [pick.level]: pick.id };
    const newName = { ...this.newName };
    if (pick.level !== 'area') newName[pick.level] = name;
    for (const below of levels.slice(index + 1)) { cascade[below] = ''; if (below !== 'area') newName[below] = ''; }
    this.cascade = cascade;
    this.newName = newName;
    if (this.modal?.kind === 'epic') this.epicArea = cascade.area as LifeArea;   // an Epic's place is only its area
    this.bump();
    if (!this.modal && this.editNode && !this.cascadeIncomplete) this.applyMove();
  }
  /** A level's name on the place card ('' = «Por definir»): a life area's full name, a new one's typed name. */
  readonly placeLabel = (level: PlaceLevel): string => {
    const id = this.cascade[level];
    if (!id) return '';
    if (level === 'area') return this.lifeAreaKeys.includes(id as LifeArea) ? this.areaName(id) : '';
    return id === this.NEW ? this.newName[level] : this.state.node(id)?.title ?? '';
  };
  /** A level's description beside its name: only a life area has one («Familia»). */
  readonly placeDesc = (level: PlaceLevel): string =>
    level === 'area' && this.lifeAreaKeys.includes(this.cascade.area as LifeArea) ? this.areaDesc(this.cascade.area) : '';
  /** A level's choices in its floating menu: the four life areas, else the children of the level chosen above. */
  readonly placeOptions = (level: PlaceLevel): PlaceOption[] => level === 'area'
    ? this.lifeAreaKeys.map((key) => ({ id: key, title: this.areaName(key), desc: this.areaDesc(key) }))
    : this.cascadeOptions(level).map((n) => ({ id: n.id, title: n.title }));
  private fillCascade(parentId: string | null): void {
    this.cascade = { area: '', epic: '', feature: '', story: '' };
    this.newName = { epic: '', feature: '', story: '' };
    const m = this.subject;
    if (m?.kind === 'epic') { this.cascade.area = this.epicArea; return; }   // its ÁREA line on the place card
    if (!m || m.kind === 'area') return;
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
    }   // anything else starts «Por definir» everywhere: the place waits until it is whole (Gianni)
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
  private resolveParent(editing?: LibNode): string | null | undefined {
    const m = editing ? { kind: editing.kind, node: editing, parentId: editing.parentId } as Modal : this.modal!;
    if (m.kind === 'area') return null;
    if (m.kind === 'epic') return this.epicArea ? this.ensureArea(this.epicArea) ?? undefined : undefined;
    if (m.bare) return null;
    if (!this.cascade.area) return undefined;
    let parent = this.ensureArea(this.cascade.area as LifeArea);
    for (const level of this.cascadeLevels) {
      if (!parent) return undefined;
      const value = this.cascade[level];
      parent = value === this.NEW ? this.state.create(level, this.newName[level], parent)?.id ?? null : value;
    }
    return parent ?? undefined;
  }
  /** The parent the dialog would end on, without creating anything ('new' when some level is new). */
  private plannedParent(): string | null {
    const m = this.subject!;
    if (m.kind === 'epic') return this.epicArea ? this.lifeAreas[this.epicArea]?.id ?? this.NEW : null;
    if (m.bare) return null;
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
        if (created?.kind === 'epic') { if (this.epicArea && this.areaFilter !== 'all') this.setAreaFilter(this.epicArea); this.activeId = created.id; }
      }));
      if (kind !== 'epic' && createdId) this.followPlace(kind, place, createdId);   // its own ancestry names the Epic to show
    }
    this.announcement = this.i18n.t('canvas.saved');
    this.close();
  }

  /** Once something gets its place in another area or Epic, the Canvas shows it there (an Epic, its area). */
  private followPlace(kind: Kind, place: { area: string; epic: string }, id?: string): void {
    if (kind === 'epic' && id) {
      const key = this.keyOf(this.state.node(id)?.parentId ?? null);
      if (key) { this.showArea(key); this.activeId = id; }
      return;
    }
    if (!place.area || kind === 'area') return;
    const key = place.area as LifeArea;
    const epicId = place.epic === this.NEW || !place.epic ? this.pathEpic(id) : place.epic;
    this.showArea(key);
    if (epicId && this.state.node(epicId)) this.activeId = epicId;
  }
  /** Shows a life area's Epics: «Todas» already shows them, so it stays. */
  private showArea(key: LifeArea): void {
    if (this.areaFilter !== 'all' && key !== this.areaFilter) this.setAreaFilter(key);
  }
  /** The Epic above a node (after it moved), for a place made with a new Epic. */
  private pathEpic(id?: string): string {
    for (let n = this.state.node(id), guard = 0; n && guard < 10; guard++, n = this.state.node(n.parentId)) if (n.kind === 'epic') return n.id;
    return '';
  }

  /** A week place count for the delete question of a task. */
  private weekPlaces(id: string): number {
    return DAYS.reduce((sum, day) => sum + this.week.week()[day].blocks.reduce((n, b) => n + b.tasks.filter((t) => t.ref === id).length, 0), 0);
  }

  /** Delete asks, then counts down like every delete in the app (Gianni); only when the time is up is it gone (and saved). */
  async remove(): Promise<void> {
    const node = this.subject?.node;
    if (!node || this.saving || this.editorClosing) return;
    if (!this.state.canDelete(node.id)) { void this.asks.tell(this.i18n.t('canvas.deleteHint')); return; }
    const places = node.kind === 'task' ? this.weekPlaces(node.id) : 0;
    const question = places ? this.i18n.t('canvas.confirmDeleteTask', { n: places }) : this.i18n.t('canvas.confirmDelete');
    const commit = () => {
      if (!this.state.node(node.id) || !this.state.canDelete(node.id)) return;   // gone or filled meanwhile
      this.mutate(() => { this.state.delete(node.id); this.ensureActive(); });
    };
    const yes = await this.asks.ask({ message: question, ok: this.i18n.t('task.delete'), danger: true,
      countdown: { message: this.i18n.t('undo.deleting', { name: node.title }), ids: [node.id], commit } });
    if (yes && this.modal?.node === node) this.close();
    if (yes && this.editId === node.id) void this.finishEdit();
  }

  private mutate(action: () => void, excluded?: string): void {
    const before = this.motion.capture(this.host.nativeElement);
    action();
    if (this.state.dirty) this.save();                                      // every change saves by itself (Gianni)
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
      const visible = this.host.nativeElement.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`);
      if (visible) return visible;
      const node = this.state.node(id);
      if (node?.kind === 'epic') return this.host.nativeElement.querySelector('.pick-epic .pick-btn');
      id = node?.parentId || null;
    }
    return this.host.nativeElement.querySelector('.undefined-btn');
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
      // Over ÁREA and EPIC (they stay still, Gianni) the finger still scrolls the Epic's content up under them
      const under = document.elementFromPoint(d.currentX, d.currentY);
      const panel = under?.closest<HTMLElement>('.scroll-panel') || (under?.closest('.epic-objects') ? this.pane() : null);
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
      this.announcement = this.i18n.t('canvas.saved');
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
  escape(): void { this.cancelDrag(); if (this.editId && !this.undefinedWindow()?.nativeElement.open) void this.finishEdit(); }

  // --- Device preferences ---

  private readArea(): AreaView {
    let stored = '';
    try { stored = localStorage.getItem(AREA_KEY) || ''; } catch { /* optional */ }
    return stored === 'all' || LIFE_AREAS.some((a) => a.key === stored) ? (stored as AreaView) : 'temple';
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
