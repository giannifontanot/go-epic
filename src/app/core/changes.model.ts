import CHANGES_JSON from '../../../public/changes.json';

/**
 * What changed for the user, one short line per change in both languages (`public/changes.json`, Gianni: the update
 * window lists them so he knows what to look for). The file is bundled into each build, so the running version knows
 * its own last change, and is also served as `/changes.json`, which the update window fetches fresh to read the
 * waiting version's list.
 */
export interface Change { id: number; date: string; es: string; en: string; }

export const CHANGES: readonly Change[] = sanitizeChanges(CHANGES_JSON);

/** The id of the newest change this build knows. */
export function lastChangeId(list: readonly Change[] = CHANGES): number {
  return list.reduce((max, c) => Math.max(max, c.id), 0);
}

/** Keeps only well-formed entries (a fetched file is not trusted to be right). */
export function sanitizeChanges(raw: unknown): Change[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is Change => !!c && typeof c === 'object'
    && Number.isInteger((c as Change).id) && typeof (c as Change).date === 'string'
    && typeof (c as Change).es === 'string' && typeof (c as Change).en === 'string');
}

/** The changes newer than `sinceId`, newest first, at most `max` of them, as text in `lang`. */
export function newChanges(list: readonly Change[], sinceId: number, lang: 'en' | 'es', max = 12): string[] {
  return list.filter((c) => c.id > sinceId).sort((a, b) => b.id - a.id).slice(0, max)
    .map((c) => (lang === 'es' ? c.es : c.en).trim()).filter((text) => text !== '');
}
