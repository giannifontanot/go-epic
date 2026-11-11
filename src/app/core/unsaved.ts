import { Injectable, signal } from '@angular/core';

/**
 * Work that lives only in memory until it is saved and is not inside an open window: the Canvas draft (until Save).
 * The full-screen update prompt waits while it is there, and while any window is open (an editor keeps its changes
 * until Done), since its only way out is a reload that would lose them (App).
 */
@Injectable({ providedIn: 'root' })
export class UnsavedWork {
  readonly canvasDraft = signal(false);
}
