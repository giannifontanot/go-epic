import { Component, ElementRef, Injectable, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { closeDialog, isBackdropClick, openDialog } from '../core/dialog';
import { I18n } from '../core/i18n';

/** One question for the user: its text, the answer button's words and whether that answer destroys something. */
export interface AskRequest {
  message: string;
  /** The answer button (e.g. Delete); absent = a plain notice with a single OK. */
  ok?: string;
  /** A destructive answer (delete, discard): its button is drawn in the danger tone. */
  danger?: boolean;
  /** The cancel button's words (default Cancel). */
  cancel?: string;
}

interface Pending extends AskRequest { answer: (yes: boolean) => void; }

/**
 * The app's own question windows (Gianni: the browser's confirm/alert boxes looked generic): `ask()` replaces
 * `confirm()` and resolves true only on the answer button; `tell()` replaces `alert()`. The `AskWindow` the App draws
 * shows them in the app's look.
 */
@Injectable({ providedIn: 'root' })
export class Ask {
  readonly current = signal<Pending | null>(null);

  ask(request: AskRequest): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.current()?.answer(false);            // a second question replaces an unanswered one
      this.current.set({ ...request, answer: resolve });
    });
  }

  tell(message: string): Promise<void> {
    return this.ask({ message }).then(() => undefined);
  }
}

/**
 * The question window: rounded, in the theme's colours, growing out of the point that was pressed and shrinking back
 * into it like every window (core/dialog). Cancel first (where the focus starts, so Enter never destroys anything by
 * accident) and the answer after it, red when it deletes or discards. Esc, the backdrop and Cancel answer no; the
 * native modal keeps the focus inside it. A notice has a single OK.
 */
@Component({
  selector: 'app-ask-window',
  template: `
    <dialog #dialog class="ask-window" role="alertdialog" aria-modal="true" aria-describedby="ask-text"
            (click)="onBackdrop($event)" (close)="settle(false)">
      @if (shown(); as q) {
        <p id="ask-text">{{ q.message }}</p>
        <div class="ask-actions">
          @if (q.ok) {
            <button type="button" class="ask-cancel" (click)="answer(false)">{{ q.cancel || i18n.t('task.cancel') }}</button>
            <button type="button" class="ask-ok" [class.danger]="q.danger" (click)="answer(true)">{{ q.ok }}</button>
          } @else {
            <button type="button" class="ask-ok" (click)="answer(false)">{{ i18n.t('ask.ok') }}</button>
          }
        </div>
      }
    </dialog>
  `,
})
export class AskWindow {
  protected readonly i18n = inject(I18n);
  private readonly asks = inject(Ask);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  /** What the window shows; kept while it shrinks away after an answer. */
  protected readonly shown = signal<AskRequest | null>(null);

  constructor() {
    effect(() => {
      const q = this.asks.current();
      if (!q) return;
      untracked(() => {
        this.shown.set(q);
        const d = this.dialog().nativeElement;
        if (d.open) return;
        if (typeof d.showModal === 'function') openDialog(d);
        else d.setAttribute('open', '');                      // no native modal (test DOM): just show it
      });
    });
  }

  protected answer(yes: boolean): void {
    this.settle(yes);
    const d = this.dialog().nativeElement;
    if (typeof d.showModal === 'function') void closeDialog(d); else d.removeAttribute('open');
  }

  /** Gives the answer to whoever asked (once): the window closing by Esc counts as no. */
  protected settle(yes: boolean): void {
    const q = this.asks.current();
    if (!q) return;
    this.asks.current.set(null);
    q.answer(yes);
  }

  protected onBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.dialog().nativeElement)) this.answer(false);
  }
}
