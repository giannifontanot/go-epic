import { Component, ElementRef, Injectable, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { closeDialog, isBackdropClick, openDialog } from '../core/dialog';
import { I18n } from '../core/i18n';
import { UNDO_SECONDS, Undo } from './undo';

/** A delete that waits for a Cancel once it is answered (Undo): the window then shows its countdown in place. */
export interface AskCountdown {
  /** What the window says while it counts (e.g. Deleting "Run"…). */
  message: string;
  /** What is dimmed where it shows meanwhile. */
  ids: string[];
  /** Deletes it, when the time is up. */
  commit: () => void;
}

/** One question for the user: its text, the answer button's words and whether that answer destroys something. */
export interface AskRequest {
  message: string;
  /** The answer button (e.g. Delete); absent = a plain notice with a single OK. */
  ok?: string;
  /** A destructive answer (delete, discard): its button is drawn in the danger tone. */
  danger?: boolean;
  /** The cancel button's words (default Cancel). */
  cancel?: string;
  /**
   * Gianni: a second chance after a delete, in the same window. Answered yes, the window stays where it is and turns
   * into the countdown (the seconds left, Cancel, a red line shrinking along its foot); only when the time is up is
   * `commit` run.
   */
  countdown?: AskCountdown;
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
            (click)="onBackdrop($event)" (cancel)="escaped()" (close)="closed()">
      @if (counting(); as c) {
        <p id="ask-text">{{ c.message }}</p>
        <p class="ask-count" role="timer" aria-live="off">
          <span class="ask-sec">{{ undo.left() }}</span>
          <span>{{ i18n.t(undo.left() === 1 ? 'undo.second' : 'undo.seconds') }}</span>
        </p>
        <div class="ask-actions">
          <button type="button" class="ask-cancel undo-now" (click)="undo.flush()">{{ i18n.t('undo.now') }}</button>
          <button #undoCancel type="button" class="ask-ok undo-keep" (click)="keep()">{{ i18n.t('task.cancel') }}</button>
        </div>
        <span class="ask-timer" aria-hidden="true"><i [style.--secs]="seconds + 's'" [style.--frac]="undo.left() / seconds"></i></span>
      } @else if (shown(); as q) {
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
  protected readonly undo = inject(Undo);
  protected readonly seconds = UNDO_SECONDS;
  private readonly undoCancel = viewChild<ElementRef<HTMLButtonElement>>('undoCancel');
  /** The countdown this window started, while it is still waiting (Cancel, Delete now or the time up end it). */
  private readonly started = signal<AskCountdown | null>(null);
  protected readonly counting = computed(() => {
    const c = this.started();
    const p = this.undo.pending();
    return c && p && p.commit === c.commit ? c : null;
  });

  constructor() {
    // the countdown over (deleted, cancelled, or replaced): the window goes
    effect(() => {
      if (!this.started() || this.counting()) return;
      untracked(() => {
        this.started.set(null);
        if (this.asks.current()) return;                    // a new question took the window meanwhile
        const d = this.dialog().nativeElement;
        if (!d.open) return;
        if (typeof d.showModal === 'function') void closeDialog(d); else d.removeAttribute('open');
      });
    });
    // the Cancel takes the focus as the window turns into the countdown (the answer button it had is gone)
    effect(() => {
      const b = this.undoCancel();
      if (b) untracked(() => b.nativeElement.focus({ preventScroll: true }));
    });
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
    const countdown = yes ? this.asks.current()?.countdown : undefined;
    this.settle(yes);
    if (countdown) {                                         // the same window, in the same place, now counts down
      this.undo.later(countdown.message, countdown.ids, countdown.commit);
      this.started.set(countdown);
      return;
    }
    const d = this.dialog().nativeElement;
    if (typeof d.showModal === 'function') void closeDialog(d); else d.removeAttribute('open');
  }

  /** Cancel during the countdown: nothing is deleted. */
  protected keep(): void {
    this.undo.cancel();
  }

  /** Esc during the countdown cancels at once, before the window's closing animation (the time could run out in it). */
  protected escaped(): void {
    if (this.counting()) { this.started.set(null); this.undo.cancel(); }
  }

  /** The window closed by itself (Esc): during a countdown that is a Cancel; otherwise the question's no. */
  protected closed(): void {
    if (this.counting()) { this.started.set(null); this.undo.cancel(); return; }
    this.settle(false);
  }

  /** Gives the answer to whoever asked (once): the window closing by Esc counts as no. */
  protected settle(yes: boolean): void {
    const q = this.asks.current();
    if (!q) return;
    this.asks.current.set(null);
    q.answer(yes);
  }

  protected onBackdrop(event: MouseEvent): void {
    if (this.counting()) return;                             // during the countdown only its own buttons answer
    if (isBackdropClick(event, this.dialog().nativeElement)) this.answer(false);
  }
}
