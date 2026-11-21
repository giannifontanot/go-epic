import { NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { DatesStore } from '../../core/dates.store';
import { closeDialog, isBackdropClick, openDialog } from '../../core/dialog';
import { I18n } from '../../core/i18n';
import { daysBetween } from '../../core/period.model';
import { dateKey } from '../../core/week.model';
import { WeekStore } from '../../core/week.store';
import { Quarter, Season, YEAR_2027, placeOf, yearPlan } from '../../core/year.model';
import { Ask } from '../../shared/ask';
import { PageMenu } from '../../shared/title-fan';
import { Undo } from '../../shared/undo';
import { Why } from '../../shared/why';

/**
 * The Year (Gianni): an informational screen, above all visual. 2027 as its 4 seasons, winter first, each a quarter
 * from the Monday nearest its solstice or equinox: 4 sprints of 3 weeks, one row each (3 weeks × 7 days, like Progress's
 * tracking grid), and a striped rest and review week. Today is ringed, past days fade, the day each season really begins
 * has a dot. Important dates live in Go Epic (DatesStore, users/{uid}/dates): a tap on any day names it, rewrites or
 * removes it; a named day carries a ★ and its name shows in the same window and in the list under the year.
 */
@Component({
  selector: 'app-year',
  imports: [NgTemplateOutlet, Why],
  template: `
    <section class="year-page">
      <header class="board-top year-top">
        <h1><button type="button" class="title-btn" aria-haspopup="true" aria-expanded="false" [title]="i18n.t('nav.pages')"
                    (click)="pageMenu.toggle($event.currentTarget)">{{ i18n.t('year.title', { year: year.year }) }}<span class="title-chev" aria-hidden="true">⌄</span></button></h1>
        <app-why screen="year" />
      </header>
      <p class="year-status">{{ status() }}</p>
      <!-- the year: its four seasons, each with its rows of 3 weeks of 7 days -->
      <div class="year-seasons">
        @for (q of plan; track q.season; let qi = $index) {
          <section class="season" [attr.data-season]="q.season" [style.--i]="qi" [attr.aria-labelledby]="'season-' + q.season">
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
                <h3 class="yr-label">{{ i18n.t('year.sprint', { n: sprint.n }) }} <span>{{ shortDate(sprint.weeks[0][0]) }}</span></h3>
                <div class="yr-weeks">
                  @for (week of sprint.weeks; track week[0]) {
                    <ol class="yr-week">
                      @for (date of week; track date) { <li><ng-container *ngTemplateOutlet="cell; context: { $implicit: date, q: q }" /></li> }
                    </ol>
                  }
                </div>
              </div>
            }
            @for (week of q.rest; track week[0]) {
              <div class="yr-row rest">
                <h3 class="yr-label">{{ i18n.t('year.rest') }} <span>{{ shortDate(week[0]) }}</span></h3>
                <div class="yr-weeks">
                  <ol class="yr-week">
                    @for (date of week; track date) { <li><ng-container *ngTemplateOutlet="cell; context: { $implicit: date, q: q }" /></li> }
                  </ol>
                  <span class="rest-mark" aria-hidden="true"></span>
                </div>
              </div>
            }
          </section>
        }
      </div>
      <ng-template #cell let-date let-q="q">
        @let name = dates.dates().get(date);
        <button type="button" class="yr-cell" [class.past]="date < today()" [class.today]="date === today()" [class.astro]="date === q.astro"
                [class.named]="!!name" [class.month-start]="date.endsWith('-01')" [class.deleting]="undo.isPending('date:' + date)"
                [attr.aria-label]="cellLabel(date, name)" [title]="cellLabel(date, name)" [attr.data-date]="date" (click)="openDay(date)">
          @if (name) { <span aria-hidden="true">★</span> }
        </button>
      </ng-template>
      <p class="muted year-legend">{{ i18n.t('year.legend') }}</p>
      <!-- the important dates of the year, in order: a tap opens the same window as the day -->
      <section class="year-dates" aria-labelledby="year-dates-title">
        <h2 id="year-dates-title">{{ i18n.t('year.dates') }}</h2>
        @if (named().length) {
          <ul>
            @for (d of named(); track d.date) {
              <li [attr.data-season]="d.season" [class.past]="d.date < today()" [class.deleting]="undo.isPending('date:' + d.date)">
                <button type="button" (click)="openDay(d.date)"><span class="yd-star" aria-hidden="true">★</span><span class="yd-name">{{ d.name }}</span><span class="yd-date">{{ longDate(d.date) }}</span></button>
              </li>
            }
          </ul>
        } @else {
          <p class="muted">{{ i18n.t('year.noDates') }}</p>
        }
      </section>
      <dialog #editor class="info-card year-date" [attr.aria-labelledby]="'yd-title'" (click)="onBackdrop($event)">
        @let key = editing();
        @if (key) {
          <form (submit)="$event.preventDefault(); save()">
            <div class="info-head">
              <h2 id="yd-title">{{ longDate(key) }}</h2>
              <button type="button" class="round" [attr.aria-label]="i18n.t('week.infoClose')" [title]="i18n.t('week.infoClose')" (click)="close()">✕</button>
            </div>
            <p class="info-when yd-place" [attr.data-season]="placeSeason(key)">{{ placeLabel(key) }}</p>
            <label class="field yd-field">
              <span>{{ i18n.t('year.name') }}</span>
              <input #nameBox type="text" maxlength="80" [value]="draft()" (input)="draft.set(nameBox.value)" [placeholder]="i18n.t('year.namePlaceholder')" enterkeyhint="done" />
            </label>
            <div class="ask-actions yd-foot">
              @if (dates.dates().has(key)) { <button type="button" class="ask-cancel yd-remove" (click)="remove()">{{ i18n.t('year.remove') }}</button> }
              <button type="button" class="ask-cancel" (click)="close()">{{ i18n.t('year.cancel') }}</button>
              <button type="submit" class="ask-ok">{{ i18n.t('year.save') }}</button>
            </div>
          </form>
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
  private readonly ask = inject(Ask);
  private readonly week = inject(WeekStore);
  private readonly injector = inject(Injector);
  protected readonly year = YEAR_2027;
  protected readonly plan: Quarter[] = yearPlan(YEAR_2027.seasons, YEAR_2027.next);
  private readonly first = this.plan[0].start;
  private readonly last = this.plan[this.plan.length - 1].end;
  private readonly total = daysBetween(this.first, this.last) + 1;
  protected readonly today = computed(() => dateKey(this.week.now()));

  /** One short line: how far away the year is, which day of it today is, or that it is over. */
  protected readonly status = computed(() => {
    const today = this.today();
    if (today < this.first) {
      const n = daysBetween(today, this.first);
      return n === 1 ? this.i18n.t('year.startsIn1') : this.i18n.t('year.startsIn', { n });
    }
    if (today > this.last) return this.i18n.t('year.over');
    const place = placeOf(this.plan, today);
    const day = this.i18n.t('year.dayOf', { n: daysBetween(this.first, today) + 1, total: this.total });
    return place ? `${day} · ${this.placeLabel(today)}` : day;
  });

  /** The year's important dates in order (only those inside it). */
  protected readonly named = computed(() => [...this.dates.dates()]
    .filter(([date]) => date >= this.first && date <= this.last)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, name]) => ({ date, name, season: placeOf(this.plan, date)?.season ?? null })));

  private readonly editor = viewChild.required<ElementRef<HTMLDialogElement>>('editor');
  protected readonly editing = signal<string | null>(null);
  protected readonly draft = signal('');

  constructor() {
    // opened during the year: today's row in the middle of the screen, at once (no motion)
    afterNextRender(() => {
      const cell = document.querySelector<HTMLElement>(`.yr-cell[data-date="${this.today()}"]`);
      cell?.closest('.yr-row')?.scrollIntoView({ block: 'center' });
    }, { injector: this.injector });
  }

  protected openDay(date: string): void {
    this.editing.set(date);
    this.draft.set(this.dates.dates().get(date) ?? '');
    const d = this.editor().nativeElement;
    if (!d.open) openDialog(d);
  }
  protected close(): void {
    void closeDialog(this.editor().nativeElement).then(() => this.editing.set(null));
  }
  protected onBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.editor().nativeElement)) this.close();
  }
  protected save(): void {
    const key = this.editing();
    if (key) this.dates.set(key, this.draft());
    this.close();
  }
  /** A second chance, as every delete (Undo): the question window counts down before the date goes. */
  protected async remove(): Promise<void> {
    const key = this.editing();
    const name = key ? this.dates.dates().get(key) : undefined;
    if (!key || !name) return;
    await closeDialog(this.editor().nativeElement);
    this.editing.set(null);
    await this.ask.ask({
      message: this.i18n.t('year.removeAsk', { name }),
      ok: this.i18n.t('year.remove'),
      danger: true,
      countdown: { message: this.i18n.t('year.removing', { name }), ids: ['date:' + key], commit: () => this.dates.remove(key) },
    });
  }

  protected placeSeason(key: string): Season | null {
    return placeOf(this.plan, key)?.season ?? null;
  }
  /** "Winter · Sprint 2, week 1", "Winter · Rest and review", or "Spring begins" added on that day. */
  protected placeLabel(key: string): string {
    const place = placeOf(this.plan, key);
    if (!place) return '';
    const season = this.i18n.t('year.' + place.season);
    const part = place.sprint === null ? this.i18n.t('year.rest') : `${this.i18n.t('year.sprint', { n: place.sprint })}, ${this.i18n.t('year.week', { n: place.week })}`;
    const astro = this.plan[place.quarter].astro === key ? ` · ${this.i18n.t('year.begins.' + place.season)}` : '';
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
