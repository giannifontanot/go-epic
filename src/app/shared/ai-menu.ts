import { Component, ElementRef, Injector, afterNextRender, inject, signal, viewChild, viewChildren } from '@angular/core';
import { AiError, AiFailure, AiService } from '../core/ai.service';
import { AI_ASKS, AiAsk, AiPlan, AiTurn, aiContext, aiCreateSystem, aiQuestion, aiSystem, applyPlan, parsePlan, plainReply } from '../core/ai.model';
import { closeDialog, isBackdropClick, openDialog } from '../core/dialog';
import { I18n } from '../core/i18n';
import { LibraryStore } from '../core/library.store';
import { DayMarks, habits, taskHabits } from '../core/status.model';
import { SprintStore } from '../core/sprint.store';
import { TodoStore } from '../core/todo.store';
import { dateKey } from '../core/week.model';
import { WeekStore } from '../core/week.store';
import { YEARS, placeOf, yearFor, yearPlan } from '../core/year.model';
import { CaptureUi } from '../pages/capture/capture-ui';
import { flyTiles, placeBeside } from './fan';

/** How many days of marks Claude reads for the habits (14 are drawn, the streak looks a little further back). */
const HISTORY_DAYS = 30;
type Ask = AiAsk | 'free';
interface Shown { role: 'user' | 'assistant'; text: string; plan: AiPlan | null }

/**
 * Ask Claude (Gianni): a round ✨ above the menu's button, on the Week board only. A tap fans its choices out to the left,
 * exactly like the pages menu: «¿Cómo voy?» first and highlighted, «¿En qué debo poner atención?», «Crear un Epic o una
 * actividad» and a free question. The answer comes in a window that grows out of the tap, in the theme in use; a reply
 * can be answered, and in the creating conversation Claude asks one thing at a time and shows the whole plan, which goes
 * into the Canvas only on Aplicar. With no Claude key yet, the window says how to add one in Ajustes.
 */
@Component({
  selector: 'app-ai-menu',
  template: `
    <button #fab type="button" class="capture-fab ai-fab" [class.open]="fanOpen()" [class.away]="ui.menuOpen()"
            [attr.aria-hidden]="ui.menuOpen() || null" [attr.tabindex]="ui.menuOpen() ? -1 : null"
            [attr.aria-expanded]="fanOpen()" aria-controls="ai-fan" [attr.aria-label]="i18n.t('ai.button')" [title]="i18n.t('ai.button')"
            (click)="toggle()">
      <!-- the AI sparkles: one large four-pointed star and two small ones, outlined like the other round buttons -->
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
        <path d="M10 4.5c.6 3.6 2 5 5.5 5.5-3.5.6-4.9 2-5.5 5.5-.6-3.5-2-4.9-5.5-5.5C8 9.5 9.4 8.1 10 4.5Z"/>
        <path d="M17.5 13.5c.3 1.7 1 2.4 2.7 2.7-1.7.3-2.4 1-2.7 2.7-.3-1.7-1-2.4-2.7-2.7 1.7-.3 2.4-1 2.7-2.7Z"/>
        <path d="M17.6 3.2c.2 1.1.6 1.5 1.7 1.7-1.1.2-1.5.6-1.7 1.7-.2-1.1-.6-1.5-1.7-1.7 1.1-.2 1.5-.6 1.7-1.7Z"/>
      </svg>
    </button>
    @if (fanOpen()) {
      <div class="theme-fan-veil" aria-hidden="true" (click)="closeFan()"></div>
      <nav #fanBox id="ai-fan" class="page-fan ai-fan" [attr.aria-label]="i18n.t('ai.button')">
        @for (ask of asks; track ask) {
          <button #tile type="button" class="page-tile ai-tile" [class.ai-lead]="ask === 'how'" (click)="pick(ask)">{{ label(ask) }}</button>
        }
      </nav>
    }
    <dialog #dialog class="info-card ai-window" aria-labelledby="ai-title" (click)="onBackdrop($event)" (close)="reset()">
      <div class="info-head">
        <h2 id="ai-title" tabindex="-1"><span class="ai-spark" aria-hidden="true">✦</span> {{ i18n.t('ai.title') }}</h2>
        <button type="button" class="round" [attr.aria-label]="i18n.t('nav.close')" [title]="i18n.t('nav.close')" (click)="close()">✕</button>
      </div>
      <div #log class="ai-log" aria-live="polite">
        @if (!ai.hasKey() && ai.ready()) {
          <p class="ai-note">{{ i18n.t('ai.noKey') }}</p>
          <button type="button" class="primary btn-apply ai-settings" (click)="toSettings()">{{ i18n.t('ai.openSettings') }}</button>
        }
        @for (turn of shown(); track $index) {
          @if (turn.role === 'user') { <p class="ai-you">{{ turn.text }}</p> }
          @else {
            @if (turn.text) { <p class="ai-reply">{{ turn.text }}</p> }
            @if (turn.plan; as plan) {
              <div class="ai-plan">
                <strong class="ai-plan-title">{{ i18n.t('ai.planTitle') }}</strong>
                <dl>
                  <dt>{{ i18n.levelsIn('[area]') }}</dt><dd>{{ areaName(plan.area) }}</dd>
                  <dt>{{ i18n.levelsIn('[epic]') }}</dt><dd>{{ plan.epic }}</dd>
                  <dt>{{ i18n.levelsIn('[feature]') }}</dt><dd>{{ plan.feature }}</dd>
                  <dt>{{ i18n.levelsIn('[story]') }}</dt><dd>{{ plan.story }}</dd>
                  <dt>{{ i18n.levelsIn('[task]') }}</dt><dd>{{ plan.activity }}@if (plan.minutes) { · {{ plan.minutes }} min }</dd>
                </dl>
                @if (applied() === plan) { <p class="ai-done">{{ i18n.t('ai.applied', { area: areaName(plan.area) }) }}</p> }
                @else if ($last) {
                  <button type="button" class="primary btn-apply" [disabled]="!library.ready()" (click)="apply(plan)">{{ i18n.t('ai.apply') }}</button>
                }
              </div>
            }
          }
        }
        @if (busy()) { <p class="ai-thinking">{{ i18n.t('ai.thinking') }}</p> }
        @if (failure(); as kind) {
          <p class="ai-error" role="alert">{{ failText(kind) }}</p>
          @if (kind === 'badkey') { <button type="button" class="btn-cancel" (click)="toSettings()">{{ i18n.t('ai.openSettings') }}</button> }
          @else if (kind !== 'refused' && kind !== 'nokey') { <button type="button" class="btn-cancel" (click)="retry()">{{ i18n.t('ai.retry') }}</button> }
        }
        @if (applyFailed()) { <p class="ai-error" role="alert">{{ i18n.t('ai.applyFail') }}</p> }
      </div>
      @if (ai.hasKey()) {
        <form class="ai-ask" (submit)="$event.preventDefault(); write()">
          <input #box class="ai-input" type="text" enterkeyhint="send" autocomplete="off" maxlength="1000"
                 [placeholder]="i18n.t('ai.placeholder')" [attr.aria-label]="i18n.t('ai.placeholder')" [value]="draft()"
                 (input)="draft.set(box.value)" />
          <button type="submit" class="primary btn-apply" [disabled]="busy() || !draft().trim()">{{ i18n.t('ai.send') }}</button>
        </form>
      }
      <div class="info-foot">
        <button type="button" class="btn-cancel" (click)="close()">{{ i18n.t('nav.close') }}</button>
      </div>
    </dialog>
  `,
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class AiMenu {
  protected readonly i18n = inject(I18n);
  protected readonly ui = inject(CaptureUi);
  protected readonly ai = inject(AiService);
  protected readonly library = inject(LibraryStore);
  private readonly week = inject(WeekStore);
  private readonly todos = inject(TodoStore);
  private readonly sprint = inject(SprintStore);
  private readonly injector = inject(Injector);
  protected readonly asks: Ask[] = [...AI_ASKS, 'free'];
  protected readonly fanOpen = signal(false);
  protected readonly shown = signal<Shown[]>([]);
  protected readonly busy = signal(false);
  protected readonly failure = signal<AiFailure | null>(null);
  protected readonly applied = signal<AiPlan | null>(null);
  protected readonly applyFailed = signal(false);
  protected readonly draft = signal('');
  private readonly fab = viewChild.required<ElementRef<HTMLButtonElement>>('fab');
  private readonly fanBox = viewChild<ElementRef<HTMLElement>>('fanBox');
  private readonly tiles = viewChildren<ElementRef<HTMLElement>>('tile');
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly log = viewChild.required<ElementRef<HTMLElement>>('log');
  /** The conversation sent to Claude, and which kind it is (the creating one has its own instructions). */
  private turns: AiTurn[] = [];
  private mode: Ask = 'how';
  private history: Record<string, DayMarks> = {};
  /** The day history read for this conversation: the first answer waits for it (`loadHistory`). */
  private historyReady: Promise<void> = Promise.resolve();
  /** A newer question or a closed window makes an older answer stale. */
  private asked = 0;
  private closing = false;

  protected label(ask: Ask): string {
    return this.i18n.t(`ai.${ask}`);
  }
  protected areaName(title: string): string {
    const key = { 'El Templo': 'temple', 'El Castillo': 'castle', 'La Torre': 'tower', 'La Arena': 'arena' }[title];
    return key ? this.i18n.t(`area.${key}`) : title;
  }
  protected failText(kind: AiFailure): string {
    return kind === 'nokey' ? this.i18n.t('ai.noKey') : this.i18n.t(`ai.err.${kind}`);
  }

  protected toggle(): void {
    if (this.fanOpen()) { this.closeFan(); return; }
    this.fanOpen.set(true);
    afterNextRender(() => {
      placeBeside(this.fab().nativeElement, this.fanBox()?.nativeElement);
      flyTiles(this.fab().nativeElement, this.tiles().map((t) => t.nativeElement), true);
    }, { injector: this.injector });
  }
  protected closeFan(): Promise<void> {
    if (!this.fanOpen() || this.closing) return Promise.resolve();
    this.closing = true;
    const done = () => { this.closing = false; this.fanOpen.set(false); };
    const animations = flyTiles(this.fab().nativeElement, this.tiles().map((t) => t.nativeElement), false);
    if (!animations.length) { done(); return Promise.resolve(); }
    return Promise.all(animations.map((a) => a.finished)).then(done, done);
  }
  protected onEscape(): void {
    if (this.fanOpen() && !this.dialog().nativeElement.open) void this.closeFan();
  }

  /** A choice of the fan: the window grows out of it; a preset asks at once, the free one waits for the words. */
  protected pick(ask: Ask): void {
    this.reset();
    this.mode = ask;
    const d = this.dialog().nativeElement;
    openDialog(d);
    void this.closeFan();
    queueMicrotask(() => d.querySelector<HTMLElement>('#ai-title')?.focus({ preventScroll: true }));
    if (!this.ai.hasKey()) return;
    this.historyReady = this.loadHistory();                    // every answer waits for it, the free questions too
    if (ask !== 'free') this.say(ask === 'create' ? this.label('create') : aiQuestion(ask, this.i18n.lang()));
  }

  /** The words typed in the window's box. */
  protected write(): void {
    const text = this.draft().trim();
    if (!text || this.busy()) return;
    this.draft.set('');
    this.say(text);
  }

  protected retry(): void {
    if (this.busy() || !this.turns.length) return;
    void this.answer();
  }

  private say(text: string): void {
    this.turns = [...this.turns, { role: 'user', text }];
    this.shown.update((list) => [...list, { role: 'user', text, plan: null }]);
    void this.answer();
  }

  private async answer(): Promise<void> {
    const ticket = ++this.asked;
    this.failure.set(null);
    this.applyFailed.set(false);
    this.busy.set(true);
    this.scrollDown();
    try {
      await this.historyReady;
      if (ticket !== this.asked) return;                       // closed or asked again meanwhile
      const context = this.context();
      const lang = this.i18n.lang();
      const system = this.mode === 'create' ? aiCreateSystem(lang, context) : aiSystem(lang, context);
      const reply = await this.ai.send(system, this.turns);
      if (ticket !== this.asked) return;
      this.turns = [...this.turns, { role: 'assistant', text: reply }];
      const plan = this.mode === 'create' ? parsePlan(reply) : null;
      this.shown.update((list) => [...list, { role: 'assistant', text: plainReply(reply), plan }]);
    } catch (error) {
      if (ticket !== this.asked) return;
      this.failure.set(error instanceof AiError ? error.kind : 'other');
    } finally {
      if (ticket === this.asked) { this.busy.set(false); this.scrollDown(); }
    }
  }

  /** Aplicar: the plan goes into the Canvas (each level reused when it already exists) and is saved at once. */
  protected apply(plan: AiPlan): void {
    let ok = false;
    this.library.update((lib) => {
      const next = applyPlan(lib, plan, Date.now());
      ok = next.id !== null;
      return next.lib;
    });
    if (ok) this.applied.set(plan); else this.applyFailed.set(true);
    const commit = this.library.lastCommit;
    commit?.then((saved) => { if (!saved && this.applied() === plan) { this.applied.set(null); this.applyFailed.set(true); } });
  }

  /** What Claude reads: the person's own Canvas, week, today, last days, open tasks and place in the Go Epic year. */
  private context(): string {
    const now = this.week.now();
    const todayKey = this.week.todayKey();
    const year = yearFor(YEARS, todayKey);
    return aiContext({
      now, todayKey, today: this.week.today(), lang: this.i18n.lang(),
      library: this.library.library(), week: this.week.week(), status: (id) => this.week.status(id),
      habits: habits(this.week.week(), this.history, now, 14, HISTORY_DAYS),
      taskHabits: taskHabits(this.todos.todos(), now, 14, HISTORY_DAYS),
      todos: this.todos.todos(),
      place: placeOf(yearPlan(year.seasons, year.next), todayKey),
      sprintEpics: [...this.sprint.currentEpics()].flatMap((id) => this.library.library().nodes.find((n) => n.id === id)?.title ?? []),
      levelNames: ['[area]', '[epic]', '[feature]', '[story]', '[task]'].map((t) => this.i18n.levelsIn(t)),
    });
  }
  /** The last days' marks, read once from the server (the habits' days and streaks); after 3 s Claude goes on with what this device has. */
  private loadHistory(): Promise<void> {
    const now = this.week.now();
    const from = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (HISTORY_DAYS - 1)));
    return new Promise((resolve) => {
      let stop: (() => void) | null = null;
      let done = false;
      const finish = () => { if (done) return; done = true; stop?.(); resolve(); };
      setTimeout(finish, 3000);
      // the first snapshot may be this device's cache only: wait for the server's, unless offline (the 3 s keep the cache)
      stop = this.week.watchHistory(from, (byDate, fromCache) => {
        this.history = byDate;
        if (!fromCache || (typeof navigator !== 'undefined' && navigator.onLine === false)) finish();
      }, true);
      if (done) stop();
    });
  }

  private scrollDown(): void {
    afterNextRender(() => {
      const el = this.log().nativeElement;
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, { injector: this.injector });
  }

  protected toSettings(): void {
    void this.close().then(() => this.ui.settings.set(true));
  }
  protected close(): Promise<void> {
    return closeDialog(this.dialog().nativeElement);
  }
  protected onBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.dialog().nativeElement)) void this.close();
  }
  /** A closed window forgets its conversation (an answer still on its way is dropped). */
  protected reset(): void {
    this.asked++;
    this.turns = [];
    this.history = {};
    this.historyReady = Promise.resolve();
    this.shown.set([]);
    this.busy.set(false);
    this.failure.set(null);
    this.applied.set(null);
    this.applyFailed.set(false);
    this.draft.set('');
  }
}
