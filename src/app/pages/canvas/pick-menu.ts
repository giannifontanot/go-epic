import { Component, ElementRef, Injector, afterNextRender, inject, input, output, signal, viewChild, viewChildren } from '@angular/core';
import { flyTiles } from '../../shared/fan';

export interface PickItem { id: string; label: string }

/**
 * The Canvas's Área and Epic (Gianni: not tabs any more): a small uppercase label over the current choice, in the
 * cards' serif, with a ▾; a tap slides every choice out of it at once as the pages menu's tiles, at the very same speed
 * (`flyTiles`), the chosen one marked; a tap on one picks it, a tap outside, Esc or the button again draw them back
 * into it. The tiles sit in the top layer (a popover), so no panel clips them and no theme filter moves them. An
 * optional last tile adds a new one (+ Epic). Nothing moves under reduced motion.
 */
@Component({
  selector: 'app-pick-menu',
  template: `
    <button #btn type="button" class="pick-btn" aria-haspopup="true" [attr.aria-expanded]="open()" [disabled]="disabled()" (click)="toggle()">
      <small>{{ label() }}</small>
      <strong><span class="pick-value">{{ value() }}</span><span class="pick-chev" aria-hidden="true">▾</span></strong>
    </button>
    <div #pop popover="manual" class="pick-pop" (click)="onVeil($event)">
      @if (open()) {
        <nav #fanBox class="page-fan pick-fan" [attr.aria-label]="label()">
          @for (item of items(); track item.id) {
            <button #tile type="button" class="page-tile pick-tile" [class.on]="item.id === chosen()"
              [attr.aria-current]="item.id === chosen() ? 'true' : null" (click)="pick(item.id)">
              <span>{{ item.label }}</span>@if (item.id === chosen()) { <span class="theme-tile-check" aria-hidden="true">✓</span> }
            </button>
          }
          @if (addLabel()) {
            <button #tile type="button" class="page-tile pick-tile pick-add" (click)="addNew()">+ {{ addLabel() }}</button>
          }
        </nav>
      }
    </div>
  `,
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class PickMenu {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly items = input<PickItem[]>([]);
  readonly chosen = input('');
  readonly addLabel = input('');
  readonly disabled = input(false);
  readonly picked = output<string>();
  readonly add = output<void>();

  protected readonly open = signal(false);
  private readonly injector = inject(Injector);
  private readonly btn = viewChild.required<ElementRef<HTMLButtonElement>>('btn');
  private readonly pop = viewChild.required<ElementRef<HTMLElement>>('pop');
  private readonly fanBox = viewChild<ElementRef<HTMLElement>>('fanBox');
  private readonly tiles = viewChildren<ElementRef<HTMLElement>>('tile');
  private closing = false;

  protected toggle(): void {
    if (this.open()) { this.close(); return; }
    if (this.closing) return;
    this.open.set(true);
    try { this.pop().nativeElement.showPopover(); } catch { /* no popover: drawn fixed anyway */ }
    afterNextRender(() => {
      this.place();
      flyTiles(this.btn().nativeElement, this.tileEls(), true);
      const tiles = this.tileEls();
      (tiles.find((t) => t.classList.contains('on')) ?? tiles[0])?.focus({ preventScroll: true });
    }, { injector: this.injector });
  }
  protected pick(id: string): void {
    this.close();
    if (id !== this.chosen()) this.picked.emit(id);
  }
  protected addNew(): void {
    this.close();
    this.add.emit();
  }
  /** A tap on the veil (the popover itself, outside the tiles) closes. */
  protected onVeil(event: MouseEvent): void {
    if (event.target === this.pop().nativeElement) this.close();
  }
  protected onEscape(): void {
    if (this.open()) { this.close(); this.btn().nativeElement.focus({ preventScroll: true }); }
  }
  close(): void {
    if (!this.open() || this.closing) return;
    this.closing = true;
    const done = () => {
      this.closing = false;
      this.open.set(false);
      try { this.pop().nativeElement.hidePopover(); } catch { /* no popover */ }
    };
    const animations = flyTiles(this.btn().nativeElement, this.tileEls(), false);
    if (!animations.length) { done(); return; }
    Promise.all(animations.map((a) => a.finished)).then(done, done);
  }
  private tileEls(): HTMLElement[] { return this.tiles().map((t) => t.nativeElement); }
  /** Under the button, from its left edge, never past the screen's edges; above it when there is more room there. */
  private place(): void {
    const fan = this.fanBox()?.nativeElement;
    if (!fan || typeof innerHeight !== 'number') return;
    const r = this.btn().nativeElement.getBoundingClientRect();
    const vh = window.visualViewport?.height ?? innerHeight;
    const below = vh - r.bottom - 20, above = r.top - 20;
    const down = fan.scrollHeight <= below || below >= above;
    fan.style.maxHeight = Math.max(120, down ? below : above) + 'px';
    const h = fan.offsetHeight, w = fan.offsetWidth;
    fan.style.top = (down ? Math.max(12, r.bottom + 8) : Math.max(12, r.top - 8 - h)) + 'px';
    fan.style.left = Math.max(12, Math.min(r.left, innerWidth - w - 12)) + 'px';
  }
}
