import { Ask } from '../../shared/ask';
import { Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { closeDialog, isBackdropClick, openDialog } from '../../core/dialog';
import { I18n } from '../../core/i18n';
import { paperAge } from '../../core/library.model';
import { Todo, doneOnDate, repeats } from '../../core/todo.model';
import { TodoStore } from '../../core/todo.store';
import { DAYS, Day, dateKey, parseClock } from '../../core/week.model';
import { WeekStore } from '../../core/week.store';
import { CaptureUi } from './capture-ui';
import { TodoDialog, TodoSave } from './todo-dialog';

/**
 * Capture = tasks (Gianni): one-off to-dos, not Activities. The action menu's 💡 (or a page's 💡) opens the panel
 * without putting the cursor in the box (you may only want to look); tap the box, type and press Enter, as many as you like; each new task is for today, any hour. The panel
 * lists the open tasks soonest first, on aged paper tinted with their colour, under the Current tab; ☐ checks one (it moves to
 * the Finished tab, where ☑ opens it again), ✎ sets its name, day and hour, ✕ deletes it (asks first). In the Week a task
 * shows over the activity running at its hour (todo.model `pinTodos`).
 */
@Component({
  selector: 'app-capture-panel',
  template: `
    <dialog #panel class="capture-panel" aria-labelledby="capture-title" (click)="onBackdrop($event)" (close)="unfollow?.(); ui.open.set(false)">
      <header>
        <h2 id="capture-title" tabindex="-1">{{ i18n.t('capture.title') }}</h2>
        <button type="button" class="drawer-close" [attr.aria-label]="i18n.t('nav.close')" (click)="close()">×</button>
      </header>
      <form class="capture-add" (submit)="$event.preventDefault(); add(input)">
        <input #input type="text" enterkeyhint="send" autocomplete="off" [placeholder]="i18n.t('capture.placeholder')"
          [attr.aria-label]="i18n.t('capture.placeholder')" [disabled]="!todos.ready()" />
        <button type="submit" class="primary" [disabled]="!todos.ready()">{{ i18n.t('capture.add') }}</button>
      </form>
      <!-- A new task's repeat days, day and hour (Gianni: kept from the old New task): today and any hour by default;
           with a repeat day on it comes back every week and the day is not used. Back to the defaults after each add. -->
      <div class="capture-when">
        <div class="repeat-days" role="group" [attr.aria-label]="i18n.t('capture.repeat')">
          <span class="repeat-label">{{ i18n.t('capture.repeat') }}</span>
          @for (d of days; track d) {
            <button type="button" class="repeat-day" [class.on]="newRepeat().includes(d)" [attr.aria-pressed]="newRepeat().includes(d)"
                    [attr.aria-label]="i18n.t('day.' + d)" [title]="i18n.t('day.' + d)" (click)="toggleNewDay(d)">{{ i18n.t('dayMini.' + d) }}</button>
          }
        </div>
        <div class="row2">
          @if (!newRepeat().length) {
            <label class="field">{{ i18n.t('capture.day') }}
              <input type="date" [value]="newDate()" (input)="newDate.set($any($event.target).value)" /></label>
          }
          <label class="field">{{ i18n.t('capture.hour') }}
            <input type="time" step="60" [value]="newTime()" (input)="newTime.set($any($event.target).value)" /></label>
        </div>
        <p class="hint">{{ i18n.t('capture.anyHour') }}</p>
      </div>
      <p class="hint">{{ i18n.t('capture.inboxHint') }}</p>
      @if (todos.error()) { <p class="app-error" role="alert">{{ i18n.t('saveFailed') }}: {{ todos.error() }}</p> }
      <!-- Two tabs (Gianni): the current tasks and the finished ones, one tap apart; Current by default -->
      <div class="capture-tabs" role="tablist" [attr.aria-label]="i18n.t('capture.title')">
        <button type="button" role="tab" id="c-tab-open" aria-controls="c-pane" [class.on]="tab() === 'open'" [attr.aria-selected]="tab() === 'open'"
          [attr.tabindex]="tab() === 'open' ? 0 : -1" (click)="tab.set('open')" (keydown)="tabKey($event)">
          {{ i18n.t('capture.current') }} <span class="c-count">{{ todos.open().length }}</span></button>
        <button type="button" role="tab" id="c-tab-finished" aria-controls="c-pane" [class.on]="tab() === 'finished'" [attr.aria-selected]="tab() === 'finished'"
          [attr.tabindex]="tab() === 'finished' ? 0 : -1" (click)="tab.set('finished')" (keydown)="tabKey($event)">
          {{ i18n.t('capture.finished') }} <span class="c-count">{{ todos.finished().length }}</span></button>
      </div>
      <div id="c-pane" role="tabpanel" [attr.aria-labelledby]="tab() === 'open' ? 'c-tab-open' : 'c-tab-finished'">
      @if (tab() === 'open') {
      <ul class="capture-list">
        @for (todo of todos.open(); track todo.id) {
          <li [attr.data-paper]="paper(todo)" [style.--tone]="tones().get(todo.id)">
            <!-- A repeating task is checked for today only (when today is one of its days); a single one leaves the list -->
            @let checked = checkedToday(todo);
            <button type="button" class="c-check" [class.on]="checked" role="checkbox" [attr.aria-checked]="checked"
              [disabled]="!checkableToday(todo)" [attr.aria-label]="i18n.t(checked ? 'capture.uncheck' : 'capture.check') + ': ' + todo.title"
              [title]="i18n.t(checked ? 'capture.uncheck' : 'capture.check')" (click)="todos.setDone(todo.id, !checked, today())">{{ checked ? '✓' : '' }}</button>
            @if (editing() === todo.id) {
              <input class="c-edit" type="text" [value]="todo.title" [attr.aria-label]="i18n.t('capture.task')"
                (keydown.enter)="$event.preventDefault(); saveEdit(todo, $any($event.target).value)"
                (keydown.escape)="$event.stopPropagation(); editing.set('')" (blur)="saveEdit(todo, $any($event.target).value)" />
            } @else {
              <button type="button" class="c-text" [attr.aria-label]="i18n.t('capture.task') + ': ' + todo.title" (click)="startEdit(todo)">{{ todo.title }}
                <small class="c-when" [class.late]="isLate(todo)">{{ when(todo) }}</small></button>
            }
            <button type="button" class="c-icon" [attr.aria-label]="i18n.t('capture.edit') + ': ' + todo.title" [title]="i18n.t('capture.edit')"
              (click)="editingTodo.set(todo)">✎</button>
            <button type="button" class="c-icon" [attr.aria-label]="i18n.t('capture.delete') + ': ' + todo.title" [title]="i18n.t('capture.delete')"
              (click)="remove(todo)">✕</button>
          </li>
        } @empty {
          <li class="c-empty">{{ i18n.t(todos.ready() ? 'capture.empty' : 'loading') }}</li>
        }
      </ul>
      } @else {
        <ul class="capture-list finished">
          @for (todo of todos.finished(); track todo.id) {
            <li>
              <button type="button" class="c-check on" role="checkbox" aria-checked="true" [attr.aria-label]="i18n.t('capture.uncheck') + ': ' + todo.title"
                [title]="i18n.t('capture.uncheck')" (click)="todos.setDone(todo.id, false, today())">✓</button>
              <span class="c-text">{{ todo.title }} <small class="c-when">{{ when(todo) }}</small></span>
              <button type="button" class="c-icon" [attr.aria-label]="i18n.t('capture.edit') + ': ' + todo.title" [title]="i18n.t('capture.edit')"
                (click)="editingTodo.set(todo)">✎</button>
              <button type="button" class="c-icon" [attr.aria-label]="i18n.t('capture.delete') + ': ' + todo.title" [title]="i18n.t('capture.delete')"
                (click)="remove(todo)">✕</button>
            </li>
          } @empty {
            <li class="c-empty">{{ i18n.t('capture.noneFinished') }}</li>
          }
        </ul>
      }
      </div>
    </dialog>
    @if (editingTodo(); as todo) {
      <app-todo-dialog [todo]="todo" (save)="saveTodo($event)" (closed)="editingTodo.set(null)" />
    }
  `,
  imports: [TodoDialog],
})
export class CapturePanel {
  protected readonly i18n = inject(I18n);
  /** The app's own question windows (never the browser's confirm/alert). */
  private readonly asks = inject(Ask);
  protected readonly ui = inject(CaptureUi);
  protected readonly todos = inject(TodoStore);
  private readonly week = inject(WeekStore);
  private readonly panel = viewChild.required<ElementRef<HTMLDialogElement>>('panel');

  /** Each task on its own pastel (TodoStore.tones, shared with the Week board), multiplied into its paper. */
  protected readonly tones = this.todos.tones;
  protected readonly editing = signal('');
  /** The tab shown: the current tasks (the default) or the finished ones. */
  protected readonly tab = signal<'open' | 'finished'>('open');

  /** ← / → (and Home / End) move between the two tabs, as in any tab list. */
  protected tabKey(event: KeyboardEvent): void {
    const to = event.key === 'ArrowLeft' || event.key === 'Home' ? 'open' : event.key === 'ArrowRight' || event.key === 'End' ? 'finished' : null;
    if (!to) return;
    event.preventDefault();
    this.tab.set(to);
    (event.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(to === 'open' ? '#c-tab-open' : '#c-tab-finished')?.focus();
  }
  /** The task whose day and hour are being set (✎). */
  protected readonly editingTodo = signal<Todo | null>(null);

  constructor() {
    // Open / closed follows the shared flag (the ✎ and the menu both set it); the dialog grows from the press point.
    effect(() => {
      const open = this.ui.open();
      untracked(() => {
        const d = this.panel().nativeElement;
        if (open && !d.open) {
          this.resetNew();                                   // a new task starts on today, any hour
          this.followViewport(d);
          openDialog(d);
          // No cursor in the box on opening (Gianni): you may only want to look at the tasks; a tap on the box writes.
          queueMicrotask(() => d.querySelector<HTMLElement>('#capture-title')?.focus({ preventScroll: true }));
        } else if (!open && d.open) {
          this.unfollow?.();
          void closeDialog(d);
        }
      });
    });
  }

  protected unfollow: (() => void) | null = null;

  /**
   * While open, the panel tracks the visible part of the screen (the keyboard shrinks it on phones): it stays at the
   * top of what is visible and never taller than it, so the box and the newest tasks are never under the keyboard.
   */
  private followViewport(d: HTMLDialogElement): void {
    this.unfollow?.();
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const apply = () => {
      d.style.setProperty('--vv-h', vv.height + 'px');
      d.style.setProperty('--vv-top', vv.offsetTop + 'px');
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    this.unfollow = () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      this.unfollow = null;
    };
  }

  /** How old the task's paper looks: fresh, then parchment from 5 days, old stained paper from 21. */
  protected paper(todo: Todo): 0 | 1 | 2 {
    return paperAge(todo, this.week.now().getTime()) ?? 0;
  }

  /** "Today · 09:30", "Tomorrow", "Thu 12 Nov", or "No day". */
  protected readonly today = computed(() => dateKey(this.week.now()));
  /** Left open on an earlier day: it has rolled over to today (its day shows in red). */
  protected isLate(todo: Todo): boolean {
    return !repeats(todo) && todo.done === null && todo.date !== null && todo.date < this.today();
  }
  /** A repeating task can be checked here only on one of its days (for today); a single task always. */
  protected checkableToday(todo: Todo): boolean {
    return !repeats(todo) || todo.repeat.includes(this.week.today());
  }
  protected checkedToday(todo: Todo): boolean {
    return repeats(todo) ? doneOnDate(todo, this.today()) !== null : todo.done !== null;
  }

  /** "Today · 09:30", "Tomorrow", "Thu 12 Nov", "No day", or for a repeating task its days: "Mo We Fr · 07:00". */
  protected when(todo: Todo): string {
    if (repeats(todo)) {
      const days = todo.repeat.map((d) => this.i18n.t('dayMini.' + d)).join(' ');
      return todo.time ? `${days} · ${todo.time}` : days;
    }
    if (!todo.date) return this.i18n.t('capture.noDay');
    const now = this.week.now();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const [y, m, d] = todo.date.split('-').map(Number);
    const day = todo.date === dateKey(now) ? this.i18n.t('capture.today')
      : todo.date === dateKey(tomorrow) ? this.i18n.t('capture.tomorrow')
      : new Date(y, m - 1, d).toLocaleDateString(this.i18n.lang(), { weekday: 'short', day: 'numeric', month: 'short' });
    return todo.time ? `${day} · ${todo.time}` : day;
  }

  protected close(): void {
    this.ui.open.set(false);
  }

  protected onBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.panel().nativeElement)) this.close();
  }

  protected readonly days = DAYS;
  /** The new task's day ('' = undated), hour ('' = any time) and repeat days; today, any hour, no repeat by default. */
  protected readonly newDate = signal('');
  protected readonly newTime = signal('');
  protected readonly newRepeat = signal<Day[]>([]);
  protected toggleNewDay(day: Day): void {
    const on = new Set(this.newRepeat());
    if (!on.delete(day)) on.add(day);
    this.newRepeat.set(DAYS.filter((d) => on.has(d)));
  }
  private resetNew(): void {
    this.newDate.set(dateKey(this.week.now()));
    this.newTime.set('');
    this.newRepeat.set([]);
  }

  /**
   * Enter: a new task with the chosen day, hour and repeat days (today, any hour by default); the box empties and
   * keeps the cursor for the next one, and the choices go back to their defaults.
   */
  protected add(input: HTMLInputElement): void {
    if (!input.value.trim()) return;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(this.newDate()) ? this.newDate() : null;
    const time = parseClock(this.newTime()) !== null ? this.newTime() : null;
    this.todos.add(input.value, date, time, this.newRepeat());
    input.value = '';
    this.resetNew();
    input.focus();
  }

  protected startEdit(todo: Todo): void {
    this.editing.set(todo.id);
    queueMicrotask(() => this.panel().nativeElement.querySelector<HTMLInputElement>('.c-edit')?.focus());
  }

  protected saveEdit(todo: Todo, text: string): void {
    if (this.editing() !== todo.id) return;
    this.editing.set('');
    const title = text.trim();
    if (title && title !== todo.title) this.todos.update(todo.id, { title });
  }

  protected saveTodo(change: TodoSave): void {
    this.todos.update(change.id, { title: change.title, date: change.date, time: change.time, repeat: change.repeat });
  }

  protected async remove(todo: Todo): Promise<void> {
    const message = this.i18n.t('week.confirmDeleteTask', { task: todo.title });
    if (await this.asks.ask({ message, ok: this.i18n.t('task.delete'), danger: true })) this.todos.remove(todo.id);
  }
}
