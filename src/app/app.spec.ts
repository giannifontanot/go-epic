import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AuthService } from './core/auth.service';

describe('App', () => {
  it('shows no navigation while nobody is signed in', async () => {
    const auth = { user: signal(null), configured: true, signIn: async () => undefined, signOut: async () => undefined };
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('router-outlet')).toBeTruthy();
    expect(root.querySelector('.app-nav')).toBeNull();
  });
});
