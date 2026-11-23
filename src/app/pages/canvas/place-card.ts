import { Component, DestroyRef, ElementRef, Injector, afterNextRender, inject, input, output, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { I18n } from '../../core/i18n';

export type PlaceLevel = 'area' | 'epic' | 'feature' | 'story';
export interface PlaceOption { id: string; title: string; }
/** A level chosen in the floating menu: an existing one's id, or `newId` with the name typed for a new one. */
export interface PlacePick { level: PlaceLevel; id: string; name?: string; }

/** The levels above each object, in order (an Activity sits in a Story, a Story in a Feature, a Feature in an Epic). */
const LEVELS: Record<'feature' | 'story' | 'task', PlaceLevel[]> = {
  feature: ['area', 'epic'],
  story: ['area', 'epic', 'feature'],
  task: ['area', 'epic', 'feature', 'story'],
};
const OPEN_MS = 220;
const CLOSE_MS = 160;

/**
 * Where an object lives, drawn as the Canvas draws it (Gianni): the Area and the Epic on the plum card, the Feature's
 * yellow jelly box inside it, the Story's cream box inside that, and the object itself innermost. Every level not chosen
 * yet reads «Por definir»; a tap on a level opens a small floating menu growing out of it, with that level's existing
 * choices under the one chosen above and a box to name a new one right there (Gianni: there is no other place to create
 * them). Choosing a level clears the ones below it. The page decides when the place is applied (all levels chosen).
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
      <button type="button" class="pc-head pc-tap place-line" [class.pc-wait]="!ready(level)" [disabled]="disabled()"
        aria-haspopup="dialog" [attr.aria-expanded]="openLevel() === level" (click)="toggle(level, $any($event.currentTarget))">
        <small>{{ i18n.t('canvas.' + level) }}</small>
        <strong [class.pc-empty]="!label">{{ label || i18n.t('canvas.toDefine') }}</strong>
      </button>
    </ng-template>
    <ng-template #leaf>
      <span class="pc-head pc-leaf"><small>{{ i18n.t('canvas.' + kind) }}</small><strong>{{ leafTitle() }}</strong></span>
    </ng-template>

    <!-- The floating menu: in the top layer, so no card or window clips it; it grows out of the level tapped -->
    <div #menu popover="manual" class="place-menu" role="dialog" [attr.aria-label]="openLevel() ? i18n.t('canvas.' + openLevel()) : null"
      tabindex="-1" (keydown)="menuKey($event)">
      @if (openLevel(); as level) {
        <p class="pm-title">{{ i18n.t('canvas.' + level) }}</p>
        @if (!ready(level)) {
          <p class="pm-note">{{ i18n.t('canvas.chooseFirst', { level: i18n.t('canvas.' + above(level)) }) }}</p>
        } @else {
          <div class="pm-list">
            @for (option of choices; track option.id) {
              <button type="button" class="pm-opt" [class.on]="option.id === value()[level]" [attr.aria-pressed]="option.id === value()[level]"
                (click)="choose(level, option.id)"><span>{{ option.title }}</span>@if (option.id === value()[level]) { <span class="pm-check" aria-hidden="true">✓</span> }</button>
            } @empty {
              <p class="pm-note">{{ i18n.t('canvas.noneYet') }}</p>
            }
          </div>
          @if (level !== 'area') {
            <!-- not a form: the card may sit inside a window's form, which a nested submit would apply -->
            <div class="pm-new">
              <input [value]="draft" (input)="draft = $any($event.target).value" autocomplete="off" enterkeyhint="done"
                (keydown.enter)="$event.preventDefault(); $event.stopPropagation(); create(level)"
                [attr.aria-label]="i18n.t('canvas.new.' + level)" [placeholder]="'+ ' + i18n.t('canvas.new.' + level)" />
              <button type="button" class="primary" [disabled]="!draft.trim()" (click)="create(level)">{{ i18n.t('place.create') }}</button>
            </div>
          }
        }
      }
    </div>
  `,
})
export class PlaceCard {
  protected readonly i18n = inject(I18n);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');

  /** What is being placed: an Activity (four levels above it), a Story (three) or a Feature (two). */
  readonly leafKind = input.required<'feature' | 'story' | 'task'>();
  readonly leafTitle = input('');
  /** The chosen id of each level ('' = to be defined; `newId` = a new one, named in `labelOf`). */
  readonly value = input.required<Record<PlaceLevel, string>>();
  /** A level's name as shown ('' = to be defined). */
  readonly labelOf = input.required<(level: PlaceLevel) => string>();
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

  constructor() {
    const follow = () => this.place();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const menu = this.menu()?.nativeElement;
      if (!this.openLevel() || !target || menu?.contains(target) || this.anchor?.contains(target)) return;
      this.close();
    };
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    window.visualViewport?.addEventListener('resize', follow);
    window.visualViewport?.addEventListener('scroll', follow);
    document.addEventListener('pointerdown', outside, true);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
      window.visualViewport?.removeEventListener('resize', follow);
      window.visualViewport?.removeEventListener('scroll', follow);
      document.removeEventListener('pointerdown', outside, true);
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
    menu.getAnimations().forEach((a) => a.cancel());
    this.anchor = button;
    this.choices = this.ready(level) ? this.optionsOf()(level) : [];
    this.draft = this.value()[level] === this.newId() ? this.labelOf()(level) : '';
    this.openLevel.set(level);
    afterNextRender(() => {
      if (token !== this.token) return;
      try { if (!menu.matches(':popover-open')) menu.showPopover(); } catch { /* no popover: drawn fixed anyway */ }
      menu.classList.add('on');
      this.place();
      menu.focus({ preventScroll: true });   // never the name box: the keyboard comes up only when it is tapped
      if (this.reduced()) return;
      const m = menu.getBoundingClientRect();
      const a = button.getBoundingClientRect();
      menu.style.transformOrigin = `${a.left + a.width / 2 - m.left}px ${a.top + a.height / 2 - m.top}px`;
      menu.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: OPEN_MS, easing: 'cubic-bezier(0,0,.2,1)' });
    }, { injector: this.injector });
  }

  /** It shrinks back into the level it came from. */
  close(): void {
    const menu = this.menu()?.nativeElement;
    if (!this.openLevel() || !menu) return;
    const token = ++this.token;
    const done = () => {
      if (token !== this.token) return;
      menu.classList.remove('on');
      try { menu.hidePopover(); } catch { /* not shown */ }
      this.openLevel.set(null);
      this.anchor = null;
    };
    if (this.reduced()) { done(); return; }
    menu.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.6)' }], { duration: CLOSE_MS, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' })
      .finished.then(done, done);
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

  /** Under the level tapped (above it when there is no room), kept 12px inside the visible screen, keyboard included. */
  private place(): void {
    const menu = this.menu()?.nativeElement;
    const anchor = this.anchor;
    if (!menu || !anchor || !this.openLevel()) return;
    if (!anchor.isConnected) { this.close(); return; }
    const vv = window.visualViewport;
    const top0 = vv?.offsetTop ?? 0;
    const left0 = vv?.offsetLeft ?? 0;
    const vw = vv?.width ?? document.documentElement.clientWidth;
    const vh = vv?.height ?? window.innerHeight;
    const r = anchor.getBoundingClientRect();
    const width = Math.min(Math.max(r.width, 240), 340, vw - 24);
    menu.style.width = `${width}px`;
    menu.style.maxHeight = `${Math.max(160, vh - 24)}px`;
    const height = menu.offsetHeight;
    const left = Math.max(left0 + 12, Math.min(left0 + vw - 12 - width, r.left));
    let top = r.bottom + 6;
    if (top + height > top0 + vh - 12) top = r.top - 6 - height >= top0 + 12 ? r.top - 6 - height : Math.max(top0 + 12, top0 + vh - 12 - height);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  private reduced(): boolean { return window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof this.host.nativeElement.animate !== 'function'; }
}
