/**
 * Swiping sideways between days (Gianni), on the Week board and in the day overview. Touch events, passive, so a
 * vertical scroll is never held up: only a quick, mostly sideways stroke counts, and a stroke that begins on
 * something with its own drag (a card's grip, a resize handle, a field, anything with `touch-action: none`) or near the
 * screen's left edge (the phone's own back gesture) is left alone.
 */

/** 1 = to the next day (finger moved left), -1 = to the previous one, 0 = not a swipe. */
export function swipeDirection(dx: number, dy: number, ms: number): -1 | 0 | 1 {
  if (!(ms <= 800) || Math.abs(dx) < 60 || Math.abs(dx) < 1.5 * Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

/** The day `step` places away in the list, or null past either end (Monday and Sunday stop it). */
export function stepDay<T>(days: readonly T[], day: T, step: -1 | 1): T | null {
  const at = days.indexOf(day);
  return at < 0 ? null : days[at + step] ?? null;
}

const OWN_GESTURE = '.t-grip, .t-handle, input, textarea, select, [contenteditable], .no-swipe';

/** Follows one finger from touchstart to touchend and says whether it was a sideways swipe. */
export class SwipeTracker {
  private from: { x: number; y: number; at: number } | null = null;

  start(event: TouchEvent): void {
    this.from = null;
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    const target = event.target instanceof Element ? event.target : null;
    if (touch.clientX < 24 || (target && ownGesture(target))) return;
    this.from = { x: touch.clientX, y: touch.clientY, at: event.timeStamp };
  }

  /** The swipe's direction (see `swipeDirection`), once the finger lifts. */
  end(event: TouchEvent): -1 | 0 | 1 {
    const from = this.from;
    this.from = null;
    const touch = event.changedTouches[0];
    if (!from || !touch || event.touches.length) return 0;
    return swipeDirection(touch.clientX - from.x, touch.clientY - from.y, event.timeStamp - from.at);
  }

  cancel(): void { this.from = null; }
}

function ownGesture(el: Element): boolean {
  if (el.closest(OWN_GESTURE)) return true;
  if (typeof getComputedStyle !== 'function') return false;
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (getComputedStyle(node).touchAction === 'none') return true;
  }
  return false;
}
