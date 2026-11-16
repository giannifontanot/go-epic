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
      @if (pickCount() || linked()) {
        <!-- The Activity line is also the way to pick an existing one (Gianni: one card, no separate button): a tap opens
             the list; once one is picked it shows here, with a × that lets it go -->
        <span class="pc-activity pc-pickable" [class.chosen]="chosen()" [style.background]="color() || '#ffd5bd'">
          <button type="button" class="pc-act-open" aria-haspopup="dialog" (click)="activityTap.emit()">
            <small>{{ i18n.t('canvas.task') }}</small><strong>{{ title() || i18n.t('task.newTitle') }}</strong>
            @if (!linked()) { <em class="pc-act-hint">☰ {{ i18n.t('task.pickFromList', { n: pickCount() }) }} ›</em> }
          </button>
          @if (linked()) {
            <button type="button" class="pc-act-x" [attr.aria-label]="i18n.t('task.unlink')" [title]="i18n.t('task.unlink')" (click)="unlink.emit()">×</button>
          }
        </span>
      } @else {
        <span class="pc-activity" [style.background]="color() || '#ffd5bd'"><small>{{ i18n.t('canvas.task') }}</small><strong>{{ title() || i18n.t('task.newTitle') }}</strong></span>
      }
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
  /** How many existing activities can be picked (0: the Activity line is plain); a tap emits activityTap. */
  readonly pickCount = input(0);
  /** An existing activity is linked: the line shows it with a × (unlink). */
  readonly linked = input(false);
  /** The Activity line is the way in being used (a teal ring, like the chosen box). */
  readonly chosen = input(false);
  readonly activityTap = output<void>();
  readonly unlink = output<void>();

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
