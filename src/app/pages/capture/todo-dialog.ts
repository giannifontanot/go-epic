import { AfterViewInit, Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { closeDialog, isBackdropClick, openDialog } from '../../core/dialog';
import { I18n } from '../../core/i18n';
import { Todo } from '../../core/todo.model';
import { parseClock } from '../../core/week.model';

export interface TodoSave { id: string; title: string; date: string | null; time: string | null; }

/**
 * Capture's ✎: a task's name, day and hour (the hour is optional: empty = any time that day). Nothing changes until
 * Done; Cancel, Esc or the backdrop leave it as it was.
 */
@Component({
  selector: 'app-todo-dialog',
  template: `
    <dialog #dialog class="editor new-activity todo-editor" aria-labelledby="todo-title" (click)="onBackdrop($event)" (close)="closed.emit()">
      <header><div class="head-box"><div class="head-text">
        <p class="eyebrow">{{ i18n.t('capture.title') }}</p>
        <h2 id="todo-title" tabindex="-1" autofocus>{{ i18n.t('capture.task') }}</h2>
      </div></div></header>
      <label class="field">{{ i18n.t('task.name') }}
        <input type="text" [value]="title()" (input)="title.set($any($event.target).value)" (keydown.enter)="done()" /></label>
      <div class="row2">
        <label class="field">{{ i18n.t('capture.day') }}
          <input type="date" [value]="date()" (input)="date.set($any($event.target).value)" /></label>
        <label class="field">{{ i18n.t('capture.hour') }}
          <input type="time" step="60" [value]="time()" (input)="time.set($any($event.target).value)" /></label>
      </div>
      <p class="hint">{{ i18n.t('capture.anyHour') }}</p>
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
  readonly save = output<TodoSave>();
  readonly closed = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly title = signal('');
  protected readonly date = signal('');
  protected readonly time = signal('');
  protected readonly problem = signal('');
  private leaving = false;

  ngAfterViewInit(): void {
    const todo = this.todo();
    this.title.set(todo.title);
    this.date.set(todo.date ?? '');
    this.time.set(todo.time ?? '');
    openDialog(this.dialog().nativeElement);
  }

  protected onBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.dialog().nativeElement)) this.cancel();
  }

  protected cancel(): void {
    if (this.leaving) return;
    this.leaving = true;
    void closeDialog(this.dialog().nativeElement);
  }

  protected done(): void {
    if (this.leaving) return;
    const title = this.title().trim();
    if (!title) { this.problem.set(this.i18n.t('task.nameRequired')); return; }
    const date = /^\d{4}-\d{2}-\d{2}$/.test(this.date()) ? this.date() : null;
    const time = parseClock(this.time()) !== null ? this.time() : null;
    this.leaving = true;
    this.save.emit({ id: this.todo().id, title, date, time });
    void closeDialog(this.dialog().nativeElement);
  }
}
