import { Injector, afterNextRender } from '@angular/core';

/**
 * FLIP (First, Last, Invert, Play): things that move glide to their new place instead of jumping (Gianni). Records
 * where every `[data-flip]` element under `root` is, runs `change`, and once Angular has drawn the new order animates
 * each one from its old place to its new one. Nothing under reduced motion.
 */
export function flip(root: ParentNode, injector: Injector, change: () => void, from?: Map<string, DOMRect>): void {
  const reduced = typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const before = new Map<string, DOMRect>();
  if (!reduced) for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-flip]'))) before.set(el.dataset['flip']!, el.getBoundingClientRect());
  // `from` overrides where some elements start (a dropped card starts where it was let go)
  if (!reduced && from) for (const [id, rect] of from) before.set(id, rect);
  change();
  if (reduced) return;
  afterNextRender({
    read: () => {
      for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-flip]'))) {
        const old = before.get(el.dataset['flip']!);
        if (!old) continue;
        const now = el.getBoundingClientRect();
        const dx = old.left - now.left, dy = old.top - now.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.22, 1, .36, 1)' });
      }
    },
  }, { injector });
}

/**
 * The same glide for a change made straight to the DOM (no Angular render in between): records the rects of `selector`
 * under `root`, runs `change`, and animates each element from its old place. Used while a card is dragged, when the
 * gap that marks where it will land moves and the other cards make room for it.
 */
export function flipNow(root: ParentNode, selector: string, change: () => void, duration = 220): void {
  const reduced = typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const els = Array.from(root.querySelectorAll<HTMLElement>(selector));
  const before = reduced ? [] : els.map((el) => el.getBoundingClientRect());
  change();
  if (reduced) return;
  els.forEach((el, i) => {
    const now = el.getBoundingClientRect();
    const dx = before[i].left - now.left, dy = before[i].top - now.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  });
}
