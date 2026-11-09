import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { Unsubscribe, collection, deleteField, doc, documentId, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { firebase } from './firebase';
import { DayMarks, Status, applyStatus, isFinished, statusOf, statusPatch } from './status.model';
import { Block, DAYS, Day, DayPlan, Week, dateKey, dayOf, emptyWeek, minutesOfDay, validMinutes } from './week.model';

/** A day document write, staged for a batch. */
export interface WeekWrite { path: string; data: { blocks: Block[] }; }

/**
 * The signed-in user's week and today's done marks, kept in Firestore:
 *   users/{uid}/week/{DAY}       { blocks: Block[] }           one document per weekday
 *   users/{uid}/days/{YYYY-MM-DD} { done: { [taskId]: millis }, status: { [taskId]: state } } one document per date (status.model)
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
  /** Today's marks: when tasks were finished (`done`) and the other states (`status`), see status.model. */
  readonly marks = signal<DayMarks>({});
  /** Today's finished tasks (done or late): task id → when. */
  readonly done = computed<Record<string, number>>(() => this.marks().done ?? {});

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
      this.marks.set({});
      if (uid) this.watchDone(uid, key);
    });
  }

  plan(day: Day): DayPlan {
    return this.week()[day];
  }

  /** Replaces a day's blocks: shown at once, saved to Firestore (queued on the device when offline). */
  setBlocks(day: Day, blocks: Block[]): void {
    const write = this.stage(day, blocks);
    const fb = firebase();
    if (write && fb) setDoc(doc(fb.db, write.path), write.data).catch((error) => this.fail(error));
  }

  /**
   * Shows a day's new blocks at once and returns the write for the caller to commit (in a batch with other
   * documents, so they succeed or fail together); null when there is nothing to write (day not loaded, no user).
   */
  stage(day: Day, blocks: Block[]): WeekWrite | null {
    if (!this.ready.has(day)) return null;
    const clean = blocks.map(sanitizeBlock);
    this.week.update((week) => ({ ...week, [day]: { blocks: clean } }));
    const uid = this.auth.user()?.uid;
    if (!firebase() || !uid) return null;
    (this.pending[day] ??= []).push(JSON.stringify(clean));
    return { path: `users/${uid}/week/${day}`, data: { blocks: clean } };
  }

  /** Changes a day's blocks through a function that receives a private copy. */
  update(day: Day, change: (blocks: Block[]) => Block[]): void {
    this.setBlocks(day, change(structuredClone(this.week()[day].blocks)));
  }

  /** Finished today (done or late). */
  isDone(taskId: string): boolean {
    return isFinished(this.status(taskId));
  }

  status(taskId: string): Status {
    return statusOf(this.marks(), taskId);
  }

  setDone(taskId: string, done: boolean): void {
    this.setStatus(taskId, done ? 'done' : 'todo');
  }

  /** Sets today's state of a task: shown at once, merged into today's document (queued on the device when offline). */
  setStatus(taskId: string, status: Status): void {
    const now = Date.now();
    const before = this.marks();
    this.marks.set(applyStatus(before, taskId, status, now));
    const fb = firebase();
    const uid = this.auth.user()?.uid;
    if (!fb || !uid) return;
    const patch = statusPatch(before, taskId, status, now);
    const field = (value: number | string | null) => (value === null ? deleteField() : value);
    setDoc(doc(fb.db, 'users', uid, 'days', this.todayKey()), {
      done: { [taskId]: field(patch.done[taskId]) },
      status: { [taskId]: field(patch.status[taskId]) },
    }, { merge: true }).catch((error) => this.fail(error));
  }

  /** Follows the day documents from `fromKey` (YYYY-MM-DD) on, for the Progress page; returns the stop function. */
  watchHistory(fromKey: string, receive: (byDate: Record<string, DayMarks>) => void): Unsubscribe {
    const fb = firebase();
    const uid = this.auth.user()?.uid;
    if (!fb || !uid) { receive({}); return () => undefined; }
    return onSnapshot(
      query(collection(fb.db, 'users', uid, 'days'), where(documentId(), '>=', fromKey)),
      (snap) => receive(Object.fromEntries(snap.docs.map((d) => [d.id, d.data() as DayMarks]))),
      (error) => this.fail(error),
    );
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
      (snap) => {
        const data = (snap.data() ?? {}) as DayMarks;
        this.marks.set({ done: { ...(data.done ?? {}) }, status: { ...(data.status ?? {}) } });
      },
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
