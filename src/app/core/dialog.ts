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

const OPEN_MS = 460;          // a little slower, so the eye can follow the window growing out of its point (Gianni)
const CLOSE_MS = 300;
const EASE_OUT = 'cubic-bezier(.22, 1, .36, 1)';
const EASE_IN = 'cubic-bezier(.4, 0, 1, 1)';

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

function frames(dialog: HTMLDialogElement, from: Point): Keyframe[] {
  const r = dialog.getBoundingClientRect();
  dialog.style.transformOrigin = `${from.x - r.left}px ${from.y - r.top}px`;
  return [{ transform: 'scale(.05)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }];
}

/**
 * Closing: the window shrinks back into its point fully visible, so the eye follows its shape home (Gianni); only at the
 * very end, already small, it fades the last step, so it never pops out as a tiny box.
 */
function closeFrames(dialog: HTMLDialogElement, to: Point): Keyframe[] {
  frames(dialog, to);                                                    // sets the transform origin
  return [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.18)', opacity: 1, offset: 0.82 }, { transform: 'scale(.05)', opacity: 0 }];
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
  origins.set(dialog, from);
  if (options.escape !== false && !escapeHandled.has(dialog)) {
    escapeHandled.add(dialog);
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); void closeDialog(dialog); });
  }
  if (reducedMotion() || typeof dialog.animate !== 'function') return;
  dialog.animate(frames(dialog, from), { duration: OPEN_MS, easing: EASE_OUT });
  animateBackdrop(dialog, true, OPEN_MS);
}

/** Shrinks the dialog back into the point it came from, then closes it (the dialog's `close` event fires after). */
export function closeDialog(dialog: HTMLDialogElement | undefined | null): Promise<void> {
  if (!dialog?.open) return Promise.resolve();
  const running = closing.get(dialog);
  if (running) return running;
  if (reducedMotion() || typeof dialog.animate !== 'function') { dialog.close(); return Promise.resolve(); }
  const from = origins.get(dialog) ?? pressPoint();
  const done = new Promise<void>((resolve) => {
    const animation = dialog.animate(closeFrames(dialog, from), { duration: CLOSE_MS, easing: EASE_IN, fill: 'forwards' });
    const backdrop = animateBackdrop(dialog, false, CLOSE_MS);
    const finish = () => {
      closing.delete(dialog);
      if (dialog.open) dialog.close();
      animation.cancel();
      backdrop?.cancel();
      resolve();
    };
    animation.finished.then(finish, finish);
  });
  closing.set(dialog, done);
  return done;
}
