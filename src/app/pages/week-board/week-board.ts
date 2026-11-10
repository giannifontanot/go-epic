import { ApplicationRef, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { flip, flipNow } from '../../core/flip';
import { TextSettings } from '../../core/text-settings';
import { I18n } from '../../core/i18n';
import {
  Block, DAYS, Day, NEW_TASK_MINUTES, Task, WEEK_PX_PER_MIN, blockColors, cloneBlock, fits, formatClock, freeMinutes, moveItem, newId, stretchedEnd,
  moveToHour, nowPosition, parseClock, placeBlock, taskStarts, taskTotal, uniqueName, validMinutes, windowError, windowLength,
} from '../../core/week.model';
import { Library, fileTask, followLibrary, nodeById, paperAge, updateNode } from '../../core/library.model';
import { LibraryStore } from '../../core/library.store';
import { CaptureUi } from '../capture/capture-ui';
import { WeekStore, WeekWrite } from '../../core/week.store';
import { closeDialog, isBackdropClick, openDialog, pressPoint } from '../../core/dialog';
import { STATUSES, Status } from '../../core/status.model';
import { PinnedTodo, Todo, overdueTodos, pinTodos, stackPins, todosForDate, weekDate } from '../../core/todo.model';
import { TodoDialog, TodoSave } from '../capture/todo-dialog';
import { TodoStore } from '../../core/todo.store';
import { TaskDialog, TaskEdit, TaskSave } from './task-dialog';
import { Transfer, TransferDialog } from './transfer-dialog';

/**
 * The week in seven columns of blocks and task cards. Locked by default (a calm view of the week);
 * "Arrange the week" unlocks editing: block windows, ▲▼, ⇄ copy/move, + and quick-add, and each card's ••• details.
 */
const FOLD_KEY = 'go-epic-week-folded';
/** The ids of the blocks shown folded on this device (a view preference). */
function readFolded(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(FOLD_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch { return new Set(); }
}

@Component({
  selector: 'app-week-board',
  imports: [TaskDialog, TransferDialog, TodoDialog],
  templateUrl: './week-board.html',
})
export class WeekBoard {
  protected readonly store = inject(WeekStore);
  protected readonly i18n = inject(I18n);
  protected readonly library = inject(LibraryStore);
  protected readonly capture = inject(CaptureUi);
  private readonly injector = inject(Injector);
  protected readonly text = inject(TextSettings);
  protected readonly days = DAYS;

  protected readonly arranging = signal(false);
  /**
   * Folded blocks (remembered on this device): each block has its own ⌄ (Gianni), and the day's ⊟/⊞ folds or opens
   * every block of the week at once (⊞ while all are folded).
   */
  private readonly foldedIds = signal(readFolded());
  protected isFolded(block: Block): boolean {
    return this.foldedIds().has(block.id);
  }
  protected readonly allFolded = computed(() => {
    const ids = DAYS.flatMap((day) => this.blocks(day).map((b) => b.id));
    return ids.length > 0 && ids.every((id) => this.foldedIds().has(id));
  });
  protected toggleBlockFold(block: Block): void {
    const next = new Set(this.foldedIds());
    if (!next.delete(block.id)) next.add(block.id);
    this.setFolded(next);
  }
  protected toggleFolded(): void {
    this.setFolded(this.allFolded() ? new Set() : new Set(DAYS.flatMap((day) => this.blocks(day).map((b) => b.id))));
  }
  private setFolded(ids: Set<string>): void {
    this.foldedIds.set(ids);
    try { localStorage.setItem(FOLD_KEY, JSON.stringify([...ids])); } catch { /* a view preference */ }
  }

  constructor() {
    // Arranging files tasks in the library: it stops while the library is not loaded (sign-out, another account).
    effect(() => { if (!this.library.ready()) this.arranging.set(false); });
    // On the Week board the floating ✎ arranges the week (Capture is the 💡 at the top); hidden while arranging.
    effect(() => {
      const hidden = this.arranging() || !this.store.loaded() || !this.library.ready();
      this.capture.fab.set({ label: this.i18n.t('week.arrange'), run: () => this.toggleArrange(), hidden });
    });
    inject(DestroyRef).onDestroy(() => { this.capture.fab.set(null); this.cancelDrag?.(); });
    // On entering the Week board, the view centres on now (the red line in today's column), as in Epic Manager.
    let centred = false;
    effect(() => {
      if (centred || !this.store.loaded()) return;
      centred = true;
      untracked(() => afterNextRender({ read: () => this.centreOnNow() }, { injector: this.injector }));
    });
  }
  protected readonly mobileDay = signal<Day>(this.store.today());
  /**
   * Capture's tasks on the board (Gianni): each day of this week shows the tasks dated that day, pinned over the
   * activity running at their hour; the others (no hour, or an hour no activity covers) at the top of the day.
   */
  protected readonly todos = inject(TodoStore);
  /**
   * A card's pinned notes, grouped so none covers another: a note is about 48px tall and a card is
   * 46px + 1.6px per minute (styles.css), so notes closer than that share one stack.
   */
  protected noteStacks(day: Day, task: Task): { fraction: number; todos: Todo[] }[] {
    const pins = this.pins()[day].onTask.get(task.id);
    if (!pins?.length) return [];
    return stackPins(pins, 48 / (46 + validMinutes(task.minutes) * WEEK_PX_PER_MIN));
  }
  protected readonly pins = computed(() => {
    const all = this.todos.todos();
    const week = this.store.week();
    const out = {} as Record<Day, { onTask: Map<string, PinnedTodo[]>; loose: Todo[] }>;
    const rolled = new Set(this.overdue().map((t) => t.id));                // they moved on to today (top of its column)
    for (const day of DAYS) out[day] = pinTodos(week[day], todosForDate(all, this.dates()[day], day).filter((t) => !rolled.has(t.id)));
    return out;
  });
  /** A task's paper on the board, as in Capture: fresh, parchment from 5 days, old stained paper from 21. */
  protected todoPaper(todo: Todo): 0 | 1 | 2 {
    return paperAge(todo, this.store.now().getTime()) ?? 0;
  }
  /** Single tasks left open on earlier days: they roll over to the top of today's column (Gianni). */
  protected readonly overdue = computed(() => overdueTodos(this.todos.todos(), this.store.todayKey()));
  /** "from Mon 9": the day an overdue task was for. */
  protected fromLabel(todo: Todo): string {
    const [y, m, d] = (todo.date ?? '').split('-').map(Number);
    const day = new Date(y, m - 1, d).toLocaleDateString(this.i18n.lang(), { weekday: 'short', day: 'numeric' });
    return this.i18n.t('week.todoFrom', { day });
  }
  /** Every task on the board keeps its ✎ (Gianni): it opens the same editor as Capture (name, day, hour, repeat). */
  protected readonly editingTodo = signal<Todo | null>(null);
  protected editTodo(todo: Todo): void {
    this.editingTodo.set(this.todos.todos().find((t) => t.id === todo.id) ?? null);   // the stored task, not a date's view
  }
  protected saveTodo(change: TodoSave): void {
    this.todos.update(change.id, { title: change.title, date: change.date, time: change.time, repeat: change.repeat });
  }
  /** The date of each day of this week (Monday first): a repeating task is checked for that date. */
  protected readonly dates = computed(() => {
    const now = this.store.now();
    return Object.fromEntries(DAYS.map((day) => [day, weekDate(now, day)])) as Record<Day, string>;
  });
  protected readonly notice = signal('');
  protected readonly windowErrors = signal<Record<string, string>>({});
  protected readonly editing = signal<TaskEdit | null>(null);
  /**
   * A task added by + stays a draft until Done: it is not saved, only shown in the details' Day/Block lists.
   * `newBlock` is the block a day's + would create for it (null when it goes into an existing block).
   */
  private readonly draftBlock = signal<Block | null>(null);
  /** The week the details see: the saved week plus the draft block of a + task. */
  protected readonly dialogWeek = computed(() => {
    const week = this.store.week();
    const edit = this.editing();
    const draft = this.draftBlock();
    if (!edit?.isNew || !draft) return week;
    return { ...week, [edit.day]: { blocks: [draft, ...week[edit.day].blocks] } };
  });
  protected readonly transferring = signal<{ day: Day; block: Block } | null>(null);

  /** Where today's now-line sits: the running task and the share of it already gone. */
  protected readonly now = computed(() => nowPosition(this.store.week()[this.store.today()], this.store.nowMinutes()));
  protected readonly nowLabel = computed(() => formatClock(this.store.nowMinutes()));

  /** Scrolls so today's now-line (or else today's column) sits in the middle of the screen. */
  private centreOnNow(): void {
    const today = document.querySelector<HTMLElement>('article.day.today');
    const target = today?.querySelector<HTMLElement>('.now-line') ?? today;
    if (!target) return;
    const smooth = typeof matchMedia === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ block: 'center', inline: 'center', behavior: smooth ? 'smooth' : 'auto' });
  }

  /** The details belong to a day's + (a new block with its first activity), not to a block's own +. */
  protected isNewBlock(edit: TaskEdit): boolean {
    return edit.isNew && !!this.draftBlock() && edit.blockId === this.draftBlock()!.id;
  }

  protected blocks(day: Day): Block[] {
    return this.store.week()[day].blocks;
  }

  protected colors(block: Block): string[] {
    return blockColors(block.tasks);
  }

  protected startLabel(block: Block, index: number): string {
    const start = taskStarts(block)[index];
    return start === null ? '' : formatClock(start);
  }

  protected durationLabel(minutes: number): string {
    const m = validMinutes(minutes);
    const h = Math.floor(m / 60);
    const rest = m % 60;
    if (!h) return `${m} MIN`;
    return rest ? `${h} H ${rest} MIN` : `${h} H`;
  }

  protected freeLabel(block: Block): string {
    const free = freeMinutes(block);
    if (free === null) return '';
    if (free === 0) return this.i18n.t('week.full');
    return free > 0 ? this.i18n.t('week.free', { n: free }) : this.i18n.t('week.over', { n: -free });
  }

  /** The block being stretched by its handle, and the end it would have now (shown live, saved on release). */
  protected readonly stretching = signal<{ blockId: string; end: string } | null>(null);

  /** The block as it looks now: while its handle is pulled, with the end it would get. */
  private live(block: Block): Block {
    const s = this.stretching();
    return s && s.blockId === block.id ? { ...block, end: s.end } : block;
  }
  /** Free minutes drawn as the striped band (live while stretching). */
  protected freeShown(block: Block): number {
    return Math.max(0, freeMinutes(this.live(block)) ?? 0);
  }
  protected shownEnd(block: Block): string {
    const b = this.live(block);
    return b.end ?? formatClock((parseClock(b.start) ?? 0) + taskTotal(b));
  }

  /** The handle at a block's foot: dragging it by n px moves the end by n / 1.6 minutes, live; release saves it. */
  protected startStretch(event: PointerEvent, day: Day, block: Block): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const y0 = event.clientY;
    const first = stretchedEnd(block, 0);
    if (!first) return;
    this.stretching.set({ blockId: block.id, end: first });
    const move = (e: PointerEvent) => {
      const end = stretchedEnd(block, (e.clientY - y0) / WEEK_PX_PER_MIN);
      if (end) this.stretching.set({ blockId: block.id, end });
    };
    const done = (commit: boolean) => () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', cancel);
      const end = this.stretching()?.end;
      this.stretching.set(null);
      if (commit && end && end !== block.end) this.setWindow(day, block, block.start ?? '', end);
    };
    const up = done(true);
    const cancel = done(false);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', cancel);
  }

  /** Keys on the handle: ↓/→ one minute longer, ↑/← shorter, Shift five, PageUp/PageDown fifteen. */
  protected stretchKey(event: KeyboardEvent, day: Day, block: Block): void {
    const step = event.shiftKey ? 5 : 1;
    const delta = ({ ArrowDown: step, ArrowRight: step, ArrowUp: -step, ArrowLeft: -step, PageDown: 15, PageUp: -15 } as Record<string, number>)[event.key];
    if (!delta) return;
    event.preventDefault();
    const end = stretchedEnd(block, delta);
    if (end && end !== block.end) this.setWindow(day, block, block.start ?? '', end);
  }

  protected isOver(block: Block): boolean {
    return (freeMinutes(block) ?? 0) < 0;
  }

  /** The block's time range (Gianni: no minutes on it); drawn as from – to with a soft grey dash. */
  protected summary(block: Block): { from: string; to: string } | null {
    const start = parseClock(block.start);
    const total = windowLength(block) ?? taskTotal(block);
    if (start === null) return null;
    return { from: formatClock(start), to: formatClock(start + total) };
  }

  /** A captured task's paper age (0 fresh, 1 parchment, 2 old stained), from its library task; null keeps the pastel. */
  protected paper(task: Task): 0 | 1 | 2 | null {
    return paperAge(nodeById(this.library.library(), task.ref), this.store.now().getTime());
  }

  // --- Today's states on the board (Gianni): a tap on a card of today marks it Done (again: To do); a long press
  //     (500 ms, or a right click) opens the state menu. The state shows in the middle of the card. ---
  protected readonly statuses = STATUSES;
  protected readonly picking = signal<Task | null>(null);
  private readonly statusDialog = viewChild<ElementRef<HTMLDialogElement>>('statusDialog');
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private pressAt: { x: number; y: number } | null = null;
  private longPressed = false;

  protected statusIcon(status: Status): string {
    return { todo: '', done: '✓', late: '⏰', progress: '▶', skipped: '⤼' }[status];
  }
  /** Today's state of a card, or null on other days (states are kept per date). */
  protected cardStatus(day: Day, task: Task): Status | null {
    return day === this.store.today() ? this.store.status(task.id) : null;
  }

  protected pressStart(event: PointerEvent, day: Day, task: Task): void {
    if (event.button !== 0 || this.arranging() || day !== this.store.today()) return;
    this.longPressed = false;
    this.pressEnd();
    this.pressAt = { x: event.clientX, y: event.clientY };
    this.pressTimer = setTimeout(() => {
      this.longPressed = true;
      navigator.vibrate?.(15);
      this.openStatus(task);
    }, 500);
  }
  /** A finger that moves (a scroll) is not a long press. */
  protected pressMove(event: PointerEvent): void {
    if (this.pressAt && Math.hypot(event.clientX - this.pressAt.x, event.clientY - this.pressAt.y) > 10) this.pressEnd();
  }
  protected pressEnd(): void {
    if (this.pressTimer) clearTimeout(this.pressTimer);
    this.pressTimer = null;
    this.pressAt = null;
  }

  /** A card tapped: while arranging it opens its details; on the board, today's card toggles Done. */
  protected cardTap(day: Day, block: Block, task: Task): void {
    if (this.arranging()) { this.openTask(day, block, task); return; }
    if (this.longPressed) { this.longPressed = false; return; }          // the long press already opened the menu
    if (day !== this.store.today()) return;
    this.store.setDone(task.id, !this.store.isDone(task.id));
  }

  protected cardMenu(event: Event, day: Day, task: Task): void {
    if (this.arranging() || day !== this.store.today()) return;
    event.preventDefault();
    this.openStatus(task);
  }

  private openStatus(task: Task): void {
    this.pressEnd();
    this.picking.set(task);
    const d = this.statusDialog()?.nativeElement;
    if (d) openDialog(d);
  }
  protected pickStatus(status: Status): void {
    const task = this.picking();
    if (task) this.store.setStatus(task.id, status);
    void closeDialog(this.statusDialog()?.nativeElement);
  }
  protected onStatusBackdrop(event: MouseEvent): void {
    const d = this.statusDialog()?.nativeElement;
    if (d && isBackdropClick(event, d)) void closeDialog(d);
  }

  protected isDone(day: Day, task: Task): boolean {
    return day === this.store.today() && this.store.isDone(task.id);
  }

  /**
   * Edit mode opens like every window (Gianni: nothing appears all at once): the arranging board grows out of the ✎ in
   * a widening circle and, on Finish, shrinks back into the same point, at the dialogs' rate (300 ms, mirrored curves).
   * Uses a View Transition where the browser has one; elsewhere (or under reduced motion) it simply switches.
   */
  protected toggleArrange(): void {
    if (!this.store.loaded() || !this.library.ready()) return;               // edits wait for the saved week and library
    const opening = !this.arranging();
    const change = () => { this.arranging.set(opening); this.notice.set(''); };
    const doc = document as Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } };
    const reduced = typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof doc.startViewTransition !== 'function') { change(); return; }
    if (opening) this.arrangeFrom = pressPoint();                            // the ✎ pressed; Finish shrinks back into it
    const { x, y } = this.arrangeFrom ?? pressPoint();
    const root = document.documentElement;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.style.setProperty('--vt-x', x + 'px');
    root.style.setProperty('--vt-y', y + 'px');
    root.style.setProperty('--vt-r', Math.ceil(radius) + 'px');
    root.classList.add(opening ? 'vt-grow' : 'vt-shrink');
    const done = () => root.classList.remove('vt-grow', 'vt-shrink');
    doc.startViewTransition(() => { change(); this.appRef.tick(); }).finished.then(done, done);
  }
  private arrangeFrom: { x: number; y: number } | null = null;
  private readonly appRef = inject(ApplicationRef);

  // --- Blocks ---

  protected addBlock(day: Day): void {
    const task: Task = { id: newId(), title: '', minutes: NEW_TASK_MINUTES, color: null, active: true, ref: null };
    const name = uniqueName(this.blocks(day).map((b) => b.name), this.i18n.t('week.newBlock'));
    this.draftBlock.set({ id: newId(), name, start: null, end: null, tasks: [] });   // saved (at the top of the day) only on Done
    this.editing.set({ day, blockId: this.draftBlock()!.id, task, isNew: true });
  }

  protected renameBlock(day: Day, block: Block, value: string): void {
    const others = this.blocks(day).filter((b) => b.id !== block.id).map((b) => b.name);
    const name = value.trim() ? uniqueName(others, value) : block.name;      // blank keeps the old name
    this.store.update(day, (blocks) => blocks.map((b) => (b.id === block.id ? { ...b, name } : b)));
  }

  protected setWindow(day: Day, block: Block, start: string, end: string): void {
    const problem = windowError(start, end, taskTotal(block));
    this.windowErrors.update((errors) => {
      const next = { ...errors };
      if (problem) next[block.id] = this.i18n.t('window.' + problem);
      else delete next[block.id];
      return next;
    });
    if (problem) return;
    const set = (blocks: Block[]) => blocks.map((b) => (b.id === block.id ? { ...b, start: start || null, end: end || null } : b));
    if ((start || null) === block.start) { this.store.update(day, set); return; }
    // A new start: the block glides to its hour among the day's blocks (Gianni)
    flip(document, this.injector, () => this.store.update(day, (blocks) => moveToHour(set(blocks), block.id)));
  }

  protected moveBlock(day: Day, index: number, offset: number): void {
    flip(document, this.injector, () => this.store.update(day, (blocks) => moveItem(blocks, index, index + offset)));
  }

  protected deleteBlock(day: Day, block: Block): void {
    if (!confirm(this.i18n.t('week.confirmDeleteBlock', { block: block.name }))) return;
    this.store.update(day, (blocks) => blocks.filter((b) => b.id !== block.id));
  }

  protected openTransfer(day: Day, block: Block): void {
    this.transferring.set({ day, block });
  }

  protected applyTransfer(transfer: Transfer): void {
    const current = this.transferring();
    this.transferring.set(null);
    if (!current) return;
    const from = current.day;
    const block = this.blocks(from).find((b) => b.id === current.block.id);   // the latest saved version, not the one the dialog opened with
    if (!block) return;                                                      // deleted meanwhile (another tab)
    for (const day of transfer.days) {
      if (day === from) continue;
      const names = this.blocks(day).map((b) => b.name);
      const name = uniqueName(names, block.name);
      const placed = transfer.mode === 'copy' ? cloneBlock(block, name) : { ...structuredClone(block), name };
      this.store.update(day, (blocks) => placeBlock(blocks, placed));       // it lands at its hour
    }
    if (transfer.mode === 'move') this.store.update(from, (blocks) => blocks.filter((b) => b.id !== block.id));
  }

  // --- Tasks ---

  protected addTask(day: Day, block: Block): void {
    const free = freeMinutes(block);
    const task: Task = { id: newId(), title: '', minutes: free === null ? NEW_TASK_MINUTES : Math.max(0, Math.min(NEW_TASK_MINUTES, free)), color: null, active: true, ref: null };
    this.draftBlock.set(null);
    this.editing.set({ day, blockId: block.id, task, isNew: true });        // a draft: added to the block only on Done
  }

  protected openTask(day: Day, block: Block, task: Task): void {
    if (!this.arranging()) return;
    this.draftBlock.set(null);
    this.editing.set({ day, blockId: block.id, task: structuredClone(task), isNew: false });
  }

  protected moveTask(day: Day, block: Block, index: number, offset: number): void {
    flip(document, this.injector, () =>
      this.store.update(day, (blocks) => blocks.map((b) => (b.id === block.id ? { ...b, tasks: moveItem(b.tasks, index, index + offset) } : b))));
  }

  /**
   * Drag a card by its grip ⠿ (Gianni): a tilted copy follows the pointer so it shows it is held; where it would land
   * a dashed gap opens and the other cards glide aside to make room (in its block or another block of the same day).
   * On release the copy settles into the gap and the cards take their new order smoothly. A block that has no room
   * refuses it (the card goes back). Esc, a lost pointer or leaving the page cancels.
   */
  protected startTaskDrag(event: PointerEvent, day: Day, block: Block, task: Task): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const grip = event.currentTarget as HTMLElement;
    const card = grip.closest<HTMLElement>('li.task');
    const dayEl = grip.closest<HTMLElement>('article.day');
    const home = card?.parentElement;
    if (!card || !dayEl || !home) return;
    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true) as HTMLElement;
    ghost.classList.add('drag-ghost');
    Object.assign(ghost.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' });
    document.body.appendChild(ghost);
    // The gap: a dashed slot as tall as the card, first where the card was (the card itself is hidden meanwhile)
    const slot = document.createElement('li');
    slot.className = 'drop-slot';
    slot.style.height = rect.height + 'px';
    home.insertBefore(slot, card);
    card.classList.add('drag-src');
    const moving = 'li.task:not(.drag-src), li.drop-slot, section.block';
    const x0 = event.clientX, y0 = event.clientY, pointerId = event.pointerId;
    let dx = 0, dy = 0;
    let valid = true;                                           // the pointer is over a block of this day
    const move = (e: PointerEvent) => {
      if (!card.isConnected) { cancel(); return; }              // another tab deleted or moved it meanwhile
      dx = e.clientX - x0; dy = e.clientY - y0;
      ghost.style.transform = `translate(${dx}px, ${dy}px) rotate(-3deg) scale(1.04)`;
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('section.block[data-block]');
      const list = under && dayEl.contains(under) ? under.querySelector<HTMLElement>('ul.tasks') : null;
      valid = !!list;
      if (!list) {                                                // outside the day's blocks: the gap goes back home
        if (slot.nextElementSibling !== card) flipNow(dayEl, moving, () => home.insertBefore(slot, card));
        return;
      }
      const cards = Array.from(list.querySelectorAll<HTMLElement>('li.task:not(.drag-src)'));
      const next = cards.find((c) => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; }) ?? null;
      if (slot.parentElement === list && slot.nextElementSibling === next) return;
      if (next && next.previousElementSibling === slot) return;
      flipNow(dayEl, moving, () => list.insertBefore(slot, next));
    };
    let done = false;
    const finish = (commit: boolean) => () => {
      if (done) return;
      done = true;
      this.cancelDrag = null;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', cancel);
      removeEventListener('keydown', esc, true);
      removeEventListener('blur', cancel);
      dayEl.removeEventListener('lostpointercapture', cancel);
      if (dayEl.hasPointerCapture?.(pointerId)) dayEl.releasePointerCapture(pointerId);
      // Where it lands: the gap's block and its index among the other cards; a refused or cancelled drop goes home
      let target: { blockId: string; index: number } | null = null;
      const list = slot.parentElement;
      const toEl = list?.closest<HTMLElement>('section.block[data-block]');
      if (commit && valid && list && toEl && card.isConnected) {
        const index = Array.from(list.children).filter((c) => c === slot || (c.matches('li.task') && c !== card)).indexOf(slot);
        target = { blockId: toEl.dataset['block']!, index };
        if (!this.canDrop(day, block.id, task.id, target.blockId)) target = null;
      }
      if (!target && card.isConnected) flipNow(dayEl, moving, () => home.insertBefore(slot, card));
      const end = () => {
        const landed = slot.getBoundingClientRect();
        ghost.remove();
        if (!target) { slot.remove(); card.classList.remove('drag-src'); return; }
        const t = target;
        flip(document, this.injector, () => {
          slot.remove();
          card.classList.remove('drag-src');
          this.dropTask(day, block.id, task.id, t.blockId, t.index);
        }, new Map([[task.id, landed]]));
      };
      // The copy settles into the gap (rotation and lift go away), then the board takes the new order
      const to = slot.getBoundingClientRect();
      const reduced = typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced || !slot.isConnected) { end(); return; }
      const anim = ghost.animate([
        { transform: `translate(${dx}px, ${dy}px) rotate(-3deg) scale(1.04)` },
        { transform: `translate(${to.left - rect.left}px, ${to.top - rect.top}px) rotate(0deg) scale(1)` },
      ], { duration: 220, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'forwards' });
      anim.finished.then(end, end);
    };
    const up = finish(true);
    const cancel = finish(false);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };
    // Listened on the window (the card is hidden while dragged); a card that vanishes mid-drag (another tab deleted it)
    // cancels on the next move, and leaving the page cancels too (cancelDrag on destroy). `done` makes repeats no-ops.
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', cancel);
    addEventListener('keydown', esc, true);
    // The pointer is captured on the day column (visible all along), so a release outside the window still arrives;
    // if tracking is lost anyway (capture taken away, the window loses focus) the card goes home.
    addEventListener('blur', cancel);
    try { dayEl.setPointerCapture(pointerId); } catch { /* not capturable: the window listeners still work */ }
    dayEl.addEventListener('lostpointercapture', cancel);
    this.cancelDrag = cancel;
  }
  /** Cancels a card drag in progress (the page is leaving). */
  private cancelDrag: (() => void) | null = null;

  /** Whether the card can land in that block: it still exists, and another block must have room for it. */
  private canDrop(day: Day, fromId: string, taskId: string, toId: string): boolean {
    const blocks = this.blocks(day);
    const task = blocks.find((b) => b.id === fromId)?.tasks.find((t) => t.id === taskId);
    const to = blocks.find((b) => b.id === toId);
    if (!task || !to) return false;
    if (fromId !== toId && !fits(to, task.minutes)) {
      this.notice.set(this.i18n.t('week.noRoom', { block: to.name, n: Math.max(0, freeMinutes(to) ?? 0) }));
      return false;
    }
    this.notice.set('');
    return true;
  }

  /**
   * Puts a dragged card at `index` among the other cards of the target block (same day). The card is read again from
   * the current week (another tab may have renamed, recoloured or deleted it meanwhile): a card that is gone is not
   * brought back, and the latest version is the one moved.
   */
  private dropTask(day: Day, fromId: string, taskId: string, toId: string, index: number): void {
    this.store.update(day, (list) => {
      const current = list.find((b) => b.id === fromId)?.tasks.find((t) => t.id === taskId);
      const to = list.find((b) => b.id === toId);
      if (!current || !to) return list;
      if (fromId !== toId && !fits(to, current.minutes)) return list;
      if (fromId === toId && to.tasks.findIndex((t) => t.id === taskId) === index) return list;
      return list.map((b) => {
        let tasks = b.tasks.filter((t) => t.id !== taskId);
        if (b.id === toId) tasks = [...tasks.slice(0, index), current, ...tasks.slice(index)];
        return b.id === fromId || b.id === toId ? { ...b, tasks } : b;
      }).filter((b) => b.tasks.length > 0);
    });
  }

  protected deleteTask(day: Day, block: Block, task: Task): void {
    if (!confirm(this.i18n.t('week.confirmDeleteTask', { task: task.title || this.i18n.t('week.newTask') }))) return;
    this.removeTask(day, block.id, task.id);
  }

  /** A block lives only through its tasks: removing its last task removes the block. */
  private removeTask(day: Day, blockId: string, taskId: string): void {
    this.updateDay(day, (blocks) =>
      blocks
        .map((b) => (b.id === blockId ? { ...b, tasks: b.tasks.filter((t) => t.id !== taskId) } : b))
        .filter((b) => b.id !== blockId || b.tasks.length > 0),
    );
  }

  /**
   * Every week task schedules a library task (Floating Canvas): the linked one, the same-titled task of the chosen
   * story (or Free Space), or a new one there. A colour picked here is the library task's colour, in every block.
   * Returns the filed task and the library to save (null when unchanged); `inBatch` saves both together.
   */
  private fileInLibrary(task: Task, parentId: string | null, colorPicked: boolean): { task: Task; lib: Library | null } {
    if (!this.library.ready() || !task.title.trim()) return { task, lib: null };
    const current = this.library.library();
    let lib = current;
    let id = task.ref && nodeById(lib, task.ref)?.kind === 'task' ? task.ref : '';
    if (!id) ({ lib, id } = fileTask(lib, task.title, parentId, task.color));
    const node = nodeById(lib, id)!;
    if (colorPicked && node.color !== task.color) lib = updateNode(lib, id, { color: task.color });
    return { task: { ...task, title: node.title, color: colorPicked ? task.color : node.color, ref: id }, lib: lib === current ? null : lib };
  }

  /** Day changes collected while `inBatch` runs (null: writes go straight to the store). */
  private batch: Partial<Record<Day, Block[]>> | null = null;

  /** Changes a day now, or inside the current batch. */
  private updateDay(day: Day, change: (blocks: Block[]) => Block[]): void {
    if (!this.batch) { this.store.update(day, change); return; }
    this.batch[day] = change(structuredClone(this.batch[day] ?? this.blocks(day)));
  }

  /**
   * Runs the day changes of one action; with a changed library, every day that changes (the action's, and the other
   * places of its library tasks that follow their title and colour) is committed in ONE batch with the library, so a
   * refused library write can never leave week cards pointing at a task (or colour) the library does not have.
   */
  private inBatch(lib: Library | null, action: () => void): void {
    this.batch = {};
    try { action(); } finally {
      const days = this.batch;
      this.batch = null;
      if (!lib) {
        for (const day of DAYS) if (days[day]) this.store.setBlocks(day, days[day]);
      } else {
        const writes: WeekWrite[] = [];
        for (const day of DAYS) {
          const blocks = days[day] ?? this.blocks(day);
          let changed = !!days[day];
          const next = blocks.map((b) => {
            const tasks = followLibrary(b.tasks, lib);
            if (tasks.some((t, i) => t !== b.tasks[i])) { changed = true; return { ...b, tasks }; }
            return b;
          });
          const write = changed ? this.store.stage(day, next) : null;
          if (write) writes.push(write);
        }
        this.library.save(lib, writes);
      }
    }
  }

  protected saveTask(raw: TaskSave): void {
    const filed = this.fileInLibrary(raw.task, raw.parentId, raw.colorPicked);
    this.inBatch(filed.lib, () => this.applySave({ ...raw, task: filed.task }));
  }

  private applySave(save: TaskSave): void {
    const edit = this.editing();
    const draft = this.draftBlock();
    this.editing.set(null);
    this.draftBlock.set(null);
    if (edit?.isNew) {
      this.addSaved(save, draft);
      return;
    }
    const sameBlock = save.fromDay === save.day && save.fromBlockId === save.blockId;
    if (sameBlock) {
      this.updateDay(save.day, (blocks) =>
        blocks.map((b) => (b.id === save.blockId ? { ...b, tasks: b.tasks.map((t) => (t.id === save.task.id ? save.task : t)) } : b)));
      return;
    }
    // Moved: out of its old block (which goes away when emptied), to the end of the new one.
    const oldName = this.blocks(save.fromDay).find((b) => b.id === save.fromBlockId)?.name ?? this.i18n.t('week.newBlock');
    this.removeTask(save.fromDay, save.fromBlockId, save.task.id);
    this.updateDay(save.day, (blocks) => {
      if (blocks.some((b) => b.id === save.blockId)) {
        return blocks.map((b) => (b.id === save.blockId ? { ...b, tasks: [...b.tasks, save.task] } : b));
      }
      const name = uniqueName(blocks.map((b) => b.name), oldName);              // a day with no blocks gets one
      return [...blocks, { id: newId(), name, start: null, end: null, tasks: [save.task] }];
    });
  }

  /** Done on a + task: it joins the latest saved week (other changes made meanwhile stay). */
  private addSaved(save: TaskSave, draft: Block | null): void {
    this.updateDay(save.day, (blocks) => {
      if (blocks.some((b) => b.id === save.blockId)) {
        return blocks.map((b) => (b.id === save.blockId ? { ...b, tasks: [...b.tasks, save.task] } : b));
      }
      const name = uniqueName(blocks.map((b) => b.name), draft?.name ?? this.i18n.t('week.newBlock'));
      const block: Block = { id: draft?.id ?? newId(), name, start: null, end: null, tasks: [save.task] };
      return [block, ...blocks];                                             // a new block goes at the top, easy to find
    });
  }

  /** Cancel: nothing was saved yet for a + task, and an edited task keeps its saved values. */
  protected cancelTask(): void {
    this.editing.set(null);
    this.draftBlock.set(null);
  }

  protected canAddTo(block: Block): boolean {
    return fits(block, 1);
  }
}
