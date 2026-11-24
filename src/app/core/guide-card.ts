/**
 * «Instrucciones de uso» remembers the card you were on (Gianni: always, on this device, even after closing the app),
 * so the page opens on it again. A view preference only.
 */
export const GUIDE_CARD_KEY = 'go-epic-instructions-card';

/**
 * The card to open on, clamped to the cards there are now (their number may change); anything unreadable, or a storage
 * that throws (even reaching `localStorage` can), means the first card.
 */
export function readGuideCard(count: number, store: () => Pick<Storage, 'getItem'> = () => localStorage): number {
  if (count <= 0) return 0;
  let raw: string | null = null;
  try { raw = store().getItem(GUIDE_CARD_KEY); } catch { return 0; }
  const n = raw === null || !/^\d+$/.test(raw.trim()) ? 0 : Number(raw.trim());
  return Math.min(Math.max(n, 0), count - 1);
}

/** Remembers the card shown; a storage that refuses it changes nothing else. */
export function writeGuideCard(index: number, store: () => Pick<Storage, 'setItem'> = () => localStorage): void {
  try { store().setItem(GUIDE_CARD_KEY, String(Math.max(0, Math.floor(index)))); } catch { /* a view preference */ }
}
