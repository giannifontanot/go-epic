import { Injectable, signal } from '@angular/core';
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { firebase } from './firebase';

/** Kept on this device while someone is signed in, so the Get Go Epic page at "/" and the app shell know, before
 *  Firebase starts, whether to open the app at once or show the page (public/get/index.html, src/index.html). */
export const SIGNED_IN_KEY = 'go-epic-signed-in';

function rememberSignedIn(on: boolean): void {
  try {
    if (on) localStorage.setItem(SIGNED_IN_KEY, '1');
    else localStorage.removeItem(SIGNED_IN_KEY);
  } catch {
    // storage blocked: the page at "/" is simply shown
  }
}

/** Google sign-in. `user` is undefined while Firebase is still checking, null when signed out. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<User | null | undefined>(undefined);
  readonly configured = firebase() !== null;

  constructor() {
    const fb = firebase();
    if (!fb) {
      this.user.set(null);
      rememberSignedIn(false);
      return;
    }
    onAuthStateChanged(fb.auth, (user) => {
      this.user.set(user);
      rememberSignedIn(!!user);
    });
  }

  async signIn(): Promise<void> {
    const fb = firebase();
    if (!fb) return;
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(fb.auth, provider);
    } catch (error) {
      // Some phones (an installed app on iOS) block pop-ups: fall back to a full-page redirect.
      const code = (error as { code?: string }).code ?? '';
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(fb.auth, provider);
        return;
      }
      throw error;
    }
  }

  async signOut(): Promise<void> {
    const fb = firebase();
    if (fb) await signOut(fb.auth);
  }
}
