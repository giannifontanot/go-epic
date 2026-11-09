import { Injectable, signal } from '@angular/core';

/** What the floating ✎ does on a page that takes it over (the Week board: arrange the week); `hidden` hides it. */
export interface FabAction { label: string; run: () => void; hidden: boolean; }

/** Whether the Capture panel is open (the floating ✎ and the menu's Capture both open it). */
@Injectable({ providedIn: 'root' })
export class CaptureUi {
  readonly open = signal(false);
  /** Set by a page that gives the floating ✎ its own job; null = the ✎ opens Capture. */
  readonly fab = signal<FabAction | null>(null);
}
