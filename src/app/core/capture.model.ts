/**
 * Capture: quick notes, as in Epic Manager's floating panel. One Firestore document per user:
 *   users/{uid}/capture/notes   { items: Note[] }
 * A note can be done, starred, edited, deleted, or sent to the Floating Canvas as a task in Free Space.
 * Pure functions only, with specs.
 */
import { newId } from './week.model';

export interface Note {
  id: string;
  text: string;
  done: boolean;
  star: boolean;
  /** When it was written (millis). */
  at: number;
}

export function newNote(text: string, at: number): Note | null {
  const clean = text.trim();
  return clean ? { id: newId(), text: clean, done: false, star: false, at } : null;
}

/** Shown order: starred open notes, then the other open notes (newest first), then the done ones (newest first). */
export function sortNotes(notes: Note[]): Note[] {
  const rank = (n: Note) => (n.done ? 2 : n.star ? 0 : 1);
  return [...notes].sort((a, b) => rank(a) - rank(b) || b.at - a.at);
}

export function updateNote(notes: Note[], id: string, change: Partial<Pick<Note, 'text' | 'done' | 'star'>>): Note[] {
  return notes.map((n) => (n.id === id ? { ...n, ...change, text: change.text !== undefined ? change.text.trim() || n.text : n.text } : n));
}

export function removeNote(notes: Note[], id: string): Note[] {
  return notes.filter((n) => n.id !== id);
}

/** Firestore refuses `undefined`, and bad data is repaired on the way in and out. */
export function sanitizeNotes(raw: unknown): Note[] {
  const list = (raw as { items?: unknown })?.items;
  if (!Array.isArray(list)) return [];
  const out: Note[] = [];
  for (const item of list) {
    const n = item as Partial<Note>;
    if (!n || typeof n.id !== 'string' || typeof n.text !== 'string' || !n.text.trim()) continue;
    out.push({ id: n.id, text: n.text.trim(), done: n.done === true, star: n.star === true, at: Number.isFinite(n.at) ? Number(n.at) : 0 });
  }
  return out;
}
