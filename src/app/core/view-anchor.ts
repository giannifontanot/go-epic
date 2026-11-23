/**
 * Keeping the page still while the layout changes under it (the Week board's edit mode, the px / Aa / AV steppers).
 */

/**
 * Whether an element is really on the board: laid out and not in a hidden day (on a phone only the day shown is laid
 * out; the others are display: none).
 */
export function shownOnScreen(el: HTMLElement): boolean {
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/**
 * The card (else block, else day) nearest the middle of the screen, and a function that scrolls the page back so it
 * sits where it was, at once (no glide), after the layout changed. Null when nothing is on screen.
 */
export function viewAnchor(): (() => void) | null {
  if (typeof document === 'undefined') return null;
  const mid = (window.visualViewport?.height ?? window.innerHeight) / 2;
  const pick = (selector: string) => {
    let best: { el: HTMLElement; gap: number } | null = null;
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      const r = el.getBoundingClientRect();
      if (!r.height || !shownOnScreen(el) || r.bottom < 0 || r.top > mid * 2 || r.right < 0 || r.left > window.innerWidth) continue;
      const gap = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
      if (!best || gap < best.gap) best = { el, gap };
    }
    return best?.el ?? null;
  };
  const el = pick('[data-task]') ?? pick('[data-block]') ?? pick('article.day');
  if (!el) return null;
  const key = el.dataset['task'] ? `[data-task="${CSS.escape(el.dataset['task'])}"]`
    : el.dataset['block'] ? `[data-block="${CSS.escape(el.dataset['block'])}"]` : null;
  const top = el.getBoundingClientRect().top;
  return () => {
    const now = key ? document.querySelector<HTMLElement>(key) : el.isConnected ? el : null;
    if (!now) return;
    const delta = now.getBoundingClientRect().top - top;
    if (Math.abs(delta) >= 1) window.scrollBy({ top: delta, left: 0, behavior: 'instant' });
  };
}
