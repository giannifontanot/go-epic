/** Interaction-only motion. Geometry is visual state and never changes the hierarchy. */
export class CanvasMotion {
  private animations = new Set<Animation>();
  reduced(): boolean { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  capture(root: HTMLElement): Map<string, DOMRect> {
    return new Map(Array.from(root.querySelectorAll<HTMLElement>('[data-node]')).map(el => [el.dataset['node']!, el.getBoundingClientRect()]));
  }
  ghost(source: HTMLElement): HTMLElement {
    const rect = source.getBoundingClientRect();
    const ghost = source.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('data-node'); ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
    Object.assign(ghost.style, { position:'fixed', left:`${rect.left}px`, top:`${rect.top}px`, width:`${rect.width}px`,
      height:`${rect.height}px`, margin:'0', translate:'none', zIndex:'10000', pointerEvents:'none', boxSizing:'border-box',
      boxShadow:'0 20px 45px #0005', opacity:'.95' });
    document.body.append(ghost); return ghost;
  }
  layout(root: HTMLElement, before: Map<string, DOMRect>, excluded?: string): void {
    if (this.reduced()) return;
    root.querySelectorAll<HTMLElement>('[data-node]').forEach(el => {
      if (el.dataset['node'] === excluded || el.closest(`[data-node="${CSS.escape(excluded || '__none__')}"]`)) return;
      const old = before.get(el.dataset['node']!), now = el.getBoundingClientRect();
      if (!old) { this.animate(el, [{opacity:0, transform:'scale(.96)'}, {opacity:1, transform:'none'}]); return; }
      // Subtract the parent's displacement so nested objects do not move twice.
      const parent = el.parentElement?.closest<HTMLElement>('[data-node]');
      const parentOld = parent ? before.get(parent.dataset['node']!) : undefined;
      const parentNow = parent?.getBoundingClientRect();
      const dx = old.left - now.left - (parentOld && parentNow ? parentOld.left - parentNow.left : 0);
      const dy = old.top - now.top - (parentOld && parentNow ? parentOld.top - parentNow.top : 0);
      if (Math.abs(dx) + Math.abs(dy) > 1) this.animate(el, [{transform:`translate(${dx}px, ${dy}px)`}, {transform:'none'}]);
      if (Math.abs(old.height - now.height) > 2 && el.dataset['dropKind'] !== 'TASK') {
        const overflow = el.style.overflow;
        el.style.overflow = 'clip';
        const resize = this.animate(el, [{height:`${old.height}px`,boxSizing:'border-box'}, {height:`${now.height}px`,boxSizing:'border-box'}]);
        resize.finished.catch(() => {}).finally(() => el.style.overflow = overflow);
      }
    });
  }
  async land(ghost: HTMLElement, target: HTMLElement | null, fallback: HTMLElement | null): Promise<void> {
    if (this.reduced()) { ghost.remove(); return; }
    const from = ghost.getBoundingClientRect(), to = (target || fallback)?.getBoundingClientRect();
    if (target) target.style.visibility = 'hidden';
    try {
      if (to) {
        const animation = this.animate(ghost, [
          {transform:ghost.style.transform || 'none', opacity:.95},
          {transform:`translate(${to.left - parseFloat(ghost.style.left)}px, ${to.top - parseFloat(ghost.style.top)}px) scale(${target ? to.width / from.width : .22})`, opacity:target ? 1 : 0}
        ]);
        await animation.finished.catch(() => {});
      }
    } finally { ghost.remove(); if (target) target.style.visibility = ''; }
  }
  animate(el: HTMLElement, frames: Keyframe[]): Animation {
    const animation = el.animate(frames, {duration:420, easing:'cubic-bezier(.22,1.08,.36,1)', fill:'none'});
    this.animations.add(animation); animation.finished.catch(() => {}).finally(() => this.animations.delete(animation));
    return animation;
  }
  destroy(): void { this.animations.forEach(a => a.cancel()); this.animations.clear(); }
}
