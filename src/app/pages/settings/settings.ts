import { AfterViewInit, Component, ElementRef, inject, output, viewChild } from '@angular/core';
import { closeDialog, isBackdropClick, openDialog } from '../../core/dialog';
import { AuthService } from '../../core/auth.service';
import { I18n } from '../../core/i18n';
import { Tilt } from '../../core/tilt';
import { ThemeService } from '../../core/theme';

/**
 * Ajustes (⚙ in the ☰ menu): a window over the page you are on, not a page of its own (Gianni: going to another page
 * and then looking for the Week again felt wrong); closing it (×, Done, Esc or the backdrop) leaves you where you were.
 * Opened by the action menu's ⚙ (the ☰ menu is gone). It holds who is signed in, English / Español, the weighted
 * buttons, the red time line (no Sign out: Gianni, it left the app altogether); the themes are the action menu's palette (Gianni). Kept on this device.
 */
@Component({
  selector: 'app-settings',
  template: `
    <dialog #dialog class="settings-window" aria-labelledby="settings-title" (click)="onBackdrop($event)" (close)="closed.emit()">
      <header class="settings-head">
        <h2 id="settings-title" tabindex="-1">{{ i18n.t('settings.title') }}</h2>
        <button type="button" class="drawer-close" [attr.aria-label]="i18n.t('nav.close')" (click)="close()">×</button>
      </header>
      @if (auth.user(); as user) { <p class="settings-user">{{ user.displayName || user.email }}</p> }
      <!-- English / Español (Gianni: the ☰ menu that held the switch is gone) -->
      <div class="setting-row lang-row" role="group" [attr.aria-label]="i18n.t('settings.language')">
        <strong class="setting-text">{{ i18n.t('settings.language') }}</strong>
        <div class="capture-tabs lang-choice">
          <button type="button" [class.on]="i18n.lang() === 'en'" [attr.aria-pressed]="i18n.lang() === 'en'" (click)="i18n.setLang('en')">English</button>
          <button type="button" [class.on]="i18n.lang() === 'es'" [attr.aria-pressed]="i18n.lang() === 'es'" (click)="i18n.setLang('es')">Español</button>
        </div>
      </div>
      <!-- Weighted buttons: everything leans when the phone leans (core/tilt) -->
      <label class="setting-row">
        <input type="checkbox" class="setting-check" [checked]="tilt.on()" (change)="tilt.toggle()" />
        <span class="setting-text">
          <strong>⚖ {{ i18n.t('nav.tilt') }}</strong>
          <small>{{ i18n.t('nav.tiltHint') }}</small>
        </span>
      </label>
      <!-- The time line on the Week board: red, or with the theme (the grey themes keep it a quiet grey) -->
      <label class="setting-row">
        <input type="checkbox" class="setting-check" [checked]="look.redLine()" (change)="look.redLine.set($any($event.target).checked)" />
        <span class="setting-text">
          <strong><span class="red-sample" aria-hidden="true"></span>{{ i18n.t('settings.redLine') }}</strong>
          <small>{{ i18n.t('settings.redLineHint') }}</small>
        </span>
      </label>
      <footer class="settings-foot">
        <button type="button" class="primary btn-apply" (click)="close()">{{ i18n.t('task.done') }}</button>
      </footer>
    </dialog>
  `,
})
export class Settings implements AfterViewInit {
  protected readonly i18n = inject(I18n);
  protected readonly look = inject(ThemeService);
  protected readonly tilt = inject(Tilt);
  protected readonly auth = inject(AuthService);
  /** Emitted once the window has shrunk away (the App then removes it). */
  readonly closed = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  ngAfterViewInit(): void {
    const d = this.dialog().nativeElement;
    openDialog(d);
    queueMicrotask(() => d.querySelector<HTMLElement>('#settings-title')?.focus({ preventScroll: true }));
  }

  protected close(): void {
    void closeDialog(this.dialog().nativeElement);
  }

  protected onBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.dialog().nativeElement)) this.close();
  }
}
