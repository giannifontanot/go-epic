import { CaptureUi } from '../capture/capture-ui';
import { PageMenu } from '../../shared/title-fan';
import { NgTemplateOutlet } from '@angular/common';
import { BalanceView } from './balance-view';
import { balanceFromKey } from '../../core/balance.model';
import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { I18n } from '../../core/i18n';
import { paperAge, trackedIds } from '../../core/library.model';
import { LibraryStore } from '../../core/library.store';
import { DayMarks, DayResult, Habit, habits, taskHabits } from '../../core/status.model';
import { TodoStore } from '../../core/todo.store';
import { dateKey } from '../../core/week.model';
import { WeekStore } from '../../core/week.store';

const DAYS_SHOWN = 14;
/** Days read to find each habit's first mark and its real streak (only the last 14 are drawn). */
const HISTORY_DAYS = 90;
const TAB_KEY = 'go-epic-progress-tab';

function readTab(): 'streaks' | 'balance' {
  try { return localStorage.getItem(TAB_KEY) === 'balance' ? 'balance' : 'streaks'; } catch { return 'streaks'; }
}

/**
 * Progress: every task of the week as a habit, with its streak (🔥 days in a row it was done; skipped days pause it,
 * missed ones end it, counted over the last 90 days) and its last 14 days as dots. Reads the day documents
 * (users/{uid}/days) live; no new data. Below them, Capture's repeating tasks (`taskHabits`) on their own colour and paper.
 */
@Component({
  selector: 'app-progress',
  imports: [NgTemplateOutlet, BalanceView],
  template: `
    <section class="progress-page">
      <header class="board-top progress-top"><h1><button type="button" class="title-btn" aria-haspopup="true" aria-expanded="false" [title]="i18n.t('nav.pages')" (click)="pageMenu.toggle($event.currentTarget)">{{ i18n.t('progress.title') }}<span class="title-chev" aria-hidden="true">⌄</span></button></h1>
        <!-- 💡 Capture's lists, at the top right as on the other pages (Gianni) -->
        <button type="button" class="round idea" [attr.aria-label]="i18n.t('capture.open')" [title]="i18n.t('capture.open')" (click)="captureUi.open.set(true)">💡</button>
      </header>
      <!-- two views (Gianni): Consistency (the streaks) and Areas of life (the radar) -->
      <div class="seg progress-tabs" role="tablist" [attr.aria-label]="i18n.t('progress.tabs')">
        <button type="button" role="tab" id="tab-streaks" [attr.aria-selected]="tab() === 'streaks'" [class.on]="tab() === 'streaks'" (click)="setTab('streaks')">{{ i18n.t('progress.tabStreaks') }}</button>
        <button type="button" role="tab" id="tab-balance" [attr.aria-selected]="tab() === 'balance'" [class.on]="tab() === 'balance'" (click)="setTab('balance')">{{ i18n.t('progress.tabBalance') }}</button>
      </div>
      @if (!store.loaded() || !library.ready()) {
        <p class="muted">{{ i18n.t('loading') }}</p>
      } @else if (tab() === 'balance') {
        <div role="tabpanel" aria-labelledby="tab-balance"><app-balance-view [history]="history()" /></div>
      } @else if (!list().length && !taskList().length) {
        <p class="muted center">{{ i18n.t(noneTracked() ? 'progress.pickHint' : 'progress.empty') }}</p>
      } @else {
        <p class="muted legend">{{ i18n.t('progress.legend') }}</p>
        @if (!list().length && noneTracked()) { <p class="muted track-hint">{{ i18n.t('progress.pickHint') }}</p> }
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
  protected readonly pageMenu = inject(PageMenu);
  protected readonly captureUi = inject(CaptureUi);
  protected readonly store = inject(WeekStore);
  private readonly auth = inject(AuthService);
  protected readonly history = signal<Record<string, DayMarks>>({});
  protected readonly tab = signal<'streaks' | 'balance'>(readTab());
  protected setTab(tab: 'streaks' | 'balance'): void {
    this.tab.set(tab);
    try { localStorage.setItem(TAB_KEY, tab); } catch { /* a view preference only */ }
  }

  /** The first day shown (YYYY-MM-DD): changes only at midnight, not with every clock tick. */
  private readonly fromKey = computed(() => {
    const now = this.store.now();
    const streaks = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (HISTORY_DAYS - 1)));
    const radar = balanceFromKey(now);                                     // the radar also needs the previous quarter
    return radar < streaks ? radar : streaks;
  });
  protected readonly library = inject(LibraryStore);
  /** Every Activity of the week as a habit; only those ticked "Track in Progress" show (Gianni: too many to follow all). */
  private readonly all = computed(() => habits(this.store.week(), this.history(), this.store.now(), DAYS_SHOWN, HISTORY_DAYS));
  private readonly tracked = computed(() => trackedIds(this.library.library()));
  protected readonly list = computed(() => this.all().filter((h) => this.tracked().has(h.key)));
  /** Some Activities are planned but none is tracked: Progress says how to add them. */
  protected readonly noneTracked = computed(() => this.all().length > 0 && !this.list().length);
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
