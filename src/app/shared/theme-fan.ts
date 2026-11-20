import { Component, ElementRef, Injectable, Injector, afterNextRender, effect, inject, signal, untracked, viewChild, viewChildren } from '@angular/core';
import { I18n } from '../core/i18n';
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
}

/**
 * The themes (Gianni): the edit bar's Themes button fans the eight themes out of it into two rows of four tiles (the
 * light themes on top, the dark ones below), each a little picture of the theme in its own colours, which never change
 * with the theme that is on; a tap on a tile puts that theme on at once (the fan stays open, so themes can be
 * compared); a tap outside, Esc or the button again draws them back into it. Under reduced motion they simply appear
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
                  [class.on]="look.theme() === theme" (click)="look.set(theme)">
            <span class="theme-preview" aria-hidden="true">
              <span class="tp-day"><span class="tp-block"><span class="tp-card"></span><span class="tp-card"></span></span></span>
            </span>
            <span class="theme-tile-name">{{ i18n.t('theme.' + theme) }}</span>
            @if (look.theme() === theme) { <span class="theme-tile-check" aria-hidden="true">✓</span> }
          </button>
        }
      </div>
    }
  `,
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class ThemeFan {
  protected readonly i18n = inject(I18n);
  protected readonly look = inject(ThemeService);
  private readonly picker = inject(ThemePicker);
  /** Light themes on the top row, dark ones below; each tile keeps its own theme's colours whatever look is on. */
  protected readonly themes: readonly Theme[] = [...LIGHT_THEMES, ...DARK_THEMES];
  protected readonly dark = new Set<Theme>(DARK_THEMES);
  protected readonly bar = THEME_BAR;
  protected readonly open = signal(false);
  private readonly injector = inject(Injector);
  private readonly fanBox = viewChild<ElementRef<HTMLElement>>('fanBox');
  private readonly tiles = viewChildren<ElementRef<HTMLButtonElement>>('tile');
  /** The button the tiles came out of (they go back into it). */
  private from: HTMLElement | null = null;
  private closing = false;

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
    if (this.open()) this.close(true);
  }

  private show(anchor: HTMLElement): void {
    this.from = anchor;
    this.open.set(true);
    afterNextRender(() => { (anchor.closest('.look-stack') ? placeLeft : placeBelow)(anchor, this.fanBox()?.nativeElement); this.fly(true); }, { injector: this.injector });
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
