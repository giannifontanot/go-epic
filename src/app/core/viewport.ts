/**
 * The part of the screen the user can see, the phone's keyboard left out. Where the keyboard lies over the page
 * (core/soft-keyboard.ts: Chrome's VirtualKeyboard API, so the app can move things softly itself), the browser no longer
 * shrinks window.visualViewport for it, so everything that keeps itself above the keyboard (Capture's window, the Year's
 * day window, the floating menus) asks here instead of reading visualViewport alone.
 */
export const VISIBLE_AREA_EVENT = 'go-epic-visible-area';

export interface VisibleArea { top: number; left: number; width: number; height: number; }

/** How many px of the screen's foot the keyboard covers while it lies over the page (0 when it is down or resizes it). */
let keyboard = 0;

export function keyboardOverlay(): number { return keyboard; }

/** Set by the soft keyboard when the keyboard over the page comes up or goes down; tells everyone who watches. */
export function setKeyboardOverlay(height: number): void {
  const next = Math.max(0, Math.round(height));
  if (next === keyboard) return;
  keyboard = next;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(VISIBLE_AREA_EVENT));
}

export function visibleArea(): VisibleArea {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  const inner = typeof innerHeight === 'number' ? innerHeight : 0;
  const top = vv?.offsetTop ?? 0;
  const left = vv?.offsetLeft ?? 0;
  const width = vv?.width ?? (typeof innerWidth === 'number' ? innerWidth : 0);
  const full = vv?.height ?? inner;
  const height = keyboard ? Math.max(120, Math.min(full, inner - keyboard - top)) : full;
  return { top, left, width, height };
}

/** Calls `fn` whenever the visible part changes (the visual viewport moves or resizes, or the keyboard over the page). */
export function watchVisibleArea(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const vv = window.visualViewport;
  vv?.addEventListener('resize', fn);
  vv?.addEventListener('scroll', fn);
  window.addEventListener(VISIBLE_AREA_EVENT, fn);
  return () => {
    vv?.removeEventListener('resize', fn);
    vv?.removeEventListener('scroll', fn);
    window.removeEventListener(VISIBLE_AREA_EVENT, fn);
  };
}
