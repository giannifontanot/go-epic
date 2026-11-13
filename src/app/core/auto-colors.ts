import { Injectable } from '@angular/core';

const KEY = 'go-epic-auto-colors';

/**
 * The automatic colour each card got the first time it was drawn, kept on this device (keyed by its library task,
 * else its id), so moving a card between blocks never recolours it or its neighbours (Gianni). `blockColors` fills
 * the map; it is saved shortly after it changes and pruned to the cards that still exist.
 */
@Injectable({ providedIn: 'root' })
export class AutoColors {
  readonly map = new Map<string, string>(this.load());
  private saving = 0;

  /** Save soon (once per burst of drawing); `live` lists the keys of the cards that still exist. */
  save(live: () => Iterable<string>): void {
    if (this.saving) return;
    this.saving = window.setTimeout(() => {
      this.saving = 0;
      const keep = new Set(live());
      if (keep.size) for (const key of [...this.map.keys()]) if (!keep.has(key)) this.map.delete(key);
      try { localStorage.setItem(KEY, JSON.stringify([...this.map])); } catch { /* a view nicety */ }
    }, 500);
  }

  private load(): [string, string][] {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      return Array.isArray(raw) ? raw.filter((e): e is [string, string] => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string') : [];
    } catch { return []; }
  }
}
