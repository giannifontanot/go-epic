import { ChangeDetectorRef, Component, ElementRef, TemplateRef, inject, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { I18n } from '../../core/i18n';
import { LibNode } from '../../core/library.model';
import { Task, blockColors, toneVar } from '../../core/week.model';
import { CanvasState } from './canvas-state';

/**
 * A Feature box, a Story container or an Activity capsule (Floating Canvas). Activities: grip, title, ✎ edit (in the
 * Undefined window, `loose`: no grip and no ✎, the whole card opens it). Features and
 * Stories: grip, label and fold ⌄ on the small label line, the title below on the whole width (a tap on it opens the actions).
 * An Activity's ✎ makes the card itself grow in place and become editable (Gianni): the page lends it its name box and the
 * body under it (`nameTpl`, `bodyTpl`), and its ✎ turns into ✓ to close it.
 */
@Component({
  selector: 'app-canvas-node',
  imports: [NgTemplateOutlet],
  template: `
    @let n = node();
    @let editing = n.kind === 'task' && editId() === n.id;
    @if (editing && loose() && bodyTpl()) {
      <!-- In the Undefined window an open Activity is only its place, drawn as the Canvas draws it (Gianni): no card of its
           colour around it and no title over it; its name is in its own ACTIVIDAD box, at the foot of the place card. -->
      <div class="loose-edit" [attr.data-editing]="n.id" [attr.data-node]="n.id" [style.--tone]="tone()" role="group" [attr.aria-label]="n.title">
        <ng-container *ngTemplateOutlet="bodyTpl(); context: { $implicit: n, loose: true }" />
      </div>
    } @else {
    <article class="object" [class.feature]="n.kind === 'feature'" [class.story]="n.kind === 'story'" [class.task]="n.kind === 'task'"
      [class.editing]="editing" [attr.data-editing]="editing ? n.id : null" [attr.data-node]="n.id" [attr.data-drop-kind]="n.kind" [attr.data-parent]="n.id" [style.--ox]="offset().x" [style.--oy]="offset().y"
      [style.background]="tone()" [style.--tone]="tone()" [attr.aria-label]="n.title">
      @if (n.kind === 'task') {
        <header>
          @if (!loose()) {
            <button type="button" class="grip" [disabled]="disabled() || editing" [attr.aria-label]="i18n.t('canvas.drag') + ' ' + n.title"
              (pointerdown)="drag.emit({ event: $event, node: n })">⠿</button>
          }
          <!-- ACTIVIDAD in small caps above its title (Gianni: like the Canvas's own card) -->
          @if (editing && nameTpl()) {
            <div class="name editing-name"><small aria-hidden="true">{{ i18n.t('canvas.task') }}</small><ng-container *ngTemplateOutlet="nameTpl(); context: { $implicit: n }" /></div>
          } @else if (loose()) {
            <!-- In the Undefined window the whole card is the button (Gianni: no ✎; a tap on the card opens it) -->
            <button type="button" class="name loose-open" [disabled]="disabled()" [attr.aria-label]="i18n.t('canvas.edit') + ' ' + n.title"
              (click)="action.emit(n)"><small aria-hidden="true">{{ i18n.t('canvas.task') }}</small><strong>{{ n.title }}</strong></button>
          } @else {
            <div class="name"><small aria-hidden="true">{{ i18n.t('canvas.task') }}</small><strong>{{ n.title }}</strong></div>
          }
          <!-- the same button turns ✎ into ✓, so the focus stays on it -->
          @if (!loose()) {
          <button type="button" class="more" [class.done]="editing" [disabled]="disabled()" [attr.aria-expanded]="editing"
            [attr.aria-label]="(editing ? i18n.t('task.done') : i18n.t('canvas.edit')) + ' ' + n.title"
            [title]="editing ? i18n.t('task.done') : i18n.t('canvas.edit')" (click)="action.emit(n)">{{ editing ? '✓' : '✎' }}</button>
          }
        </header>
        @if (editing && bodyTpl()) { <ng-container *ngTemplateOutlet="bodyTpl(); context: { $implicit: n }" /> }
      } @else {
        <!-- Features and Stories: the controls live on the small label line, so the title gets the whole width;
             tapping the title opens its actions (no ••• beside it); a ✎ pointing left right after the name says so (Gianni). -->
        <header class="stacked">
          <div class="node-bar">
            <button type="button" class="grip" [disabled]="disabled()" [attr.aria-label]="i18n.t('canvas.drag') + ' ' + n.title"
              (pointerdown)="drag.emit({ event: $event, node: n })">⠿</button>
            <small>{{ i18n.t('canvas.' + n.kind) }}</small>
            <button type="button" class="fold" [class.closed]="collapsed" [attr.aria-expanded]="!collapsed"
              [attr.aria-label]="i18n.t(collapsed ? 'canvas.expand' : 'canvas.collapse') + ' ' + n.title" (click)="toggle()">⌄</button>
          </div>
          <button type="button" class="title" [disabled]="disabled()" [attr.aria-label]="i18n.t('canvas.actions') + ' ' + n.title"
            [title]="i18n.t('canvas.actions') + ' ' + n.title" (click)="action.emit(n)"><strong>{{ n.title }}<span class="edit-pen" aria-hidden="true">✎</span></strong></button>
        </header>
      }
      @if (n.kind !== 'task' && !collapsed) {
        <div class="children">
          @for (child of children(); track child.id) {
            <app-canvas-node [node]="child" [state]="state()" [version]="version()" [disabled]="disabled()"
              [editId]="editId()" [nameTpl]="nameTpl()" [bodyTpl]="bodyTpl()"
              (drag)="drag.emit($event)" (action)="action.emit($event)" (add)="add.emit($event)" />
          }
          <button type="button" class="add" [disabled]="disabled()" (click)="add.emit(n)">
            + {{ i18n.t(n.kind === 'feature' ? 'canvas.addStory' : 'canvas.addTask') }}</button>
        </div>
      }
      @if (collapsed) { <span class="count">{{ children().length }} {{ i18n.t('canvas.contained') }}</span> }
    </article>
    }`,
  styleUrl: './canvas-node.css',
})
export class CanvasNode {
  protected readonly i18n = inject(I18n);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly cd = inject(ChangeDetectorRef);
  readonly node = input.required<LibNode>();
  readonly state = input.required<CanvasState>();
  /** Bumped by the page on every draft change, so the boxes re-read the (mutable) draft. */
  readonly version = input(0);
  readonly disabled = input(false);
  /** The Activity whose card is open for editing ('' = none), and what the page puts in it. */
  readonly editId = input('');
  readonly nameTpl = input<TemplateRef<unknown> | null>(null);
  readonly bodyTpl = input<TemplateRef<unknown> | null>(null);
  /** Its colour when the page knows it better (the Undefined window: never like the row above); undefined = worked out here. */
  readonly toneOverride = input<string | null | undefined>(undefined);
  /** A card outside the workspace (the Undefined window): no grip, no place of its own on the Canvas. */
  readonly loose = input(false);
  readonly drag = output<{ event: PointerEvent; node: LibNode }>();
  readonly action = output<LibNode>();
  readonly add = output<LibNode>();
  collapsed = false;

  toggle(): void {
    const el = this.host.nativeElement.querySelector<HTMLElement>('article')!;
    const oldHeight = el.getBoundingClientRect().height;
    this.collapsed = !this.collapsed;
    this.cd.detectChanges();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const height = el.getBoundingClientRect().height;
    el.style.overflow = 'clip';
    const animation = el.animate([{ height: `${oldHeight}px` }, { height: `${height}px` }], { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' });
    animation.finished.catch(() => {}).finally(() => (el.style.overflow = ''));
  }

  protected children(): LibNode[] {
    this.version();
    return this.state().children(this.node().id);
  }

  /** A task's pastel (its own picked colour, else the automatic one, never like the task above it); boxes keep their CSS. */
  protected tone(): string | null {
    this.version();
    const node = this.node();
    if (node.kind !== 'task') return null;
    const override = this.toneOverride();
    if (override !== undefined) return override;
    const siblings = this.state().children(node.parentId, 'task');
    const colors = blockColors(siblings as unknown as Task[]);
    return toneVar(colors[siblings.findIndex((n) => n.id === node.id)]);
  }

  /** Where the object sits on this device, as --ox / --oy (the CSS adds the tilt slide to them: core/tilt.ts). */
  protected offset(): { x: string; y: string } {
    this.version();
    if (this.loose()) return { x: '0px', y: '0px' };
    const p = this.state().layout[this.node().id];
    return { x: `${p?.x ?? 0}px`, y: `${p?.y ?? 0}px` };
  }
}
