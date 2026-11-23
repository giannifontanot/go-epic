import { isTypingControl } from './dialog';
import { keyboardOverlay, setKeyboardOverlay } from './viewport';

/**
 * The keyboard comes and goes softly (Gianni: the page jumped up so fast the user did not know what was happening).
 *
 * Where the browser lets the app do it (Chrome and Edge, Android above all: the VirtualKeyboard API), the keyboard lies
 * over the page instead of the browser shoving the page up at once. Then, as it comes up, the app itself glides the box
 * being typed in just above it: first the panel or window list it sits in scrolls, then a window that still covers it
 * slides up, else the page scrolls; and when the keyboard goes down, everything glides back to where it was (unless the
 * user has scrolled meanwhile). Elsewhere (iPhone, Firefox) the browser keeps its own way and nothing changes.
 * Floating windows that place themselves (popovers, Capture) follow core/viewport.ts instead.
 */
const MS = 340;
const MARGIN = 16;

interface Scrolled { el: Element; from: number; to: number; pad: string | null; }
interface Lifted { el: HTMLElement; translate: string; transition: string; }

/** What was scrolled and what was lifted, kept apart: a window can be both (its list scrolled, then itself slid up). */
const moved = new Map<Element, Scrolled>();
const lifted = new Map<HTMLElement, Lifted>();
const gliding = new WeakMap<Element, number>();
let room: HTMLElement | null = null;
let started = false;

function reduced(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const ease = (t: number) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function scroller(el: Element): Element { return el === document.documentElement || el === document.body ? document.scrollingElement ?? document.documentElement : el; }
function topOf(el: Element): number { return scroller(el).scrollTop; }
function setTop(el: Element, top: number): void { scroller(el).scrollTo({ top, behavior: 'instant' as ScrollBehavior }); }

/** Glides a scroller's top to `to`, softly (at once under reduced motion). */
function glide(el: Element, to: number, done?: () => void): void {
  cancelAnimationFrame(gliding.get(el) ?? 0);
  const from = topOf(el);
  if (reduced() || Math.abs(to - from) < 1) { setTop(el, to); done?.(); return; }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / MS);
    setTop(el, from + (to - from) * ease(t));
    if (t < 1) gliding.set(el, requestAnimationFrame(step)); else { gliding.delete(el); done?.(); }
  };
  gliding.set(el, requestAnimationFrame(step));
}

function scrollsY(el: HTMLElement): boolean {
  const y = getComputedStyle(el).overflowY;
  return (y === 'auto' || y === 'scroll') && el.clientHeight > 0;
}

/**
 * Room for the box to move up when its list is too short: extra padding at the list's foot (taken off on the way back).
 * Returns how far the list can now really scroll: a list sized to its content (a window with `fit-content`) only grows
 * with the padding, so then the padding is taken off at once (before anything is painted) and nothing is gained.
 */
function makeRoom(el: HTMLElement, needed: number): number {
  const before = el.style.paddingBottom;
  const rec = moved.get(el);
  const base = parseFloat(getComputedStyle(el).paddingBottom) || 0;
  el.style.paddingBottom = `${base + needed}px`;
  const can = el.scrollHeight - el.clientHeight - el.scrollTop;
  if (can <= 0.5) { el.style.paddingBottom = before; return 0; }
  if (rec) { if (rec.pad === null) rec.pad = before; } else moved.set(el, { el, from: el.scrollTop, to: el.scrollTop, pad: before });
  return can;
}

function scrollBy(el: Element, by: number): void {
  const rec = moved.get(el);
  const from = rec ? rec.from : topOf(el);
  const to = topOf(el) + by;
  moved.set(el, { el, from, to, pad: rec ? rec.pad : null });
  glide(el, to);
}

/** The box being typed in, just above the keyboard. */
function reveal(): void {
  const kb = keyboardOverlay();
  const box = document.activeElement as HTMLElement | null;
  if (!kb || !box || !isTypingControl(box) || box.closest('[popover]')) return;
  const r = box.getBoundingClientRect();
  let need = Math.min(r.bottom - (innerHeight - kb - MARGIN), r.top - MARGIN);   // never past the top of the screen
  if (need <= 0.5) return;
  const win = box.closest('dialog');
  let boxTop = r.top;
  // 1. the lists it sits in, nearest first, each by what still shows of it above the box
  for (let node = box.parentElement; node && need > 0.5; node = node.parentElement) {
    if (node === document.body || node === document.documentElement) break;
    if (!scrollsY(node)) { if (node === win) break; continue; }
    const top = node.getBoundingClientRect().top;
    let can = Math.min(need, boxTop - Math.max(top, 0) - MARGIN);
    if (can > 0.5) {
      const left = node.scrollHeight - node.clientHeight - node.scrollTop;
      if (left < can) can = Math.min(can, Math.max(left, makeRoom(node, can - left)));   // only what it can really scroll
    }
    if (can > 0.5) {
      scrollBy(node, can);
      need -= can;
      boxTop -= can;
    }
    if (node === win) break;
  }
  if (need <= 0.5) return;
  // 2. a window that still covers it slides up, as far as its own top allows
  if (win) {
    const lift = Math.min(need, win.getBoundingClientRect().top - MARGIN);
    if (lift <= 0.5) return;
    const rec = lifted.get(win);
    const prev = rec ? -parseFloat(win.style.translate.split(' ')[1] || '0') || 0 : 0;
    if (!rec) lifted.set(win, { el: win, translate: win.style.translate, transition: win.style.transition });
    win.style.transition = reduced() ? '' : `translate ${MS}ms cubic-bezier(.2,0,0,1)`;
    win.style.translate = `0 ${-(prev + lift)}px`;
    return;
  }
  // 3. else the page itself scrolls, with room at its foot when it is too short
  const page = document.scrollingElement ?? document.documentElement;
  const left = page.scrollHeight - page.clientHeight - page.scrollTop;
  if (left < need) {
    room ??= Object.assign(document.createElement('div'), { className: 'kb-room' });
    room.setAttribute('aria-hidden', 'true');
    room.style.height = `${(parseFloat(room.style.height) || 0) + need - left}px`;
    if (!room.isConnected) document.body.appendChild(room);
  }
  scrollBy(page, need);
}

/** The keyboard went down: everything glides back where it was (a list the user scrolled meanwhile stays). */
function restore(): void {
  const all = [...moved.values()];
  const lifts = [...lifted.values()];
  moved.clear();
  lifted.clear();
  for (const rec of lifts) {
    rec.el.style.transition = reduced() ? '' : `translate ${MS}ms cubic-bezier(.2,0,0,1)`;
    rec.el.style.translate = rec.translate;
    setTimeout(() => { if (!lifted.has(rec.el)) rec.el.style.transition = rec.transition; }, MS + 40);
  }
  const page = document.scrollingElement ?? document.documentElement;
  let pageBack = false;
  for (const rec of all) {
    const el = rec.el as HTMLElement;
    // a glide still on its way up is ours, not the user's: it stops and turns back from where it is
    const midway = gliding.has(el);
    if (midway) { cancelAnimationFrame(gliding.get(el) ?? 0); gliding.delete(el); }
    const untouched = midway || Math.abs(topOf(el) - rec.to) < 6;
    const drop = () => { if (rec.pad !== null && !moved.has(el)) el.style.paddingBottom = rec.pad; };
    if (untouched) glide(el, rec.from, drop); else drop();
    if (el === page) pageBack = untouched;
  }
  if (room) {
    const spacer = room;
    const off = () => { if (!moved.size && !lifted.size) { spacer.style.height = '0px'; spacer.remove(); } };
    if (pageBack) setTimeout(off, MS + 40); else off();
  }
}

/** Once, from the App. */
export function startSoftKeyboard(): void {
  if (started || typeof navigator === 'undefined' || typeof document === 'undefined') return;
  const vk = (navigator as Navigator & { virtualKeyboard?: EventTarget & { overlaysContent: boolean; boundingRect: DOMRect } }).virtualKeyboard;
  if (!vk || typeof vk.addEventListener !== 'function') return;
  try { vk.overlaysContent = true; } catch { return; }
  if (!vk.overlaysContent) return;
  started = true;
  vk.addEventListener('geometrychange', () => {
    const height = vk.boundingRect?.height ?? 0;
    const was = keyboardOverlay();
    setKeyboardOverlay(height);
    document.documentElement.style.setProperty('--kb-h', `${Math.round(height)}px`);
    if (height > 0) requestAnimationFrame(reveal);
    else if (was > 0) restore();
  });
  // another box while the keyboard stays up (Next on the keyboard, a tap on the next field)
  document.addEventListener('focusin', () => { if (keyboardOverlay() > 0) requestAnimationFrame(reveal); });
}
