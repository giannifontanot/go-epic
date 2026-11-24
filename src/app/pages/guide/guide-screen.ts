import { AfterViewInit, Directive, ElementRef, OnDestroy, inject, input } from '@angular/core';

/** The design size of every Instructions screen; it is scaled to the card. */
export const SCREEN_W = 340;
export const SCREEN_H = 236;
/** How long the story dims before it starts again. */
const FADE_MS = 500;

/**
 * Plays one Instructions screen in a loop (v95, Gianni: the quality of getgoepic.com's animations), the way the Get Go
 * Epic page plays its phone screens: `.run` starts the story, `.snap` restarts it without playing anything backwards,
 * `.fade` dims it just before it starts again. Pieces with `data-fly` (a key, `data-at` and `data-dur` in ms) send a copy
 * flying to the piece with the same `data-land`, measured, so it lands exactly there. The screen is drawn at
 * SCREEN_W × SCREEN_H and scaled to the card (`--k`), never taller than 62% of the window. Under reduced motion nothing
 * plays: the still picture is each story's end.
 */
@Directive({ selector: '[gxScreen]' })
export class GuideScreen implements AfterViewInit, OnDestroy {
  /** The story's length, in ms. */
  readonly period = input.required<number>({ alias: 'gxScreen' });
  private readonly el: HTMLElement = inject(ElementRef).nativeElement;
  private raf = 0;
  private t0 = 0;
  private k = 1;
  private anims: Animation[] = [];
  private clones: HTMLElement[] = [];
  private readonly flown = new Set<Element>();
  private resize?: ResizeObserver;
  private readonly onWindow = () => this.fit();

  ngAfterViewInit(): void {
    this.fit();
    const art = this.el.parentElement;
    if (art && typeof ResizeObserver !== 'undefined') {
      this.resize = new ResizeObserver(() => this.fit());
      this.resize.observe(art);
    }
    addEventListener('resize', this.onWindow);
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof requestAnimationFrame !== 'function') return;
    this.restart(performance.now());
    this.raf = requestAnimationFrame(this.frame);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.resize?.disconnect();
    removeEventListener('resize', this.onWindow);
    this.stop();
  }

  /** Scales the screen to the card's width, centred, and gives the card the screen's height. */
  private fit(): void {
    const art = this.el.parentElement;
    if (!art) return;
    const width = art.clientWidth || SCREEN_W;
    const room = typeof innerHeight === 'number' && innerHeight > 0 ? innerHeight * .62 : SCREEN_H * 2;
    this.k = Math.max(.5, Math.min(width / SCREEN_W, room / SCREEN_H, 1.9));
    this.el.style.setProperty('--k', this.k.toFixed(4));
    this.el.style.left = `${Math.max(0, (width - SCREEN_W * this.k) / 2)}px`;
    art.style.height = `${Math.round(SCREEN_H * this.k)}px`;
  }

  private readonly frame = (now: number): void => {
    this.raf = 0;
    if (!this.el.isConnected) return;
    let t = now - this.t0;
    const period = this.period();
    if (t >= period) {
      this.restart(now);
      t = 0;
    } else this.el.classList.remove('snap');
    this.el.classList.toggle('fade', t > period - FADE_MS);
    this.el.querySelectorAll<HTMLElement>('[data-fly]').forEach((src) => {
      if (!this.flown.has(src) && t >= Number(src.dataset['at'] ?? 0)) {
        this.flown.add(src);
        this.fly(src, Number(src.dataset['dur'] ?? 900));
      }
    });
    this.raf = requestAnimationFrame(this.frame);
  };

  private stop(): void {
    this.anims.forEach((a) => a.cancel());
    this.anims = [];
    this.clones.forEach((c) => c.remove());
    this.clones = [];
    this.flown.clear();
  }

  private restart(now: number): void {
    this.stop();
    const el = this.el;
    el.classList.remove('run', 'fade');
    el.classList.add('snap');
    void el.offsetWidth;
    el.classList.add('run');
    this.t0 = now;
  }

  /** A copy of the piece lifts, flies to its landing place and settles there (it lands, then fades into the real one). */
  private fly(src: HTMLElement, duration: number): void {
    const live = src.closest<HTMLElement>('.gx-live');
    const target = this.el.querySelector<HTMLElement>(`[data-land="${src.dataset['fly']}"]`);
    if (!live || !target || typeof src.animate !== 'function') return;
    const k = this.k;
    const L = live.getBoundingClientRect();
    const a = src.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    if (!a.width || !b.width) return;
    const copy = src.cloneNode(true) as HTMLElement;
    copy.removeAttribute('data-fly');
    copy.classList.add('gx-flying');
    copy.style.left = `${((a.left - L.left) / k).toFixed(1)}px`;
    copy.style.top = `${((a.top - L.top) / k).toFixed(1)}px`;
    copy.style.width = `${(a.width / k).toFixed(1)}px`;
    copy.style.height = `${(a.height / k).toFixed(1)}px`;
    live.appendChild(copy);
    this.clones.push(copy);
    const to = `translate(${((b.left - a.left) / k).toFixed(1)}px, ${((b.top - a.top) / k).toFixed(1)}px) scale(${(b.width / a.width).toFixed(3)}, ${(b.height / a.height).toFixed(3)})`;
    const rest = '0 3px 0 rgba(0, 0, 0, .12)';
    const lifted = '0 16px 24px rgba(0, 0, 0, .4)';
    this.anims.push(copy.animate([
      { offset: 0, transform: 'none', boxShadow: rest, opacity: 1 },
      { offset: .22, transform: 'translateY(-8px) scale(1.08) rotate(-3deg)', boxShadow: lifted, opacity: 1, easing: 'cubic-bezier(.45, 0, .2, 1)' },
      { offset: .9, transform: to, boxShadow: '0 6px 10px rgba(0, 0, 0, .25)', opacity: 1 },
      { offset: 1, transform: to, boxShadow: rest, opacity: 0 },
    ], { duration, fill: 'forwards' }));
  }
}
