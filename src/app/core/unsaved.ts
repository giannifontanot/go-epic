import { Injectable, computed, signal } from '@angular/core';

/**
 * Work that lives only in memory until it is saved: the Canvas draft (until Save) and the editor windows that keep
 * their changes until Done (an activity's details, a Capture task's ✎). The full-screen update prompt waits while any
 * is there, since its only way out is a reload that would lose them.
 */
@Injectable({ providedIn: 'root' })
export class UnsavedWork {
  readonly canvasDraft = signal(false);
  /** Editor windows open now (each counts itself in while it lives, `holdEditor`). */
  readonly editors = signal(0);
  readonly any = computed(() => this.canvasDraft() || this.editors() > 0);

  /** An editor window counts itself in; the returned function counts it out (call it on destroy). */
  holdEditor(): () => void {
    this.editors.update((n) => n + 1);
    let released = false;
    return () => { if (!released) { released = true; this.editors.update((n) => Math.max(0, n - 1)); } };
  }
}
