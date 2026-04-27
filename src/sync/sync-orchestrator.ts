/**
 * Sync Orchestrator — wraps the existing sync functions with:
 *   1. Pre-sync DB snapshot for diffing
 *   2. Price change detection → price_history
 *   3. Discontinued product detection
 *   4. Rich stats reporting
 */

import { getSupabase } from "../db/client";
import { syncAfood } from "./afood-sync";
import { syncMeny } from "./meny-sync";
import { recordPriceChanges, type PriceChange } from "./price-tracker";

export interface SyncStats {
  source: string;
  added: number;
  updated: number;
  removed: number;
  priceChanges: number;
  unchanged: number;
  total: number;
  error?: string;
}

interface ProductSnapshot {
  id: string;
  external_id: string;
  price: number | null;
  in_stock: boolean;
  is_offer: boolean;
}

/** Snapshot current DB state for a source (lightweight: only fields we need for diffing). */
async function snapshotProducts(source: string): Promise<Map<string, ProductSnapshot>> {
  const db = getSupabase();
  const map = new Map<string, ProductSnapshot>();

  // Fetch in pages to handle large catalogs
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await db
      .from("products")
      .select("id, external_id, price, in_stock, is_offer")
      .eq("source", source)
      .eq("is_discontinued", false)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Snapshot failed: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      map.set(row.external_id, row as ProductSnapshot);
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return map;
}

/** Run sync for a single source with diffing and lifecycle management. */
export async function syncWithDiff(source: "afood" | "meny"): Promise<SyncStats> {
  const syncTimestamp = new Date().toISOString();
  const stats: SyncStats = {
    source,
    added: 0,
    updated: 0,
    removed: 0,
    priceChanges: 0,
    unchanged: 0,
    total: 0,
  };

  try {
    // 1. Snapshot current state
    console.log(`[orchestrator] Snapshotting ${source} products...`);
    const before = await snapshotProducts(source);
    console.log(`[orchestrator] Snapshot: ${before.size} active products`);

    // 2. Run the existing sync (fetches + upserts)
    console.log(`[orchestrator] Running ${source} sync...`);
    const syncFn = source === "afood" ? syncAfood : syncMeny;
    const { synced } = await syncFn({ syncTimestamp });
    stats.total = synced;

    // 3. Load post-sync state to detect changes
    const after = await snapshotProducts(source);

    // 4. Diff: detect new, changed, unchanged
    const priceChanges: PriceChange[] = [];

    for (const [extId, afterRow] of after) {
      const beforeRow = before.get(extId);
      if (!beforeRow) {
        stats.added++;
      } else if (
        beforeRow.price !== afterRow.price ||
        beforeRow.in_stock !== afterRow.in_stock ||
        beforeRow.is_offer !== afterRow.is_offer
      ) {
        stats.updated++;
        if (beforeRow.price !== afterRow.price && afterRow.price !== null) {
          priceChanges.push({
            product_id: afterRow.id,
            old_price: beforeRow.price,
            new_price: afterRow.price,
            is_offer: afterRow.is_offer,
          });
        }
      } else {
        stats.unchanged++;
      }
    }

    // 5. Record price changes
    if (priceChanges.length > 0) {
      console.log(`[orchestrator] Recording ${priceChanges.length} price changes...`);
      await recordPriceChanges(priceChanges);
      stats.priceChanges = priceChanges.length;
    }

    // 6. Mark discontinued products (not seen in this sync)
    const db = getSupabase();
    const { data: discontinued, error: discError } = await db
      .from("products")
      .update({ is_discontinued: true, in_stock: false })
      .eq("source", source)
      .eq("is_discontinued", false)
      .lt("last_synced_at", syncTimestamp)
      .select("id");

    if (discError) {
      console.warn(`[orchestrator] Discontinuation query failed: ${discError.message}`);
    } else {
      stats.removed = discontinued?.length || 0;
      if (stats.removed > 0) {
        console.log(`[orchestrator] Marked ${stats.removed} products as discontinued`);
      }
    }

    // 7. Resurrect any previously discontinued products that reappeared
    const { data: resurrected, error: resError } = await db
      .from("products")
      .update({ is_discontinued: false })
      .eq("source", source)
      .eq("is_discontinued", true)
      .gte("last_synced_at", syncTimestamp)
      .select("id");

    if (!resError && resurrected && resurrected.length > 0) {
      console.log(`[orchestrator] Resurrected ${resurrected.length} previously discontinued products`);
    }

    console.log(
      `[orchestrator] ${source} done: +${stats.added} new, ~${stats.updated} updated, -${stats.removed} removed, ${stats.priceChanges} price changes, ${stats.unchanged} unchanged`,
    );
  } catch (err: any) {
    stats.error = err.message;
    console.error(`[orchestrator] ${source} sync failed: ${err.message}`);
  }

  return stats;
}

