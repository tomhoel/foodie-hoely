import { getSupabase } from '../client';

export interface PantryItemRow {
  id: string;
  household_id: string;
  ean: string | null;
  product_name: string;
  canonical_ingredient_id: string | null;
  quantity_grams: number;
  confidence: number;
  last_seen_source: 'receipt' | 'photo' | 'manual';
  last_seen_at: string;
  expected_lifetime_days: number | null;
  decayed_at: string | null;
}

export interface PantrySummaryItem {
  canonicalName: string;   // product_name lowercased — Phase 1 proxy until canonical_ingredient_id resolution lands
  grams: number;
  confidence: number;
  lastSeenSource: 'receipt' | 'photo' | 'manual';
}

/**
 * Phase 1 returns rows as-is. W4b will populate the table from Trumf receipts;
 * before then this returns whatever is in the DB (typically empty).
 */
export async function getPantrySummary(householdId: string): Promise<PantrySummaryItem[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('pantry_items')
    .select('*')
    .eq('household_id', householdId);
  if (error) throw new Error(`getPantrySummary: ${error.message}`);
  return (data ?? []).map((row) => {
    const r = row as PantryItemRow;
    return {
      canonicalName: r.product_name.toLowerCase().trim(),
      grams: Number(r.quantity_grams),
      confidence: Number(r.confidence),
      lastSeenSource: r.last_seen_source,
    };
  });
}
