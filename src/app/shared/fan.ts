/**
 * The motion shared by the action menu's fans (the themes, the pages): the tiles stand beside their round button, and
 * each slides out of it (or back into it), starting on the button small and clear and gliding to its place, the
 * nearest first. Nothing under reduced motion.
 */
export const FAN_MS = 340;
export const FAN_STEP_MS = 40;

export function reducedMotion(): boolean {
  return typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The fan beside its button, centred on it, never past the top or the bottom of the screen. */
export function placeBeside(button: HTMLElement, fan: HTMLElement | undefined): void {
  if (!fan || typeof innerHeight !== 'number') return;
  const r = button.getBoundingClientRect();
  const h = fan.offsetHeight;
  const centre = innerHeight - (r.top + r.bottom) / 2;
  fan.style.bottom = Math.max(12, Math.min(centre - h / 2, innerHeight - h - 12)) + 'px';
}

/** The fan under its button (the edit bar's Themes), its right edge on the button's, never past the screen's edges. */
export function placeBelow(button: HTMLElement, fan: HTMLElement | undefined): void {
  if (!fan || typeof innerHeight !== 'number') return;
  const r = button.getBoundingClientRect();
  const h = fan.offsetHeight, w = fan.offsetWidth;
  const top = r.bottom + 8 + h <= innerHeight - 12 ? r.bottom + 8 : Math.max(12, r.top - 8 - h);
  fan.style.top = top + 'px';
  fan.style.bottom = 'auto';
  fan.style.right = Math.max(12, Math.min(innerWidth - r.right, innerWidth - w - 12)) + 'px';
}

/** Slides the tiles out of the button (out) or back into it; the returned animations end together with the motion. */
export function flyTiles(button: HTMLElement, tiles: HTMLElement[], out: boolean): Animation[] {
  if (reducedMotion() || !tiles.length || typeof tiles[0].animate !== 'function') return [];
  const from = button.getBoundingClientRect();
  const fx = from.left + from.width / 2, fy = from.top + from.height / 2;
  const rects = tiles.map((t) => t.getBoundingClientRect());
  const dist = rects.map((r) => Math.hypot(fx - (r.left + r.width / 2), fy - (r.top + r.height / 2)));
  const near = Math.min(...dist), far = Math.max(...dist);
  return tiles.map((tile, i) => {
    const r = rects[i];
    const dx = fx - (r.left + r.width / 2), dy = fy - (r.top + r.height / 2);
    const order = far > near ? Math.round(((dist[i] - near) / (far - near)) * 3) : 0;   // 0 = nearest the button
    const home = { transform: 'none', opacity: 1 };
    const away = { transform: `translate(${dx}px, ${dy}px) scale(.3)`, opacity: 0 };
    return tile.animate(out ? [away, home] : [home, away], {
      duration: FAN_MS,
      delay: (out ? order : 3 - order) * FAN_STEP_MS,
      easing: out ? 'cubic-bezier(0, 0, .2, 1)' : 'cubic-bezier(.4, 0, 1, 1)',
      fill: 'both',
    });
  });
}
