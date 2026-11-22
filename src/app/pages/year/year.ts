import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { eventDates, importPlan } from '../../core/calendar-import';
import { DateNote, notesLabel } from '../../core/date-notes';
import { DatesStore } from '../../core/dates.store';
import { CalendarError, GoogleCalendar, GoogleCalendarService } from '../../core/google-calendar';
import { closeDialog, isBackdropClick, openDialog } from '../../core/dialog';
import { I18n } from '../../core/i18n';
import { daysBetween } from '../../core/period.model';
import { dateKey } from '../../core/week.model';
import { WeekStore } from '../../core/week.store';
import { GoEpicYear, Season, YEARS, cleanDateName, currentFirst, placeOf, sprintRangeLabel, yearFor, yearPlan } from '../../core/year.model';
import { Ask } from '../../shared/ask';
import { PageMenu } from '../../shared/title-fan';
import { Undo } from '../../shared/undo';
import { Why } from '../../shared/why';

/** how long a finger rests on a line before the day's window comes (sliding along it brings it at once) */
const HOLD_MS = 260;
/** the window's date fading out as the next one fades in */
const FADE_MS = 240;
function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The calendar imported last, offered first next time (this device only). */
const LAST_CALENDAR_KEY = 'go-epic-calendar-import';
function readLastCalendar(): string | null {
  try { return localStorage.getItem(LAST_CALENDAR_KEY); } catch { return null; }
}

/**
 * The Year (Gianni): an informational screen, above all visual. A Go Epic year (2026 or 2027) as its 4 seasons, the one we are in at the top (else winter first), each a quarter
 * from the Monday nearest its solstice or equinox: 4 sprints of 3 weeks, each one line of 21 small days, and a rest and
 * review week. Past days are grey, today has a green edge, the day each season really begins a red edge and a dot.
 * Important dates live in Go Epic (DatesStore, users/{uid}/dates): a finger held on a line (or sliding along it) opens a
 * small window above the day and moves it from day to day, never past the sprint; there the day gets its notes, as many
 * as it needs (Gianni: a birthday, the start of spring…), each renamed in place and removed with its ✕ (asked, then the
 * countdown). A day with notes has a red edge and its notes are listed under the year.
 * Optionally the dates of one Google calendar can be brought in (Import from Google Calendar, read only).
 */
@Component({
  selector: 'app-year',
  imports: [NgTemplateOutlet, Why],
  template: `
    <section class="year-page">
      <header class="board-top year-top">
        <h1><button type="button" class="title-btn" aria-haspopup="true" aria-expanded="false" [title]="i18n.t('nav.pages')"
                    (click)="pageMenu.toggle($event.currentTarget)">{{ i18n.t('year.title', { year: year().year }) }}<span class="title-chev" aria-hidden="true">⌄</span></button></h1>
        <app-why screen="year" />
      </header>
      <!-- the years offered (Gianni): 2026, still being lived, and 2027 -->
      <div class="year-pick" role="group" [attr.aria-label]="i18n.t('year.pick')">
        @for (y of years; track y.year) {
          <button type="button" [attr.aria-pressed]="y.year === year().year" (click)="pickYear(y)">{{ y.year }}</button>
        }
      </div>
      <p class="year-status">{{ status() }}</p>
      <!-- the year: its four seasons, each with its rows of 3 weeks of 7 days -->
      <div class="year-seasons">
        @for (q of order(); track q.season; let qi = $index) {
          <section class="season" [class.past]="q.end < today()" [attr.data-season]="q.season" [style.--i]="qi" [attr.aria-labelledby]="'season-' + q.season">
            <header class="season-head">
              <span class="season-ico" aria-hidden="true">
                @switch (q.season) {
                  @case ('winter') { <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/></svg> }
                  @case ('spring') { <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-9"/><path d="M12 12C12 7.5 8.5 5 4.5 5c0 4.5 3 7 7.5 7z"/><path d="M12 14c0-4 3-6.5 7.5-6.5 0 4-3 6.5-7.5 6.5z"/></svg> }
                  @case ('summer') { <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg> }
                  @default { <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-4"/><path d="M12 17 5 12l2.5-1L5 6.5l3.5.5L9 4l3 3 3-3 .5 3 3.5-.5-2.5 4.5 2.5 1z"/></svg> }
                }
              </span>
              <h2 [id]="'season-' + q.season">{{ i18n.t('year.' + q.season) }}</h2>
              <span class="season-range">{{ shortDate(q.start) }} – {{ shortDate(q.end) }}</span>
            </header>
            @for (sprint of q.sprints; track sprint.n) {
              <div class="yr-row">
                <!-- its name, then its range in a lighter tone of the same ink, both in straight columns (Gianni) -->
                <h3 class="yr-label"><span class="yr-name">{{ i18n.t('year.sprint', { n: sprint.n }) }}</span><span class="yr-range">{{ sprintRangeLabel(sprint, i18n.lang()) }}</span></h3>
                <!-- the sprint's 21 days on one line: touch a day and slide along it, the window follows (never past the sprint) -->
                <ol class="yr-line" (pointerdown)="press($event)" (pointermove)="drag($event)" (pointerup)="lift($event)"
                    (pointercancel)="drop($event)" (touchmove)="holdScroll($event)" (contextmenu)="$event.preventDefault()">
                  @for (week of sprint.weeks; track week[0]; let wi = $index) {
                    @for (date of week; track date; let di = $index) {
                      <li [style.grid-column]="wi * 8 + di + 1"><ng-container *ngTemplateOutlet="cell; context: { $implicit: date }" /></li>
                    }
                  }
                </ol>
              </div>
            }
            @for (week of q.rest; track week[0]) {
              <div class="yr-row rest">
                <h3 class="yr-label"><span class="yr-name">{{ i18n.t('year.rest') }}</span></h3>
                <ol class="yr-line" (pointerdown)="press($event)" (pointermove)="drag($event)" (pointerup)="lift($event)"
                    (pointercancel)="drop($event)" (touchmove)="holdScroll($event)" (contextmenu)="$event.preventDefault()">
                  @for (date of week; track date; let di = $index) {
                    <li [style.grid-column]="di + 1"><ng-container *ngTemplateOutlet="cell; context: { $implicit: date }" /></li>
                  }
                  <li class="rest-mark" aria-hidden="true"></li>
                </ol>
              </div>
            }
          </section>
        }
      </div>
      <ng-template #cell let-date>
        @let name = notesLabel(dates.notes().get(date));
        <button type="button" class="yr-cell" [class.past]="date < today()" [class.today]="date === today()" [class.astro]="astroDays().has(date)"
                [class.named]="!!name" [class.picked]="date === editing()" [class.deleting]="undo.isPending('date:' + date)"
                [attr.aria-label]="cellLabel(date, name)" [title]="cellLabel(date, name)" [attr.data-date]="date"
                (click)="cellClick($event, date)" (keydown)="cellKey($event)"><span class="yr-num" aria-hidden="true">{{ +date.slice(8) }}</span></button>
      </ng-template>
      <p class="muted year-legend">{{ i18n.t('year.legend') }}</p>
      <!-- the important dates of the year, in order: a tap opens the same window as the day -->
      <section class="year-dates" aria-labelledby="year-dates-title">
        <div class="year-dates-head">
          <h2 id="year-dates-title">{{ i18n.t('year.dates') }}</h2>
          <!-- optional (Gianni): bring the dates of one of your Google calendars -->
          <button type="button" class="chip quiet gcal-btn" (click)="openImport()">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>
            {{ i18n.t('gcal.button') }}
          </button>
        </div>
        @if (named().length) {
          <ul>
            @for (d of named(); track d.id) {
              <li [attr.data-season]="d.season" [class.past]="d.date < today()" [class.deleting]="undo.isPending('note:' + d.id)">
                <button type="button" (click)="openFromList(d.date)"><span class="yd-star" aria-hidden="true">★</span><span class="yd-name">{{ d.name }}@if (d.imported) { <span class="yd-tag">Google</span> }</span><span class="yd-date">{{ longDate(d.date) }}</span></button>
              </li>
            }
          </ul>
        } @else {
          <p class="muted">{{ i18n.t('year.noDates') }}</p>
        }
      </section>
      <!-- the day's small window, above the day touched (top layer, not modal: the finger keeps sliding the line) -->
      <div #pop popover="manual" class="yr-pop pop-window" [class.on]="!!editing()" role="dialog" aria-labelledby="yd-title"
           [attr.data-season]="editing() ? placeSeason(editing()!) : null">
        @let key = editing();
        @if (key) {
          <form (submit)="$event.preventDefault(); addNote()">
            <div class="yrp-head">
              <div class="yrp-faces">
                @for (f of faces(); track f.id) {
                  <div class="yrp-face" [class.out]="f.out" [attr.aria-hidden]="f.out ? 'true' : null">
                    <h2 [attr.id]="f.out ? null : 'yd-title'" tabindex="-1">{{ longDate(f.key) }}</h2>
                    <p class="info-when yd-place" [attr.data-season]="placeSeason(f.key)">{{ placeLabel(f.key) }}</p>
                  </div>
                }
              </div>
              <button type="button" class="round" [attr.aria-label]="i18n.t('week.infoClose')" [title]="i18n.t('week.infoClose')" (click)="close()">✕</button>
            </div>
            <!-- the day's notes (Gianni: as many as it needs): a tap on one renames it in place, its ✕ removes it after the countdown -->
            @let list = dates.notes().get(key) ?? [];
            @if (list.length) {
              <ul class="yd-notes" [attr.aria-label]="i18n.t('year.notes')">
                @for (n of list; track n.id) {
                  <li [class.deleting]="undo.isPending('note:' + n.id)">
                    @if (renaming() === n.id) {
                      <input #ren class="yd-rename" type="text" maxlength="80" [value]="n.name" enterkeyhint="done" [attr.aria-label]="i18n.t('year.editNote', { name: n.name })"
                             (keydown.enter)="$event.preventDefault(); finishRename(key, n, ren.value)" (keydown.escape)="$event.stopPropagation(); renaming.set(null)"
                             (blur)="finishRename(key, n, ren.value)" />
                    } @else {
                      <button type="button" class="yd-note" [attr.aria-label]="i18n.t('year.editNote', { name: n.name })" (click)="startRename(n.id)">
                        <span class="yd-star" aria-hidden="true">★</span><span class="yd-note-name">{{ n.name }}@if (n.calendar) { <span class="yd-tag">Google</span> }</span></button>
                    }
                    <button type="button" class="round danger-x yd-x" [attr.aria-label]="i18n.t('year.removeNote', { name: n.name })" [title]="i18n.t('year.removeNote', { name: n.name })"
                            (click)="removeNote(key, n)">✕</button>
                  </li>
                }
              </ul>
            }
            <div class="ask-actions yd-add">
              <input #nameBox type="text" maxlength="80" [value]="draft()" (input)="draft.set(nameBox.value)" [placeholder]="i18n.t('year.notePlaceholder')"
                     [attr.aria-label]="i18n.t('year.noteNew')" enterkeyhint="done" />
              <button type="submit" class="ask-ok yd-add-btn" [disabled]="!canAdd()">{{ i18n.t('year.add') }}</button>
            </div>
          </form>
        }
      </div>
      <dialog #importer class="info-card year-import" aria-labelledby="gcal-title" (click)="onImportBackdrop($event)">
        <div class="info-head">
          <h2 id="gcal-title">{{ i18n.t('gcal.title') }}</h2>
          <button type="button" class="round" [attr.aria-label]="i18n.t('week.infoClose')" [title]="i18n.t('week.infoClose')" (click)="closeImport()">✕</button>
        </div>
        @switch (step()) {
          @case ('start') {
            <p>{{ i18n.t('gcal.intro', { year: year().year }) }}</p>
            <p class="muted gcal-small">{{ i18n.t('gcal.warning') }}</p>
            @if (problem()) { <p class="gcal-problem" role="alert">{{ i18n.t('gcal.problem.' + problem()) }}</p> }
            <div class="ask-actions"><button type="button" class="ask-cancel" (click)="closeImport()">{{ i18n.t('year.cancel') }}</button>
              <button type="button" class="ask-ok" [disabled]="busy()" (click)="connect()">{{ i18n.t(busy() ? 'gcal.connecting' : 'gcal.connect') }}</button></div>
          }
          @case ('pick') {
            <fieldset class="gcal-list">
              <legend>{{ i18n.t('gcal.pick') }}</legend>
              @for (c of calendars(); track c.id) {
                <label class="gcal-cal"><input type="radio" name="gcal" [value]="c.id" [checked]="c.id === chosen()" (change)="chosen.set(c.id)" />
                  <span class="gcal-dot" [style.background]="c.color" aria-hidden="true"></span><span>{{ c.name }}</span></label>
              } @empty { <p class="muted">{{ i18n.t('gcal.noCalendars') }}</p> }
            </fieldset>
            <p class="muted gcal-small">{{ i18n.t('gcal.rules') }}</p>
            @if (problem()) { <p class="gcal-problem" role="alert">{{ i18n.t('gcal.problem.' + problem()) }}</p> }
            <div class="ask-actions"><button type="button" class="ask-cancel" (click)="closeImport()">{{ i18n.t('year.cancel') }}</button>
              <button type="button" class="ask-ok" [disabled]="busy() || !chosen() || !dates.ready()" (click)="runImport()">{{ i18n.t(busy() ? 'gcal.importing' : 'gcal.import') }}</button></div>
          }
          @case ('done') {
            <p class="gcal-result">{{ result() }}</p>
            <div class="ask-actions"><button type="button" class="ask-ok" (click)="closeImport()">{{ i18n.t('ask.ok') }}</button></div>
          }
        }
      </dialog>
    </section>
  `,
})
export class Year {
  protected readonly i18n = inject(I18n);
  protected readonly pageMenu = inject(PageMenu);
  protected readonly dates = inject(DatesStore);
  protected readonly undo = inject(Undo);
  protected readonly sprintRangeLabel = sprintRangeLabel;
  protected readonly notesLabel = notesLabel;
  private readonly ask = inject(Ask);
  private readonly week = inject(WeekStore);
  private readonly injector = inject(Injector);
  protected readonly today = computed(() => dateKey(this.week.now()));
  /** the years offered (2026, still being lived, and 2027); it opens on the one today falls in */
  protected readonly years = YEARS;
  protected readonly year = signal<GoEpicYear>(yearFor(YEARS, dateKey(this.week.now())));
  protected readonly plan = computed(() => yearPlan(this.year().seasons, this.year().next));
  /** the seasons as shown (Gianni): the one we are in at the top, the others after it in their order */
  protected readonly order = computed(() => currentFirst(this.plan(), this.today()));
  /** the days the seasons really begin, wherever their quarter's Monday falls (Mar 20 2027 lies in winter's rest week) */
  protected readonly astroDays = computed(() => new Map(this.plan().map((q) => [q.astro, q.season])));
  private get first(): string { return this.plan()[0].start; }
  private get last(): string { const plan = this.plan(); return plan[plan.length - 1].end; }
  private get total(): number { return daysBetween(this.first, this.last) + 1; }

  /** One short line: how far away the year is, which day of it today is, or that it is over. */
  protected readonly status = computed(() => {
    const today = this.today();
    if (today < this.first) {
      const n = daysBetween(today, this.first);
      return n === 1 ? this.i18n.t('year.startsIn1') : this.i18n.t('year.startsIn', { n });
    }
    if (today > this.last) return this.i18n.t('year.over');
    const place = placeOf(this.plan(), today);
    const day = this.i18n.t('year.dayOf', { n: daysBetween(this.first, today) + 1, total: this.total });
    return place ? `${day} · ${this.placeLabel(today)}` : day;
  });

  /** The year's important dates in order (only those inside it). */
  /** The year's important dates in order (only those inside it), one row for each note of a day. */
  protected readonly named = computed(() => [...this.dates.notes()]
    .filter(([date]) => date >= this.first && date <= this.last)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([date, notes]) => notes.map((n) => ({ id: n.id, date, name: n.name, season: placeOf(this.plan(), date)?.season ?? null, imported: !!n.calendar }))));

  private readonly popRef = viewChild.required<ElementRef<HTMLElement>>('pop');
  /** the day the small window shows, null while it is closed */
  protected readonly editing = signal<string | null>(null);
  /** the new note being typed (it is added with Add or Enter, and the box is free for the next one) */
  protected readonly draft = signal('');
  protected readonly canAdd = computed(() => !!cleanDateName(this.draft()));
  /** the note being renamed in place, null while none is */
  protected readonly renaming = signal<string | null>(null);
  /** the window's date as it changes while sliding: the old one fades out as the new one fades in (Gianni) */
  protected readonly faces = signal<{ id: number; key: string; out: boolean }[]>([]);
  private faceId = 0;
  /** the finger (or mouse) on a sprint's line: it opens the window after a short hold, or at once when it slides along */
  private touch: { id: number; line: HTMLElement; x0: number; y0: number; live: boolean; timer: number } | null = null;
  private closing: Promise<void> | null = null;
  /** the window is drawn and in place (false from the start of its closing) */
  private shown = false;
  private placing = 0;
  private readonly destroyRef = inject(DestroyRef);

  // Importing from Google Calendar (optional): connect (a Google pop-up, read only), pick one calendar, import.
  private readonly gcal = inject(GoogleCalendarService);
  private readonly importer = viewChild.required<ElementRef<HTMLDialogElement>>('importer');
  protected readonly step = signal<'start' | 'pick' | 'done'>('start');
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly calendars = signal<GoogleCalendar[]>([]);
  protected readonly chosen = signal<string | null>(null);
  protected readonly result = signal('');

  protected openImport(): void {
    this.step.set('start');
    this.problem.set(null);
    const d = this.importer().nativeElement;
    if (!d.open) openDialog(d);
  }
  protected closeImport(): void {
    void closeDialog(this.importer().nativeElement);
  }
  protected onImportBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.importer().nativeElement)) this.closeImport();
  }
  private fail(error: unknown): void {
    const problem = error instanceof CalendarError ? error.problem : 'failed';
    if (problem === 'expired' || problem === 'denied') this.step.set('start');
    this.problem.set(problem === 'cancelled' ? null : problem);
  }
  protected async connect(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.problem.set(null);
    try {
      await this.gcal.connect();
      const list = await this.gcal.calendars();
      this.calendars.set(list);
      const last = readLastCalendar();
      this.chosen.set(list.find((c) => c.id === last)?.id ?? list[0]?.id ?? null);
      this.step.set('pick');
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy.set(false);
    }
  }
  protected async runImport(): Promise<void> {
    const calendar = this.chosen();
    if (!calendar || this.busy()) return;
    // the year's bounds when the import starts: another year picked meanwhile must not change which days it covers
    const first = this.first;
    const last = this.last;
    this.busy.set(true);
    this.problem.set(null);
    try {
      // the days already kept must be known first, or an import could overwrite a day named by hand
      if (!this.dates.ready()) throw new CalendarError('loading');
      const events = await this.gcal.events(calendar, first, last);
      if (!this.dates.ready()) throw new CalendarError('loading');
      const plan = importPlan(this.dates.notes(), eventDates(events, first, last), calendar, first, last);
      this.dates.applyImport(plan.write, plan.remove);
      try { localStorage.setItem(LAST_CALENDAR_KEY, calendar); } catch { /* a convenience only */ }
      const parts = [this.i18n.t('gcal.added', { n: plan.added })];
      if (plan.dropped) parts.push(this.i18n.t('gcal.removed', { n: plan.dropped }));
      if (plan.skipped) parts.push(this.i18n.t('gcal.kept', { n: plan.skipped }));
      this.result.set(parts.join(' '));
      this.step.set('done');
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy.set(false);
    }
  }

  constructor() {
    // opened during the year: today's row in the middle of the screen, at once (no motion)
    afterNextRender(() => {
      const cell = document.querySelector<HTMLElement>(`.yr-cell[data-date="${this.today()}"]`);
      cell?.closest('.yr-row')?.scrollIntoView({ block: 'center' });
    }, { injector: this.injector });
    this.destroyRef.onDestroy(() => { this.listen(false); this.endTouch(); cancelAnimationFrame(this.placing); });
  }

  /** Shows another year: the day's window closes, and its line of today (else its top) comes into view. */
  protected pickYear(y: GoEpicYear): void {
    if (y.year === this.year().year) return;
    void this.close();
    this.year.set(y);
    afterNextRender(() => {
      const cell = this.cellOf(this.today());
      if (cell) cell.closest('.yr-row')?.scrollIntoView({ block: 'center' });
      else document.querySelector('.year-seasons')?.scrollIntoView({ block: 'start' });
    }, { injector: this.injector });
  }

  // ---- the day's window: touch a day, slide along the sprint, name it --------------------------------------------

  /** A finger, pen or mouse goes down on a sprint's line. */
  protected press(event: PointerEvent): void {
    if (this.touch || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const line = event.currentTarget as HTMLElement;
    const touch = { id: event.pointerId, line, x0: event.clientX, y0: event.clientY, live: false, timer: 0 };
    this.touch = touch;
    if (event.pointerType === 'mouse') { event.preventDefault(); this.goLive(touch, event.clientX); return; }
    // a finger holds a moment before the window comes, so a scroll that starts on a line stays a scroll
    touch.timer = window.setTimeout(() => { if (this.touch === touch) { this.goLive(touch, touch.x0); this.buzz(); } }, HOLD_MS);
  }
  protected drag(event: PointerEvent): void {
    const touch = this.touch;
    if (!touch || event.pointerId !== touch.id) return;
    if (!touch.live) {
      const dx = Math.abs(event.clientX - touch.x0);
      const dy = Math.abs(event.clientY - touch.y0);
      if (dy > 10 && dy > dx) { this.endTouch(); return; }   // scrolling the page
      if (dx > 8) this.goLive(touch, event.clientX);           // sliding along the line: the window comes at once
      return;
    }
    this.pickAt(touch.line, event.clientX);
  }
  protected lift(event: PointerEvent): void {
    const touch = this.touch;
    if (!touch || event.pointerId !== touch.id) return;
    if (!touch.live) this.pickAt(touch.line, event.clientX);   // a plain tap opens the day too
    this.endTouch();
  }
  protected drop(event: PointerEvent): void {
    if (this.touch?.id === event.pointerId) this.endTouch();
  }
  /** Once the window follows the finger, the page does not scroll under it. */
  protected holdScroll(event: TouchEvent): void {
    if (this.touch?.live && event.cancelable) event.preventDefault();
  }
  private goLive(touch: NonNullable<Year['touch']>, x: number): void {
    clearTimeout(touch.timer);
    touch.live = true;
    try { touch.line.setPointerCapture(touch.id); } catch { /* the pointer may be gone already */ }
    this.pickAt(touch.line, x);
  }
  private endTouch(): void {
    if (this.touch) clearTimeout(this.touch.timer);
    this.touch = null;
  }
  private buzz(): void {
    try { navigator.vibrate?.(8); } catch { /* not every phone */ }
  }
  /** The day of this line nearest to x (the first or the last past its ends: sliding stops at the sprint). */
  private pickAt(line: HTMLElement, x: number): void {
    const cells = [...line.querySelectorAll<HTMLElement>('.yr-cell[data-date]')];
    let best: HTMLElement | null = null;
    let gap = Infinity;
    for (const cell of cells) {
      const r = cell.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - x);
      if (d < gap) { gap = d; best = cell; }
    }
    const date = best?.dataset['date'];
    if (!date) return;
    if (date !== this.editing() && this.editing()) this.buzz();
    this.show(date);
  }

  /** Keyboard (Enter, Space): the same window; a pointer's click was already handled by the line. */
  protected cellClick(event: MouseEvent, date: string): void {
    if (event.detail !== 0) return;
    this.show(date);
    afterNextRender(() => this.popRef().nativeElement.querySelector<HTMLElement>('#yd-title')?.focus(), { injector: this.injector });
  }
  /** ← → move along the sprint's line (and the window with them, when it is open). */
  protected cellKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const cell = event.currentTarget as HTMLElement;
    const cells = [...(cell.closest('.yr-line')?.querySelectorAll<HTMLElement>('.yr-cell') ?? [])];
    const next = cells[cells.indexOf(cell) + (event.key === 'ArrowRight' ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    next.focus();
    if (this.editing() && next.dataset['date']) this.show(next.dataset['date']);
  }
  /** A date of the list: its line comes to the middle of the screen and the window opens on it. */
  protected openFromList(date: string): void {
    const cell = this.cellOf(date);
    cell?.closest('.yr-row')?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    this.show(date);
  }

  private cellOf(date: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(`.yr-cell[data-date="${date}"]`);
  }

  /** Opens the window on a day, or moves it there: its date fades out and the new one fades in. */
  private show(date: string): void {
    const was = this.editing();
    const wasClosing = !!this.closing;
    if (was === date && !wasClosing) return;
    this.closing = null;
    this.editing.set(date);
    this.draft.set('');
    this.renaming.set(null);
    const id = ++this.faceId;
    this.faces.update((list) => [...list.filter((f) => !f.out).map((f) => ({ ...f, out: true })), { id, key: date, out: false }]);
    setTimeout(() => this.faces.update((list) => list.filter((f) => !f.out || f.id > id)), FADE_MS);
    const pop = this.popRef().nativeElement;
    if (wasClosing) this.shown = false;
    afterNextRender(() => {
      if (this.editing() !== date) return;
      // decided here, not when the day was picked: a quick slide can pick several days before the first render
      if (!this.shown) {
        this.shown = true;
        pop.getAnimations().forEach((a) => a.cancel());
        pop.classList.add('still');
        if (!pop.matches(':popover-open')) try { pop.showPopover(); } catch { /* no popover: drawn fixed anyway */ }
        this.place();
        this.listen();
        void pop.offsetWidth;
        pop.classList.remove('still');
        if (!reducedMotion() && typeof pop.animate === 'function') {
          pop.animate([{ opacity: 0, scale: '.86', translate: '0 10px' }, { opacity: 1, scale: '1', translate: '0 0' }],
            { duration: 240, easing: 'cubic-bezier(0, 0, .6, 1)' });
        }
      } else {
        this.place();
      }
    }, { injector: this.injector });
  }

  /** Above the day (below it when there is no room), inside the visible screen, the keyboard included. */
  private place(): void {
    const key = this.editing();
    const pop = this.popRef().nativeElement;
    const cell = key ? this.cellOf(key) : null;
    if (!cell) return;
    const r = cell.getBoundingClientRect();
    const vv = window.visualViewport;
    const top0 = vv?.offsetTop ?? 0;
    const height = vv?.height ?? window.innerHeight;
    const width = document.documentElement.clientWidth;
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const cx = r.left + r.width / 2;
    const left = Math.min(Math.max(8, cx - w / 2), Math.max(8, width - w - 8));
    let top = r.top - h - 16;
    let side = 'above';
    if (top < top0 + 8) { top = r.bottom + 16; side = 'below'; }
    top = Math.max(top0 + 8, Math.min(top, top0 + height - h - 8));
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.style.setProperty('--tail-x', `${Math.min(Math.max(22, cx - left), w - 22)}px`);
    pop.dataset['side'] = side;
  }
  private schedulePlace = (): void => {
    if (this.placing) return;
    this.placing = requestAnimationFrame(() => { this.placing = 0; this.place(); });
  };
  /** A tap outside the window and the lines, or Esc, closes it; scrolling and the keyboard move it. */
  private outside = (event: PointerEvent): void => {
    const target = event.target as Element | null;
    if (target?.closest('.yr-pop, .yr-line, dialog.ask-window')) return;   // the question of a note's ✕ leaves the window open
    this.close();
  };
  private escape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.editing() || document.querySelector('dialog.ask-window[open]')) return;   // Esc there answers the question
    event.preventDefault();
    this.close();
  };
  private listening = false;
  private listen(on = true): void {
    if (on === this.listening) return;
    this.listening = on;
    const method = on ? 'addEventListener' : 'removeEventListener';
    document[method]('pointerdown', this.outside as EventListener, true);
    document[method]('keydown', this.escape as EventListener);
    window[method]('scroll', this.schedulePlace, true);
    window[method]('resize', this.schedulePlace);
    window.visualViewport?.[method]('resize', this.schedulePlace);
    window.visualViewport?.[method]('scroll', this.schedulePlace);
    // a note added or removed makes the window taller or shorter: it keeps its tail on the day
    if (on && typeof ResizeObserver === 'function') (this.resizing ??= new ResizeObserver(this.schedulePlace)).observe(this.popRef().nativeElement);
    if (!on) this.resizing?.disconnect();
  }
  private resizing: ResizeObserver | null = null;

  protected close(): Promise<void> {
    if (!this.editing()) return Promise.resolve();
    if (this.closing) return this.closing;
    const pop = this.popRef().nativeElement;
    const key = this.editing();
    this.shown = false;
    const done = () => {
      if (this.closing !== run || this.editing() !== key) return;
      this.closing = null;
      this.listen(false);
      try { if (pop.matches(':popover-open')) pop.hidePopover(); } catch { /* no popover */ }
      this.editing.set(null);
      this.renaming.set(null);
      this.faces.set([]);
    };
    const back = pop.contains(document.activeElement) ? this.cellOf(key!) : null;
    back?.focus({ preventScroll: true });
    const run: Promise<void> = reducedMotion() || typeof pop.animate !== 'function'
      ? Promise.resolve().then(done)
      : pop.animate([{ opacity: 1, scale: '1', translate: '0 0' }, { opacity: 0, scale: '.86', translate: '0 10px' }],
          { duration: 200, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' }).finished.then(done, done)
        .then(() => pop.getAnimations().forEach((a) => a.cancel()));
    this.closing = run;
    return run;
  }
  /** Add (or Enter): the note joins the day's list and the box is free for the next one (Gianni: the list grows). */
  protected addNote(): void {
    const key = this.editing();
    if (!key || !cleanDateName(this.draft())) return;
    this.dates.add(key, this.draft());
    this.draft.set('');
  }
  /** A tap on a note: it turns into a box with its text, for renaming in place (the keyboard comes since it was tapped). */
  protected startRename(id: string): void {
    this.renaming.set(id);
    afterNextRender(() => {
      const box = this.popRef().nativeElement.querySelector<HTMLInputElement>('.yd-rename');
      box?.focus();
      box?.select();
    }, { injector: this.injector });
  }
  /** Enter or leaving the box keeps the new name; a name left blank goes through the ✕ (its question and countdown). */
  protected finishRename(key: string, note: DateNote, value: string): void {
    if (this.renaming() !== note.id) return;
    this.renaming.set(null);
    if (!cleanDateName(value)) { void this.removeNote(key, note); return; }
    this.dates.rename(key, note.id, value);
  }
  /** A note's ✕: a second chance, as every delete in the app (Undo): the question window counts down before it goes. */
  protected async removeNote(key: string, note: DateNote): Promise<void> {
    const list = this.dates.notes().get(key) ?? [];
    if (!list.some((n) => n.id === note.id)) return;
    await this.ask.ask({
      message: this.i18n.t('year.removeAsk', { name: note.name }),
      ok: this.i18n.t('year.remove'),
      danger: true,
      countdown: {
        message: this.i18n.t('year.removing', { name: note.name }),
        // the day's square dims too when this is its last note (its red edge goes with it)
        ids: list.length === 1 ? ['note:' + note.id, 'date:' + key] : ['note:' + note.id],
        commit: () => this.dates.remove(key, note.id),
      },
    });
  }

  protected placeSeason(key: string): Season | null {
    return placeOf(this.plan(), key)?.season ?? null;
  }
  /** "Winter · Sprint 2, week 1", "Winter · Rest and review", or "Spring begins" added on that day. */
  protected placeLabel(key: string): string {
    const place = placeOf(this.plan(), key);
    if (!place) return '';
    const season = this.i18n.t('year.' + place.season);
    const part = place.sprint === null ? this.i18n.t('year.rest') : `${this.i18n.t('year.sprint', { n: place.sprint })}, ${this.i18n.t('year.week', { n: place.week })}`;
    const begins = this.astroDays().get(key);
    const astro = begins ? ` · ${this.i18n.t('year.begins.' + begins)}` : '';
    return `${season} · ${part}${astro}`;
  }
  protected cellLabel(date: string, name: string | undefined): string {
    const label = this.i18n.t('year.dayLabel', { date: this.longDate(date), place: this.placeLabel(date) });
    return name ? `${label} · ★ ${name}` : label;
  }
  private dateOf(key: string): Date {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  protected shortDate(key: string): string {
    return this.dateOf(key).toLocaleDateString(this.i18n.lang(), { day: 'numeric', month: 'short' });
  }
  protected longDate(key: string): string {
    return this.dateOf(key).toLocaleDateString(this.i18n.lang(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
}
