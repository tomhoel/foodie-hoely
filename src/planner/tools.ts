import { tool } from 'ai';
import { z } from 'zod';
import type { ChainCode } from '../ingestion/adapter.interface';
import type { RecipeWithIngredients } from '../db/repositories/recipes.repo';
import type { ProductCandidate } from '../optimizer/ingredient-resolver';
import type { PantrySummaryItem } from '../db/repositories/pantry.repo';
import type { ActiveOffer } from '../db/repositories/active-offers.repo';
import { computePlanCost } from '../optimizer/optimizer';

export interface HouseholdPreferences {
  spicePreference?: number;
  dislikes?: string[];
  diet?: string[];
  allergies?: string[];
  diners?: number;
}

export interface CompletedMealRef {
  recipe_id: string;
  planned_for: string;
}

export interface PlannerContext {
  householdId: string;
  weekStart: string; // YYYY-MM-DD (Monday)
  recipeCount: number;
  weeklyBudgetNok: number;
  allowedChains: ChainCode[];
  preferences: HouseholdPreferences;
  pantry: PantrySummaryItem[];
  activeOffers: ActiveOffer[];
  recentHistory: CompletedMealRef[];
  eligibleRecipes: Map<string, RecipeWithIngredients>;
  productCandidates: Map<string, ProductCandidate[]>;
}

export interface FinalizeSlot {
  value: { recipeIds: string[]; servings: number[]; reasoning: string } | null;
}

export function createPlannerTools(ctx: PlannerContext, finalize: FinalizeSlot = { value: null }) {
  return {
    list_eligible_recipes: tool({
      description: 'List recipe IDs + titles available to this household.',
      inputSchema: z.object({}).strict(),
      execute: async () => {
        return Array.from(ctx.eligibleRecipes.values()).map((r) => ({
          id: r.recipe.id,
          title: r.recipe.title,
          totalTimeMinutes: r.recipe.total_time_minutes,
          servings: r.recipe.servings,
        }));
      },
    }),
    get_recipe_details: tool({
      description: 'Fetch ingredients + cook time for a recipe by id.',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const r = ctx.eligibleRecipes.get(id);
        if (!r) return { error: `recipe ${id} not in eligible set` };
        return {
          id: r.recipe.id,
          title: r.recipe.title,
          totalTimeMinutes: r.recipe.total_time_minutes,
          servings: r.recipe.servings,
          ingredients: r.ingredients.map((i) => ({
            raw: i.raw_text,
            grams: i.quantity_grams,
            importance: i.importance,
          })),
        };
      },
    }),
    cost_recipe: tool({
      description: 'Compute deterministic cost for a single recipe at the given servings.',
      inputSchema: z.object({ recipeId: z.string(), servings: z.number().int().positive() }),
      execute: async ({ recipeId, servings }) => {
        return computePlanCost({
          mealPlan: [{ recipeId, servings }],
          recipes: ctx.eligibleRecipes,
          pantry: ctx.pantry.map((p) => ({ canonicalName: p.canonicalName, grams: p.grams, confidence: p.confidence })),
          productCandidatesPerIngredient: ctx.productCandidates,
          householdContext: {
            allowedChains: ctx.allowedChains,
            weeklyBudgetNok: ctx.weeklyBudgetNok,
            storeStopPenaltyNok: 10,
          },
        });
      },
    }),
    cost_plan: tool({
      description: 'Compute deterministic cost for a multi-recipe plan. Returns feasible:false if it busts the weekly budget.',
      inputSchema: z.object({
        items: z.array(z.object({ recipeId: z.string(), servings: z.number().int().positive() })),
      }),
      execute: async ({ items }) => {
        return computePlanCost({
          mealPlan: items,
          recipes: ctx.eligibleRecipes,
          pantry: ctx.pantry.map((p) => ({ canonicalName: p.canonicalName, grams: p.grams, confidence: p.confidence })),
          productCandidatesPerIngredient: ctx.productCandidates,
          householdContext: {
            allowedChains: ctx.allowedChains,
            weeklyBudgetNok: ctx.weeklyBudgetNok,
            storeStopPenaltyNok: 10,
          },
        });
      },
    }),
    get_pantry_summary: tool({
      description: 'List pantry items currently in stock (canonical name + grams + confidence).',
      inputSchema: z.object({}).strict(),
      execute: async () => ctx.pantry,
    }),
    get_active_offers: tool({
      description: 'List currently-active offers across the household chain scope.',
      inputSchema: z.object({}).strict(),
      execute: async () => ctx.activeOffers,
    }),
    get_household_preferences: tool({
      description: 'Household taste profile, dislikes, allergies, diner count.',
      inputSchema: z.object({}).strict(),
      execute: async () => ctx.preferences,
    }),
    get_recent_history: tool({
      description: 'Recipes the household has cooked in the last 4 weeks (avoid repeats).',
      inputSchema: z.object({}).strict(),
      execute: async () => ctx.recentHistory,
    }),
    finalize_plan: tool({
      description: 'Lock in the chosen recipes for this week. Call this exactly once at the end.',
      inputSchema: z.object({
        recipeIds: z.array(z.string()).min(1),
        servings: z.array(z.number().int().positive()).min(1),
        reasoning: z.string(),
      }),
      execute: async ({ recipeIds, servings, reasoning }) => {
        finalize.value = { recipeIds, servings, reasoning };
        return { ok: true };
      },
    }),
  };
}
