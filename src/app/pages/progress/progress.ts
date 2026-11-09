import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { I18n } from '../../core/i18n';
import { DayMarks, DayResult, habits } from '../../core/status.model';
import { dateKey } from '../../core/week.model';
import { WeekStore } from '../../core/week.store';

const DAYS_SHOWN = 14;

/**
 * Progress: every task of the week as a habit, with its streak (🔥 days in a row it was done; skipped days pause it,
 * missed ones end it) and its last 14 days as dots. Reads the day documents (users/{uid}/days) live; no new data.
 */
@Component({
  selector: 'app-progress',
  template: `
    <section class="progress-page">
      <header class="board-top"><h1>{{ i18n.t('progress.title') }}</h1></header>
      @if (!store.loaded()) {
        <p class="muted">{{ i18n.t('loading') }}</p>
      } @else if (!list().length) {
        <p class="muted center">{{ i18n.t('progress.empty') }}</p>
      } @else {
        <p class="muted legend">{{ i18n.t('progress.legend') }}</p>
        <ul class="habits">
          @for (habit of list(); track habit.key) {
            <li class="habit">
              <div class="h-head">
                <strong>{{ habit.title }}</strong>
                <span class="streak" [class.zero]="!habit.streak">{{ streakLabel(habit.streak) }}</span>
              </div>
              <ol class="dots" [attr.aria-label]="habit.title">
                @for (day of habit.days; track day.date) {
                  <li class="dot" [attr.data-result]="day.result" [attr.title]="day.date + ' · ' + resultLabel(day.result)"
                      [attr.aria-label]="day.date + ': ' + resultLabel(day.result)">{{ symbol(day.result) }}</li>
                }
              </ol>
            </li>
          }
        </ul>
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
    return dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (DAYS_SHOWN - 1)));
  });
  protected readonly list = computed(() => habits(this.store.week(), this.history(), this.store.now(), DAYS_SHOWN));

  constructor() {
    let stop: (() => void) | null = null;
    // Follows the last 14 day documents; again for another account or after midnight.
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

  protected streakLabel(n: number): string {
    return n === 0 ? this.i18n.t('progress.none') : n === 1 ? this.i18n.t('progress.streak1') : this.i18n.t('progress.streak', { n });
  }

  protected symbol(result: DayResult): string {
    return { none: '', done: '●', late: '◐', progress: '▶', skipped: '⤼', missed: '✕', pending: '○' }[result];
  }

  protected resultLabel(result: DayResult): string {
    return result === 'none' ? '—' : result === 'missed' ? '✕' : result === 'pending' ? this.i18n.t('status.todo') : this.i18n.t('status.' + result);
  }
}
