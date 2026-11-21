import { Component, ElementRef, Injector, afterNextRender, inject, output, signal, viewChild, viewChildren } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { I18n } from '../core/i18n';
import { flyTiles, placeBeside } from './fan';

/** The pages of the menu (Week board, Canvas, Progress, Year), shared by the round menu's fan and the page titles'. */
export const PAGES = [
  { link: '/', label: 'nav.week' },
  { link: '/canvas', label: 'nav.canvas' },
  { link: '/progress', label: 'nav.progress' },
  { link: '/year', label: 'nav.year' },
] as const;

/**
 * The pages, one tap away (Gianni: the ☰ menu left, and scrolling up to navigate was not wanted): an action of the
 * floating buttons' menu (ActionMenu). A tap slides the pages out of it to the left, exactly as the themes do, the page
 * you are on marked; a tap on one goes there (and the menu closes); a tap outside, Esc or the button again draw them
 * back. Under reduced motion they simply appear and go.
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
      <div class="theme-fan-veil" aria-hidden="true" (click)="close()"></div>
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
  protected readonly open = signal(false);
  private readonly injector = inject(Injector);
  private readonly fab = viewChild.required<ElementRef<HTMLButtonElement>>('fab');
  private readonly fanBox = viewChild<ElementRef<HTMLElement>>('fanBox');
  private readonly tiles = viewChildren<ElementRef<HTMLElement>>('tile');
  private closing = false;

  isOpen(): boolean {
    return this.open();
  }
  protected onEscape(): void {
    if (this.open()) this.close(true);
  }
  protected toggle(): void {
    if (this.open()) { this.close(); return; }
    this.open.set(true);
    afterNextRender(() => { placeBeside(this.fab().nativeElement, this.fanBox()?.nativeElement); this.fly(true); }, { injector: this.injector });
  }
  close(refocus = false): void {
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
  private fly(out: boolean): Animation[] {
    return flyTiles(this.fab().nativeElement, this.tiles().map((t) => t.nativeElement), out);
  }
}
