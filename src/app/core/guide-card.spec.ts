import { GUIDE_CARD_KEY, readGuideCard, writeGuideCard } from './guide-card';

describe('guide card', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
  };

  it('starts on the first card and remembers the last one on this device', () => {
    const store = memory();
    expect(readGuideCard(12, () => store)).toBe(0);
    writeGuideCard(7, () => store);
    expect(store.getItem(GUIDE_CARD_KEY)).toBe('7');
    expect(readGuideCard(12, () => store)).toBe(7);
  });

  it('clamps to the cards there are now', () => {
    const store = memory();
    writeGuideCard(11, () => store);
    expect(readGuideCard(8, () => store)).toBe(7);
    expect(readGuideCard(0, () => store)).toBe(0);
  });

  it('reads anything unexpected, or a storage that throws, as the first card', () => {
    expect(readGuideCard(12, () => ({ getItem: () => 'abc' }))).toBe(0);
    expect(readGuideCard(12, () => ({ getItem: () => '-3' }))).toBe(0);
    expect(readGuideCard(12, () => ({ getItem: () => '2.5' }))).toBe(0);
    expect(readGuideCard(12, () => { throw new Error('blocked'); })).toBe(0);
    expect(() => writeGuideCard(3, () => ({ setItem: () => { throw new Error('full'); } }))).not.toThrow();
  });
});
