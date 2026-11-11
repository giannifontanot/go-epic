import { Component, inject } from '@angular/core';
import { I18n } from '../../core/i18n';
import { THEMES, Theme, ThemeService } from '../../core/theme';

/**
 * Ajustes (from the ☰ menu): the theme, and whether the Week board's time line is always red. Epic is the colourful look; Office is all quiet greys, so the app
 * draws no attention on a work screen (Gianni). The choice is kept on this device.
 */
@Component({
  selector: 'app-settings',
  template: `
    <section class="settings-page">
      <header class="board-top"><h1>{{ i18n.t('settings.title') }}</h1></header>
      <h2 class="settings-title" id="theme-title">{{ i18n.t('settings.theme') }}</h2>
      <div class="theme-options" role="radiogroup" aria-labelledby="theme-title">
        @for (theme of themes; track theme) {
          <button type="button" class="theme-option" role="radio" [attr.data-preview]="theme"
                  [attr.aria-checked]="look.theme() === theme" [class.on]="look.theme() === theme" (click)="pick(theme)">
            <span class="theme-preview" aria-hidden="true">
              <span class="tp-day"><span class="tp-block"><span class="tp-card"></span><span class="tp-card"></span></span></span>
            </span>
            <span class="theme-text">
              <strong>{{ i18n.t('theme.' + theme) }}</strong>
              <small>{{ i18n.t('theme.' + theme + 'Hint') }}</small>
            </span>
            <span class="theme-check" aria-hidden="true">{{ look.theme() === theme ? '✓' : '' }}</span>
          </button>
        }
      </div>
      <!-- The time line on the Week board: red, or with the theme (Office keeps it a quiet grey) -->
      <label class="setting-row">
        <input type="checkbox" class="setting-check" [checked]="look.redLine()" (change)="look.redLine.set($any($event.target).checked)" />
        <span class="setting-text">
          <strong><span class="red-sample" aria-hidden="true"></span>{{ i18n.t('settings.redLine') }}</strong>
          <small>{{ i18n.t('settings.redLineHint') }}</small>
        </span>
      </label>
    </section>
  `,
})
export class Settings {
  protected readonly i18n = inject(I18n);
  protected readonly look = inject(ThemeService);
  protected readonly themes = THEMES;

  protected pick(theme: Theme): void {
    this.look.set(theme);
  }
}
