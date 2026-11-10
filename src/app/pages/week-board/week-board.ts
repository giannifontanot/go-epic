import { Component, DestroyRef, Injector, computed, effect, inject, signal } from '@angular/core';
import { flip } from '../../core/flip';
import { TextSettings } from '../../core/text-settings';
import { I18n } from '../../core/i18n';
import {
  Block, DAYS, Day, NEW_TASK_MINUTES, Task, WEEK_PX_PER_MIN, blockColors, cloneBlock, fits, formatClock, freeMinutes, moveItem, newId, stretchedEnd,
  nowPosition, parseClock, placeBlock, taskStarts, taskTotal, uniqueName, validMinutes, windowError, windowLength,
} from '../../core/week.model';
import { Library, fileTask, followLibrary, nodeById, paperAge, updateNode } from '../../core/library.model';
import { LibraryStore } from '../../core/library.store';
import { CaptureUi } from '../capture/capture-ui';
import { WeekStore, WeekWrite } from '../../core/week.store';
import { TaskDialog, TaskEdit, TaskSave } from './task-dialog';
import { Transfer, TransferDialog } from './transfer-dialog';

/**
 * The week in seven columns of blocks and task cards. Locked by default (a calm view of the week);
 * "Arrange the week" unlocks editing: block windows, ▲▼, ⇄ copy/move, + and quick-add, and each card's ••• details.
 */
@Component({
  selector: 'app-week-board',
  imports: [TaskDialog, TransferDialog],
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

  constructor() {
    // Arranging files tasks in the library: it stops while the library is not loaded (sign-out, another account).
    effect(() => { if (!this.library.ready()) this.arranging.set(false); });
    // On the Week board the floating ✎ arranges the week (Capture is the 💡 at the top); hidden while arranging.
    effect(() => {
      const hidden = this.arranging() || !this.store.loaded() || !this.library.ready();
      this.capture.fab.set({ label: this.i18n.t('week.arrange'), run: () => this.toggleArrange(), hidden });
    });
    inject(DestroyRef).onDestroy(() => this.capture.fab.set(null));
  }
  protected readonly mobileDay = signal<Day>(this.store.today());
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

  protected summary(block: Block): string {
    const start = parseClock(block.start);
    const total = windowLength(block) ?? taskTotal(block);
    if (start === null) return total ? `${total} min` : '';
    return `${formatClock(start)}–${formatClock(start + total)} · ${total} min`;
  }

  /** A captured task's paper age (0 fresh, 1 parchment, 2 old stained), from its library task; null keeps the pastel. */
  protected paper(task: Task): 0 | 1 | 2 | null {
    return paperAge(nodeById(this.library.library(), task.ref), this.store.now().getTime());
  }

  protected isDone(day: Day, task: Task): boolean {
    return day === this.store.today() && this.store.isDone(task.id);
  }

  protected toggleArrange(): void {
    if (!this.store.loaded() || !this.library.ready()) return;               // edits wait for the saved week and library
    this.arranging.update((on) => !on);
    this.notice.set('');
  }

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
    this.store.update(day, (blocks) => blocks.map((b) => (b.id === block.id ? { ...b, start: start || null, end: end || null } : b)));
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
   * Drag a card by its grip ⠿: a tilted copy follows the pointer (so it shows it is held), a teal line marks where it
   * will land, in its block or another block of the same day; on release the cards glide into their new order (FLIP).
   * A block whose end would be passed refuses it. Esc or a lost pointer cancels.
   */
  protected startTaskDrag(event: PointerEvent, day: Day, block: Block, task: Task): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const grip = event.currentTarget as HTMLElement;
    const card = grip.closest<HTMLElement>('li.task');
    const dayEl = grip.closest<HTMLElement>('article.day');
    if (!card || !dayEl) return;
    grip.setPointerCapture(event.pointerId);
    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true) as HTMLElement;
    ghost.classList.add('drag-ghost');
    Object.assign(ghost.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' });
    document.body.appendChild(ghost);
    card.classList.add('drag-src');
    const x0 = event.clientX, y0 = event.clientY;
    let target: { blockId: string; index: number } | null = null;
    const clearMarks = () => dayEl.querySelectorAll('.drop-before, .drop-end').forEach((el) => el.classList.remove('drop-before', 'drop-end'));
    const move = (e: PointerEvent) => {
      ghost.style.transform = `translate(${e.clientX - x0}px, ${e.clientY - y0}px) rotate(-3deg) scale(1.04)`;
      clearMarks();
      target = null;
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('section.block[data-block]');
      if (!under || !dayEl.contains(under)) return;
      const cards = Array.from(under.querySelectorAll<HTMLElement>('li.task[data-task]')).filter((c) => c !== card);
      const next = cards.find((c) => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
      if (next) next.classList.add('drop-before'); else under.querySelector('ul.tasks')?.classList.add('drop-end');
      target = { blockId: under.dataset['block']!, index: next ? cards.indexOf(next) : cards.length };
    };
    const finish = (commit: boolean) => () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', cancel);
      removeEventListener('keydown', esc, true);
      clearMarks();
      ghost.remove();
      card.classList.remove('drag-src');
      if (commit && target) this.dropTask(day, block.id, task.id, target.blockId, target.index);
    };
    const up = finish(true);
    const cancel = finish(false);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', cancel);
    addEventListener('keydown', esc, true);
  }

  /**
   * Puts a dragged card at `index` among the other cards of the target block (same day); it must fit there. The card
   * is read again from the current week (another tab may have renamed, recoloured or deleted it meanwhile): a card
   * that is gone is not brought back, and the latest version is the one moved.
   */
  private dropTask(day: Day, fromId: string, taskId: string, toId: string, index: number): void {
    const blocks = this.blocks(day);
    const from = blocks.find((b) => b.id === fromId);
    const to = blocks.find((b) => b.id === toId);
    const task = from?.tasks.find((t) => t.id === taskId);
    if (!from || !to || !task) return;
    if (fromId !== toId && !fits(to, task.minutes)) { this.notice.set(this.i18n.t('week.noRoom', { block: to.name, n: Math.max(0, freeMinutes(to) ?? 0) })); return; }
    if (fromId === toId && from.tasks.findIndex((t) => t.id === taskId) === index) return;
    this.notice.set('');
    flip(document, this.injector, () => this.store.update(day, (list) => {
      const current = list.find((b) => b.id === fromId)?.tasks.find((t) => t.id === taskId);
      if (!current || !list.some((b) => b.id === toId)) return list;
      return list.map((b) => {
        let tasks = b.tasks.filter((t) => t.id !== taskId);
        if (b.id === toId) tasks = [...tasks.slice(0, index), current, ...tasks.slice(index)];
        return b.id === fromId || b.id === toId ? { ...b, tasks } : b;
      }).filter((b) => b.tasks.length > 0);
    }));
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
