import { Injectable, effect, inject, signal } from '@angular/core';
import { Unsubscribe, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { firebase } from './firebase';
import { Library, emptyLibrary, followDay, sanitizeLibrary } from './library.model';
import { DAYS } from './week.model';
import { WeekStore, WeekWrite } from './week.store';

/**
 * The signed-in user's library (Area → Epic → Feature → User story → Task), one Firestore document:
 *   users/{uid}/library/tree   { nodes: LibNode[] }
 * Like the week, it shows a write at once and syncs when the network is back.
 */
@Injectable({ providedIn: 'root' })
export class LibraryStore {
  private readonly auth = inject(AuthService);
  private readonly week = inject(WeekStore);

  readonly library = signal<Library>(emptyLibrary());
  /** The saved copy has arrived: nothing is written before (a write would replace nodes not loaded yet). */
  readonly ready = signal(false);
  readonly error = signal('');
  /** The last library the server refused (size limit, quota…): the Canvas offers it back as a draft to save again. */
  readonly rejected = signal<Library | null>(null);

  private sub: Unsubscribe | null = null;
  /** Versions this device wrote that the server has not confirmed yet (an older echo must not undo a newer write). */
  private pending: string[] = [];

  constructor() {
    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      this.sub?.();
      this.sub = null;
      this.pending = [];
      this.library.set(emptyLibrary());
      this.ready.set(false);
      this.rejected.set(null);                                  // never offer one account's refused save to another
      this.error.set('');
      if (uid) this.watch(uid);
    });
  }

  /** Replaces the whole library (with any staged week days, atomically): shown at once, saved to Firestore (queued offline). */
  save(lib: Library, weekWrites: WeekWrite[] = []): boolean {
    if (!this.ready()) return false;
    const clean = sanitizeLibrary(lib);
    this.library.set(clean);
    const fb = firebase();
    const uid = this.auth.user()?.uid;
    if (!fb || !uid) return true;
    this.pending.push(JSON.stringify(clean));
    // One batch: the library and the week days it changed are saved together or not at all.
    const batch = writeBatch(fb.db);
    batch.set(doc(fb.db, 'users', uid, 'library', 'tree'), clean);
    for (const write of weekWrites) batch.set(doc(fb.db, write.path), write.data);
    batch.commit().catch((error) => {
      if (this.auth.user()?.uid !== uid) return;                // signed out (or another account) meanwhile
      this.rejected.set(clean);
      this.fail(error);
    });
    return true;
  }

  update(change: (lib: Library) => Library): boolean {
    return this.save(change(structuredClone(this.library())));
  }

  /**
   * A library change outside the Canvas (Capture: rename, file, delete): the week follows it (renamed cards, deleted
   * ones leave) and both are saved in one batch.
   */
  updateWithWeek(change: (lib: Library) => Library): boolean {
    if (!this.ready() || !this.week.loaded()) return false;               // every day must be there to follow the change
    const before = this.library();
    const after = sanitizeLibrary(change(structuredClone(before)));
    const ids = new Set(before.nodes.map((n) => n.id));
    const byId = new Map(after.nodes.map((n) => [n.id, n]));
    const week = this.week;
    const writes: WeekWrite[] = [];
    for (const day of DAYS) {
      const next = followDay(week.week()[day].blocks, ids, byId);
      const write = next ? week.stage(day, next) : null;
      if (write) writes.push(write);
    }
    return this.save(after, writes);
  }

  private watch(uid: string): void {
    const fb = firebase();
    if (!fb) return;
    this.sub = onSnapshot(
      doc(fb.db, 'users', uid, 'library', 'tree'),
      (snap) => {
        const lib = sanitizeLibrary(snap.data());
        const json = JSON.stringify(lib);
        if (!snap.metadata.hasPendingWrites) {
          this.pending = [];
        } else {
          const at = this.pending.indexOf(json);
          if (at >= 0 && at < this.pending.length - 1) return;      // an echo of an older write of ours: a newer one follows
          if (at >= 0) this.pending = this.pending.slice(at);
        }
        this.library.set(lib);
        this.ready.set(true);
      },
      (error) => this.fail(error),
    );
  }

  private fail(error: unknown): void {
    console.error(error);
    this.error.set(String((error as { message?: string }).message ?? error));
  }
}
