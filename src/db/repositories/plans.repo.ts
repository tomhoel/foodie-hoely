import { getSupabase } from '../client';

export interface MealPlanRow {
  id: string;
  household_id: string;
  week_start: string;
  status: 'draft' | 'locked' | 'completed';
  generated_at: string;
  locked_at: string | null;
  ai_reasoning: string | null;
}

export interface MealPlanItemRow {
  id: string;
  meal_plan_id: string;
  recipe_id: string;
  planned_for: string;
  meal_type: 'lunch' | 'dinner' | 'breakfast' | 'snack' | null;
  status: 'planned' | 'cooked' | 'skipped' | 'swapped';
  cooked_confirmed_via: string | null;
}

export interface DraftPlanInput {
  householdId: string;
  weekStart: string; // YYYY-MM-DD (Monday)
}

export async function createDraftMealPlan(input: DraftPlanInput): Promise<MealPlanRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('meal_plans')
    .upsert(
      { household_id: input.householdId, week_start: input.weekStart, status: 'draft' },
      { onConflict: 'household_id,week_start' }
    )
    .select('*')
    .single();
  if (error || !data) throw new Error(`createDraftMealPlan: ${error?.message ?? 'no row'}`);
  return data as MealPlanRow;
}

export interface PersistItemInput {
  recipeId: string;
  plannedFor: string; // YYYY-MM-DD
  mealType?: 'lunch' | 'dinner' | 'breakfast' | 'snack';
}

export async function persistMealPlanItems(
  mealPlanId: string,
  items: PersistItemInput[]
): Promise<MealPlanItemRow[]> {
  if (items.length === 0) return [];
  const supabase = getSupabase();

  // Replace any existing items for this plan (idempotent re-runs).
  const del = await supabase.from('meal_plan_items').delete().eq('meal_plan_id', mealPlanId);
  if (del.error) throw new Error(`persistMealPlanItems (clear): ${del.error.message}`);

  const rows = items.map((it) => ({
    meal_plan_id: mealPlanId,
    recipe_id: it.recipeId,
    planned_for: it.plannedFor,
    meal_type: it.mealType ?? 'dinner',
    status: 'planned' as const,
  }));
  const { data, error } = await supabase.from('meal_plan_items').insert(rows).select('*');
  if (error) throw new Error(`persistMealPlanItems (insert): ${error.message}`);
  return (data ?? []) as MealPlanItemRow[];
}

export async function lockMealPlan(mealPlanId: string, aiReasoning: string): Promise<MealPlanRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('meal_plans')
    .update({ status: 'locked', locked_at: new Date().toISOString(), ai_reasoning: aiReasoning })
    .eq('id', mealPlanId)
    .select('*')
    .single();
  if (error || !data) throw new Error(`lockMealPlan: ${error?.message ?? 'no row'}`);
  return data as MealPlanRow;
}

export async function getRecentCompletedMeals(
  householdId: string,
  weeksBack = 4
): Promise<Array<{ recipe_id: string; planned_for: string }>> {
  const supabase = getSupabase();
  const cutoff = new Date(Date.now() - weeksBack * 7 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('meal_plan_items')
    .select('recipe_id, planned_for, meal_plans!inner(household_id)')
    .eq('meal_plans.household_id', householdId)
    .eq('status', 'cooked')
    .gte('planned_for', cutoff);
  if (error) throw new Error(`getRecentCompletedMeals: ${error.message}`);
  return (data ?? []).map((r: any) => ({ recipe_id: r.recipe_id as string, planned_for: r.planned_for as string }));
}
