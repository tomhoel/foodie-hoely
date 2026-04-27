/**
 * Foodie deterministic optimizer (Phase 1).
 *
 * Given a meal plan + pantry + product candidates per ingredient, returns a
 * chain-optimized shopping list with cost + Trumf estimate. Pure code, no LLM.
 *
 * Algorithm (simplified for Phase 1):
 *   1. For each meal plan item, look up the recipe.
 *   2. For each ingredient with quantityGrams > 0:
 *      a. Subtract pantry stock (capped at ingredient grams).
 *      b. If covered, count as pantry savings.
 *      c. Else pick cheapest available candidate from allowed chains.
 *      d. If no candidate, emit a warning and skip.
 *   3. Group selections by chain → store breakdown.
 *   4. Compute Trumf estimate at flat 1% on Trumf-eligible chains.
 *   5. Validate weekly budget hard constraint.
 */

import type { ChainCode } from '../ingestion/adapter.interface';
import type {
  OptimizerInput,
  PlanCost,
  ShoppingItem,
  StoreBreakdown,
  PerRecipeCost,
} from './types';
import { isTrumfEligible, pickCheapest, TRUMF_RATE } from './score';

export function computePlanCost(input: OptimizerInput): PlanCost {
  const warnings: string[] = [];
  const allShoppingItems: ShoppingItem[] = [];
  const perRecipe: PerRecipeCost[] = [];
  let pantrySavingsNok = 0;

  // Mutable pantry state for this planning run.
  const pantryRemaining = new Map<string, number>();
  for (const p of input.pantry) {
    pantryRemaining.set(p.canonicalName, (pantryRemaining.get(p.canonicalName) ?? 0) + p.grams);
  }

  for (const planItem of input.mealPlan) {
    const recipeData = input.recipes.get(planItem.recipeId);
    if (!recipeData) {
      warnings.push(`recipe ${planItem.recipeId} not found in recipes map`);
      perRecipe.push({ recipeId: planItem.recipeId, costNok: 0 });
      continue;
    }

    let recipeCost = 0;

    for (const ing of recipeData.ingredients) {
      if (typeof ing.quantity_grams !== 'number' || ing.quantity_grams <= 0) {
        continue; // count-based or fuzzy ingredient — skip in Phase 1
      }

      // Derive a canonical-ish lookup key. Phase 1 uses the raw_text trailing
      // ingredient name; Phase D will use canonical_ingredient_id.
      const lookupName = extractIngredientNameFromRawText(ing.raw_text);

      const required = ing.quantity_grams * (planItem.servings / (recipeData.recipe.servings ?? planItem.servings));

      const onHand = pantryRemaining.get(lookupName) ?? 0;
      const fromPantry = Math.min(onHand, required);
      const remaining = required - fromPantry;
      if (fromPantry > 0) {
        pantryRemaining.set(lookupName, onHand - fromPantry);
      }

      if (remaining <= 0) {
        // Estimate pantry value using cheapest candidate price (gives an honest "saved" number).
        const candidates = input.productCandidatesPerIngredient.get(lookupName) ?? [];
        const cheapest = pickCheapest(candidates, input.householdContext.allowedChains);
        if (cheapest && typeof cheapest.price === 'number') {
          pantrySavingsNok += cheapest.price;
        }
        continue;
      }

      const candidates = input.productCandidatesPerIngredient.get(lookupName) ?? [];
      const chosen = pickCheapest(candidates, input.householdContext.allowedChains);
      if (!chosen || chosen.chainCode === null || typeof chosen.price !== 'number') {
        warnings.push(
          `no product candidate for "${lookupName}" in chains [${input.householdContext.allowedChains.join(', ')}]`
        );
        continue;
      }

      const item: ShoppingItem = {
        ingredientName: lookupName,
        productId: chosen.productId,
        productName: chosen.name,
        dealer: chosen.chainCode,
        quantityGrams: remaining,
        pricePaid: chosen.price,
        earnsTrumf: isTrumfEligible(chosen.chainCode),
        productUrl: chosen.productUrl,
      };
      allShoppingItems.push(item);
      recipeCost += chosen.price;
    }

    perRecipe.push({ recipeId: planItem.recipeId, costNok: recipeCost });
  }

  // Group by dealer.
  const byDealer = new Map<ChainCode, ShoppingItem[]>();
  for (const item of allShoppingItems) {
    const list = byDealer.get(item.dealer) ?? [];
    list.push(item);
    byDealer.set(item.dealer, list);
  }

  const storeBreakdown: StoreBreakdown[] = Array.from(byDealer.entries()).map(([dealer, items]) => {
    const subtotal = items.reduce((s, i) => s + i.pricePaid, 0);
    const trumfEarned = items.filter((i) => i.earnsTrumf).reduce((s, i) => s + i.pricePaid * TRUMF_RATE, 0);
    return { dealer, items, subtotal, trumfEarned };
  });

  const totalNok = storeBreakdown.reduce((s, b) => s + b.subtotal, 0);
  const trumfEstimateNok = storeBreakdown.reduce((s, b) => s + b.trumfEarned, 0);
  const storeStops = storeBreakdown.length;

  const feasible = totalNok <= input.householdContext.weeklyBudgetNok;
  const reason = feasible
    ? undefined
    : `exceeds weekly budget by ${(totalNok - input.householdContext.weeklyBudgetNok).toFixed(2)} NOK`;

  return {
    feasible,
    reason,
    totalNok,
    trumfEstimateNok,
    storeStops,
    storeBreakdown,
    perRecipe,
    pantrySavingsNok,
    warnings,
  };
}

/**
 * Phase 1 helper — pulls the trailing ingredient name out of "200 g kokosmelk".
 * Mirrors the parser's stripping logic but works from the persisted raw_text.
 */
function extractIngredientNameFromRawText(rawText: string): string {
  // Strip leading number(s) + optional unit.
  const stripped = rawText.replace(/^\s*\d+(?:[.,/]\d+)?\s*\S*\s*/, '');
  return stripped.trim().toLowerCase();
}
