/**
 * The overdue tray at the foot of the Week board folds down to its top border (Gianni): a tap on that border slides
 * its list out of sight, another brings it back. Remembered on this device, a view preference only.
 */
export const TRAY_FOLD_KEY = 'go-epic-tray-folded';

/**
 * Whether the tray was left folded; any trouble reading storage means open. The storage is reached inside the guard,
 * since even reading `localStorage` throws when the browser blocks it.
 */
export function readTrayFolded(store: () => Pick<Storage, 'getItem'> = () => localStorage): boolean {
  try { return store().getItem(TRAY_FOLD_KEY) === '1'; } catch { return false; }
}

/** Remembers the tray's fold; a storage that refuses it (or is blocked) changes nothing else. */
export function writeTrayFolded(folded: boolean, store: () => Pick<Storage, 'setItem'> = () => localStorage): void {
  try { store().setItem(TRAY_FOLD_KEY, folded ? '1' : '0'); } catch { /* a view preference */ }
}
