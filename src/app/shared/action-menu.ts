import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { I18n } from '../core/i18n';
import { TodoStore } from '../core/todo.store';
import { WeekStore } from '../core/week.store';
import { CaptureUi, MenuAction } from '../pages/capture/capture-ui';
import { DayOverview } from './day-overview';
import { PageFan } from './page-fan';
import { ThemePicker } from './theme-fan';

export type { MenuAction };

/**
 * Two round buttons at the bottom right of every page (Gianni: so the screen is not full of buttons; they also replaced
 * the ☰ menu): the lowest is 💡 Capture (one window: a new task with its repeat days, day and hour over the Current and
 * Finished lists; Gianni merged New task into it and took the pages' 💡 away), and right above it the menu (four
 * squares; a panel ordered its actions by how often each is used). A tap on the menu stacks its actions above it, each
 * sliding up out of it, the nearest first, as the themes fan out: the day overview, ✎ Edit (the page's own: the Week board arranges the week, the Canvas opens its edit bar; a page with
 * nothing to edit shows the Themes in its place, Gianni: what the edit tools hold that applies there), the
 * pages and ⚙ Ajustes on top; on a short screen they go on in a second column. A tap on an action closes the menu and runs it (the
 * pages keep it open while their list is out); the button again, a tap outside or Esc draw them back in. Under reduced
 * motion they simply appear and go.
 */
@Component({
  selector: 'app-action-menu',
  imports: [PageFan, DayOverview],
  template: `
    @if (open()) { <div class="action-veil" aria-hidden="true" (click)="close()"></div> }
    <div id="action-stack" class="action-stack" [class.open]="open()" role="group" [attr.aria-label]="i18n.t('nav.actions')">
      @if (ready()) {
        <button type="button" class="capture-fab act-fab" [style.--i]="index().overview" [attr.aria-label]="i18n.t('week.overview')" [title]="i18n.t('week.overview')"
                (click)="run(showOverview)">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor">
            <circle cx="5" cy="6" r="1.8"/><rect x="9" y="5" width="12" height="2" rx="1"/>
            <circle cx="9" cy="12" r="1.6"/><rect x="13" y="11" width="8" height="2" rx="1"/>
            <circle cx="9" cy="18" r="1.6"/><rect x="13" y="17" width="8" height="2" rx="1"/>
          </svg>
        </button>
      }
      @if (edit(); as action) {
        <button type="button" class="capture-fab act-fab edit-fab" [style.--i]="index().edit" [attr.aria-label]="action.label" [title]="action.label"
                (click)="run(action.run)">✎</button>
      } @else {
        <!-- a page with nothing to edit (Progress…) offers in Edit's place what the edit tools hold that applies there:
             for now only the Themes (Gianni); they fan out to its left and the menu stays open behind them -->
        <button #themeBtn type="button" class="capture-fab act-fab theme-act" [class.open]="themeOpen()" [attr.aria-expanded]="themeOpen()"
                [style.--i]="index().edit" [attr.aria-label]="i18n.t('settings.theme')" [title]="i18n.t('settings.theme')"
                (click)="toggleThemes($event.currentTarget)">
          <svg viewBox="0 0 24 24" width="27" height="27" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
            <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1 0 1.6-.7 1.6-1.5 0-.5-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.9.7-1.6 1.6-1.6H16a4.6 4.6 0 0 0 4.5-4.6C20.5 6.7 16.7 3.5 12 3.5Z"/>
            <g fill="currentColor" stroke="none"><circle cx="7.6" cy="11" r="1.3"/><circle cx="10" cy="7.5" r="1.3"/>
            <circle cx="14.4" cy="7.5" r="1.3"/><circle cx="16.8" cy="11" r="1.3"/></g>
          </svg>
        </button>
      }
      <app-page-fan [style.--i]="index().pages" (went)="close()" />
      <!-- Ajustes, its own button on top (Gianni): language, weighted buttons, red time line -->
      <button type="button" class="capture-fab act-fab" [style.--i]="index().settings" [attr.aria-label]="i18n.t('settings.title')" [title]="i18n.t('settings.title')"
              (click)="run(openSettings)">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/>
          <circle cx="12" cy="12" r="6.3"/>
        </svg>
      </button>
    </div>
    <button type="button" class="capture-fab menu-fab" [class.open]="open()" [attr.aria-expanded]="open()" aria-controls="action-stack"
            [attr.aria-label]="i18n.t('nav.actions')" [title]="i18n.t('nav.actions')" (click)="toggle()">
      @if (open()) {
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>
        </svg>
      } @else {
        <!-- four small rounded squares: "more actions" -->
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
          <rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/>
          <rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/>
        </svg>
      }
    </button>
    <!-- 💡 Capture, its own round button under the menu's (Gianni: two buttons at the foot, the bulb the lowest): one
         window with the new task (its repeat days, day and hour) over the Current and Finished lists; no words -->
    <button type="button" class="capture-fab idea-fab" [attr.aria-label]="i18n.t('capture.open')" [title]="i18n.t('capture.open')"
            (click)="run(openCapture)"><span aria-hidden="true">💡</span></button>
    <app-day-overview />
  `,
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class ActionMenu {
  protected readonly i18n = inject(I18n);
  private readonly week = inject(WeekStore);
  private readonly todos = inject(TodoStore);
  private readonly capture = inject(CaptureUi);
  /** The page's own action, at the bottom of the stack (the Week board's ✎ arrange; set by the page, CaptureUi.menuEdit). */
  protected readonly edit = this.capture.menuEdit;
  protected readonly open = signal(false);
  private readonly pagesFan = viewChild(PageFan);
  private readonly overviewWindow = viewChild.required(DayOverview);
  /** The overview needs today's plan and Capture's tasks. */
  protected readonly ready = computed(() => this.week.loaded() && this.todos.ready());
  /** Each action's place from the bottom (0 = just above the round button), for its slide and its delay. */
  protected readonly index = computed(() => {
    let i = 0;
    const overview = this.ready() ? i++ : -1;
    const edit = i++;   // ✎ Edit, or the Themes where the page has nothing to edit
    const pages = i++;
    return { overview, edit, pages, settings: i };
  });

  protected toggle(): void {
    if (this.open()) this.close(); else this.open.set(true);
  }
  protected close(): void {
    this.pagesFan()?.close();
    if (this.themeOpen()) this.picker.anchor.set(null);
    this.open.set(false);
  }
  /** Esc draws the actions back, unless the pages are fanned out (they close first, on the same Esc). */
  protected onEscape(): void {
    if (this.open() && !this.pagesFan()?.isOpen() && !this.themeOpen()) this.close();
  }
  private readonly picker = inject(ThemePicker);
  private readonly themeBtn = viewChild<ElementRef<HTMLButtonElement>>('themeBtn');
  /** The themes are fanned out of this menu's Themes button. */
  protected readonly themeOpen = computed(() => {
    const a = this.picker.anchor();
    return !!a && a === this.themeBtn()?.nativeElement;
  });
  /** Fans the themes out of the button (or draws them back); the menu stays open behind them. */
  protected toggleThemes(button: EventTarget | null): void {
    if (!(button instanceof HTMLElement)) return;
    this.pagesFan()?.close();
    this.picker.toggle(button);
  }
  protected run(action: () => void): void {
    this.close();
    action();
  }
  protected readonly showOverview = () => this.overviewWindow().open();
  /** 💡: Capture's one window (a new task with its repeat days, day and hour, over the Current and Finished lists). */
  protected readonly openCapture = () => this.capture.open.set(true);
  protected readonly openSettings = () => this.capture.settings.set(true);
}
