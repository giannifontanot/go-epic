import { Injectable, signal } from '@angular/core';

/**
 * Work that lives only in memory until it is saved. Today: the Canvas draft (until Save). The full-screen update
 * prompt waits while it is there, since its only way out is a reload that would lose the draft.
 */
@Injectable({ providedIn: 'root' })
export class UnsavedWork {
  readonly canvasDraft = signal(false);
}
