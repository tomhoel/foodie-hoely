import { TrumfClient } from './client';
import { loadTrumfToken, maskBearer } from './token';
import { getSupabase } from '../db/client';
import { upsertTransaction, replaceTransactionLines } from '../db/repositories/transactions.repo';
import { reconcileTransaction } from '../reconciler';
import type { ChainCode } from '../ingestion/adapter.interface';

export interface TrumfSyncOptions {
  householdId: string;
  fra: string;          // YYYY-MM-DD
  til: string;          // YYYY-MM-DD
  /** Override TrumfClient (test seam). */
  client?: TrumfClient;
}

export interface TrumfSyncSummary {
  fetched: number;
  inserted: number;
  reconciled: Array<{
    trumfBatchId: string;
    pantryUpserted: number;
    planMatched: boolean;
  }>;
  errors: string[];
}

const STORE_TO_CHAIN: Array<{ pattern: RegExp; chain: ChainCode }> = [
  { pattern: /\bmeny\b/i, chain: 'MENY' },
  { pattern: /\bkiwi\b/i, chain: 'KIWI' },
  { pattern: /\bspar\b/i, chain: 'SPAR' },
  { pattern: /\bjoker\b/i, chain: 'JOKER' },
];

function classifyChain(butikk: string | undefined): ChainCode | null {
  if (!butikk) return null;
  for (const m of STORE_TO_CHAIN) if (m.pattern.test(butikk)) return m.chain;
  return null;
}

async function dealerIdForChain(chain: ChainCode | null): Promise<string | null> {
  if (!chain) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase.from('dealers').select('id').eq('code', chain).maybeSingle();
  if (error) throw new Error(`dealerIdForChain (${chain}): ${error.message}`);
  return (data?.id as string | undefined) ?? null;
}

export async function syncTrumfReceipts(opts: TrumfSyncOptions): Promise<TrumfSyncSummary> {
  const summary: TrumfSyncSummary = { fetched: 0, inserted: 0, reconciled: [], errors: [] };

  const client = opts.client ?? buildClientFromDisk();

  const list = await client.listTransaksjoner({ fra: opts.fra, til: opts.til });
  summary.fetched = list.transaksjoner.length;

  for (const summary_t of list.transaksjoner) {
    try {
      const detaljer = await client.getTransaksjonDetaljer(summary_t.batchid);
      const chain = classifyChain(detaljer.butikk ?? summary_t.butikk);
      const dealerId = await dealerIdForChain(chain);

      const { row: txn, inserted } = await upsertTransaction({
        householdId: opts.householdId,
        trumfBatchId: detaljer.batchid,
        dealerId,
        purchasedAt: new Date(`${detaljer.dato}T12:00:00Z`).toISOString(),
        totalNok: detaljer.sum,
        trumfEarnedNok: detaljer.bonus,
        trumfExtraNok: detaljer.bonusEkstra,
      });

      const insertedLines = await replaceTransactionLines(
        txn.id,
        detaljer.varer.map((v) => ({
          ean: v.ean ?? null,
          nameRaw: v.vareTekst,
          quantity: v.antall ?? null,
          lineTotalNok: v.belop,
        }))
      );

      if (inserted) summary.inserted++;

      // Reconcile only on first ingest of a given batch. Re-running sync
      // after the user manually un-marks a meal as 'planned' should not
      // silently re-mark it as 'cooked' from the same receipt.
      if (inserted) {
        const recRes = await reconcileTransaction(txn, insertedLines);
        summary.reconciled.push({
          trumfBatchId: detaljer.batchid,
          pantryUpserted: recRes.pantryUpserted,
          planMatched: recRes.planMatched !== null,
        });
      }
    } catch (e) {
      summary.errors.push(`${summary_t.batchid}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return summary;
}

function buildClientFromDisk(): TrumfClient {
  const token = loadTrumfToken();
  if (!token) {
    throw new Error('No Trumf token found. Run `npm run trumf-set-token -- --bearer "<JWT>"` first.');
  }
  console.log(`[trumf] using bearer ${maskBearer(token.bearer)} captured ${token.capturedAt}`);
  return new TrumfClient({ bearer: token.bearer });
}
