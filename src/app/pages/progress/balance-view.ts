import { Component, computed, inject, input, signal, untracked } from '@angular/core';
import { BalanceAxis, BalancePeriod, PERIODS, balance, overall, periodWindows, radarPoint } from '../../core/balance.model';
import { I18n } from '../../core/i18n';
import { LibraryStore } from '../../core/library.store';
import { DayMarks } from '../../core/status.model';
import { WeekStore } from '../../core/week.store';

const PERIOD_KEY = 'go-epic-balance-period';
/** The radar's radius in the SVG's units (viewBox -170…170). */
const R = 112;
const RINGS = [0.25, 0.5, 0.75, 1];
/** Where an Epic with nothing planned sits: a hollow grey dot just off the centre, never mistaken for 0%. */
const NO_PLAN_R = 9;

/**
 * Progress → Areas of life (Gianni): one radar with an axis per Epic, grouped and coloured by its Area; the more of
 * the planned Activities are done, the rounder and fuller it grows. A faint dashed shadow is the previous period.
 * A tap on an axis (or its row in the list under it) shows that Epic's Activities, done and pending.
 * The numbers on the tips and the list carry the names, so the colours are never the only clue.
 */
@Component({
  selector: 'app-balance-view',
  template: `
    <div class="balance">
      <div class="seg" role="radiogroup" [attr.aria-label]="i18n.t('balance.period')">
        @for (p of periods; track p) {
          <button type="button" role="radio" [attr.aria-checked]="period() === p" [class.on]="period() === p" (click)="setPeriod(p)">{{ i18n.t('balance.' + p) }}</button>
        }
      </div>
      <p class="muted b-range">{{ rangeLabel() }}</p>

      @if (!axes().length) {
        <p class="muted center">{{ i18n.t('balance.noEpics') }}</p>
      } @else {
        <div class="b-head">
          <span class="b-total">{{ total() === null ? '—' : pct(total()) }}</span>
          <span class="muted">{{ i18n.t('balance.done') }}@if (prevTotal() !== null) { · {{ i18n.t('balance.before', { n: pct(prevTotal()) }) }} }</span>
        </div>
        @if (total() === null) { <p class="muted center b-hint">{{ i18n.t('balance.noMarks') }}</p> }

        <svg class="radar" viewBox="-170 -170 340 340" role="img" [attr.aria-label]="i18n.t('balance.chart')">
          <!-- rings at 25, 50, 75 and 100% -->
          @for (ring of rings; track ring) {
            <circle class="r-ring" cx="0" cy="0" [attr.r]="ring * R" />
          }
          <!-- each Area's arc around its Epics, in the Area's colour -->
          @for (arc of arcs(); track arc.areaId) {
            <path class="r-arc" [attr.d]="arc.d" [style.--c]="color(arc.areaIndex)" />
          }
          @for (axis of axes(); track axis.epicId; let i = $index) {
            <line class="r-axis" [class.sel]="selected() === axis.epicId" x1="0" y1="0" [attr.x2]="pt(i, R).x" [attr.y2]="pt(i, R).y" />
          }
          <!-- the previous period, faint and dashed -->
          @if (prevShape()) { <polygon class="r-prev" [attr.points]="prevShape()" /> }
          @if (shape()) { <polygon class="r-now" [attr.points]="shape()" /> }
          @for (axis of axes(); track axis.epicId; let i = $index) {
            @if (axis.value === null) {
              <circle class="r-noplan" [attr.cx]="pt(i, noPlanR).x" [attr.cy]="pt(i, noPlanR).y" r="4" />
            } @else {
              <circle class="r-dot" [style.--c]="color(axis.areaIndex)" [attr.cx]="pt(i, axis.value * R).x" [attr.cy]="pt(i, axis.value * R).y" r="5.5" />
            }
            <g class="r-tip" [class.sel]="selected() === axis.epicId" [class.empty]="axis.value === null" [style.--c]="color(axis.areaIndex)"
               role="button" tabindex="0" [attr.aria-pressed]="selected() === axis.epicId" [attr.aria-label]="axisLabel(axis, i)"
               (click)="toggle(axis.epicId)" (keydown.enter)="toggle(axis.epicId)" (keydown.space)="$event.preventDefault(); toggle(axis.epicId)">
              <line class="r-hit" x1="0" y1="0" [attr.x2]="pt(i, R).x" [attr.y2]="pt(i, R).y" />
              <circle class="r-hit" [attr.cx]="pt(i, R + 30).x" [attr.cy]="pt(i, R + 30).y" r="22" />
              <circle class="r-num" [attr.cx]="pt(i, R + 30).x" [attr.cy]="pt(i, R + 30).y" r="14" />
              <text [attr.x]="pt(i, R + 30).x" [attr.y]="pt(i, R + 30).y" dy=".35em" text-anchor="middle">{{ i + 1 }}</text>
            </g>
          }
        </svg>
        <p class="muted b-key"><span class="k-now"></span> {{ i18n.t('balance.keyNow') }} <span class="k-prev"></span> {{ i18n.t('balance.keyPrev') }} <span class="k-none"></span> {{ i18n.t('balance.noPlan') }}</p>

        @if (detail(); as d) {
          <section class="b-detail" [style.--c]="color(d.areaIndex)" aria-live="polite">
            <header>
              <span class="b-num">{{ indexOf(d) + 1 }}</span>
              <div><strong>{{ d.epicTitle }}</strong><small class="muted">{{ d.areaTitle }}</small></div>
              <button type="button" class="round" [attr.aria-label]="i18n.t('nav.close')" (click)="selected.set(null)">✕</button>
            </header>
            @if (d.value === null) {
              <p class="muted">{{ i18n.t('balance.nothingPlanned') }}</p>
            } @else {
              <p>{{ i18n.t('balance.summary', { done: d.done, planned: d.planned, pct: pct(d.value) }) }}</p>
              <ul class="b-acts">
                @for (act of d.activities; track act.key) {
                  <li>
                    <span class="a-title">{{ act.title }}</span>
                    <span class="a-count">
                      <span class="a-done">✓ {{ act.done }}</span>
                      @if (act.planned - act.done) { <span class="a-pend">○ {{ i18n.t('balance.pending', { n: act.planned - act.done }) }}</span> }
                    </span>
                  </li>
                }
              </ul>
            }
          </section>
        }

        <!-- the same numbers as a list (the chart's names, and its table for anyone who cannot tell the colours apart) -->
        @for (group of groups(); track group.areaId) {
          <h3 class="b-area" [style.--c]="color(group.areaIndex)"><span class="b-swatch"></span>{{ group.areaTitle }}</h3>
          <ul class="b-list">
            @for (axis of group.axes; track axis.epicId) {
              <li>
                <button type="button" class="b-row" [class.sel]="selected() === axis.epicId" [style.--c]="color(axis.areaIndex)"
                        [attr.aria-pressed]="selected() === axis.epicId" (click)="toggle(axis.epicId)">
                  <span class="b-num">{{ indexOf(axis) + 1 }}</span>
                  <span class="b-name">{{ axis.epicTitle }}</span>
                  <span class="b-val" [class.none]="axis.value === null">{{ axis.value === null ? i18n.t('balance.noPlan') : pct(axis.value) }}</span>
                  <span class="b-prev muted">{{ axis.previous === null ? '' : i18n.t('balance.before', { n: pct(axis.previous) }) }}</span>
                </button>
              </li>
            }
          </ul>
        }
        <p class="muted note">{{ i18n.t('balance.note') }}</p>
      }
    </div>
  `,
})
export class BalanceView {
  /** The day documents, read by the Progress page (from the start of the previous quarter). */
  readonly history = input<Record<string, DayMarks>>({});
  /** The user's earliest day document when it is older than `history` (a first mark before what was read), else null. */
  readonly olderFirstKey = input<string | null>(null);

  protected readonly i18n = inject(I18n);
  private readonly store = inject(WeekStore);
  private readonly library = inject(LibraryStore);
  protected readonly periods = PERIODS;
  protected readonly rings = RINGS;
  protected readonly R = R;
  protected readonly noPlanR = NO_PLAN_R;

  protected readonly period = signal<BalancePeriod>(readPeriod());
  protected readonly selected = signal<string | null>(null);
  /** The date only (changes at midnight, not every clock tick). */
  private readonly todayKey = computed(() => this.store.todayKey());
  private readonly today = computed(() => { this.todayKey(); return untracked(() => this.store.now()); });

  protected readonly axes = computed(() => balance(this.library.library(), this.store.week(), this.history(), this.period(), this.today(), this.olderFirstKey()));
  protected readonly total = computed(() => overall(this.axes()));
  protected readonly prevTotal = computed(() => overall(this.axes(), true));
  protected readonly detail = computed(() => this.axes().find((a) => a.epicId === this.selected()) ?? null);

  protected readonly shape = computed(() => this.polygon((a) => a.value));
  protected readonly prevShape = computed(() => this.polygon((a) => a.previous));

  /** The arcs around the radar: one per Area, over its Epics' share of the circle, with a small gap between Areas. */
  protected readonly arcs = computed(() => {
    const axes = this.axes();
    const n = axes.length;
    const step = (2 * Math.PI) / n;
    const out: { areaId: string; areaIndex: number; d: string }[] = [];
    for (const group of this.groups()) {
      const first = axes.indexOf(group.axes[0]);
      const last = axes.indexOf(group.axes[group.axes.length - 1]);
      const gap = this.groups().length > 1 ? 0.06 : 0;
      const a0 = -Math.PI / 2 + step * (first - 0.5) + gap;
      const a1 = -Math.PI / 2 + step * (last + 0.5) - gap;
      const r = R + 9;
      if (n === 1 || this.groups().length === 1) {
        out.push({ areaId: group.areaId, areaIndex: group.areaIndex, d: `M 0 ${-r} A ${r} ${r} 0 1 1 -0.01 ${-r}` });
        continue;
      }
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a: number) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
      out.push({ areaId: group.areaId, areaIndex: group.areaIndex, d: `M ${p(a0)} A ${r} ${r} 0 ${large} 1 ${p(a1)}` });
    }
    return out;
  });

  protected readonly groups = computed(() => {
    const out: { areaId: string; areaIndex: number; areaTitle: string; axes: BalanceAxis[] }[] = [];
    for (const axis of this.axes()) {
      const last = out[out.length - 1];
      if (last?.areaId === axis.areaId) last.axes.push(axis);
      else out.push({ areaId: axis.areaId, areaIndex: axis.areaIndex, areaTitle: axis.areaTitle, axes: [axis] });
    }
    return out;
  });

  protected readonly rangeLabel = computed(() => {
    const { current } = periodWindows(this.period(), this.today());
    const locale = this.i18n.lang() === 'es' ? 'es' : 'en';
    const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
    const day = (key: string) => { const [y, m, d] = key.split('-').map(Number); return fmt.format(new Date(y, m - 1, d)); };
    return this.i18n.t(this.period() === '3w' ? 'balance.range3w' : 'balance.rangeQ', { from: day(current.from), to: day(current.to) });
  });

  protected setPeriod(p: BalancePeriod): void {
    this.period.set(p);
    try { localStorage.setItem(PERIOD_KEY, p); } catch { /* a view preference only */ }
  }

  protected toggle(epicId: string): void {
    this.selected.update((id) => (id === epicId ? null : epicId));
  }

  protected pt(index: number, r: number) {
    return radarPoint(index, this.axes().length, r);
  }


  /** Through the Epics that have a value (the ones with no plan are left out, never drawn as 0%). */
  private polygon(value: (axis: BalanceAxis) => number | null): string | null {
    const pts = this.axes().map((axis, i) => ({ v: value(axis), i })).filter((p) => p.v !== null);
    if (!pts.length) return null;
    return pts.map(({ v, i }) => this.pt(i, (v ?? 0) * R)).map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  }

  protected indexOf(axis: BalanceAxis): number {
    return this.axes().findIndex((a) => a.epicId === axis.epicId);
  }

  /** The Area's colour, in a fixed order (CSS tokens, stepped for light and dark themes). */
  protected color(areaIndex: number): string {
    return `var(--area-${areaIndex % 8})`;
  }

  protected pct(value: number | null): string {
    return value === null ? '—' : `${Math.round(value * 100)}%`;
  }

  protected axisLabel(axis: BalanceAxis, i: number): string {
    const value = axis.value === null ? this.i18n.t('balance.noPlan') : this.pct(axis.value);
    return `${i + 1}. ${axis.epicTitle} (${axis.areaTitle}): ${value}`;
  }
}

function readPeriod(): BalancePeriod {
  try {
    const saved = localStorage.getItem(PERIOD_KEY);
    if (saved === '3w' || saved === 'quarter') return saved;
  } catch { /* private mode */ }
  return '3w';
}
