import { getSupabase } from '../client';
import type { ChainCode } from '../../ingestion/adapter.interface';

export interface ActiveOffer {
  id: string;
  dealerCode: ChainCode;
  heading: string;
  description: string | null;
  price: number;
  prePrice: number | null;
  unit: string | null;
  runFrom: string | null;
  runTill: string | null;
  matchedProductId: string | null;
}

/**
 * Returns offers whose run window covers `at` (default: now), filtered to allowed chains.
 * Joins through dealers to expose the chain code directly.
 */
export async function listActiveOffersForChains(
  chains: ChainCode[],
  at: Date = new Date()
): Promise<ActiveOffer[]> {
  if (chains.length === 0) return [];
  const supabase = getSupabase();
  const iso = at.toISOString();
  const { data, error } = await supabase
    .from('offers')
    .select('id, heading, description, price, pre_price, unit, run_from, run_till, matched_product_id, dealers!inner(code)')
    .in('dealers.code', chains)
    .or(`run_from.is.null,run_from.lte.${iso}`)
    .or(`run_till.is.null,run_till.gte.${iso}`);
  if (error) throw new Error(`listActiveOffersForChains: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    dealerCode: row.dealers.code as ChainCode,
    heading: row.heading,
    description: row.description,
    price: Number(row.price),
    prePrice: row.pre_price !== null ? Number(row.pre_price) : null,
    unit: row.unit,
    runFrom: row.run_from,
    runTill: row.run_till,
    matchedProductId: row.matched_product_id,
  }));
}
