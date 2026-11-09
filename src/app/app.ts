import { Component, effect, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { I18n } from './core/i18n';
import { LibraryStore } from './core/library.store';
import { WeekStore } from './core/week.store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    @if (auth.user()) {
      <nav class="app-nav">
        <a class="brand" routerLink="/">Go&nbsp;Epic</a>
        <a routerLink="/" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }">{{ i18n.t('nav.week') }}</a>
        <a routerLink="/focus" routerLinkActive="on">{{ i18n.t('nav.focus') }}</a>
        <a routerLink="/canvas" routerLinkActive="on">{{ i18n.t('nav.canvas') }}</a>
        <span class="spacer"></span>
        <button type="button" class="chip quiet" (click)="i18n.toggle()" [attr.aria-label]="i18n.lang() === 'en' ? 'Español' : 'English'">
          {{ i18n.lang() === 'en' ? 'ES' : 'EN' }}</button>
        <button type="button" class="chip quiet" (click)="auth.signOut()">{{ i18n.t('nav.signOut') }}</button>
      </nav>
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
  private readonly router = inject(Router);
  /** The installed app (service worker) has downloaded a newer version: offer to switch to it. */
  protected readonly updateReady = signal(false);

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

  protected onCanvas(): boolean { return this.router.url.startsWith('/canvas'); }

  protected reload(): void {
    location.reload();
  }
}
