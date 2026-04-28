// Phase 2 W8 — sends a 6-digit OTP via Supabase Auth.
// No auth required (this IS the auth-start path).

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
  const email = (body as { email?: string })?.email?.trim();
  if (!email || !email.includes('@')) {
    return Response.json({ error: 'email is required' }, { status: 400 });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supa = createClient(config.supabase.url, config.supabase.anonKey);
  const { error } = await supa.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });

  if (error) {
    logEvent({ event: 'auth.start_failed', email, error: error.message });
    return Response.json({ error: error.message }, { status: 400 });
  }
  logEvent({ event: 'auth.start_ok', email });
  return Response.json({ ok: true, message: `OTP sent to ${email}` });
}
