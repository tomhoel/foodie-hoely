// NOTE: Top-level await for `buildProductionDeps` was attempted but fails at
// Next.js 16 build time because the Resend client initialisation requires
// RESEND_API_KEY which is not present in the build environment. The fallback
// pattern (lazy singleton via getDeps()) is used instead: deps are built on
// the first real HTTP request and cached for the lifetime of the process.

import { wrapCronHandler, buildProductionDeps } from '../../../../src/api/cron-handler';
import type { CronHandlerDeps } from '../../../../src/api/cron-handler';
import { config } from '../../../../src/config';
import { sendWeeklyPlanEmail } from '../../../../src/email/send-weekly-plan';
import { getOrCreateDefaultHousehold } from '../../../../src/db/repositories/households.repo';

export const runtime = 'nodejs';
export const maxDuration = 600;

async function runPlanWeekJob() {
  if (!config.app.recipientEmail) {
    throw new Error('FOODIE_RECIPIENT_EMAIL is not set');
  }
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
  return { weekStart, ...result };
}

function nextMondayIsoDate(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const offset = ((1 - day) + 7) % 7;
  const target = new Date(d.getTime() + (offset || 7) * 86_400_000);
  return target.toISOString().slice(0, 10);
}

let cachedDeps: CronHandlerDeps | null = null;
async function getDeps(): Promise<CronHandlerDeps> {
  if (!cachedDeps) {
    cachedDeps = await buildProductionDeps({
      cronSecret: config.app.cronSecret,
      alertEmail: config.app.alertEmail,
      alertFrom: config.email.from,
      resendApiKey: config.email.resendApiKey,
    });
  }
  return cachedDeps;
}

export async function GET(req: Request) {
  const handler = wrapCronHandler({ name: 'plan-week', fn: runPlanWeekJob }, await getDeps());
  return handler(req);
}
