/** True for a click on a modal dialog's backdrop (outside its box), not on the padding inside it. */
export function isBackdropClick(event: MouseEvent, dialog: HTMLDialogElement): boolean {
  if (event.target !== dialog) return false;
  const r = dialog.getBoundingClientRect();
  return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
}

/*
 * Every window opens and closes smoothly FROM THE POINT THE USER PRESSED (Gianni's rule): it grows out of that point
 * (scale + fade, the backdrop fades in) and shrinks back into it when it closes. The point is the last pointer press
 * (within 1.5 s); for the keyboard, the centre of the focused element; else the centre of the screen.
 * Reduced motion: no animation. Use openDialog / closeDialog instead of showModal() / close().
 */
interface Point { x: number; y: number; }

/**
 * Opening is the exact mirror of closing (Gianni: the close looked smooth, the open did not): the same duration, the
 * same keyframes played backwards and the time-reversed curve (an ease-in (x1,y1,x2,y2) runs backwards as
 * (1-x2,1-y2,1-x1,1-y1)). So a window grows out of its point at the very rate it shrinks back into it.
 */
const MS = 300;
const EASE_IN = 'cubic-bezier(.4, 0, 1, 1)';
const EASE_OUT = 'cubic-bezier(0, 0, .6, 1)';

let lastPress: (Point & { at: number }) | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => (lastPress = { x: e.clientX, y: e.clientY, at: Date.now() }), true);
}

const origins = new WeakMap<HTMLDialogElement, Point>();
const closing = new WeakMap<HTMLDialogElement, Promise<void>>();
const escapeHandled = new WeakSet<HTMLDialogElement>();

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Where the window comes from: the press, else the focused element, else the middle of the screen. */
export function pressPoint(): Point {
  if (lastPress && Date.now() - lastPress.at < 1500) return { x: lastPress.x, y: lastPress.y };
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  if (el && el !== document.body) {
    const r = el.getBoundingClientRect();
    if (r.width || r.height) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: (globalThis.innerWidth ?? 0) / 2, y: (globalThis.innerHeight ?? 0) / 2 };
}

function setOrigin(dialog: HTMLDialogElement, from: Point): void {
  const r = dialog.getBoundingClientRect();
  dialog.style.transformOrigin = `${from.x - r.left}px ${from.y - r.top}px`;
}

/**
 * The window fully visible at every size but the smallest: closing, it shrinks back into its point and fades only the last
 * step (so it never pops out as a tiny box); opening plays the same frames backwards.
 */
function closeFrames(dialog: HTMLDialogElement, to: Point): Keyframe[] {
  setOrigin(dialog, to);
  return [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.18)', opacity: 1, offset: 0.82 }, { transform: 'scale(.05)', opacity: 0 }];
}

/** The frames played backwards in time: reversed, and every explicit offset t becomes 1 − t. */
export function mirrored(frames: Keyframe[]): Keyframe[] {
  return [...frames].reverse().map((f) => (typeof f.offset === 'number' ? { ...f, offset: 1 - f.offset } : f));
}

function animateBackdrop(dialog: HTMLDialogElement, show: boolean, duration: number): Animation | null {
  try {
    return dialog.animate(show ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
      { duration, easing: 'ease', pseudoElement: '::backdrop', fill: show ? 'none' : 'forwards' });
  } catch { return null; /* browsers without backdrop animation just show it */ }
}

/**
 * Opens a modal dialog growing out of the press point. Esc closes it the same smooth way, unless the dialog
 * handles Esc itself (`escape: false`, e.g. to keep a draft).
 */
export function openDialog(dialog: HTMLDialogElement, options: { escape?: boolean; from?: Point } = {}): void {
  if (dialog.open) return;
  const from = options.from ?? pressPoint();
  dialog.showModal();
  calmFocus(dialog);
  origins.set(dialog, from);
  if (options.escape !== false && !escapeHandled.has(dialog)) {
    escapeHandled.add(dialog);
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); void closeDialog(dialog); });
  }
  if (reducedMotion() || typeof dialog.animate !== 'function') return;
  // Grow from the press only once the window has its real size and place (Gianni: every window from where the finger
  // pressed): its contents are often drawn by Angular just after showModal(), and an origin measured on the still
  // empty box sits somewhere else. The backdrop starts fading in at once.
  // The first time a window opens (Gianni: it played like slow photographs; the second time it was smooth), its first
  // frames are the expensive ones: the browser lays it out, decodes its pictures (the paper textures) and paints it
  // into a layer for the first time. If the growing starts then, those long frames eat its 300 ms. So the window
  // first waits, full size and all but invisible (opacity .002, so it is still painted, unlike opacity 0), on its own
  // layer, for its pictures (at most 150 ms) and two frames; then it grows, every frame cheap.
  dialog.style.willChange = 'transform, opacity';
  const hold = dialog.animate([{ opacity: 0.002 }, { opacity: 0.002 }], { duration: 1000, fill: 'forwards' });
  animateBackdrop(dialog, true, MS);
  void ready(dialog).then(() => {
    hold.cancel();
    if (!dialog.open || closing.has(dialog)) { dialog.style.willChange = ''; return; }
    const grow = dialog.animate(mirrored(closeFrames(dialog, from)), { duration: MS, easing: EASE_OUT });
    const settle = () => { if (!closing.has(dialog)) dialog.style.willChange = ''; };
    grow.finished.then(settle, settle);
  });
}

/** The window painted once, hidden: its pictures decoded (at most 150 ms) and two frames gone by. */
function ready(dialog: HTMLDialogElement): Promise<void> {
  const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const pictures = Array.from(dialog.querySelectorAll('img')).map((img) => (typeof img.decode === 'function' ? img.decode().catch(() => undefined) : undefined));
  const decoded = Promise.race([Promise.all(pictures), new Promise((resolve) => setTimeout(resolve, 150))]);
  return Promise.all([decoded, frame().then(frame)]).then(() => undefined);
}

/**
 * Warms up what every window may need the first time (called once the app is idle): the paper textures of tasks and
 * activities are fetched and decoded ahead, so no window waits on them as it opens.
 */
export function warmUpWindows(): void {
  if (typeof Image === 'undefined') return;
  for (const name of ['fresh-paper', 'parchment-paper', 'old-paper']) {
    const img = new Image();
    img.src = `/paper/${name}.webp`;
    if (typeof img.decode === 'function') img.decode().catch(() => undefined);
  }
}

/** True for a control that brings up the phone's keyboard when focused. */
export function isTypingControl(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image', 'hidden'].includes(el.type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

/**
 * No window opens with the cursor in a box (Gianni: the keyboard should come up only when he taps a box). showModal()
 * focuses the first focusable control, which may be an input; then the focus goes to the window's title instead (else
 * the window itself), so screen readers still start inside it.
 */
function calmFocus(dialog: HTMLDialogElement): void {
  if (!isTypingControl(document.activeElement) || !dialog.contains(document.activeElement)) return;
  const target = dialog.querySelector<HTMLElement>('h1, h2, h3') ?? dialog;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

/** Shrinks the dialog back into the point it came from, then closes it (the dialog's `close` event fires after). */
export function closeDialog(dialog: HTMLDialogElement | undefined | null): Promise<void> {
  if (!dialog?.open) return Promise.resolve();
  const running = closing.get(dialog);
  if (running) return running;
  if (reducedMotion() || typeof dialog.animate !== 'function') { dialog.close(); return Promise.resolve(); }
  const from = origins.get(dialog) ?? pressPoint();
  const done = new Promise<void>((resolve) => {
    const animation = dialog.animate(closeFrames(dialog, from), { duration: MS, easing: EASE_IN, fill: 'forwards' });
    const backdrop = animateBackdrop(dialog, false, MS);
    const finish = () => {
      closing.delete(dialog);
      if (dialog.open) dialog.close();
      dialog.style.willChange = '';
      animation.cancel();
      backdrop?.cancel();
      resolve();
    };
    animation.finished.then(finish, finish);
  });
  closing.set(dialog, done);
  return done;
}
