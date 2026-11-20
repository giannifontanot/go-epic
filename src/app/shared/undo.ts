import { Injectable, computed, signal } from '@angular/core';

/** How long a confirmed delete waits for a Cancel (Gianni: about 8 seconds). */
export const UNDO_SECONDS = 8;

interface PendingDelete { message: string; ids: string[]; commit: () => void; at: number; timer: ReturnType<typeof setTimeout>; }

/**
 * A second chance after a delete (Gianni): once "Delete" is answered, the thing is not gone at once; the same question
 * window (Ask, `countdown`) counts down 8 seconds with a Cancel, and only then is it removed. What waits is dimmed where it shows
 * (`isPending`). A second delete in the meantime finishes the first one at once, and so does leaving the app (the
 * delete was answered; only a Cancel keeps it).
 */
@Injectable({ providedIn: 'root' })
export class Undo {
  constructor() {
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => this.flush());
  }

  readonly pending = signal<PendingDelete | null>(null);
  /** Seconds left (8 … 1), refreshed four times a second. */
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
