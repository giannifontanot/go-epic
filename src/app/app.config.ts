import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Page changes fade the page out, then the new one in (Gianni: not a cut to nothing and a fade in); styles.css
    // html.vt-page. The first page only fades in (page-in); from the first change on, the transition does it (vt-ok).
    provideRouter(routes, withViewTransitions({
      skipInitialTransition: true,
      onViewTransitionCreated: ({ transition }) => {
        const root = document.documentElement;
        if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) { transition.skipTransition(); return; }
        root.classList.add('vt-ok', 'vt-page');
        const done = () => root.classList.remove('vt-page');
        transition.finished.then(done, done);
      },
    })),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
