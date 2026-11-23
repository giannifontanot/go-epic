import { Component, ElementRef, Injectable, Injector, afterNextRender, effect, inject, signal, untracked, viewChild, viewChildren } from '@angular/core';
import { I18n } from '../core/i18n';
import { closeDialog, isBackdropClick, openDialog } from '../core/dialog';
import { PaletteService } from '../core/palette';
import { PALETTES, defaultPalette, edgeFor, paletteFor } from '../core/palette.model';
import { flyTiles, placeBelow, placeLeft } from './fan';
import { DARK_THEMES, LIGHT_THEMES, THEME_BAR, Theme, ThemeService } from '../core/theme';


/** Who asks for the themes: the button they fan out of (the edit bar's Themes), or null while they are away. */
@Injectable({ providedIn: 'root' })
export class ThemePicker {
  readonly anchor = signal<HTMLElement | null>(null);
  /** The edit bar's Themes button: opens the themes from it, or draws them back. */
  toggle(button: HTMLElement): void {
    this.anchor.set(this.anchor() === button ? null : button);
  }
  /** Counts the palette window's OKs: the menu the themes came out of closes too (Gianni: ready to work again). */
  readonly finished = signal(0);
  finish(): void {
    this.anchor.set(null);
    this.finished.update((n) => n + 1);
  }
}

/**
 * The themes (Gianni): the edit bar's Themes button fans the ten themes out of it into two straight columns of
 * five square tiles (the dark themes on the left, the light ones on the right, each row one family; they never lean), each a little picture of the theme in its own colours, which never change
 * with the theme that is on; a tap on a tile puts that theme on behind and opens its palette window (Gianni): only the
 * palettes (a tap shows one at once) and Only the edge below them, then OK, which keeps the theme, its palette and its
 * edge and closes everything (the window, the themes and the menu they came from). Closing the window without OK (×,
 * Esc, the backdrop) puts back what was kept and leaves the themes open. A tap outside, Esc or the button again draws
 * the themes back into it. Under reduced motion they simply appear
 * and go. Drawn by the App, outside the page (a grey theme's filter on the page would move and grey the tiles), under
 * the button as far as the screen allows. Ajustes holds the language, the weighted buttons and the red time line.
 */
@Component({
  selector: 'app-theme-fan',
  template: `
    @if (open()) {
      <!-- a div, not a button: buttons lean with the phone, and a leaning veil would leave the board tappable at its edges -->
      <div class="theme-fan-veil" aria-hidden="true" (click)="close()"></div>
      <div #fanBox id="theme-fan" class="theme-fan" role="radiogroup" [attr.aria-label]="i18n.t('settings.theme')">
        @for (theme of themes; track theme) {
          <button #tile type="button" class="theme-tile" role="radio" [attr.data-preview]="theme" [class.dark]="dark.has(theme)"
                  [style.--tile-bg]="bar[theme]" [attr.aria-checked]="look.theme() === theme"
                  [class.on]="look.theme() === theme" (click)="choose(theme)">
            <span class="theme-preview" aria-hidden="true">
              <span class="tp-day"><span class="tp-block"><span class="tp-card"></span><span class="tp-card"></span></span></span>
            </span>
            <span class="theme-tile-name">{{ i18n.t('theme.' + theme) }}</span>
            @if (look.theme() === theme) { <span class="theme-tile-check" aria-hidden="true">✓</span> }
          </button>
        }
      </div>
    }
    <!-- the theme's palette window: only the palettes, Only the edge, OK (Gianni) -->
    <dialog #paletteWindow class="settings-window palette-window" aria-labelledby="palette-window-title"
            (click)="onBackdrop($event)" (cancel)="$event.preventDefault(); cancel()">
      <header class="settings-head">
        <h2 id="palette-window-title" tabindex="-1">{{ i18n.t('palette.title') }} · {{ i18n.t('theme.' + look.theme()) }}</h2>
        <button type="button" class="drawer-close" [attr.aria-label]="i18n.t('nav.close')" (click)="cancel()">×</button>
      </header>
      <div class="palette-list" role="radiogroup" aria-labelledby="palette-window-title">
        @for (p of palettes; track p.id) {
          <!-- the theme's own palette is the suggested one (Gianni, v56): a halo round its colours, «Sugerido» above it at the right -->
          <button type="button" role="radio" class="palette-row" [class.on]="chosen().id === p.id" [class.suggested]="p.id === ownPalette()"
                  [attr.aria-checked]="chosen().id === p.id" (click)="palette.setPalette(look.theme(), p.id)">
            <span class="palette-name">{{ i18n.t('palette.' + p.id) }}</span>
            @if (p.id === ownPalette()) { <span class="palette-suggested">{{ i18n.t('palette.suggested') }}</span> }
            <span class="palette-swatches" aria-hidden="true">
              @for (c of p.colors; track $index) { <i [style.background]="c"></i> }
            </span>
            <span class="palette-tick" aria-hidden="true">{{ chosen().id === p.id ? '✓' : '' }}</span>
          </button>
        }
      </div>
      <label class="setting-row edge-row">
        <input type="checkbox" class="setting-check" [checked]="edge()" (change)="palette.setEdge(look.theme(), $any($event.target).checked)" />
        <span class="setting-text">
          <strong><span class="edge-sample" aria-hidden="true"></span>{{ i18n.t('palette.edge') }}</strong>
          <small>{{ i18n.t('palette.edgeHint') }}</small>
        </span>
      </label>
      <footer class="settings-foot">
        <button type="button" class="primary btn-apply palette-ok" (click)="ok()">OK</button>
      </footer>
    </dialog>
  `,
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class ThemeFan {
  protected readonly i18n = inject(I18n);
  protected readonly look = inject(ThemeService);
  private readonly picker = inject(ThemePicker);
  /** Two columns, dark on the left and light on the right, row by row a family (Epic | Clear Sky, Petal Punk | Pink Pop…);
   *  each tile keeps its own theme's colours whatever look is on. */
  protected readonly themes: readonly Theme[] = DARK_THEMES.flatMap((dark, i) => [dark, LIGHT_THEMES[i]]);
  protected readonly dark = new Set<Theme>(DARK_THEMES);
  protected readonly bar = THEME_BAR;
  protected readonly open = signal(false);
  private readonly injector = inject(Injector);
  private readonly fanBox = viewChild<ElementRef<HTMLElement>>('fanBox');
  private readonly tiles = viewChildren<ElementRef<HTMLButtonElement>>('tile');
  /** The button the tiles came out of (they go back into it). */
  private from: HTMLElement | null = null;
  private closing = false;
  protected readonly palette = inject(PaletteService);
  protected readonly palettes = PALETTES;
  private readonly paletteWindow = viewChild.required<ElementRef<HTMLDialogElement>>('paletteWindow');
  /** What was kept before a tile was tapped, put back if the window closes without OK; null while it is shut. */
  private kept: { theme: Theme; palettes: ReturnType<PaletteService['snapshot']> } | null = null;
  protected chosen() { return paletteFor(this.look.theme(), this.palette.palettes()); }
  protected ownPalette(): string { return defaultPalette(this.look.theme()); }
  protected edge(): boolean { return edgeFor(this.look.theme(), this.palette.edges()); }

  constructor() {
    effect(() => {
      const anchor = this.picker.anchor();
      untracked(() => {
        if (anchor && !this.open()) this.show(anchor);
        else if (!anchor && this.open()) this.close();
      });
    });
  }

  protected onEscape(): void {
    if (this.kept) return;   // the palette window answers its own Esc
    if (this.open()) this.close(true);
  }

  /** A tile: the theme goes on behind (not kept yet) and its palette window opens. */
  protected choose(theme: Theme): void {
    if (this.kept || this.closing) return;
    this.kept = { theme: this.look.theme(), palettes: this.palette.snapshot() };
    this.look.preview(theme);
    openDialog(this.paletteWindow().nativeElement, { escape: false });
  }

  /** OK: keeps the theme, its palette and its edge, and closes everything (the window, the themes, the menu). */
  protected ok(): void {
    if (!this.kept) return;
    this.kept = null;
    this.palette.save();
    this.look.set(this.look.theme());
    void closeDialog(this.paletteWindow().nativeElement);
    this.picker.finish();
  }

  /** Closed without OK: what was kept comes back and the themes stay open. */
  protected cancel(): void {
    const kept = this.kept;
    if (!kept) return;
    this.kept = null;
    this.palette.restore(kept.palettes);
    this.look.set(kept.theme);
    void closeDialog(this.paletteWindow().nativeElement);
  }

  protected onBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.paletteWindow().nativeElement)) this.cancel();
  }

  private show(anchor: HTMLElement): void {
    this.from = anchor;
    this.open.set(true);
    afterNextRender(() => { (anchor.closest('.look-stack, .action-stack') ? placeLeft : placeBelow)(anchor, this.fanBox()?.nativeElement); this.fly(true); }, { injector: this.injector });
  }

  /** Draws the tiles back into the button, then removes them; focus returns to the button after Esc. */
  close(refocus = false): void {
    if (!this.open() || this.closing) return;
    this.closing = true;
    const from = this.from;
    const done = () => {
      this.closing = false;
      this.open.set(false);
      if (this.picker.anchor() === from) this.picker.anchor.set(null);
      if (refocus) from?.focus({ preventScroll: true });
    };
    const animations = this.fly(false);
    if (!animations.length) { done(); return; }
    Promise.all(animations.map((a) => a.finished)).then(done, done);
  }

  private fly(out: boolean): Animation[] {
    return this.from ? flyTiles(this.from, this.tiles().map((t) => t.nativeElement), out) : [];
  }
}
