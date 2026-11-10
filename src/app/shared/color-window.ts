import { Component, ElementRef, inject, input, output, viewChild } from '@angular/core';
import { closeDialog, isBackdropClick, openDialog } from '../core/dialog';
import { I18n } from '../core/i18n';
import { COLOR_CHOICES } from '../core/week.model';

/**
 * The colour window: a small card with eight colours in two rows and Automatic (chosen when nothing is picked) across
 * the third. It grows out of the button that opened it; a choice closes it (Gianni).
 */
@Component({
  selector: 'app-color-window',
  template: `
    <dialog #dialog class="editor color-window" aria-labelledby="color-title" (click)="onBackdrop($event)">
      <header>
        <h2 id="color-title">{{ i18n.t('task.color') }}</h2>
        <button type="button" class="pick-close" [attr.aria-label]="i18n.t('nav.close')" (click)="close()">×</button>
      </header>
      <div class="color-pick" role="group" [attr.aria-label]="i18n.t('task.color')">
        @for (choice of colors; track choice.color) {
          <button type="button" class="swatch" [style.background]="choice.color" [class.on]="color() === choice.color"
                  [attr.aria-pressed]="color() === choice.color" [attr.aria-label]="i18n.t(choice.label)" [title]="i18n.t(choice.label)"
                  (click)="choose(choice.color)"></button>
        }
        <button type="button" class="swatch auto" [class.on]="!color()" [attr.aria-pressed]="!color()" (click)="choose(null)">{{ i18n.t('task.auto') }}</button>
      </div>
    </dialog>
  `,
})
export class ColorWindow {
  protected readonly i18n = inject(I18n);
  protected readonly colors = COLOR_CHOICES;
  readonly color = input<string | null>(null);
  readonly picked = output<string | null>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(): void {
    openDialog(this.dialog().nativeElement);
  }
  protected close(): Promise<void> {
    return closeDialog(this.dialog().nativeElement);
  }
  protected onBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.dialog().nativeElement)) void this.close();
  }
  protected choose(color: string | null): void {
    this.picked.emit(color);
    void this.close();
  }
}
