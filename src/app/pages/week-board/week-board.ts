import { PageMenu } from '../../shared/title-fan';
import { Ask } from '../../shared/ask';
import { AutoColors } from '../../core/auto-colors';
import { Undo } from '../../shared/undo';
import { NgTemplateOutlet } from '@angular/common';
import { ApplicationRef, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { flip, flipNow } from '../../core/flip';
import { TextSettings } from '../../core/text-settings';
import { I18n } from '../../core/i18n';
import {
  addDayBlocks, Block, DAYS, Day, NEW_TASK_MINUTES, countdown, Task, blockColors, cloneBlock, fits, formatClock, freeMinutes, moveItem, stepTask, newId, resizedMinutes,
  moveToHour, snapDelta, nowPosition, parseClock, placeBlock, taskStarts, taskTotal, uniqueName, validMinutes, windowError, windowLength,
} from '../../core/week.model';
import { Library, fileTask, followLibrary, nodeById, paperAge, pathOf, updateNode } from '../../core/library.model';
import { LibraryStore } from '../../core/library.store';
import { CaptureUi, MenuAction } from '../capture/capture-ui';
import { WeekStore, WeekWrite } from '../../core/week.store';
import { closeDialog, isBackdropClick, openDialog, pressPoint } from '../../core/dialog';
import { STATUSES, Status, isFinished } from '../../core/status.model';
import { Todo, allDayTodos, overdueTodos, pastDueTodos, pinTodos, todosForDate, weekDate } from '../../core/todo.model';
import { TodoDialog, TodoSave } from '../capture/todo-dialog';
import { TodoStore } from '../../core/todo.store';
import { TaskDialog, TaskEdit, TaskSave } from './task-dialog';
import { Transfer, TransferDialog } from './transfer-dialog';
import { readTrayFolded, writeTrayFolded } from '../../core/tray-fold';
import { SwipeTracker, stepDay } from '../../core/swipe';

/** On entering, the centring on now waits for the page's fade-in (0.9 s) and a second more (Gianni). */
const ENTER_SETTLE_MS = 1900;

/**
 * Whether an element is really on the board: laid out and not in a hidden day (on a phone only the day shown is laid
 * out; the others are display: none).
 */
function shownOnScreen(el: HTMLElement): boolean {
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/**
 * The week in seven columns of blocks and task cards. Locked by default (a calm view of the week);
 * "Arrange the week" unlocks editing: block windows, ▲▼, ⇄ copy/move, + and quick-add, and each card's ••• details.
 */
/** An arrow key on a handle: to the next 5-minute step in its direction (23 → 25 or 20). */
/**
 * The card (else block, else day) nearest the middle of the screen, and a function that scrolls the page back so it
 * sits where it was, at once (no glide), after the layout changed. Null when nothing is on screen.
 */
function viewAnchor(): (() => void) | null {
  if (typeof document === 'undefined') return null;
  const mid = (window.visualViewport?.height ?? window.innerHeight) / 2;
  const pick = (selector: string) => {
    let best: { el: HTMLElement; gap: number } | null = null;
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      const r = el.getBoundingClientRect();
      if (!r.height || !shownOnScreen(el) || r.bottom < 0 || r.top > mid * 2 || r.right < 0 || r.left > window.innerWidth) continue;
      const gap = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
      if (!best || gap < best.gap) best = { el, gap };
    }
    return best?.el ?? null;
  };
  const el = pick('[data-task]') ?? pick('[data-block]') ?? pick('article.day');
  if (!el) return null;
  const key = el.dataset['task'] ? `[data-task="${CSS.escape(el.dataset['task'])}"]`
    : el.dataset['block'] ? `[data-block="${CSS.escape(el.dataset['block'])}"]` : null;
  const top = el.getBoundingClientRect().top;
  return () => {
    const now = key ? document.querySelector<HTMLElement>(key) : el.isConnected ? el : null;
    if (!now) return;
    const delta = now.getBoundingClientRect().top - top;
    if (Math.abs(delta) >= 1) window.scrollBy({ top: delta, left: 0, behavior: 'instant' });
  };
}

function keyStep(value: number, direction: number): number {
  return direction > 0 ? Math.ceil((value + 1) / 5) * 5 - value : Math.floor((value - 1) / 5) * 5 - value;
}
/** How long a FLIP glide lasts (core/flip). */
const FLIP_MS = 380;
const FOLD_KEY = 'go-epic-week-folded';
/** How long the page stays still before it glides back to the red line (Gianni: about 4 s). */
const NOW_IDLE_MS = 4000;
/** Two taps on the now-line's badge this close together are a double tap (centres the line while arranging). */
const DOUBLE_TAP_MS = 400;
/** The ids of the blocks shown folded on this device (a view preference). */
function readFolded(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(FOLD_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch { return new Set(); }
}

@Component({
  selector: 'app-week-board',
  imports: [TaskDialog, TransferDialog, TodoDialog, NgTemplateOutlet],
  templateUrl: './week-board.html',
})
export class WeekBoard {
  protected readonly store = inject(WeekStore);
  protected readonly i18n = inject(I18n);
  protected readonly pageMenu = inject(PageMenu);
  /** The app's own question windows (never the browser's confirm/alert). */
  private readonly asks = inject(Ask);
  protected readonly library = inject(LibraryStore);
  protected readonly capture = inject(CaptureUi);
  private readonly injector = inject(Injector);
  protected readonly text = inject(TextSettings);
  protected readonly days = DAYS;

  protected readonly arranging = signal(false);
  /**
   * Folded blocks (remembered on this device): each block has its own ⌄ (Gianni), and the day's ⊟/⊞ folds or opens
   * every block of the week at once (⊞ while all are folded).
   */
  private readonly foldedIds = signal(readFolded());
  protected isFolded(block: Block): boolean {
    return this.foldedIds().has(block.id);
  }
  protected readonly allFolded = computed(() => {
    const ids = DAYS.flatMap((day) => this.blocks(day).map((b) => b.id));
    return ids.length > 0 && ids.every((id) => this.foldedIds().has(id));
  });
  protected toggleBlockFold(block: Block): void {
    const next = new Set(this.foldedIds());
    if (!next.delete(block.id)) next.add(block.id);
    this.setFolded(next);
  }
  protected toggleFolded(): void {
    this.setFolded(this.allFolded() ? new Set() : new Set(DAYS.flatMap((day) => this.blocks(day).map((b) => b.id))));
  }
  private setFolded(ids: Set<string>): void {
    this.foldedIds.set(ids);
    try { localStorage.setItem(FOLD_KEY, JSON.stringify([...ids])); } catch { /* a view preference */ }
  }

  constructor() {
    // The tray opens as tall as its tasks need (Gianni: no scroll inside it), so the week leaves exactly that much
    // room under its last block: its height, followed as it opens, folds and gains tasks, goes to --tray-h.
    effect((onCleanup) => {
      const tray = this.trayEl()?.nativeElement;
      const board = this.boardEl()?.nativeElement;
      if (!tray || !board || typeof ResizeObserver === 'undefined') return;
      const watch = new ResizeObserver(() => board.style.setProperty('--tray-h', `${Math.ceil(tray.getBoundingClientRect().height)}px`));
      watch.observe(tray);
      onCleanup(() => { watch.disconnect(); board.style.removeProperty('--tray-h'); });
    });
    // A refusal's note (no room in a block) fades by itself after a few seconds
    effect((onCleanup) => {
      if (!this.notice()) return;
      const timer = setTimeout(() => this.notice.set(''), 4500);
      onCleanup(() => clearTimeout(timer));
    });
    // Arranging files tasks in the library: it stops while the library is not loaded (sign-out, another account).
    effect(() => { if (!this.library.ready()) this.arranging.set(false); });
    // The action menu (one round button, App) gets ✎ arrange here; while arranging it hides and the round ✓ Finish takes its spot.
    effect(() => {
      this.capture.menuEdit.set(this.arrangeAction());
      this.capture.menuHidden.set(this.arranging());
      this.capture.lookTools.set(this.arranging() ? { px: true, finish: () => this.toggleArrange() } : null);
    });
    inject(DestroyRef).onDestroy(() => { this.capture.menuEdit.set(null); this.capture.menuHidden.set(false); this.capture.lookTools.set(null); this.cancelDrag?.(); });
    // On entering the Week board, the view centres on now (the red line in today's column), as in Epic Manager: once
    // the week, the library (card titles) and Capture's notes (the strip at the top) are there, so nothing shifts after.
    // It waits for the page to have faded in, and a second more (Gianni: it moved the moment it came in).
    let centred = false;
    const entered = Date.now();
    let settle: ReturnType<typeof setTimeout> | null = null;
    inject(DestroyRef).onDestroy(() => { if (settle) clearTimeout(settle); });
    effect(() => {
      if (centred || !this.store.loaded() || !this.library.ready() || !this.todos.ready()) return;
      centred = true;
      const wait = Math.max(0, entered + ENTER_SETTLE_MS - Date.now());
      untracked(() => afterNextRender({ read: () => {
        settle = setTimeout(() => { settle = null; if (this.handledAt < entered) this.centreOnNow(true); }, wait);
      } }, { injector: this.injector }));
    });
    this.followNow();
    effect(() => { if (this.arranging()) untracked(() => this.spotlight.set(false)); });
  }

  /**
   * Gianni: when the page has been scrolled and then stays still for 4 s, it glides back so the red line sits in the
   * middle again. A finger on the screen holds it; nothing happens while arranging, with a window open or while
   * today's column is not shown (another day's tab on a phone).
   */
  private followNow(): void {
    if (typeof window === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let touching = false;
    const stop = () => { if (timer) clearTimeout(timer); timer = null; };
    const arm = () => {
      stop();
      timer = setTimeout(() => { timer = null; if (!touching) this.centreOnNow(false); }, NOW_IDLE_MS);
    };
    // The spotlight (Gianni): a scroll of our own (centring the line) keeps it coming; any other scroll fades it away.
    // The scroll events a phone still sends just after the centring has settled (its toolbars collapsing, the last
    // frames of a smooth scroll) are not his: for a moment after lighting they leave it on; his own scroll comes with a
    // finger or the wheel (takeOver), which turns it off at once.
    const scrolled = () => {
      if (this.autoScroll) this.endAutoScroll(160);
      else if (Date.now() - this.litAt > 700) this.spotlight.set(false);
      arm();
    };
    const takeOver = () => { this.handledAt = Date.now(); if (this.autoScroll) { clearTimeout(this.autoScroll); this.autoScroll = null; } this.spotlight.set(false); };
    const down = () => { this.handledAt = Date.now(); touching = true; stop(); };
    const up = () => { touching = false; arm(); };
    // A finger is followed by touch events: a native scroll cancels the pointer (pointercancel) while the finger is
    // still on the glass, so pointer events only count for a mouse or a pen.
    const pointerDown = (e: PointerEvent) => { if (e.pointerType !== 'touch') down(); };
    const pointerUp = (e: PointerEvent) => { if (e.pointerType !== 'touch') up(); };
    const opts = { capture: true, passive: true } as const;
    const listeners: [string, EventListener][] = [
      ['scroll', scrolled], ['wheel', takeOver], ['touchmove', takeOver], ['touchstart', down], ['touchend', up], ['touchcancel', up],
      ['pointerdown', pointerDown as EventListener], ['pointerup', pointerUp as EventListener],
    ];
    for (const [type, fn] of listeners) window.addEventListener(type, fn, opts);
    inject(DestroyRef).onDestroy(() => {
      stop();
      if (this.autoScroll) clearTimeout(this.autoScroll);
      for (const [type, fn] of listeners) window.removeEventListener(type, fn, opts);
    });
  }

  /**
   * While the board rests on now after centring the red line, every other block dims a very little, so the current
   * one stands out (Gianni); a scroll of his own (or arranging) fades it away. Only when the line sits in a block.
   */
  protected readonly spotlight = signal(false);
  /** When his finger, mouse or wheel last touched the page: one while the entering centring waits cancels it. */
  private handledAt = 0;
  /** A centring scroll is under way: its scroll events keep the spotlight coming instead of turning it off. */
  private autoScroll: ReturnType<typeof setTimeout> | null = null;
  /** The centring scroll ends once its scroll events stop for `quiet` ms; then the spotlight comes on. */
  private endAutoScroll(quiet: number): void {
    if (this.autoScroll) clearTimeout(this.autoScroll);
    this.autoScroll = setTimeout(() => { this.autoScroll = null; this.light(); }, quiet);
  }
  private light(): void {
    const line = document.querySelector<HTMLElement>('article.day.today .now-line');
    const on = !this.arranging() && !!line?.closest('.block') && !!line && shownOnScreen(line);
    if (on) this.litAt = Date.now();
    this.spotlight.set(on);
  }
  private litAt = 0;
  protected readonly mobileDay = signal<Day>(this.store.today());
  private readonly swipe = new SwipeTracker();
  /**
   * On a phone (one day at a time) another day comes in from the side it lies on (Gianni): the day chips and a
   * sideways swipe both slide it; none under reduced motion.
   */
  protected showDay(day: Day): void {
    const from = DAYS.indexOf(this.mobileDay());
    if (day === this.mobileDay()) return;
    this.mobileDay.set(day);
    const week = this.boardEl()?.nativeElement.querySelector<HTMLElement>('.week');
    const reduced = typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!week || reduced || typeof week.animate !== 'function') return;
    const side = DAYS.indexOf(day) > from ? 1 : -1;
    week.animate([{ opacity: 0, transform: `translateX(${side * 36}px)` }, { opacity: 1, transform: 'none' }],
      { duration: 260, easing: 'cubic-bezier(0, 0, .6, 1)' });
  }
  /**
   * Swiping sideways moves between days on a phone (Gianni): left to the next day, right to the previous, stopping at
   * Monday and Sunday. A vertical scroll, a card's grip or handle, a field, the overdue folder and any open window are
   * left alone, and nothing happens while a card is being dragged or resized.
   */
  protected swipeStart(event: TouchEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    const phone = typeof matchMedia === 'function' && matchMedia('(max-width: 820px)').matches;
    if (!phone || target?.closest('dialog, .overdue-tray') || this.cancelDrag || this.sizing()) { this.swipe.cancel(); return; }
    this.swipe.start(event);
  }
  protected swipeCancel(): void { this.swipe.cancel(); }
  protected swipeEnd(event: TouchEvent): void {
    const step = this.swipe.end(event);
    if (!step || this.cancelDrag || this.sizing()) return;
    const next = stepDay(DAYS, this.mobileDay(), step);
    if (next) this.showDay(next);
  }
  /**
   * Capture's tasks on the board (Gianni): each day of this week shows the tasks dated that day, pinned over the
   * activity running at their hour (else the closest one), on top of its card; the ones with no hour at the foot of the day.
   */
  protected readonly todos = inject(TodoStore);
  /** Capture's tasks sitting on top of a card (Gianni: in the card, not hovering over it), by hour. */
  protected cardNotes(day: Day, task: Task): Todo[] {
    return this.pins()[day].onTask.get(task.id) ?? [];
  }
  protected readonly pins = computed(() => {
    const all = this.todos.todos();
    const week = this.store.week();
    const out = {} as Record<Day, { onTask: Map<string, Todo[]>; loose: Todo[] }>;
    // They float in the tray at the foot instead: the rolled-over ones on every day, today's past-due ones only today
    // (a repeating task keeps its notes on its other days).
    const today = this.store.today();
    const tray = new Set(this.trayItems().map((i) => i.todo.id));
    const rolled = new Set(this.overdue().filter((t) => this.rolledOver(t)).map((t) => t.id));
    for (const day of DAYS) {
      const away = day === today ? tray : rolled;
      out[day] = pinTodos(week[day], todosForDate(all, this.dates()[day], day).filter((t) => !away.has(t.id)));
    }
    return out;
  });
  /** A task's paper on the board, as in Capture: fresh, parchment from 5 days, old stained paper from 21. */
  protected todoPaper(todo: Todo): 0 | 1 | 2 {
    return paperAge(todo, this.store.now().getTime()) ?? 0;
  }
  /**
   * The tray at the foot of the screen (Gianni): single tasks left open on earlier days, then today's open tasks whose
   * hour has already passed (they leave their card, so they show once), then today's open all-day tasks (no hour:
   * Gianni wants them down here with the overdue ones, not at the top of the day).
   */
  protected readonly overdue = computed(() => {
    const all = this.todos.todos();
    const today = this.store.todayKey();
    const day = this.store.today();
    return [...overdueTodos(all, today), ...pastDueTodos(all, today, day, this.store.nowMinutes()), ...allDayTodos(all, today, day)];
  });
  /**
   * A task checked in the tray stays there, shown checked, until the tray is opened again (Gianni: to see what he
   * ticked): its place in the list and its label are kept from the moment it was checked; unchecking it works too.
   */
  private readonly held = signal(new Map<string, { at: number; label: string; date: string }>());
  protected readonly trayItems = computed(() => {
    const items: { todo: Todo; label: string; checked: boolean }[] =
      this.overdue().map((todo) => ({ todo, label: this.trayLabel(todo), checked: false }));
    const shown = new Set(items.map((i) => i.todo.id));
    const today = this.store.todayKey();
    const kept = [...this.held()].sort((a, b) => a[1].at - b[1].at);
    for (const [id, { at, label, date }] of kept) {
      const todo = this.todos.todos().find((t) => t.id === id);
      // deleted, open again (it is back on its own), or checked on another day (past midnight it has gone)
      if (!todo || shown.has(id) || date !== today) continue;
      const checked = todo.repeat.length ? todo.doneOn[today] !== undefined : todo.done !== null;
      items.splice(Math.min(at, items.length), 0, { todo, label, checked });
    }
    return items;
  });
  protected trayCheck(item: { todo: Todo; label: string; checked: boolean }): void {
    const at = this.trayItems().indexOf(item);
    // checked: kept in the tray; unchecked: let go, so it goes back wherever it now belongs (the tray, its card or another day)
    this.held.update((m) => {
      const next = new Map(m);
      if (item.checked) next.delete(item.todo.id); else next.set(item.todo.id, { at, label: item.label, date: this.store.todayKey() });
      return next;
    });
    this.todos.setDone(item.todo.id, !item.checked, this.dates()[this.store.today()]);
  }
  /**
   * The tray folds down to its top border (Gianni): a tap on the border slides the list out of sight, another tap
   * brings it back; remembered on this device (core/tray-fold).
   */
  protected readonly trayFolded = signal(readTrayFolded());
  protected toggleTray(): void {
    const folded = !this.trayFolded();
    if (!folded) this.held.set(new Map());   // opened again: the tasks checked last time have gone
    this.trayFolded.set(folded);
    writeTrayFolded(folded);
  }
  /** Under a tray task's name: "from Mon 9" for an earlier day, "Today" for one whose hour has passed, "All day" without one. */
  protected trayLabel(todo: Todo): string {
    if (this.rolledOver(todo)) return this.fromLabel(todo);
    return this.i18n.t(todo.time === null ? 'week.allDay' : 'capture.today');
  }
  /** A single task left open on an earlier day (a repeating one in the tray is always today's occurrence). */
  private rolledOver(todo: Todo): boolean {
    return !todo.repeat.length && todo.date !== null && todo.date < this.store.todayKey();
  }
  /** "from Mon 9": the day an overdue task was for. */
  protected fromLabel(todo: Todo): string {
    const [y, m, d] = (todo.date ?? '').split('-').map(Number);
    const day = new Date(y, m - 1, d).toLocaleDateString(this.i18n.lang(), { weekday: 'short', day: 'numeric' });
    return this.i18n.t('week.todoFrom', { day });
  }
  /** Every task on the board keeps its ✎ (Gianni): it opens the same editor as Capture (name, day, hour, repeat). */
  protected readonly editingTodo = signal<Todo | null>(null);
  /** The day whose note was tapped: converting the task to an Activity puts it there, in the task's place. */
  protected readonly editingDay = signal<Day | null>(null);
  protected editTodo(todo: Todo, day: Day): void {
    this.editingDay.set(day);
    this.editingTodo.set(this.todos.todos().find((t) => t.id === todo.id) ?? null);   // the stored task, not a date's view
  }
  protected saveTodo(change: TodoSave): void {
    if (!change.id) { this.todos.add(change.title, change.repeat.length ? null : change.date, change.time, change.repeat); return; }
    this.todos.update(change.id, { title: change.title, date: change.date, time: change.time, repeat: change.repeat });
  }
  /** The date of each day of this week (Monday first): a repeating task is checked for that date. */
  protected readonly dates = computed(() => {
    const now = this.store.now();
    return Object.fromEntries(DAYS.map((day) => [day, weekDate(now, day)])) as Record<Day, string>;
  });
  protected readonly notice = signal('');
  protected readonly windowErrors = signal<Record<string, string>>({});
  protected readonly editing = signal<TaskEdit | null>(null);
  /**
   * A task added by + stays a draft until Done: it is not saved, only shown in the details' Day/Block lists.
   * `newBlock` is the block a day's + would create for it (null when it goes into an existing block).
   */
  private readonly draftBlock = signal<Block | null>(null);
  /** The week the details see: the saved week plus the draft block of a + task. */
  protected readonly dialogWeek = computed(() => {
    const week = this.store.week();
    const edit = this.editing();
    const draft = this.draftBlock();
    if (!edit?.isNew || !draft) return week;
    return { ...week, [edit.day]: { blocks: [draft, ...week[edit.day].blocks] } };
  });
  protected readonly transferring = signal<{ day: Day; block: Block } | null>(null);
  /** The day whose blocks are being copied or moved (its ⇄ while arranging). */
  protected readonly transferringDay = signal<Day | null>(null);

  /** Where today's now-line sits: the running task and the share of it already gone. */
  protected readonly now = computed(() => nowPosition(this.store.week()[this.store.today()], this.store.nowMinutes()));
  protected readonly nowLabel = computed(() => formatClock(this.store.nowMinutes()));
  /** The running activity's countdown bar at its foot (Gianni): the minutes left, shrinking from the left. */
  protected readonly left = computed(() => countdown(this.store.week()[this.store.today()], this.store.nowMinutes()));
  protected leftMinutes(minutes: number): number {
    return Math.max(1, Math.ceil(minutes));
  }
  protected leftLabel(minutes: number): string {
    return this.i18n.t('week.minutesLeft', { n: this.leftMinutes(minutes) });
  }
  /** Today's running card, still open (not marked finished or skipped), on the locked board. */
  protected counting(day: Day, task: Task): boolean {
    if (this.arranging() || day !== this.store.today() || this.left()?.taskId !== task.id) return false;
    const st = this.cardStatus(day, task);
    return st !== 'done' && st !== 'late' && st !== 'skipped';
  }

  /**
   * Scrolls so today's now-line sits exactly in the middle of the screen (on entering, today's column when it has no
   * line). The return after 4 s still (`entering` false) only follows a line on screen, and never while arranging,
   * with a window open (dragging only happens while arranging); it does nothing when the line is already in the middle.
   */
  protected centreOnNow(entering: boolean): void {
    const today = document.querySelector<HTMLElement>('article.day.today');
    const line = today?.querySelector<HTMLElement>('.now-line');
    if (!entering && (!line || this.arranging() || document.querySelector('dialog[open]'))) return;
    const target = line ?? today;
    if (!target || !shownOnScreen(target)) return;                          // hidden (another day's tab)
    const rect = target.getBoundingClientRect();
    const view = window.visualViewport?.height ?? window.innerHeight;
    if (line && Math.abs(rect.top - view / 2) <= 4) { if (!this.autoScroll) this.light(); return; }   // already in the middle
    const smooth = typeof matchMedia === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.endAutoScroll(400);                                                  // no scroll at all (an edge): it still lights
    if (!smooth) { target.scrollIntoView({ block: 'center', inline: 'nearest' }); return; }
    // sideways on its own (wide boards whose days overflow): today's column comes into view in its row, and the page
    // glides down to the line
    const row = target.closest<HTMLElement>('.week');
    const column = target.closest<HTMLElement>('article.day');
    if (row && column && row.scrollWidth > row.clientWidth) {
      const c = column.getBoundingClientRect(), r = row.getBoundingClientRect();
      if (c.left < r.left || c.right > r.right) row.scrollTo({ left: row.scrollLeft + c.left - r.left - Math.max(0, (r.width - c.width) / 2), behavior: 'smooth' });
    }
    this.glideTo(window.scrollY + target.getBoundingClientRect().top + target.offsetHeight / 2 - view / 2);
  }

  /**
   * A slow, soft glide of the page (Gianni: the browser's smooth scroll was far too fast): about 1.4 s, longer for a
   * long way, easing in and out; a touch, the wheel or a click of his stops it where it is.
   */
  private glideTo(y: number): void {
    const from = window.scrollY;
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const to = Math.max(0, Math.min(max, Math.round(y)));
    const distance = to - from;
    if (Math.abs(distance) < 2) return;
    const duration = Math.min(2200, 1200 + Math.abs(distance) * 0.4);
    const started = performance.now();
    const since = Date.now();
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const frame = (now: number) => {
      if (this.handledAt > since) return;                                     // he took over
      const t = Math.min(1, (now - started) / duration);
      window.scrollTo(0, from + distance * ease(t));
      if (t < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /**
   * The now-line's time badge: a tap centres the line; while arranging only a double tap does (Gianni: nothing may
   * scroll the board while editing unless asked), so a stray tap on the badge never moves the page.
   */
  protected badgeTap(): void {
    if (!this.arranging()) { this.centreOnNow(true); return; }
    const now = Date.now();
    if (now - this.lastBadgeTap <= DOUBLE_TAP_MS) { this.lastBadgeTap = 0; this.centreOnNow(true); return; }
    this.lastBadgeTap = now;
  }
  private lastBadgeTap = 0;

  /** The details belong to a day's + (a new block with its first activity), not to a block's own +. */
  protected isNewBlock(edit: TaskEdit): boolean {
    return edit.isNew && !!this.draftBlock() && edit.blockId === this.draftBlock()!.id;
  }

  protected blocks(day: Day): Block[] {
    return this.store.week()[day].blocks;
  }

  private readonly autoColors = inject(AutoColors);
  protected readonly undo = inject(Undo);
  /** Each card keeps the automatic colour it first got, wherever it moves (Gianni). */
  protected colors(block: Block): string[] {
    const colors = blockColors(block.tasks, this.autoColors.map);
    this.autoColors.saveIfGrown();
    return colors;
  }

  protected startLabel(block: Block, index: number): string {
    const start = taskStarts(block)[index];
    return start === null ? '' : formatClock(start);
  }

  protected durationLabel(minutes: number): string {
    const m = validMinutes(minutes);
    const h = Math.floor(m / 60);
    const rest = m % 60;
    if (!h) return `${m} MIN`;
    return rest ? `${h} H ${rest} MIN` : `${h} H`;
  }

  protected freeLabel(block: Block): string {
    const free = freeMinutes(this.live(block));   // live while a handle is pulled
    if (free === null) return '';
    if (free === 0) return this.i18n.t('week.full');
    return free > 0 ? this.i18n.t('week.free', { n: free }) : this.i18n.t('week.over', { n: -free });
  }

  /** The block as it looks now: while a card's handle is pulled, with the minutes it would get. */
  private live(block: Block): Block {
    const z = this.sizing();
    let b = block;
    if (z && b.tasks.some((t) => t.id === z.taskId)) b = { ...b, tasks: b.tasks.map((t) => (t.id === z.taskId ? { ...t, minutes: z.minutes } : t)) };
    return b;
  }

  /** The card whose handle is being pulled, and the minutes it would have now (shown live, saved on release). */
  protected readonly sizing = signal<{ taskId: string; minutes: number } | null>(null);
  /** A card's minutes as drawn: live while its handle is pulled. */
  protected shownMinutes(task: Task): number {
    const z = this.sizing();
    return z && z.taskId === task.id ? z.minutes : task.minutes;
  }
  /** While a card's handle is pulled: when it would end (or its minutes, in a block with no start). */
  protected sizingBadge(block: Block, index: number, task: Task): string {
    const start = taskStarts(block)[index];
    const minutes = this.shownMinutes(task);
    return start === null ? this.durationLabel(minutes) : formatClock(start + validMinutes(minutes));
  }
  private setMinutes(day: Day, block: Block, task: Task, minutes: number): void {
    if (minutes === validMinutes(task.minutes)) return;
    this.store.update(day, (blocks) => blocks.map((b) => (b.id === block.id
      ? { ...b, tasks: b.tasks.map((t) => (t.id === task.id ? { ...t, minutes } : t)) } : b)));
  }

  /**
   * The handle at a card's foot (Gianni, edit mode): dragging it by n px changes the card's minutes by n / (px per minute), live
   * (the card grows or shrinks, the block's free time follows); release saves it. Never past the block's end.
   */
  protected startResize(event: PointerEvent, day: Day, block: Block, task: Task): void {
    event.stopPropagation();
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const y0 = event.clientY;
    this.sizing.set({ taskId: task.id, minutes: validMinutes(task.minutes) });
    const from = validMinutes(task.minutes);
    // in 5-minute steps (Gianni); at a thin scale the finger travels at least 1px a minute, so a step is never a twitch
    const move = (e: PointerEvent) => this.sizing.set({ taskId: task.id, minutes: resizedMinutes(block, task.id, snapDelta(from, (e.clientY - y0) / Math.max(1, this.text.pxPerMin()))) });
    const done = (commit: boolean) => () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', cancel);
      const minutes = this.sizing()?.minutes;
      this.sizing.set(null);
      if (commit && minutes !== undefined) this.setMinutes(day, block, task, minutes);
    };
    const up = done(true);
    const cancel = done(false);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', cancel);
  }

  /** Keys on a card's handle: ↓/→ five minutes longer, ↑/← shorter (to the 5-minute steps), Shift one, PageUp/PageDown fifteen. */
  protected resizeKey(event: KeyboardEvent, day: Day, block: Block, task: Task): void {
    const raw = ({ ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, PageDown: 15, PageUp: -15 } as Record<string, number>)[event.key];
    if (!raw) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = event.shiftKey || Math.abs(raw) > 1 ? raw : keyStep(validMinutes(task.minutes), raw);
    this.setMinutes(day, block, task, resizedMinutes(block, task.id, delta));
  }
  /** Free minutes drawn as the striped band (live while a card's handle is pulled). */
  protected freeShown(block: Block): number {
    return Math.max(0, freeMinutes(this.live(block)) ?? 0);
  }
  protected isOver(block: Block): boolean {
    return (freeMinutes(block) ?? 0) < 0;
  }

  /** The block's time range (Gianni: no minutes on it); drawn as from – to with a soft grey dash. */
  protected summary(block: Block): { from: string; to: string } | null {
    const start = parseClock(block.start);
    const total = windowLength(block) ?? taskTotal(block);
    if (start === null) return null;
    return { from: formatClock(start), to: formatClock(start + total) };
  }


  // --- Today's states on the board (Gianni): a tap on a card of today marks it Done (again: To do); a long press
  //     (500 ms, or a right click) opens the state menu. The state shows as a small figure at the card's top right. ---
  protected readonly statuses = STATUSES;
  protected readonly picking = signal<Task | null>(null);
  private readonly statusDialog = viewChild<ElementRef<HTMLDialogElement>>('statusDialog');
  private readonly boardEl = viewChild<ElementRef<HTMLElement>>('board');
  private readonly trayEl = viewChild<ElementRef<HTMLElement>>('tray');
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private pressAt: { x: number; y: number } | null = null;
  private longPressed = false;

  // --- Where an activity lives (Gianni): on the locked board a tap on its title opens a card with its Area, Epic,
  //     Feature and Story, so their names (the Story's "As a…, I want…, so that…") can be read. The rest of the card
  //     keeps its own tap (Done) and long press (the state menu). ---
  protected readonly info = signal<{ task: Task; block: Block; index: number; tone: string } | null>(null);
  private readonly infoDialog = viewChild<ElementRef<HTMLDialogElement>>('infoDialog');
  /** The titles of the levels the open card's activity lives under, '' where it has none (Free Space). */
  protected readonly infoPath = computed(() => {
    const open = this.info();
    const path = open?.task.ref ? pathOf(this.library.library(), open.task.ref) : [];
    const at = (kind: string) => path.find((n) => n.kind === kind)?.title ?? '';
    return { area: at('area'), epic: at('epic'), feature: at('feature'), story: at('story') };
  });
  protected titleTap(event: Event, block: Block, index: number, task: Task, tone: string): void {
    event.stopPropagation();                                              // not the card's Done
    if (event instanceof KeyboardEvent) event.preventDefault();
    this.pressEnd();
    if (this.longPressed) { this.longPressed = false; return; }          // the long press already opened the state menu
    this.info.set({ task, block, index, tone });
    const d = this.infoDialog()?.nativeElement;
    if (d) openDialog(d);
  }
  protected closeInfo(): void {
    void closeDialog(this.infoDialog()?.nativeElement);
  }
  protected onInfoBackdrop(event: MouseEvent): void {
    const d = this.infoDialog()?.nativeElement;
    if (d && isBackdropClick(event, d)) void closeDialog(d);
  }


  protected statusIcon(status: Status): string {
    return { todo: '', done: '✓', late: '⏰', progress: '▶', skipped: '⤼' }[status];
  }
  /** Today's state of a card, or null on other days (states are kept per date). */
  protected cardStatus(day: Day, task: Task): Status | null {
    return day === this.store.today() ? this.store.status(task.id) : null;
  }

  protected pressStart(event: PointerEvent, day: Day, task: Task): void {
    if (event.button !== 0 || this.arranging() || day !== this.store.today()) return;
    this.longPressed = false;
    this.pressEnd();
    this.pressAt = { x: event.clientX, y: event.clientY };
    this.pressTimer = setTimeout(() => {
      this.longPressed = true;
      navigator.vibrate?.(15);
      this.openStatus(task);
    }, 500);
  }
  /** A finger that moves (a scroll) is not a long press. */
  protected pressMove(event: PointerEvent): void {
    if (this.pressAt && Math.hypot(event.clientX - this.pressAt.x, event.clientY - this.pressAt.y) > 10) this.pressEnd();
  }
  protected pressEnd(): void {
    if (this.pressTimer) clearTimeout(this.pressTimer);
    this.pressTimer = null;
    this.pressAt = null;
  }

  /** A card tapped: while arranging it opens its details; on the board, today's card toggles Done. */
  protected cardTap(day: Day, block: Block, task: Task): void {
    if (this.arranging()) { this.openTask(day, block, task); return; }
    if (this.longPressed) { this.longPressed = false; return; }          // the long press already opened the menu
    if (day !== this.store.today()) return;
    const done = !this.store.isDone(task.id);
    this.store.setDone(task.id, done);
    if (done) this.celebrate(block, task);
  }

  /**
   * A task just done (Gianni: "más glorioso"): the card flashes gold, its ✓ draws itself and the phone gives a short
   * double buzz; when it was the block's last open activity, a few gold sparkles burst from the block. The card then
   * rests pressed in, on pale gold. Under reduced motion only the resting look changes.
   */
  private celebrate(block: Block, task: Task): void {
    if (typeof document === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    navigator.vibrate?.([12, 40, 24]);
    const blockDone = block.tasks.every((t) => !t.active || t.id === task.id || this.store.isDone(t.id));
    requestAnimationFrame(() => {
      const card = document.querySelector<HTMLElement>(`.task[data-status][data-task="${CSS.escape(task.id)}"]`);
      if (!card) return;
      card.classList.remove('won');
      void card.offsetWidth;                                   // restart the flash on a quick second Done
      card.classList.add('won');
      setTimeout(() => card.classList.remove('won'), 1100);
      const host = card.closest<HTMLElement>('.block');
      if (blockDone && host) this.sparkle(host);
    });
  }

  /** Gold sparkles flying out of the middle of a block whose activities are all done (fixed to the screen); removed when they fade. */
  private sparkle(host: HTMLElement): void {
    const n = 12;
    const box = host.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      s.className = 'sparkle';
      s.style.left = `${box.left + box.width / 2}px`;
      s.style.top = `${box.top + box.height / 2}px`;
      s.setAttribute('aria-hidden', 'true');
      const angle = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 50 + Math.random() * 40;
      s.style.setProperty('--sx', `${Math.cos(angle) * dist}px`);
      s.style.setProperty('--sy', `${Math.sin(angle) * dist}px`);
      s.style.setProperty('--sd', `${Math.round(Math.random() * 120)}ms`);
      s.textContent = i % 3 ? '✦' : '★';
      document.body.appendChild(s);
      s.addEventListener('animationend', () => s.remove(), { once: true });
      setTimeout(() => s.remove(), 1500);
    }
  }

  protected cardMenu(event: Event, day: Day, task: Task): void {
    if (this.arranging() || day !== this.store.today()) return;
    event.preventDefault();
    this.openStatus(task);
  }

  private openStatus(task: Task): void {
    this.pressEnd();
    this.picking.set(task);
    const d = this.statusDialog()?.nativeElement;
    if (d) openDialog(d);
  }
  protected pickStatus(status: Status): void {
    const task = this.picking();
    if (task) {
      const before = this.store.isDone(task.id);
      this.store.setStatus(task.id, status);
      const block = this.blocks(this.store.today()).find((b) => b.tasks.some((t) => t.id === task.id));
      if (!before && isFinished(status) && block) this.celebrate(block, task);
    }
    void closeDialog(this.statusDialog()?.nativeElement);
  }
  protected onStatusBackdrop(event: MouseEvent): void {
    const d = this.statusDialog()?.nativeElement;
    if (d && isBackdropClick(event, d)) void closeDialog(d);
  }

  protected isDone(day: Day, task: Task): boolean {
    return day === this.store.today() && this.store.isDone(task.id);
  }

  /**
   * Edit mode opens like every window (Gianni: nothing appears all at once): the arranging board grows out of the ✎ in
   * a widening circle and, on Finish, shrinks back into the same point, at the dialogs' rate (300 ms, mirrored curves).
   * Uses a View Transition where the browser has one; elsewhere (or under reduced motion) it simply switches.
   */
  protected toggleArrange(): void {
    if (!this.store.loaded() || !this.library.ready()) return;               // edits wait for the saved week and library
    const opening = !this.arranging();
    // Gianni: switching keeps the page exactly where it was (the cards change height, the tools come and go): the card
    // or block in the middle of the screen stays at the same place on it.
    const anchor = viewAnchor();
    const change = () => {
      this.arranging.set(opening);
      this.notice.set('');
      this.appRef.tick();
      anchor?.();
      if (anchor) requestAnimationFrame(anchor);                            // and once more after the next layout
    };
    const doc = document as Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } };
    const reduced = typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof doc.startViewTransition !== 'function') { change(); return; }
    if (opening) this.arrangeFrom = pressPoint();                            // the ✎ pressed; Finish shrinks back into it
    const { x, y } = this.arrangeFrom ?? pressPoint();
    const root = document.documentElement;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.style.setProperty('--vt-x', x + 'px');
    root.style.setProperty('--vt-y', y + 'px');
    root.style.setProperty('--vt-r', Math.ceil(radius) + 'px');
    root.classList.add(opening ? 'vt-grow' : 'vt-shrink');
    const done = () => root.classList.remove('vt-grow', 'vt-shrink');
    doc.startViewTransition(change).finished.then(done, done);
  }
  private arrangeFrom: { x: number; y: number } | null = null;
  /** The action menu's ✎: arrange the week, once the week and the library are loaded. */
  protected readonly arrangeAction = computed<MenuAction | null>(() =>
    this.store.loaded() && this.library.ready() ? { label: this.i18n.t('week.arrange'), run: () => this.toggleArrange() } : null);
  private readonly appRef = inject(ApplicationRef);

  // --- Blocks ---

  protected addBlock(day: Day): void {
    const task: Task = { id: newId(), title: '', minutes: NEW_TASK_MINUTES, color: null, active: true, ref: null };
    const name = uniqueName(this.blocks(day).map((b) => b.name), this.i18n.t('week.newBlock'));
    this.draftBlock.set({ id: newId(), name, start: null, end: null, tasks: [] });   // saved (at the top of the day) only on Done
    this.editing.set({ day, blockId: this.draftBlock()!.id, task, isNew: true });
  }

  protected renameBlock(day: Day, block: Block, value: string): void {
    const others = this.blocks(day).filter((b) => b.id !== block.id).map((b) => b.name);
    const name = value.trim() ? uniqueName(others, value) : block.name;      // blank keeps the old name
    this.store.update(day, (blocks) => blocks.map((b) => (b.id === block.id ? { ...b, name } : b)));
  }

  protected setWindow(day: Day, block: Block, start: string, end: string): void {
    const problem = windowError(start, end, taskTotal(block));
    this.windowErrors.update((errors) => {
      const next = { ...errors };
      if (problem) next[block.id] = this.i18n.t('window.' + problem);
      else delete next[block.id];
      return next;
    });
    if (problem) return;
    const set = (blocks: Block[]) => blocks.map((b) => (b.id === block.id ? { ...b, start: start || null, end: end || null } : b));
    if ((start || null) === block.start) { this.store.update(day, set); return; }
    // A new start: the block glides to its hour among the day's blocks (Gianni), and the page follows it there
    const before = this.blocks(day).findIndex((b) => b.id === block.id);
    flip(document, this.injector, () => this.store.update(day, (blocks) => moveToHour(set(blocks), block.id)));
    if (this.blocks(day).findIndex((b) => b.id === block.id) !== before) this.scrollToBlock(block.id);
  }
  /** Brings a block that has just moved into the middle of the screen (Gianni: the focus goes where it went). */
  private scrollToBlock(id: string): void {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    afterNextRender({
      // after its glide (flip, 380 ms): while it runs the block is drawn at its old place, and the scroll would aim there
      read: () => setTimeout(() => {
        const el = document.querySelector<HTMLElement>(`[data-block="${CSS.escape(id)}"]`);
        el?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center', inline: 'nearest' });
      }, reduced ? 0 : FLIP_MS + 20),
    }, { injector: this.injector });
  }

  protected moveBlock(day: Day, index: number, offset: number): void {
    flip(document, this.injector, () => this.store.update(day, (blocks) => moveItem(blocks, index, index + offset)));
  }

  protected async deleteBlock(day: Day, block: Block): Promise<void> {
    // Gianni: a second chance in the same window; it goes after 8 s unless Cancel is pressed,
    // from wherever it is when the time is up (it may have been moved meanwhile)
    await this.asks.ask({
      message: this.i18n.t('week.confirmDeleteBlock', { block: block.name }), ok: this.i18n.t('task.delete'), danger: true,
      countdown: { message: this.i18n.t('undo.deleting', { name: block.name }), ids: [block.id], commit: () => {
        const now = this.days.find((d) => this.blocks(d).some((b) => b.id === block.id));
        if (now) this.store.update(now, (blocks) => blocks.filter((b) => b.id !== block.id));
      } },
    });
  }

  protected openTransfer(day: Day, block: Block): void {
    this.transferring.set({ day, block });
  }

  protected applyTransfer(transfer: Transfer): void {
    const current = this.transferring();
    this.transferring.set(null);
    if (!current) return;
    const from = current.day;
    const block = this.blocks(from).find((b) => b.id === current.block.id);   // the latest saved version, not the one the dialog opened with
    if (!block) return;                                                      // deleted meanwhile (another tab)
    for (const day of transfer.days) {
      if (day === from) continue;
      const names = this.blocks(day).map((b) => b.name);
      const name = uniqueName(names, block.name);
      const placed = transfer.mode === 'copy' ? cloneBlock(block, name) : { ...structuredClone(block), name };
      this.store.update(day, (blocks) => placeBlock(blocks, placed));       // it lands at its hour
    }
    if (transfer.mode === 'move') this.store.update(from, (blocks) => blocks.filter((b) => b.id !== block.id));
  }

  protected openDayTransfer(day: Day): void {
    this.transferringDay.set(day);
  }

  /**
   * The whole day copied to the picked days, or moved to one (Gianni): its blocks join the ones there, each at its hour
   * (`addDayBlocks`); a move then empties this day. Reads the latest saved blocks, not the ones the dialog opened with.
   */
  protected applyDayTransfer(transfer: Transfer): void {
    const from = this.transferringDay();
    this.transferringDay.set(null);
    if (!from) return;
    const source = this.blocks(from);
    if (!source.length) return;
    for (const day of transfer.days) {
      if (day !== from) this.store.update(day, (blocks) => addDayBlocks(blocks, source, transfer.mode));
    }
    if (transfer.mode === 'move' && transfer.days.some((d) => d !== from)) {
      const moved = new Set(source.map((b) => b.id));
      this.store.update(from, (blocks) => blocks.filter((b) => !moved.has(b.id)));
    }
  }

  // --- Tasks ---

  protected addTask(day: Day, block: Block): void {
    const free = freeMinutes(block);
    const task: Task = { id: newId(), title: '', minutes: free === null ? NEW_TASK_MINUTES : Math.max(0, Math.min(NEW_TASK_MINUTES, free)), color: null, active: true, ref: null };
    this.draftBlock.set(null);
    this.editing.set({ day, blockId: block.id, task, isNew: true });        // a draft: added to the block only on Done
  }

  protected openTask(day: Day, block: Block, task: Task): void {
    if (!this.arranging()) return;
    this.draftBlock.set(null);
    this.editing.set({ day, blockId: block.id, task: structuredClone(task), isNew: false });
  }

  /** ▲/▼ on a card: one place in its block, or across into the block above/below at its edges (`stepTask`), gliding there. */
  protected moveTask(day: Day, block: Block, index: number, offset: -1 | 1): void {
    const step = stepTask(this.blocks(day), block.id, index, offset);
    if (!step) return;
    if ('noRoom' in step) {
      this.notice.set(this.i18n.t('week.noRoom', { block: step.noRoom.name, n: Math.max(0, freeMinutes(step.noRoom) ?? 0) }));
      return;
    }
    this.notice.set('');
    const taskId = block.tasks[index]?.id;
    flip(document, this.injector, () => this.store.update(day, (blocks) => {
      // read again from the current week (another tab may have changed it): the card at its current place moves
      const from = blocks.find((b) => b.id === block.id);
      const at = from ? from.tasks.findIndex((t) => t.id === taskId) : -1;
      const now = at < 0 ? null : stepTask(blocks, block.id, at, offset);
      return now && 'blocks' in now ? now.blocks : blocks;
    }));
  }
  /** ▲ is off only on the day's very first card, ▼ only on its very last (Gianni: at a block's edge they cross over). */
  protected canStep(first: boolean, last: boolean, firstBlock: boolean, lastBlock: boolean, offset: -1 | 1): boolean {
    return offset < 0 ? !(first && firstBlock) : !(last && lastBlock);
  }

  /**
   * Drag a card by its grip ⠿ (Gianni): a tilted copy follows the pointer so it shows it is held; where it would land
   * a dashed gap opens and the other cards glide aside to make room (in its block or another block of the same day).
   * On release the copy settles into the gap and the cards take their new order smoothly. A block that has no room
   * refuses it (the card goes back). Esc, a lost pointer or leaving the page cancels.
   */
  protected startTaskDrag(event: PointerEvent, day: Day, block: Block, task: Task): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const grip = event.currentTarget as HTMLElement;
    const card = grip.closest<HTMLElement>('li.task');
    const dayEl = grip.closest<HTMLElement>('article.day');
    const home = card?.parentElement;
    if (!card || !dayEl || !home) return;
    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true) as HTMLElement;
    ghost.classList.add('drag-ghost');
    Object.assign(ghost.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' });
    document.body.appendChild(ghost);
    // The gap: a dashed slot as tall as the card, first where the card was (the card itself is hidden meanwhile)
    const slot = document.createElement('li');
    slot.className = 'drop-slot';
    slot.style.height = rect.height + 'px';
    home.insertBefore(slot, card);
    card.classList.add('drag-src');
    const moving = 'li.task:not(.drag-src), li.drop-slot, section.block';
    const x0 = event.clientX, y0 = event.clientY, pointerId = event.pointerId;
    let dx = 0, dy = 0;
    let valid = true;                                           // the pointer is over a block of this day
    const move = (e: PointerEvent) => {
      if (!card.isConnected) { cancel(); return; }              // another tab deleted or moved it meanwhile
      dx = e.clientX - x0; dy = e.clientY - y0;
      ghost.style.transform = `translate(${dx}px, ${dy}px) rotate(-3deg) scale(1.04)`;
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('section.block[data-block]');
      const list = under && dayEl.contains(under) ? under.querySelector<HTMLElement>('ul.tasks') : null;
      valid = !!list;
      if (!list) {                                                // outside the day's blocks: the gap goes back home
        if (slot.nextElementSibling !== card) flipNow(dayEl, moving, () => home.insertBefore(slot, card));
        return;
      }
      const cards = Array.from(list.querySelectorAll<HTMLElement>('li.task:not(.drag-src)'));
      const next = cards.find((c) => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; }) ?? null;
      if (slot.parentElement === list && slot.nextElementSibling === next) return;
      if (next && next.previousElementSibling === slot) return;
      flipNow(dayEl, moving, () => list.insertBefore(slot, next));
    };
    let done = false;
    const finish = (commit: boolean) => () => {
      if (done) return;
      done = true;
      this.cancelDrag = null;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', cancel);
      removeEventListener('keydown', esc, true);
      removeEventListener('blur', cancel);
      dayEl.removeEventListener('lostpointercapture', cancel);
      if (dayEl.hasPointerCapture?.(pointerId)) dayEl.releasePointerCapture(pointerId);
      // Where it lands: the gap's block and its index among the other cards; a refused or cancelled drop goes home
      let target: { blockId: string; index: number } | null = null;
      const list = slot.parentElement;
      const toEl = list?.closest<HTMLElement>('section.block[data-block]');
      if (commit && valid && list && toEl && card.isConnected) {
        const index = Array.from(list.children).filter((c) => c === slot || (c.matches('li.task') && c !== card)).indexOf(slot);
        target = { blockId: toEl.dataset['block']!, index };
        if (!this.canDrop(day, block.id, task.id, target.blockId)) target = null;
      }
      if (!target && card.isConnected) flipNow(dayEl, moving, () => home.insertBefore(slot, card));
      const end = () => {
        const landed = slot.getBoundingClientRect();
        ghost.remove();
        if (!target) { slot.remove(); card.classList.remove('drag-src'); return; }
        const t = target;
        flip(document, this.injector, () => {
          slot.remove();
          card.classList.remove('drag-src');
          this.dropTask(day, block.id, task.id, t.blockId, t.index);
        }, new Map([[task.id, landed]]));
      };
      // The copy settles into the gap (rotation and lift go away), then the board takes the new order
      const to = slot.getBoundingClientRect();
      const reduced = typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced || !slot.isConnected) { end(); return; }
      const anim = ghost.animate([
        { transform: `translate(${dx}px, ${dy}px) rotate(-3deg) scale(1.04)` },
        { transform: `translate(${to.left - rect.left}px, ${to.top - rect.top}px) rotate(0deg) scale(1)` },
      ], { duration: 220, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'forwards' });
      anim.finished.then(end, end);
    };
    const up = finish(true);
    const cancel = finish(false);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };
    // Listened on the window (the card is hidden while dragged); a card that vanishes mid-drag (another tab deleted it)
    // cancels on the next move, and leaving the page cancels too (cancelDrag on destroy). `done` makes repeats no-ops.
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', cancel);
    addEventListener('keydown', esc, true);
    // The pointer is captured on the day column (visible all along), so a release outside the window still arrives;
    // if tracking is lost anyway (capture taken away, the window loses focus) the card goes home.
    addEventListener('blur', cancel);
    try { dayEl.setPointerCapture(pointerId); } catch { /* not capturable: the window listeners still work */ }
    dayEl.addEventListener('lostpointercapture', cancel);
    this.cancelDrag = cancel;
  }
  /** Cancels a card drag in progress (the page is leaving). */
  private cancelDrag: (() => void) | null = null;

  /** Whether the card can land in that block: it still exists, and another block must have room for it. */
  private canDrop(day: Day, fromId: string, taskId: string, toId: string): boolean {
    const blocks = this.blocks(day);
    const task = blocks.find((b) => b.id === fromId)?.tasks.find((t) => t.id === taskId);
    const to = blocks.find((b) => b.id === toId);
    if (!task || !to) return false;
    if (fromId !== toId && !fits(to, task.minutes)) {
      this.notice.set(this.i18n.t('week.noRoom', { block: to.name, n: Math.max(0, freeMinutes(to) ?? 0) }));
      return false;
    }
    this.notice.set('');
    return true;
  }

  /**
   * Puts a dragged card at `index` among the other cards of the target block (same day). The card is read again from
   * the current week (another tab may have renamed, recoloured or deleted it meanwhile): a card that is gone is not
   * brought back, and the latest version is the one moved.
   */
  private dropTask(day: Day, fromId: string, taskId: string, toId: string, index: number): void {
    this.store.update(day, (list) => {
      const current = list.find((b) => b.id === fromId)?.tasks.find((t) => t.id === taskId);
      const to = list.find((b) => b.id === toId);
      if (!current || !to) return list;
      if (fromId !== toId && !fits(to, current.minutes)) return list;
      if (fromId === toId && to.tasks.findIndex((t) => t.id === taskId) === index) return list;
      return list.map((b) => {
        let tasks = b.tasks.filter((t) => t.id !== taskId);
        if (b.id === toId) tasks = [...tasks.slice(0, index), current, ...tasks.slice(index)];
        return b.id === fromId || b.id === toId ? { ...b, tasks } : b;
      }).filter((b) => b.tasks.length > 0);
    });
  }

  protected async deleteTask(day: Day, block: Block, task: Task): Promise<void> {
    const message = this.i18n.t('week.confirmDeleteTask', { task: task.title || this.i18n.t('week.newTask') });
    await this.asks.ask({
      message, ok: this.i18n.t('task.delete'), danger: true,
      countdown: { message: this.i18n.t('undo.deleting', { name: task.title || this.i18n.t('week.newTask') }), ids: [task.id], commit: () => {
        for (const d of this.days) {                                         // where it is now (its block may have moved)
          const holder = this.blocks(d).find((b) => b.tasks.some((t) => t.id === task.id));
          if (holder) { this.removeTask(d, holder.id, task.id); return; }
        }
      } },
    });
  }

  /** A block lives only through its tasks: removing its last task removes the block. */
  private removeTask(day: Day, blockId: string, taskId: string): void {
    this.updateDay(day, (blocks) =>
      blocks
        .map((b) => (b.id === blockId ? { ...b, tasks: b.tasks.filter((t) => t.id !== taskId) } : b))
        .filter((b) => b.id !== blockId || b.tasks.length > 0),
    );
  }

  /**
   * Every week task schedules a library task (Floating Canvas): the linked one, the same-titled task of the chosen
   * story (or Free Space), or a new one there. A colour picked here is the library task's colour, in every block.
   * Returns the filed task and the library to save (null when unchanged); `inBatch` saves both together.
   */
  private fileInLibrary(task: Task, parentId: string | null, colorPicked: boolean): { task: Task; lib: Library | null } {
    if (!this.library.ready() || !task.title.trim()) return { task, lib: null };
    const current = this.library.library();
    let lib = current;
    let id = task.ref && nodeById(lib, task.ref)?.kind === 'task' ? task.ref : '';
    if (!id) ({ lib, id } = fileTask(lib, task.title, parentId, task.color));
    const node = nodeById(lib, id)!;
    if (colorPicked && node.color !== task.color) lib = updateNode(lib, id, { color: task.color });
    return { task: { ...task, title: node.title, color: colorPicked ? task.color : node.color, ref: id }, lib: lib === current ? null : lib };
  }

  /** Day changes collected while `inBatch` runs (null: writes go straight to the store). */
  private batch: Partial<Record<Day, Block[]>> | null = null;

  /** Changes a day now, or inside the current batch. */
  private updateDay(day: Day, change: (blocks: Block[]) => Block[]): void {
    if (!this.batch) { this.store.update(day, change); return; }
    this.batch[day] = change(structuredClone(this.batch[day] ?? this.blocks(day)));
  }

  /**
   * Runs the day changes of one action; with a changed library, every day that changes (the action's, and the other
   * places of its library tasks that follow their title and colour) is committed in ONE batch with the library, so a
   * refused library write can never leave week cards pointing at a task (or colour) the library does not have.
   */
  private inBatch(lib: Library | null, action: () => void): void {
    this.batch = {};
    try { action(); } finally {
      const days = this.batch;
      this.batch = null;
      if (!lib) {
        for (const day of DAYS) if (days[day]) this.store.setBlocks(day, days[day]);
      } else {
        const writes: WeekWrite[] = [];
        for (const day of DAYS) {
          const blocks = days[day] ?? this.blocks(day);
          let changed = !!days[day];
          const next = blocks.map((b) => {
            const tasks = followLibrary(b.tasks, lib);
            if (tasks.some((t, i) => t !== b.tasks[i])) { changed = true; return { ...b, tasks }; }
            return b;
          });
          const write = changed ? this.store.stage(day, next) : null;
          if (write) writes.push(write);
        }
        this.library.save(lib, writes);
      }
    }
  }

  protected saveTask(raw: TaskSave): void {
    const filed = this.fileInLibrary(raw.task, raw.parentId, raw.colorPicked);
    this.inBatch(filed.lib, () => this.applySave({ ...raw, task: filed.task }));
  }

  private applySave(save: TaskSave): void {
    const edit = this.editing();
    const draft = this.draftBlock();
    this.editing.set(null);
    this.draftBlock.set(null);
    if (edit?.isNew) {
      this.addSaved(save, draft);
      return;
    }
    const sameBlock = save.fromDay === save.day && save.fromBlockId === save.blockId;
    if (sameBlock) {
      this.updateDay(save.day, (blocks) =>
        blocks.map((b) => (b.id === save.blockId ? { ...b, tasks: b.tasks.map((t) => (t.id === save.task.id ? save.task : t)) } : b)));
      return;
    }
    // Moved: out of its old block (which goes away when emptied), to the end of the new one.
    const oldName = this.blocks(save.fromDay).find((b) => b.id === save.fromBlockId)?.name ?? this.i18n.t('week.newBlock');
    this.removeTask(save.fromDay, save.fromBlockId, save.task.id);
    this.updateDay(save.day, (blocks) => {
      if (blocks.some((b) => b.id === save.blockId)) {
        return blocks.map((b) => (b.id === save.blockId ? { ...b, tasks: [...b.tasks, save.task] } : b));
      }
      const name = uniqueName(blocks.map((b) => b.name), oldName);              // a day with no blocks gets one
      return [...blocks, { id: newId(), name, start: null, end: null, tasks: [save.task] }];
    });
  }

  /** Done on a + task: it joins the latest saved week (other changes made meanwhile stay). */
  private addSaved(save: TaskSave, draft: Block | null): void {
    this.updateDay(save.day, (blocks) => {
      if (blocks.some((b) => b.id === save.blockId)) {
        return blocks.map((b) => (b.id === save.blockId ? { ...b, tasks: [...b.tasks, save.task] } : b));
      }
      const name = uniqueName(blocks.map((b) => b.name), save.blockName || draft?.name || this.i18n.t('week.newBlock'));
      const block: Block = { id: draft?.id ?? newId(), name, start: null, end: null, tasks: [save.task] };
      return [block, ...blocks];                                             // a new block goes at the top, easy to find
    });
  }

  /** Cancel: nothing was saved yet for a + task, and an edited task keeps its saved values. */
  protected cancelTask(): void {
    this.editing.set(null);
    this.draftBlock.set(null);
  }

  protected canAddTo(block: Block): boolean {
    return fits(block, 1);
  }
}
