import { Injectable, effect, signal } from '@angular/core';

/** The looks Go Epic can wear (Ajustes › Theme). */
export const THEMES = ['epic', 'pinkpop', 'petalpunk', 'squeezeme', 'sunburnt', 'smokedcitrus', 'office', 'graphite'] as const;
export type Theme = (typeof THEMES)[number];

/** This device's choice: each device keeps its own (an office computer can stay discreet while the phone stays Epic). */
export const THEME_KEY = 'go-epic-theme';
/** Ajustes › "Red time line": the Week board's now-line always red, even in a quiet theme ('1' = on, this device). */
export const RED_LINE_KEY = 'go-epic-red-line';
/** The browser bar colour of each theme (meta theme-color), the page colour. */
export const THEME_BAR: Record<Theme, string> = { epic: '#101b42', pinkpop: '#fbeaf3', petalpunk: '#1b141f', squeezeme: '#fff6ef', sunburnt: '#fff1e5', smokedcitrus: '#1a1918', office: '#c6c9cd', graphite: '#2b2e33' };

/**
 * The web app manifest of a theme: the same app with the theme's page colour as its theme and background colour, so
 * the installed app (Android's bottom bar, the splash, the task switcher) takes the theme's colour when Chrome next
 * updates it (Gianni). Epic keeps the original file; the others are public/manifest-<theme>.webmanifest.
 */
export function manifestFor(theme: Theme): string {
  return theme === 'epic' ? 'manifest.webmanifest' : `manifest-${theme}.webmanifest`;
}

/** A stored value read back: anything unknown is the Epic look. */
export function parseTheme(value: unknown): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : 'epic';
}

/**
 * The theme on <html data-theme="…"> (styles.css redefines the colours for each theme but Epic). index.html
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
      document.querySelector('link[rel="manifest"]')?.setAttribute('href', manifestFor(theme));
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
