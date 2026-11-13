import { AutoColors } from '../../core/auto-colors';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { closeDialog, isBackdropClick, openDialog } from '../../core/dialog';
import { I18n } from '../../core/i18n';
import { STATUSES, Status } from '../../core/status.model';
import { TimedTask, blockColors, formatClock, timeline, validMinutes } from '../../core/week.model';
import { WeekStore } from '../../core/week.store';

/**
 * Today, one task at a time: the running task large with its time left and a progress bar, then the rest
 * of the day. A tap marks a task done or not done; a long press (or right click) picks any state: To do, Done, Late,
 * In progress, Skipped (saved for today only; tomorrow starts fresh).
 */
@Component({
  selector: 'app-focus',
  imports: [RouterLink],
  template: `
    <section class="focus">
      <header class="focus-top">
        <div>
          <p class="eyebrow">{{ i18n.t('day.' + store.today()) }} · {{ clock() }}</p>
          <h1>{{ i18n.t('focus.title') }}</h1>
        </div>
        @if (items().length) {
          <p class="progress-text">{{ i18n.t('focus.progress', { done: doneCount(), total: activeCount() }) }}</p>
        }
      </header>
      @if (items().length) {
        <div class="progress" role="progressbar" [attr.aria-valuenow]="doneCount()" [attr.aria-valuemax]="activeCount()">
          <span [style.width.%]="activeCount() ? (doneCount() / activeCount()) * 100 : 0"></span>
        </div>
      }

      @if (!store.loaded()) {
        <p class="muted">{{ i18n.t('loading') }}</p>
      } @else if (!items().length) {
        <p class="muted center">{{ i18n.t('focus.empty') }}</p>
        <p class="center"><a class="chip quiet" routerLink="/">{{ i18n.t('nav.week') }}</a></p>
      } @else {
        @if (current(); as item) {
          <article class="now-card" [style.--tone]="tone(item)" [class.done]="store.isDone(item.task.id)" [attr.data-status]="store.status(item.task.id)">
            <p class="eyebrow">{{ i18n.t(started(item) ? 'focus.now' : 'focus.next') }} · {{ item.block.name }} · {{ range(item) }}</p>
            <h2>{{ item.task.title }}</h2>
            <div class="bar"><span [style.width.%]="fraction() * 100"></span></div>
            <div class="now-actions">
              <span>{{ started(item) ? i18n.t('focus.left', { n: minutesLeft(item) }) : i18n.t('focus.startsIn', { n: startsIn(item) }) }}</span>
              <button type="button" class="chip quiet" (click)="openStatus(item)">{{ icon(store.status(item.task.id)) }} {{ i18n.t('status.' + store.status(item.task.id)) }}</button>
              <button type="button" class="primary big" (click)="toggle(item)">
                {{ store.isDone(item.task.id) ? '↺ ' + i18n.t('focus.markTodo') : '✓ ' + i18n.t('focus.markDone') }}</button>
            </div>
          </article>
        }
        @if (allDone()) { <p class="all-done">🎉 {{ i18n.t('focus.allDone') }}</p> }

        <ol class="today-list">
          @for (item of items(); track item.task.id) {
            <li>
              <button type="button" class="today-task" [style.--tone]="tone(item)" [class.done]="store.isDone(item.task.id)"
                      [attr.data-status]="store.status(item.task.id)" (pointerdown)="pressStart($event, item)" (pointerup)="pressEnd()"
                      (pointerleave)="pressEnd()" (pointercancel)="pressEnd()" (contextmenu)="$event.preventDefault(); openStatus(item)"
                      [class.current]="item.task.id === current()?.task?.id" [attr.aria-pressed]="store.isDone(item.task.id)"
                      [attr.aria-label]="(store.isDone(item.task.id) ? i18n.t('focus.markTodo') : i18n.t('focus.markDone')) + ': ' + item.task.title"
                      (click)="tap(item)">
                <span class="check" aria-hidden="true">{{ icon(store.status(item.task.id)) }}</span>
                <span class="t-time">{{ item.start === null ? '' : clockOf(item.start) }}</span>
                <span class="t-title">{{ item.task.title }}</span>
                <span class="t-dur">{{ item.task.minutes }} min</span>
              </button>
            </li>
          }
        </ol>
        <p class="muted center hint">{{ i18n.t('status.hint') }}</p>
      }
    </section>

    <dialog #statusDialog class="status-menu" [attr.aria-label]="i18n.t('status.title')" (click)="onBackdrop($event)" (close)="picking.set(null)">
      @if (picking(); as item) {
        <h2>{{ item.task.title }}</h2>
        <div class="status-options" role="radiogroup" [attr.aria-label]="i18n.t('status.title')">
          @for (s of statuses; track s) {
            <button type="button" role="radio" [attr.data-status]="s" [attr.aria-checked]="store.status(item.task.id) === s"
                    [class.on]="store.status(item.task.id) === s" (click)="pick(s)">
              <span aria-hidden="true">{{ icon(s) }}</span> {{ i18n.t('status.' + s) }}</button>
          }
        </div>
      }
    </dialog>
  `,
})
export class Focus {
  protected readonly store = inject(WeekStore);
  private readonly autoColors = inject(AutoColors);   // the same remembered card colours as the Week board
  protected readonly i18n = inject(I18n);

  private readonly plan = computed(() => this.store.week()[this.store.today()]);
  /** Today's active tasks in order. */
  protected readonly items = computed(() => timeline(this.plan()).filter((item) => item.task.active && item.task.title.trim()));
  private readonly tones = computed(() => {
    const map = new Map<string, string>();
    for (const block of this.plan().blocks) blockColors(block.tasks, this.autoColors.map).forEach((color, i) => map.set(block.tasks[i].id, color));
    this.autoColors.saveIfGrown();                                   // colours first chosen here are kept too
    return map;
  });
  /**
   * The task to focus on: the one running now (start ≤ now < end); in a gap between tasks or before the day starts,
   * the next one to start; a task without a start time only when nothing timed is left and it is not done yet.
   */
  protected readonly current = computed<TimedTask | null>(() => {
    const now = this.store.nowMinutes();
    const items = this.items();
    // By time, not by board order: blocks can be arranged in any order on the board.
    const byStart = (pick: (a: number, b: number) => boolean) => (list: TimedTask[]) =>
      list.reduce<TimedTask | null>((best, item) => (!best || pick(item.start as number, best.start as number) ? item : best), null);
    const running = items.filter((item) => item.start !== null && item.end !== null && item.start <= now && now < item.end);
    const upcoming = items.filter((item) => item.start !== null && item.start > now);
    return byStart((a, b) => a > b)(running)                               // the one that started last
      ?? byStart((a, b) => a < b)(upcoming)                                 // else the next to start
      ?? items.find((item) => item.start === null && !this.store.isDone(item.task.id))
      ?? null;
  });
  /** The share of the running task already gone (0 for a task still to come). */
  protected readonly fraction = computed(() => {
    const item = this.current();
    if (!item || item.start === null || item.end === null || item.end <= item.start) return 0;
    return Math.min(1, Math.max(0, (this.store.nowMinutes() - item.start) / (item.end - item.start)));
  });
  protected readonly activeCount = computed(() => this.items().length);
  protected readonly doneCount = computed(() => this.items().filter((item) => item.task.id in this.store.done()).length);
  protected readonly allDone = computed(() => this.activeCount() > 0 && this.doneCount() === this.activeCount());
  protected readonly clock = computed(() => formatClock(this.store.nowMinutes()));

  protected tone(item: TimedTask): string {
    return this.tones().get(item.task.id) ?? '#ffd5bd';
  }

  protected clockOf(minutes: number): string {
    return formatClock(minutes);
  }

  protected range(item: TimedTask): string {
    return item.start === null || item.end === null ? `${validMinutes(item.task.minutes)} min` : `${formatClock(item.start)}–${formatClock(item.end)}`;
  }

  /** True once the task's start time has come (a task without a start time counts as started). */
  protected started(item: TimedTask): boolean {
    return item.start === null || item.start <= this.store.nowMinutes();
  }

  protected startsIn(item: TimedTask): number {
    return item.start === null ? 0 : Math.max(0, Math.ceil(item.start - this.store.nowMinutes()));
  }

  protected minutesLeft(item: TimedTask): number {
    if (item.end === null) return validMinutes(item.task.minutes);
    return Math.max(0, Math.ceil(item.end - this.store.nowMinutes()));
  }

  protected toggle(item: TimedTask): void {
    this.store.setDone(item.task.id, !this.store.isDone(item.task.id));
  }

  // --- States: a long press (500 ms) or a right click opens the menu; a short tap toggles done ---

  protected readonly statuses = STATUSES;
  protected readonly picking = signal<TimedTask | null>(null);
  private readonly statusDialog = viewChild<ElementRef<HTMLDialogElement>>('statusDialog');
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressed = false;

  protected icon(status: Status): string {
    return { todo: '', done: '✓', late: '⏰', progress: '▶', skipped: '⤼' }[status];
  }

  protected pressStart(event: PointerEvent, item: TimedTask): void {
    if (event.button !== 0) return;
    this.longPressed = false;
    this.pressEnd();
    this.pressTimer = setTimeout(() => {
      this.longPressed = true;
      navigator.vibrate?.(15);
      this.openStatus(item);
    }, 500);
  }

  protected pressEnd(): void {
    if (this.pressTimer) clearTimeout(this.pressTimer);
    this.pressTimer = null;
  }

  protected tap(item: TimedTask): void {
    if (this.longPressed) { this.longPressed = false; return; }       // the long press already opened the menu
    this.toggle(item);
  }

  protected openStatus(item: TimedTask): void {
    this.pressEnd();
    this.picking.set(item);
    const d = this.statusDialog()?.nativeElement;
    if (d) openDialog(d);
  }

  protected pick(status: Status): void {
    const item = this.picking();
    if (item) this.store.setStatus(item.task.id, status);
    void closeDialog(this.statusDialog()?.nativeElement);
  }

  protected onBackdrop(event: MouseEvent): void {
    const d = this.statusDialog()?.nativeElement;
    if (d && isBackdropClick(event, d)) void closeDialog(d);
  }
}
