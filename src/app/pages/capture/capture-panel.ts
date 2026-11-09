import { Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { CaptureStore } from '../../core/capture.store';
import { Note, newNote, removeNote, sortNotes, updateNote } from '../../core/capture.model';
import { closeDialog, isBackdropClick, openDialog } from '../../core/dialog';
import { I18n } from '../../core/i18n';
import { addNode, newNodeId } from '../../core/library.model';
import { LibraryStore } from '../../core/library.store';

/**
 * Capture, as in Epic Manager: a floating ✎ (and the menu's Capture) opens a panel for quick notes. Enter adds a note;
 * each one can be ticked, starred ⭐, edited (tap its text), deleted, or sent "→ Task" to the Floating Canvas's Free
 * Space. Opens and closes smoothly from the point pressed (core/dialog).
 */
@Component({
  selector: 'app-capture-panel',
  template: `
    <button type="button" class="capture-fab" [attr.aria-label]="i18n.t('capture.open')" [title]="i18n.t('capture.open')"
      (click)="store.open.set(true)">✎</button>
    <dialog #panel class="capture-panel" aria-labelledby="capture-title" (click)="onBackdrop($event)" (close)="store.open.set(false)">
      <header>
        <h2 id="capture-title">{{ i18n.t('capture.title') }}</h2>
        <button type="button" class="drawer-close" [attr.aria-label]="i18n.t('nav.close')" (click)="close()">×</button>
      </header>
      <form class="capture-add" (submit)="$event.preventDefault(); add(input)">
        <input #input type="text" enterkeyhint="done" autocomplete="off" [placeholder]="i18n.t('capture.placeholder')"
          [attr.aria-label]="i18n.t('capture.placeholder')" [disabled]="!store.ready()" />
        <button type="submit" class="primary" [disabled]="!store.ready()">{{ i18n.t('capture.add') }}</button>
      </form>
      @if (message()) { <p class="hint" role="status">{{ message() }}</p> }
      @if (store.error()) { <p class="app-error" role="alert">{{ i18n.t('saveFailed') }}: {{ store.error() }}</p> }
      <ul class="capture-list">
        @for (note of notes(); track note.id) {
          <li [class.done]="note.done" [class.star]="note.star">
            <button type="button" class="c-check" role="checkbox" [attr.aria-checked]="note.done"
              [attr.aria-label]="i18n.t('capture.done')" (click)="change(note, { done: !note.done })">{{ note.done ? '✓' : '' }}</button>
            @if (editing() === note.id) {
              <input class="c-edit" type="text" [value]="note.text" [attr.aria-label]="i18n.t('capture.edit')"
                (keydown.enter)="$event.preventDefault(); saveEdit(note, $any($event.target).value)" (keydown.escape)="$event.stopPropagation(); editing.set('')"
                (blur)="saveEdit(note, $any($event.target).value)" />
            } @else {
              <button type="button" class="c-text" [attr.aria-label]="i18n.t('capture.edit') + ': ' + note.text" (click)="startEdit(note)">{{ note.text }}</button>
            }
            <button type="button" class="c-icon" [attr.aria-pressed]="note.star" [attr.aria-label]="i18n.t('capture.star')" [title]="i18n.t('capture.star')"
              (click)="change(note, { star: !note.star })">{{ note.star ? '★' : '☆' }}</button>
            <button type="button" class="c-icon" [disabled]="!library.ready()" [attr.aria-label]="i18n.t('capture.toTask')" [title]="i18n.t('capture.toTask')"
              (click)="toTask(note)">→</button>
            <button type="button" class="c-icon" [attr.aria-label]="i18n.t('capture.delete')" [title]="i18n.t('capture.delete')" (click)="remove(note)">×</button>
          </li>
        } @empty {
          <li class="c-empty">{{ i18n.t(store.ready() ? 'capture.empty' : 'loading') }}</li>
        }
      </ul>
    </dialog>
  `,
})
export class CapturePanel {
  protected readonly i18n = inject(I18n);
  protected readonly store = inject(CaptureStore);
  protected readonly library = inject(LibraryStore);
  private readonly panel = viewChild.required<ElementRef<HTMLDialogElement>>('panel');
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  protected readonly notes = computed(() => sortNotes(this.store.notes()));
  protected readonly editing = signal('');
  protected readonly message = signal('');

  constructor() {
    // The store says open / closed (the ✎ and the menu both set it); the dialog follows, growing from the press point.
    effect(() => {
      const open = this.store.open();
      untracked(() => {
        const d = this.panel().nativeElement;
        if (open && !d.open) {
          this.message.set('');
          openDialog(d);
          queueMicrotask(() => this.input().nativeElement.focus());
        } else if (!open && d.open) {
          void closeDialog(d);
        }
      });
    });
  }

  protected close(): void {
    this.store.open.set(false);
  }

  protected onBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.panel().nativeElement)) this.close();
  }

  protected add(input: HTMLInputElement): void {
    const note = newNote(input.value, Date.now());
    if (!note || !this.store.update((notes) => [note, ...notes])) return;
    input.value = '';
    this.message.set('');
  }

  protected change(note: Note, change: Partial<Pick<Note, 'done' | 'star'>>): void {
    this.store.update((notes) => updateNote(notes, note.id, change));
  }

  protected startEdit(note: Note): void {
    this.editing.set(note.id);
    queueMicrotask(() => this.panel().nativeElement.querySelector<HTMLInputElement>('.c-edit')?.focus());
  }

  protected saveEdit(note: Note, text: string): void {
    if (this.editing() !== note.id) return;
    this.editing.set('');
    if (text.trim() && text.trim() !== note.text) this.store.update((notes) => updateNote(notes, note.id, { text }));
  }

  protected remove(note: Note): void {
    this.store.update((notes) => removeNote(notes, note.id));
  }

  /** The note becomes a task waiting in the Floating Canvas's Free Space, and leaves the list. */
  protected toTask(note: Note): void {
    const sent = this.library.update((lib) => addNode(lib, { id: newNodeId(), kind: 'task', title: note.text, parentId: null, color: null }));
    if (!sent) return;
    this.store.update((notes) => removeNote(notes, note.id));
    this.message.set(this.i18n.t('capture.sent', { task: note.text }));
  }
}
