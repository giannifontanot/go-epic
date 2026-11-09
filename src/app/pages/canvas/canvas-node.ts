import { ChangeDetectorRef, Component, ElementRef, inject, input, output } from '@angular/core';
import { I18n } from '../../core/i18n';
import { LibNode } from '../../core/library.model';
import { Task, blockColors } from '../../core/week.model';
import { CanvasState } from './canvas-state';

/** A Feature box, a User story container or a Task capsule (Floating Canvas): grip to drag, ••• for its actions, ± to fold. */
@Component({
  selector: 'app-canvas-node',
  template: `
    @let n = node();
    <article class="object" [class.feature]="n.kind === 'feature'" [class.story]="n.kind === 'story'" [class.task]="n.kind === 'task'"
      [attr.data-node]="n.id" [attr.data-drop-kind]="n.kind" [attr.data-parent]="n.id" [style.translate]="offset()"
      [style.background]="tone()" [attr.aria-label]="n.title">
      <header>
        <button type="button" class="grip" [disabled]="disabled()" [attr.aria-label]="i18n.t('canvas.drag') + ' ' + n.title"
          (pointerdown)="drag.emit({ event: $event, node: n })">⠿</button>
        <div class="name"><small>{{ i18n.t('canvas.' + n.kind) }}</small><strong>{{ n.title }}</strong></div>
        <button type="button" class="more" [disabled]="disabled()" [attr.aria-label]="i18n.t('canvas.actions') + ' ' + n.title"
          (click)="action.emit(n)">•••</button>
        @if (n.kind !== 'task') {
          <button type="button" class="fold" [attr.aria-expanded]="!collapsed" [attr.aria-label]="i18n.t(collapsed ? 'canvas.expand' : 'canvas.collapse')"
            (click)="toggle()">{{ collapsed ? '+' : '−' }}</button>
        }
      </header>
      @if (n.kind !== 'task' && !collapsed) {
        <div class="children">
          @for (child of children(); track child.id) {
            <app-canvas-node [node]="child" [state]="state()" [version]="version()" [disabled]="disabled()"
              (drag)="drag.emit($event)" (action)="action.emit($event)" (add)="add.emit($event)" />
          }
          <button type="button" class="add" [disabled]="disabled()" (click)="add.emit(n)">
            + {{ i18n.t(n.kind === 'feature' ? 'canvas.addStory' : 'canvas.addTask') }}</button>
        </div>
      }
      @if (collapsed) { <span class="count">{{ children().length }} {{ i18n.t('canvas.contained') }}</span> }
    </article>`,
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
    const siblings = this.state().children(node.parentId, 'task');
    const colors = blockColors(siblings as unknown as Task[]);
    return colors[siblings.findIndex((n) => n.id === node.id)] ?? null;
  }

  protected offset(): string {
    this.version();
    const p = this.state().layout[this.node().id];
    return p ? `${p.x}px ${p.y}px` : '0px 0px';
  }
}
