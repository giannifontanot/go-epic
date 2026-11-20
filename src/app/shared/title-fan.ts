import { Component, ElementRef, Injectable, Injector, afterNextRender, effect, inject, signal, untracked, viewChild, viewChildren } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { I18n } from '../core/i18n';
import { flyTiles } from './fan';
import { PAGES } from './page-fan';

/** Which page title opened the pages menu (null = closed). A page's title calls `toggle` with itself. */
@Injectable({ providedIn: 'root' })
export class PageMenu {
  readonly anchor = signal<HTMLElement | null>(null);
  toggle(title: EventTarget | null): void {
    const el = title instanceof HTMLElement ? title : null;
    this.anchor.set(this.anchor() ? null : el);
  }
}

/**
 * The pages menu under a page's title (Gianni: a tap on the title opens the same menu as the round menu's pages): the
 * same tiles, sliding out of the title and back into it, the page you are on marked; a tap on one goes there, a tap
 * outside, Esc or the title again draw them back. The App draws it, outside `main`, so no theme filter or leaning
 * title moves it. Nothing under reduced motion.
 */
@Component({
  selector: 'app-title-fan',
  imports: [RouterLink, RouterLinkActive],
  template: `
    @if (shown()) {
      <div class="theme-fan-veil title-veil" aria-hidden="true" (click)="close()"></div>
      <nav #fanBox class="page-fan title-fan" [attr.aria-label]="i18n.t('nav.pages')">
        @for (page of pages; track page.link) {
          <a #tile class="page-tile" [routerLink]="page.link" routerLinkActive="on" #rla="routerLinkActive"
             [routerLinkActiveOptions]="{ exact: page.link === '/' }" [attr.aria-current]="rla.isActive ? 'page' : null"
             (click)="close()">{{ i18n.t(page.label) }}@if (rla.isActive) { <span class="theme-tile-check" aria-hidden="true">✓</span> }</a>
        }
      </nav>
    }
  `,
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class TitleFan {
  protected readonly i18n = inject(I18n);
  protected readonly pages = PAGES;
  private readonly menu = inject(PageMenu);
  private readonly injector = inject(Injector);
  /** The title the tiles came out of; kept while they slide back into it. */
  private from: HTMLElement | null = null;
  protected readonly shown = signal(false);
  private readonly fanBox = viewChild<ElementRef<HTMLElement>>('fanBox');
  private readonly tiles = viewChildren<ElementRef<HTMLElement>>('tile');
  private closing = false;

  constructor() {
    effect(() => {
      const anchor = this.menu.anchor();
      untracked(() => {
        if (anchor && !this.shown()) {
          this.from = anchor;
          anchor.setAttribute('aria-expanded', 'true');
          this.shown.set(true);
          afterNextRender(() => { this.place(); this.fly(true); }, { injector: this.injector });
        } else if (!anchor && this.shown()) {
          this.hide();
        }
      });
    });
  }

  protected onEscape(): void {
    if (this.shown()) { const from = this.from; this.close(); from?.focus({ preventScroll: true }); }
  }
  protected close(): void {
    this.menu.anchor.set(null);
  }
  private hide(): void {
    if (this.closing) return;
    this.closing = true;
    const done = () => {
      this.closing = false;
      this.from?.setAttribute('aria-expanded', 'false');
      this.from = null;
      this.shown.set(false);
    };
    const animations = this.fly(false);
    if (!animations.length) { done(); return; }
    Promise.all(animations.map((a) => a.finished)).then(done, done);
  }
  /** Under the title, starting at its left edge, never past the screen's edges. */
  private place(): void {
    const fan = this.fanBox()?.nativeElement;
    if (!fan || !this.from || typeof innerHeight !== 'number') return;
    const r = this.from.getBoundingClientRect();
    const h = fan.offsetHeight, w = fan.offsetWidth;
    fan.style.top = Math.max(12, Math.min(r.bottom + 8, innerHeight - h - 12)) + 'px';
    fan.style.left = Math.max(12, Math.min(r.left, innerWidth - w - 12)) + 'px';
  }
  private fly(out: boolean): Animation[] {
    return this.from ? flyTiles(this.from, this.tiles().map((t) => t.nativeElement), out) : [];
  }
}
