import { runPlannerLoop } from './loop';
import { narratePlan } from './narrator';
import type { PlannerContext } from './tools';
import { listEligibleRecipes } from '../db/repositories/cookbook.repo';
import { getRecipe, type RecipeWithIngredients } from '../db/repositories/recipes.repo';
import { getPantrySummary } from '../db/repositories/pantry.repo';
import { listActiveOffersForChains } from '../db/repositories/active-offers.repo';
import { createDraftMealPlan, persistMealPlanItems, lockMealPlan, getRecentCompletedMeals } from '../db/repositories/plans.repo';
import { resolveIngredients } from '../optimizer/ingredient-resolver';
import { getHouseholdSettings } from '../db/repositories/households.repo';
import type { ChainCode } from '../ingestion/adapter.interface';
import type { HouseholdPreferences } from './tools';

export interface PlanWeekArgs {
  householdId: string;
  weekStart: string; // YYYY-MM-DD (Monday)
  recipeCount?: number;
  weeklyBudgetNok?: number;
  allowedChains?: ChainCode[];
}

export interface PlanWeekResult {
  mealPlanId: string;
  recipeIds: string[];
  servings: number[];
  totalNok: number;
  trumfEstimateNok: number;
  narration: string;
  warnings: string[];
}

export async function planWeek(args: PlanWeekArgs): Promise<PlanWeekResult> {
  const recipeCount = args.recipeCount ?? 5;
  const weeklyBudgetNok = args.weeklyBudgetNok ?? 1500;
  const allowedChains: ChainCode[] = args.allowedChains ?? ['MENY', 'KIWI', 'AFOOD'];

  // 1. Load context.
  const settings = await getHouseholdSettings(args.householdId);
  const preferences: HouseholdPreferences = (settings.preferences ?? {}) as HouseholdPreferences;
  const pantry = await getPantrySummary(args.householdId);
  const activeOffers = await listActiveOffersForChains(allowedChains);
  const recentHistory = await getRecentCompletedMeals(args.householdId, 4);

  const recipeList = await listEligibleRecipes(args.householdId);
  if (recipeList.length < recipeCount) {
    throw new Error(`only ${recipeList.length} eligible recipes; need at least ${recipeCount}. Import more via recipe-import first.`);
  }
  // Cap to a reasonable working set so prompt stays small.
  const workingSet = recipeList.slice(0, 30);
  const eligibleRecipes = new Map<string, RecipeWithIngredients>();
  for (const r of workingSet) {
    const full = await getRecipe(r.id);
    if (full) eligibleRecipes.set(r.id, full);
  }

  // 2. Resolve product candidates for the union of all ingredient names.
  const allIngredientNames = new Set<string>();
  for (const r of eligibleRecipes.values()) {
    for (const ing of r.ingredients) {
      if (typeof ing.quantity_grams === 'number' && ing.quantity_grams > 0) {
        allIngredientNames.add(ing.raw_text.replace(/^\s*\d+(?:[.,/]\d+)?\s*\S*\s*/, '').trim().toLowerCase());
      }
    }
  }
  const productCandidates = await resolveIngredients(Array.from(allIngredientNames), { chains: allowedChains });

  const ctx: PlannerContext = {
    householdId: args.householdId,
    weekStart: args.weekStart,
    recipeCount,
    weeklyBudgetNok,
    allowedChains,
    preferences,
    pantry,
    activeOffers,
    recentHistory,
    eligibleRecipes,
    productCandidates,
  };

  // 3. Planner loop.
  const outcome = await runPlannerLoop(ctx);

  // 4. Compute final cost (deterministic) for narration + persistence.
  const { computePlanCost } = await import('../optimizer/optimizer');
  const cost = computePlanCost({
    mealPlan: outcome.recipeIds.map((id, i) => ({ recipeId: id, servings: outcome.servings[i] })),
    recipes: eligibleRecipes,
    pantry: pantry.map((p) => ({ canonicalName: p.canonicalName, grams: p.grams, confidence: p.confidence })),
    productCandidatesPerIngredient: productCandidates,
    householdContext: { allowedChains, weeklyBudgetNok, storeStopPenaltyNok: 10 },
  });

  // 5. Persist.
  const draft = await createDraftMealPlan({ householdId: args.householdId, weekStart: args.weekStart });
  const startDate = new Date(`${args.weekStart}T00:00:00Z`);
  const items = outcome.recipeIds.map((id, i) => ({
    recipeId: id,
    plannedFor: new Date(startDate.getTime() + i * 86_400_000).toISOString().slice(0, 10),
    mealType: 'dinner' as const,
  }));
  await persistMealPlanItems(draft.id, items);

  // 6. Narration.
  const narration = await narratePlan({
    recipes: outcome.recipeIds.map((id) => eligibleRecipes.get(id)!).filter(Boolean),
    cost,
    plannerReasoning: outcome.reasoning,
  });

  await lockMealPlan(draft.id, narration);

  return {
    mealPlanId: draft.id,
    recipeIds: outcome.recipeIds,
    servings: outcome.servings,
    totalNok: cost.totalNok,
    trumfEstimateNok: cost.trumfEstimateNok,
    narration,
    warnings: cost.warnings,
  };
}
