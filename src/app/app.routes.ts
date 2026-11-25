import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router, Routes } from '@angular/router';
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

export const routes: Routes = [
  { path: 'login', canActivate: [signedIn(false)], loadComponent: () => import('./pages/login').then((m) => m.Login) },
  { path: '', canActivate: [signedIn(true)], loadComponent: () => import('./pages/week-board/week-board').then((m) => m.WeekBoard) },
  { path: 'focus', canActivate: [signedIn(true)], loadComponent: () => import('./pages/focus/focus').then((m) => m.Focus) },
  { path: 'canvas', canActivate: [signedIn(true)], loadComponent: () => import('./pages/canvas/canvas').then((m) => m.Canvas) },
  { path: 'progress', canActivate: [signedIn(true)], loadComponent: () => import('./pages/progress/progress').then((m) => m.Progress) },
  { path: 'year', canActivate: [signedIn(true)], loadComponent: () => import('./pages/year/year').then((m) => m.Year) },
  { path: 'sprint', canActivate: [signedIn(true)], loadComponent: () => import('./pages/sprint/sprint').then((m) => m.Sprint) },
  { path: 'products', canActivate: [signedIn(true)], loadComponent: () => import('./pages/products/products').then((m) => m.Products) },
  { path: 'guide', canActivate: [signedIn(true)], loadComponent: () => import('./pages/guide/guide').then((m) => m.Guide) },
  { path: '**', redirectTo: '' },
];
