import { AfterViewInit, Component, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { closeDialog, isBackdropClick, openDialog } from '../../core/dialog';
import { I18n } from '../../core/i18n';
import { LibNode, Library, Where, WhereLevel, emptyWhere, nodeById, paperAge, pathOf, pickWhere, taskByTitle, tasksWithin, twinTask, whereOf } from '../../core/library.model';
import { ColorWindow } from '../../shared/color-window';
import { WhereCard } from '../../shared/where-card';
import { Block, DAYS, Day, Task, Week, fits, freeMinutes, validMinutes } from '../../core/week.model';


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
    <dialog #dialog class="editor" [class.new-block]="newBlock()" [class.new-activity]="edit().isNew && !newBlock()" aria-labelledby="task-dialog-title" (cancel)="$event.preventDefault(); leave()"
            (click)="onBackdrop($event)">
      <!-- One box across the whole width: the level being made (coloured for a new Block or Activity) with Delete inside it -->
      <header>
        <div class="head-box">
          <div class="head-text">
            <p class="eyebrow">{{ i18n.t('day.' + edit().day) }} · {{ blockName() }}</p>
            <h2 id="task-dialog-title" tabindex="-1" autofocus>{{ i18n.t(newBlock() ? 'task.newBlockTitle' : edit().isNew ? 'task.newTitle' : 'task.title') }}</h2>
          </div>
          <!-- Active, at the top where Delete used to be (Gianni) -->
          <label class="switch-row head-switch">
            <input type="checkbox" role="switch" [checked]="active()" (change)="active.set($any($event.target).checked)" />
            <span>{{ i18n.t('task.active') }}</span>
          </label>
        </div>
      </header>

      <!-- Day and Block first, then the card that shows (and chooses) where the activity lives -->
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

      @if (libraryReady()) {
        <!-- Where: the card is the chooser (tap a level), as in the Canvas (shared with Capture's editor) -->
        <app-where-card [library]="library()" [where]="where()" [title]="title()" [color]="color()" (pick)="pick($event.level, $event.id)" />
        <div class="exist-row">
        <label class="field">{{ i18n.t('task.existing') }}
          @if (linkedNode(); as node) {
            <span class="linked-chip" [style.background]="color() || node.color || '#ffd5bd'">{{ node.title }}
              <button type="button" [attr.aria-label]="i18n.t('task.unlink')" [title]="i18n.t('task.unlink')" (click)="unlink(name)">×</button></span>
          } @else if (existing().length) {
            <button type="button" class="pick-open" (click)="openPicker()">{{ i18n.t('task.pickActivity', { n: existing().length }) }} ›</button>
          } @else {
            <span class="hint">{{ i18n.t('task.noTasksHere') }}</span>
          }
        </label>
        <!-- Colour: this button opens a small window with the colours; choosing one closes it -->
        <button type="button" class="color-open" aria-haspopup="dialog" [attr.aria-label]="i18n.t('task.color')" [title]="i18n.t('task.color')"
                (click)="colorWindow.open()"><span class="color-dot" [class.auto]="!color()" [style.background]="color()"></span>{{ i18n.t('task.color') }}</button>
        </div>
      }
      <label class="field">{{ i18n.t('task.name') }}
        <input #name type="text" [value]="title()" [readOnly]="!!linkedNode()" [class.locked]="!!linkedNode()"
          (input)="title.set($any($event.target).value)" (keydown.enter)="done()" />
        @if (twin()) { <span class="hint">{{ i18n.t('task.alreadyExists') }}</span> }
      </label>
      <!-- Minutes under the name (Gianni): quick choices 1, 5 … 45 as radio buttons, then a box for any other value, on one line -->
      <fieldset class="field minutes-pick">
        <legend>{{ i18n.t('task.minutes') }}</legend>
        <div class="min-row" role="radiogroup" [attr.aria-label]="i18n.t('task.minutes')">
          @for (m of quickMinutes; track m) {
            <label class="min-chip" [class.on]="minutes() === m">
              <input type="radio" name="task-minutes" [value]="m" [checked]="minutes() === m" (change)="minutes.set(m)" />{{ m }}</label>
          }
          <input class="min-other" type="number" inputmode="numeric" min="0" max="1440" [value]="minutes()"
                 [attr.aria-label]="i18n.t('task.minutesOther')" (input)="minutes.set(validMinutes($any($event.target).value))" />
        </div>
      </fieldset>
      @if (problem()) { <p class="app-error" role="alert">{{ problem() }}</p> }

      <footer>
        <button type="button" (click)="leave()">{{ i18n.t('task.cancel') }}</button>
        <button type="button" class="primary" (click)="done()">{{ i18n.t('task.done') }}</button>
      </footer>
    </dialog>

    <app-color-window #colorWindow [color]="color()" (picked)="pickColor($event)" />

    <!-- Existing activities, each drawn as in the Canvas: the Epic (plum), its Feature (yellow jelly), its Story (cream)
         and the Activity itself (its pastel) at the bottom. The Where filters above shorten the list. -->
    <dialog #picker class="editor activity-picker" aria-labelledby="picker-title" (click)="onPickerBackdrop($event)">
      <header>
        <h2 id="picker-title">{{ i18n.t('task.pickTitle') }}</h2>
        <button type="button" class="pick-close" [attr.aria-label]="i18n.t('nav.close')" (click)="closePicker()">×</button>
      </header>
      <input class="pick-search" type="search" [placeholder]="i18n.t('task.pickSearch')" [attr.aria-label]="i18n.t('task.pickSearch')"
        [value]="pickQuery()" (input)="pickQuery.set($any($event.target).value)" />
      @if (!pickCards().length) { <p class="hint">{{ i18n.t('task.noTasksHere') }}</p> }
      <ul class="pick-list">
        @for (option of pickCards(); track option.node.id) {
          <li><div class="pick-card">
            <!-- Picking needs its own button (Gianni: a tap anywhere on the card was too sensitive) -->
            <button type="button" class="pick-choose" [attr.aria-label]="i18n.t('task.choose') + ': ' + option.node.title" (click)="pickActivity(option.node.id)">{{ i18n.t('task.choose') }}</button>
            @if (option.epic) {
              <span class="pc-epic"><small>{{ i18n.t('canvas.epic') }}</small><strong>@for (part of hits(option.epic); track $index) { @if (part.hit) { <mark>{{ part.t }}</mark> } @else { {{ part.t }} } }</strong></span>
            } @else {
              <span class="pc-epic pc-free"><small>{{ i18n.t('canvas.freeSpace') }}</small></span>
            }
            <span class="pc-nest">
              @if (option.story) {
                <span class="pc-feature"><small>{{ i18n.t('canvas.feature') }}</small><strong>@for (part of hits(option.feature); track $index) { @if (part.hit) { <mark>{{ part.t }}</mark> } @else { {{ part.t }} } }</strong>
                  <span class="pc-story"><small>{{ i18n.t('canvas.story') }}</small><strong>@for (part of hits(option.story); track $index) { @if (part.hit) { <mark>{{ part.t }}</mark> } @else { {{ part.t }} } }</strong>
                    <span class="pc-activity" [style.background]="option.paper === null ? option.tone : null" [attr.data-paper]="option.paper">
                      <small>{{ i18n.t('canvas.task') }}</small><strong>@for (part of hits(option.node.title); track $index) { @if (part.hit) { <mark>{{ part.t }}</mark> } @else { {{ part.t }} } }</strong></span>
                  </span>
                </span>
              } @else {
                <span class="pc-activity" [style.background]="option.paper === null ? option.tone : null" [attr.data-paper]="option.paper">
                  <small>{{ i18n.t('canvas.task') }}</small><strong>@for (part of hits(option.node.title); track $index) { @if (part.hit) { <mark>{{ part.t }}</mark> } @else { {{ part.t }} } }</strong></span>
              }
            </span>
          </div></li>
        }
      </ul>
    </dialog>
  `,
  imports: [WhereCard, ColorWindow],
})
export class TaskDialog implements AfterViewInit {
  protected readonly i18n = inject(I18n);
  readonly edit = input.required<TaskEdit>();
  readonly week = input.required<Week>();
  readonly library = input.required<Library>();
  /** The saved library has arrived: the Where and the Existing task show only then (a task is filed on Done). */
  readonly libraryReady = input(false);
  /** Opened by a day's +: it creates a new block with its first activity, so the window is block yellow (Gianni). */
  readonly newBlock = input(false);
  readonly save = output<TaskSave>();
  readonly cancel = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly picker = viewChild.required<ElementRef<HTMLDialogElement>>('picker');
  /** Closing (shrinking away): further presses are ignored, so a double click never saves or leaves twice. */
  private leaving = false;
  protected readonly days = DAYS;
  protected readonly validMinutes = validMinutes;

  protected readonly title = signal('');
  protected readonly minutes = signal(0);
  /** The quick choices under the name (Gianni); any other value goes in the box after them. */
  protected readonly quickMinutes = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45];
  protected readonly day$ = signal<Day>('MONDAY');
  protected readonly blockId = signal('');
  protected readonly color = signal<string | null>(null);
  protected readonly active = signal(true);
  protected readonly problem = signal('');
  protected readonly where = signal<Where>(emptyWhere());
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
  /** The same activities as cards for the picker: Epic › Feature › Story › Activity, each with its Canvas colour. */
  protected readonly pickQuery = signal('');
  protected readonly pickCards = computed(() => {
    const lib = this.library();
    const now = Date.now();
    const words = this.pickQuery().toLowerCase().split(/\s+/).filter(Boolean);
    return this.existing().map(({ node }) => {
      const path = pathOf(lib, node.id).slice(0, -1);
      const of = (kind: string) => path.find((n) => n.kind === kind)?.title ?? '';
      return { node, epic: of('epic'), feature: of('feature'), story: of('story'), tone: node.color || '#ffd5bd', paper: paperAge(node, now) };
    }).filter((c) => {
      // The search box matches every word anywhere in the card: activity, story, feature or epic.
      const text = [c.node.title, c.story, c.feature, c.epic].join(' ').toLowerCase();
      return words.every((w) => text.includes(w));
    });
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

  /** A colour chosen in the colour window (which closes itself). */
  protected pickColor(color: string | null): void {
    this.color.set(color);
    this.colorPicked.set(true);
  }

  /** Choosing a level empties the ones below (a level with one choice is chosen for you); a link is kept only while it is still inside. */
  protected pick(level: WhereLevel, id: string): void {
    this.where.set(pickWhere(this.library(), this.where(), level, id));
    const node = this.linkedNode();
    const w = this.where();
    const deepest = w.story || w.feature || w.epic || w.area;
    if (node && !(deepest ? pathOf(this.library(), node.id).some((n) => n.id === deepest) && (!w.story || node.parentId === w.story) : node.parentId === null)) {
      this.linked.set('');                                                   // another place: the name box names a task there
    }
  }

  /** A title cut into the parts the search box matches (shown highlighted) and the rest. */
  protected hits(text: string): { t: string; hit: boolean }[] {
    const words = this.pickQuery().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length || !text) return [{ t: text, hit: false }];
    const lower = text.toLowerCase();
    const marked = new Array<boolean>(text.length).fill(false);
    for (const w of words) for (let i = lower.indexOf(w); i >= 0; i = lower.indexOf(w, i + 1)) marked.fill(true, i, i + w.length);
    const parts: { t: string; hit: boolean }[] = [];
    for (let i = 0; i < text.length; i++) {
      const last = parts[parts.length - 1];
      if (last && last.hit === marked[i]) last.t += text[i]; else parts.push({ t: text[i], hit: marked[i] });
    }
    return parts;
  }

  protected openPicker(): void {
    this.pickQuery.set('');
    openDialog(this.picker().nativeElement);
  }
  protected closePicker(): void {
    void closeDialog(this.picker().nativeElement);
  }
  protected onPickerBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.picker().nativeElement)) this.closePicker();
  }
  /** A card picked: the details link to that activity, and the list shrinks back into the button. */
  protected pickActivity(id: string): void {
    void closeDialog(this.picker().nativeElement).then(() => this.useLibraryTask(id));
  }

  protected useLibraryTask(id: string): void {
    const node = nodeById(this.library(), id);
    if (node) this.link(node);
  }

  private link(node: LibNode): void {
    this.linked.set(node.id);
    this.title.set(node.title);
    if (!this.colorPicked()) this.color.set(node.color);
    this.where.set(whereOf(this.library(), node.id));
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
    if (this.leaving) return;
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
    this.leaving = true;
    void closeDialog(this.dialog().nativeElement).then(() => this.save.emit(save));
  }

  /** Cancel, Esc or the backdrop: the window shrinks back to where it came from, then the draft is dropped. */
  protected leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    void closeDialog(this.dialog().nativeElement).then(() => this.cancel.emit());
  }

  /** Delete (asks first for a saved task; a + task was never saved), then closes smoothly. */
}
