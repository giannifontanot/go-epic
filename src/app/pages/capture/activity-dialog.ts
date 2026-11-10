import { AfterViewInit, Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { closeDialog, isBackdropClick, openDialog } from '../../core/dialog';
import { I18n } from '../../core/i18n';
import { LibNode, Library, Where, WhereLevel, emptyWhere, pickWhere, whereOf } from '../../core/library.model';
import { ColorWindow } from '../../shared/color-window';
import { WhereCard } from '../../shared/where-card';

export interface ActivitySave {
  id: string;
  title: string;
  color: string | null;
  /** The story it is filed in, or null (it stays in Free Space). */
  parentId: string | null;
}

/**
 * Capture's ✎: a captured idea edited as an Activity (Gianni), with the same look as the Week's details: the Where card
 * (tap a level to file it in a Story; without one it waits in Free Space), the name and the colour window.
 * Nothing changes until Done; Cancel, Esc or the backdrop leave it as it was.
 */
@Component({
  selector: 'app-activity-dialog',
  template: `
    <dialog #dialog class="editor new-activity" aria-labelledby="activity-title" (click)="onBackdrop($event)" (close)="closed.emit()">
      <header>
        <div class="head-box">
          <div class="head-text">
            <p class="eyebrow">{{ i18n.t('capture.title') }} · {{ i18n.t('canvas.freeSpace') }}</p>
            <h2 id="activity-title" tabindex="-1" autofocus>{{ i18n.t('canvas.task') }}</h2>
          </div>
        </div>
      </header>
      <app-where-card [library]="library()" [where]="where()" [title]="title()" [color]="color()" (pick)="pick($event.level, $event.id)" />
      <label class="field">{{ i18n.t('task.name') }}
        <input type="text" [value]="title()" (input)="title.set($any($event.target).value)" (keydown.enter)="done()" />
      </label>
      <button type="button" class="color-open" aria-haspopup="dialog" [attr.aria-label]="i18n.t('task.color')" [title]="i18n.t('task.color')"
              (click)="colorWindow.open()"><span class="color-dot" [class.auto]="!color()" [style.background]="color()"></span>{{ i18n.t('task.color') }}</button>
      @if (problem()) { <p class="app-error" role="alert">{{ problem() }}</p> }
      <footer>
        <button type="button" (click)="cancel()">{{ i18n.t('task.cancel') }}</button>
        <button type="button" class="primary" (click)="done()">{{ i18n.t('task.done') }}</button>
      </footer>
    </dialog>
    <app-color-window #colorWindow [color]="color()" (picked)="color.set($event)" />
  `,
  imports: [WhereCard, ColorWindow],
})
export class ActivityDialog implements AfterViewInit {
  protected readonly i18n = inject(I18n);
  readonly task = input.required<LibNode>();
  readonly library = input.required<Library>();
  readonly save = output<ActivitySave>();
  /** The window has closed (after Done, Cancel, Esc or a backdrop click). */
  readonly closed = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly title = signal('');
  protected readonly color = signal<string | null>(null);
  protected readonly where = signal<Where>(emptyWhere());
  protected readonly problem = signal('');
  private leaving = false;

  ngAfterViewInit(): void {
    const task = this.task();
    this.title.set(task.title);
    this.color.set(task.color);
    this.where.set(whereOf(this.library(), task.id));
    openDialog(this.dialog().nativeElement);
  }

  protected pick(level: WhereLevel, id: string): void {
    this.where.set(pickWhere(this.library(), this.where(), level, id));
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
    if (!title) {
      this.problem.set(this.i18n.t('task.nameRequired'));
      return;
    }
    this.leaving = true;
    this.save.emit({ id: this.task().id, title, color: this.color(), parentId: this.where().story || null });
    void closeDialog(this.dialog().nativeElement);
  }
}
