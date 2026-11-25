import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { I18n } from '../../core/i18n';
import { Library, LibNode, lifeAreaKey } from '../../core/library.model';
import { LibraryStore } from '../../core/library.store';
import { DayMarks } from '../../core/status.model';
import {
  ANSWER_MAX, QUESTIONS, Question, SprintRef, areaFull, chosenEpics, epicsByLifeArea, finishedByEpic, pastSprints, sprintDay, toggleEpic,
} from '../../core/sprint.model';
import { SprintStore } from '../../core/sprint.store';
import { dateKey } from '../../core/week.model';
import { WeekStore } from '../../core/week.store';
import { dayMonth } from '../../core/year.model';
import { PageMenu } from '../../shared/title-fan';
import { Why } from '../../shared/why';
import { NgTemplateOutlet } from '@angular/common';

/** How long after the last key an answer is saved (it is also saved when the box is left). */
const SAVE_AFTER_MS = 600;

/**
 * Planning and reflection (Gianni: «Planeación y reflexión», under Year in the pages menu). The sprint in focus on top
 * (the one today is in, else the next to come): its planning (the Epics it pushes, at most two per area; the Canvas
 * marks them) and its reflection (what was finished, by Epic, and four questions answered by hand, the last but one
 * what was left pending: part of the reflection, not Activities, Gianni). The sprints already ended below, newest first,
 * each opening softly. The Week board's «Plan the sprint» and «Review the sprint» cards open this page at that part
 * (`?sprint=<first day>&part=plan|review`).
 */
@Component({
  selector: 'app-sprint',
  imports: [NgTemplateOutlet, Why],
  template: `
    <section class="sprint-page">
      <header class="board-top sprint-top">
        <h1><button type="button" class="title-btn" aria-haspopup="true" aria-expanded="false" [title]="i18n.t('nav.pages')"
                    (click)="pageMenu.toggle($event.currentTarget)">{{ i18n.t('sprint.title') }}<span class="title-chev" aria-hidden="true"></span></button></h1>
        <app-why screen="sprint" />
      </header>
      @if (!ready()) {
        <p class="muted">{{ i18n.t('loading') }}</p>
      } @else {
        @if (store.error()) { <p class="error" role="alert">{{ store.error() }}</p> }
        @let now = focus();
        @if (now) {
          <article class="sprint-card now" [attr.data-season]="now.season" [attr.aria-labelledby]="'sp-' + now.key">
            <p class="eyebrow">{{ i18n.t(today() < now.from ? 'sprint.next' : 'sprint.current') }}</p>
            <ng-container [ngTemplateOutlet]="head" [ngTemplateOutletContext]="{ $implicit: now }" />
            <ng-container [ngTemplateOutlet]="body" [ngTemplateOutletContext]="{ $implicit: now, live: true }" />
          </article>
        }
        @if (past().length) {
          <h2 class="sprint-past-title">{{ i18n.t('sprint.past') }}</h2>
          <ul class="sprint-past">
            @for (s of past(); track s.key) {
              @let open = opened().has(s.key);
              <li class="sprint-card past" [attr.data-season]="s.season" [class.open]="open">
                <button type="button" class="sprint-fold" [attr.aria-expanded]="open" [attr.aria-controls]="'sb-' + s.key" (click)="toggle(s.key)">
                  <ng-container [ngTemplateOutlet]="head" [ngTemplateOutletContext]="{ $implicit: s }" />
                  <span class="fold-chev" aria-hidden="true">⌄</span>
                </button>
                <div class="sprint-fold-body" [id]="'sb-' + s.key" [attr.inert]="open ? null : ''">
                  <div class="sprint-fold-inner">
                    <ng-container [ngTemplateOutlet]="body" [ngTemplateOutletContext]="{ $implicit: s, live: false }" />
                  </div>
                </div>
              </li>
            }
          </ul>
        }
      }

      <ng-template #head let-s>
        <div class="sprint-head">
          <h2 [id]="'sp-' + s.key">{{ i18n.t('year.sprint', { n: s.n }) }} · {{ i18n.t('year.' + s.season) }}, {{ s.year }}</h2>
          <p class="sprint-range"><span>{{ range(s) }}</span>@if (dayLabel(s); as d) { <span class="tone-down"> · {{ d }}</span> }</p>
        </div>
      </ng-template>

      <ng-template #body let-s let-live="live">
        @let doc = store.get(s.key);
        @let chosen = chosenOf(s.key);
        <!-- Planning: the Epics this sprint pushes, two per area at most -->
        <section class="sprint-part" [id]="'plan-' + s.key" [attr.aria-labelledby]="'pl-' + s.key">
          <h3 [id]="'pl-' + s.key">{{ i18n.t('sprint.plan') }}</h3>
          @if (live) {
            <p class="muted sprint-hint">{{ i18n.t('sprint.planHint') }}</p>
            @for (g of areas(); track g.area.id) {
              @let full = isFull(s.key, g.area.id);
              <div class="sprint-area">
                <p class="sprint-area-name">{{ areaName(g.area) }}@if (areaDesc(g.area); as d) { <span class="area-desc"> {{ d }}</span> }</p>
                @if (g.epics.length) {
                  <div class="sprint-epics">
                    @for (e of g.epics; track e.id) {
                      @let on = chosen.includes(e.id);
                      <button type="button" class="sprint-epic" [class.on]="on" [attr.aria-pressed]="on" [disabled]="!on && full"
                              (click)="toggleEpic(s.key, e.id)">@if (on) { <span class="sprint-check" aria-hidden="true">✓</span> }{{ e.title }}</button>
                    }
                  </div>
                  @if (full) { <p class="muted sprint-full">{{ i18n.t('sprint.full') }}</p> }
                } @else {
                  <p class="muted sprint-none">{{ i18n.t('canvas.noEpicYet') }}</p>
                }
              </div>
            } @empty {
              <p class="muted">{{ i18n.t('sprint.noAreas') }}</p>
            }
          } @else {
            @if (chosen.length) {
              <div class="sprint-epics">
                @for (id of chosen; track id) { <span class="sprint-epic on static"><span class="sprint-check" aria-hidden="true">✓</span>{{ titleOf(id) }}</span> }
              </div>
            } @else {
              <p class="muted">{{ i18n.t('sprint.noPlan') }}</p>
            }
          }
        </section>

        <!-- Reflection: what was finished, by Epic, then four questions answered by hand -->
        <section class="sprint-part" [id]="'review-' + s.key" [attr.aria-labelledby]="'rv-' + s.key">
          <h3 [id]="'rv-' + s.key">{{ i18n.t('sprint.review') }}</h3>
          <h4 class="sprint-sub">{{ i18n.t('sprint.finished') }}</h4>
          @let done = finished(s, chosen);
          @if (done.length) {
            <ul class="sprint-done">
              @for (e of done; track e.epicId) {
                <li [class.chosen]="e.chosen">
                  <p class="sprint-done-epic">{{ e.title }}@if (e.chosen) { <span class="sprint-tag">{{ i18n.t('sprint.tag') }}</span> }</p>
                  <ul>
                    @for (a of e.activities; track a.id) {
                      <li><span class="sprint-check" aria-hidden="true">✓</span>{{ a.title }}@if (a.times > 1) { <span class="tone-down"> ×{{ a.times }}</span> }</li>
                    }
                  </ul>
                </li>
              }
            </ul>
          } @else {
            <p class="muted">{{ i18n.t(today() < s.from ? 'sprint.notYet' : 'sprint.nothingDone') }}</p>
          }
          @for (q of questions; track q) {
            <label class="field sprint-q">
              <span>{{ i18n.t('sprint.q.' + q) }}</span>
              <textarea rows="3" [attr.maxlength]="max" [value]="answer(s.key, q, doc[q])"
                        (input)="typed(s.key, q, $any($event.target).value)" (blur)="flush(s.key)"></textarea>
            </label>
          }
        </section>
      </ng-template>
    </section>
  `,
})
export class Sprint {
  protected readonly i18n = inject(I18n);
  protected readonly pageMenu = inject(PageMenu);
  protected readonly store = inject(SprintStore);
  private readonly week = inject(WeekStore);
  private readonly library = inject(LibraryStore);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);
  protected readonly questions = QUESTIONS;
  protected readonly max = ANSWER_MAX;

  protected readonly today = computed(() => dateKey(this.week.now()));
  protected readonly focus = computed(() => this.store.current());
  protected readonly past = computed(() => pastSprints(this.store.sprints, this.today(), this.store.saved(), this.focus()?.key ?? null));
  protected readonly ready = computed(() => this.store.ready() && this.library.ready() && this.week.loaded());
  protected readonly areas = computed(() => epicsByLifeArea(this.library.library()));
  protected readonly opened = signal<ReadonlySet<string>>(new Set());
  private readonly history = signal<Record<string, DayMarks>>({});
  /** What is being typed, so an echo of an older save never replaces newer keys (sprint key → question → text). */
  private readonly drafts = new Map<string, Partial<Record<Question, string>>>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  /** The first day to read the day documents from: the oldest sprint listed. */
  private readonly fromKey = computed(() => {
    const keys = [this.focus()?.from, ...this.past().map((s) => s.from)].filter((k): k is string => !!k).sort();
    return keys[0] ?? this.today();
  });

  constructor() {
    let stop: (() => void) | null = null;
    effect(() => {
      this.auth.user();
      const from = this.fromKey();
      untracked(() => {
        stop?.();
        stop = this.week.watchHistory(from, (byDate) => this.history.set(byDate));
      });
    });
    inject(DestroyRef).onDestroy(() => {
      stop?.();
      for (const key of [...this.timers.keys()]) this.flush(key);
    });
    // Opened from a Week card: that sprint opens at its part, scrolled into view once drawn.
    let jumped = false;
    effect(() => {
      if (!this.ready() || jumped) return;
      jumped = true;
      const params = this.route.snapshot.queryParamMap;
      const key = params.get('sprint');
      const part = params.get('part') === 'review' ? 'review' : 'plan';
      if (!key) return;
      if (key !== this.focus()?.key) untracked(() => this.opened.update((s) => new Set(s).add(key)));
      afterNextRender(() => {
        const el = (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>(`[id="${part}-${key}"]`);
        el?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }, { injector: this.injector });
    });
  }

  protected range(s: SprintRef): string {
    return `${dayMonth(s.from, this.i18n.lang())} - ${dayMonth(s.to, this.i18n.lang())}`;
  }
  /** Day n of 21 while it runs, when it begins before, nothing once over. */
  protected dayLabel(s: SprintRef): string {
    const today = this.today();
    if (today < s.from) return this.i18n.t('year.startsIn', { n: -sprintDay(s, today) + 1 });
    if (today > s.to) return this.i18n.t('sprint.over');
    return this.i18n.t('year.dayOf', { n: sprintDay(s, today), total: 21 });
  }
  protected areaName(area: LibNode): string { return this.areaParts(area)[0]; }
  protected areaDesc(area: LibNode): string { return this.areaParts(area)[1]; }
  private areaParts(area: LibNode): [string, string] {
    const key = lifeAreaKey(area.title);
    const text = key ? this.i18n.t('area.' + key) : area.title;
    const cut = text.indexOf(' - ');
    return cut < 0 ? [text, ''] : [text.slice(0, cut), text.slice(cut + 3)];
  }
  protected chosenOf(key: string): string[] {
    return chosenEpics(this.library.library(), this.store.get(key));
  }
  protected isFull(key: string, areaId: string): boolean {
    return areaFull(this.library.library(), this.store.get(key), areaId);
  }
  protected titleOf(id: string): string {
    return this.lib().nodes.find((n) => n.id === id)?.title ?? '';
  }
  private lib(): Library { return this.library.library(); }
  protected toggleEpic(key: string, epicId: string): void {
    const next = toggleEpic(this.lib(), this.withDrafts(key), epicId);
    if (next !== 'full') this.store.save(key, next);
  }
  protected finished(s: SprintRef, chosen: string[]) {
    return finishedByEpic(this.lib(), this.week.week(), this.history(), s, this.today(), chosen);
  }
  protected toggle(key: string): void {
    this.opened.update((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  protected answer(key: string, q: Question, saved: string): string {
    return this.drafts.get(key)?.[q] ?? saved;
  }
  protected typed(key: string, q: Question, value: string): void {
    this.drafts.set(key, { ...this.drafts.get(key), [q]: value });
    clearTimeout(this.timers.get(key));
    this.timers.set(key, setTimeout(() => this.flush(key), SAVE_AFTER_MS));
  }
  /**
   * Saves what was typed in a sprint's answers. The store shows the saved text at once, so the drafts go with the save:
   * only answers still waiting to be saved are drafts, and a change made on another device shows here and is never
   * written over by an old draft.
   */
  protected flush(key: string): void {
    clearTimeout(this.timers.get(key));
    if (!this.timers.delete(key)) return;
    this.store.save(key, this.withDrafts(key));
    this.drafts.delete(key);
  }
  private withDrafts(key: string) {
    return { ...this.store.get(key), ...this.drafts.get(key) };
  }
}
