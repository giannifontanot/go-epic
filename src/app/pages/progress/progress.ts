import { Why } from '../../shared/why';
import { PageMenu } from '../../shared/title-fan';
import { NgTemplateOutlet } from '@angular/common';
import { BalanceView } from './balance-view';
import { balanceFromKey } from '../../core/balance.model';
import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { closeDialog, isBackdropClick, openDialog } from '../../core/dialog';
import { PERIOD_DAYS, TRACK_START, daysBetween, periodDay, periodEnd, periodGrid } from '../../core/period.model';
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
  imports: [NgTemplateOutlet, BalanceView, Why],
  template: `
    <section class="progress-page">
      <header class="board-top progress-top"><h1><button type="button" class="title-btn" aria-haspopup="true" aria-expanded="false" [title]="i18n.t('nav.pages')" (click)="pageMenu.toggle($event.currentTarget)">{{ i18n.t('progress.title') }}<span class="title-chev" aria-hidden="true">⌄</span></button></h1><app-why screen="progress" /></header>
      <!-- two views (Gianni): Consistency (the streaks) and Areas of life (the radar) -->
      <!-- changing tab is soft (Gianni): the bar glides with a small bounce and the view slides in from that side -->
      <div class="seg progress-tabs" role="tablist" [attr.aria-label]="i18n.t('progress.tabs')" [style.--tab-i]="tab() === 'balance' ? 1 : 0">
        <button type="button" role="tab" id="tab-streaks" [attr.aria-selected]="tab() === 'streaks'" [class.on]="tab() === 'streaks'" (click)="setTab('streaks')">{{ i18n.t('progress.tabStreaks') }}</button>
        <button type="button" role="tab" id="tab-balance" [attr.aria-selected]="tab() === 'balance'" [class.on]="tab() === 'balance'" (click)="setTab('balance')">{{ i18n.t('progress.tabBalance') }}</button>
      </div>
      @if (!store.loaded() || !library.ready()) {
        <p class="muted">{{ i18n.t('loading') }}</p>
      } @else if (tab() === 'balance') {
        <div class="tab-pane" role="tabpanel" aria-labelledby="tab-balance" [attr.data-dir]="dir()"><app-balance-view [history]="history()" [olderFirstKey]="olderFirstKey()" /></div>
      } @else {
      <div class="tab-pane" role="tabpanel" aria-labelledby="tab-streaks" [attr.data-dir]="dir()">
      @if (!list().length && !taskList().length) {
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
            <span class="h-side">
              <span class="streak" [class.zero]="!habit.streak">{{ streakLabel(habit.streak, habit.streakCapped) }}</span>
              <!-- the whole tracking period (Gianni): 6 rows of 3 weeks of 7 days -->
              <button type="button" class="round grid-btn" [attr.aria-label]="i18n.t('progress.gridOpen', { title: habit.title })" [title]="i18n.t('progress.gridOpen', { title: habit.title })"
                      (click)="openGrid(habit.key)"><span aria-hidden="true">▦</span></button>
            </span>
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
      </div>
      }
      <dialog #grid class="info-card track-grid" [attr.aria-label]="gridHabit()?.title ?? i18n.t('progress.gridTitle')" (click)="onGridBackdrop($event)">
        @let habit = gridHabit();
        <div class="info-head">
          <h2>{{ habit?.title }}</h2>
          <button type="button" class="round" [attr.aria-label]="i18n.t('week.infoClose')" [title]="i18n.t('week.infoClose')" (click)="closeGrid()">✕</button>
        </div>
        <dl class="tg-period">
          <div><dt>{{ i18n.t('progress.gridStart') }}</dt><dd>{{ longDate(start) }}</dd></div>
          <div><dt>{{ i18n.t('progress.gridEnd') }}</dt><dd>{{ longDate(end) }}</dd></div>
          @if (dayNumber() >= 1 && dayNumber() <= periodDays) { <div class="tg-today"><dd>{{ i18n.t('progress.gridDay', { n: dayNumber(), total: periodDays }) }}</dd></div> }
        </dl>
        <div class="tg-rows">
          @for (row of rows; track $index) {
            <section class="tg-row">
              <h3 class="tg-range">{{ shortDate(row[0][0]) }} – {{ shortDate(row[row.length - 1][6]) }}</h3>
              <div class="tg-weeks">
                @for (week of row; track $index) {
                  <ol class="tg-week">
                    @for (date of week; track date) {
                      @let result = resultOn(date);
                      <li class="dot tg-cell" [attr.data-result]="result" [class.future]="date > todayKey()" [class.today]="date === todayKey()"
                          [attr.title]="shortDate(date) + ' · ' + resultLabel(result)" [attr.aria-label]="shortDate(date) + ': ' + resultLabel(result)">{{ symbol(result) }}</li>
                    }
                  </ol>
                }
              </div>
            </section>
          }
        </div>
        <p class="muted tg-legend">{{ i18n.t('progress.gridLegend') }}</p>
        <div class="info-foot"><button type="button" class="primary" (click)="closeGrid()">{{ i18n.t('week.infoClose') }}</button></div>
      </dialog>
    </section>
  `,
})
export class Progress {
  protected readonly i18n = inject(I18n);
  protected readonly pageMenu = inject(PageMenu);
  protected readonly store = inject(WeekStore);
  private readonly auth = inject(AuthService);
  protected readonly history = signal<Record<string, DayMarks>>({});
  /** The earliest day document ever; passed to the radar only when it is older than the days read. */
  private readonly firstDay = signal<string | null>(null);
  protected readonly olderFirstKey = computed(() => {
    const first = this.firstDay();
    return first !== null && first < this.fromKey() ? first : null;
  });
  protected readonly tab = signal<'streaks' | 'balance'>(readTab());
  /** The side the new view comes in from; null until a tab is chosen, so the page opens still. */
  protected readonly dir = signal<'left' | 'right' | null>(null);
  protected setTab(tab: 'streaks' | 'balance'): void {
    if (tab === this.tab()) return;
    this.dir.set(tab === 'balance' ? 'right' : 'left');
    this.tab.set(tab);
    try { localStorage.setItem(TAB_KEY, tab); } catch { /* a view preference only */ }
  }

  /** The first day shown (YYYY-MM-DD): changes only at midnight, not with every clock tick. */
  private readonly fromKey = computed(() => {
    const now = this.store.now();
    const streaks = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (HISTORY_DAYS - 1)));
    const radar = balanceFromKey(now);                                     // the radar also needs the previous quarter
    return [radar, streaks, TRACK_START].sort()[0];                       // and the tracking grid its whole period
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

  // The tracking grid (Gianni): the whole period, 6 rows × 3 weeks × 7 days, opened from each habit's streak.
  private readonly gridDialog = viewChild.required<ElementRef<HTMLDialogElement>>('grid');
  protected readonly start = TRACK_START;
  protected readonly end = periodEnd(TRACK_START);
  protected readonly periodDays = PERIOD_DAYS;
  protected readonly rows = periodGrid(TRACK_START);
  protected readonly todayKey = computed(() => dateKey(this.store.now()));
  protected readonly dayNumber = computed(() => periodDay(TRACK_START, this.todayKey()));
  private readonly gridKey = signal<string | null>(null);
  /** The open habit over the whole period so far (days not yet read or before its first mark are blank). */
  protected readonly gridHabit = computed<Habit | null>(() => {
    const key = this.gridKey();
    if (key === null) return null;
    const span = Math.max(1, daysBetween(TRACK_START, this.todayKey()) + 1);
    // the whole history read decides each habit's first mark (as in the 14-day view); only the period is drawn
    const read = Math.max(span, daysBetween(this.fromKey(), this.todayKey()) + 1);
    const found = key.startsWith('todo:')
      ? taskHabits(this.todos.todos(), this.store.now(), span, read)
      : habits(this.store.week(), this.history(), this.store.now(), span, read);
    return found.find((h) => h.key === key) ?? null;
  });
  private readonly gridResults = computed(() => new Map((this.gridHabit()?.days ?? []).map((d) => [d.date, d.result])));
  protected resultOn(date: string): DayResult {
    return date > this.todayKey() ? 'none' : this.gridResults().get(date) ?? 'none';
  }
  protected openGrid(key: string): void {
    this.gridKey.set(key);
    const d = this.gridDialog().nativeElement;
    if (!d.open) openDialog(d);
  }
  protected closeGrid(): void {
    void closeDialog(this.gridDialog().nativeElement);
  }
  protected onGridBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.gridDialog().nativeElement)) this.closeGrid();
  }
  protected longDate(key: string): string {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(this.i18n.lang(), { day: 'numeric', month: 'short', year: 'numeric' });
  }
  protected shortDate(key: string): string {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(this.i18n.lang(), { day: 'numeric', month: 'short' });
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
    let stopFirst: (() => void) | null = null;
    effect(() => {
      this.auth.user();
      untracked(() => {
        stopFirst?.();
        this.firstDay.set(null);
        stopFirst = this.store.watchFirstDay((key) => this.firstDay.set(key));
      });
    });
    inject(DestroyRef).onDestroy(() => { stop?.(); stopFirst?.(); });
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
