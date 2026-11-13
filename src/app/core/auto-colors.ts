import { Injectable, inject } from '@angular/core';
import { DAYS } from './week.model';
import { WeekStore } from './week.store';

const KEY = 'go-epic-auto-colors';

/**
 * The automatic colour each card got the first time it was drawn, kept on this device (keyed by its library task,
 * else its id), so moving a card between blocks never recolours it or its neighbours (Gianni). `blockColors` fills
 * the map (Week board and Focus alike); `saveIfGrown` saves it shortly after it gains entries, and only once the whole
 * week has loaded does it prune the cards that no longer exist (a half-loaded week must not forget the other days').
 */
@Injectable({ providedIn: 'root' })
export class AutoColors {
  private readonly store = inject(WeekStore);
  readonly map = new Map<string, string>(this.load());
  private savedSize = this.map.size;
  private saving = 0;

  /** Call after drawing with the map: a save is scheduled when new colours were chosen. */
  saveIfGrown(): void {
    if (this.map.size === this.savedSize || this.saving) return;
    this.saving = window.setTimeout(() => this.save(), 500);
  }

  private save(): void {
    this.saving = 0;
    if (this.store.loaded()) {
      const week = this.store.week();
      const live = new Set(DAYS.flatMap((day) => week[day].blocks.flatMap((b) => b.tasks.map((t) => t.ref || t.id))));
      for (const key of [...this.map.keys()]) if (!live.has(key)) this.map.delete(key);
    }
    this.savedSize = this.map.size;
    try { localStorage.setItem(KEY, JSON.stringify([...this.map])); } catch { /* a view nicety */ }
  }

  private load(): [string, string][] {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      return Array.isArray(raw) ? raw.filter((e): e is [string, string] => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string') : [];
    } catch { return []; }
  }
}
