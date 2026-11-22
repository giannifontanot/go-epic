import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { Unsubscribe, collection, deleteDoc, doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { DateNote, notesDoc, readNotes } from './date-notes';
import { firebase } from './firebase';
import { newId } from './week.model';
import { cleanDateName } from './year.model';

/**
 * The signed-in user's important dates (the Year screen), one document per day: users/{uid}/dates/{YYYY-MM-DD}, holding
 * the day's notes (date-notes.ts: a day can hold many, Gianni). They live in Go Epic, not in Google Calendar (Gianni); a
 * note's `calendar` is set only when it was imported from one of the user's Google calendars (calendar-import.ts), and
 * renaming it by hand drops it. Firestore keeps a copy on the device, so a change shows at once and syncs when the
 * network is back. A day whose last note goes is removed.
 */
@Injectable({ providedIn: 'root' })
export class DatesStore {
  private readonly auth = inject(AuthService);
  /** Date key → its notes, in the order they were added (never empty). */
  readonly notes = signal<ReadonlyMap<string, readonly DateNote[]>>(new Map());
  readonly ready = signal(false);
  readonly error = signal('');
  private sub: Unsubscribe | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub?.());
    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      this.sub?.();
      this.sub = null;
      this.notes.set(new Map());
      this.ready.set(false);
      const fb = firebase();
      if (!uid || !fb) return;
      this.sub = onSnapshot(collection(fb.db, 'users', uid, 'dates'), (snap) => {
        const notes = new Map<string, DateNote[]>();
        for (const d of snap.docs) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d.id)) continue;
          const list = readNotes(d.data(), d.id);
          if (list.length) notes.set(d.id, list);
        }
        this.notes.set(notes);
        this.ready.set(true);
      }, (error) => this.fail(error));
    });
  }

  /** Adds a note to a day (at the end of its list); a blank one changes nothing. */
  add(key: string, name: string): void {
    const clean = cleanDateName(name);
    if (!clean) return;
    this.write(key, [...(this.notes().get(key) ?? []), { id: newId(), name: clean, created: Date.now(), calendar: null }]);
  }

  /** Renames a note by hand (an imported one becomes the user's own); a blank name changes nothing (removing asks first). */
  rename(key: string, id: string, name: string): void {
    const clean = cleanDateName(name);
    const list = this.notes().get(key) ?? [];
    const old = list.find((n) => n.id === id);
    if (!clean || !old || (old.name === clean && old.calendar === null)) return;
    this.write(key, list.map((n) => n.id === id ? { ...n, name: clean, calendar: null } : n));
  }

  /** Removes one note (after its question and countdown); the day goes with its last note. */
  remove(key: string, id: string): void {
    const list = this.notes().get(key) ?? [];
    if (!list.some((n) => n.id === id)) return;
    this.write(key, list.filter((n) => n.id !== id));
  }

  /** An import from a Google calendar (importPlan): writes the days it changed, removes the days left with no note. */
  applyImport(write: ReadonlyMap<string, readonly DateNote[]>, remove: readonly string[]): void {
    const next = new Map(this.notes());
    for (const key of remove) next.delete(key);
    for (const [key, list] of write) next.set(key, list);
    this.notes.set(next);
    const fb = firebase();
    const uid = this.auth.user()?.uid;
    if (!fb || !uid) return;
    const ops: ((batch: ReturnType<typeof writeBatch>) => void)[] = [
      ...remove.map((key) => (b: ReturnType<typeof writeBatch>) => b.delete(doc(fb.db, 'users', uid, 'dates', key))),
      ...[...write].map(([key, list]) => (b: ReturnType<typeof writeBatch>) => b.set(doc(fb.db, 'users', uid, 'dates', key), notesDoc(list))),
    ];
    for (let i = 0; i < ops.length; i += 450) {                    // a batch takes at most 500 writes
      const batch = writeBatch(fb.db);
      for (const op of ops.slice(i, i + 450)) op(batch);
      batch.commit().catch((error) => this.fail(error));          // offline: queued by Firestore, never awaited
    }
  }

  /** The day's whole list, on the device at once and then in Firestore (none left: the day's document goes). */
  private write(key: string, list: DateNote[]): void {
    const next = new Map(this.notes());
    if (list.length) next.set(key, list); else next.delete(key);
    this.notes.set(next);
    const fb = firebase();
    const uid = this.auth.user()?.uid;
    if (!fb || !uid) return;
    const ref = doc(fb.db, 'users', uid, 'dates', key);
    (list.length ? setDoc(ref, notesDoc(list)) : deleteDoc(ref)).catch((error) => this.fail(error));
  }

  private fail(error: unknown): void {
    this.error.set(error instanceof Error ? error.message : String(error));
  }
}
