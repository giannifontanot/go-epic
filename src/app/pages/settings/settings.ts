import { AfterViewInit, Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { AiService, cleanKey, looksLikeKey } from '../../core/ai.service';
import { Ask } from '../../shared/ask';
import { closeDialog, isBackdropClick, openDialog } from '../../core/dialog';
import { AuthService } from '../../core/auth.service';
import { I18n } from '../../core/i18n';
import { Tilt } from '../../core/tilt';
import { ThemeService } from '../../core/theme';

/**
 * Ajustes (⚙ in the ☰ menu): a window over the page you are on, not a page of its own (Gianni: going to another page
 * and then looking for the Week again felt wrong); closing it (×, Done, Esc or the backdrop) leaves you where you were.
 * Opened by the action menu's ⚙ (the ☰ menu is gone). It holds who is signed in, English / Español, the weighted
 * buttons (no Sign out: Gianni, it left the app altogether); the themes, and the red time line and red countdown bar boxes, are
 * in the action menu's Themes, in each theme's palette window (Gianni, v66). Kept on this device.
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
      <!-- One button per language in LANGS (core/i18n), each named in its own language (Gianni: the ☰ menu that held the switch is gone) -->
      <div class="setting-row lang-row" role="group" [attr.aria-label]="i18n.t('settings.language')">
        <strong class="setting-text">{{ i18n.t('settings.language') }}</strong>
        <div class="capture-tabs lang-choice">
          @for (l of i18n.langs; track l.code) {
            <button type="button" [attr.lang]="l.code" [class.on]="i18n.lang() === l.code" [attr.aria-pressed]="i18n.lang() === l.code"
                    (click)="i18n.setLang(l.code)">{{ l.name }}</button>
          }
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
      <!-- Claude: each person's own key, for the Week board's ✨ (Gianni: "Mi clave en Ajustes"); kept only in their account -->
      <div class="setting-row ai-key-row">
        <span class="setting-text">
          <strong>✦ {{ i18n.t('settings.ai') }}</strong>
          <small>{{ i18n.t('settings.aiHint') }}
            <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener noreferrer">{{ i18n.t('settings.aiGet') }}</a></small>
          @if (ai.hasKey()) {
            <span class="ai-key-saved">{{ i18n.t('settings.aiSaved', { end: ai.keyEnd() }) }}
              <button type="button" class="btn-delete" (click)="removeKey()">{{ i18n.t('settings.aiRemove') }}</button></span>
          } @else {
            <form class="ai-key-form" (submit)="$event.preventDefault(); saveKey(keyBox.value)">
              <input #keyBox class="ai-input" type="password" autocomplete="off" spellcheck="false" maxlength="300"
                     [attr.aria-label]="i18n.t('settings.aiKey')" [placeholder]="i18n.t('settings.aiKey')" (input)="keyBad.set(false)" />
              <button type="submit" class="primary btn-apply">{{ i18n.t('settings.aiSave') }}</button>
            </form>
            @if (keyBad()) { <small class="ai-error" role="alert">{{ i18n.t('settings.aiBad') }}</small> }
          }
        </span>
      </div>
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
  protected readonly ai = inject(AiService);
  private readonly asks = inject(Ask);
  protected readonly keyBad = signal(false);
  /** Emitted once the window has shrunk away (the App then removes it). */
  readonly closed = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  ngAfterViewInit(): void {
    const d = this.dialog().nativeElement;
    openDialog(d);
    queueMicrotask(() => d.querySelector<HTMLElement>('#settings-title')?.focus({ preventScroll: true }));
  }

  /** The person's own Claude key, saved only in their account; a value that is plainly not a key is refused. */
  protected saveKey(value: string): void {
    const key = cleanKey(value);
    if (!key) return;
    if (!looksLikeKey(key)) { this.keyBad.set(true); return; }
    void this.ai.saveKey(key);
  }

  /** Removing the key asks first and counts down like every delete (Gianni). */
  protected removeKey(): void {
    void this.asks.ask({
      message: this.i18n.t('settings.aiRemoveAsk'), ok: this.i18n.t('settings.aiRemove'), danger: true,
      countdown: { message: this.i18n.t('undo.deleting', { name: this.i18n.t('settings.aiKey') }), ids: [], commit: () => void this.ai.removeKey() },
    });
  }

  protected close(): void {
    void closeDialog(this.dialog().nativeElement);
  }

  protected onBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.dialog().nativeElement)) this.close();
  }
}
