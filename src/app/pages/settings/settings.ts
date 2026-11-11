import { AfterViewInit, Component, ElementRef, inject, output, viewChild } from '@angular/core';
import { closeDialog, isBackdropClick, openDialog } from '../../core/dialog';
import { I18n } from '../../core/i18n';
import { THEMES, Theme, ThemeService } from '../../core/theme';

/**
 * Ajustes (⚙ in the ☰ menu): a window over the page you are on, not a page of its own (Gianni: going to another page
 * and then looking for the Week again felt wrong). A theme picked here shows at once behind the window; closing it
 * (×, Done, Esc or the backdrop) leaves you where you were. Epic is the colourful look; Office and Graphite are quiet
 * greys. The choices are kept on this device.
 */
@Component({
  selector: 'app-settings',
  template: `
    <dialog #dialog class="settings-window" aria-labelledby="settings-title" (click)="onBackdrop($event)" (close)="closed.emit()">
      <header class="settings-head">
        <h2 id="settings-title" tabindex="-1">{{ i18n.t('settings.title') }}</h2>
        <button type="button" class="drawer-close" [attr.aria-label]="i18n.t('nav.close')" (click)="close()">×</button>
      </header>
      <h3 class="settings-title" id="theme-title">{{ i18n.t('settings.theme') }}</h3>
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
      <!-- The time line on the Week board: red, or with the theme (the grey themes keep it a quiet grey) -->
      <label class="setting-row">
        <input type="checkbox" class="setting-check" [checked]="look.redLine()" (change)="look.redLine.set($any($event.target).checked)" />
        <span class="setting-text">
          <strong><span class="red-sample" aria-hidden="true"></span>{{ i18n.t('settings.redLine') }}</strong>
          <small>{{ i18n.t('settings.redLineHint') }}</small>
        </span>
      </label>
      <footer class="settings-foot">
        <button type="button" class="primary" (click)="close()">{{ i18n.t('task.done') }}</button>
      </footer>
    </dialog>
  `,
})
export class Settings implements AfterViewInit {
  protected readonly i18n = inject(I18n);
  protected readonly look = inject(ThemeService);
  protected readonly themes = THEMES;
  /** Emitted once the window has shrunk away (the App then removes it). */
  readonly closed = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  ngAfterViewInit(): void {
    const d = this.dialog().nativeElement;
    openDialog(d);
    queueMicrotask(() => d.querySelector<HTMLElement>('#settings-title')?.focus({ preventScroll: true }));
  }

  protected pick(theme: Theme): void {
    this.look.set(theme);
  }

  protected close(): void {
    void closeDialog(this.dialog().nativeElement);
  }

  protected onBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.dialog().nativeElement)) this.close();
  }
}
