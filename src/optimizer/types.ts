import type { ChainCode } from '../ingestion/adapter.interface';
import type { ProductCandidate } from './ingredient-resolver';
import type { RecipeWithIngredients } from '../db/repositories/recipes.repo';

export type { ProductCandidate } from './ingredient-resolver';
export type { RecipeWithIngredients } from '../db/repositories/recipes.repo';

export interface MealPlanItem {
  recipeId: string;
  servings: number;
}

export interface PantryItem {
  canonicalName: string;
  grams: number;
  confidence: number;
}

export interface HouseholdContext {
  allowedChains: ChainCode[];
  weeklyBudgetNok: number;
  storeStopPenaltyNok: number;
}

export interface OptimizerInput {
  mealPlan: MealPlanItem[];
  recipes: Map<string, RecipeWithIngredients>;
  pantry: PantryItem[];
  productCandidatesPerIngredient: Map<string, ProductCandidate[]>;
  householdContext: HouseholdContext;
}

export interface ShoppingItem {
  ingredientName: string;
  productId: string;
  productName: string;
  dealer: ChainCode;
  quantityGrams: number;
  pricePaid: number;
  earnsTrumf: boolean;
  productUrl: string | null;
}

export interface StoreBreakdown {
  dealer: ChainCode;
  items: ShoppingItem[];
  subtotal: number;
  trumfEarned: number;
}

export interface PerRecipeCost {
  recipeId: string;
  costNok: number;
}

export interface PlanCost {
  feasible: boolean;
  reason?: string;
  totalNok: number;
  trumfEstimateNok: number;
  storeStops: number;
  storeBreakdown: StoreBreakdown[];
  perRecipe: PerRecipeCost[];
  pantrySavingsNok: number;
  warnings: string[];
}
