import { THEMES, Theme } from './theme';

/**
 * The palette window a theme tile opens (Gianni: he chooses the activity colours of each theme himself). A palette is a named list of
 * colours; the theme it is chosen for draws its 8 activity slots (--act-0…7, week.model toneVar) from it, a shorter
 * palette going round its own colours (slot 7 of a 7-colour palette is its first). Each theme's own palette (the one it
 * had before, mirrored from styles.css) is its default, so nothing changes until he picks; Petal Punk's is "Pinks"
 * and Smoked Citrus's "Oranges" (his words). Sunrise, Neon, Orchard, Terra and Sober come from Epic Manager's Settings.
 */
export interface Palette { id: string; colors: readonly string[] }

export const PALETTES: readonly Palette[] = [
  { id: 'epic', colors: ['#a7e7e3', '#e1f3d0', '#e1d7ff', '#ffd5bd', '#ffc9d6', '#fff0a6', '#cde4ff', '#eadcc8'] },
  { id: 'pinkpop', colors: ['#f8c8da', '#fcd9c5', '#dccdf2', '#eeb08e', '#e897b2', '#d3eadf', '#c9a9c0', '#d4a777'] },
  { id: 'squeezeme', colors: ['#b2e6e6', '#cbe8c2', '#d6d3f6', '#fcd3bc', '#f7c6d3', '#f1d98a', '#a3c0ea', '#e0c9a0'] },
  { id: 'sunburnt', colors: ['#f2b2ae', '#c8dba0', '#d2cbe6', '#f8c292', '#f7e3a3', '#e8b65c', '#dcc3a8', '#cf9a68'] },
  { id: 'petalpunk', colors: ['#b0336a', '#963238', '#7d3f8c', '#8a5a74', '#9c2f86', '#7f4a48', '#4c1832', '#985468'] },
  { id: 'smokedcitrus', colors: ['#a84a0b', '#9c5200', '#7a1f10', '#a83c48', '#b33f1a', '#8a4a12', '#6e2c06', '#5e1420'] },
  { id: 'office', colors: ['#f4f0eb', '#f1f1f1', '#e5e8ee', '#f6faff', '#ebe8e2', '#fdf9f4', '#edf1f6', '#e8e8e8'] },
  { id: 'graphite', colors: ['#5a5a5a', '#606060', '#242424', '#707070', '#686868', '#1e1e1e', '#2c2c2c', '#161616'] },
  { id: 'goepiclight', colors: ['#1f3a8a', '#3a8f4f', '#6b5bd2', '#c26a15', '#d0457e', '#a67c0a', '#2f7fd6', '#9a7656'] },
  { id: 'goepicdark', colors: ['#4fd1c9', '#6fd68a', '#a59cff', '#ffa65a', '#ff7fab', '#f5c945', '#6cb6ff', '#d1ad84'] },
  // Epic Manager's palettes (frontend settings.component.ts), seven colours each
  { id: 'sunrise', colors: ['#ea580c', '#f59e0b', '#eab308', '#22c55e', '#0ea5e9', '#6366f1', '#d946ef'] },
  { id: 'neon', colors: ['#22d3ee', '#38bdf8', '#6366f1', '#a855f7', '#f472b6', '#fb7185', '#facc15'] },
  { id: 'orchard', colors: ['#16a34a', '#65a30d', '#0ea5e9', '#0284c7', '#7c3aed', '#db2777', '#b91c1c'] },
  { id: 'terra', colors: ['#7c2d12', '#9a3412', '#b45309', '#ca8a04', '#4d7c0f', '#15803d', '#0f766e'] },
  { id: 'sober', colors: ['#374151', '#4b5563', '#6b7280', '#9ca3af', '#71717a', '#52525b', '#3f3f46'] },
];

/** How many activity colours a theme draws (COLOR_CHOICES in week.model). */
export const SLOTS = 8;
/** This device's choices: { theme: paletteId } and { theme: edge only }. */
export const PALETTE_KEY = 'go-epic-palettes';
export const EDGE_KEY = 'go-epic-palette-edge';

export type PaletteChoices = Partial<Record<Theme, string>>;
export type EdgeChoices = Partial<Record<Theme, boolean>>;

/** The palette a theme had before: its own (every theme has one with its id). */
export function defaultPalette(theme: Theme): string {
  return theme;
}

/** The Go Epic themes draw only a left edge by default (their white cards); the others fill the card. */
export function defaultEdge(theme: Theme): boolean {
  return theme === 'goepiclight' || theme === 'goepicdark';
}

export function paletteById(id: string): Palette | undefined {
  return PALETTES.find((p) => p.id === id);
}

/** The palette chosen for a theme, its own when nothing (or something unknown) was chosen. */
export function paletteFor(theme: Theme, choices: PaletteChoices): Palette {
  return paletteById(choices[theme] ?? '') ?? paletteById(defaultPalette(theme))!;
}

export function edgeFor(theme: Theme, choices: EdgeChoices): boolean {
  const value = choices[theme];
  return typeof value === 'boolean' ? value : defaultEdge(theme);
}

/** The 8 slot colours of a palette (a shorter one goes round its own colours). */
export function slotColors(palette: Palette): string[] {
  return Array.from({ length: SLOTS }, (_, i) => palette.colors[i % palette.colors.length]);
}

/** Stored choices read back: unknown themes and palettes are dropped. */
export function parsePaletteChoices(value: unknown): PaletteChoices {
  const out: PaletteChoices = {};
  if (!value || typeof value !== 'object') return out;
  for (const theme of THEMES) {
    const id = (value as Record<string, unknown>)[theme];
    if (typeof id === 'string' && paletteById(id)) out[theme] = id;
  }
  return out;
}

export function parseEdgeChoices(value: unknown): EdgeChoices {
  const out: EdgeChoices = {};
  if (!value || typeof value !== 'object') return out;
  for (const theme of THEMES) {
    const on = (value as Record<string, unknown>)[theme];
    if (typeof on === 'boolean') out[theme] = on;
  }
  return out;
}

/**
 * What <html> needs for a theme: the slot colours to set inline (null = leave styles.css's own, the theme's default
 * palette), whether only the edge is drawn, and whether the card ink must be worked out from each card's colour (a
 * filled card in a palette the theme's inks were not made for).
 */
export function paletteLook(theme: Theme, palettes: PaletteChoices, edges: EdgeChoices): { slots: string[] | null; edge: boolean; autoInk: boolean } {
  const palette = paletteFor(theme, palettes);
  const own = palette.id === defaultPalette(theme);
  const edge = edgeFor(theme, edges);
  return { slots: own ? null : slotColors(palette), edge, autoInk: !edge && (!own || defaultEdge(theme)) };
}
