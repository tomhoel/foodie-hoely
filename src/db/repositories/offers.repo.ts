import { getSupabase } from '../client';
import type { ChainCode } from '../../ingestion/adapter.interface';

export interface DealerUpsert {
  code: ChainCode;
  trumf_eligible: boolean;
  etilbudsavis_dealer_id: string | null;
}

export async function upsertDealers(rows: DealerUpsert[]): Promise<{ upserted: number; error?: string }> {
  if (rows.length === 0) return { upserted: 0 };
  const supabase = getSupabase();
  const { data, error } = await supabase.from('dealers').upsert(rows, { onConflict: 'code' }).select('id');
  if (error) return { upserted: 0, error: error.message };
  return { upserted: data?.length ?? 0 };
}

export interface DealerRow {
  id: string;
  code: ChainCode;
  trumf_eligible: boolean;
  etilbudsavis_dealer_id: string | null;
}

export async function listDealers(): Promise<DealerRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('dealers').select('*');
  if (error) throw new Error(`listDealers: ${error.message}`);
  return (data ?? []) as DealerRow[];
}
