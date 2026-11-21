import { Component, ElementRef, computed, inject, input, viewChild } from '@angular/core';
import { closeDialog, isBackdropClick, openDialog } from '../core/dialog';
import { I18n } from '../core/i18n';
import { WHY, WhyScreen } from '../core/why';

/**
 * The "Why?" of a screen (Gianni): a small, cute pill with the word "Why?" at the top right of every screen; a tap opens
 * a window, growing out of the button like every window (core/dialog), that explains which part of your life the screen
 * orders and why you need it. First a brief but complete reason ("In short"), then fuller sections for whoever wants to
 * know more. The texts live in core/why.ts. The word stays "Why?" in both languages (Gianni); its accessible name is
 * translated. ✕, Close, Esc or the backdrop close it.
 */
@Component({
  selector: 'app-why',
  host: { class: 'why' },
  template: `
    <button type="button" class="why-btn" [attr.aria-label]="i18n.t('why.button')" [title]="i18n.t('why.button')" (click)="open()">
      <span class="why-word">Why</span><span class="why-q" aria-hidden="true">?</span><span class="why-spark" aria-hidden="true">✦</span>
    </button>
    <dialog #dialog class="info-card why-window" [attr.aria-labelledby]="'why-title-' + screen()" (click)="onBackdrop($event)">
      @let text = content();
      <div class="info-head">
        <div class="why-titles">
          <p class="why-eyebrow">Why?</p>
          <h2 [id]="'why-title-' + screen()">{{ text.title }}</h2>
          <p class="why-orders">{{ i18n.t('why.orders') }}: <strong>{{ text.orders }}</strong></p>
        </div>
        <button type="button" class="round" [attr.aria-label]="i18n.t('week.infoClose')" [title]="i18n.t('week.infoClose')" (click)="close()">✕</button>
      </div>
      <div class="why-body">
        <section class="why-lead" style="--i: 0">
          <h3>{{ i18n.t('why.inShort') }}</h3>
          <p>{{ text.lead }}</p>
        </section>
        <p class="why-more" style="--i: 1">{{ i18n.t('why.more') }}</p>
        @for (section of text.sections; track section.heading; let i = $index) {
          <section class="why-sec" [style.--i]="i + 2">
            <h3>{{ section.heading }}</h3>
            @for (p of section.body; track $index) { <p>{{ p }}</p> }
          </section>
        }
      </div>
      <div class="info-foot"><button type="button" class="primary" (click)="close()">{{ i18n.t('week.infoClose') }}</button></div>
    </dialog>
  `,
})
export class Why {
  protected readonly i18n = inject(I18n);
  readonly screen = input.required<WhyScreen>();
  protected readonly content = computed(() => WHY[this.screen()][this.i18n.lang()]);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected open(): void {
    const d = this.dialog().nativeElement;
    if (d.open) return;
    d.querySelector('.why-body')?.scrollTo?.({ top: 0 });
    openDialog(d);
  }
  protected close(): void {
    void closeDialog(this.dialog().nativeElement);
  }
  protected onBackdrop(event: MouseEvent): void {
    event.stopPropagation();   // inside Capture's window: a click here is never that window's backdrop
    if (isBackdropClick(event, this.dialog().nativeElement)) this.close();
  }
}
