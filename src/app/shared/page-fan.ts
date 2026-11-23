import { Component, DestroyRef, ElementRef, Injector, afterNextRender, inject, input, output, signal, viewChild, viewChildren } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { I18n } from '../core/i18n';
import { flyTiles, placeBeside, reducedMotion } from './fan';

/**
 * When the round menu opens, how long until its compass is pressed by itself: its last action has risen into place
 * (4 × 40 ms stagger + 340 ms slide ≈ 500 ms), then a moment more (Gianni: a little later than at first).
 */
export const PAGES_AFTER_MS = 900;
/** The compass's small press before the pages fan out. */
export const PRESS_MS = 220;

/** The pages of the menu (Week board, Canvas, Progress, Year, Product history, How to use), shared by the round menu's fan and the page titles'. */
export const PAGES = [
  { link: '/', label: 'nav.week' },
  { link: '/canvas', label: 'nav.canvas' },
  { link: '/progress', label: 'nav.progress' },
  { link: '/year', label: 'nav.year' },
  { link: '/products', label: 'nav.products' },
  { link: '/guide', label: 'nav.guide' },
] as const;

/**
 * The pages, one tap away (Gianni: the ☰ menu left, and scrolling up to navigate was not wanted): an action of the
 * floating buttons' menu (ActionMenu). A tap slides the pages out of it to the left, exactly as the themes do, the page
 * you are on marked; a tap on one goes there (and the menu closes); a tap outside, Esc or the button again draw them
 * back. Opening the round menu also opens them by itself (Gianni: one tap shows which pages there are), once their
 * button has slid into its place (`showSoon`); then the menu's own veil takes the taps outside (`veil` false), so the
 * other actions stay one tap away. Under reduced motion they simply appear and go.
 */
@Component({
  selector: 'app-page-fan',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <button #fab type="button" class="capture-fab page-fab" [class.open]="open()" [attr.aria-expanded]="open()" aria-controls="page-fan"
            [attr.aria-label]="i18n.t('nav.pages')" [title]="i18n.t('nav.pages')" (click)="toggle()">
      <!-- a compass, outlined like the other round buttons' icons -->
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
        <circle cx="12" cy="12" r="8.5"/><path d="M15.4 8.6l-2 4.8-4.8 2 2-4.8z"/>
      </svg>
    </button>
    @if (open()) {
      @if (veil()) { <div class="theme-fan-veil" aria-hidden="true" (click)="close()"></div> }
      <nav #fanBox id="page-fan" class="page-fan" [attr.aria-label]="i18n.t('nav.pages')">
        @for (page of pages; track page.link) {
          <a #tile class="page-tile" [routerLink]="page.link" routerLinkActive="on" #rla="routerLinkActive"
             [routerLinkActiveOptions]="{ exact: page.link === '/' }" [attr.aria-current]="rla.isActive ? 'page' : null"
             (click)="went.emit()">{{ i18n.t(page.label) }}@if (rla.isActive) { <span class="theme-tile-check" aria-hidden="true">✓</span> }</a>
        }
      </nav>
    }
  `,
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class PageFan {
  protected readonly i18n = inject(I18n);
  protected readonly pages = PAGES;
  /** A page was tapped: the menu closes. */
  readonly went = output<void>();
  /** A veil of its own that a tap outside closes; off in the round menu, whose veil closes everything. */
  readonly veil = input(true);
  protected readonly open = signal(false);
  private readonly injector = inject(Injector);
  private readonly fab = viewChild.required<ElementRef<HTMLButtonElement>>('fab');
  private readonly fanBox = viewChild<ElementRef<HTMLElement>>('fanBox');
  private readonly tiles = viewChildren<ElementRef<HTMLElement>>('tile');
  private closing = false;
  private soon: ReturnType<typeof setTimeout> | null = null;
  private reopen = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.cancelSoon());
  }

  isOpen(): boolean {
    return this.open();
  }
  protected onEscape(): void {
    if (this.open() && this.veil()) this.close(true);   // in the round menu its Esc closes the menu and the pages together
  }
  /**
   * Opens the pages a moment after the whole menu has settled (Gianni: first the menu opens, then, a moment later, the
   * compass is pressed): its button gives a small press, as if tapped, and the pages fan out of it where it stands; at
   * once and without the press under reduced motion. Closing the menu meanwhile cancels it (`close`).
   */
  showSoon(): void {
    this.cancelSoon();
    if (this.open() && !this.closing) return;
    const still = reducedMotion();
    this.soon = setTimeout(() => {
      this.soon = null;
      if (!still) this.press();
      if (this.closing) this.reopen = true;   // the menu reopened while the pages were still drawing back: show them once they are in
      else if (!this.open()) this.show();
    }, still ? 0 : PAGES_AFTER_MS);
  }
  /** The compass's small press, on its own `scale` (the menu's slide and the tilt use transform, rotate and translate). */
  private press(): void {
    this.fab().nativeElement.animate?.({ scale: ['1', '.86', '1'] }, { duration: PRESS_MS, easing: 'cubic-bezier(.4, 0, .2, 1)' });
  }
  private cancelSoon(): void {
    if (this.soon !== null) { clearTimeout(this.soon); this.soon = null; }
    this.reopen = false;
  }
  protected toggle(): void {
    this.cancelSoon();
    if (this.open()) { this.close(); return; }
    this.show();
  }
  private show(): void {
    this.open.set(true);
    afterNextRender(() => { placeBeside(this.fab().nativeElement, this.fanBox()?.nativeElement); this.fly(true); }, { injector: this.injector });
  }
  close(refocus = false): void {
    this.cancelSoon();
    if (!this.open() || this.closing) return;
    this.closing = true;
    const done = () => {
      this.closing = false;
      this.open.set(false);
      if (refocus) this.fab().nativeElement.focus({ preventScroll: true });
      if (this.reopen) { this.reopen = false; this.show(); }
    };
    const animations = this.fly(false);
    if (!animations.length) { done(); return; }
    Promise.all(animations.map((a) => a.finished)).then(done, done);
  }
  private fly(out: boolean): Animation[] {
    return flyTiles(this.fab().nativeElement, this.tiles().map((t) => t.nativeElement), out);
  }
}
