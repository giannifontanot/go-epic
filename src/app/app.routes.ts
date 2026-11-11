import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, CanDeactivateFn, Router, Routes } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { AuthService } from './core/auth.service';

/** Waits for Firebase to know who is signed in, then lets the page open or sends to the sign-in page. */
function signedIn(wanted: boolean): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    return toObservable(auth.user).pipe(
      filter((user) => user !== undefined),
      take(1),
      map((user) => (!!user === wanted ? true : router.createUrlTree([wanted ? '/login' : '/']))),
    );
  };
}

/** A page with an unsaved draft (Floating Canvas) asks before it is left. */
const draftSaved: CanDeactivateFn<{ canLeave(): boolean }> = (page) => page.canLeave();

export const routes: Routes = [
  { path: 'login', canActivate: [signedIn(false)], loadComponent: () => import('./pages/login').then((m) => m.Login) },
  { path: '', canActivate: [signedIn(true)], loadComponent: () => import('./pages/week-board/week-board').then((m) => m.WeekBoard) },
  { path: 'focus', canActivate: [signedIn(true)], loadComponent: () => import('./pages/focus/focus').then((m) => m.Focus) },
  { path: 'canvas', canActivate: [signedIn(true)], canDeactivate: [draftSaved], loadComponent: () => import('./pages/canvas/canvas').then((m) => m.Canvas) },
  { path: 'progress', canActivate: [signedIn(true)], loadComponent: () => import('./pages/progress/progress').then((m) => m.Progress) },
  { path: 'settings', canActivate: [signedIn(true)], loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings) },
  { path: '**', redirectTo: '' },
];
