import { describe, it, expect } from 'vitest';
import { computePlanCost } from '../optimizer/optimizer';
import type { OptimizerInput, ProductCandidate, RecipeWithIngredients } from '../optimizer/types';

function mkProduct(o: Partial<ProductCandidate>): ProductCandidate {
  return {
    productId: o.productId ?? 'p1',
    source: o.source ?? 'meny',
    chainCode: 'chainCode' in o ? (o.chainCode ?? null) : 'MENY',
    externalId: o.externalId ?? 'x1',
    name: o.name ?? 'Generic',
    brand: o.brand ?? null,
    ean: o.ean ?? null,
    price: o.price ?? null,
    isOffer: o.isOffer ?? false,
    imageUrl: o.imageUrl ?? null,
    productUrl: o.productUrl ?? null,
    weightKg: o.weightKg ?? null,
  };
}

function mkRecipe(id: string, title: string, ingredients: Array<{ name: string; grams: number }>): RecipeWithIngredients {
  return {
    recipe: {
      id, household_id: null, title, source_url: null, hero_image_url: null,
      total_time_minutes: null, servings: 4, instructions: [], origin: 'imported_url',
      created_at: '', last_cooked_at: null, times_cooked: 0,
    },
    ingredients: ingredients.map((ing, i) => ({
      id: `${id}-ing${i}`,
      recipe_id: id,
      raw_text: `${ing.grams} g ${ing.name}`,
      quantity_grams: ing.grams,
      unit_original: 'g',
      canonical_ingredient_id: null,
      importance: 'critical',
      substitutes: [],
    })),
  };
}

describe('computePlanCost', () => {
  it('costs a single-recipe plan with one chain', () => {
    const recipe = mkRecipe('r1', 'Pad Thai', [{ name: 'kokosmelk', grams: 400 }]);
    const input: OptimizerInput = {
      mealPlan: [{ recipeId: 'r1', servings: 4 }],
      recipes: new Map([['r1', recipe]]),
      pantry: [],
      productCandidatesPerIngredient: new Map([
        ['kokosmelk', [mkProduct({ name: 'Coco Milk', price: 25, chainCode: 'MENY' })]],
      ]),
      householdContext: {
        allowedChains: ['MENY', 'KIWI', 'AFOOD'],
        weeklyBudgetNok: 1500,
        storeStopPenaltyNok: 10,
      },
    };
    const result = computePlanCost(input);
    expect(result.feasible).toBe(true);
    expect(result.totalNok).toBe(25);
    expect(result.storeStops).toBe(1);
    expect(result.storeBreakdown).toHaveLength(1);
    expect(result.storeBreakdown[0].dealer).toBe('MENY');
    expect(result.storeBreakdown[0].subtotal).toBe(25);
    expect(result.trumfEstimateNok).toBeCloseTo(0.25); // 25 × 1%
    expect(result.perRecipe).toEqual([{ recipeId: 'r1', costNok: 25 }]);
    expect(result.warnings).toEqual([]);
  });

  it('picks the cheapest candidate across allowed chains', () => {
    const recipe = mkRecipe('r1', 'Test', [{ name: 'kokosmelk', grams: 400 }]);
    const input: OptimizerInput = {
      mealPlan: [{ recipeId: 'r1', servings: 4 }],
      recipes: new Map([['r1', recipe]]),
      pantry: [],
      productCandidatesPerIngredient: new Map([
        ['kokosmelk', [
          mkProduct({ productId: 'a', name: 'Coco Milk MENY', price: 32, chainCode: 'MENY' }),
          mkProduct({ productId: 'b', name: 'Coco Milk KIWI', price: 25, chainCode: 'KIWI' }),
        ]],
      ]),
      householdContext: {
        allowedChains: ['MENY', 'KIWI', 'AFOOD'],
        weeklyBudgetNok: 1500,
        storeStopPenaltyNok: 10,
      },
    };
    const result = computePlanCost(input);
    expect(result.totalNok).toBe(25);
    expect(result.storeBreakdown[0].dealer).toBe('KIWI');
  });

  it('respects allowedChains filter (excludes Rema even if cheaper)', () => {
    const recipe = mkRecipe('r1', 'Test', [{ name: 'kokosmelk', grams: 400 }]);
    const input: OptimizerInput = {
      mealPlan: [{ recipeId: 'r1', servings: 4 }],
      recipes: new Map([['r1', recipe]]),
      pantry: [],
      productCandidatesPerIngredient: new Map([
        ['kokosmelk', [
          mkProduct({ name: 'Coco Milk REMA', price: 18, chainCode: null }),
          mkProduct({ name: 'Coco Milk MENY', price: 25, chainCode: 'MENY' }),
        ]],
      ]),
      householdContext: {
        allowedChains: ['MENY', 'KIWI'],
        weeklyBudgetNok: 1500,
        storeStopPenaltyNok: 10,
      },
    };
    const result = computePlanCost(input);
    expect(result.totalNok).toBe(25); // MENY, not REMA
  });

  it('subtracts pantry stock from purchase requirement', () => {
    const recipe = mkRecipe('r1', 'Test', [{ name: 'kokosmelk', grams: 400 }]);
    const input: OptimizerInput = {
      mealPlan: [{ recipeId: 'r1', servings: 4 }],
      recipes: new Map([['r1', recipe]]),
      pantry: [{ canonicalName: 'kokosmelk', grams: 500, confidence: 0.9 }],
      productCandidatesPerIngredient: new Map([
        ['kokosmelk', [mkProduct({ price: 25, chainCode: 'MENY' })]],
      ]),
      householdContext: {
        allowedChains: ['MENY'],
        weeklyBudgetNok: 1500,
        storeStopPenaltyNok: 10,
      },
    };
    const result = computePlanCost(input);
    expect(result.totalNok).toBe(0); // Fully covered by pantry
    expect(result.pantrySavingsNok).toBe(25);
  });

  it('flags ingredients with no candidates as warnings (still feasible)', () => {
    const recipe = mkRecipe('r1', 'Test', [
      { name: 'kokosmelk', grams: 400 },
      { name: 'galangal', grams: 30 }, // no candidates provided
    ]);
    const input: OptimizerInput = {
      mealPlan: [{ recipeId: 'r1', servings: 4 }],
      recipes: new Map([['r1', recipe]]),
      pantry: [],
      productCandidatesPerIngredient: new Map([
        ['kokosmelk', [mkProduct({ price: 25, chainCode: 'MENY' })]],
        ['galangal', []],
      ]),
      householdContext: {
        allowedChains: ['MENY'],
        weeklyBudgetNok: 1500,
        storeStopPenaltyNok: 10,
      },
    };
    const result = computePlanCost(input);
    expect(result.feasible).toBe(true);
    expect(result.warnings.some((w) => w.includes('galangal'))).toBe(true);
  });

  it('fails when total exceeds weekly budget', () => {
    const recipe = mkRecipe('r1', 'Test', [{ name: 'caviar', grams: 100 }]);
    const input: OptimizerInput = {
      mealPlan: [{ recipeId: 'r1', servings: 4 }],
      recipes: new Map([['r1', recipe]]),
      pantry: [],
      productCandidatesPerIngredient: new Map([
        ['caviar', [mkProduct({ price: 9999, chainCode: 'MENY' })]],
      ]),
      householdContext: {
        allowedChains: ['MENY'],
        weeklyBudgetNok: 100,
        storeStopPenaltyNok: 10,
      },
    };
    const result = computePlanCost(input);
    expect(result.feasible).toBe(false);
    expect(result.reason).toMatch(/budget/i);
  });

  it('counts store stops correctly across multiple chains', () => {
    const recipe = mkRecipe('r1', 'Test', [
      { name: 'kokosmelk', grams: 400 },
      { name: 'fiskesaus', grams: 100 },
    ]);
    const input: OptimizerInput = {
      mealPlan: [{ recipeId: 'r1', servings: 4 }],
      recipes: new Map([['r1', recipe]]),
      pantry: [],
      productCandidatesPerIngredient: new Map([
        ['kokosmelk', [mkProduct({ name: 'CM', price: 25, chainCode: 'KIWI' })]],
        ['fiskesaus', [mkProduct({ name: 'FS', price: 35, chainCode: 'AFOOD' })]],
      ]),
      householdContext: {
        allowedChains: ['MENY', 'KIWI', 'AFOOD'],
        weeklyBudgetNok: 1500,
        storeStopPenaltyNok: 10,
      },
    };
    const result = computePlanCost(input);
    expect(result.storeStops).toBe(2);
    expect(result.storeBreakdown).toHaveLength(2);
  });

  it('Trumf estimate excludes AFOOD (not Trumf-eligible)', () => {
    const recipe = mkRecipe('r1', 'Test', [{ name: 'fiskesaus', grams: 100 }]);
    const input: OptimizerInput = {
      mealPlan: [{ recipeId: 'r1', servings: 4 }],
      recipes: new Map([['r1', recipe]]),
      pantry: [],
      productCandidatesPerIngredient: new Map([
        ['fiskesaus', [mkProduct({ price: 50, chainCode: 'AFOOD' })]],
      ]),
      householdContext: {
        allowedChains: ['AFOOD'],
        weeklyBudgetNok: 500,
        storeStopPenaltyNok: 10,
      },
    };
    const result = computePlanCost(input);
    expect(result.trumfEstimateNok).toBe(0);
  });
});
