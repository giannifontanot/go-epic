import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n';
import { TimedTask, blockColors, formatClock, timeline, validMinutes } from '../../core/week.model';
import { WeekStore } from '../../core/week.store';

/**
 * Today, one task at a time: the running task large with its time left and a progress bar, then the rest
 * of the day. A tap marks a task done or not done (saved for today only; tomorrow starts fresh).
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
          <article class="now-card" [style.--tone]="tone(item)" [class.done]="store.isDone(item.task.id)">
            <p class="eyebrow">{{ i18n.t(started(item) ? 'focus.now' : 'focus.next') }} · {{ item.block.name }} · {{ range(item) }}</p>
            <h2>{{ item.task.title }}</h2>
            <div class="bar"><span [style.width.%]="fraction() * 100"></span></div>
            <div class="now-actions">
              <span>{{ started(item) ? i18n.t('focus.left', { n: minutesLeft(item) }) : i18n.t('focus.startsIn', { n: startsIn(item) }) }}</span>
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
                      [class.current]="item.task.id === current()?.task?.id" [attr.aria-pressed]="store.isDone(item.task.id)"
                      [attr.aria-label]="(store.isDone(item.task.id) ? i18n.t('focus.markTodo') : i18n.t('focus.markDone')) + ': ' + item.task.title"
                      (click)="toggle(item)">
                <span class="check" aria-hidden="true">{{ store.isDone(item.task.id) ? '✓' : '' }}</span>
                <span class="t-time">{{ item.start === null ? '' : clockOf(item.start) }}</span>
                <span class="t-title">{{ item.task.title }}</span>
                <span class="t-dur">{{ item.task.minutes }} min</span>
              </button>
            </li>
          }
        </ol>
      }
    </section>
  `,
})
export class Focus {
  protected readonly store = inject(WeekStore);
  protected readonly i18n = inject(I18n);

  private readonly plan = computed(() => this.store.week()[this.store.today()]);
  /** Today's active tasks in order. */
  protected readonly items = computed(() => timeline(this.plan()).filter((item) => item.task.active && item.task.title.trim()));
  private readonly tones = computed(() => {
    const map = new Map<string, string>();
    for (const block of this.plan().blocks) blockColors(block.tasks).forEach((color, i) => map.set(block.tasks[i].id, color));
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
}
