import { Injectable, signal } from '@angular/core';

/** A page's own action in the floating buttons' menu (the Week board: ✎ arrange the week). */
export interface MenuAction { label: string; run: () => void; }

/** A page in edit mode: the edit tools at the bottom right (LookStack); `px` = the minutes' length stepper (the Week board). */
export interface LookTools { px: boolean; finish: () => void; }

/**
 * The shell's shared flags: whether the Capture panel and the Ajustes window are open (the action menu opens them), the
 * page's own action for the menu, and whether the menu is hidden (the Week board while arranging: its ✓ Finish takes the spot).
 */
@Injectable({ providedIn: 'root' })
export class CaptureUi {
  readonly open = signal(false);
  readonly settings = signal(false);
  readonly menuEdit = signal<MenuAction | null>(null);
  readonly menuHidden = signal(false);
  /** The page being edited shows its edit tools (Aa, AV, Themes, px) and a round ✓ Finish at the bottom right. */
  readonly lookTools = signal<LookTools | null>(null);
}
