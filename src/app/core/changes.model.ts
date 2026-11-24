import CHANGES_JSON from '../../../public/changes.json';
import { LANG_CODES, inLang, type Lang } from './i18n';

/**
 * What changed for the user, one short line per change in both languages (`public/changes.json`, Gianni: the update
 * window lists them so he knows what to look for). Each line carries `v`, the version (one published update) that
 * brought it, so the window can page through what every earlier update said (Gianni: arrows over the history).
 * The file is bundled into each build, so the running version knows its own last version, and is also served as
 * `/changes.json`, which the update window fetches fresh to read the waiting version's list.
 */
export type Change = { id: number; v: number; date: string } & { es: string; en: string } & Partial<Record<Lang, string>>;

/** One published version's page in the update window: its number, its date and its lines. */
export interface VersionPage { v: number; date: string; lines: string[]; isNew: boolean; }

export const CHANGES: readonly Change[] = sanitizeChanges(CHANGES_JSON);

/** The newest version this build knows. */
export function lastVersion(list: readonly Change[] = CHANGES): number {
  return list.reduce((max, c) => Math.max(max, c.v), 0);
}

/**
 * Keeps only well-formed entries (a fetched file is not trusted to be right). A line that forgot its `v` joins a
 * version of its own right after the line before it (consecutive such lines share it), so nothing is lost.
 */
export function sanitizeChanges(raw: unknown): Change[] {
  if (!Array.isArray(raw)) return [];
  const out: Change[] = [];
  let lastV = 0;
  let orphanV = 0;
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    const e = c as Partial<Change>;
    if (!Number.isInteger(e.id) || typeof e.date !== 'string' || typeof e.es !== 'string' || typeof e.en !== 'string') continue;
    let v: number;
    if (Number.isInteger(e.v) && (e.v as number) > 0) { v = e.v as number; orphanV = 0; }
    else { if (!orphanV) orphanV = lastV + 1; v = orphanV; }
    lastV = Math.max(lastV, v);
    const change: Change = { id: e.id as number, v, date: e.date, es: e.es, en: e.en };
    // Any other language of `LANGS` the line was translated into.
    for (const lang of LANG_CODES) {
      const text = e[lang];
      if (lang !== 'es' && lang !== 'en' && typeof text === 'string') Object.assign(change, { [lang]: text });
    }
    out.push(change);
  }
  return out;
}

/**
 * Every version as a page, newest first, with its lines in `lang` (English, then Spanish, when a line has no
 * translation in it yet), in the file's order. `isNew` marks the versions
 * newer than `sinceV`, the running build's last version.
 */
export function versionPages(list: readonly Change[], sinceV: number, lang: Lang): VersionPage[] {
  const byV = new Map<number, Change[]>();
  for (const c of list) byV.set(c.v, [...(byV.get(c.v) ?? []), c]);
  return [...byV.entries()].sort((a, b) => b[0] - a[0]).map(([v, items]) => ({
    v,
    date: items.reduce((d, c) => (c.date > d ? c.date : d), ''),
    lines: items.map((c) => (inLang(c, lang) ?? '').trim()).filter((t) => t !== ''),
    isNew: v > sinceV,
  })).filter((p) => p.lines.length > 0);
}
