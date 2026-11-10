import { Component, inject, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { I18n } from '../core/i18n';
import { Library, Where, WhereLevel, nodeById, whereOptions } from '../core/library.model';

/**
 * Where an activity lives, drawn as in the Canvas (Area · Epic plum › Feature jelly › Story cream › the Activity in its
 * colour), and the chooser at the same time: each level's line is tapped to choose it (a native list lies invisibly over
 * it, so phones show their own picker), an empty level says «Choose ›», a level shows once the one above is chosen
 * (an empty Area = Free Space). Used by the Week's activity details and Capture's activity editor.
 */
@Component({
  selector: 'app-where-card',
  template: `
    @let w = where();
    <div class="pick-card where-card" role="group" [attr.aria-label]="i18n.t('task.where')">
      <span class="pc-epic">
        <ng-container *ngTemplateOutlet="line; context: { level: 'area' }" />
        @if (w.area) { <ng-container *ngTemplateOutlet="line; context: { level: 'epic' }" /> }
      </span>
      <span class="pc-nest">
        @if (w.epic) {
          <span class="pc-feature">
            <ng-container *ngTemplateOutlet="line; context: { level: 'feature' }" />
            @if (w.feature) {
              <span class="pc-story">
                <ng-container *ngTemplateOutlet="line; context: { level: 'story' }" />
                <ng-container *ngTemplateOutlet="activity" />
              </span>
            } @else { <ng-container *ngTemplateOutlet="activity" /> }
          </span>
        } @else { <ng-container *ngTemplateOutlet="activity" /> }
      </span>
    </div>
    @if (!w.story) { <p class="hint where-hint">{{ i18n.t('task.freeHint') }}</p> }

    <ng-template #line let-level="level">
      <span class="pc-head pc-tap"><small>{{ i18n.t('canvas.' + level) }}</small>
        <strong [class.pc-empty]="!nameOf(level)">{{ nameOf(level) || (level === 'area' ? i18n.t('canvas.freeSpace') + ' · ' : '') + i18n.t('task.choose') + ' ›' }}</strong>
        <select [attr.aria-label]="i18n.t('canvas.' + level)" (change)="pick.emit({ level, id: $any($event.target).value })">
          <option value="" [selected]="!idAt(level)">{{ i18n.t(level === 'area' ? 'canvas.freeSpace' : 'task.none') }}</option>
          @for (option of options(level); track option.id) { <option [value]="option.id" [selected]="option.id === idAt(level)">{{ option.title }}</option> }
        </select></span>
    </ng-template>
    <ng-template #activity>
      <span class="pc-activity" [style.background]="color() || '#ffd5bd'"><small>{{ i18n.t('canvas.task') }}</small><strong>{{ title() || i18n.t('task.newTitle') }}</strong></span>
    </ng-template>
  `,
  imports: [NgTemplateOutlet],
})
export class WhereCard {
  protected readonly i18n = inject(I18n);
  readonly library = input.required<Library>();
  readonly where = input.required<Where>();
  readonly title = input('');
  readonly color = input<string | null>(null);
  readonly pick = output<{ level: WhereLevel; id: string }>();

  protected options(level: WhereLevel) {
    return whereOptions(this.library(), this.where(), level);
  }
  protected idAt(level: WhereLevel): string {
    return this.where()[level];
  }
  protected nameOf(level: WhereLevel): string {
    const id = this.where()[level];
    return id ? nodeById(this.library(), id)?.title ?? '' : '';
  }
}
