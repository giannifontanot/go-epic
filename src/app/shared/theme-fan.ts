import { Component, ElementRef, afterNextRender, inject, Injector, signal, viewChild, viewChildren } from '@angular/core';
import { I18n } from '../core/i18n';
import { THEMES, Theme, ThemeService } from '../core/theme';

const OPEN_MS = 340;
const STEP_MS = 40;

/**
 * The themes, one tap away (Gianni): a round button on top of the Week board's floating buttons. A tap fans the eight
 * themes out of it, sliding to the left into two rows of four tiles, each a little picture of the theme; a tap on a
 * tile puts that theme on at once (the fan stays open, so themes can be compared); a tap outside, Esc or the button
 * again draws them back into it. Under reduced motion they simply appear and go. Ajustes (☰ › ⚙) still holds the
 * themes and the red time line.
 */
@Component({
  selector: 'app-theme-fan',
  template: `
    <button #fab type="button" class="capture-fab theme-fab" [class.open]="open()" [attr.aria-expanded]="open()" aria-controls="theme-fan"
            [attr.aria-label]="i18n.t('settings.theme')" [title]="i18n.t('settings.theme')" (click)="toggle()">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor">
        <path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5C21 6.4 17 3 12 3Z"/>
        <circle cx="7.5" cy="11" r="1.4" fill="var(--pink)"/><circle cx="10" cy="7.3" r="1.4" fill="var(--pink)"/>
        <circle cx="14.5" cy="7.3" r="1.4" fill="var(--pink)"/><circle cx="17" cy="11" r="1.4" fill="var(--pink)"/>
      </svg>
    </button>
    @if (open()) {
      <button type="button" class="theme-fan-veil" tabindex="-1" aria-hidden="true" (click)="close()"></button>
      <div id="theme-fan" class="theme-fan" role="radiogroup" [attr.aria-label]="i18n.t('settings.theme')">
        @for (theme of themes; track theme) {
          <button #tile type="button" class="theme-tile" role="radio" [attr.data-preview]="theme" [attr.aria-checked]="look.theme() === theme"
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
  host: { '(document:keydown.escape)': 'open() && close(true)' },
})
export class ThemeFan {
  protected readonly i18n = inject(I18n);
  protected readonly look = inject(ThemeService);
  protected readonly themes = THEMES;
  protected readonly open = signal(false);
  private readonly injector = inject(Injector);
  private readonly fab = viewChild.required<ElementRef<HTMLButtonElement>>('fab');
  private readonly tiles = viewChildren<ElementRef<HTMLButtonElement>>('tile');
  private closing = false;

  protected toggle(): void {
    if (this.open()) { this.close(); return; }
    this.open.set(true);
    afterNextRender({ read: () => this.fly(true) }, { injector: this.injector });
  }

  /** Draws the tiles back into the button, then removes them; focus returns to the button after Esc. */
  protected close(refocus = false): void {
    if (!this.open() || this.closing) return;
    this.closing = true;
    const done = () => {
      this.closing = false;
      this.open.set(false);
      if (refocus) this.fab().nativeElement.focus({ preventScroll: true });
    };
    const animations = this.fly(false);
    if (!animations.length) { done(); return; }
    Promise.all(animations.map((a) => a.finished)).then(done, done);
  }

  /**
   * Each tile slides out of the button (or back into it): it starts on the button, small and clear, and glides to its
   * place, the nearest ones first. Nothing under reduced motion.
   */
  private fly(out: boolean): Animation[] {
    const reduced = typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tiles = this.tiles().map((t) => t.nativeElement);
    if (reduced || !tiles.length || typeof tiles[0].animate !== 'function') return [];
    const from = this.fab().nativeElement.getBoundingClientRect();
    const fx = from.left + from.width / 2, fy = from.top + from.height / 2;
    const rects = tiles.map((t) => t.getBoundingClientRect());
    const far = Math.max(...rects.map((r) => fx - (r.left + r.width / 2)));
    return tiles.map((tile, i) => {
      const r = rects[i];
      const dx = fx - (r.left + r.width / 2), dy = fy - (r.top + r.height / 2);
      const order = far > 0 ? Math.round(((dx / far) * 3)) : 0;          // 0 = the column next to the button
      const home = { transform: 'none', opacity: 1 };
      const away = { transform: `translate(${dx}px, ${dy}px) scale(.3)`, opacity: 0 };
      return tile.animate(out ? [away, home] : [home, away], {
        duration: OPEN_MS,
        delay: (out ? order : 3 - order) * STEP_MS,
        easing: out ? 'cubic-bezier(0, 0, .2, 1)' : 'cubic-bezier(.4, 0, 1, 1)',
        fill: 'both',
      });
    });
  }
}
