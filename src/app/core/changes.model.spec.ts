import { CHANGES, lastChangeId, newChanges, sanitizeChanges } from './changes.model';

describe('changes list', () => {
  it('has unique, increasing ids and both languages', () => {
    expect(CHANGES.length).toBeGreaterThan(0);
    CHANGES.forEach((c, i) => {
      if (i > 0) expect(c.id).toBeGreaterThan(CHANGES[i - 1].id);
      expect(c.es.trim()).not.toBe('');
      expect(c.en.trim()).not.toBe('');
      expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
    expect(lastChangeId()).toBe(CHANGES[CHANGES.length - 1].id);
  });

  it('lists only what is newer than the running version, newest first', () => {
    const list = [
      { id: 1, date: '2026-11-20', es: 'uno', en: 'one' },
      { id: 2, date: '2026-11-21', es: 'dos', en: 'two' },
      { id: 3, date: '2026-11-21', es: 'tres', en: 'three' },
    ];
    expect(newChanges(list, 1, 'es')).toEqual(['tres', 'dos']);
    expect(newChanges(list, 3, 'en')).toEqual([]);
    expect(newChanges(list, 0, 'en', 2)).toEqual(['three', 'two']);
  });

  it('drops malformed entries from a fetched file', () => {
    expect(sanitizeChanges(null)).toEqual([]);
    expect(sanitizeChanges([{ id: 1, date: 'x', es: 'a', en: 'b' }, { id: 'x' }, 5])).toEqual([{ id: 1, date: 'x', es: 'a', en: 'b' }]);
  });
});
