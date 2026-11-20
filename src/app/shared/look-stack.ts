import { Component, ElementRef, HostListener, computed, effect, inject, signal, untracked, viewChildren } from '@angular/core';
import { I18n } from '../core/i18n';
import { TextSettings } from '../core/text-settings';
import { CaptureUi } from '../pages/capture/capture-ui';
import { ThemePicker } from './theme-fan';

type Tool = 'size' | 'spacing' | 'theme' | 'px';

/**
 * The edit tools (Gianni: not a bar fixed at the top): while a page is being edited (the Week board arranged, the
 * Canvas after ✎ Edit) round buttons stack at the bottom right, above the ✓ Finish that takes the round menu's place.
 * From the bottom: Aa (the text size), AV (the space between letters), the Themes (they fan out to its left) and px
 * (the minutes' length, the Week board only). Aa, AV and px each open a small − value + pill to their left; one at a time.
 * Drawn by the App, outside the page, so a grey theme's filter never moves it.
 */
@Component({
  selector: 'app-look-stack',
  template: `
    @if (ui.lookTools(); as t) {
      <div class="look-stack" role="toolbar" [attr.aria-label]="i18n.t('look.tools')">
        @for (tool of tools(); track tool; let i = $index) {
          <div class="look-row" [style.--i]="i">
            @if (shown() === tool && tool !== 'theme') {
              <div class="look-pill" role="group" [class.closing]="closing()" [attr.aria-label]="label(tool)">
                <button type="button" [disabled]="!text.canStep(tool, -1)" [attr.aria-label]="less(tool)" (click)="step(tool, -1)">−</button>
                <span class="look-value">{{ value(tool) }}</span>
                <button type="button" [disabled]="!text.canStep(tool, 1)" [attr.aria-label]="more(tool)" (click)="step(tool, 1)">+</button>
              </div>
            }
            <button #toolBtn type="button" class="capture-fab look-fab" [class.open]="isOpen(tool)" [attr.aria-expanded]="isOpen(tool)"
                    [attr.aria-label]="label(tool)" [title]="label(tool)" (click)="toggle(tool, $event.currentTarget)">
              @switch (tool) {
                @case ('size') { <span class="look-icon">Aa</span> }
                @case ('spacing') { <span class="look-icon">AV</span> }
                @case ('px') { <span class="look-icon px">px</span> }
                @case ('theme') {
                  <svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                    <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1 0 1.6-.7 1.6-1.5 0-.5-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.9.7-1.6 1.6-1.6H16a4.6 4.6 0 0 0 4.5-4.6C20.5 6.7 16.7 3.5 12 3.5Z"/>
                    <g fill="currentColor" stroke="none"><circle cx="7.6" cy="11" r="1.3"/><circle cx="10" cy="7.5" r="1.3"/>
                    <circle cx="14.4" cy="7.5" r="1.3"/><circle cx="16.8" cy="11" r="1.3"/></g>
                  </svg>
                }
              }
            </button>
          </div>
        }
      </div>
      <!-- the round ✓ Finish takes the round menu's place; Finish shrinks back into the point it grew from -->
      <button type="button" class="capture-fab finish-fab" [attr.aria-label]="i18n.t('week.finish')" [title]="i18n.t('week.finish')" (click)="t.finish()">✓</button>
    }
  `,
})
export class LookStack {
  protected readonly i18n = inject(I18n);
  protected readonly text = inject(TextSettings);
  protected readonly ui = inject(CaptureUi);
  private readonly picker = inject(ThemePicker);
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('toolBtn');
  /** The open pill (Aa, AV or px), if any; `closing` while it slides back into its button. */
  protected readonly shown = signal<Tool | null>(null);
  protected readonly closing = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected readonly tools = computed<Tool[]>(() =>
    this.ui.lookTools()?.px ? ['size', 'spacing', 'theme', 'px'] : ['size', 'spacing', 'theme']);

  constructor() {
    // leaving edit mode puts everything away
    effect(() => {
      if (this.ui.lookTools()) return;
      untracked(() => { this.shown.set(null); this.closing.set(false); if (this.themeOpen()) this.picker.anchor.set(null); });
    });
  }

  private themeOpen(): boolean {
    const a = this.picker.anchor();
    return !!a && this.buttons().some((b) => b.nativeElement === a);
  }

  protected isOpen(tool: Tool): boolean {
    return tool === 'theme' ? this.themeOpen() : this.shown() === tool && !this.closing();
  }

  protected toggle(tool: Tool, button: EventTarget | null): void {
    if (tool === 'theme') {
      this.closePill();
      if (button instanceof HTMLElement) this.picker.toggle(button);
      return;
    }
    if (this.themeOpen()) this.picker.anchor.set(null);
    if (this.shown() === tool && !this.closing()) { this.closePill(); return; }
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.closing.set(false);
    this.shown.set(tool);
  }

  /** The pill slides back into its button, then goes. */
  private closePill(): void {
    if (!this.shown() || this.closing()) return;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { this.shown.set(null); return; }
    this.closing.set(true);
    this.timer = setTimeout(() => { this.timer = null; this.closing.set(false); this.shown.set(null); }, 220);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void { this.closePill(); }

  protected step(tool: Tool, dir: 1 | -1): void {
    if (tool === 'size') this.text.stepSize(dir);
    else if (tool === 'spacing') this.text.stepSpacing(dir);
    else if (tool === 'px') this.text.stepPx(dir);
  }

  protected value(tool: Tool): string {
    if (tool === 'size') return 'Aa ' + this.text.size();
    if (tool === 'spacing') return 'AV ' + Math.round(this.text.spacing() * 100);
    return this.text.pxPerMin() + ' px';
  }

  protected label(tool: Tool): string {
    return this.i18n.t(tool === 'size' ? 'settings.size' : tool === 'spacing' ? 'settings.spacing' : tool === 'px' ? 'settings.pxPerMin' : 'settings.theme');
  }
  protected less(tool: Tool): string {
    return this.i18n.t(tool === 'size' ? 'settings.smaller' : tool === 'spacing' ? 'settings.tighter' : 'settings.shorter');
  }
  protected more(tool: Tool): string {
    return this.i18n.t(tool === 'size' ? 'settings.bigger' : tool === 'spacing' ? 'settings.wider' : 'settings.longer');
  }
}
