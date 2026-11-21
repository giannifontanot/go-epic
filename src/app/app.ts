import { TitleFan } from './shared/title-fan';
import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { CapturePanel } from './pages/capture/capture-panel';
import { CaptureUi } from './pages/capture/capture-ui';
import { ActionMenu } from './shared/action-menu';
import { ThemeFan } from './shared/theme-fan';
import { LookStack } from './shared/look-stack';
import { AskWindow } from './shared/ask';
import { Settings } from './pages/settings/settings';
import { CHANGES, Change, lastVersion, sanitizeChanges, versionPages } from './core/changes.model';
import { openDialog, warmUpWindows } from './core/dialog';
import { I18n } from './core/i18n';
import { DatesStore } from './core/dates.store';
import { LibraryStore } from './core/library.store';
import { Tilt } from './core/tilt';
import { TextSettings } from './core/text-settings';
import { ThemeService } from './core/theme';
import { PaletteService } from './core/palette';
import { UnsavedWork } from './core/unsaved';
import { WeekStore } from './core/week.store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, CapturePanel, Settings, ActionMenu, ThemeFan, TitleFan, AskWindow, LookStack],
  template: `
    @if (auth.user()) {
      <app-capture-panel />
      <!-- one round button at the bottom right of every page (Gianni): + new task, Capture, the day overview, Edit and the
           pages with Ajustes last (no ☰ menu any more); hidden while the Week board is arranged (its ✓ Finish takes the spot) -->
      @if (!ui.menuHidden()) { <app-action-menu /> }
      <!-- edit mode (Gianni): Aa, AV, Themes and px stack at the bottom right above a round ✓ Finish -->
      <app-look-stack />
      <!-- a confirmed delete waits 5 s with a Cancel (Gianni) -->
      <!-- the themes fan out of the edit bar's Themes button; drawn here, outside the page (a grey theme's filter would move and grey them) -->
      <app-theme-fan />
      <app-title-fan />
      <!-- Ajustes: a window over the current page (the theme changes behind it), never a page of its own -->
      @if (ui.settings()) { <app-settings (closed)="ui.settings.set(false)" /> }
      <!-- the app's own question windows (delete?, discard?…), in place of the browser's confirm/alert boxes -->
      <app-ask-window />
      @if (store.error()) {
        <p class="app-error" role="alert">{{ i18n.t('saveFailed') }}: {{ store.error() }}
          <button type="button" class="chip quiet" (click)="store.error.set('')">×</button></p>
      }
      @if (dates.error()) {
        <p class="app-error" role="alert">{{ i18n.t('saveFailed') }}: {{ dates.error() }}
          <button type="button" class="chip quiet" (click)="dates.error.set('')">×</button></p>
      }
      @if (library.error() && !library.rejected()) {
        <p class="app-error" role="alert">{{ i18n.t('saveFailed') }}: {{ library.error() }}
          <button type="button" class="chip quiet" (click)="library.error.set('')">×</button></p>
      }
      @if (library.rejected() && !onCanvas()) {
        <p class="app-error" role="alert">{{ i18n.t('canvas.rejected') }} <a routerLink="/canvas">{{ i18n.t('canvas.restore') }}</a></p>
      }
    }
    <main><router-outlet /></main>
    <!-- A new version: a native modal window over everything (other windows included) with one big, sober button
         and the list of what changed since the running version (Gianni: so he knows what to look for). It waits while a Canvas draft is unsaved or another window is open, since the reload would lose them. -->
    <dialog #updateDialog class="update-overlay" aria-labelledby="update-text" (cancel)="$event.preventDefault()">
      <div class="update-card">
        <p id="update-text">{{ i18n.t('pwa.update') }}</p>
        @if (page(); as p) {
          <section class="update-changes" aria-labelledby="update-new">
            <h2 id="update-new">{{ i18n.t('pwa.whatsNew') }}</h2>
            <!-- ‹ › page through every earlier version's list (Gianni: to see what each update window said) -->
            <div class="update-nav">
              <button type="button" class="update-step" [disabled]="pageIndex() >= pages().length - 1"
                [attr.aria-label]="i18n.t('pwa.older')" [title]="i18n.t('pwa.older')" (click)="stepPage(1)">‹</button>
              <div class="update-version" aria-live="polite">
                {{ i18n.t('pwa.version', { n: p.v }) }} · {{ shortDate(p.date) }}
                @if (p.isNew) { <span class="update-new-tag">{{ i18n.t('pwa.newTag') }}</span> }
              </div>
              <button type="button" class="update-step" [disabled]="pageIndex() === 0"
                [attr.aria-label]="i18n.t('pwa.newer')" [title]="i18n.t('pwa.newer')" (click)="stepPage(-1)">›</button>
            </div>
            <ul>
              @for (line of p.lines; track $index) { <li>{{ line }}</li> }
            </ul>
          </section>
        }
        <button type="button" class="update-button" (click)="reload()">{{ i18n.t('pwa.reload') }}</button>
      </div>
    </dialog>
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);
  protected readonly store = inject(WeekStore);
  protected readonly library = inject(LibraryStore);
  protected readonly dates = inject(DatesStore);
  private readonly tilt = inject(Tilt);
  /** The text size and letter spacing chosen on the Week board (Aa / AV) apply everywhere from the start. */
  protected readonly text = inject(TextSettings);
  /** The chosen theme (Ajustes) stays applied on every page. */
  protected readonly theme = inject(ThemeService);
  /** Each theme's chosen activity palette (Ajustes › Palettes) stays applied too. */
  protected readonly palette = inject(PaletteService);
  private readonly router = inject(Router);
  /** The installed app (service worker) has downloaded a newer version: offer to switch to it. */
  protected readonly updateReady = signal(false);
  /** Capture's and Ajustes' open flags, the page's menu action and whether the action menu is hidden. */
  protected readonly ui = inject(CaptureUi);
  private readonly updateDialog = viewChild<ElementRef<HTMLDialogElement>>('updateDialog');
  private readonly unsaved = inject(UnsavedWork);
  /**
   * The update prompt shows once a version is ready and nothing would be lost by its reload: no unsaved Canvas draft
   * and no other window open (an editor keeps its changes until Done; any window may hold typed text). While either
   * holds, it looks again every second.
   */
  protected readonly showUpdate = signal(false);
  /** What the waiting version brings, newer than this build's last change, in the chosen language. */
  private readonly waitingChanges = signal<Change[]>([]);
  /** Every version's list, newest first (the waiting version's file, else this build's own history). */
  protected readonly pages = computed(() => {
    const list = this.waitingChanges().length ? this.waitingChanges() : CHANGES;
    return versionPages(list, lastVersion(), this.i18n.lang());
  });
  /** The page shown: 0 is the newest version; ‹ goes back in time. */
  protected readonly pageIndex = signal(0);
  protected readonly page = computed(() => this.pages()[Math.min(this.pageIndex(), this.pages().length - 1)] ?? null);

  constructor() {
    this.tilt.start();   // buttons lean when the phone leans (a visual detail)
    // once the app is idle, what windows need the first time is made ready, so their first opening is smooth too
    if (typeof window !== 'undefined') {
      const idle = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (idle) idle.call(window, () => warmUpWindows(), { timeout: 3000 }); else setTimeout(() => warmUpWindows(), 1500);
    }
    const updates = inject(SwUpdate, { optional: true });
    if (updates?.isEnabled) {
      updates.versionUpdates.subscribe((event) => {
        if (event.type !== 'VERSION_READY') return;
        this.updateReady.set(true);
        this.loadChanges();
      });
      updates.unrecoverable.subscribe(() => location.reload());   // the cached version is broken: load a fresh one
      setInterval(() => updates.checkForUpdate().catch(() => undefined), 30 * 60_000);   // a long-open app still hears of new versions
      // and whenever it comes back to the screen (Gianni: a new version did not show until the app was reopened), at most once a minute
      let lastCheck = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 60_000) return;
        lastCheck = Date.now();
        updates.checkForUpdate().catch(() => undefined);
      });
    }

    effect((onCleanup) => {
      if (!this.updateReady() || this.unsaved.canvasDraft() || this.showUpdate()) return;
      const otherWindowOpen = () => typeof document !== 'undefined' && !!document.querySelector('dialog[open]:not(.update-overlay), .pop-window.on');
      if (!otherWindowOpen()) { this.showUpdate.set(true); return; }
      const timer = setInterval(() => { if (!otherWindowOpen() && !this.unsaved.canvasDraft()) this.showUpdate.set(true); }, 1000);
      onCleanup(() => clearInterval(timer));
    });
    effect(() => {
      const d = this.updateDialog()?.nativeElement;
      if (!d || !this.showUpdate() || d.open) return;
      if (typeof d.showModal === 'function') openDialog(d, { escape: false });
      else d.setAttribute('open', '');                        // no native modal (old browsers, test DOM): just show it
    });

    // Signing out (here or in another tab) leaves the open page for the sign-in page; the guards only run on navigation.
    effect(() => {
      if (this.auth.user() === null && !this.router.url.startsWith('/login')) this.router.navigateByUrl('/login').catch(() => undefined);
    });
  }

  protected onCanvas(): boolean { return this.router.url.startsWith('/canvas'); }

  /** Reads the newest `/changes.json` from the server, past the service worker and every cache; no list if it fails. */
  private loadChanges(): void {
    fetch(`/changes.json?ngsw-bypass=true&t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((raw: unknown) => { this.waitingChanges.set(sanitizeChanges(raw)); this.pageIndex.set(0); })
      .catch(() => undefined);
  }

  protected stepPage(delta: number): void {
    this.pageIndex.update((i) => Math.max(0, Math.min(this.pages().length - 1, i + delta)));
  }

  protected shortDate(date: string): string {
    const d = new Date(`${date}T12:00:00`);
    if (isNaN(d.getTime())) return date;
    return d.toLocaleDateString(this.i18n.lang() === 'es' ? 'es' : 'en', { day: 'numeric', month: 'short' });
  }

  protected reload(): void {
    location.reload();
  }
}
