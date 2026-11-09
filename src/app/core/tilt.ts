import { Injectable, signal } from '@angular/core';

/*
 * Buttons with weight (Gianni, a visual detail only): when the phone leans to one side, every button leans a little
 * and slides down towards the lower side, the farther ones more, so they pile up on top of each other against that
 * edge; held upright, they spring back into place. Read from the device's
 * orientation (`deviceorientation`, gamma = left/right tilt), only in portrait. Nothing changes under reduced motion.
 * iPhone asks for permission (motion and orientation) the first time, after a tap; Android does not ask.
 * The choice is a per-device view preference (`go-epic-tilt`, '0' = off; on by default).
 */

/** Below this many degrees of tilt the phone counts as upright: buttons stand straight. */
export const TILT_DEAD_ZONE = 4;
/** The most a button turns (degrees), and the share of its distance to the lower edge it slides at full tilt. */
export const TILT_MAX_DEG = 5;
export const TILT_PILE = 0.55;

/**
 * How much the buttons lean for a device tilt (`gamma`, degrees, + = right side down) and screen angle (0 = portrait):
 * `deg` counter-clockwise (negative) with the right side down, so a button's foot swings to the low side, and `k`
 * the signed lean from -1 (left down) to 1 (right down); zero in the dead zone, in landscape or without a reading.
 */
export function tiltOf(gamma: number | null | undefined, screenAngle = 0): { deg: number; k: number } {
  if (gamma == null || !Number.isFinite(gamma) || ((screenAngle % 360) + 360) % 360 !== 0) return { deg: 0, k: 0 };
  const g = Math.max(-90, Math.min(90, gamma));
  if (Math.abs(g) < TILT_DEAD_ZONE) return { deg: 0, k: 0 };
  const lean = (Math.abs(g) - TILT_DEAD_ZONE) / (60 - TILT_DEAD_ZONE);  // full lean at 60°
  const k = Math.sign(g) * Math.min(1, lean);
  return { deg: Math.round(-k * TILT_MAX_DEG * 10) / 10 || 0, k: Math.round(k * 100) / 100 || 0 };
}

/**
 * How far (px) a button slides for a lean `k` (-1…1), given the free room between it and each screen edge (`roomLeft`,
 * `roomRight`, px, at rest): a share (`TILT_PILE × |k|`) of the room on the lower side, so the farther buttons travel
 * more and pile up against that edge, and none ever leaves the screen. The same formula as `html.tilt button` in styles.css.
 */
export function pileShift(k: number, roomLeft: number, roomRight: number): number {
  return (Math.max(k, 0) * Math.max(0, roomRight) + Math.min(k, 0) * Math.max(0, roomLeft)) * TILT_PILE;
}

const STORAGE_KEY = 'go-epic-tilt';
type PermissionFn = () => Promise<'granted' | 'denied'>;

@Injectable({ providedIn: 'root' })
export class Tilt {
  /** The switch in the menu. */
  readonly on = signal(readPref());
  private listening = false;
  private frame = 0;
  private last = { deg: 0, k: 0 };
  private next = { deg: 0, k: 0 };
  private measuredAt = 0;

  /** Called once by the shell: starts listening (on iPhone, after the first tap grants it). */
  start(): void {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
    if (reducedMotion()) return;
    if (!this.on()) return;
    if (needsPermission()) {
      // iPhone only asks after a user gesture: the first tap anywhere asks once.
      const ask = () => { void this.enable(); };
      addEventListener('pointerup', ask, { once: true, capture: true });
    } else {
      this.listen();
    }
  }

  /** The menu switch. Turning it on asks for permission on iPhone (this is a tap, so it may). */
  async toggle(): Promise<void> {
    if (this.on()) {
      this.on.set(false);
      savePref(false);
      this.stop();
      return;
    }
    this.on.set(true);
    savePref(true);
    await this.enable();
  }

  private async enable(): Promise<void> {
    if (!this.on() || reducedMotion()) return;
    const request = (DeviceOrientationEvent as unknown as { requestPermission?: PermissionFn }).requestPermission;
    if (request) {
      let answer: string;
      try { answer = await request(); } catch { answer = 'denied'; }
      if (answer !== 'granted') { this.on.set(false); savePref(false); return; }
    }
    this.listen();
  }

  private listen(): void {
    if (this.listening) return;
    this.listening = true;
    addEventListener('deviceorientation', this.onOrientation);
    document.documentElement.classList.add('tilt');
  }

  private stop(): void {
    this.listening = false;
    removeEventListener('deviceorientation', this.onOrientation);
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.last = { deg: 0, k: 0 };
    const root = document.documentElement;
    root.style.removeProperty('--tilt-r');
    root.style.removeProperty('--tilt-k');
    root.classList.remove('tilt');
  }

  private readonly onOrientation = (event: DeviceOrientationEvent): void => {
    const angle = screen.orientation?.angle ?? 0;
    this.next = tiltOf(event.gamma, angle);
    if (!this.frame) this.frame = requestAnimationFrame(this.paint);   // at most once per frame
  };

  private readonly paint = (): void => {
    this.frame = 0;
    const { deg, k } = this.next;
    // While leaning, each button's place across the screen is read again now and then (layouts change: a dialog, a
    // scroll), so the pile follows what is on screen.
    if (k !== 0 && performance.now() - this.measuredAt > 400) this.measure();
    if (Math.abs(deg - this.last.deg) < 0.2 && Math.abs(k - this.last.k) < 0.02) return;
    this.last = { deg, k };
    const root = document.documentElement;
    root.style.setProperty('--tilt-r', deg + 'deg');
    root.style.setProperty('--tilt-k', String(k));
  };

  /**
   * Writes each button's free room to the left and right at rest (`--tilt-rl`/`--tilt-rr`, px, its current slide taken
   * off), up to the nearest box that clips it (a panel with overflow hidden/auto, a dialog) or else the screen, so a
   * sliding button never disappears behind its panel's edge.
   */
  private measure(): void {
    this.measuredAt = performance.now();
    const width = document.documentElement.clientWidth || innerWidth;
    const bounds = new Map<Element, { left: number; right: number }>();
    for (const b of Array.from(document.querySelectorAll<HTMLElement>('button'))) {
      const r = b.getBoundingClientRect();
      if (!r.width) continue;
      const slid = parseFloat(getComputedStyle(b).translate) || 0;
      const box = clipBox(b, width, bounds);
      b.style.setProperty('--tilt-rl', Math.max(0, Math.round(r.left - slid - box.left)) + 'px');
      b.style.setProperty('--tilt-rr', Math.max(0, Math.round(box.right - r.right + slid)) + 'px');
    }
  }
}

/** The horizontal edges of the nearest ancestor that clips `el` (overflow other than visible, or a dialog), within the screen. */
function clipBox(el: HTMLElement, width: number, cache: Map<Element, { left: number; right: number }>): { left: number; right: number } {
  for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
    const known = cache.get(a);
    if (known) return known;
    const style = getComputedStyle(a);
    if (a.tagName === 'DIALOG' || style.overflowX !== 'visible') {
      const r = a.getBoundingClientRect();
      const box = { left: Math.max(0, r.left), right: Math.min(width, r.right) };
      cache.set(a, box);
      return box;
    }
  }
  return { left: 0, right: width };
}

/** Reduced motion asked (or no way to know, e.g. a test DOM without matchMedia: then no motion either). */
function reducedMotion(): boolean {
  return typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function needsPermission(): boolean {
  return typeof (DeviceOrientationEvent as unknown as { requestPermission?: PermissionFn }).requestPermission === 'function';
}
function readPref(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== '0'; } catch { return true; }
}
function savePref(on: boolean): void {
  try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch { /* a view preference only */ }
}
