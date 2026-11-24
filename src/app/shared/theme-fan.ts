import { Component, ElementRef, Injectable, Injector, afterNextRender, effect, inject, signal, untracked, viewChild, viewChildren } from '@angular/core';
import { I18n, inLang } from '../core/i18n';
import { closeDialog, isBackdropClick, openDialog } from '../core/dialog';
import { PaletteService } from '../core/palette';
import { PALETTES, defaultPalette, edgeFor, paletteFor } from '../core/palette.model';
import { flyTiles, placeBelow, placeLeft } from './fan';
import { DARK_THEMES, LIGHT_THEMES, THEME_BAR, Theme, ThemeService } from '../core/theme';
import { LEVELS, LEVEL_SETS, LevelSet, LevelSetId } from '../core/levels.model';


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
 * palettes (a tap shows one at once), Only the edge, the red time line and the red countdown bar below them, then OK, which keeps the theme, its palette and its
 * edge and closes everything (the window, the themes and the menu they came from). Closing the window without OK (×,
 * Esc, the backdrop) puts back what was kept and leaves the themes open. A tap outside, Esc or the button again draws
 * the themes back into it. Under reduced motion they simply appear
 * and go. Drawn by the App, outside the page (a grey theme's filter on the page would move and grey the tiles), under
 * the button as far as the screen allows. Ajustes holds the language and the weighted buttons.
 * On top of the tiles, a long Letreros button (Gianni) opens the window where one of six sets of level names is chosen
 * (levels.model): a tap on a set shows it at once, Aplicar keeps it on this device and closes everything, Cancelar,
 * ×, Esc or the backdrop put back the one kept and leave the themes open.
 */
@Component({
  selector: 'app-theme-fan',
  template: `
    @if (open()) {
      <!-- a div, not a button: buttons lean with the phone, and a leaning veil would leave the board tappable at its edges -->
      <div class="theme-fan-veil" aria-hidden="true" (click)="close()"></div>
      <div #fanBox id="theme-fan" class="theme-fan">
        <!-- Letreros (Gianni): a long button on top of the themes, opening the window of the level names -->
        <button #tile type="button" class="levels-btn" aria-haspopup="dialog" (click)="openLevels()">{{ i18n.t('levels.button') }}</button>
        <div class="theme-tiles" role="radiogroup" [attr.aria-label]="i18n.t('settings.theme')">
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
      </div>
    }
    <!-- Letreros (Gianni): one of six sets of names for the five levels, only to choose; a tap shows it at once behind,
         Aplicar keeps it and closes everything, Cancelar (×, Esc, the backdrop) puts back the one kept -->
    <dialog #levelsWindow class="settings-window levels-window" aria-labelledby="levels-window-title"
            (click)="onLevelsBackdrop($event)" (cancel)="$event.preventDefault(); cancelLevels()">
      <header class="settings-head">
        <h2 id="levels-window-title" tabindex="-1">{{ i18n.t('levels.title') }}</h2>
        <button type="button" class="drawer-close" [attr.aria-label]="i18n.t('nav.close')" (click)="cancelLevels()">×</button>
      </header>
      <p class="levels-hint">{{ i18n.t('levels.hint') }}</p>
      <div class="levels-list" role="radiogroup" aria-labelledby="levels-window-title">
        @for (set of levelSets; track set.id) {
          <button type="button" role="radio" class="palette-row levels-row" [class.on]="i18n.levels() === set.id"
                  [attr.aria-checked]="i18n.levels() === set.id" (click)="i18n.previewLevels(set.id)">
            <span class="palette-name">{{ setName(set) }}</span>
            <span class="levels-words">{{ wordsOf(set.id) }}</span>
            <span class="palette-tick" aria-hidden="true">{{ i18n.levels() === set.id ? '✓' : '' }}</span>
          </button>
        }
      </div>
      <footer class="settings-foot levels-foot">
        <button type="button" class="btn-cancel" (click)="cancelLevels()">{{ i18n.t('task.cancel') }}</button>
        <button type="button" class="primary btn-apply" (click)="applyLevels()">{{ i18n.t('canvas.apply') }}</button>
      </footer>
    </dialog>
    <!-- the theme's palette window: only the palettes, Only the edge, OK (Gianni) -->
    <dialog #paletteWindow class="settings-window palette-window" aria-labelledby="palette-window-title"
            (click)="onBackdrop($event)" (cancel)="$event.preventDefault(); cancel()">
      <header class="settings-head">
        <h2 id="palette-window-title" tabindex="-1">{{ i18n.t('palette.title') }} · {{ i18n.t('theme.' + look.theme()) }}</h2>
        <button type="button" class="drawer-close" [attr.aria-label]="i18n.t('nav.close')" (click)="cancel()">×</button>
      </header>
      <!-- the palettes and the three boxes scroll together, so on a short screen both stay reachable and OK stays in sight -->
      <div class="palette-body">
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
      <!-- the time line and the countdown bar on the Week board: red, or with the theme (Gianni, v66: moved here from Ajustes) -->
      <label class="setting-row">
        <input type="checkbox" class="setting-check" [checked]="look.redLine()" (change)="look.redLine.set($any($event.target).checked)" />
        <span class="setting-text">
          <strong><span class="red-sample" aria-hidden="true"></span>{{ i18n.t('settings.redLine') }}</strong>
          <small>{{ i18n.t('settings.redHint') }}</small>
        </span>
      </label>
      <label class="setting-row">
        <input type="checkbox" class="setting-check" [checked]="look.redCountdown()" (change)="look.redCountdown.set($any($event.target).checked)" />
        <span class="setting-text">
          <strong><span class="countdown-sample" aria-hidden="true"></span>{{ i18n.t('settings.redCountdown') }}</strong>
          <small>{{ i18n.t('settings.redHint') }}</small>
        </span>
      </label>
      </div>
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
  private kept: { theme: Theme; palettes: ReturnType<PaletteService['snapshot']>; redLine: boolean; redCountdown: boolean } | null = null;
  protected chosen() { return paletteFor(this.look.theme(), this.palette.palettes()); }
  protected ownPalette(): string { return defaultPalette(this.look.theme()); }
  protected edge(): boolean { return edgeFor(this.look.theme(), this.palette.edges()); }
  protected readonly levelSets = LEVEL_SETS;
  private readonly levelsWindow = viewChild.required<ElementRef<HTMLDialogElement>>('levelsWindow');
  /** The set kept before the Letreros window opened, put back if it closes without Aplicar; null while it is shut. */
  private levelsKept: LevelSetId | null = null;
  /** A set's name in the language in use (English while it has none of its own). */
  protected setName(set: LevelSet): string {
    return inLang(set.name, this.i18n.lang())!;
  }
  /** A set's five names in the language in use: Área · Epic · Feature · Story · Actividad. */
  protected wordsOf(id: LevelSetId): string {
    const words = inLang(LEVEL_SETS.find((s) => s.id === id)!.words, this.i18n.lang())!;
    return LEVELS.map((level) => words[level].one).join(' · ');
  }

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
    if (this.kept || this.levelsKept) return;   // the palette and Letreros windows answer their own Esc
    if (this.open()) this.close(true);
  }

  /** A tile: the theme goes on behind (not kept yet) and its palette window opens. */
  protected choose(theme: Theme): void {
    if (this.kept || this.levelsKept || this.closing) return;
    this.kept = { theme: this.look.theme(), palettes: this.palette.snapshot(), redLine: this.look.redLine(), redCountdown: this.look.redCountdown() };
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
    this.look.redLine.set(kept.redLine);
    this.look.redCountdown.set(kept.redCountdown);
    void closeDialog(this.paletteWindow().nativeElement);
  }

  protected onBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.paletteWindow().nativeElement)) this.cancel();
  }

  /** Letreros: the window of the level names grows out of the long button. */
  protected openLevels(): void {
    if (this.kept || this.levelsKept || this.closing) return;
    this.levelsKept = this.i18n.storedLevels();
    openDialog(this.levelsWindow().nativeElement, { escape: false });
  }

  /** Aplicar: keeps the set on this device and closes everything (the window, the themes, the menu), as the palette's OK. */
  protected applyLevels(): void {
    if (!this.levelsKept) return;
    this.levelsKept = null;
    this.i18n.setLevels(this.i18n.levels());
    void closeDialog(this.levelsWindow().nativeElement);
    this.picker.finish();
  }

  /** Closed without Aplicar: the set kept comes back and the themes stay open. */
  protected cancelLevels(): void {
    const kept = this.levelsKept;
    if (!kept) return;
    this.levelsKept = null;
    this.i18n.previewLevels(kept);
    void closeDialog(this.levelsWindow().nativeElement);
  }

  protected onLevelsBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.levelsWindow().nativeElement)) this.cancelLevels();
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
