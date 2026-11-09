import { AfterViewInit, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { isBackdropClick } from '../../core/dialog';
import { I18n } from '../../core/i18n';
import { Block, COLOR_CHOICES, DAYS, Day, Task, Week, fits, freeMinutes, validMinutes } from '../../core/week.model';

export interface TaskEdit {
  day: Day;
  blockId: string;
  task: Task;
  isNew: boolean;
}

export interface TaskSave {
  fromDay: Day;
  fromBlockId: string;
  day: Day;
  blockId: string;
  task: Task;
}

/**
 * The task details (Floating Canvas look): Delete on top, Cancel + Done below. Edits a draft:
 * nothing changes until Done, and Cancel (or Esc) leaves the task as it was.
 */
@Component({
  selector: 'app-task-dialog',
  template: `
    <dialog #dialog class="editor" aria-labelledby="task-dialog-title" (cancel)="$event.preventDefault(); cancel.emit()"
            (click)="onBackdrop($event)">
      <header>
        <div>
          <p class="eyebrow">{{ i18n.t('day.' + edit().day) }} · {{ blockName() }}</p>
          <h2 id="task-dialog-title" tabindex="-1" autofocus>{{ i18n.t(edit().isNew ? 'task.newTitle' : 'task.title') }}</h2>
        </div>
        <button type="button" class="danger" (click)="remove.emit()">{{ i18n.t('task.delete') }}</button>
      </header>

      <label class="field">{{ i18n.t('task.name') }}
        <input type="text" [value]="title()" (input)="title.set($any($event.target).value)" (keydown.enter)="done()" />
      </label>
      <label class="field">{{ i18n.t('task.minutes') }}
        <input type="number" inputmode="numeric" min="0" max="1440" [value]="minutes()" (input)="minutes.set(validMinutes($any($event.target).value))" />
      </label>
      <div class="row2">
        <label class="field">{{ i18n.t('task.day') }}
          <select (change)="pickDay($any($event.target).value)">
            @for (day of days; track day) { <option [value]="day" [selected]="day === day$()">{{ i18n.t('day.' + day) }}</option> }
          </select>
        </label>
        <label class="field">{{ i18n.t('task.block') }}
          <select (change)="blockId.set($any($event.target).value)">
            @for (block of blocks(); track block.id) { <option [value]="block.id" [selected]="block.id === blockId()">{{ block.name }}</option> }
            @if (!blocks().length) { <option value="" selected>{{ i18n.t('week.newBlock') }}</option> }
          </select>
        </label>
      </div>

      <div class="color-pick" role="group" [attr.aria-label]="i18n.t('task.color')">
        <span>{{ i18n.t('task.color') }}</span>
        <button type="button" class="swatch auto" [class.on]="!color()" [attr.aria-pressed]="!color()" (click)="color.set(null)">{{ i18n.t('task.auto') }}</button>
        @for (choice of colors; track choice.color) {
          <button type="button" class="swatch" [style.background]="choice.color" [class.on]="color() === choice.color"
                  [attr.aria-pressed]="color() === choice.color" [attr.aria-label]="i18n.t(choice.label)" [title]="i18n.t(choice.label)"
                  (click)="color.set(choice.color)"></button>
        }
      </div>

      <label class="switch-row">
        <input type="checkbox" role="switch" [checked]="active()" (change)="active.set($any($event.target).checked)" />
        <span>{{ i18n.t('task.active') }}</span>
      </label>

      @if (problem()) { <p class="app-error" role="alert">{{ problem() }}</p> }

      <footer>
        <button type="button" (click)="cancel.emit()">{{ i18n.t('task.cancel') }}</button>
        <button type="button" class="primary" (click)="done()">{{ i18n.t('task.done') }}</button>
      </footer>
    </dialog>
  `,
})
export class TaskDialog implements AfterViewInit {
  protected readonly i18n = inject(I18n);
  readonly edit = input.required<TaskEdit>();
  readonly week = input.required<Week>();
  readonly save = output<TaskSave>();
  readonly cancel = output<void>();
  readonly remove = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly days = DAYS;
  protected readonly colors = COLOR_CHOICES;
  protected readonly validMinutes = validMinutes;

  protected readonly title = signal('');
  protected readonly minutes = signal(0);
  protected readonly day$ = signal<Day>('MONDAY');
  protected readonly blockId = signal('');
  protected readonly color = signal<string | null>(null);
  protected readonly active = signal(true);
  protected readonly problem = signal('');

  protected readonly blocks = computed<Block[]>(() => this.week()[this.day$()].blocks);
  protected readonly blockName = computed(() => this.week()[this.edit().day].blocks.find((b) => b.id === this.edit().blockId)?.name ?? '');

  ngAfterViewInit(): void {
    const { day, blockId, task } = this.edit();
    this.title.set(task.title);
    this.minutes.set(task.minutes);
    this.day$.set(day);
    this.blockId.set(blockId);
    this.color.set(task.color);
    this.active.set(task.active);
    this.dialog().nativeElement.showModal();
  }

  protected pickDay(day: Day): void {
    this.day$.set(day);
    const blocks = this.week()[day].blocks;
    const same = blocks.find((b) => b.name === this.blockName());
    this.blockId.set(same?.id ?? blocks[0]?.id ?? '');
  }

  protected onBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.dialog().nativeElement)) this.cancel.emit();
  }

  protected done(): void {
    const title = this.title().trim();
    if (!title) {
      this.problem.set(this.i18n.t('task.nameRequired'));
      return;
    }
    const { day: fromDay, blockId: fromBlockId, task } = this.edit();
    const target = this.blocks().find((b) => b.id === this.blockId());
    if (target) {
      // Only the task as it is saved in the target block now (another tab may have changed it) gives its minutes back;
      // a + draft or a task moved from another block counts in full.
      const saved = target.tasks.find((t) => t.id === task.id);
      const extra = this.minutes() - (saved?.minutes ?? 0);
      if (extra > 0 && !fits(target, extra)) {
        this.problem.set(this.i18n.t('week.noRoom', { block: target.name, n: Math.max(0, freeMinutes(target) ?? 0) }));
        return;
      }
    }
    this.save.emit({
      fromDay,
      fromBlockId,
      day: this.day$(),
      blockId: this.blockId(),
      task: { ...task, title, minutes: this.minutes(), color: this.color(), active: this.active() },
    });
  }
}
