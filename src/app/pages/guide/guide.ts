import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { readGuideCard, writeGuideCard } from '../../core/guide-card';
import { I18n, inLang } from '../../core/i18n';
import { LEVEL_SETS } from '../../core/levels.model';
import { SwipeTracker, stepDay } from '../../core/swipe';
import { DARK_THEMES, LIGHT_THEMES, THEME_BAR, Theme, ThemeService } from '../../core/theme';
import { PageMenu } from '../../shared/title-fan';

/**
 * The cards, in the order a new user sets Go Epic up (Gianni: what comes first, what to make sure of, what to watch),
 * rewritten in v77 to match the app as it is: the round menu, the minutes a card shows, the focus on what runs now and
 * Letreros. Every level name on them is a Letreros token, so the cards follow the set the user chose.
 */
export const GUIDE_SLIDES = ['welcome', 'menu', 'areas', 'epics', 'levels', 'undefined', 'plan', 'week', 'size', 'today', 'focus',
  'capture', 'progress', 'year', 'delete', 'themes', 'labels'] as const;
export type GuideSlide = (typeof GUIDE_SLIDES)[number];

/** Each theme's accent, for the little theme tiles drawn on the last card (its `--pink` in styles.css). */
const THEME_ACCENT: Record<Theme, string> = {
  epic: '#f4a8b7', pinkpop: '#b04a73', petalpunk: '#e39bbf', squeezeme: '#3d68b0', sunburnt: '#b5652a',
  smokedcitrus: '#fb923c', office: '#9aa2ab', graphite: '#59616b', goepiclight: '#1d1d1f', goepicdark: '#e2b84a',
};

/**
 * «Instrucciones de uso» / How to use (Gianni): for anyone new to Go Epic, a carousel, not a long page: each card one
 * short explanation and a drawing of the real screen. The drawings are inline SVG painted with the theme's own tokens,
 * so they wear whatever theme the user has on (Gianni: never the Epic look on purpose); the Year's keep its fixed
 * colours, as the Year screen does. Arrows, a sideways swipe or ← → step through it, stopping at the first and the
 * last card; the new card slides in from its side (nothing under reduced motion). It opens, still, on the card you were
 * last on, remembered on this device (`go-epic-instructions-card`, Gianni); nothing else is read or stored.
 */
@Component({
  selector: 'app-guide',
  templateUrl: './guide.html',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class Guide {
  protected readonly i18n = inject(I18n);
  protected readonly pageMenu = inject(PageMenu);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  protected readonly slides = GUIDE_SLIDES;
  protected readonly count = GUIDE_SLIDES.length;
  protected readonly swipe = new SwipeTracker();
  protected readonly index = signal(readGuideCard(GUIDE_SLIDES.length));
  /** The side the shown card came in from: none on opening, so the page opens still. */
  protected readonly dir = signal<'left' | 'right' | null>(null);
  /** The shown card, as a one-item list so a new card is a new element and its slide-in plays. */
  protected readonly shown = computed(() => [{ id: GUIDE_SLIDES[this.index()], n: this.index() }]);
  /** The themes' tiles on the last card: dark ones on the left, light ones on the right, as in the themes menu. */
  protected readonly themeTiles = [DARK_THEMES, LIGHT_THEMES].flatMap((column, c) =>
    column.map((id, r) => ({ id, x: 150 + c * 54, y: 26 + r * 32, bar: THEME_BAR[id], accent: THEME_ACCENT[id] })));
  /** The round menu's actions on the menu card, from the top down, each beside its button. */
  protected readonly menuActions = ['settings.title', 'nav.edit', 'settings.theme', 'nav.pages', 'week.overview']
    .map((key, i) => ({ key, y: 22 + i * 30 }));
  /** The Letreros sets on the last card, in the language in use, the chosen one ringed (it follows a new choice), each with
   *  its five words in capitals, which the drawing shows in turn as a ring steps down the sets (v89). */
  protected readonly levelSets = computed(() => {
    const lang = this.i18n.lang();
    return LEVEL_SETS.map((set, i) => {
      const words = inLang(set.words, set.words[lang] ? lang : 'en')!;
      const up = (l: keyof typeof words) => words[l].one.toLocaleUpperCase(this.i18n.locale());
      return {
        id: set.id, name: inLang(set.name, lang) ?? set.id, y: 44 + i * 22, on: set.id === this.i18n.levels(),
        area: up('area'), epic: up('epic'), feature: up('feature'), story: up('story'), task: up('task'),
      };
    });
  });

  protected go(to: number): void {
    const from = this.index();
    if (to === from || to < 0 || to >= this.count) return;
    this.dir.set(to > from ? 'right' : 'left');
    this.index.set(to);
    writeGuideCard(to);
  }
  protected step(by: -1 | 1): void {
    const next = stepDay(GUIDE_SLIDES.map((_, i) => i), this.index(), by);
    if (next !== null) this.go(next);
  }
  /** A sideways swipe: left shows the next card, right the previous one. */
  protected swiped(event: TouchEvent): void {
    const by = this.swipe.end(event);
    if (by) this.step(by);
  }
  protected onKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable], dialog') || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    this.step(event.key === 'ArrowRight' ? 1 : -1);
  }
  protected toCanvas(): void {
    void this.router.navigateByUrl('/canvas');
  }
}
