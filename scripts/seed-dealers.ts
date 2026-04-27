#!/usr/bin/env tsx
/**
 * One-time bootstrap: populate the dealers table with the canonical chain
 * mapping plus the etilbudsavis dealer ID per chain.
 * Run: npm run seed:dealers
 * Idempotent — safe to re-run.
 *
 * Prerequisite: migration 005_planning_core.sql applied to Supabase.
 * If not, this fails with "relation 'dealers' does not exist".
 */

import 'dotenv/config';
import { TjekDealersResponseSchema } from '../src/ingestion/adapters/etilbudsavis-schemas';
import { jsonFetch } from '../src/ingestion/http/json-fetch';
import { upsertDealers, type DealerUpsert } from '../src/db/repositories/offers.repo';

const PATTERNS: Array<{ chain: 'MENY' | 'KIWI' | 'SPAR' | 'JOKER'; pattern: RegExp; trumfEligible: boolean }> = [
  { chain: 'MENY', pattern: /^MENY$/i, trumfEligible: true },
  { chain: 'KIWI', pattern: /^KIWI$/i, trumfEligible: true },
  { chain: 'SPAR', pattern: /^SPAR$/i, trumfEligible: true },
  { chain: 'JOKER', pattern: /^JOKER$/i, trumfEligible: true },
];

async function main() {
  console.log('Fetching etilbudsavis dealers...');
  const dealers = await jsonFetch('https://api.etilbudsavis.dk/v2/dealers?limit=1000', {
    schema: TjekDealersResponseSchema,
    headers: { 'User-Agent': 'foodie-hoely/1.0 seed-script' },
  });

  const rows: DealerUpsert[] = PATTERNS.map(({ chain, pattern, trumfEligible }) => {
    const dealer = dealers.find((d) => pattern.test(d.name));
    if (!dealer) {
      console.warn(`  ! No etilbudsavis dealer found for ${chain}`);
      return { code: chain, trumf_eligible: trumfEligible, etilbudsavis_dealer_id: null };
    }
    console.log(`  ✓ ${chain} → ${dealer.id} (${dealer.name})`);
    return { code: chain, trumf_eligible: trumfEligible, etilbudsavis_dealer_id: dealer.id };
  });
  rows.push({ code: 'AFOOD', trumf_eligible: false, etilbudsavis_dealer_id: null });

  const result = await upsertDealers(rows);
  if (result.error) {
    console.error(`Upsert failed: ${result.error}`);
    process.exit(1);
  }
  console.log(`\nSeeded ${result.upserted} dealer rows.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
