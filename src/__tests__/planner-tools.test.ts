import { describe, it, expect } from 'vitest';
import { createPlannerTools, type PlannerContext } from '../planner/tools';
import type { RecipeWithIngredients } from '../db/repositories/recipes.repo';
import type { ProductCandidate } from '../optimizer/ingredient-resolver';
import type { PlanCost } from '../optimizer/types';

function fakeRecipe(id: string, title: string, grams: number): RecipeWithIngredients {
  return {
    recipe: {
      id, household_id: null, title, source_url: null, hero_image_url: null,
      total_time_minutes: 30, servings: 4, instructions: ['cook'],
      origin: 'imported_url', created_at: '2026-04-01T00:00:00Z',
      last_cooked_at: null, times_cooked: 0,
    },
    ingredients: [
      { id: 'i1', recipe_id: id, raw_text: '200 g kokosmelk', quantity_grams: grams,
        unit_original: 'g', canonical_ingredient_id: null, importance: 'critical', substitutes: [] },
    ],
  };
}

function buildCtx(): PlannerContext {
  return {
    householdId: 'hh-1',
    weekStart: '2026-04-27',
    recipeCount: 5,
    weeklyBudgetNok: 1500,
    allowedChains: ['MENY', 'KIWI'],
    preferences: { spicePreference: 5, dislikes: [] },
    pantry: [],
    activeOffers: [],
    recentHistory: [],
    eligibleRecipes: new Map([
      ['r1', fakeRecipe('r1', 'Tom Kha', 200)],
      ['r2', fakeRecipe('r2', 'Pad Thai', 100)],
    ]),
    productCandidates: new Map([
      ['kokosmelk', [
        { productId: 'p1', source: 'kassalapp', externalId: 'p1', name: 'Kokosmelk MENY', brand: null, ean: null, chainCode: 'MENY' as const, price: 25, isOffer: false, imageUrl: null, productUrl: 'https://meny.no/x', weightKg: null },
        { productId: 'p2', source: 'kassalapp', externalId: 'p2', name: 'Kokosmelk Kiwi',  chainCode: 'KIWI' as const, price: 22, brand: null, ean: null, isOffer: false, imageUrl: null, productUrl: 'https://kiwi.no/x', weightKg: null },
      ] as ProductCandidate[]],
    ]),
  };
}

describe('createPlannerTools', () => {
  it('list_eligible_recipes returns title + id from context', async () => {
    const ctx = buildCtx();
    const tools = createPlannerTools(ctx);
    const res = await tools.list_eligible_recipes.execute!({}, { toolCallId: 't', messages: [] } as any);
    expect(res).toEqual([
      { id: 'r1', title: 'Tom Kha', totalTimeMinutes: 30, servings: 4 },
      { id: 'r2', title: 'Pad Thai', totalTimeMinutes: 30, servings: 4 },
    ]);
  });

  it('cost_plan returns deterministic PlanCost for given recipes', async () => {
    const ctx = buildCtx();
    const tools = createPlannerTools(ctx);
    const res = await tools.cost_plan.execute!(
      { items: [{ recipeId: 'r1', servings: 4 }] },
      { toolCallId: 't', messages: [] } as any
    ) as PlanCost;
    expect(res.feasible).toBe(true);
    // Picks Kiwi (22) for 200g kokosmelk.
    expect(res.totalNok).toBeCloseTo(22, 5);
    expect(res.storeBreakdown).toHaveLength(1);
    expect(res.storeBreakdown[0].dealer).toBe('KIWI');
  });

  it('cost_plan flags infeasible when total exceeds budget', async () => {
    const ctx = buildCtx();
    ctx.weeklyBudgetNok = 10;
    const tools = createPlannerTools(ctx);
    const res = await tools.cost_plan.execute!(
      { items: [{ recipeId: 'r1', servings: 4 }] },
      { toolCallId: 't', messages: [] } as any
    ) as PlanCost;
    expect(res.feasible).toBe(false);
    expect(res.reason).toContain('budget');
  });

  it('finalize_plan stores args in the captured slot', async () => {
    const ctx = buildCtx();
    const captured = { value: null as null | { recipeIds: string[]; servings: number[]; reasoning: string } };
    const tools = createPlannerTools(ctx, captured);
    const res = await tools.finalize_plan.execute!(
      { recipeIds: ['r1', 'r2'], servings: [4, 2], reasoning: 'tasty week' },
      { toolCallId: 't', messages: [] } as any
    );
    expect(res).toEqual({ ok: true });
    expect(captured.value).toEqual({ recipeIds: ['r1', 'r2'], servings: [4, 2], reasoning: 'tasty week' });
  });

  it('get_pantry_summary returns the empty array from context', async () => {
    const ctx = buildCtx();
    const tools = createPlannerTools(ctx);
    const res = await tools.get_pantry_summary.execute!({}, { toolCallId: 't', messages: [] } as any);
    expect(res).toEqual([]);
  });
});
