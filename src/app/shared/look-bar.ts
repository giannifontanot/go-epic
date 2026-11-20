import { Component, ElementRef, computed, inject, input, viewChild } from '@angular/core';
import { I18n } from '../core/i18n';
import { TextSettings } from '../core/text-settings';
import { ThemePicker } from './theme-fan';

/**
 * The edit bar (Gianni): everything that changes how the board looks lives in edit mode. px (pixels per minute, the
 * Week board only), Aa (the activities' text size), AV (the space between letters), as in Epic Manager, seen at once
 * on the cards, and Themes, which fan out of their button (ThemeFan, drawn by the App).
 */
@Component({
  selector: 'app-look-bar',
  template: `
    <div class="text-steppers look-bar">
      @if (px()) {
        <div class="stepper" role="group" [attr.aria-label]="i18n.t('settings.pxPerMin')">
          <button type="button" [disabled]="!text.canStep('px', -1)" [attr.aria-label]="i18n.t('settings.shorter')" (click)="text.stepPx(-1)">−</button>
          <span class="px-value">{{ text.pxPerMin() }}<small>px</small></span>
          <button type="button" [disabled]="!text.canStep('px', 1)" [attr.aria-label]="i18n.t('settings.longer')" (click)="text.stepPx(1)">+</button>
        </div>
      }
      <div class="stepper" role="group" [attr.aria-label]="i18n.t('settings.size')">
        <button type="button" [disabled]="!text.canStep('size', -1)" [attr.aria-label]="i18n.t('settings.smaller')" (click)="text.stepSize(-1)">−</button>
        <span>Aa</span>
        <button type="button" [disabled]="!text.canStep('size', 1)" [attr.aria-label]="i18n.t('settings.bigger')" (click)="text.stepSize(1)">+</button>
      </div>
      <div class="stepper" role="group" [attr.aria-label]="i18n.t('settings.spacing')">
        <button type="button" [disabled]="!text.canStep('spacing', -1)" [attr.aria-label]="i18n.t('settings.tighter')" (click)="text.stepSpacing(-1)">−</button>
        <span>AV</span>
        <button type="button" [disabled]="!text.canStep('spacing', 1)" [attr.aria-label]="i18n.t('settings.wider')" (click)="text.stepSpacing(1)">+</button>
      </div>
      <button #themes type="button" class="chip quiet look-themes" [class.on]="open()" [attr.aria-expanded]="open()" aria-controls="theme-fan"
              (click)="picker.toggle(themes)">
        <!-- an outlined palette, as light as the round buttons' icons -->
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
          <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1 0 1.6-.7 1.6-1.5 0-.5-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.9.7-1.6 1.6-1.6H16a4.6 4.6 0 0 0 4.5-4.6C20.5 6.7 16.7 3.5 12 3.5Z"/>
          <g fill="currentColor" stroke="none"><circle cx="7.6" cy="11" r="1.3"/><circle cx="10" cy="7.5" r="1.3"/>
          <circle cx="14.4" cy="7.5" r="1.3"/><circle cx="16.8" cy="11" r="1.3"/></g>
        </svg>
        {{ i18n.t('settings.theme') }}
      </button>
    </div>
  `,
})
export class LookBar {
  protected readonly i18n = inject(I18n);
  protected readonly text = inject(TextSettings);
  protected readonly picker = inject(ThemePicker);
  /** The px stepper (pixels per minute): the Week board only. */
  readonly px = input(false);
  private readonly themes = viewChild<ElementRef<HTMLButtonElement>>('themes');
  protected readonly open = computed(() => { const b = this.themes(); return !!b && this.picker.anchor() === b.nativeElement; });
}
