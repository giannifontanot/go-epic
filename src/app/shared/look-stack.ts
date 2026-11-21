import { Component, HostListener, computed, effect, inject, signal, untracked } from '@angular/core';
import { I18n } from '../core/i18n';
import { TextSettings } from '../core/text-settings';
import { CaptureUi } from '../pages/capture/capture-ui';

type Tool = 'size' | 'spacing' | 'px';

/**
 * The edit tools (Gianni: not a bar fixed at the top): while a page is being edited (the Week board arranged, the
 * Canvas after ✎ Edit) round buttons stack at the bottom right, above the ✓ Finish that takes the round menu's place.
 * From the bottom: Aa (the text size), AV (the space between letters) and px (the minutes' length, the Week board only);
 * the Themes are not here (Gianni: their own button in the round menu, above ✎ Edit). Each opens a small − value + pill
 * to its left; one at a time.
 * Drawn by the App, outside the page, so a grey theme's filter never moves it.
 */
@Component({
  selector: 'app-look-stack',
  template: `
    @if (ui.lookTools(); as t) {
      <div class="look-stack" role="toolbar" [attr.aria-label]="i18n.t('look.tools')">
        @for (tool of tools(); track tool; let i = $index) {
          <div class="look-row" [style.--i]="i">
            @if (shown() === tool) {
              <div class="look-pill" role="group" [class.closing]="closing()" [attr.aria-label]="label(tool)">
                <button type="button" [disabled]="!text.canStep(tool, -1)" [attr.aria-label]="less(tool)" (click)="step(tool, -1)">−</button>
                <span class="look-value">{{ value(tool) }}</span>
                <button type="button" [disabled]="!text.canStep(tool, 1)" [attr.aria-label]="more(tool)" (click)="step(tool, 1)">+</button>
              </div>
            }
            <button type="button" class="capture-fab look-fab" [class.open]="isOpen(tool)" [attr.aria-expanded]="isOpen(tool)"
                    [attr.aria-label]="label(tool)" [title]="label(tool)" (click)="toggle(tool)">
              @switch (tool) {
                @case ('size') { <span class="look-icon">Aa</span> }
                @case ('spacing') { <span class="look-icon">AV</span> }
                @case ('px') { <span class="look-icon px">px</span> }
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
  /** The open pill (Aa, AV or px), if any; `closing` while it slides back into its button. */
  protected readonly shown = signal<Tool | null>(null);
  protected readonly closing = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected readonly tools = computed<Tool[]>(() =>
    this.ui.lookTools()?.px ? ['size', 'spacing', 'px'] : ['size', 'spacing']);

  constructor() {
    // leaving edit mode puts everything away
    effect(() => {
      if (this.ui.lookTools()) return;
      untracked(() => { this.shown.set(null); this.closing.set(false); });
    });
  }

  protected isOpen(tool: Tool): boolean {
    return this.shown() === tool && !this.closing();
  }

  protected toggle(tool: Tool): void {
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
    return this.i18n.t(tool === 'size' ? 'settings.size' : tool === 'spacing' ? 'settings.spacing' : 'settings.pxPerMin');
  }
  protected less(tool: Tool): string {
    return this.i18n.t(tool === 'size' ? 'settings.smaller' : tool === 'spacing' ? 'settings.tighter' : 'settings.shorter');
  }
  protected more(tool: Tool): string {
    return this.i18n.t(tool === 'size' ? 'settings.bigger' : tool === 'spacing' ? 'settings.wider' : 'settings.longer');
  }
}
