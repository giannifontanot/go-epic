import { Injectable, signal } from '@angular/core';

/** Whether the Capture panel is open (the floating ✎ and the menu's Capture both open it). */
@Injectable({ providedIn: 'root' })
export class CaptureUi {
  readonly open = signal(false);
}
