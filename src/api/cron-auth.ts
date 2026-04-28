// src/api/cron-auth.ts

export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 500; message: string };

export interface VerifyCronAuthArgs {
  /** Raw value of the `Authorization` header, or null if absent. */
  authorizationHeader: string | null;
  expectedSecret: string;
}

export function verifyCronAuth(args: VerifyCronAuthArgs): CronAuthResult {
  if (!args.expectedSecret) {
    return { ok: false, status: 500, message: 'CRON_SECRET is not set on the server' };
  }
  if (!args.authorizationHeader) {
    return { ok: false, status: 401, message: 'missing Authorization header' };
  }
  const expected = `Bearer ${args.expectedSecret}`;
  if (args.authorizationHeader !== expected) {
    return { ok: false, status: 401, message: 'invalid bearer' };
  }
  return { ok: true };
}

/** Convenience: build a Response for the unauthorized branches. */
export function cronAuthResponse(result: Extract<CronAuthResult, { ok: false }>): Response {
  return new Response(JSON.stringify({ error: result.message }), {
    status: result.status,
    headers: { 'content-type': 'application/json' },
  });
}
