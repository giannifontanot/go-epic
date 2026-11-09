import { AfterViewInit, Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { isBackdropClick } from '../../core/dialog';
import { I18n } from '../../core/i18n';
import { DAYS, Day } from '../../core/week.model';

export interface Transfer {
  mode: 'copy' | 'move';
  days: Day[];
}

/** Copy a block to any number of days, or move it to one (the white card Gianni liked). */
@Component({
  selector: 'app-transfer-dialog',
  template: `
    <dialog #dialog class="transfer" aria-labelledby="transfer-title" (cancel)="$event.preventDefault(); cancel.emit()"
            (click)="onBackdrop($event)">
      <header>
        <div>
          <p class="eyebrow">{{ i18n.t('day.' + day()) }} · {{ blockName() }}</p>
          <h2 id="transfer-title">{{ i18n.t('week.transfer') }}</h2>
        </div>
        <button type="button" class="close" [attr.aria-label]="i18n.t('task.cancel')" (click)="cancel.emit()">×</button>
      </header>
      <div class="mode" role="radiogroup" [attr.aria-label]="i18n.t('week.transfer')">
        <button type="button" role="radio" [attr.aria-checked]="mode() === 'copy'" (click)="setMode('copy')">⧉ {{ i18n.t('transfer.copy') }}</button>
        <button type="button" role="radio" [attr.aria-checked]="mode() === 'move'" (click)="setMode('move')">⇄ {{ i18n.t('transfer.move') }}</button>
      </div>
      <p class="hint">{{ i18n.t(mode() === 'copy' ? 'transfer.hintCopy' : 'transfer.hintMove') }}</p>
      <div class="day-chips" role="group">
        @for (d of days; track d) {
          <button type="button" class="day-chip" [attr.aria-pressed]="picked().includes(d)" [disabled]="d === day()"
                  [title]="i18n.t('day.' + d)" (click)="toggle(d)">{{ i18n.t('dayShort.' + d) }}</button>
        }
      </div>
      <footer>
        <button type="button" (click)="cancel.emit()">{{ i18n.t('task.cancel') }}</button>
        <button type="button" class="primary" [disabled]="!picked().length" (click)="apply.emit({ mode: mode(), days: picked() })">
          {{ i18n.t(mode() === 'copy' ? 'transfer.copy' : 'transfer.move') }}@if (picked().length > 1) { ({{ picked().length }}) }
        </button>
      </footer>
    </dialog>
  `,
})
export class TransferDialog implements AfterViewInit {
  protected readonly i18n = inject(I18n);
  readonly day = input.required<Day>();
  readonly blockName = input.required<string>();
  readonly apply = output<Transfer>();
  readonly cancel = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly days = DAYS;
  protected readonly mode = signal<'copy' | 'move'>('copy');
  protected readonly picked = signal<Day[]>([]);

  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
  }

  protected setMode(mode: 'copy' | 'move'): void {
    this.mode.set(mode);
    if (mode === 'move') this.picked.update((days) => days.slice(0, 1));   // moving goes to one day: keep the first pick
  }

  protected toggle(day: Day): void {
    this.picked.update((days) => {
      if (days.includes(day)) return days.filter((d) => d !== day);
      if (this.mode() === 'move') return [day];
      return DAYS.filter((d) => d === day || days.includes(d));            // week order
    });
  }

  protected onBackdrop(event: MouseEvent): void {
    if (isBackdropClick(event, this.dialog().nativeElement)) this.cancel.emit();
  }
}
