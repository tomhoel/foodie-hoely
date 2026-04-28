import { headers } from 'next/headers';
import { verifyCronAuth, cronAuthResponse } from '../../../../src/api/cron-auth';
import { config } from '../../../../src/config';
import { Orchestrator } from '../../../../src/ingestion/orchestrator';
import { MenyDirectAdapter } from '../../../../src/ingestion/adapters/meny-direct.adapter';
import { AFoodAdapter } from '../../../../src/ingestion/adapters/afood.adapter';
import { KassalappAdapter } from '../../../../src/ingestion/adapters/kassalapp.adapter';
import { EtilbudsavisAdapter } from '../../../../src/ingestion/adapters/etilbudsavis.adapter';
import { listDealers } from '../../../../src/db/repositories/offers.repo';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min — sync over all chains

export async function GET() {
  const h = await headers();
  const auth = verifyCronAuth({
    authorizationHeader: h.get('authorization'),
    expectedSecret: config.app.cronSecret,
  });
  if (!auth.ok) return cronAuthResponse(auth);

  const startedAt = Date.now();
  const orch = new Orchestrator();
  orch.register(new MenyDirectAdapter());
  orch.register(new AFoodAdapter());

  if (process.env.KASSALAPP_API_KEY) {
    orch.register(new KassalappAdapter({ apiKey: process.env.KASSALAPP_API_KEY, chains: ['KIWI'] }));
  }

  // Etilbudsavis dealer IDs from DB.
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

  return Response.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    adapters: summary,
  });
}
