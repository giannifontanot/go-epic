import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { App } from './app';
import { AuthService } from './core/auth.service';

const auth = () => ({ user: signal(null), configured: true, signIn: async () => undefined, signOut: async () => undefined });

describe('App', () => {
  it('shows no navigation while nobody is signed in', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth() }],
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('router-outlet')).toBeTruthy();
    expect(root.querySelector('.nav-toggle')).toBeNull();
    expect(root.querySelector('.app-drawer')).toBeNull();
    expect(root.querySelector('.update-bar')).toBeNull();
  });

  it('offers to update when the installed app has downloaded a new version', async () => {
    const versionUpdates = new Subject<VersionEvent>();
    const updates = { isEnabled: true, versionUpdates, unrecoverable: new Subject(), checkForUpdate: async () => false };
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth() }, { provide: SwUpdate, useValue: updates }],
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    versionUpdates.next({ type: 'VERSION_READY', currentVersion: { hash: 'a' }, latestVersion: { hash: 'b' } });
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.update-bar')).toBeTruthy();
  });
});
