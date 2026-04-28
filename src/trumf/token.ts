/**
 * Phase 1 Trumf bearer-token persistence. Stored at ~/.foodie/trumf-token.json.
 * Phase 2 replaces this with encrypted DB-resident storage + Sandbox broker
 * (see design spec §11). Until then the user manually captures a bearer from
 * their logged-in browser DevTools and pastes it into `npm run trumf-set-token`.
 */

import { loadJson, saveJson } from '../utils/storage';

const FILENAME = 'trumf-token.json';

export interface TrumfToken {
  bearer: string;
  /** Optional refresh token; Phase 1 refresh is manual, so this is informational. */
  refresh?: string;
  /** ISO timestamp; derived locally when set. */
  capturedAt: string;
  /** Optional ISO timestamp; if known by user, helps surface "expires soon" warnings. */
  expiresAt?: string;
}

export function loadTrumfToken(): TrumfToken | null {
  return loadJson<TrumfToken>(FILENAME);
}

export function saveTrumfToken(input: { bearer: string; refresh?: string; expiresAt?: string }): TrumfToken {
  if (!input.bearer || input.bearer.length < 20) {
    throw new Error('saveTrumfToken: bearer looks invalid (too short).');
  }
  const token: TrumfToken = {
    bearer: input.bearer.trim(),
    refresh: input.refresh?.trim(),
    capturedAt: new Date().toISOString(),
    expiresAt: input.expiresAt,
  };
  saveJson(FILENAME, token);
  return token;
}

/** Mask all but the last 6 chars for log output. */
export function maskBearer(bearer: string): string {
  if (bearer.length <= 6) return '***';
  return `***${bearer.slice(-6)}`;
}
