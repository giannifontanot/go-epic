import { Component, computed, inject, signal } from '@angular/core';
import { I18n } from '../../core/i18n';
import {
  Block, DAYS, Day, NEW_TASK_MINUTES, Task, blockColors, cloneBlock, fits, formatClock, freeMinutes, moveItem, newId,
  nowPosition, parseClock, placeBlock, taskStarts, taskTotal, uniqueName, validMinutes, windowError, windowLength,
} from '../../core/week.model';
import { WeekStore } from '../../core/week.store';
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
  protected readonly days = DAYS;

  protected readonly arranging = signal(false);
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

  protected isOver(block: Block): boolean {
    return (freeMinutes(block) ?? 0) < 0;
  }

  protected summary(block: Block): string {
    const start = parseClock(block.start);
    const total = windowLength(block) ?? taskTotal(block);
    if (start === null) return total ? `${total} min` : '';
    return `${formatClock(start)}–${formatClock(start + total)} · ${total} min`;
  }

  protected isDone(day: Day, task: Task): boolean {
    return day === this.store.today() && this.store.isDone(task.id);
  }

  protected toggleArrange(): void {
    if (!this.store.loaded()) return;                                        // edits wait for the saved week
    this.arranging.update((on) => !on);
    this.notice.set('');
  }

  // --- Blocks ---

  protected addBlock(day: Day): void {
    const task: Task = { id: newId(), title: '', minutes: NEW_TASK_MINUTES, color: null, active: true };
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
    this.store.update(day, (blocks) => moveItem(blocks, index, index + offset));
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
    const task: Task = { id: newId(), title: '', minutes: free === null ? NEW_TASK_MINUTES : Math.max(0, Math.min(NEW_TASK_MINUTES, free)), color: null, active: true };
    this.draftBlock.set(null);
    this.editing.set({ day, blockId: block.id, task, isNew: true });        // a draft: added to the block only on Done
  }

  protected quickAdd(day: Day, block: Block, input: HTMLInputElement): void {
    const title = input.value.trim();
    if (!title) return;
    const free = freeMinutes(block);
    const minutes = free === null ? NEW_TASK_MINUTES : Math.max(0, Math.min(NEW_TASK_MINUTES, free));
    const task: Task = { id: newId(), title, minutes, color: null, active: true };
    this.store.update(day, (blocks) => blocks.map((b) => (b.id === block.id ? { ...b, tasks: [...b.tasks, task] } : b)));
    input.value = '';
  }

  protected openTask(day: Day, block: Block, task: Task): void {
    if (!this.arranging()) return;
    this.draftBlock.set(null);
    this.editing.set({ day, blockId: block.id, task: structuredClone(task), isNew: false });
  }

  protected moveTask(day: Day, block: Block, index: number, offset: number): void {
    this.store.update(day, (blocks) => blocks.map((b) => (b.id === block.id ? { ...b, tasks: moveItem(b.tasks, index, index + offset) } : b)));
  }

  protected deleteTask(day: Day, block: Block, task: Task): void {
    if (!confirm(this.i18n.t('week.confirmDeleteTask', { task: task.title || this.i18n.t('week.newTask') }))) return;
    this.removeTask(day, block.id, task.id);
  }

  /** A block lives only through its tasks: removing its last task removes the block. */
  private removeTask(day: Day, blockId: string, taskId: string): void {
    this.store.update(day, (blocks) =>
      blocks
        .map((b) => (b.id === blockId ? { ...b, tasks: b.tasks.filter((t) => t.id !== taskId) } : b))
        .filter((b) => b.id !== blockId || b.tasks.length > 0),
    );
  }

  protected saveTask(save: TaskSave): void {
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
      this.store.update(save.day, (blocks) =>
        blocks.map((b) => (b.id === save.blockId ? { ...b, tasks: b.tasks.map((t) => (t.id === save.task.id ? save.task : t)) } : b)));
      return;
    }
    // Moved: out of its old block (which goes away when emptied), to the end of the new one.
    const oldName = this.blocks(save.fromDay).find((b) => b.id === save.fromBlockId)?.name ?? this.i18n.t('week.newBlock');
    this.removeTask(save.fromDay, save.fromBlockId, save.task.id);
    this.store.update(save.day, (blocks) => {
      if (blocks.some((b) => b.id === save.blockId)) {
        return blocks.map((b) => (b.id === save.blockId ? { ...b, tasks: [...b.tasks, save.task] } : b));
      }
      const name = uniqueName(blocks.map((b) => b.name), oldName);              // a day with no blocks gets one
      return [...blocks, { id: newId(), name, start: null, end: null, tasks: [save.task] }];
    });
  }

  /** Done on a + task: it joins the latest saved week (other changes made meanwhile stay). */
  private addSaved(save: TaskSave, draft: Block | null): void {
    this.store.update(save.day, (blocks) => {
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

  protected removeEditing(): void {
    const edit = this.editing();
    if (!edit) return;
    if (!edit.isNew && !confirm(this.i18n.t('week.confirmDeleteTask', { task: edit.task.title }))) return;
    this.editing.set(null);
    this.draftBlock.set(null);
    if (edit.isNew) return;                                                  // a + task was never saved
    this.removeTask(edit.day, edit.blockId, edit.task.id);
  }

  protected canAddTo(block: Block): boolean {
    return fits(block, 1);
  }
}
