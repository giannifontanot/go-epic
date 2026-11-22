import { cleanDateName } from './year.model';

/**
 * The notes of an important day (Gianni: a day can be important for many reasons, a birthday, the start of spring…,
 * so it holds a list that grows). One document per day, users/{uid}/dates/{YYYY-MM-DD}
 * { notes: [{ id, name, created, calendar? }], name, created }: `calendar` is set only on a note imported from a Google
 * calendar (calendar-import.ts), and renaming a note by hand drops it; `name` repeats the notes joined, for an older
 * version of the app that knew only one name. A document from before the lists ({ name, created, calendar? }) reads
 * as a day with that single note, so nothing is lost; it takes the new shape the next time the day changes.
 */
export interface DateNote { id: string; name: string; created: number; calendar: string | null }

/**
 * The day's notes as stored (`key`, its date), an old single-name document included as one note whose id comes from
 * its date, so it stays the same and unique; broken entries are left out.
 */
export function readNotes(data: Record<string, unknown> | undefined, key: string): DateNote[] {
  if (!data) return [];
  const calendarOf = (v: unknown) => typeof v === 'string' && v ? v : null;
  const createdOf = (v: unknown) => typeof v === 'number' && isFinite(v) ? v : 0;
  if (Array.isArray(data['notes'])) {
    const out: DateNote[] = [];
    const seen = new Set<string>();
    for (const raw of data['notes'] as unknown[]) {
      if (!raw || typeof raw !== 'object') continue;
      const n = raw as Record<string, unknown>;
      const name = cleanDateName(n['name']);
      const id = typeof n['id'] === 'string' && n['id'] ? n['id'] : null;
      if (!name || !id || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name, created: createdOf(n['created']), calendar: calendarOf(n['calendar']) });
    }
    return out;
  }
  const name = cleanDateName(data['name']);
  return name ? [{ id: `first-${key}`, name, created: createdOf(data['created']), calendar: calendarOf(data['calendar']) }] : [];
}

/** What a day's document holds for its notes (Firestore refuses undefined, so a note by hand has no `calendar`). */
export function notesDoc(notes: readonly DateNote[]): Record<string, unknown> {
  return {
    notes: notes.map((n) => n.calendar ? { id: n.id, name: n.name, created: n.created, calendar: n.calendar } : { id: n.id, name: n.name, created: n.created }),
    name: cleanDateName(notes.map((n) => n.name).join(' · ')) ?? '',
    created: firstCreated(notes),
  };
}

/** When the day was first marked: its oldest note, else now. */
function firstCreated(notes: readonly DateNote[]): number {
  const times = notes.map((n) => n.created).filter((t) => t > 0);
  return times.length ? Math.min(...times) : Date.now();
}

/** The day's notes joined, for a label ("Ana's birthday · Spring begins"). */
export function notesLabel(notes: readonly DateNote[] | undefined): string {
  return (notes ?? []).map((n) => n.name).join(' · ');
}
