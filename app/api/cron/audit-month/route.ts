import { headers } from 'next/headers';
import { verifyCronAuth, cronAuthResponse } from '../../../../src/api/cron-auth';
import { config } from '../../../../src/config';
import { runAudit } from '../../../../src/audit/send-audit';
import { getOrCreateDefaultHousehold } from '../../../../src/db/repositories/households.repo';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET() {
  const h = await headers();
  const auth = verifyCronAuth({
    authorizationHeader: h.get('authorization'),
    expectedSecret: config.app.cronSecret,
  });
  if (!auth.ok) return cronAuthResponse(auth);

  if (!config.app.recipientEmail) {
    return Response.json(
      { error: 'FOODIE_RECIPIENT_EMAIL is not set' },
      { status: 500 }
    );
  }

  const startedAt = Date.now();
  const hh = await getOrCreateDefaultHousehold();

  // Pantry may be empty — bail early with a 200 OK so cron doesn't alarm.
  try {
    const result = await runAudit({
      householdId: hh.id,
      to: config.app.recipientEmail,
      topN: 10,
    });
    return Response.json({ ok: true, durationMs: Date.now() - startedAt, ...result });
  } catch (e) {
    if (e instanceof Error && /pantry is empty/i.test(e.message)) {
      return Response.json({ ok: true, skipped: 'pantry empty' });
    }
    throw e;
  }
}
