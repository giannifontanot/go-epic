import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { CapturePanel } from './pages/capture/capture-panel';
import { CaptureUi } from './pages/capture/capture-ui';
import { closeDialog, isBackdropClick, openDialog } from './core/dialog';
import { I18n } from './core/i18n';
import { LibraryStore } from './core/library.store';
import { WeekStore } from './core/week.store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CapturePanel],
  template: `
    @if (auth.user()) {
      <button type="button" class="nav-toggle" [attr.aria-label]="i18n.t('nav.menu')" [attr.aria-expanded]="menuOpen()"
        aria-controls="app-drawer" (click)="openMenu()">☰</button>
      <dialog #drawer id="app-drawer" class="app-drawer" [attr.aria-label]="i18n.t('nav.menu')"
        (click)="onDrawerClick($event)" (close)="menuOpen.set(false)">
        <div class="drawer-head">
          <span class="brand">Go Epic</span>
          <button type="button" class="drawer-close" [attr.aria-label]="i18n.t('nav.close')" (click)="closeMenu()">×</button>
        </div>
        @if (auth.user(); as user) { <p class="drawer-user">{{ user.displayName || user.email }}</p> }
        <nav class="drawer-links">
          <a routerLink="/" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }" (click)="closeMenu()">{{ i18n.t('nav.week') }}</a>
          <a routerLink="/focus" routerLinkActive="on" (click)="closeMenu()">{{ i18n.t('nav.focus') }}</a>
          <a routerLink="/canvas" routerLinkActive="on" (click)="closeMenu()">{{ i18n.t('nav.canvas') }}</a>
          <a routerLink="/progress" routerLinkActive="on" (click)="closeMenu()">{{ i18n.t('nav.progress') }}</a>
          <button type="button" class="drawer-capture" (click)="openCapture()">✎ {{ i18n.t('capture.title') }}</button>
        </nav>
        <div class="drawer-foot">
          <button type="button" class="chip quiet" (click)="i18n.toggle()" [attr.aria-label]="i18n.lang() === 'en' ? 'Español' : 'English'">
            {{ i18n.lang() === 'en' ? 'Español' : 'English' }}</button>
          <button type="button" class="chip quiet" (click)="closeMenu(); auth.signOut()">{{ i18n.t('nav.signOut') }}</button>
        </div>
      </dialog>
      <app-capture-panel />
      @if (store.error()) {
        <p class="app-error" role="alert">{{ i18n.t('saveFailed') }}: {{ store.error() }}
          <button type="button" class="chip quiet" (click)="store.error.set('')">×</button></p>
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
    @if (updateReady()) {
      <div class="update-bar" role="status">
        <span>{{ i18n.t('pwa.update') }}</span>
        <button type="button" class="primary" (click)="reload()">{{ i18n.t('pwa.reload') }}</button>
      </div>
    }
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);
  protected readonly store = inject(WeekStore);
  protected readonly library = inject(LibraryStore);
  private readonly capture = inject(CaptureUi);
  private readonly router = inject(Router);
  /** The installed app (service worker) has downloaded a newer version: offer to switch to it. */
  protected readonly updateReady = signal(false);
  /** The menu (☰): a drawer from the left, as in Epic Manager, so every page has the whole screen. */
  protected readonly menuOpen = signal(false);
  private readonly drawer = viewChild<ElementRef<HTMLDialogElement>>('drawer');

  constructor() {
    const updates = inject(SwUpdate, { optional: true });
    if (updates?.isEnabled) {
      updates.versionUpdates.subscribe((event) => {
        if (event.type === 'VERSION_READY') this.updateReady.set(true);
      });
      updates.unrecoverable.subscribe(() => location.reload());   // the cached version is broken: load a fresh one
      setInterval(() => updates.checkForUpdate().catch(() => undefined), 30 * 60_000);   // a long-open app still hears of new versions
    }

    // Signing out (here or in another tab) leaves the open page for the sign-in page; the guards only run on navigation.
    effect(() => {
      if (this.auth.user() === null && !this.router.url.startsWith('/login')) this.router.navigateByUrl('/login').catch(() => undefined);
    });
  }

  protected openMenu(): void {
    const d = this.drawer()?.nativeElement;
    if (d && !d.open) { openDialog(d); this.menuOpen.set(true); }
  }
  protected closeMenu(): void {
    void closeDialog(this.drawer()?.nativeElement);
  }
  /** Capture from the menu: the menu closes and the panel opens from the pressed row. */
  protected openCapture(): void {
    this.closeMenu();
    this.capture.open.set(true);
  }
  protected onDrawerClick(event: MouseEvent): void {
    const d = this.drawer()?.nativeElement;
    if (d && isBackdropClick(event, d)) this.closeMenu();
  }

  protected onCanvas(): boolean { return this.router.url.startsWith('/canvas'); }

  protected reload(): void {
    location.reload();
  }
}
