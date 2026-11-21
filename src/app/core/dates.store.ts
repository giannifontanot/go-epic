import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { Unsubscribe, collection, deleteDoc, doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { KeptDate } from './calendar-import';
import { AuthService } from './auth.service';
import { firebase } from './firebase';
import { cleanDateName } from './year.model';

/**
 * The signed-in user's important dates (the Year screen), one document per day: users/{uid}/dates/{YYYY-MM-DD}
 * { name, created, calendar? }. They live in Go Epic, not in Google Calendar (Gianni); `calendar` is set only on a date
 * imported from one of the user's Google calendars (calendar-import.ts), and naming the day by hand drops it. Firestore
 * keeps a copy on the device, so a change shows at once and syncs when the network is back.
 */
@Injectable({ providedIn: 'root' })
export class DatesStore {
  private readonly auth = inject(AuthService);
  /** Date key → its name. */
  readonly dates = signal<ReadonlyMap<string, string>>(new Map());
  /** Date key → its name and the Google calendar it was imported from (null: named by hand). */
  readonly kept = signal<ReadonlyMap<string, KeptDate>>(new Map());
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
      this.kept.set(new Map());
      this.ready.set(false);
      const fb = firebase();
      if (!uid || !fb) return;
      this.sub = onSnapshot(collection(fb.db, 'users', uid, 'dates'), (snap) => {
        const kept = new Map<string, KeptDate>();
        for (const d of snap.docs) {
          const data = d.data();
          const name = cleanDateName(data['name']);
          const calendar = typeof data['calendar'] === 'string' && data['calendar'] ? data['calendar'] as string : null;
          if (name && /^\d{4}-\d{2}-\d{2}$/.test(d.id)) kept.set(d.id, { name, calendar });
        }
        this.setKept(kept);
        this.ready.set(true);
      }, (error) => this.fail(error));
    });
  }

  /** Names a day (or renames it); a blank name changes nothing (removing goes through remove, after asking). */
  set(key: string, name: string): void {
    const clean = cleanDateName(name);
    if (!clean) return;
    this.setKept(new Map(this.kept()).set(key, { name: clean, calendar: null }));
    const fb = firebase();
    const uid = this.auth.user()?.uid;
    if (fb && uid) setDoc(doc(fb.db, 'users', uid, 'dates', key), { name: clean, created: Date.now() }).catch((error) => this.fail(error));
  }

  remove(key: string): void {
    const next = new Map(this.kept());
    next.delete(key);
    this.setKept(next);
    const fb = firebase();
    const uid = this.auth.user()?.uid;
    if (fb && uid) deleteDoc(doc(fb.db, 'users', uid, 'dates', key)).catch((error) => this.fail(error));
  }

  /** An import from a Google calendar (importPlan): writes its days, removes its earlier days that left it. */
  applyImport(calendar: string, write: ReadonlyMap<string, string>, remove: readonly string[]): void {
    const next = new Map(this.kept());
    for (const key of remove) next.delete(key);
    for (const [key, name] of write) next.set(key, { name, calendar });
    this.setKept(next);
    const fb = firebase();
    const uid = this.auth.user()?.uid;
    if (!fb || !uid) return;
    const ops: ((batch: ReturnType<typeof writeBatch>) => void)[] = [
      ...remove.map((key) => (b: ReturnType<typeof writeBatch>) => b.delete(doc(fb.db, 'users', uid, 'dates', key))),
      ...[...write].map(([key, name]) => (b: ReturnType<typeof writeBatch>) =>
        b.set(doc(fb.db, 'users', uid, 'dates', key), { name, created: Date.now(), calendar })),
    ];
    for (let i = 0; i < ops.length; i += 450) {                    // a batch takes at most 500 writes
      const batch = writeBatch(fb.db);
      for (const op of ops.slice(i, i + 450)) op(batch);
      batch.commit().catch((error) => this.fail(error));          // offline: queued by Firestore, never awaited
    }
  }

  private setKept(kept: Map<string, KeptDate>): void {
    this.kept.set(kept);
    this.dates.set(new Map([...kept].map(([key, d]) => [key, d.name])));
  }

  private fail(error: unknown): void {
    this.error.set(error instanceof Error ? error.message : String(error));
  }
}
