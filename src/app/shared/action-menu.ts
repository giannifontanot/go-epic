import { Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { I18n } from '../core/i18n';
import { Todo } from '../core/todo.model';
import { TodoStore } from '../core/todo.store';
import { WeekStore } from '../core/week.store';
import { CaptureUi } from '../pages/capture/capture-ui';
import { TodoDialog, TodoSave } from '../pages/capture/todo-dialog';
import { DayOverview } from './day-overview';
import { ThemeFan } from './theme-fan';

/** A page's own action in the menu (the Week board: ✎ arrange the week). */
export interface MenuAction { label: string; run: () => void; }

/**
 * One round button at the bottom right (Gianni: so the screen is not full of buttons), on the Week board and the Canvas
 * alike. A tap stacks the actions above it, each sliding up out of it, the nearest first: the page's own edit (the
 * Week's ✎ arrange), + a new task, the day overview, 💡 Capture and the themes on top. A tap on an action closes the
 * menu and runs it (the themes keep it open, their tiles fan out to the left); the button again, a tap outside or Esc
 * draw them back in. Under reduced motion they simply appear and go.
 */
@Component({
  selector: 'app-action-menu',
  imports: [ThemeFan, DayOverview, TodoDialog],
  template: `
    @if (open()) { <div class="action-veil" aria-hidden="true" (click)="close()"></div> }
    <div id="action-stack" class="action-stack" [class.open]="open()" role="group" [attr.aria-label]="i18n.t('nav.actions')">
      @if (edit(); as action) {
        <button type="button" class="capture-fab act-fab" [style.--i]="index().edit" [attr.aria-label]="action.label" [title]="action.label"
                (click)="run(action.run)">✎</button>
      }
      @if (ready()) {
        <button type="button" class="capture-fab act-fab new-act" [style.--i]="index().add" [attr.aria-label]="i18n.t('capture.new')" [title]="i18n.t('capture.new')"
                (click)="run(newTask)">+</button>
        <button type="button" class="capture-fab act-fab" [style.--i]="index().overview" [attr.aria-label]="i18n.t('week.overview')" [title]="i18n.t('week.overview')"
                (click)="run(showOverview)">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor">
            <circle cx="5" cy="6" r="1.8"/><rect x="9" y="5" width="12" height="2" rx="1"/>
            <circle cx="9" cy="12" r="1.6"/><rect x="13" y="11" width="8" height="2" rx="1"/>
            <circle cx="9" cy="18" r="1.6"/><rect x="13" y="17" width="8" height="2" rx="1"/>
          </svg>
        </button>
      }
      <!-- Capture (Gianni): a light bulb, drawn as an outline like the palette -->
      <button type="button" class="capture-fab act-fab" [style.--i]="index().capture" [attr.aria-label]="i18n.t('capture.open')" [title]="i18n.t('capture.open')"
              (click)="run(openCapture)">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 17.5h6M10 20.5h4M12 3.5a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2v1.2h5.2v-1.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3.5Z"/>
        </svg>
      </button>
      <app-theme-fan [style.--i]="index().themes" />
    </div>
    <button type="button" class="capture-fab menu-fab" [class.open]="open()" [attr.aria-expanded]="open()" aria-controls="action-stack"
            [attr.aria-label]="i18n.t('nav.actions')" [title]="i18n.t('nav.actions')" (click)="toggle()">
      @if (open()) {
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>
        </svg>
      } @else {
        <!-- four small rounded squares: "more actions" -->
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
          <rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/>
          <rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/>
        </svg>
      }
    </button>
    <app-day-overview />
    @if (adding(); as todo) {
      <app-todo-dialog [todo]="todo" [isNew]="true" (save)="save($event)" (closed)="adding.set(null)" />
    }
  `,
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class ActionMenu {
  protected readonly i18n = inject(I18n);
  private readonly week = inject(WeekStore);
  private readonly todos = inject(TodoStore);
  private readonly capture = inject(CaptureUi);
  /** The page's own action, at the bottom of the stack (the Week board's ✎ arrange); none on the Canvas. */
  readonly edit = input<MenuAction | null>(null);
  protected readonly open = signal(false);
  protected readonly adding = signal<Todo | null>(null);
  private readonly fan = viewChild(ThemeFan);
  private readonly overviewWindow = viewChild.required(DayOverview);
  /** + and the overview need today's plan and Capture's tasks. */
  protected readonly ready = computed(() => this.week.loaded() && this.todos.ready());
  /** Each action's place from the bottom (0 = just above the round button), for its slide and its delay. */
  protected readonly index = computed(() => {
    let i = 0;
    const edit = this.edit() ? i++ : -1;
    const add = this.ready() ? i++ : -1;
    const overview = this.ready() ? i++ : -1;
    return { edit, add, overview, capture: i++, themes: i };
  });

  protected toggle(): void {
    if (this.open()) this.close(); else this.open.set(true);
  }
  protected close(): void {
    this.fan()?.close();
    this.open.set(false);
  }
  /** Esc draws the actions back, unless the themes are fanned out (they close first, on the same Esc). */
  protected onEscape(): void {
    if (this.open() && !this.fan()?.isOpen()) this.close();
  }
  protected run(action: () => void): void {
    this.close();
    action();
  }
  protected readonly newTask = () =>
    this.adding.set({ id: '', title: '', date: this.week.todayKey(), time: null, done: null, created: Date.now(), repeat: [], doneOn: {} });
  protected readonly showOverview = () => this.overviewWindow().open();
  protected readonly openCapture = () => this.capture.open.set(true);
  protected save(change: TodoSave): void {
    this.todos.add(change.title, change.repeat.length ? null : change.date, change.time, change.repeat);
  }
}
