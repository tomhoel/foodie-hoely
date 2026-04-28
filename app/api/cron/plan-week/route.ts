import { headers } from 'next/headers';
import { verifyCronAuth, cronAuthResponse } from '../../../../src/api/cron-auth';
import { config } from '../../../../src/config';
import { sendWeeklyPlanEmail } from '../../../../src/email/send-weekly-plan';
import { getOrCreateDefaultHousehold } from '../../../../src/db/repositories/households.repo';

export const runtime = 'nodejs';
export const maxDuration = 600; // planner loop + Resend send can take 1-2 min

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
  const weekStart = nextMondayIsoDate();

  const result = await sendWeeklyPlanEmail({
    householdId: hh.id,
    weekStart,
    recipeCount: 5,
    weeklyBudgetNok: 1500,
    allowedChains: ['MENY', 'KIWI', 'AFOOD'],
    to: config.app.recipientEmail,
  });

  return Response.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    weekStart,
    ...result,
  });
}

function nextMondayIsoDate(): string {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sun .. 6=Sat
  const offset = ((1 - day) + 7) % 7;
  const target = new Date(d.getTime() + (offset || 7) * 86_400_000);
  return target.toISOString().slice(0, 10);
}
