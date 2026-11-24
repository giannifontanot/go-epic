import { LABEL_KEYS, labelFor } from './i18n';
import { LEVELS, LEVEL_SETS, levelText, parseLevelSet } from './levels.model';
import { WHY, WHY_SCREENS } from './why';

describe('Letreros (level names)', () => {
  it('has six sets with every level named in both languages', () => {
    expect(LEVEL_SETS.map((s) => s.id)).toEqual(['current', 'simple', 'epic', 'adventurer', 'fantasy', 'personal']);
    for (const set of LEVEL_SETS) for (const lang of ['en', 'es'] as const) {
      expect(set.name[lang]).toBeTruthy();
      for (const level of LEVELS) {
        expect(set.words[lang][level].one, `${set.id} ${lang} ${level}`).toBeTruthy();
        expect(set.words[lang][level].many, `${set.id} ${lang} ${level}`).toBeTruthy();
      }
    }
  });

  it('keeps the current names by default', () => {
    expect(parseLevelSet(null)).toBe('current');
    expect(parseLevelSet('nope')).toBe('current');
    expect(parseLevelSet('epic')).toBe('epic');
    expect(levelText('[task:Nuevo|Nueva] [task]', 'current', 'es')).toBe('Nueva Activity');
    expect(levelText('[epic:Este|Esta] [epic] está [epic:vacío|vacía]', 'current', 'es')).toBe('Este Epic está vacío');
    expect(levelText('Primero elige [area.el] [area] de arriba.', 'current', 'es')).toBe('Primero elige el Area de arriba.');
    expect(levelText('Add [task.a] [task] to this block', 'current', 'en')).toBe('Add an Activity to this block');
  });

  it('agrees in gender and number with another set', () => {
    expect(levelText('[task:Nuevo|Nueva] [task]', 'epic', 'es')).toBe('Nuevo Paso');
    expect(levelText('[epic:Este|Esta] [epic] está [epic:vacío|vacía]', 'epic', 'es')).toBe('Esta Ambición está vacía');
    expect(levelText('[epic.Los] [epic.p] de [area.los] cuatro [area.pl]', 'personal', 'es')).toBe('Las Aspiraciones de las cuatro dimensiones');
    expect(levelText('{n} [task.pl]', 'simple', 'en')).toBe('{n} actions');
    expect(levelText('Add [task.a] [task] to this block', 'epic', 'en')).toBe('Add a Step to this block');
    expect(levelText('[feature.u]', 'adventurer', 'es')).toBe('TRAVESÍA');
  });

  it('writes "u" before an o sound in Spanish', () => {
    expect(levelText('Busca [story.l] o [epic.l]…', 'simple', 'es')).toBe('Busca entrega u objetivo…');
    expect(levelText('Busca [story.l] o [epic.l]…', 'current', 'es')).toBe('Busca story o epic…');
  });

  it('leaves no token unfilled in any label or Why text', () => {
    const texts: string[] = [];
    for (const key of LABEL_KEYS) texts.push(labelFor(key, 'en')!, labelFor(key, 'es')!);
    for (const screen of WHY_SCREENS) for (const lang of ['en', 'es'] as const) {
      const w = WHY[screen][lang];
      texts.push(w.title, w.orders, w.lead, ...w.sections.flatMap((s) => [s.heading, ...s.body]));
    }
    for (const set of LEVEL_SETS) for (const lang of ['en', 'es'] as const) for (const text of texts) {
      expect(levelText(text, set.id, lang), text).not.toMatch(/\[(area|epic|feature|story|task)\b/);
    }
  });
});
