import { describe, it, expect } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import { runPlannerLoop } from '../planner/loop';
import type { PlannerContext } from '../planner/tools';
import type { RecipeWithIngredients } from '../db/repositories/recipes.repo';
import type { ProductCandidate } from '../optimizer/ingredient-resolver';

function fakeRecipe(id: string, title: string): RecipeWithIngredients {
  return {
    recipe: {
      id, household_id: null, title, source_url: null, hero_image_url: null,
      total_time_minutes: 30, servings: 4, instructions: ['cook'],
      origin: 'imported_url', created_at: '2026-04-01T00:00:00Z',
      last_cooked_at: null, times_cooked: 0,
    },
    ingredients: [
      { id: 'i1', recipe_id: id, raw_text: '200 g kokosmelk', quantity_grams: 200,
        unit_original: 'g', canonical_ingredient_id: null, importance: 'critical', substitutes: [] },
    ],
  };
}

function buildCtx(): PlannerContext {
  return {
    householdId: 'hh-1',
    weekStart: '2026-04-27',
    recipeCount: 2,
    weeklyBudgetNok: 1500,
    allowedChains: ['KIWI'],
    preferences: { diners: 4 },
    pantry: [],
    activeOffers: [],
    recentHistory: [],
    eligibleRecipes: new Map([['r1', fakeRecipe('r1', 'Tom Kha')], ['r2', fakeRecipe('r2', 'Pad Thai')]]),
    productCandidates: new Map([
      ['kokosmelk', [
        { productId: 'p1', source: 'kassalapp', externalId: 'p1', name: 'Kokosmelk Kiwi', brand: null, ean: null, chainCode: 'KIWI', price: 22, isOffer: false, imageUrl: null, productUrl: null, weightKg: null },
      ] as ProductCandidate[]],
    ]),
  };
}

// AI SDK v6 LanguageModelV3 usage shape: nested {total, noCache, cacheRead, cacheWrite}
// for inputTokens; {total, text, reasoning} for outputTokens.
function v3Usage(input: number, output: number) {
  return {
    inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: output, text: output, reasoning: 0 },
  };
}

// AI SDK v6 finishReason is an object {unified, raw}.
const TOOL_CALLS_FINISH = { unified: 'tool-calls' as const, raw: 'tool_use' };
const STOP_FINISH = { unified: 'stop' as const, raw: 'end_turn' };

describe('runPlannerLoop', () => {
  it('captures finalize_plan args and returns them', async () => {
    const ctx = buildCtx();
    let step = 0;
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        step++;
        if (step === 1) {
          return {
            content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'list_eligible_recipes', input: '{}' }],
            finishReason: TOOL_CALLS_FINISH,
            usage: v3Usage(10, 5),
            warnings: [],
          };
        }
        if (step === 2) {
          return {
            content: [{
              type: 'tool-call', toolCallId: 'c2', toolName: 'cost_plan',
              input: JSON.stringify({ items: [{ recipeId: 'r1', servings: 4 }, { recipeId: 'r2', servings: 4 }] }),
            }],
            finishReason: TOOL_CALLS_FINISH,
            usage: v3Usage(20, 10),
            warnings: [],
          };
        }
        return {
          content: [{
            type: 'tool-call', toolCallId: 'c3', toolName: 'finalize_plan',
            input: JSON.stringify({ recipeIds: ['r1', 'r2'], servings: [4, 4], reasoning: 'balanced week' }),
          }],
          finishReason: TOOL_CALLS_FINISH,
          usage: v3Usage(30, 15),
          warnings: [],
        };
      },
    });

    const out = await runPlannerLoop(ctx, { model });
    expect(out.recipeIds).toEqual(['r1', 'r2']);
    expect(out.servings).toEqual([4, 4]);
    expect(out.reasoning).toBe('balanced week');
  });

  it('throws when finalize_plan is never called', async () => {
    const ctx = buildCtx();
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'I refuse.' }],
        finishReason: STOP_FINISH,
        usage: v3Usage(5, 3),
        warnings: [],
      }),
    });
    await expect(runPlannerLoop(ctx, { model })).rejects.toThrow(/did not finalize/);
  });
});
