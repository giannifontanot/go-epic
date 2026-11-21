import { CHANGES, lastVersion, sanitizeChanges, versionPages } from './changes.model';
import CHANGES_JSON from '../../../public/changes.json';

describe('changes list', () => {
  it('has unique, increasing ids, a version on every line that never goes back, and both languages', () => {
    expect(CHANGES.length).toBeGreaterThan(0);
    (CHANGES_JSON as unknown[]).forEach((raw) => expect(Number.isInteger((raw as { v?: number }).v)).toBe(true));
    CHANGES.forEach((c, i) => {
      if (i > 0) {
        expect(c.id).toBeGreaterThan(CHANGES[i - 1].id);
        expect(c.v).toBeGreaterThanOrEqual(CHANGES[i - 1].v);
      }
      expect(c.es.trim()).not.toBe('');
      expect(c.en.trim()).not.toBe('');
      expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
    expect(lastVersion()).toBe(CHANGES[CHANGES.length - 1].v);
  });

  const list = [
    { id: 1, v: 1, date: '2026-11-20', es: 'uno', en: 'one' },
    { id: 2, v: 2, date: '2026-11-21', es: 'dos', en: 'two' },
    { id: 3, v: 2, date: '2026-11-21', es: 'tres', en: 'three' },
    { id: 4, v: 3, date: '2026-11-22', es: 'cuatro', en: 'four' },
  ];

  it('pages every version, newest first, marking the ones newer than the running build', () => {
    const pages = versionPages(list, 1, 'es');
    expect(pages.map((p) => p.v)).toEqual([3, 2, 1]);
    expect(pages[1]).toEqual({ v: 2, date: '2026-11-21', lines: ['dos', 'tres'], isNew: true });
    expect(pages.map((p) => p.isNew)).toEqual([true, true, false]);
    expect(versionPages(list, 3, 'en').every((p) => !p.isNew)).toBe(true);
  });

  it('drops malformed entries and gives a line that forgot its version a version of its own', () => {
    expect(sanitizeChanges(null)).toEqual([]);
    expect(sanitizeChanges([{ id: 1, v: 1, date: 'x', es: 'a', en: 'b' }, { id: 'x' }, 5]))
      .toEqual([{ id: 1, v: 1, date: 'x', es: 'a', en: 'b' }]);
    const fixed = sanitizeChanges([
      { id: 1, v: 4, date: 'x', es: 'a', en: 'a' },
      { id: 2, date: 'x', es: 'b', en: 'b' },
      { id: 3, date: 'x', es: 'c', en: 'c' },
      { id: 4, v: 6, date: 'x', es: 'd', en: 'd' },
    ]);
    expect(fixed.map((c) => c.v)).toEqual([4, 5, 5, 6]);
  });
});
