import { TRAY_FOLD_KEY, readTrayFolded, writeTrayFolded } from './tray-fold';

describe('tray fold', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
  };

  it('starts open and remembers a fold on this device', () => {
    const store = memory();
    expect(readTrayFolded(store)).toBe(false);
    writeTrayFolded(store, true);
    expect(store.getItem(TRAY_FOLD_KEY)).toBe('1');
    expect(readTrayFolded(store)).toBe(true);
    writeTrayFolded(store, false);
    expect(readTrayFolded(store)).toBe(false);
  });

  it('reads anything unexpected, or a storage that throws, as open', () => {
    expect(readTrayFolded({ getItem: () => 'yes' })).toBe(false);
    expect(readTrayFolded({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
    expect(() => writeTrayFolded({ setItem: () => { throw new Error('full'); } }, true)).not.toThrow();
  });
});
