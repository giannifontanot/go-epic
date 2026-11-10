import { Injectable, signal } from '@angular/core';

/*
 * Text size (Aa) and space between letters (AV), as in Epic Manager's Seed Board 2: two − / + steppers at the top of the
 * Week board, shown only while arranging, so the change is seen at once on the real cards (Gianni).
 * The activities (and their stories) take the size chosen; every other label of the app grows with it more gently
 * (`textScale`), so an 8px "FEATURE" over a 10px activity becomes about 9px when the activity goes to 12px.
 * Saved on this device (`go-epic-text`); applied as CSS variables on <html>: --act-fs, --esc, --app-ls (styles.css).
 */

export const TEXT_DEFAULT_SIZE = 15;
export const TEXT_MIN_SIZE = 12;
export const TEXT_MAX_SIZE = 26;
export const TEXT_MAX_SPACING = 0.15;
export const TEXT_MIN_SPACING = -0.02;
/** The Aa stepper's sizes (85 %, 100 %, 115 %, 130 %, 150 % of 15px) and the AV stepper's spacings, as in Epic Manager. */
export const TEXT_SIZES = [13, 15, 17, 19.5, 22.5];
export const TEXT_SPACINGS = [-0.02, 0, 0.03, 0.06, 0.1];

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

const KEY = 'go-epic-text';

@Injectable({ providedIn: 'root' })
export class TextSettings {
  readonly size = signal(TEXT_DEFAULT_SIZE);
  readonly spacing = signal(0);

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { size?: number; spacing?: number } | null;
      if (saved && Number.isFinite(saved.size)) this.size.set(Math.min(TEXT_MAX_SIZE, Math.max(TEXT_MIN_SIZE, saved.size!)));
      if (saved && Number.isFinite(saved.spacing)) this.spacing.set(Math.min(TEXT_MAX_SPACING, Math.max(TEXT_MIN_SPACING, saved.spacing!)));
    } catch { /* a view preference only */ }
    this.apply();
  }

  set(size: number, spacing: number): void {
    this.size.set(Math.min(TEXT_MAX_SIZE, Math.max(TEXT_MIN_SIZE, size)));
    this.spacing.set(Math.min(TEXT_MAX_SPACING, Math.max(TEXT_MIN_SPACING, spacing)));
    try { localStorage.setItem(KEY, JSON.stringify({ size: this.size(), spacing: this.spacing() })); } catch { /* view preference */ }
    this.apply();
  }

  reset(): void {
    this.set(TEXT_DEFAULT_SIZE, 0);
  }

  /** The Aa stepper: one size up (+1) or down (-1). */
  stepSize(dir: 1 | -1): void {
    this.set(stepValue(TEXT_SIZES, this.size(), dir), this.spacing());
  }
  /** The AV stepper: a little more (+1) or less (-1) space between letters. */
  stepSpacing(dir: 1 | -1): void {
    this.set(this.size(), stepValue(TEXT_SPACINGS, this.spacing(), dir));
  }
  canStep(kind: 'size' | 'spacing', dir: 1 | -1): boolean {
    const steps = kind === 'size' ? TEXT_SIZES : TEXT_SPACINGS;
    const cur = kind === 'size' ? this.size() : this.spacing();
    return dir === 1 ? cur < steps[steps.length - 1] : cur > steps[0];
  }

  private apply(): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement.style;
    root.setProperty('--act-fs', this.size() + 'px');
    root.setProperty('--act-ls', this.spacing() + 'em');
    root.setProperty('--esc', String(textScale(this.size())));
    const ls = appSpacing(this.spacing());
    root.setProperty('--app-ls', ls ? ls + 'em' : 'normal');
  }
}
