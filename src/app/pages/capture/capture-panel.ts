import { Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { closeDialog, isBackdropClick, openDialog } from '../../core/dialog';
import { I18n } from '../../core/i18n';
import { LibNode, addNode, inboxTasks, moveNode, newNodeId, nodeById, removeNode, storyOptions, updateNode } from '../../core/library.model';
import { LibraryStore } from '../../core/library.store';
import { DAYS } from '../../core/week.model';
import { WeekStore } from '../../core/week.store';
import { CaptureUi } from './capture-ui';

/**
 * Capture = the quick way into Free Space (GTD: one inbox). The floating ✎ (or the menu's Capture) opens the panel
 * with the cursor in the box: type and press Enter, as many times as you like. Every idea is a task in the Floating
 * Canvas's Free Space (no story yet). The panel lists those tasks, newest first: edit (tap the text), file it in a
 * story ("Where →", it then leaves the inbox), or delete it. The Week's "Existing task" picker also offers them.
 */
@Component({
  selector: 'app-capture-panel',
  template: `
    <button type="button" class="capture-fab" [attr.aria-label]="i18n.t('capture.open')" [title]="i18n.t('capture.open')"
      (click)="ui.open.set(true)">✎</button>
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
          <li>
            @if (editing() === task.id) {
              <input class="c-edit" type="text" [value]="task.title" [attr.aria-label]="i18n.t('capture.edit')"
                (keydown.enter)="$event.preventDefault(); saveEdit(task, $any($event.target).value)"
                (keydown.escape)="$event.stopPropagation(); editing.set('')" (blur)="saveEdit(task, $any($event.target).value)" />
            } @else {
              <button type="button" class="c-text" [disabled]="!canChange()" [attr.aria-label]="i18n.t('capture.edit') + ': ' + task.title" (click)="startEdit(task)">{{ task.title }}</button>
            }
            @if (filing() === task.id) {
              <select class="c-where" [attr.aria-label]="i18n.t('capture.where')" (change)="file(task, $any($event.target).value)" (blur)="filing.set('')">
                <option value="" selected>{{ stories().length ? i18n.t('canvas.choose') : i18n.t('capture.noStories') }}</option>
                @for (s of stories(); track s.node.id) { <option [value]="s.node.id">{{ s.place }}</option> }
              </select>
            } @else {
              <button type="button" class="c-icon c-file" [disabled]="!library.ready()" [attr.aria-label]="i18n.t('capture.where')" [title]="i18n.t('capture.where')"
                (click)="startFiling(task)">{{ i18n.t('capture.whereShort') }}</button>
            }
            <button type="button" class="c-icon" [disabled]="!canChange()" [attr.aria-label]="i18n.t('capture.delete')" [title]="i18n.t('capture.delete')"
              (click)="remove(task)">×</button>
          </li>
        } @empty {
          <li class="c-empty">{{ i18n.t(library.ready() ? 'capture.empty' : 'loading') }}</li>
        }
      </ul>
    </dialog>
  `,
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
  protected readonly stories = computed(() => storyOptions(this.library.library()));
  protected readonly editing = signal('');
  protected readonly filing = signal('');
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
          queueMicrotask(() => this.input().nativeElement.focus());
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
    const added = this.library.update((lib) => addNode(lib, { id: newNodeId(), kind: 'task', title, parentId: null, color: null }));
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

  /** A rename also renames its cards in the week (same batch). */
  protected saveEdit(task: LibNode, text: string): void {
    if (this.editing() !== task.id) return;
    this.editing.set('');
    const title = text.trim();
    if (title && title !== task.title) this.library.updateWithWeek((lib) => updateNode(lib, task.id, { title }));
  }

  protected startFiling(task: LibNode): void {
    this.filing.set(task.id);
    queueMicrotask(() => this.panel().nativeElement.querySelector<HTMLSelectElement>('.c-where')?.focus());
  }

  /** "Where →": the task moves into a story (it leaves the inbox; the Canvas shows it there). */
  protected file(task: LibNode, storyId: string): void {
    this.filing.set('');
    if (!storyId) return;
    if (!this.library.update((lib) => moveNode(lib, task.id, storyId))) return;
    const place = this.stories().find((s) => s.node.id === storyId)?.place ?? '';
    this.message.set(this.i18n.t('capture.filed', { task: task.title, place }));
  }

  /** Delete: a task already planned in the week asks first, and its cards leave the week with it (same batch). */
  protected remove(task: LibNode): void {
    if (!this.canChange()) return;                                         // the planned-places count needs every day
    const places = DAYS.reduce((n, day) => n + this.week.week()[day].blocks.reduce((m, b) => m + b.tasks.filter((t) => t.ref === task.id).length, 0), 0);
    if (places && !confirm(this.i18n.t('canvas.confirmDeleteTask', { n: places }))) return;
    if (!nodeById(this.library.library(), task.id)) return;
    this.library.updateWithWeek((lib) => removeNode(lib, task.id));
  }
}
