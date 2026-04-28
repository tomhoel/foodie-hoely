import { loadJson, saveJson } from '../utils/storage';

const FILENAME = 'auth-token.json';

export interface AuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  email?: string;
  capturedAt: string;
}

export function loadAuthToken(): AuthToken | null {
  return loadJson<AuthToken>(FILENAME);
}

export function saveAuthToken(input: { accessToken: string; refreshToken?: string; expiresAt?: string; email?: string }): AuthToken {
  if (!input.accessToken || input.accessToken.length < 20) {
    throw new Error('saveAuthToken: accessToken looks invalid (too short).');
  }
  const t: AuthToken = {
    accessToken: input.accessToken.trim(),
    refreshToken: input.refreshToken?.trim(),
    expiresAt: input.expiresAt,
    email: input.email,
    capturedAt: new Date().toISOString(),
  };
  saveJson(FILENAME, t);
  return t;
}

export function maskToken(s: string): string {
  if (s.length <= 6) return '***';
  return `***${s.slice(-6)}`;
}
