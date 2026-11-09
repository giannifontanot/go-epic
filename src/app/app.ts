import { Component, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { I18n } from './core/i18n';
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
        <span class="spacer"></span>
        <button type="button" class="chip quiet" (click)="i18n.toggle()" [attr.aria-label]="i18n.lang() === 'en' ? 'Español' : 'English'">
          {{ i18n.lang() === 'en' ? 'ES' : 'EN' }}</button>
        <button type="button" class="chip quiet" (click)="auth.signOut()">{{ i18n.t('nav.signOut') }}</button>
      </nav>
      @if (store.error()) {
        <p class="app-error" role="alert">{{ i18n.t('saveFailed') }}: {{ store.error() }}
          <button type="button" class="chip quiet" (click)="store.error.set('')">×</button></p>
      }
    }
    <main><router-outlet /></main>
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);
  protected readonly store = inject(WeekStore);
  private readonly router = inject(Router);

  constructor() {
    // Signing out (here or in another tab) leaves the open page for the sign-in page; the guards only run on navigation.
    effect(() => {
      if (this.auth.user() === null && !this.router.url.startsWith('/login')) this.router.navigateByUrl('/login').catch(() => undefined);
    });
  }
}
