/**
 * Price change tracker — records price diffs to the price_history table
 * and updates price_changed_at on products.
 */

import { getSupabase } from "../db/client";

export interface PriceChange {
  product_id: string;
  old_price: number | null;
  new_price: number;
  is_offer: boolean;
}

/** Record price changes to price_history and update price_changed_at. */
export async function recordPriceChanges(changes: PriceChange[]): Promise<number> {
  if (changes.length === 0) return 0;

  const db = getSupabase();
  const now = new Date().toISOString();

  // Batch insert into price_history
  const historyRows = changes.map((c) => ({
    product_id: c.product_id,
    price: c.new_price,
    was_offer: c.is_offer,
    recorded_at: now,
  }));

  const batchSize = 50;
  for (let i = 0; i < historyRows.length; i += batchSize) {
    const batch = historyRows.slice(i, i + batchSize);
    const { error } = await db.from("price_history").insert(batch);
    if (error) {
      console.warn(`[price-tracker] Failed to insert price_history batch: ${error.message}`);
    }
  }

  // Update price_changed_at on the products
  const productIds = changes.map((c) => c.product_id);
  const { error } = await db
    .from("products")
    .update({ price_changed_at: now })
    .in("id", productIds);

  if (error) {
    console.warn(`[price-tracker] Failed to update price_changed_at: ${error.message}`);
  }

  return changes.length;
}
