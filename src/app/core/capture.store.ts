import { Injectable, effect, inject, signal } from '@angular/core';
import { Unsubscribe, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { Note, sanitizeNotes } from './capture.model';
import { firebase } from './firebase';

/**
 * The signed-in user's quick notes (users/{uid}/capture/notes). Same rules as the week and the library: a write shows
 * at once and syncs when the network is back; nothing is written before the saved copy arrives; an echo of an older
 * write of ours never undoes a newer one.
 */
@Injectable({ providedIn: 'root' })
export class CaptureStore {
  private readonly auth = inject(AuthService);

  readonly notes = signal<Note[]>([]);
  readonly ready = signal(false);
  readonly error = signal('');
  /** The panel is open (the floating ✎ and the menu's Capture open it). */
  readonly open = signal(false);

  private sub: Unsubscribe | null = null;
  private pending: string[] = [];

  constructor() {
    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      this.sub?.();
      this.sub = null;
      this.pending = [];
      this.notes.set([]);
      this.ready.set(false);
      this.error.set('');
      if (uid) this.watch(uid);
    });
  }

  update(change: (notes: Note[]) => Note[]): boolean {
    if (!this.ready()) return false;
    const items = sanitizeNotes({ items: change(structuredClone(this.notes())) });
    this.notes.set(items);
    const fb = firebase();
    const uid = this.auth.user()?.uid;
    if (!fb || !uid) return true;
    this.pending.push(JSON.stringify(items));
    setDoc(doc(fb.db, 'users', uid, 'capture', 'notes'), { items }).catch((error) => {
      if (this.auth.user()?.uid !== uid) return;
      console.error(error);
      this.error.set(String((error as { message?: string }).message ?? error));
    });
    return true;
  }

  private watch(uid: string): void {
    const fb = firebase();
    if (!fb) { this.ready.set(true); return; }
    this.sub = onSnapshot(
      doc(fb.db, 'users', uid, 'capture', 'notes'),
      (snap) => {
        const items = sanitizeNotes(snap.data());
        const json = JSON.stringify(items);
        if (!snap.metadata.hasPendingWrites) {
          this.pending = [];
        } else {
          const at = this.pending.indexOf(json);
          if (at >= 0 && at < this.pending.length - 1) return;       // an echo of an older write of ours
          if (at >= 0) this.pending = this.pending.slice(at);
        }
        this.notes.set(items);
        this.ready.set(true);
      },
      (error) => { console.error(error); this.error.set(String((error as { message?: string }).message ?? error)); },
    );
  }
}
