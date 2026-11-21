import { AfterViewInit, Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { closeDialog, isBackdropClick, openDialog } from '../../core/dialog';
import { AuthService } from '../../core/auth.service';
import { I18n } from '../../core/i18n';
import { Tilt } from '../../core/tilt';
import { ThemeService } from '../../core/theme';
import { PaletteService } from '../../core/palette';
import { PALETTES, defaultPalette, edgeFor, paletteFor } from '../../core/palette.model';

/**
 * Ajustes (⚙ in the ☰ menu): a window over the page you are on, not a page of its own (Gianni: going to another page
 * and then looking for the Week again felt wrong); closing it (×, Done, Esc or the backdrop) leaves you where you were.
 * Opened by the action menu's ⚙ (the ☰ menu is gone). It holds who is signed in, English / Español, the weighted
 * buttons, the red time line and the Palettes (each theme's activity colours, and whether only their edge wears them) (no Sign out: Gianni, it left the app altogether); the themes are the action menu's palette (Gianni). Kept on this device.
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
      <!-- Palettes: the colours each theme draws its activities with, and whether only their edge wears it (Gianni) -->
      <section class="palette-section">
        <button type="button" class="setting-row palette-toggle" [attr.aria-expanded]="palettesOpen()" aria-controls="palette-panel" (click)="palettesOpen.set(!palettesOpen())">
          <span class="palette-mini" aria-hidden="true">
            @for (c of chosen().colors.slice(0, 4); track $index) { <i [style.background]="c"></i> }
          </span>
          <span class="setting-text">
            <strong>{{ i18n.t('palette.title') }}</strong>
            <small>{{ i18n.t('palette.hint') }}</small>
          </span>
          <span class="palette-chev" aria-hidden="true">⌄</span>
        </button>
        @if (palettesOpen()) {
          <div id="palette-panel" class="palette-panel">
            <p class="palette-label" id="palette-list-label">{{ i18n.t('palette.list') }} · {{ i18n.t('theme.' + editing()) }}</p>
            <div class="palette-list" role="radiogroup" aria-labelledby="palette-list-label">
              @for (p of palettes; track p.id) {
                <button type="button" role="radio" class="palette-row" [class.on]="chosen().id === p.id" [attr.aria-checked]="chosen().id === p.id"
                  (click)="palette.setPalette(editing(), p.id)">
                  <span class="palette-name">
                    {{ i18n.t('palette.' + p.id) }}
                    @if (p.id === ownPalette()) { <small>· {{ i18n.t('palette.own') }}</small> }
                  </span>
                  <span class="palette-swatches" aria-hidden="true">
                    @for (c of p.colors; track $index) { <i [style.background]="c"></i> }
                  </span>
                  <span class="palette-tick" aria-hidden="true">{{ chosen().id === p.id ? '✓' : '' }}</span>
                </button>
              }
            </div>
            <label class="setting-row">
              <input type="checkbox" class="setting-check" [checked]="edge()" (change)="palette.setEdge(editing(), $any($event.target).checked)" />
              <span class="setting-text">
                <strong><span class="edge-sample" aria-hidden="true"></span>{{ i18n.t('palette.edge') }} · {{ i18n.t('theme.' + editing()) }}</strong>
                <small>{{ i18n.t('palette.edgeHint') }}</small>
              </span>
            </label>
          </div>
        }
      </section>
      <footer class="settings-foot">
        <button type="button" class="primary" (click)="close()">{{ i18n.t('task.done') }}</button>
      </footer>
    </dialog>
  `,
})
export class Settings implements AfterViewInit {
  protected readonly i18n = inject(I18n);
  protected readonly look = inject(ThemeService);
  protected readonly tilt = inject(Tilt);
  protected readonly auth = inject(AuthService);
  protected readonly palette = inject(PaletteService);
  protected readonly palettes = PALETTES;
  protected readonly palettesOpen = signal(false);
  /** The theme whose palette is being chosen: always the one on (Gianni); each theme keeps its own choice. */
  protected editing() { return this.look.theme(); }
  protected chosen() { return paletteFor(this.editing(), this.palette.palettes()); }
  protected ownPalette(): string { return defaultPalette(this.editing()); }
  protected edge(): boolean { return edgeFor(this.editing(), this.palette.edges()); }
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
