import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { Unsubscribe, collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { firebase } from './firebase';
import { Todo, doneTodos, openTodos, repeats, sanitizeTodo } from './todo.model';
import { newId } from './week.model';

/**
 * The signed-in user's Capture tasks (todo.model), one document each: users/{uid}/todos/{id}.
 * Firestore keeps a copy on the device, so a change shows at once and syncs when the network is back.
 */
@Injectable({ providedIn: 'root' })
export class TodoStore {
  private readonly auth = inject(AuthService);
  readonly todos = signal<Todo[]>([]);
  readonly ready = signal(false);
  readonly error = signal('');
  readonly open = computed(() => openTodos(this.todos()));
  readonly finished = computed(() => doneTodos(this.todos()));
  private sub: Unsubscribe | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub?.());
    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      this.sub?.();
      this.sub = null;
      this.todos.set([]);
      this.ready.set(false);
      const fb = firebase();
      if (!uid || !fb) return;
      this.sub = onSnapshot(collection(fb.db, 'users', uid, 'todos'), (snap) => {
        this.todos.set(snap.docs.map((d) => sanitizeTodo(d.id, d.data())).filter((t): t is Todo => !!t));
        this.ready.set(true);
      }, (error) => this.fail(error));
    });
  }

  /** A new open task (by default today, any hour). */
  add(title: string, date: string | null, time: string | null = null): void {
    const clean = title.trim();
    if (!clean) return;
    this.save({ id: newId(), title: clean, date, time, done: null, created: Date.now(), repeat: [], doneOn: {} });
  }

  update(id: string, change: Partial<Pick<Todo, 'title' | 'date' | 'time' | 'repeat'>>): void {
    const todo = this.todos().find((t) => t.id === id);
    if (todo) this.save({ ...todo, ...change });
  }

  /**
   * The check. A single task: done (it leaves the open list for the finished one) or open again. A repeating task is
   * checked for one date only (`date`, the board's day or today), so the next time it comes round it is open again.
   */
  setDone(id: string, done: boolean, date: string): void {
    const todo = this.todos().find((t) => t.id === id);
    if (!todo) return;
    if (!repeats(todo)) { this.save({ ...todo, done: done ? Date.now() : null }); return; }
    const doneOn = { ...todo.doneOn };
    if (done) doneOn[date] = Date.now(); else delete doneOn[date];
    this.save({ ...todo, doneOn });
  }

  remove(id: string): void {
    this.todos.update((list) => list.filter((t) => t.id !== id));
    const fb = firebase();
    const uid = this.auth.user()?.uid;
    if (fb && uid) deleteDoc(doc(fb.db, 'users', uid, 'todos', id)).catch((error) => this.fail(error));
  }

  private save(todo: Todo): void {
    this.todos.update((list) => [...list.filter((t) => t.id !== todo.id), todo]);
    const fb = firebase();
    const uid = this.auth.user()?.uid;
    if (!fb || !uid) return;
    const { id, ...data } = todo;
    setDoc(doc(fb.db, 'users', uid, 'todos', id), data).catch((error) => this.fail(error));
  }

  private fail(error: unknown): void {
    this.error.set(error instanceof Error ? error.message : String(error));
  }
}
