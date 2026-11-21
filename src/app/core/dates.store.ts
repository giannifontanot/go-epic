import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { Unsubscribe, collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { firebase } from './firebase';
import { cleanDateName } from './year.model';

/**
 * The signed-in user's important dates (the Year screen), one document per day: users/{uid}/dates/{YYYY-MM-DD}
 * { name, created }. They live in Go Epic, not in Google Calendar (Gianni). Firestore keeps a copy on the device, so a
 * change shows at once and syncs when the network is back.
 */
@Injectable({ providedIn: 'root' })
export class DatesStore {
  private readonly auth = inject(AuthService);
  /** Date key → its name. */
  readonly dates = signal<ReadonlyMap<string, string>>(new Map());
  readonly ready = signal(false);
  readonly error = signal('');
  private sub: Unsubscribe | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub?.());
    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      this.sub?.();
      this.sub = null;
      this.dates.set(new Map());
      this.ready.set(false);
      const fb = firebase();
      if (!uid || !fb) return;
      this.sub = onSnapshot(collection(fb.db, 'users', uid, 'dates'), (snap) => {
        const map = new Map<string, string>();
        for (const d of snap.docs) {
          const name = cleanDateName(d.data()['name']);
          if (name && /^\d{4}-\d{2}-\d{2}$/.test(d.id)) map.set(d.id, name);
        }
        this.dates.set(map);
        this.ready.set(true);
      }, (error) => this.fail(error));
    });
  }

  /** Names a day (or renames it); a blank name changes nothing (removing goes through remove, after asking). */
  set(key: string, name: string): void {
    const clean = cleanDateName(name);
    if (!clean) return;
    this.dates.update((map) => new Map(map).set(key, clean));
    const fb = firebase();
    const uid = this.auth.user()?.uid;
    if (fb && uid) setDoc(doc(fb.db, 'users', uid, 'dates', key), { name: clean, created: Date.now() }).catch((error) => this.fail(error));
  }

  remove(key: string): void {
    this.dates.update((map) => { const next = new Map(map); next.delete(key); return next; });
    const fb = firebase();
    const uid = this.auth.user()?.uid;
    if (fb && uid) deleteDoc(doc(fb.db, 'users', uid, 'dates', key)).catch((error) => this.fail(error));
  }

  private fail(error: unknown): void {
    this.error.set(error instanceof Error ? error.message : String(error));
  }
}
