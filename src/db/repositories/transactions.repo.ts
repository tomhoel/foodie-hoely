import { getSupabase } from '../client';

export interface TransactionRow {
  id: string;
  household_id: string;
  trumf_batch_id: string;
  dealer_id: string | null;
  purchased_at: string;
  total_nok: number;
  trumf_earned_nok: number;
  trumf_extra_nok: number;
  fetched_at: string;
}

export interface TransactionLineRow {
  id: string;
  transaction_id: string;
  ean: string | null;
  name_raw: string;
  quantity: number | null;
  line_total_nok: number;
  reconciled_to_shopping_item_id: string | null;
}

export interface UpsertTransactionInput {
  householdId: string;
  trumfBatchId: string;
  dealerId: string | null;
  purchasedAt: string;
  totalNok: number;
  trumfEarnedNok?: number;
  trumfExtraNok?: number;
}

export interface UpsertResult {
  row: TransactionRow;
  /** True iff this trumf_batch_id was inserted by this call (vs already present). */
  inserted: boolean;
}

export async function upsertTransaction(input: UpsertTransactionInput): Promise<UpsertResult> {
  const supabase = getSupabase();
  const existing = await supabase
    .from('transactions')
    .select('*')
    .eq('trumf_batch_id', input.trumfBatchId)
    .maybeSingle();
  if (existing.error) throw new Error(`upsertTransaction (select): ${existing.error.message}`);
  if (existing.data) return { row: existing.data as TransactionRow, inserted: false };

  const insert = await supabase
    .from('transactions')
    .insert({
      household_id: input.householdId,
      trumf_batch_id: input.trumfBatchId,
      dealer_id: input.dealerId,
      purchased_at: input.purchasedAt,
      total_nok: input.totalNok,
      trumf_earned_nok: input.trumfEarnedNok ?? 0,
      trumf_extra_nok: input.trumfExtraNok ?? 0,
    })
    .select('*')
    .single();
  if (insert.error || !insert.data) throw new Error(`upsertTransaction (insert): ${insert.error?.message ?? 'no row'}`);
  return { row: insert.data as TransactionRow, inserted: true };
}

export interface InsertLineInput {
  ean: string | null;
  nameRaw: string;
  quantity: number | null;
  lineTotalNok: number;
}

/**
 * Replace-then-insert: clears existing lines for this transaction (idempotent
 * re-runs) and inserts the provided rows. Phase-1 receipts are immutable on
 * Trumf's side, so this is safe.
 */
export async function replaceTransactionLines(
  transactionId: string,
  lines: InsertLineInput[]
): Promise<TransactionLineRow[]> {
  const supabase = getSupabase();
  const del = await supabase.from('transaction_lines').delete().eq('transaction_id', transactionId);
  if (del.error) throw new Error(`replaceTransactionLines (clear): ${del.error.message}`);

  if (lines.length === 0) return [];
  const rows = lines.map((l) => ({
    transaction_id: transactionId,
    ean: l.ean,
    name_raw: l.nameRaw,
    quantity: l.quantity,
    line_total_nok: l.lineTotalNok,
  }));
  const ins = await supabase.from('transaction_lines').insert(rows).select('*');
  if (ins.error) throw new Error(`replaceTransactionLines (insert): ${ins.error.message}`);
  return (ins.data ?? []) as TransactionLineRow[];
}

export async function listLinesForTransaction(transactionId: string): Promise<TransactionLineRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('transaction_lines')
    .select('*')
    .eq('transaction_id', transactionId);
  if (error) throw new Error(`listLinesForTransaction: ${error.message}`);
  return (data ?? []) as TransactionLineRow[];
}
