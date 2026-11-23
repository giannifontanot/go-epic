import { Component, ElementRef, Injector, afterNextRender, inject, input, output, signal, viewChild, viewChildren } from '@angular/core';
import { flyTiles } from '../../shared/fan';
import { splitTail } from '../../core/text-tail';
import { visibleArea } from '../../core/viewport';

/** A choice; `desc` is an area's description («Familia» under «El Castillo»), drawn a shade softer on its own line. */
export interface PickItem { id: string; label: string; desc?: string }

/** The floating menu under its button, from its left edge, kept 12px inside the visible screen (keyboard included);
 *  above it when there is more room there. Shared by the Canvas's Área and Epic and the place card's levels. */
export function placeFan(button: HTMLElement, fan: HTMLElement | undefined): void {
  if (!fan || typeof innerHeight !== 'number') return;
  const vv = visibleArea();
  const top0 = vv.top, left0 = vv.left, vw = vv.width, vh = vv.height;
  const r = button.getBoundingClientRect();
  const below = top0 + vh - r.bottom - 20, above = r.top - top0 - 20;
  fan.style.maxHeight = '';
  const down = fan.scrollHeight <= below || below >= above;
  fan.style.maxHeight = Math.max(120, down ? below : above) + 'px';
  const h = fan.offsetHeight, w = fan.offsetWidth;
  fan.style.top = (down ? Math.max(top0 + 12, r.bottom + 8) : Math.max(top0 + 12, r.top - 8 - h)) + 'px';
  fan.style.left = Math.max(left0 + 12, Math.min(r.left, left0 + vw - w - 12)) + 'px';
}

/**
 * The Canvas's Área and Epic (Gianni: not tabs any more): a small uppercase label over the current choice, in the
 * cards' serif, with a filled triangle at the far right of the button (Gianni: as on the place card); a tap slides every choice out of it at once as the pages menu's tiles, at the very same speed
 * (`flyTiles`), the chosen one marked; a tap on one picks it, a tap outside, Esc or the button again draw them back
 * into it. The tiles sit in the top layer (a popover), so no panel clips them and no theme filter moves them. An
 * optional last tile adds a new one (+ Epic). Nothing moves under reduced motion.
 */
@Component({
  selector: 'app-pick-menu',
  template: `
    <!-- One button covers the whole box (the menu); the text lies over it, and an Epic's ✎ right after its name is a
         button of its own on top (Gianni: so renaming is obvious) -->
    <div class="pick-btn" [class.open]="open()" [class.off]="disabled()">
      <button #btn type="button" class="pick-hit" aria-haspopup="true" [attr.aria-expanded]="open()" [disabled]="disabled()"
        [attr.aria-label]="label() + ': ' + value() + (valueDesc() ? ' ' + valueDesc() : '')" (click)="toggle()"></button>
      <small aria-hidden="true">{{ label() }}</small>
      <!-- an Epic's ✎ never stands alone on a line: the last word of the name (or the description) goes with it (Gianni) -->
      @let t = editLabel() && !valueDesc() ? tail(value()) : { head: value(), tail: '' };
      <strong><span class="pick-value" aria-hidden="true">{{ t.head }}</span>@if (valueDesc() && !editLabel()) { <span class="area-desc" aria-hidden="true">{{ valueDesc() }}</span> }@if (editLabel()) {<span class="pen-tail">@if (valueDesc()) { <span class="area-desc" aria-hidden="true">{{ valueDesc() }}</span> }<span class="pick-value" aria-hidden="true">{{ t.tail }}</span><button type="button" class="edit-pen"
          [disabled]="disabled()" [attr.aria-label]="editLabel()" [title]="editLabel()" (click)="edit.emit()"><span class="pen" aria-hidden="true">✎</span></button></span>}</strong>
      <span class="menu-chev" aria-hidden="true"></span>
    </div>
    <div #pop popover="manual" class="pick-pop" (click)="onVeil($event)">
      @if (open()) {
        <nav #fanBox class="page-fan pick-fan" [attr.aria-label]="label()">
          @for (item of items(); track item.id) {
            <button #tile type="button" class="page-tile pick-tile" [class.on]="item.id === chosen()"
              [attr.aria-current]="item.id === chosen() ? 'true' : null" (click)="pick(item.id)">
              <span class="pick-label">{{ item.label }}@if (item.desc) { <span class="area-desc">{{ item.desc }}</span> }</span>@if (item.id === chosen()) { <span class="theme-tile-check" aria-hidden="true">✓</span> }
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
  /** The current choice's area description, a shade softer under it ('' = none). */
  readonly valueDesc = input('');
  readonly items = input<PickItem[]>([]);
  readonly chosen = input('');
  readonly addLabel = input('');
  readonly disabled = input(false);
  /** The name of the ✎ right after the value ('' = none): an Epic is renamed there. */
  readonly editLabel = input('');
  readonly edit = output<void>();
  protected readonly tail = splitTail;
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
  private place(): void { placeFan(this.btn().nativeElement, this.fanBox()?.nativeElement); }
}
