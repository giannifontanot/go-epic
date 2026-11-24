import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { readGuideCard, writeGuideCard } from '../../core/guide-card';
import { I18n, inLang } from '../../core/i18n';
import { LEVEL_SETS } from '../../core/levels.model';
import { SwipeTracker, stepDay } from '../../core/swipe';
import { DARK_THEMES, LIGHT_THEMES, THEME_BAR, Theme, ThemeService } from '../../core/theme';
import { PageMenu } from '../../shared/title-fan';
import { GuideScreen } from './guide-screen';

/**
 * The cards (v95, rewritten with a panel of experts, Gianni: focus on the hierarchy, and show that an activity can be
 * created loose and given its epic meaning later). First «Your story»: the levels growing around one step, the four
 * areas, who you are ([epic]), what you live and the road ([feature] and [story]), today's step ([task]), starting
 * without a plan and giving it its meaning; then «The app»: the round menu, the week, the day, what runs now, Capture,
 * Progress, the Year, deleting, themes and Letreros. Every level name is a Letreros token, so the cards follow the set
 * the user chose.
 */
export const GUIDE_SLIDES = ['welcome', 'areas', 'epic', 'feature', 'task', 'loose', 'meaning',
  'menu', 'week', 'today', 'focus', 'capture', 'progress', 'year', 'delete', 'themes', 'labels'] as const;
export type GuideSlide = (typeof GUIDE_SLIDES)[number];
/** The cards of the short story about the levels, which come first. */
export const STORY_CARDS = 7;

/** How long each card's story plays before it starts again, in ms. */
const PERIODS: Record<GuideSlide, number> = {
  welcome: 9000, areas: 8000, epic: 9000, feature: 10000, task: 10500, loose: 9500, meaning: 11000,
  menu: 8500, week: 9500, today: 11000, focus: 9500, capture: 9500, progress: 10000, year: 9000, delete: 9500,
  themes: 10500, labels: 11000,
};

/** Each theme's accent, for the little theme tiles (its `--pink` in styles.css). */
const THEME_ACCENT: Record<Theme, string> = {
  epic: '#f4a8b7', pinkpop: '#b04a73', petalpunk: '#e39bbf', squeezeme: '#3d68b0', sunburnt: '#b5652a',
  smokedcitrus: '#fb923c', office: '#9aa2ab', graphite: '#59616b', goepiclight: '#1d1d1f', goepicdark: '#e2b84a',
};
/** The tiles the ring tries on, in order (column, row), as in `gt-hop`. */
const HOPS: readonly [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 2], [0, 3], [1, 4]];
const AREA_KEYS = ['temple', 'castle', 'tower', 'arena'] as const;
const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

/**
 * «Instrucciones» / Instructions (Gianni): for anyone new to Go Epic, a carousel of cards, each a title, a live screen and
 * a few words. v95 (Gianni: the quality of getgoepic.com's animations): every screen is a small piece of the app drawn
 * in HTML and played in a loop by `GuideScreen`, painted with the theme's own tokens so it wears the theme the user has
 * on (the Year keeps its fixed colours). Arrows, a sideways swipe or ← → step through it, stopping at the first and the
 * last card; the new card slides in from its side (nothing under reduced motion, where each screen shows its story's
 * end). It opens, still, on the card you were last on, remembered on this device (`go-epic-instructions-card`).
 */
@Component({
  selector: 'app-guide',
  templateUrl: './guide.html',
  imports: [GuideScreen],
  host: { '(document:keydown)': 'onKey($event)' },
})
export class Guide {
  protected readonly i18n = inject(I18n);
  protected readonly pageMenu = inject(PageMenu);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  protected readonly slides = GUIDE_SLIDES;
  protected readonly storyCards = STORY_CARDS;
  protected readonly count = GUIDE_SLIDES.length;
  protected readonly periods = PERIODS;
  protected readonly weekChips = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
  protected readonly swipe = new SwipeTracker();
  protected readonly index = signal(readGuideCard(GUIDE_SLIDES.length));
  /** The side the shown card came in from: none on opening, so the page opens still. */
  protected readonly dir = signal<'left' | 'right' | null>(null);
  /** The shown card, as a one-item list so a new card is a new element and its story starts from the beginning. */
  protected readonly shown = computed(() => [{ id: GUIDE_SLIDES[this.index()], n: this.index() }]);

  /** The four life areas: name, what it means and what it holds, as the Canvas shows them. */
  protected readonly areas = computed(() => {
    this.i18n.lang();
    return AREA_KEYS.map((key) => {
      const [name, desc] = this.i18n.t(`area.${key}`).split(' - ');
      return { key, name, desc: desc ?? '', hint: this.i18n.t(`area.${key}Hint`) };
    });
  });
  /** The themes' tiles: dark ones on the left, light ones on the right, as in the themes menu. */
  protected readonly themeTiles = [DARK_THEMES, LIGHT_THEMES].flatMap((column, c) =>
    column.map((id, r) => ({ id, left: 196 + c * 54, top: 20 + r * 40, bar: THEME_BAR[id], accent: THEME_ACCENT[id] })));
  /** The page colours the board behind tries on while the ring hops over the tiles. */
  protected readonly washStyle = HOPS.map(([c, r], i) => `--w${i}: ${THEME_BAR[(c ? LIGHT_THEMES : DARK_THEMES)[r]]}`).join('; ');
  /** Where the ring ends: the theme in use. */
  protected readonly themeRing = computed(() => this.themeTiles.find((t) => t.id === this.theme.theme()) ?? this.themeTiles[0]);
  /** The round menu's actions, from the bottom up, each beside its button. */
  protected readonly menuActions = [
    { key: 'week.overview', icon: '☰' }, { key: 'nav.pages', icon: '◎' }, { key: 'settings.theme', icon: '◐' },
    { key: 'nav.edit', icon: '✎', ring: true }, { key: 'settings.title', icon: '⚙' },
  ].map((a, i) => ({ ...a, top: 140 - i * 32, at: 1.15 + i * .09 }));
  /** The pages that fan out of the compass. */
  protected readonly pageTiles = ['nav.week', 'nav.canvas', 'nav.progress', 'nav.year', 'nav.products', 'nav.guide']
    .map((key, i) => ({ key, left: 14 + (i % 2) * 104, top: 52 + Math.floor(i / 2) * 32, at: 2.7 + i * .05, on: key === 'nav.guide' }));
  /** The Letreros sets, in the language in use, each with its five words in capitals; the chosen one is ringed at the end. */
  protected readonly levelSets = computed(() => {
    const lang = this.i18n.lang();
    return LEVEL_SETS.map((set, i) => {
      const words = inLang(set.words, set.words[lang] ? lang : 'en')!;
      const up = (l: keyof typeof words) => words[l].one.toLocaleUpperCase(this.i18n.locale());
      return {
        id: set.id, i, name: inLang(set.name, lang) ?? set.id, top: 12 + i * 28, on: set.id === this.i18n.levels(),
        area: up('area'), epic: up('epic'), feature: up('feature'), story: up('story'), task: up('task'),
      };
    });
  });
  protected readonly chosenSet = computed(() => this.levelSets().find((s) => s.on) ?? this.levelSets()[0]);
  /** Autumn 2026 on the Year card: four sprints of 21 days from Monday 21 September, then the rest week. */
  protected readonly yearRows = computed(() => {
    const locale = this.i18n.locale();
    const day = (n: number) => new Date(2026, 8, 21 + n);
    const month = (d: Date) => {
      const m = d.toLocaleDateString(locale, { month: 'short' }).replace('.', '');
      return m ? m.charAt(0).toUpperCase() + m.slice(1, 3) : MONTHS[d.getMonth()];
    };
    return [0, 1, 2, 3, 4].map((s) => {
      const days = Array.from({ length: s < 4 ? 21 : 7 }, (_, i) => {
        const n = s * 21 + i;
        return { n, d: day(n).getDate(), past: n < 64, today: n === 64, held: n === 67 };
      });
      const first = day(s * 21);
      const last = day(s * 21 + days.length - 1);
      return { s, rest: s === 4, days, range: `${first.getDate()} ${month(first)} – ${last.getDate()} ${month(last)}` };
    });
  });

  /** The text's length, for the typing effect (`--n`). */
  protected len(key: string): number {
    return [...this.i18n.t(key)].length;
  }

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
