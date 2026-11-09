import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { Unsubscribe, deleteField, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { firebase } from './firebase';
import { Block, DAYS, Day, DayPlan, Week, dateKey, dayOf, emptyWeek, minutesOfDay, validMinutes } from './week.model';

/**
 * The signed-in user's week and today's done marks, kept in Firestore:
 *   users/{uid}/week/{DAY}       { blocks: Block[] }           one document per weekday
 *   users/{uid}/days/{YYYY-MM-DD} { done: { [taskId]: millis } } one document per date
 * Firestore keeps a copy on the device, so every change shows at once and syncs when the network is back.
 */
@Injectable({ providedIn: 'root' })
export class WeekStore {
  private readonly auth = inject(AuthService);

  readonly week = signal<Week>(emptyWeek());
  readonly loaded = signal(false);
  /** The days whose saved copy has arrived; a day is never written before (it would replace blocks not shown yet). */
  private readonly ready = new Set<Day>();
  readonly error = signal('');
  /** The clock, refreshed every 15 seconds. */
  readonly now = signal(new Date());
  readonly today = computed<Day>(() => dayOf(this.now()));
  readonly todayKey = computed(() => dateKey(this.now()));
  readonly nowMinutes = computed(() => minutesOfDay(this.now()));
  /** Today's done marks: task id → when it was marked. */
  readonly done = signal<Record<string, number>>({});

  private weekSubs: Unsubscribe[] = [];
  /**
   * The day versions this device wrote that the server has not confirmed yet, oldest first. Firestore echoes each
   * local write back in its own snapshot; an echo of an older write must not undo a newer one made meanwhile.
   */
  private pending: Partial<Record<Day, string[]>> = {};
  private doneSub: Unsubscribe | null = null;

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 15_000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.stopWeek();
      this.doneSub?.();
    });

    // The week follows the signed-in user.
    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      this.stopWeek();
      this.week.set(emptyWeek());
      this.loaded.set(false);
      if (uid) this.watchWeek(uid);
    });

    // Today's done marks follow the user and the date (a new document after midnight).
    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      const key = this.todayKey();
      this.doneSub?.();
      this.doneSub = null;
      this.done.set({});
      if (uid) this.watchDone(uid, key);
    });
  }

  plan(day: Day): DayPlan {
    return this.week()[day];
  }

  /** Replaces a day's blocks: shown at once, saved to Firestore (queued on the device when offline). */
  setBlocks(day: Day, blocks: Block[]): void {
    if (!this.ready.has(day)) return;
    const clean = blocks.map(sanitizeBlock);
    this.week.update((week) => ({ ...week, [day]: { blocks: clean } }));
    const fb = firebase();
    const uid = this.auth.user()?.uid;
    if (!fb || !uid) return;
    (this.pending[day] ??= []).push(JSON.stringify(clean));
    setDoc(doc(fb.db, 'users', uid, 'week', day), { blocks: clean }).catch((error) => this.fail(error));
  }

  /** Changes a day's blocks through a function that receives a private copy. */
  update(day: Day, change: (blocks: Block[]) => Block[]): void {
    this.setBlocks(day, change(structuredClone(this.week()[day].blocks)));
  }

  isDone(taskId: string): boolean {
    return taskId in this.done();
  }

  setDone(taskId: string, done: boolean): void {
    this.done.update((marks) => {
      const next = { ...marks };
      if (done) next[taskId] = Date.now();
      else delete next[taskId];
      return next;
    });
    const fb = firebase();
    const uid = this.auth.user()?.uid;
    if (!fb || !uid) return;
    const ref = doc(fb.db, 'users', uid, 'days', this.todayKey());
    setDoc(ref, { done: { [taskId]: done ? Date.now() : deleteField() } }, { merge: true }).catch((error) => this.fail(error));
  }

  private watchWeek(uid: string): void {
    const fb = firebase();
    if (!fb) return;
    this.weekSubs = DAYS.map((day) =>
      onSnapshot(
        doc(fb.db, 'users', uid, 'week', day),
        (snap) => {
          const blocks = ((snap.data()?.['blocks'] ?? []) as Block[]).map(sanitizeBlock);
          const json = JSON.stringify(blocks);
          const mine = this.pending[day] ?? [];
          if (!snap.metadata.hasPendingWrites) {
            this.pending[day] = [];                                   // the server has everything: its copy is the truth
          } else {
            const at = mine.indexOf(json);
            if (at >= 0 && at < mine.length - 1) return;             // an echo of an older write of ours: a newer one follows
            if (at >= 0) this.pending[day] = mine.slice(at);
          }
          this.week.update((week) => ({ ...week, [day]: { blocks } }));
          this.ready.add(day);
          if (this.ready.size === DAYS.length) this.loaded.set(true);
        },
        (error) => this.fail(error),
      ),
    );
  }

  private watchDone(uid: string, key: string): void {
    const fb = firebase();
    if (!fb) return;
    this.doneSub = onSnapshot(
      doc(fb.db, 'users', uid, 'days', key),
      (snap) => this.done.set({ ...((snap.data()?.['done'] ?? {}) as Record<string, number>) }),
      (error) => this.fail(error),
    );
  }

  private stopWeek(): void {
    this.weekSubs.forEach((stop) => stop());
    this.weekSubs = [];
    this.pending = {};
    this.ready.clear();
  }

  private fail(error: unknown): void {
    console.error(error);
    this.error.set(String((error as { message?: string }).message ?? error));
  }
}

/** Firestore refuses `undefined`: every field gets a real value, and bad data is repaired on the way in and out. */
function sanitizeBlock(block: Block): Block {
  return {
    id: String(block.id),
    name: String(block.name ?? ''),
    start: block.start || null,
    end: block.end || null,
    tasks: (block.tasks ?? []).map((task) => ({
      id: String(task.id),
      title: String(task.title ?? ''),
      minutes: validMinutes(task.minutes),
      color: task.color || null,
      active: task.active !== false,
      ref: typeof task.ref === 'string' && task.ref ? task.ref : null,
    })),
  };
}
