import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { Unsubscribe, collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { firebase } from './firebase';
import { SprintDoc, allSprints, emptySprint, focusSprint, hasContent, sanitizeSprint } from './sprint.model';
import { WeekStore } from './week.store';
import { dateKey } from './week.model';

/**
 * The signed-in user's sprint plans and reflections, one document per sprint: users/{uid}/sprints/{first day}
 * (sprint.model). Firestore keeps a copy on the device, so a change shows at once and syncs when the network is back.
 */
@Injectable({ providedIn: 'root' })
export class SprintStore {
  private readonly auth = inject(AuthService);
  private readonly week = inject(WeekStore);
  /** Sprint key → its document (only the sprints with one). */
  readonly docs = signal<ReadonlyMap<string, SprintDoc>>(new Map());
  readonly ready = signal(false);
  readonly error = signal('');
  readonly sprints = allSprints();
  /** The sprint in focus today (the one today is in, else the next to come). */
  readonly current = computed(() => focusSprint(this.sprints, dateKey(this.week.now())));
  /** The Epics the sprint in focus pushes: the Canvas marks them. */
  readonly currentEpics = computed(() => new Set(this.docs().get(this.current()?.key ?? '')?.epics ?? []));
  /** The keys of the sprints that hold something. */
  readonly saved = computed(() => new Set([...this.docs()].filter(([, d]) => hasContent(d)).map(([k]) => k)));
  private sub: Unsubscribe | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub?.());
    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      this.sub?.();
      this.sub = null;
      this.docs.set(new Map());
      this.ready.set(false);
      const fb = firebase();
      if (!uid || !fb) return;
      this.sub = onSnapshot(collection(fb.db, 'users', uid, 'sprints'), (snap) => {
        const docs = new Map<string, SprintDoc>();
        for (const d of snap.docs) if (/^\d{4}-\d{2}-\d{2}$/.test(d.id)) docs.set(d.id, sanitizeSprint(d.data()));
        this.docs.set(docs);
        this.ready.set(true);
      }, (error) => this.fail(error));
    });
  }

  get(key: string): SprintDoc {
    return this.docs().get(key) ?? emptySprint();
  }

  /** Saves a sprint's whole document, on the device at once and then in Firestore. */
  save(key: string, next: SprintDoc): void {
    const clean = sanitizeSprint({ ...next, updated: Date.now() });
    const docs = new Map(this.docs());
    docs.set(key, clean);
    this.docs.set(docs);
    const fb = firebase();
    const uid = this.auth.user()?.uid;
    if (!fb || !uid) return;
    setDoc(doc(fb.db, 'users', uid, 'sprints', key), clean).catch((error) => this.fail(error));
  }

  private fail(error: unknown): void {
    this.error.set(error instanceof Error ? error.message : String(error));
  }
}
