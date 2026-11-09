import { Injectable, signal } from '@angular/core';

/*
 * Buttons with weight (Gianni, a visual detail only): when the phone leans to one side, every button leans a little
 * towards the lower side, as if it hung there; held upright, they stand straight again. Read from the device's
 * orientation (`deviceorientation`, gamma = left/right tilt), only in portrait. Nothing changes under reduced motion.
 * iPhone asks for permission (motion and orientation) the first time, after a tap; Android does not ask.
 * The choice is a per-device view preference (`go-epic-tilt`, '0' = off; on by default).
 */

/** Below this many degrees of tilt the phone counts as upright: buttons stand straight. */
export const TILT_DEAD_ZONE = 4;
/** The most a button turns (degrees) and moves sideways (px). */
export const TILT_MAX_DEG = 5;
export const TILT_MAX_PX = 2;

/**
 * How much a button leans for a device tilt (`gamma`, degrees, + = right side down) and screen angle (0 = portrait).
 * Counter-clockwise (negative degrees) with the right side down, so the button's foot swings to the low side;
 * zero in the dead zone, in landscape or without a reading.
 */
export function tiltOf(gamma: number | null | undefined, screenAngle = 0): { deg: number; px: number } {
  if (gamma == null || !Number.isFinite(gamma) || ((screenAngle % 360) + 360) % 360 !== 0) return { deg: 0, px: 0 };
  const g = Math.max(-90, Math.min(90, gamma));
  if (Math.abs(g) < TILT_DEAD_ZONE) return { deg: 0, px: 0 };
  const lean = (Math.abs(g) - TILT_DEAD_ZONE) / (60 - TILT_DEAD_ZONE);  // full lean at 60°
  const k = Math.sign(g) * Math.min(1, lean);
  const round = (n: number) => Math.round(n * 10) / 10 || 0;
  return { deg: round(-k * TILT_MAX_DEG), px: round(k * TILT_MAX_PX) };
}

const STORAGE_KEY = 'go-epic-tilt';
type PermissionFn = () => Promise<'granted' | 'denied'>;

@Injectable({ providedIn: 'root' })
export class Tilt {
  /** The switch in the menu. */
  readonly on = signal(readPref());
  private listening = false;
  private frame = 0;
  private last = { deg: 0, px: 0 };
  private next = { deg: 0, px: 0 };

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
    this.last = { deg: 0, px: 0 };
    const root = document.documentElement;
    root.style.removeProperty('--tilt-r');
    root.style.removeProperty('--tilt-x');
    root.classList.remove('tilt');
  }

  private readonly onOrientation = (event: DeviceOrientationEvent): void => {
    const angle = screen.orientation?.angle ?? 0;
    this.next = tiltOf(event.gamma, angle);
    if (!this.frame) this.frame = requestAnimationFrame(this.paint);   // at most once per frame
  };

  private readonly paint = (): void => {
    this.frame = 0;
    const { deg, px } = this.next;
    if (Math.abs(deg - this.last.deg) < 0.2 && Math.abs(px - this.last.px) < 0.2) return;
    this.last = { deg, px };
    const root = document.documentElement;
    root.style.setProperty('--tilt-r', deg + 'deg');
    root.style.setProperty('--tilt-x', px + 'px');
  };
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
