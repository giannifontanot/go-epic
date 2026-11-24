import { inLang, type Lang, type Texts } from './i18n';

/**
 * Letreros / Labels (Gianni): the names the app gives its five levels. One of six sets is chosen (no names of one's
 * own); the chosen set replaces the level names everywhere, in the language in use. Pure, with a spec.
 *
 * Every label that names a level writes a token instead of the word, and `levelText` fills it in:
 * - `[epic]` the name as written (Epic, Objetivo…), `[epic.l]` in lower case, `[epic.u]` in capitals,
 * - `[epic.p]` the plural, `[epic.pl]` the plural in lower case,
 * - `[epic.a]` / `[epic.A]` the indefinite article (un / una, a / an), `[epic.el]` / `[epic.El]` the definite one
 *   (el / la, the), `[epic.los]` / `[epic.Los]` the plural one (los / las, the),
 * - `[epic:nuevo|nueva]` the first word for a masculine name, the second for a feminine one (Spanish only).
 * The levels are area, epic, feature, story and task (the Activity, `kind: 'task'` in the code).
 */
export type Level = 'area' | 'epic' | 'feature' | 'story' | 'task';
export const LEVELS: readonly Level[] = ['area', 'epic', 'feature', 'story', 'task'];

export type LevelSetId = 'current' | 'simple' | 'epic' | 'adventurer' | 'fantasy' | 'personal';

export interface LevelWord {
  one: string;
  many: string;
  /** Spanish: a feminine name (la Actividad, una Misión). */
  f?: boolean;
  /** Spanish: a feminine name that starts with a stressed a takes el / un (el área, un área). */
  elUn?: boolean;
}

export interface LevelSet {
  id: LevelSetId;
  name: Texts;
  /** English and Spanish required; another language may have its own (else English is used). */
  words: Texts<Record<Level, LevelWord>>;
}

const w = (one: string, many: string, f = false, elUn = false): LevelWord => ({ one, many, ...(f ? { f } : {}), ...(elUn ? { elUn } : {}) });
const AREA_ES = w('Área', 'Áreas', true, true);
const AREA_EN = w('Area', 'Areas');

/** The six sets, in Gianni's order (Aventura, not Gesta). The first is the app's own names; the default is DEFAULT_LEVEL_SET (Sencillo). */
export const LEVEL_SETS: readonly LevelSet[] = [
  {
    id: 'current', name: { es: 'Actual', en: 'Current' },
    words: {
      es: { area: w('Area', 'Areas', true, true), epic: w('Epic', 'Epics'), feature: w('Feature', 'Features'), story: w('Story', 'Stories', true), task: w('Activity', 'Activities', true) },   // all in English (Gianni, v80), Spanish genders kept: el Area, la Activity
      en: { area: AREA_EN, epic: w('Epic', 'Epics'), feature: w('Feature', 'Features'), story: w('Story', 'Stories'), task: w('Activity', 'Activities') },
    },
  },
  {
    id: 'simple', name: { es: 'Sencillo', en: 'Simple' },
    words: {
      es: { area: AREA_ES, epic: w('Objetivo', 'Objetivos'), feature: w('Proyecto', 'Proyectos'), story: w('Entrega', 'Entregas', true), task: w('Acción', 'Acciones', true) },
      en: { area: AREA_EN, epic: w('Goal', 'Goals'), feature: w('Project', 'Projects'), story: w('Deliverable', 'Deliverables'), task: w('Action', 'Actions') },
    },
  },
  {
    id: 'epic', name: { es: 'Épico', en: 'Epic' },
    words: {
      es: { area: w('Reino', 'Reinos'), epic: w('Ambición', 'Ambiciones', true), feature: w('Aventura', 'Aventuras', true), story: w('Misión', 'Misiones', true), task: w('Paso', 'Pasos') },
      en: { area: w('Realm', 'Realms'), epic: w('Ambition', 'Ambitions'), feature: w('Adventure', 'Adventures'), story: w('Mission', 'Missions'), task: w('Step', 'Steps') },
    },
  },
  {
    id: 'adventurer', name: { es: 'Aventurero', en: 'Adventurer' },
    words: {
      es: { area: w('Territorio', 'Territorios'), epic: w('Destino', 'Destinos'), feature: w('Travesía', 'Travesías', true), story: w('Etapa', 'Etapas', true), task: w('Paso', 'Pasos') },
      en: { area: w('Territory', 'Territories'), epic: w('Destiny', 'Destinies'), feature: w('Journey', 'Journeys'), story: w('Stage', 'Stages'), task: w('Step', 'Steps') },
    },
  },
  {
    id: 'fantasy', name: { es: 'Fantástico', en: 'Fantasy' },
    words: {
      es: { area: w('Reino', 'Reinos'), epic: w('Visión', 'Visiones', true), feature: w('Aventura', 'Aventuras', true), story: w('Misión', 'Misiones', true), task: w('Acción', 'Acciones', true) },
      en: { area: w('Realm', 'Realms'), epic: w('Vision', 'Visions'), feature: w('Adventure', 'Adventures'), story: w('Mission', 'Missions'), task: w('Action', 'Actions') },
    },
  },
  {
    id: 'personal', name: { es: 'Personal', en: 'Personal' },
    words: {
      es: { area: w('Dimensión', 'Dimensiones', true), epic: w('Aspiración', 'Aspiraciones', true), feature: w('Desafío', 'Desafíos'), story: w('Misión', 'Misiones', true), task: w('Paso', 'Pasos') },
      en: { area: w('Dimension', 'Dimensions'), epic: w('Aspiration', 'Aspirations'), feature: w('Challenge', 'Challenges'), story: w('Mission', 'Missions'), task: w('Step', 'Steps') },
    },
  },
];

/** Sencillo / Simple until someone picks another (Gianni, v80: understood at first sight, with no English or method needed). */
export const DEFAULT_LEVEL_SET: LevelSetId = 'simple';

/** A stored choice, or the default for anything unknown. */
export function parseLevelSet(value: unknown): LevelSetId {
  return LEVEL_SETS.some((s) => s.id === value) ? (value as LevelSetId) : DEFAULT_LEVEL_SET;
}

export function levelSet(id: LevelSetId): LevelSet {
  return LEVEL_SETS.find((s) => s.id === id) ?? LEVEL_SETS.find((s) => s.id === DEFAULT_LEVEL_SET)!;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const TOKEN = /\[(area|epic|feature|story|task)(?:\.(l|u|p|pl|a|A|el|El|los|Los))?(?::([^|\]]*)\|([^\]]*))?\]/g;

function article(word: LevelWord, lang: Lang, form: 'a' | 'el' | 'los'): string {
  if (lang === 'en') return form === 'a' ? (/^[aeiou]/i.test(word.one) ? 'an' : 'a') : 'the';
  if (form === 'los') return word.f ? 'las' : 'los';
  if (form === 'el') return word.f && !word.elUn ? 'la' : 'el';
  return word.f && !word.elUn ? 'una' : 'un';
}

/** Fills in a label's level tokens with the chosen set's words in that language. */
export function levelText(text: string, id: LevelSetId, lang: Lang): string {
  if (!text.includes('[')) return text;
  const set = levelSet(id);
  if (!set.words[lang]) lang = 'en';   // a language with no words of its own uses the English ones
  const words = inLang(set.words, lang)!;
  let out = text.replace(TOKEN, (_all, level: Level, form: string | undefined, masc: string | undefined, fem: string | undefined) => {
    const word = words[level];
    if (masc !== undefined) return word.f ? fem ?? '' : masc;
    switch (form) {
      case 'l': return word.one.toLowerCase();
      case 'u': return word.one.toUpperCase();
      case 'p': return word.many;
      case 'pl': return word.many.toLowerCase();
      case 'a': case 'el': case 'los': return article(word, lang, form);
      case 'A': return cap(article(word, lang, 'a'));
      case 'El': return cap(article(word, lang, 'el'));
      case 'Los': return cap(article(word, lang, 'los'));
      default: return word.one;
    }
  });
  // Spanish "o" becomes "u" before a word that starts with an o sound (u objetivo).
  if (lang === 'es') out = out.replace(/(^|\s)([oO]) (?=h?[oóOÓ])/g, (_m, space: string, o: string) => `${space}${o === 'O' ? 'U' : 'u'} `);
  return out;
}
