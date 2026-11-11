import { Injectable, effect, signal } from '@angular/core';

/** The looks Go Epic can wear (Ajustes › Theme). */
export const THEMES = ['epic', 'office'] as const;
export type Theme = (typeof THEMES)[number];

/** This device's choice: each device keeps its own (an office computer can stay discreet while the phone stays Epic). */
export const THEME_KEY = 'go-epic-theme';
/** Ajustes › "Red time line": the Week board's now-line always red, even in a quiet theme ('1' = on, this device). */
export const RED_LINE_KEY = 'go-epic-red-line';
/** The browser bar colour of each theme (meta theme-color), the page colour. */
export const THEME_BAR: Record<Theme, string> = { epic: '#101b42', office: '#c6c9cd' };

/** A stored value read back: anything unknown is the Epic look. */
export function parseTheme(value: unknown): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : 'epic';
}

/**
 * The theme on <html data-theme="…"> (styles.css redefines the colours under html[data-theme='office']). index.html
 * sets it before Angular starts, so the page never flashes the other look; this keeps it, the meta theme-color and the
 * stored choice in step.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(parseTheme(read(THEME_KEY)));
  /** The now-line red whatever the theme (off: it goes with the theme; Epic's is red anyway). */
  readonly redLine = signal(read(RED_LINE_KEY) === '1');

  constructor() {
    effect(() => {
      const theme = this.theme();
      if (typeof document === 'undefined') return;
      document.documentElement.dataset['theme'] = theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_BAR[theme]);
      try { localStorage.setItem(THEME_KEY, theme); } catch { /* a view preference */ }
    });
    effect(() => {
      const red = this.redLine();
      if (typeof document === 'undefined') return;
      if (red) document.documentElement.dataset['redLine'] = ''; else delete document.documentElement.dataset['redLine'];
      try { localStorage.setItem(RED_LINE_KEY, red ? '1' : '0'); } catch { /* a view preference */ }
    });
  }

  set(theme: Theme): void {
    this.theme.set(theme);
  }
}

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
