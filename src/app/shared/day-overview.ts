import { Component, ElementRef, computed, inject, viewChild } from '@angular/core';
import { closeDialog, isBackdropClick, openDialog } from '../core/dialog';
import { I18n } from '../core/i18n';
import { Status } from '../core/status.model';
import { Todo, dayOverview } from '../core/todo.model';
import { TodoStore } from '../core/todo.store';
import { Block, formatClock, parseClock, taskTotal, windowLength } from '../core/week.model';
import { WeekStore } from '../core/week.store';

/**
 * The day overview (Gianni): today as a nested bullet list in a navy card, the all-day tasks first (rolled over from
 * earlier days, then today's with no hour), then each block with its activities and, under each, the timed tasks pinned
 * to it, and last the timed tasks no activity holds (todo.model `dayOverview`). Read-only; ✕, Close, Esc or the
 * backdrop close it. Opened from the floating buttons' menu (ActionMenu), on the Week board and the Canvas alike.
 */
@Component({
  selector: 'app-day-overview',
  template: `
    <dialog #dialog class="info-card day-overview" [attr.aria-label]="i18n.t('week.overview')" (click)="onBackdrop($event)">
      @let view = overview();
      <div class="info-head">
        <h2>{{ title() }}</h2>
        <button type="button" class="round" [attr.aria-label]="i18n.t('week.infoClose')" [title]="i18n.t('week.infoClose')" (click)="close()">✕</button>
      </div>
      @if (!view.allDay.length && !view.blocks.length && !view.later.length) {
        <p class="hint">{{ i18n.t('week.overviewEmpty') }}</p>
      }
      <ul class="ov-list">
        @if (view.allDay.length) {
          <li class="ov-group">
            <span class="ov-head"><strong>{{ i18n.t('week.allDay') }}</strong></span>
            <ul>
              @for (todo of view.allDay; track todo.id) {
                <li class="ov-todo" [class.done]="todo.done !== null">
                  <span class="ov-check" aria-hidden="true">{{ todo.done !== null ? '✓' : '☐' }}</span>
                  <span class="ov-title">{{ todo.title }}</span>
                  @if (todo.date !== null && todo.date < store.todayKey() && !todo.repeat.length) { <small class="ov-from">{{ fromLabel(todo) }}</small> }
                </li>
              }
            </ul>
          </li>
        }
        @for (item of view.blocks; track item.block.id) {
          <li class="ov-block">
            <span class="ov-head"><strong>{{ item.block.name }}</strong>
              @if (summary(item.block); as range) { <span class="ov-time">{{ range.from }}–{{ range.to }}</span> }
            </span>
            <ul>
              @for (act of item.activities; track act.task.id) {
                @let state = store.status(act.task.id);
                <li class="ov-act" [class.done]="state === 'done' || state === 'late'">
                  <span class="ov-line">
                    @if (act.start !== null) { <span class="ov-time">{{ clock(act.start) }}</span> }
                    <span class="ov-title">{{ act.task.title || i18n.t('week.newTask') }}</span>
                    @if (statusIcon(state); as icon) { <span class="ov-state" [attr.aria-label]="i18n.t('status.' + state)">{{ icon }}</span> }
                  </span>
                  @if (act.todos.length) {
                    <ul>
                      @for (todo of act.todos; track todo.id) {
                        <li class="ov-todo" [class.done]="todo.done !== null">
                          <span class="ov-check" aria-hidden="true">{{ todo.done !== null ? '✓' : '☐' }}</span>
                          <span class="ov-time">{{ todo.time }}</span>
                          <span class="ov-title">{{ todo.title }}</span>
                        </li>
                      }
                    </ul>
                  }
                </li>
              }
            </ul>
          </li>
        }
        @if (view.later.length) {
          <li class="ov-group">
            <span class="ov-head"><strong>{{ i18n.t('week.overviewOther') }}</strong></span>
            <ul>
              @for (todo of view.later; track todo.id) {
                <li class="ov-todo" [class.done]="todo.done !== null">
                  <span class="ov-check" aria-hidden="true">{{ todo.done !== null ? '✓' : '☐' }}</span>
                  <span class="ov-time">{{ todo.time }}</span>
                  <span class="ov-title">{{ todo.title }}</span>
                </li>
              }
            </ul>
          </li>
        }
      </ul>
      <div class="info-foot"><button type="button" class="primary" (click)="close()">{{ i18n.t('week.infoClose') }}</button></div>
    </dialog>
  `,
})
export class DayOverview {
  protected readonly i18n = inject(I18n);
  protected readonly store = inject(WeekStore);
  private readonly todos = inject(TodoStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  // always built (cheap), so the window has its full size when openDialog measures it to grow out of the button
  protected readonly overview = computed(() => {
    const day = this.store.today();
    return dayOverview(this.store.week()[day], this.todos.todos(), this.store.todayKey(), day);
  });
  protected readonly title = computed(() =>
    this.store.now().toLocaleDateString(this.i18n.lang(), { weekday: 'long', day: 'numeric', month: 'long' }));

  open(): void {
    const d = this.dialog().nativeElement;
    if (!d.open) openDialog(d);
  }
  protected close(): void {
    void closeDialog(this.dialog().nativeElement);
  }
  protected onBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.dialog().nativeElement)) this.close();
  }
  protected clock(minutes: number | null): string {
    return minutes === null ? '' : formatClock(minutes);
  }
  protected statusIcon(status: Status): string {
    return { todo: '', done: '✓', late: '⏰', progress: '▶', skipped: '⤼' }[status];
  }
  /** The block's time range, as on the board: from – to. */
  protected summary(block: Block): { from: string; to: string } | null {
    const start = parseClock(block.start);
    if (start === null) return null;
    return { from: formatClock(start), to: formatClock(start + (windowLength(block) ?? taskTotal(block))) };
  }
  /** "from Mon 9": the day an overdue task was for. */
  protected fromLabel(todo: Todo): string {
    const [y, m, d] = (todo.date ?? '').split('-').map(Number);
    const day = new Date(y, m - 1, d).toLocaleDateString(this.i18n.lang(), { weekday: 'short', day: 'numeric' });
    return this.i18n.t('week.todoFrom', { day });
  }
}
