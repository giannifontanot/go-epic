import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { I18n } from '../../core/i18n';
import { paperAge } from '../../core/library.model';
import { DayMarks, DayResult, Habit, habits, taskHabits } from '../../core/status.model';
import { TodoStore } from '../../core/todo.store';
import { dateKey } from '../../core/week.model';
import { WeekStore } from '../../core/week.store';

const DAYS_SHOWN = 14;
/** Days read to find each habit's first mark and its real streak (only the last 14 are drawn). */
const HISTORY_DAYS = 90;

/**
 * Progress: every task of the week as a habit, with its streak (🔥 days in a row it was done; skipped days pause it,
 * missed ones end it, counted over the last 90 days) and its last 14 days as dots. Reads the day documents
 * (users/{uid}/days) live; no new data. Below them, Capture's repeating tasks (`taskHabits`) on their own colour and paper.
 */
@Component({
  selector: 'app-progress',
  imports: [NgTemplateOutlet],
  template: `
    <section class="progress-page">
      <header class="board-top"><h1>{{ i18n.t('progress.title') }}</h1></header>
      @if (!store.loaded()) {
        <p class="muted">{{ i18n.t('loading') }}</p>
      } @else if (!list().length && !taskList().length) {
        <p class="muted center">{{ i18n.t('progress.empty') }}</p>
      } @else {
        <p class="muted legend">{{ i18n.t('progress.legend') }}</p>
        @if (list().length) {
          <ul class="habits">
            @for (habit of list(); track habit.key) {
              <li class="habit">
                <ng-container *ngTemplateOutlet="row; context: { $implicit: habit }" />
              </li>
            }
          </ul>
        }
        <!-- Capture's repeating tasks (Gianni): on their own colour and paper, as in Capture, so they read as tasks -->
        @if (taskList().length) {
          <h2 class="habits-title">{{ i18n.t('progress.tasks') }}</h2>
          <ul class="habits">
            @for (habit of taskList(); track habit.key) {
              <li class="habit todo-habit" [attr.data-paper]="paper(habit)" [style.--tone]="tone(habit)">
                <ng-container *ngTemplateOutlet="row; context: { $implicit: habit }" />
              </li>
            }
          </ul>
        }
        <ng-template #row let-habit>
          <div class="h-head">
            <strong>{{ habit.title }}</strong>
            <span class="streak" [class.zero]="!habit.streak">{{ streakLabel(habit.streak, habit.streakCapped) }}</span>
          </div>
          <ol class="dots" [attr.aria-label]="habit.title">
            @for (day of habit.days; track day.date) {
              <li class="dot" [attr.data-result]="day.result" [attr.title]="day.date + ' · ' + resultLabel(day.result)"
                  [attr.aria-label]="day.date + ': ' + resultLabel(day.result)">{{ symbol(day.result) }}</li>
            }
          </ol>
        </ng-template>
        <p class="muted note">{{ i18n.t('progress.note') }}</p>
      }
    </section>
  `,
})
export class Progress {
  protected readonly i18n = inject(I18n);
  protected readonly store = inject(WeekStore);
  private readonly auth = inject(AuthService);
  private readonly history = signal<Record<string, DayMarks>>({});

  /** The first day shown (YYYY-MM-DD): changes only at midnight, not with every clock tick. */
  private readonly fromKey = computed(() => {
    const now = this.store.now();
    return dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (HISTORY_DAYS - 1)));
  });
  protected readonly list = computed(() => habits(this.store.week(), this.history(), this.store.now(), DAYS_SHOWN, HISTORY_DAYS));
  /** Capture's repeating tasks as habits: their checks live in each task (`doneOn`), no day documents needed. */
  private readonly todos = inject(TodoStore);
  protected readonly taskList = computed(() => taskHabits(this.todos.todos(), this.store.now(), DAYS_SHOWN, HISTORY_DAYS));

  private todoOf(habit: Habit) {
    return this.todos.todos().find((t) => 'todo:' + t.id === habit.key);
  }
  /** The task's own colour, the same as in Capture and on the Week board. */
  protected tone(habit: Habit): string | null {
    const todo = this.todoOf(habit);
    return todo ? this.todos.tones().get(todo.id) ?? null : null;
  }
  protected paper(habit: Habit): 0 | 1 | 2 {
    return paperAge(this.todoOf(habit), this.store.now().getTime()) ?? 0;
  }

  constructor() {
    let stop: (() => void) | null = null;
    // Follows the last 90 day documents (the streak needs more than the 14 drawn); again for another account or after midnight.
    effect(() => {
      this.auth.user();
      const from = this.fromKey();
      untracked(() => {
        stop?.();
        this.history.set({});
        stop = this.store.watchHistory(from, (byDate) => this.history.set(byDate));
      });
    });
    inject(DestroyRef).onDestroy(() => stop?.());
  }

  protected streakLabel(n: number, capped = false): string {
    if (capped) return this.i18n.t('progress.streakMore', { n });
    return n === 0 ? this.i18n.t('progress.none') : n === 1 ? this.i18n.t('progress.streak1') : this.i18n.t('progress.streak', { n });
  }

  protected symbol(result: DayResult): string {
    return { none: '', done: '●', late: '◐', progress: '▶', skipped: '⤼', missed: '✕', pending: '○' }[result];
  }

  protected resultLabel(result: DayResult): string {
    return result === 'none' ? '—' : result === 'missed' ? '✕' : result === 'pending' ? this.i18n.t('status.todo') : this.i18n.t('status.' + result);
  }
}
