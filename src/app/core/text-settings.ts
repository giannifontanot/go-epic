import { Injectable, signal } from '@angular/core';

/*
 * Text size (Aa) and space between letters (AV), as in Epic Manager's Seed Board 2: two − / + steppers at the top of the
 * Week board, shown only while arranging, so the change is seen at once on the real cards (Gianni).
 * The activities (and their stories) take the size chosen; every other label of the app grows with it more gently
 * (`textScale`), so an 8px "FEATURE" over a 10px activity becomes about 9px when the activity goes to 12px.
 * A third stepper, px, sets how many pixels a minute takes on the cards and free bands (`pxPerMin`, --px-min).
 * Saved on this device (`go-epic-text`); applied as CSS variables on <html>: --act-fs, --esc, --app-ls, --px-min (styles.css).
 * A step glides (Gianni: more grows big, softly; less shrinks small, softly): the variables move from what is on screen
 * to the new value over `LOOK_GLIDE_MS`, so the cards, texts and free bands grow or shrink with it; at once under
 * reduced motion.
 */

export const TEXT_DEFAULT_SIZE = 15;
export const TEXT_MIN_SIZE = 12;
export const TEXT_MAX_SIZE = 26;
export const TEXT_MAX_SPACING = 0.15;
export const TEXT_MIN_SPACING = -0.02;
/** The Aa stepper's sizes (85 %, 100 %, 115 %, 130 %, 150 % of 15px) and the AV stepper's spacings, as in Epic Manager. */
export const TEXT_SIZES = [13, 15, 17, 19.5, 22.5];
export const TEXT_SPACINGS = [-0.02, 0, 0.03, 0.06, 0.1];
/**
 * The px stepper (Epic Manager's length zoom): how many pixels each minute of an activity (and of a block's free time)
 * takes on the Week board.
 */
export const PX_PER_MIN_STEPS = [0.3, 0.5, 0.7, 1, 1.4];
/**
 * Half a pixel a minute by default (Gianni: at 1 the activities were already as tall as he wants them at most, so px
 * could only make them huge; a panel: start thin, a 60-minute card about 64px, with room to grow to the old size and
 * a little past it).
 */
export const PX_PER_MIN_DEFAULT = 0.5;
/** This version of the scale; a value saved under an older one was the old default saved with Aa / AV and reads as unset. */
const PX_VERSION = 3;
/** A saved or typed scale kept inside the stepper's range (anything not a number falls back to the default). */
export function clampPxPerMin(px: unknown): number {
  const n = typeof px === 'number' && Number.isFinite(px) ? px : PX_PER_MIN_DEFAULT;
  return Math.min(PX_PER_MIN_STEPS[PX_PER_MIN_STEPS.length - 1], Math.max(PX_PER_MIN_STEPS[0], n));
}

/** The next value of a stepper (`dir` = +1 / -1) from the current one: the nearest step, then one up or down. */
export function stepValue(steps: number[], current: number, dir: 1 | -1): number {
  let i = 0;
  for (let k = 1; k < steps.length; k++) if (Math.abs(steps[k] - current) < Math.abs(steps[i] - current)) i = k;
  return steps[Math.min(steps.length - 1, Math.max(0, i + dir))];
}

/**
 * The scale for every other label when the activities' text is `size` px: 60% of the activities' own change (an expert
 * panel's pick: labels and buttons stay readable without crowding the phone's width), kept between 0.9× and 1.5×.
 */
export function textScale(size: number): number {
  const s = Math.min(TEXT_MAX_SIZE, Math.max(TEXT_MIN_SIZE, Number.isFinite(size) ? size : TEXT_DEFAULT_SIZE));
  const scale = 1 + (s / TEXT_DEFAULT_SIZE - 1) * 0.6;
  return Math.round(Math.min(1.5, Math.max(0.9, scale)) * 1000) / 1000;
}

/** Letter spacing for the rest of the app: half the chosen one, at most 0.06em, so buttons and titles never overflow. */
export function appSpacing(spacing: number): number {
  const sp = Math.min(TEXT_MAX_SPACING, Math.max(TEXT_MIN_SPACING, Number.isFinite(spacing) ? spacing : 0));
  return Math.round(Math.min(0.06, sp / 2) * 1000) / 1000 || 0;
}

/** How long a step of px, Aa or AV glides (slow and soft, like the app's other motions). */
export const LOOK_GLIDE_MS = 700;

/** What the three steppers set, as drawn on screen. */
export interface Look { size: number; spacing: number; px: number }

/** Ease in and out (cubic): the glide starts and ends softly. `t` is kept in 0…1. */
export function glideEase(t: number): number {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 1));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** The look a fraction `k` (0…1) of the way from `from` to `to`. */
export function lookBetween(from: Look, to: Look, k: number): Look {
  const at = (a: number, b: number) => (k >= 1 ? b : k <= 0 ? a : a + (b - a) * k);
  return { size: at(from.size, to.size), spacing: at(from.spacing, to.spacing), px: at(from.px, to.px) };
}

const KEY = 'go-epic-text';

@Injectable({ providedIn: 'root' })
export class TextSettings {
  readonly size = signal(TEXT_DEFAULT_SIZE);
  readonly spacing = signal(0);
  /** Pixels per minute on the Week board's cards and free bands (the px stepper). */
  readonly pxPerMin = signal(PX_PER_MIN_DEFAULT);
  /** What is on screen now (mid-glide, between the old value and the chosen one). */
  private drawn: Look | null = null;
  private frame = 0;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { size?: number; spacing?: number; px?: number; pxv?: number } | null;
      // a scale saved under an older version was only that version's default (saved with Aa / AV): the new default
      if (saved && saved.px !== undefined && saved.pxv === PX_VERSION) this.pxPerMin.set(clampPxPerMin(saved.px));
      if (saved && Number.isFinite(saved.size)) this.size.set(Math.min(TEXT_MAX_SIZE, Math.max(TEXT_MIN_SIZE, saved.size!)));
      if (saved && Number.isFinite(saved.spacing)) this.spacing.set(Math.min(TEXT_MAX_SPACING, Math.max(TEXT_MIN_SPACING, saved.spacing!)));
    } catch { /* a view preference only */ }
    this.apply();
  }

  /** `keep`, when given, runs after every frame of the glide (the page keeping its middle card where it was). */
  set(size: number, spacing: number, keep?: () => void): void {
    this.size.set(Math.min(TEXT_MAX_SIZE, Math.max(TEXT_MIN_SIZE, size)));
    this.spacing.set(Math.min(TEXT_MAX_SPACING, Math.max(TEXT_MIN_SPACING, spacing)));
    this.save(keep);
  }

  private save(keep?: () => void): void {
    try { localStorage.setItem(KEY, JSON.stringify({ size: this.size(), spacing: this.spacing(), px: this.pxPerMin(), pxv: PX_VERSION })); } catch { /* view preference */ }
    this.glide(keep);
  }

  reset(): void {
    this.set(TEXT_DEFAULT_SIZE, 0);
  }

  /** The Aa stepper: one size up (+1) or down (-1). */
  stepSize(dir: 1 | -1, keep?: () => void): void {
    this.set(stepValue(TEXT_SIZES, this.size(), dir), this.spacing(), keep);
  }
  /** The AV stepper: a little more (+1) or less (-1) space between letters. */
  stepSpacing(dir: 1 | -1, keep?: () => void): void {
    this.set(this.size(), stepValue(TEXT_SPACINGS, this.spacing(), dir), keep);
  }
  /** The px stepper: a minute takes more (+1) or fewer (-1) pixels. */
  stepPx(dir: 1 | -1, keep?: () => void): void {
    this.pxPerMin.set(stepValue(PX_PER_MIN_STEPS, this.pxPerMin(), dir));
    this.save(keep);
  }
  canStep(kind: 'size' | 'spacing' | 'px', dir: 1 | -1): boolean {
    const steps = kind === 'size' ? TEXT_SIZES : kind === 'spacing' ? TEXT_SPACINGS : PX_PER_MIN_STEPS;
    const cur = kind === 'size' ? this.size() : kind === 'spacing' ? this.spacing() : this.pxPerMin();
    return dir === 1 ? cur < steps[steps.length - 1] : cur > steps[0];
  }

  private target(): Look {
    return { size: this.size(), spacing: this.spacing(), px: this.pxPerMin() };
  }

  /** Straight to the chosen look (on start, and under reduced motion). */
  private apply(): void {
    if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
    this.draw(this.target());
  }

  /**
   * From what is on screen to the chosen look, softly; a tap during a glide starts the next one from where it is.
   */
  private glide(keep?: () => void): void {
    const from = this.drawn;
    const reduced = typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!from || reduced || typeof requestAnimationFrame !== 'function' || typeof performance === 'undefined') {
      this.apply();
      keep?.();
      return;
    }
    if (this.frame) cancelAnimationFrame(this.frame);
    const to = this.target();
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / LOOK_GLIDE_MS;
      this.draw(lookBetween(from, to, glideEase(t)));
      keep?.();
      this.frame = t < 1 ? requestAnimationFrame(tick) : 0;
    };
    this.frame = requestAnimationFrame(tick);
  }

  private draw(look: Look): void {
    this.drawn = look;
    if (typeof document === 'undefined') return;
    const root = document.documentElement.style;
    root.setProperty('--act-fs', round(look.size) + 'px');
    root.setProperty('--act-ls', round(look.spacing, 4) + 'em');
    root.setProperty('--esc', String(textScale(look.size)));
    root.setProperty('--px-min', round(look.px, 4) + 'px');
    const ls = appSpacing(look.spacing);
    root.setProperty('--app-ls', ls ? ls + 'em' : 'normal');
  }
}

/** A value written to CSS, without a long tail of digits. */
function round(n: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
