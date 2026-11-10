import { Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { closeDialog, isBackdropClick, openDialog } from '../../core/dialog';
import { I18n } from '../../core/i18n';
import { LibNode, addNode, inboxTasks, moveNode, newNodeId, nodeById, paperAge, placeLabel, removeNode, updateNode } from '../../core/library.model';
import { LibraryStore } from '../../core/library.store';
import { DAYS, Task, blockColors } from '../../core/week.model';
import { WeekStore } from '../../core/week.store';
import { ActivityDialog, ActivitySave } from './activity-dialog';
import { CaptureUi } from './capture-ui';

/**
 * Capture = the quick way into Free Space (GTD: one inbox). The floating ✎ (or the menu's Capture) opens the panel
 * with the cursor in the box: type and press Enter, as many times as you like. Every idea is a task in the
 * Canvas's Free Space (no story yet). The panel lists those tasks, newest first, each on its own colour in a white box:
 * edit (tap the text or ✎) or delete (✕, asks first). Placing it in a story is done in the Canvas. The Week's "Existing task" picker also offers them.
 */
@Component({
  selector: 'app-capture-panel',
  template: `
    @if (ui.fab(); as fab) {
      @if (!fab.hidden) { <button type="button" class="capture-fab" [attr.aria-label]="fab.label" [title]="fab.label" (click)="fab.run()">✎</button> }
    } @else {
      <button type="button" class="capture-fab" [attr.aria-label]="i18n.t('capture.open')" [title]="i18n.t('capture.open')"
        (click)="ui.open.set(true)">✎</button>
    }
    <dialog #panel class="capture-panel" aria-labelledby="capture-title" (click)="onBackdrop($event)" (close)="unfollow?.(); ui.open.set(false)">
      <header>
        <h2 id="capture-title">{{ i18n.t('capture.title') }}</h2>
        <button type="button" class="drawer-close" [attr.aria-label]="i18n.t('nav.close')" (click)="close()">×</button>
      </header>
      <form class="capture-add" (submit)="$event.preventDefault(); add(input)">
        <input #input type="text" enterkeyhint="send" autocomplete="off" [placeholder]="i18n.t('capture.placeholder')"
          [attr.aria-label]="i18n.t('capture.placeholder')" [disabled]="!library.ready()" />
        <button type="submit" class="primary" [disabled]="!library.ready()">{{ i18n.t('capture.add') }}</button>
      </form>
      <p class="hint">{{ message() || i18n.t('capture.inboxHint') }}</p>
      @if (library.error()) { <p class="app-error" role="alert">{{ i18n.t('saveFailed') }}: {{ library.error() }}</p> }
      <ul class="capture-list">
        @for (task of inbox(); track task.id) {
          <li [attr.data-paper]="paper(task) ?? 0" [style.--tone]="tones().get(task.id)">
            @if (editing() === task.id) {
              <input class="c-edit" type="text" [value]="task.title" [attr.aria-label]="i18n.t('capture.edit')"
                (keydown.enter)="$event.preventDefault(); saveEdit(task, $any($event.target).value)"
                (keydown.escape)="$event.stopPropagation(); editing.set('')" (blur)="saveEdit(task, $any($event.target).value)" />
            } @else {
              <button type="button" class="c-text" [disabled]="!canChange()" [attr.aria-label]="i18n.t('capture.edit') + ': ' + task.title" (click)="startEdit(task)">{{ task.title }}</button>
            }
            <button type="button" class="c-icon" [disabled]="!canChange()" [attr.aria-label]="i18n.t('capture.edit') + ': ' + task.title" [title]="i18n.t('capture.edit')"
              (click)="openActivity(task)">✎</button>
            <button type="button" class="c-icon" [disabled]="!canChange()" [attr.aria-label]="i18n.t('capture.delete')" [title]="i18n.t('capture.delete')"
              (click)="remove(task)">✕</button>
          </li>
        } @empty {
          <li class="c-empty">{{ i18n.t(library.ready() ? 'capture.empty' : 'loading') }}</li>
        }
      </ul>
    </dialog>
    @if (activity(); as task) {
      <app-activity-dialog [task]="task" [library]="library.library()" (save)="saveActivity($event)" (closed)="activity.set(null)" />
    }
  `,
  imports: [ActivityDialog],
})
export class CapturePanel {
  protected readonly i18n = inject(I18n);
  protected readonly ui = inject(CaptureUi);
  protected readonly library = inject(LibraryStore);
  private readonly week = inject(WeekStore);
  private readonly panel = viewChild.required<ElementRef<HTMLDialogElement>>('panel');
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  /** Renaming and deleting reach the week's cards: they wait until the library and all seven days are loaded. */
  protected readonly canChange = computed(() => this.library.ready() && this.week.loaded());
  protected readonly inbox = computed(() => inboxTasks(this.library.library()));
  /** Each idea has its colour (its own, else the automatic pastel, never like the one above), as in the Canvas. */
  protected readonly tones = computed(() => {
    const inbox = this.inbox();
    const colors = blockColors(inbox as unknown as Task[]);
    return new Map(inbox.map((t, i) => [t.id, colors[i]]));
  });
  protected readonly editing = signal('');
  protected readonly message = signal('');

  constructor() {
    // Open / closed follows the shared flag (the ✎ and the menu both set it); the dialog grows from the press point
    // and the cursor goes straight to the box, so writing an idea is one tap away.
    effect(() => {
      const open = this.ui.open();
      untracked(() => {
        const d = this.panel().nativeElement;
        if (open && !d.open) {
          this.message.set('');
          this.followViewport(d);
          openDialog(d);
          queueMicrotask(() => this.input().nativeElement.focus({ preventScroll: true }));   // no page jump while it grows
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
   * top of what is visible and never taller than it, so the box and the newest ideas are never under the keyboard.
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

  /** How old this idea's paper looks: a captured idea left alone turns to parchment, then old stained paper. */
  protected paper(task: LibNode): 0 | 1 | 2 | null {
    return paperAge(task, this.week.now().getTime());
  }

  protected close(): void {
    this.ui.open.set(false);
  }

  protected onBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.panel().nativeElement)) this.close();
  }

  /** Enter: a new task in Free Space; the box empties and keeps the cursor for the next idea. */
  protected add(input: HTMLInputElement): void {
    const title = input.value.trim();
    if (!title) return;
    const added = this.library.update((lib) => addNode(lib, { id: newNodeId(), kind: 'task', title, parentId: null, color: null, created: Date.now() }));
    if (!added) return;
    input.value = '';
    this.message.set('');
    input.focus();
  }

  protected startEdit(task: LibNode): void {
    if (!this.canChange()) return;
    this.editing.set(task.id);
    queueMicrotask(() => this.panel().nativeElement.querySelector<HTMLInputElement>('.c-edit')?.focus());
  }

  /** ✎: the idea opens as an Activity (Where, name, colour), not just its name (Gianni). */
  protected readonly activity = signal<LibNode | null>(null);
  protected openActivity(task: LibNode): void {
    if (this.canChange()) this.activity.set(task);
  }

  /** Done in the activity editor: name and colour (its week cards follow), and filed in a Story when one was chosen. */
  protected saveActivity(change: ActivitySave): void {
    const before = nodeById(this.library.library(), change.id);
    if (!before) return;
    const saved = this.library.updateWithWeek((lib) => {
      let next = updateNode(lib, change.id, { title: change.title, color: change.color });
      if (change.parentId !== before.parentId) next = moveNode(next, change.id, change.parentId);
      return next;
    });
    if (saved && change.parentId && change.parentId !== before.parentId) {
      this.message.set(this.i18n.t('capture.filed', { task: change.title, place: placeLabel(this.library.library(), change.id) }));
    }
  }

  /** A rename also renames its cards in the week (same batch). */
  protected saveEdit(task: LibNode, text: string): void {
    if (this.editing() !== task.id) return;
    this.editing.set('');
    const title = text.trim();
    if (title && title !== task.title) this.library.updateWithWeek((lib) => updateNode(lib, task.id, { title }));
  }

  /** Delete (✕) always asks first; a task already planned in the week says so, and its cards leave the week with it (same batch). */
  protected remove(task: LibNode): void {
    if (!this.canChange()) return;                                         // the planned-places count needs every day
    const places = DAYS.reduce((n, day) => n + this.week.week()[day].blocks.reduce((m, b) => m + b.tasks.filter((t) => t.ref === task.id).length, 0), 0);
    const question = places ? this.i18n.t('capture.confirmPlanned', { task: task.title, n: places }) : this.i18n.t('week.confirmDeleteTask', { task: task.title });
    if (!confirm(question)) return;
    if (!nodeById(this.library.library(), task.id)) return;
    this.library.updateWithWeek((lib) => removeNode(lib, task.id));
  }
}
