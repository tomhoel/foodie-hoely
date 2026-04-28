import { getSupabase } from '../db/client';
import type { TransactionRow, TransactionLineRow } from '../db/repositories/transactions.repo';
import { computePantryUpserts, type ProductLookup, type PantryUpsert } from './pantry-updater';
import { matchTransactionToPlannedMeal, type PlanMatchCandidate } from './plan-matcher';

export interface ReconcileResult {
  transactionId: string;
  pantryUpserted: number;
  pantryLinkedByEan: number;
  planMatched: { mealPlanItemId: string; recipeId: string; score: number } | null;
}

export async function reconcileTransaction(
  txn: TransactionRow,
  lines: TransactionLineRow[]
): Promise<ReconcileResult> {
  const supabase = getSupabase();

  // 1. Look up products by EAN in one batch.
  const eans = lines.map((l) => l.ean).filter((e): e is string => typeof e === 'string' && e.length > 0);
  const productsByEan: ProductLookup = new Map();
  if (eans.length > 0) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, ean, weight_kg')
      .in('ean', eans);
    if (error) throw new Error(`reconcileTransaction (products): ${error.message}`);
    for (const row of data ?? []) {
      const r = row as { id: string; name: string; ean: string | null; weight_kg: number | null };
      if (r.ean) productsByEan.set(r.ean, { id: r.id, name: r.name, weightKg: r.weight_kg ?? null });
    }
  }

  // 2. Compute pantry upserts (pure).
  const upserts: PantryUpsert[] = computePantryUpserts({
    householdId: txn.household_id,
    lines: lines.map((l) => ({ ean: l.ean, nameRaw: l.name_raw, quantity: l.quantity, lineTotalNok: l.line_total_nok })),
    productsByEan,
  });

  // 3. Apply pantry upserts. Phase-1 uses delete+insert by (household_id, ean OR product_name)
  //    so re-running stays idempotent. ean-keyed rows take precedence.
  let linkedByEan = 0;
  for (const u of upserts) {
    if (u.ean) {
      const del = await supabase
        .from('pantry_items')
        .delete()
        .eq('household_id', u.householdId)
        .eq('ean', u.ean);
      if (del.error) throw new Error(`pantry_items (clear by ean): ${del.error.message}`);
      linkedByEan++;
    } else {
      const del = await supabase
        .from('pantry_items')
        .delete()
        .eq('household_id', u.householdId)
        .is('ean', null)
        .eq('product_name', u.productName);
      if (del.error) throw new Error(`pantry_items (clear by name): ${del.error.message}`);
    }
    const ins = await supabase.from('pantry_items').insert({
      household_id: u.householdId,
      ean: u.ean,
      product_name: u.productName,
      quantity_grams: u.quantityGrams,
      confidence: u.confidence,
      last_seen_source: u.lastSeenSource,
      last_seen_at: txn.purchased_at,
    });
    if (ins.error) throw new Error(`pantry_items (insert): ${ins.error.message}`);
  }

  // 4. Find candidate planned meals within ±2 days.
  const purchaseDay = txn.purchased_at.slice(0, 10);
  const candidates = await loadCandidatesForHousehold(txn.household_id, purchaseDay);

  // 5. Score the match.
  const match = matchTransactionToPlannedMeal({
    transactionDate: purchaseDay,
    lineNames: lines.map((l) => l.name_raw),
    candidates,
    windowDays: 2,
    minOverlap: 0.3,
  });

  // 6. If matched, mark the meal_plan_item as cooked.
  if (match) {
    const upd = await supabase
      .from('meal_plan_items')
      .update({ status: 'cooked', cooked_confirmed_via: 'receipt' })
      .eq('id', match.mealPlanItemId);
    if (upd.error) throw new Error(`mark cooked: ${upd.error.message}`);
  }

  return {
    transactionId: txn.id,
    pantryUpserted: upserts.length,
    pantryLinkedByEan: linkedByEan,
    planMatched: match ? { mealPlanItemId: match.mealPlanItemId, recipeId: match.recipeId, score: match.score } : null,
  };
}

async function loadCandidatesForHousehold(householdId: string, purchaseDay: string): Promise<PlanMatchCandidate[]> {
  const supabase = getSupabase();
  // ±3 days to be safe (matcher itself enforces ±2).
  const cutoffStart = new Date(`${purchaseDay}T00:00:00Z`);
  cutoffStart.setUTCDate(cutoffStart.getUTCDate() - 3);
  const cutoffEnd = new Date(`${purchaseDay}T00:00:00Z`);
  cutoffEnd.setUTCDate(cutoffEnd.getUTCDate() + 3);
  const startStr = cutoffStart.toISOString().slice(0, 10);
  const endStr = cutoffEnd.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('meal_plan_items')
    .select('id, recipe_id, planned_for, status, meal_plans!inner(household_id), recipes!inner(title, recipe_ingredients(raw_text))')
    .eq('meal_plans.household_id', householdId)
    .neq('status', 'cooked')
    .gte('planned_for', startStr)
    .lte('planned_for', endStr);
  if (error) throw new Error(`loadCandidatesForHousehold: ${error.message}`);

  return (data ?? []).map((row: any) => ({
    mealPlanItemId: row.id as string,
    recipeId: row.recipe_id as string,
    plannedFor: row.planned_for as string,
    title: row.recipes?.title ?? '',
    ingredientTexts: (row.recipes?.recipe_ingredients ?? []).map((ri: any) => ri.raw_text as string),
  }));
}
