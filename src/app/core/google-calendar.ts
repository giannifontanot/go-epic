import { Injectable } from '@angular/core';
import { GoogleAuthProvider, reauthenticateWithPopup } from 'firebase/auth';
import { CalendarEvent } from './calendar-import';
import { firebase } from './firebase';

/** Reading only, never writing: the one Google scope the import asks for. */
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const API = 'https://www.googleapis.com/calendar/v3';

export interface GoogleCalendar { id: string; name: string; primary: boolean; color: string | null }

/** Why an import could not go on, for the window to say in plain words. */
export type CalendarProblem = 'cancelled' | 'blocked' | 'denied' | 'mismatch' | 'disabled' | 'expired' | 'offline' | 'loading' | 'failed';
export class CalendarError extends Error {
  constructor(readonly problem: CalendarProblem) { super(problem); }
}

/**
 * Reads the signed-in user's Google calendars (Calendar API v3), from the browser alone: no server, no client ID of
 * its own. Google asks the user for read-only access to their calendar in a pop-up (Firebase's Google sign-in, the same
 * account they use in Go Epic, with the extra scope); the access token it returns lasts about an hour and lives only
 * in memory. Nothing is read until the user taps Import.
 */
@Injectable({ providedIn: 'root' })
export class GoogleCalendarService {
  private token: { value: string; until: number } | null = null;

  /** Asks Google for read access (a pop-up) unless a token from the last hour is still good. */
  async connect(): Promise<void> {
    if (this.token && this.token.until > Date.now()) return;
    const fb = firebase();
    const user = fb?.auth.currentUser;
    if (!fb || !user) throw new CalendarError('failed');
    const provider = new GoogleAuthProvider();
    provider.addScope(CALENDAR_SCOPE);
    if (user.email) provider.setCustomParameters({ login_hint: user.email });
    try {
      const result = await reauthenticateWithPopup(user, provider);
      const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
      if (!token) throw new CalendarError('denied');
      this.token = { value: token, until: Date.now() + 50 * 60_000 };
    } catch (error) {
      if (error instanceof CalendarError) throw error;
      const code = (error as { code?: string }).code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') throw new CalendarError('cancelled');
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') throw new CalendarError('blocked');
      if (code === 'auth/user-mismatch') throw new CalendarError('mismatch');
      if (code === 'auth/network-request-failed') throw new CalendarError('offline');
      throw new CalendarError('denied');
    }
  }

  async calendars(): Promise<GoogleCalendar[]> {
    const items: { id: string; summary?: string; summaryOverride?: string; primary?: boolean; backgroundColor?: string }[] = [];
    let page: string | undefined;
    do {
      const data = await this.get(`${API}/users/me/calendarList?minAccessRole=reader&maxResults=250${page ? '&pageToken=' + encodeURIComponent(page) : ''}`);
      items.push(...(data.items ?? []));
      page = data.nextPageToken;
    } while (page);
    return items.map((c) => ({ id: c.id, name: c.summaryOverride || c.summary || c.id, primary: !!c.primary, color: c.backgroundColor ?? null }))
      .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
  }

  /** The calendar's events from `from` to `to` (local date keys, inclusive), recurring ones expanded. */
  async events(calendarId: string, from: string, to: string): Promise<CalendarEvent[]> {
    const local = (key: string, days = 0) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d + days).toISOString(); };
    const events: CalendarEvent[] = [];
    let page: string | undefined;
    do {
      const params = new URLSearchParams({ timeMin: local(from), timeMax: local(to, 1), singleEvents: 'true', maxResults: '2500', fields: 'items(status,summary,start,end),nextPageToken' });
      if (page) params.set('pageToken', page);
      const data = await this.get(`${API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
      events.push(...(data.items ?? []));
      page = data.nextPageToken;
    } while (page);
    return events;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async get(url: string): Promise<any> {
    if (!this.token) throw new CalendarError('denied');
    let response: Response;
    try {
      response = await fetch(url, { headers: { Authorization: `Bearer ${this.token.value}` } });
    } catch {
      throw new CalendarError('offline');
    }
    if (response.ok) return response.json();
    if (response.status === 401) { this.token = null; throw new CalendarError('expired'); }   // a new tap asks Google again
    const body = await response.json().catch(() => ({}));
    const reason = JSON.stringify(body?.error ?? '');
    if (response.status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(reason)) throw new CalendarError('disabled');
    if (response.status === 403) { this.token = null; throw new CalendarError('denied'); }
    throw new CalendarError('failed');
  }
}
