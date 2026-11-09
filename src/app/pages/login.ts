import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { I18n } from '../core/i18n';

@Component({
  selector: 'app-login',
  template: `
    <section class="login">
      <h1>Go Epic</h1>
      @if (auth.configured) {
        <p class="lead">{{ i18n.t('login.lead') }}</p>
        <button type="button" class="primary big" [disabled]="busy()" (click)="signIn()">{{ i18n.t('login.google') }}</button>
        @if (error()) { <p class="app-error" role="alert">{{ i18n.t('login.failed') }}: {{ error() }}</p> }
      } @else {
        <h2>{{ i18n.t('setup.title') }}</h2>
        <p class="lead">{{ i18n.t('setup.body') }}</p>
      }
      <button type="button" class="chip quiet" (click)="i18n.toggle()">{{ i18n.lang() === 'en' ? 'Español' : 'English' }}</button>
    </section>
  `,
})
export class Login {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  async signIn(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.signIn();
      await this.router.navigateByUrl('/');
    } catch (error) {
      this.error.set(String((error as { message?: string }).message ?? error));
    } finally {
      this.busy.set(false);
    }
  }
}
