import { addDays } from './period.model';
import { dateKey } from './week.model';
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
 * The year's days with an event, from `from` to `to` (date keys, inclusive): an all-day event marks each of its days
 * (its end date is exclusive in Google), at most MAX_SPAN_DAYS, else only its first; a timed event marks the local day
 * it starts. Cancelled and untitled events are skipped; several events on one day share it ("A · B", at most 80 characters).
 */
export function eventDates(events: CalendarEvent[], from: string, to: string): Map<string, string> {
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
  const out = new Map<string, string>();
  for (const [key, titles] of byDay) out.set(key, cleanDateName(titles.join(' · '))!);
  return out;
}

/** An important date as kept: its name and, when it came from Google, the calendar it was imported from. */
export interface KeptDate { name: string; calendar: string | null }

/**
 * What an import writes: the calendar's days that are free or were imported before (a date named by hand is never
 * overwritten), and which earlier imports of that same calendar inside the range are gone from it now (removed).
 */
export function importPlan(kept: ReadonlyMap<string, KeptDate>, found: ReadonlyMap<string, string>, calendar: string, from: string, to: string):
  { write: Map<string, string>; remove: string[]; skipped: number } {
  const write = new Map<string, string>();
  let skipped = 0;
  for (const [key, name] of found) {
    const old = kept.get(key);
    if (old && old.calendar === null) { skipped++; continue; }
    if (old && old.calendar === calendar && old.name === name) continue;   // already there: nothing to write
    write.set(key, name);
  }
  const remove = [...kept].filter(([key, d]) => d.calendar === calendar && key >= from && key <= to && !found.has(key)).map(([key]) => key);
  return { write, remove, skipped };
}
