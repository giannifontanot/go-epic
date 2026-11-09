import { AfterViewInit, Component, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { closeDialog, isBackdropClick, openDialog } from '../../core/dialog';
import { I18n } from '../../core/i18n';
import { Kind, LibNode, Library, nodeById, pathOf, taskByTitle, tasksWithin, twinTask } from '../../core/library.model';
import { Block, COLOR_CHOICES, DAYS, Day, Task, Week, fits, freeMinutes, validMinutes } from '../../core/week.model';

type Level = 'area' | 'epic' | 'feature' | 'story';
const LEVELS: Level[] = ['area', 'epic', 'feature', 'story'];

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
  /** Where the task is filed in the library: its user story, or null (Free Space). */
  parentId: string | null;
  /** The colour was chosen in these details (else a reused library task keeps its own). */
  colorPicked: boolean;
}

/**
 * The task details (Floating Canvas look): Delete on top, Cancel + Done below. Edits a draft:
 * nothing changes until Done, and Cancel (or Esc) leaves the task as it was.
 */
@Component({
  selector: 'app-task-dialog',
  template: `
    <dialog #dialog class="editor" aria-labelledby="task-dialog-title" (cancel)="$event.preventDefault(); leave()"
            (click)="onBackdrop($event)">
      <header>
        <div>
          <p class="eyebrow">{{ i18n.t('day.' + edit().day) }} · {{ blockName() }}</p>
          <h2 id="task-dialog-title" tabindex="-1" autofocus>{{ i18n.t(edit().isNew ? 'task.newTitle' : 'task.title') }}</h2>
        </div>
        <button type="button" class="danger" (click)="askRemove()">{{ i18n.t('task.delete') }}</button>
      </header>

      @if (libraryReady()) {
        <fieldset class="where"><legend>{{ i18n.t('task.where') }}</legend>
          @for (level of levels; track level; let i = $index) {
            @if (i === 0 || where()[levels[i - 1]]) {
              <label>{{ i18n.t('canvas.' + level) }}
                <select (change)="pick(level, $any($event.target).value)">
                  <option value="" [selected]="!where()[level]">{{ i18n.t(i === 0 ? 'canvas.freeSpace' : 'task.none') }}</option>
                  @for (option of options(level); track option.id) { <option [value]="option.id" [selected]="option.id === where()[level]">{{ option.title }}</option> }
                </select></label>
            }
          }
          @if (!where().story) { <p class="hint">{{ i18n.t('task.freeHint') }}</p> }
        </fieldset>
        <label class="field">{{ i18n.t('task.existing') }}
          @if (linkedNode(); as node) {
            <span class="linked-chip" [style.background]="color() || node.color || '#ffd5bd'">{{ node.title }}
              <button type="button" [attr.aria-label]="i18n.t('task.unlink')" [title]="i18n.t('task.unlink')" (click)="unlink(name)">×</button></span>
          } @else if (existing().length) {
            <select (change)="useLibraryTask($any($event.target).value)">
              <option value="" selected>{{ i18n.t('canvas.choose') }}</option>
              @for (option of existing(); track option.node.id) { <option [value]="option.node.id">{{ option.label }}</option> }
            </select>
          } @else {
            <span class="hint">{{ i18n.t('task.noTasksHere') }}</span>
          }
        </label>
      }
      <label class="field">{{ i18n.t('task.name') }}
        <input #name type="text" [value]="title()" [readOnly]="!!linkedNode()" [class.locked]="!!linkedNode()"
          (input)="title.set($any($event.target).value)" (keydown.enter)="done()" />
        @if (twin()) { <span class="hint">{{ i18n.t('task.alreadyExists') }}</span> }
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
        <button type="button" class="swatch auto" [class.on]="!color()" [attr.aria-pressed]="!color()" (click)="pickColor(null)">{{ i18n.t('task.auto') }}</button>
        @for (choice of colors; track choice.color) {
          <button type="button" class="swatch" [style.background]="choice.color" [class.on]="color() === choice.color"
                  [attr.aria-pressed]="color() === choice.color" [attr.aria-label]="i18n.t(choice.label)" [title]="i18n.t(choice.label)"
                  (click)="pickColor(choice.color)"></button>
        }
      </div>

      <label class="switch-row">
        <input type="checkbox" role="switch" [checked]="active()" (change)="active.set($any($event.target).checked)" />
        <span>{{ i18n.t('task.active') }}</span>
      </label>

      @if (problem()) { <p class="app-error" role="alert">{{ problem() }}</p> }

      <footer>
        <button type="button" (click)="leave()">{{ i18n.t('task.cancel') }}</button>
        <button type="button" class="primary" (click)="done()">{{ i18n.t('task.done') }}</button>
      </footer>
    </dialog>
  `,
})
export class TaskDialog implements AfterViewInit {
  protected readonly i18n = inject(I18n);
  readonly edit = input.required<TaskEdit>();
  readonly week = input.required<Week>();
  readonly library = input.required<Library>();
  /** The saved library has arrived: the Where and the Existing task show only then (a task is filed on Done). */
  readonly libraryReady = input(false);
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
  protected readonly levels = LEVELS;
  protected readonly where = signal<Record<Level, string>>({ area: '', epic: '', feature: '', story: '' });
  /** The library task these details are linked to ('' = a new one, named in the name box). */
  protected readonly linked = signal('');
  private readonly colorPicked = signal(false);
  private viewReady = false;
  private libraryLinked = false;

  constructor() {
    // Opened before the library arrived: link to the task's library task as soon as it does.
    effect(() => {
      if (this.libraryReady() && this.viewReady) untracked(() => this.linkFromLibrary());
    });
  }

  protected readonly linkedNode = computed(() => {
    const node = nodeById(this.library(), this.linked());
    return node?.kind === 'task' ? node : undefined;
  });
  /** The library tasks under the deepest level chosen (all of them when none is). */
  protected readonly existing = computed(() => {
    const lib = this.library();
    const w = this.where();
    const within = w.story || w.feature || w.epic || w.area;
    const tasks = tasksWithin(lib, within);
    const titles = new Map<string, number>();
    for (const t of tasks) titles.set(t.title.toLowerCase(), (titles.get(t.title.toLowerCase()) ?? 0) + 1);
    return tasks
      .map((node) => {
        const path = pathOf(lib, node.id).slice(0, -1);
        const story = path[path.length - 1]?.title ?? this.i18n.t('canvas.freeSpace');
        const where = (titles.get(node.title.toLowerCase()) ?? 0) > 1 ? path.map((n) => n.title).join(' › ') || story : story;
        return { node, label: w.story ? node.title : `${node.title} · ${where}` };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  });
  /** A typed name that already exists in the chosen story (or Free Space): Done links to it. */
  protected readonly twin = computed(() => (this.linkedNode() ? undefined : twinTask(this.library(), this.title(), this.where().story || null)));

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
    this.viewReady = true;
    if (this.libraryReady()) this.linkFromLibrary();
    openDialog(this.dialog().nativeElement, { escape: false });          // Esc = Cancel (leave), handled above
  }

  /** Linked to its library task (or, for an older task with none, to the only library task of that name); once. */
  private linkFromLibrary(): void {
    if (this.libraryLinked) return;
    this.libraryLinked = true;
    const task = this.edit().task;
    const lib = this.library();
    const own = nodeById(lib, task.ref);
    const byName = task.title.trim() ? taskByTitle(lib, task.title) : undefined;
    const unique = byName && lib.nodes.filter((n) => n.kind === 'task' && n.title.trim().toLowerCase() === byName.title.trim().toLowerCase()).length === 1;
    const node = own?.kind === 'task' ? own : unique ? byName : undefined;
    if (node && !this.linked()) this.link(node);
  }

  protected pickColor(color: string | null): void {
    this.color.set(color);
    this.colorPicked.set(true);
  }

  protected options(level: Level): LibNode[] {
    const lib = this.library();
    const index = LEVELS.indexOf(level);
    const parent = index === 0 ? null : this.where()[LEVELS[index - 1]];
    if (index > 0 && !parent) return [];
    return lib.nodes.filter((n) => n.kind === (level as Kind) && n.parentId === parent);
  }

  /** Choosing a level empties the ones below (a level with one choice is chosen for you); a link is kept only while it is still inside. */
  protected pick(level: Level, id: string): void {
    const next = { ...this.where(), [level]: id };
    const from = LEVELS.indexOf(level) + 1;
    for (const below of LEVELS.slice(from)) next[below] = '';
    this.where.set(next);
    if (id) {
      for (const below of LEVELS.slice(from)) {
        const options = this.options(below);
        if (options.length !== 1) break;
        this.where.update((w) => ({ ...w, [below]: options[0].id }));
      }
    }
    const node = this.linkedNode();
    const w = this.where();
    const deepest = w.story || w.feature || w.epic || w.area;
    if (node && !(deepest ? pathOf(this.library(), node.id).some((n) => n.id === deepest) && (!w.story || node.parentId === w.story) : node.parentId === null)) {
      this.linked.set('');                                                   // another place: the name box names a task there
    }
  }

  protected useLibraryTask(id: string): void {
    const node = nodeById(this.library(), id);
    if (node) this.link(node);
  }

  private link(node: LibNode): void {
    this.linked.set(node.id);
    this.title.set(node.title);
    if (!this.colorPicked()) this.color.set(node.color);
    const where: Record<Level, string> = { area: '', epic: '', feature: '', story: '' };
    for (const n of pathOf(this.library(), node.id)) if (n.kind !== 'task') where[n.kind as Level] = n.id;
    this.where.set(where);
  }

  /** × on the linked chip: back to a new task (empty name, the Where kept). */
  protected unlink(input: HTMLInputElement): void {
    this.linked.set('');
    this.title.set('');
    queueMicrotask(() => input.focus());
  }

  protected pickDay(day: Day): void {
    this.day$.set(day);
    const blocks = this.week()[day].blocks;
    const same = blocks.find((b) => b.name === this.blockName());
    this.blockId.set(same?.id ?? blocks[0]?.id ?? '');
  }

  protected onBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.dialog().nativeElement)) this.leave();
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
    const save: TaskSave = {
      fromDay,
      fromBlockId,
      day: this.day$(),
      blockId: this.blockId(),
      task: { ...task, title, minutes: this.minutes(), color: this.color(), active: this.active(), ref: this.linkedNode()?.id ?? this.twin()?.id ?? (this.libraryReady() ? null : task.ref) },
      parentId: this.where().story || null,
      colorPicked: this.colorPicked(),
    };
    void closeDialog(this.dialog().nativeElement).then(() => this.save.emit(save));
  }

  /** Cancel, Esc or the backdrop: the window shrinks back to where it came from, then the draft is dropped. */
  protected leave(): void {
    void closeDialog(this.dialog().nativeElement).then(() => this.cancel.emit());
  }

  /** Delete (asks first for a saved task; a + task was never saved), then closes smoothly. */
  protected askRemove(): void {
    const { task, isNew } = this.edit();
    if (!isNew && !confirm(this.i18n.t('week.confirmDeleteTask', { task: task.title }))) return;
    void closeDialog(this.dialog().nativeElement).then(() => this.remove.emit());
  }
}
