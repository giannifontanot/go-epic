import { addDays } from './period.model';
import { DateNote } from './date-notes';
import { dateKey, newId } from './week.model';
import { cleanDateName } from './year.model';

/**
 * Importing important dates from Google Calendar (Gianni: optional, on top of the dates kept in Go Epic). Pure rules:
 * which day each event lands on, and what a re-import writes and removes. The reading itself is in google-calendar.ts.
 */

/** The parts of a Google Calendar event that matter here (Calendar API v3, events.list with singleEvents=true). */
export interface CalendarEvent {
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

/** An all-day event spanning more days than this marks only its first day (a long trip should not fill a season). */
export const MAX_SPAN_DAYS = 14;

/**
 * The year's days with an event, from `from` to `to` (date keys, inclusive), each with its events' titles in order: an
 * all-day event marks each of its days (its end date is exclusive in Google), at most MAX_SPAN_DAYS, else only its
 * first; a timed event marks the local day it starts. Cancelled and untitled events are skipped; each title once a day.
 */
export function eventDates(events: CalendarEvent[], from: string, to: string): Map<string, string[]> {
  const byDay = new Map<string, string[]>();
  const add = (key: string, title: string) => {
    if (key < from || key > to) return;
    const list = byDay.get(key) ?? [];
    if (!list.includes(title)) list.push(title);
    byDay.set(key, list);
  };
  for (const event of events) {
    if (event.status === 'cancelled') continue;
    const title = cleanDateName(event.summary);
    if (!title) continue;
    const startDay = event.start?.date;
    if (startDay && /^\d{4}-\d{2}-\d{2}$/.test(startDay)) {
      const endDay = event.end?.date && event.end.date > startDay ? event.end.date : addDays(startDay, 1);
      const days: string[] = [];
      for (let d = startDay; d < endDay && days.length <= MAX_SPAN_DAYS; d = addDays(d, 1)) days.push(d);
      for (const d of days.length > MAX_SPAN_DAYS ? [startDay] : days) add(d, title);
      continue;
    }
    const at = event.start?.dateTime ? new Date(event.start.dateTime) : null;
    if (at && !isNaN(at.getTime())) add(dateKey(at), title);
  }
  return byDay;
}

/** What an import changes: each touched day's whole new list of notes, the days left with none, and the counts. */
export interface ImportPlan { write: Map<string, DateNote[]>; remove: string[]; added: number; dropped: number; skipped: number }

/**
 * What an import writes (Gianni: a day holds many notes): every event becomes a note of its day, beside the day's own
 * notes, which are never touched; an event already written there by hand is not repeated (skipped). Importing the same
 * calendar again keeps its notes that are still there, adds the new ones and drops those of its events that left it,
 * inside the range only; a day left with no note is removed.
 */
export function importPlan(kept: ReadonlyMap<string, readonly DateNote[]>, found: ReadonlyMap<string, readonly string[]>, calendar: string,
  from: string, to: string, makeId: () => string = newId, now = Date.now()): ImportPlan {
  const plan: ImportPlan = { write: new Map(), remove: [], added: 0, dropped: 0, skipped: 0 };
  const days = new Set(found.keys());
  for (const [key, notes] of kept) if (key >= from && key <= to && notes.some((n) => n.calendar === calendar)) days.add(key);
  for (const key of [...days].sort()) {
    const old = kept.get(key) ?? [];
    const others = old.filter((n) => n.calendar !== calendar);
    const mine = old.filter((n) => n.calendar === calendar);
    const byHand = new Set(others.filter((n) => n.calendar === null).map((n) => n.name.toLowerCase()));
    const fresh: DateNote[] = [];
    let added = 0;
    for (const title of found.get(key) ?? []) {
      if (byHand.has(title.toLowerCase())) { plan.skipped++; continue; }
      const same = mine.find((n) => n.name === title && !fresh.includes(n));
      if (same) fresh.push(same);
      else { fresh.push({ id: makeId(), name: title, created: now, calendar }); added++; }
    }
    const dropped = mine.filter((n) => !fresh.includes(n)).length;
    const next = [...others, ...fresh];
    if (!added && !dropped && next.length === old.length && next.every((n, i) => n === old[i])) continue;
    plan.added += added;
    plan.dropped += dropped;
    if (next.length) plan.write.set(key, next); else plan.remove.push(key);
  }
  return plan;
}
