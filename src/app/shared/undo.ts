import { Component, Injectable, computed, inject, input, signal } from '@angular/core';
import { I18n } from '../core/i18n';
import { CaptureUi } from '../pages/capture/capture-ui';

/** How long a confirmed delete waits for a Cancel (Gianni: about 5 seconds). */
export const UNDO_SECONDS = 5;

interface PendingDelete { message: string; ids: string[]; commit: () => void; at: number; timer: ReturnType<typeof setTimeout>; }

/**
 * A second chance after a delete (Gianni): once "Delete" is answered, the thing is not gone at once; a note at the foot
 * of the screen counts down 5 seconds with a Cancel, and only then is it removed. What waits is dimmed where it shows
 * (`isPending`). A second delete in the meantime finishes the first one at once, and so does leaving the app (the
 * delete was answered; only a Cancel keeps it).
 */
@Injectable({ providedIn: 'root' })
export class Undo {
  constructor() {
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => this.flush());
  }

  readonly pending = signal<PendingDelete | null>(null);
  /** Seconds left, refreshed by the toast's clock. */
  readonly left = signal(UNDO_SECONDS);
  private readonly ids = computed(() => new Set(this.pending()?.ids ?? []));
  private tick: ReturnType<typeof setInterval> | null = null;

  isPending(id: string | null | undefined): boolean {
    return !!id && this.ids().has(id);
  }

  /** Deletes after the countdown, unless Cancel is pressed; `ids` are dimmed meanwhile. */
  later(message: string, ids: string[], commit: () => void): void {
    this.flush();
    const timer = setTimeout(() => this.flush(), UNDO_SECONDS * 1000);
    this.pending.set({ message, ids, commit, at: Date.now(), timer });
    this.left.set(UNDO_SECONDS);
    this.tick = setInterval(() => {
      const p = this.pending();
      if (p) this.left.set(Math.max(1, Math.ceil(UNDO_SECONDS - (Date.now() - p.at) / 1000)));
    }, 250);
  }

  /** Cancel: nothing is deleted. */
  cancel(): void {
    const p = this.pending();
    if (!p) return;
    clearTimeout(p.timer);
    this.stop();
  }

  /** Deletes now what was waiting (its time is up, or another delete comes). */
  flush(): void {
    const p = this.pending();
    if (!p) return;
    clearTimeout(p.timer);
    this.stop();
    p.commit();
  }

  private stop(): void {
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    this.pending.set(null);
  }
}

/**
 * The countdown note at the foot of the screen: what is being deleted, the seconds left and a Cancel. A modal window
 * makes everything outside it unreachable, so while Capture is open its own copy, inside the panel, shows the note
 * (`place="panel"`) and the App's one waits; closing Capture hands it back to the App's.
 */
@Component({
  selector: 'app-undo-toast',
  template: `
    @if (undo.pending(); as p) {
      @if (place() === 'panel' || !capture.open()) {
      <div class="undo-toast" [class.in-panel]="place() === 'panel'" role="status" aria-live="polite">
        <span class="undo-ring" aria-hidden="true"><span>{{ undo.left() }}</span></span>
        <span class="undo-text">{{ p.message }}</span>
        <button type="button" class="undo-cancel" (click)="undo.cancel()">{{ i18n.t('task.cancel') }}</button>
      </div>
      }
    }
  `,
})
export class UndoToast {
  protected readonly i18n = inject(I18n);
  protected readonly undo = inject(Undo);
  protected readonly capture = inject(CaptureUi);
  /** 'panel' = the copy inside the Capture window. */
  readonly place = input<'app' | 'panel'>('app');
}
