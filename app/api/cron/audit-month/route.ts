// NOTE: Top-level await for `buildProductionDeps` was attempted but fails at
// Next.js 16 build time because the Resend client initialisation requires
// RESEND_API_KEY which is not present in the build environment. The fallback
// pattern (lazy singleton via getDeps()) is used instead: deps are built on
// the first real HTTP request and cached for the lifetime of the process.

import { wrapCronHandler, buildProductionDeps } from '../../../../src/api/cron-handler';
import type { CronHandlerDeps } from '../../../../src/api/cron-handler';
import { config } from '../../../../src/config';
import { runAudit } from '../../../../src/audit/send-audit';
import { getOrCreateDefaultHousehold } from '../../../../src/db/repositories/households.repo';

export const runtime = 'nodejs';
export const maxDuration = 120;

async function runAuditJob() {
  if (!config.app.recipientEmail) {
    throw new Error('FOODIE_RECIPIENT_EMAIL is not set');
  }
  const hh = await getOrCreateDefaultHousehold();
  try {
    return await runAudit({ householdId: hh.id, to: config.app.recipientEmail, topN: 10 });
  } catch (e) {
    if (e instanceof Error && /pantry is empty/i.test(e.message)) {
      return { skipped: 'pantry empty' as const };
    }
    throw e;
  }
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
  const handler = wrapCronHandler({ name: 'audit-month', fn: runAuditJob }, await getDeps());
  return handler(req);
}
