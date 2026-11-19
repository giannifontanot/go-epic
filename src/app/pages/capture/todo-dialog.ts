import { AfterViewInit, Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { closeDialog, isBackdropClick, openDialog } from '../../core/dialog';
import { I18n } from '../../core/i18n';
import { activityFromTodo } from '../../core/library.model';
import { LibraryStore } from '../../core/library.store';
import { TodoStore } from '../../core/todo.store';
import { Todo } from '../../core/todo.model';
import { DAYS, Day, NEW_TASK_MINUTES, parseClock, validMinutes } from '../../core/week.model';

export interface TodoSave { id: string; title: string; date: string | null; time: string | null; repeat: Day[]; }

/**
 * Capture's ✎ (and the Week board's + New): a task's name, repeat days, day and hour (the hour is optional: empty = any time that day). Nothing changes until
 * Done; Cancel, Esc or the backdrop leave it as it was.
 */
@Component({
  selector: 'app-todo-dialog',
  template: `
    <dialog #dialog class="editor new-activity todo-editor" aria-labelledby="todo-title" (click)="onBackdrop($event)" (close)="closed.emit()">
      <header><div class="head-box"><div class="head-text">
        <p class="eyebrow">{{ i18n.t('capture.title') }}</p>
        <h2 id="todo-title" tabindex="-1" autofocus>{{ i18n.t(isNew() ? 'capture.new' : 'capture.task') }}</h2>
      </div></div></header>
      <label class="field">{{ i18n.t('task.name') }}
        <input #name type="text" [value]="title()" (input)="title.set($any($event.target).value)" (keydown.enter)="done()" /></label>
      <!-- Repeat: Mo Tu We Th Fr Sa Su (Gianni); with any day on, it repeats every week and the date is not used -->
      <div class="repeat-days" role="group" [attr.aria-label]="i18n.t('capture.repeat')">
        <span class="repeat-label">{{ i18n.t('capture.repeat') }}</span>
        @for (d of days; track d) {
          <button type="button" class="repeat-day" [class.on]="repeat().includes(d)" [attr.aria-pressed]="repeat().includes(d)"
                  [attr.aria-label]="i18n.t('day.' + d)" [title]="i18n.t('day.' + d)" (click)="toggleDay(d)">{{ i18n.t('dayMini.' + d) }}</button>
        }
      </div>
      <div class="row2">
        @if (!repeat().length) {
        <label class="field">{{ i18n.t('capture.day') }}
          <input type="date" [value]="date()" (input)="date.set($any($event.target).value)" /></label>
        }
        <label class="field">{{ i18n.t('capture.hour') }}
          <input type="time" step="60" [value]="time()" (input)="time.set($any($event.target).value)" /></label>
      </div>
      <p class="hint">{{ i18n.t('capture.anyHour') }}</p>
      <!-- a task can become an Activity (Gianni): its name goes to the Canvas's Free Space and the task leaves Capture -->
      <!-- with its minutes (Gianni): a new activity's hour by default, changed in the box beside the button -->
      @if (!isNew()) {
        <div class="to-activity-row">
          <button type="button" class="chip quiet to-activity" (click)="toActivity()">⇢ {{ i18n.t('capture.toActivity') }}</button>
          <label class="to-activity-min"><input type="number" inputmode="numeric" min="0" max="1440" [value]="activityMinutes()"
                 [attr.aria-label]="i18n.t('capture.activityMinutes')" (input)="activityMinutes.set(validMinutes($any($event.target).value))" />
            <span aria-hidden="true">min</span></label>
        </div>
      }
      @if (problem()) { <p class="app-error" role="alert">{{ problem() }}</p> }
      <footer>
        <button type="button" (click)="cancel()">{{ i18n.t('task.cancel') }}</button>
        <button type="button" class="primary" (click)="done()">{{ i18n.t('task.done') }}</button>
      </footer>
    </dialog>
  `,
})
export class TodoDialog implements AfterViewInit {
  protected readonly i18n = inject(I18n);
  readonly todo = input.required<Todo>();
  /** A new task (the Week board's + New): titled "New task"; the cursor stays out of the name box until it is tapped. */
  readonly isNew = input(false);
  readonly save = output<TodoSave>();
  readonly closed = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly title = signal('');
  protected readonly date = signal('');
  protected readonly time = signal('');
  protected readonly repeat = signal<Day[]>([]);
  protected readonly days = DAYS;
  /** A day on or off; kept in week order. */
  protected toggleDay(day: Day): void {
    const on = new Set(this.repeat());
    if (!on.delete(day)) on.add(day);
    this.repeat.set(DAYS.filter((d) => on.has(d)));
  }
  protected readonly problem = signal('');
  private leaving = false;

  ngAfterViewInit(): void {
    const todo = this.todo();
    this.title.set(todo.title);
    this.date.set(todo.date ?? '');
    this.time.set(todo.time ?? '');
    this.repeat.set([...todo.repeat]);
    openDialog(this.dialog().nativeElement);                             // no cursor in a box: the keyboard waits for a tap
  }

  protected onBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.dialog().nativeElement)) this.cancel();
  }

  protected cancel(): void {
    if (this.leaving) return;
    this.leaving = true;
    void closeDialog(this.dialog().nativeElement);
  }

  private readonly library = inject(LibraryStore);
  protected readonly activityMinutes = signal(NEW_TASK_MINUTES);
  protected readonly validMinutes = validMinutes;
  private readonly todos = inject(TodoStore);
  /** Convert to activity: asks first (the task leaves Capture), files the name and minutes in Free Space, then removes the task. */
  protected toActivity(): void {
    if (this.leaving) return;
    const todo = this.todo();
    const title = this.title().trim() || todo.title.trim();
    if (!title) { this.problem.set(this.i18n.t('task.nameRequired')); return; }
    if (!this.library.ready()) { this.problem.set(this.i18n.t('capture.toActivityWait')); return; }
    if (!confirm(this.i18n.t('capture.toActivityAsk', { task: title }))) return;
    const made = activityFromTodo(structuredClone(this.library.library()), title, todo.created, this.activityMinutes());
    // The Activity and the task's deletion go in one batch: both happen, or neither (a refused save keeps the task).
    if (!made || !this.library.save(made.lib, [], [`todos/${todo.id}`])) { this.problem.set(this.i18n.t('capture.toActivityWait')); return; }
    this.leaving = true;
    this.todos.forget(todo.id);
    void closeDialog(this.dialog().nativeElement);
  }

  protected done(): void {
    if (this.leaving) return;
    const title = this.title().trim();
    if (!title) { this.problem.set(this.i18n.t('task.nameRequired')); return; }
    const date = /^\d{4}-\d{2}-\d{2}$/.test(this.date()) ? this.date() : null;
    const time = parseClock(this.time()) !== null ? this.time() : null;
    this.leaving = true;
    this.save.emit({ id: this.todo().id, title, date, time, repeat: this.repeat() });
    void closeDialog(this.dialog().nativeElement);
  }
}
