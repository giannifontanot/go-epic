import { Injectable, effect, inject, signal } from '@angular/core';
import { Unsubscribe, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { AiTurn } from './ai.model';
import { firebase } from './firebase';

/** Where each person keeps their own Claude key (Gianni: "Mi clave en Ajustes"): only they can read it (firestore.rules). */
const KEY_DOC = ['settings', 'ai'] as const;

/** Claude's model for Go Epic. */
export const AI_MODEL = 'claude-opus-5-5';

/** What went wrong, in words the window can say: no key yet, a key Claude refused, no credit, busy, no network, a refusal. */
export type AiFailure = 'nokey' | 'badkey' | 'credit' | 'busy' | 'offline' | 'refused' | 'other';
export class AiError extends Error {
  constructor(readonly kind: AiFailure) { super(kind); }
}

/** A key as typed: trimmed, at most 300 characters, null when empty. Claude's keys start with "sk-ant-". */
export function cleanKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const key = value.replace(/\s+/g, '').slice(0, 300);
  return key || null;
}
export function looksLikeKey(key: string): boolean {
  return /^sk-ant-[\w-]{20,}$/.test(key);
}

/**
 * Ask Claude from Go Epic, with the person's own Claude key (Gianni chose it: Firebase stays on the free plan). The key
 * lives in users/{uid}/settings/ai, read only by its owner, never logged nor shown again whole; the browser talks to
 * Claude directly. The Anthropic SDK is loaded only when a question is asked, so the app stays light.
 */
@Injectable({ providedIn: 'root' })
export class AiService {
  private readonly auth = inject(AuthService);
  /** The person's key, or null; `ready` once the saved one has been read. */
  private readonly key = signal<string | null>(null);
  readonly hasKey = signal(false);
  readonly ready = signal(false);
  /** The last four characters, to show which key is saved without showing it. */
  readonly keyEnd = signal('');
  readonly error = signal('');
  private sub: Unsubscribe | null = null;

  constructor() {
    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      this.sub?.();
      this.sub = null;
      this.setKey(null);
      this.ready.set(false);
      const fb = firebase();
      if (!uid || !fb) return;
      this.sub = onSnapshot(doc(fb.db, 'users', uid, ...KEY_DOC), (snap) => {
        this.setKey(cleanKey(snap.data()?.['claudeKey']));
        this.ready.set(true);
      }, () => { this.error.set('read'); this.ready.set(true); });
    });
  }

  private setKey(key: string | null): void {
    this.key.set(key);
    this.hasKey.set(!!key);
    this.keyEnd.set(key ? key.slice(-4) : '');
  }

  /** Saves the person's key (shown at once, synced when the network is back). */
  async saveKey(value: string): Promise<boolean> {
    const key = cleanKey(value);
    const fb = firebase();
    const uid = this.auth.user()?.uid;
    if (!key || !fb || !uid) return false;
    this.setKey(key);
    try { await setDoc(doc(fb.db, 'users', uid, ...KEY_DOC), { claudeKey: key }); return true; }
    catch { this.error.set('save'); return false; }
  }

  async removeKey(): Promise<void> {
    const fb = firebase();
    const uid = this.auth.user()?.uid;
    this.setKey(null);
    if (fb && uid) await deleteDoc(doc(fb.db, 'users', uid, ...KEY_DOC)).catch(() => this.error.set('save'));
  }

  /** One answer from Claude to a conversation (the system text carries the person's own data, ai.model `aiContext`). */
  async send(system: string, turns: AiTurn[]): Promise<string> {
    const key = this.key();
    if (!key) throw new AiError('nokey');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AiError('offline');
    const { default: Anthropic } = await import('@anthropic-ai/sdk').catch(() => { throw new AiError('offline'); });
    // the key is the person's own and stays in their browser: the SDK only talks to Claude with it
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 });
    try {
      const reply = await client.beta.messages.create({
        model: AI_MODEL,
        max_tokens: 8000,
        thinking: { type: 'adaptive' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        messages: turns.map((t) => ({ role: t.role, content: t.text })),
      });
      if (reply.stop_reason === 'refusal') throw new AiError('refused');
      const text = reply.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim();
      if (!text) throw new AiError('other');
      return text;
    } catch (error) {
      if (error instanceof AiError) throw error;
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) throw new AiError('badkey');
      if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) throw new AiError('busy');
      if (error instanceof Anthropic.APIConnectionError) throw new AiError('offline');
      if (error instanceof Anthropic.BadRequestError) throw new AiError('credit');   // most often a Claude account with no credit left
      throw new AiError('other');
    }
  }
}
