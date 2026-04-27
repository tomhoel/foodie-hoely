import { getSupabase } from '../client';
import type { ChainCode } from '../../ingestion/adapter.interface';

export interface ProductUpsert {
  source: 'meny' | 'kiwi' | 'afood';
  chain_code: ChainCode;
  external_id: string;
  ean?: string | null;
  name: string;
  brand?: string | null;
  vendor?: string | null;
  description?: string | null;
  category?: string | null;
  size?: string | null;
  unit?: string | null;
  weight_kg?: number | null;
  price?: number | null;
  compare_price?: number | null;
  compare_unit?: string | null;
  is_offer?: boolean;
  image_url?: string | null;
  product_url?: string | null;
  in_stock?: boolean;
  is_specialty?: boolean;
  raw_data?: unknown;
}

export interface UpsertResult {
  upserted: number;
  errors: Array<{ external_id: string; message: string }>;
}

export async function upsertProducts(rows: ProductUpsert[]): Promise<UpsertResult> {
  if (rows.length === 0) return { upserted: 0, errors: [] };
  const supabase = getSupabase();
  const errors: UpsertResult['errors'] = [];
  let upserted = 0;
  const batchSize = 100;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('products')
      .upsert(batch, { onConflict: 'source,external_id' })
      .select('id, external_id, price');

    if (error) {
      for (const row of batch) errors.push({ external_id: row.external_id, message: error.message });
      continue;
    }
    upserted += data?.length ?? 0;

    const priceRows = (data ?? [])
      .filter((p) => typeof p.price === 'number')
      .map((p) => ({ product_id: p.id as string, price: p.price as number, was_offer: false }));
    if (priceRows.length > 0) {
      const { error: histError } = await supabase.from('price_history').insert(priceRows);
      if (histError) {
        for (const row of priceRows) {
          errors.push({ external_id: row.product_id, message: `price_history: ${histError.message}` });
        }
      }
    }
  }
  return { upserted, errors };
}
