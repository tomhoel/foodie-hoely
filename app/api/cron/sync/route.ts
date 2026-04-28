// NOTE: Top-level await for `buildProductionDeps` was attempted but fails at
// Next.js 16 build time because the Resend client initialisation requires
// RESEND_API_KEY which is not present in the build environment. The fallback
// pattern (lazy singleton via getDeps()) is used instead: deps are built on
// the first real HTTP request and cached for the lifetime of the process.

import { wrapCronHandler, buildProductionDeps } from '../../../../src/api/cron-handler';
import type { CronHandlerDeps } from '../../../../src/api/cron-handler';
import { config } from '../../../../src/config';
import { Orchestrator } from '../../../../src/ingestion/orchestrator';
import { MenyDirectAdapter } from '../../../../src/ingestion/adapters/meny-direct.adapter';
import { AFoodAdapter } from '../../../../src/ingestion/adapters/afood.adapter';
import { KassalappAdapter } from '../../../../src/ingestion/adapters/kassalapp.adapter';
import { EtilbudsavisAdapter } from '../../../../src/ingestion/adapters/etilbudsavis.adapter';
import { listDealers } from '../../../../src/db/repositories/offers.repo';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function runSyncJob() {
  const orch = new Orchestrator();
  orch.register(new MenyDirectAdapter());
  orch.register(new AFoodAdapter());
  if (process.env.KASSALAPP_API_KEY) {
    orch.register(new KassalappAdapter({ apiKey: process.env.KASSALAPP_API_KEY, chains: ['KIWI'] }));
  }
  const dealers = await listDealers().catch(() => []);
  const dealerIdMap: Partial<Record<'MENY' | 'KIWI' | 'SPAR' | 'JOKER', string>> = {};
  for (const d of dealers) {
    if (d.etilbudsavis_dealer_id && (d.code === 'MENY' || d.code === 'KIWI' || d.code === 'SPAR' || d.code === 'JOKER')) {
      dealerIdMap[d.code] = d.etilbudsavis_dealer_id;
    }
  }
  if (Object.keys(dealerIdMap).length > 0) {
    orch.register(new EtilbudsavisAdapter({ dealerIdMap }));
  }

  const summary: Array<{ adapter: string; productsUpserted?: number; offersFetched?: number; errors: string[] }> = [];
  for (const a of orch.listAdapters()) {
    try {
      if (a.name === 'etilbudsavis') {
        let total = 0;
        const errs: string[] = [];
        for (const chain of a.chains) {
          try {
            const offers = await a.fetchOffers(chain);
            total += offers.length;
          } catch (e) {
            errs.push(`${chain}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        summary.push({ adapter: a.name, offersFetched: total, errors: errs });
      } else {
        const result = await a.syncProducts({});
        summary.push({
          adapter: a.name,
          productsUpserted: result.productsUpserted,
          errors: result.errors.map((e) => e.message),
        });
      }
    } catch (e) {
      summary.push({ adapter: a.name, errors: [e instanceof Error ? e.message : String(e)] });
    }
  }

  return { adapters: summary };
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
  const handler = wrapCronHandler({ name: 'sync', fn: runSyncJob }, await getDeps());
  return handler(req);
}
