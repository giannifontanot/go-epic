import { Injectable, effect, inject, signal } from '@angular/core';
import { ThemeService, Theme } from './theme';
import { EDGE_KEY, EdgeChoices, PALETTE_KEY, PaletteChoices, SLOTS, paletteLook, parseEdgeChoices, parsePaletteChoices } from './palette.model';

/**
 * The palette each theme draws its activities with, and whether only their left edge wears it (chosen in the window a
 * theme opens when its tile is tapped, kept on this device like the theme). It sets the chosen colours inline on <html> as --act-0…7 (over styles.css's
 * own), and <html data-edge> / <html data-auto-ink> for styles.css's edge-only cards and the ink worked out from each
 * card's colour.
 */
@Injectable({ providedIn: 'root' })
export class PaletteService {
  private readonly theme = inject(ThemeService);
  readonly palettes = signal<PaletteChoices>(parsePaletteChoices(readJson(PALETTE_KEY)));
  readonly edges = signal<EdgeChoices>(parseEdgeChoices(readJson(EDGE_KEY)));

  constructor() {
    effect(() => {
      const look = paletteLook(this.theme.shown(), this.palettes(), this.edges());
      if (typeof document === 'undefined') return;
      const root = document.documentElement;
      for (let i = 0; i < SLOTS; i++) {
        if (look.slots) root.style.setProperty(`--act-${i}`, look.slots[i]); else root.style.removeProperty(`--act-${i}`);
      }
      toggle(root, 'edge', look.edge);
      toggle(root, 'autoInk', look.autoInk);
    });
  }

  /** Shows a palette for a theme at once; save() keeps it on this device, restore() takes it back. */
  setPalette(theme: Theme, id: string): void {
    this.palettes.update((p) => ({ ...p, [theme]: id }));
  }

  /** Shows (or hides) Only the edge for a theme at once; save() keeps it, restore() takes it back. */
  setEdge(theme: Theme, on: boolean): void {
    this.edges.update((e) => ({ ...e, [theme]: on }));
  }

  /** What is chosen now, to put back if the window is closed without OK. */
  snapshot(): { palettes: PaletteChoices; edges: EdgeChoices } {
    return { palettes: this.palettes(), edges: this.edges() };
  }

  restore(saved: { palettes: PaletteChoices; edges: EdgeChoices }): void {
    this.palettes.set(saved.palettes);
    this.edges.set(saved.edges);
  }

  /** Keeps what is shown (the palette window's OK). */
  save(): void {
    writeJson(PALETTE_KEY, this.palettes());
    writeJson(EDGE_KEY, this.edges());
  }
}

function toggle(root: HTMLElement, key: string, on: boolean): void {
  if (on) root.dataset[key] = ''; else delete root.dataset[key];
}

function readJson(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}

function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* a view preference */ }
}
