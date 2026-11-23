import { Injectable, computed, effect, signal } from '@angular/core';

/** The looks Go Epic can wear (Ajustes › Theme). */
export const THEMES = ['epic', 'pinkpop', 'petalpunk', 'squeezeme', 'sunburnt', 'smokedcitrus', 'office', 'graphite', 'goepiclight', 'goepicdark'] as const;
export type Theme = (typeof THEMES)[number];
/** Light and dark, four each: the themes button shows the light ones on its top row, the dark ones below (Gianni). */
/** Each column one family over its dark partner (Gianni): blue (Clear Sky over Epic), pink, orange, grey. */
export const LIGHT_THEMES: readonly Theme[] = ['squeezeme', 'pinkpop', 'sunburnt', 'office', 'goepiclight'];
export const DARK_THEMES: readonly Theme[] = ['epic', 'petalpunk', 'smokedcitrus', 'graphite', 'goepicdark'];

/** This device's choice: each device keeps its own (an office computer can stay discreet while the phone stays Epic). */
export const THEME_KEY = 'go-epic-theme';
/** Ajustes › "Red time line": the Week board's now-line always red, even in a quiet theme ('1' = on, this device). */
export const RED_LINE_KEY = 'go-epic-red-line';
/** The countdown bar red (default, Gianni) or with the theme: '0' when he unticks it. */
export const RED_COUNTDOWN_KEY = 'go-epic-red-countdown';
/** The browser bar colour of each theme (meta theme-color), the page colour. */
export const THEME_BAR: Record<Theme, string> = { epic: '#101b42', pinkpop: '#fbeaf3', petalpunk: '#1b141f', squeezeme: '#eef4fc', sunburnt: '#fff1e5', smokedcitrus: '#1a1918', office: '#c6c9cd', graphite: '#2b2e33', goepiclight: '#fbfbfd', goepicdark: '#0a1130' };

/**
 * The running activity's countdown bar (Gianni): red when the palette window's "Red countdown bar" box is ticked (the
 * default), otherwise the theme's own colour (Epic its pink, a quiet grey in Office and Graphite). Set on <html> as
 * --countdown by ThemeService, for the theme on screen. Epic used to have no colour of its own here, so unticking the
 * box changed nothing there (v73 fix).
 */
export const COUNTDOWN_RED: Record<Theme, string> = {
  epic: '#c9524c', graphite: '#d0524a', petalpunk: '#d0524a', smokedcitrus: '#d0524a', goepicdark: '#d0524a',
  office: '#c0392b', pinkpop: '#c0392b', squeezeme: '#c0392b', sunburnt: '#c0392b', goepiclight: '#c0392b',
};
export const COUNTDOWN_THEME: Record<Theme, string> = {
  epic: '#f4a8b7', office: '#5f6770', graphite: '#9aa2ab', pinkpop: '#b5546d', petalpunk: '#f2b3bf',
  squeezeme: '#3f5f9c', smokedcitrus: '#d7773f', sunburnt: '#a9522f', goepiclight: '#a87b14', goepicdark: '#f0cf6e',
};
export function countdownColour(theme: Theme, red: boolean): string {
  return (red ? COUNTDOWN_RED : COUNTDOWN_THEME)[theme];
}

/** How much black the Week's spotlight veil lays over the page (body::before, rgba(0, 0, 0, .2) in styles.css). */
export const BAR_VEIL = 0.2;
/** The veil fades in and out over this long (the same .6s as body::before), and the phone's top bar with it. */
export const BAR_GLIDE_MS = 600;

/** A #rrggbb colour with `amount` (0…1) of black laid over it, as a veil of rgba(0, 0, 0, amount) paints it. */
export function shadeBar(hex: string, amount: number): string {
  const a = Math.min(1, Math.max(0, amount));
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - a)).toString(16).padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

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
  /** The countdown bar red whatever the theme, on by default (Gianni); off, it goes with the theme (grey in Office and Graphite). */
  readonly redCountdown = signal(read(RED_COUNTDOWN_KEY) !== '0');
  /** True while a theme is only tried on (the palette window is open over the themes): it shows but is not stored. */
  private readonly trying = signal(false);
  /** A page that always wears one look whatever is chosen (the Canvas and its windows: Epic, Gianni), while it is open. */
  private readonly held = signal<Theme | null>(null);
  /** The look on screen: the held one, unless a theme is being tried on (the palette window shows what is picked). */
  readonly shown = computed<Theme>(() => (this.trying() ? null : this.held()) ?? this.theme());
  /**
   * True while the Week's spotlight veil darkens the page (the red line centred itself): the phone's top bar
   * (meta theme-color, which an installed app follows at once) darkens with it and brightens back when it lifts (Gianni).
   */
  readonly barVeil = signal(false);
  /** The veil's share now on the top bar (0…BAR_VEIL), gliding toward its target. */
  private barAmount = 0;
  private barFrame = 0;

  constructor() {
    effect(() => {
      const theme = this.theme();
      const shown = this.shown();
      const trying = this.trying();
      if (typeof document === 'undefined') return;
      document.documentElement.dataset['theme'] = shown;
      // the installed app keeps the chosen theme's manifest: a page's own look never repaints the phone's bars for a day
      document.querySelector('link[rel="manifest"]')?.setAttribute('href', manifestFor(theme));
      if (!trying) try { localStorage.setItem(THEME_KEY, theme); } catch { /* a view preference */ }
    });
    // the phone's top bar: the shown theme's page colour, under the spotlight's veil while it is on, gliding between them
    effect(() => {
      const colour = THEME_BAR[this.shown()];
      const target = this.barVeil() ? BAR_VEIL : 0;
      if (typeof document === 'undefined') return;
      this.glideBar(colour, target);
    });
    effect(() => {
      const red = this.redLine();
      if (typeof document === 'undefined') return;
      if (red) document.documentElement.dataset['redLine'] = ''; else delete document.documentElement.dataset['redLine'];
      try { localStorage.setItem(RED_LINE_KEY, red ? '1' : '0'); } catch { /* a view preference */ }
    });
    effect(() => {
      const red = this.redCountdown();
      if (typeof document === 'undefined') return;
      if (red) document.documentElement.dataset['redCountdown'] = ''; else delete document.documentElement.dataset['redCountdown'];
      try { localStorage.setItem(RED_COUNTDOWN_KEY, red ? '1' : '0'); } catch { /* a view preference */ }
    });
    // the countdown bar's colour, for the theme on screen (a theme tried on in the palette window included)
    effect(() => {
      const colour = countdownColour(this.shown(), this.redCountdown());
      if (typeof document === 'undefined') return;
      document.documentElement.style.setProperty('--countdown', colour);
    });
  }

  /** Moves the top bar's veil to `target` over BAR_GLIDE_MS, eased like the veil itself (at once under reduced motion). */
  private glideBar(colour: string, target: number): void {
    const meta = document.querySelector('meta[name="theme-color"]');
    const paint = () => meta?.setAttribute('content', shadeBar(colour, this.barAmount));
    if (this.barFrame) cancelAnimationFrame(this.barFrame);
    this.barFrame = 0;
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = this.barAmount;
    if (still || from === target || typeof requestAnimationFrame !== 'function') { this.barAmount = target; paint(); return; }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / BAR_GLIDE_MS);
      const eased = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      this.barAmount = from + (target - from) * eased;
      paint();
      this.barFrame = t < 1 ? requestAnimationFrame(step) : 0;
    };
    this.barFrame = requestAnimationFrame(step);
  }

  /** Puts the theme on and keeps it on this device. */
  set(theme: Theme): void {
    this.trying.set(false);
    this.theme.set(theme);
  }

  /** While a page is open it wears this look, whatever theme is chosen; null lets the chosen theme back. */
  hold(theme: Theme | null): void {
    this.held.set(theme);
  }

  /** Shows the theme without keeping it (the palette window's live preview); set() keeps it, or puts the old one back. */
  preview(theme: Theme): void {
    this.trying.set(true);
    this.theme.set(theme);
  }
}

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
