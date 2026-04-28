// Phase 2 W8 — exchanges a 6-digit OTP for a session JWT.
// No auth required — this IS the auth-verify path.

import { config } from '../../../../src/config';
import { logEvent } from '../../../../src/api/logger';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { email, otp } = (body ?? {}) as { email?: string; otp?: string };
  if (!email || !otp) {
    return Response.json({ error: 'email and otp are required' }, { status: 400 });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supa = createClient(config.supabase.url, config.supabase.anonKey);
  const { data, error } = await supa.auth.verifyOtp({ email, token: otp, type: 'email' });

  if (error || !data.session) {
    logEvent({ event: 'auth.verify_failed', email, error: error?.message ?? 'no session' });
    return Response.json({ error: error?.message ?? 'verify failed' }, { status: 401 });
  }

  logEvent({ event: 'auth.verify_ok', email, userId: data.user?.id });
  return Response.json({
    ok: true,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ? new Date(data.session.expires_at * 1000).toISOString() : undefined,
    userId: data.user?.id,
    email: data.user?.email,
  });
}
