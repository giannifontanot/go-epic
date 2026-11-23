import { Component, DestroyRef, ElementRef, Injector, TemplateRef, afterNextRender, inject, input, output, signal, viewChild, viewChildren } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { I18n } from '../../core/i18n';
import { flyTiles } from '../../shared/fan';
import { placeFan } from './pick-menu';

export type PlaceLevel = 'area' | 'epic' | 'feature' | 'story';
export interface PlaceOption { id: string; title: string; desc?: string; }
/** A level chosen in the floating menu: an existing one's id, or `newId` with the name typed for a new one. */
export interface PlacePick { level: PlaceLevel; id: string; name?: string; }

/** The levels above each object, in order (an Activity sits in a Story, a Story in a Feature, a Feature in an Epic). */
const LEVELS: Record<'feature' | 'story' | 'task', PlaceLevel[]> = {
  feature: ['area', 'epic'],
  story: ['area', 'epic', 'feature'],
  task: ['area', 'epic', 'feature', 'story'],
};

/**
 * Where an object lives, drawn as the Canvas draws it (Gianni): the Area and the Epic on the plum card, the Feature's
 * yellow jelly box inside it, the Story's cream box inside that, and the object itself innermost. Every level not chosen
 * yet reads «Por definir», with a ⌄ at the far right; a tap on a level opens its floating menu, the very menu of the
 * Canvas's Área and Epic (Gianni: identical, at the same speed): every choice slides out of the level as the pages
 * menu's tiles (`flyTiles`) over a light veil, with that level's existing choices under the one chosen above and a last
 * tile to name a new one right there (Gianni: there is no other place to create them). Choosing a level clears the ones below it. The page decides when the place is applied (all levels chosen).
 */
@Component({
  selector: 'app-place-card',
  imports: [NgTemplateOutlet],
  template: `
    @let kind = leafKind();
    <div class="pick-card place-card" role="group" [attr.aria-label]="i18n.t('task.where')">
      <span class="pc-epic">
        <ng-container *ngTemplateOutlet="line; context: { level: 'area' }" />
        <ng-container *ngTemplateOutlet="line; context: { level: 'epic' }" />
      </span>
      <span class="pc-nest">
        <span class="pc-feature">
          @if (kind === 'feature') {
            <ng-container *ngTemplateOutlet="leaf" />
          } @else {
            <ng-container *ngTemplateOutlet="line; context: { level: 'feature' }" />
            <span class="pc-story">
              @if (kind === 'story') {
                <ng-container *ngTemplateOutlet="leaf" />
              } @else {
                <ng-container *ngTemplateOutlet="line; context: { level: 'story' }" />
                <span class="pc-activity" [style.background]="'var(--tone, #ffd5bd)'">
                  <ng-container *ngTemplateOutlet="leaf" />
                </span>
              }
            </span>
          }
        </span>
      </span>
    </div>

    <ng-template #line let-level="level">
      @let label = labelOf()(level);
      <button type="button" class="pc-head place-line" [class.pc-wait]="!ready(level)" [disabled]="disabled()"
        aria-haspopup="dialog" [attr.aria-expanded]="openLevel() === level" (click)="toggle(level, $any($event.currentTarget))">
        <small>{{ i18n.t('canvas.' + level) }}</small>
        @let desc = label ? descOf()(level) : '';
        <strong [class.pc-empty]="!label">{{ label || i18n.t('canvas.toDefine') }}@if (desc) { <span class="area-desc">{{ desc }}</span> }</strong>
        <span class="menu-chev" aria-hidden="true">⌄</span>
      </button>
    </ng-template>
    <ng-template #leaf>
      <span class="pc-head pc-leaf"><small>{{ i18n.t('canvas.' + kind) }}</small>
        @if (leafTpl(); as tpl) { <ng-container *ngTemplateOutlet="tpl" /> } @else { <strong>{{ leafTitle() }}</strong> }</span>
    </ng-template>

    <!-- The floating menu: the Canvas's Área and Epic menu (pick-menu.ts), in the top layer over a light veil, so no card
         or window clips it; its tiles slide out of the level tapped and back into it -->
    <div #menu popover="manual" class="pick-pop place-pop" tabindex="-1" (click)="onVeil($event)" (keydown)="menuKey($event)">
      @if (openLevel(); as level) {
        <nav #fanBox class="page-fan pick-fan" [attr.aria-label]="i18n.t('canvas.' + level)">
          @if (!ready(level)) {
            <p #tile class="page-tile pick-tile pick-note">{{ i18n.t('canvas.chooseFirst', { level: i18n.t('canvas.' + above(level)) }) }}</p>
          } @else {
            @for (option of choices; track option.id) {
              <button #tile type="button" class="page-tile pick-tile" [class.on]="option.id === value()[level]"
                [attr.aria-current]="option.id === value()[level] ? 'true' : null" (click)="choose(level, option.id)">
                <span class="pick-label">{{ option.title }}@if (option.desc) { <span class="area-desc">{{ option.desc }}</span> }</span>
                @if (option.id === value()[level]) { <span class="theme-tile-check" aria-hidden="true">✓</span> }
              </button>
            } @empty {
              <p #tile class="page-tile pick-tile pick-note">{{ i18n.t('canvas.noneYet') }}</p>
            }
            @if (level !== 'area') {
              <!-- not a form: the card may sit inside a window's form, which a nested submit would apply -->
              <div #tile class="page-tile pick-tile pick-new">
                <input [value]="draft" (input)="draft = $any($event.target).value" autocomplete="off" enterkeyhint="done"
                  (keydown.enter)="$event.preventDefault(); $event.stopPropagation(); create(level)"
                  [attr.aria-label]="i18n.t('canvas.new.' + level)" [placeholder]="'+ ' + i18n.t('canvas.new.' + level)" />
                <button type="button" class="primary" [disabled]="!draft.trim()" (click)="create(level)">{{ i18n.t('place.create') }}</button>
              </div>
            }
          }
        </nav>
      }
    </div>
  `,
})
export class PlaceCard {
  protected readonly i18n = inject(I18n);
  private readonly injector = inject(Injector);
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');
  private readonly fanBox = viewChild<ElementRef<HTMLElement>>('fanBox');
  private readonly tiles = viewChildren<ElementRef<HTMLElement>>('tile');

  /** What is being placed: an Activity (four levels above it), a Story (three) or a Feature (two). */
  readonly leafKind = input.required<'feature' | 'story' | 'task'>();
  readonly leafTitle = input('');
  /** What the object's own box holds instead of its title, when the page lets it be renamed right there (its name box). */
  readonly leafTpl = input<TemplateRef<unknown> | null>(null);
  /** The chosen id of each level ('' = to be defined; `newId` = a new one, named in `labelOf`). */
  readonly value = input.required<Record<PlaceLevel, string>>();
  /** A level's name as shown ('' = to be defined). */
  readonly labelOf = input.required<(level: PlaceLevel) => string>();
  /** A level's description, a shade softer after its name (an area's «Familia»; '' = none). */
  readonly descOf = input<(level: PlaceLevel) => string>(() => '');
  /** The choices of a level, under the one chosen above it. */
  readonly optionsOf = input.required<(level: PlaceLevel) => PlaceOption[]>();
  readonly newId = input('__new');
  readonly disabled = input(false);
  /** Bumped by the page on every change, so the card reads it again. */
  readonly version = input(0);
  readonly pick = output<PlacePick>();

  protected readonly openLevel = signal<PlaceLevel | null>(null);
  protected choices: PlaceOption[] = [];
  protected draft = '';
  private anchor: HTMLElement | null = null;
  private token = 0;
  private closing = false;

  constructor() {
    const follow = () => this.place();
    window.addEventListener('resize', follow);
    window.visualViewport?.addEventListener('resize', follow);
    window.visualViewport?.addEventListener('scroll', follow);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('resize', follow);
      window.visualViewport?.removeEventListener('resize', follow);
      window.visualViewport?.removeEventListener('scroll', follow);
      try { this.menu()?.nativeElement.hidePopover(); } catch { /* not shown */ }
    });
  }

  protected levels(): PlaceLevel[] { return LEVELS[this.leafKind()]; }
  protected above(level: PlaceLevel): PlaceLevel { const levels = this.levels(); return levels[Math.max(0, levels.indexOf(level) - 1)]; }
  /** A level can be chosen once the one above it is (a new one above counts: only a new one fits under it). */
  protected ready(level: PlaceLevel): boolean { return level === 'area' || !!this.value()[this.above(level)]; }

  protected toggle(level: PlaceLevel, button: HTMLElement): void {
    if (this.openLevel() === level) { this.close(); return; }
    this.open(level, button);
  }

  private open(level: PlaceLevel, button: HTMLElement): void {
    const token = ++this.token;
    const menu = this.menu()?.nativeElement;
    if (!menu) return;
    this.tileEls().forEach((t) => t.getAnimations().forEach((a) => a.cancel()));
    this.anchor = button;
    this.choices = this.ready(level) ? this.optionsOf()(level) : [];
    this.draft = this.value()[level] === this.newId() ? this.labelOf()(level) : '';
    this.openLevel.set(level);
    try { if (!menu.matches(':popover-open')) menu.showPopover(); } catch { /* no popover: drawn fixed anyway */ }
    afterNextRender(() => {
      if (token !== this.token) return;
      this.place();
      flyTiles(button, this.tileEls(), true);
      // the chosen tile, else the first one; never the name box: the keyboard comes up only when it is tapped
      const tiles = this.tileEls().filter((t) => t.tagName === 'BUTTON');
      (tiles.find((t) => t.classList.contains('on')) ?? tiles[0] ?? menu).focus({ preventScroll: true });
    }, { injector: this.injector });
  }

  /** Its tiles slide back into the level they came from, as the pages menu's do. */
  close(): void {
    const menu = this.menu()?.nativeElement;
    if (!this.openLevel() || !menu || this.closing) return;
    const token = ++this.token;
    this.closing = true;
    const done = () => {
      this.closing = false;
      if (token !== this.token) return;
      try { menu.hidePopover(); } catch { /* not shown */ }
      this.openLevel.set(null);
      this.anchor = null;
    };
    const animations = this.anchor?.isConnected ? flyTiles(this.anchor, this.tileEls(), false) : [];
    if (!animations.length) { done(); return; }
    Promise.all(animations.map((a) => a.finished)).then(done, done);
  }
  /** A tap on the veil (outside the tiles) closes it. */
  protected onVeil(event: MouseEvent): void {
    if (event.target === this.menu()?.nativeElement) { event.stopPropagation(); this.close(); }
  }

  protected choose(level: PlaceLevel, id: string): void {
    this.anchor?.focus({ preventScroll: true });
    this.close();
    if (id !== this.value()[level]) this.pick.emit({ level, id });
  }
  protected create(level: PlaceLevel): void {
    const name = this.draft.trim();
    if (!name) return;
    this.anchor?.focus({ preventScroll: true });
    this.close();
    this.pick.emit({ level, id: this.newId(), name });
  }
  protected menuKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();                 // the window under it, or the open card, stays open
    event.stopPropagation();
    this.anchor?.focus({ preventScroll: true });
    this.close();
  }

  /** Under the level tapped (above it when there is more room), kept inside the visible screen, keyboard included. */
  private place(): void {
    const anchor = this.anchor;
    if (!anchor || !this.openLevel()) return;
    if (!anchor.isConnected) { this.close(); return; }
    placeFan(anchor, this.fanBox()?.nativeElement);
  }
  private tileEls(): HTMLElement[] { return this.tiles().map((t) => t.nativeElement); }
}
