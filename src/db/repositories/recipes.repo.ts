/**
 * Recipes repository — persists imported recipes + their parsed ingredients.
 * Per Phase 1, household_id is left NULL (recipes are shared until Phase 2 auth).
 */

import { getSupabase } from '../client';
import type { ImportedRecipe, RecipeOrigin } from '../../recipes/import/recipe-importer';
import type { ParsedIngredient } from '../../recipes/nlp/ingredient-parser';

export interface RecipeRow {
  id: string;
  household_id: string | null;
  title: string;
  source_url: string | null;
  hero_image_url: string | null;
  total_time_minutes: number | null;
  servings: number | null;
  instructions: string[];
  origin: RecipeOrigin;
  created_at: string;
  last_cooked_at: string | null;
  times_cooked: number;
}

export interface RecipeIngredientRow {
  id: string;
  recipe_id: string;
  raw_text: string;
  quantity_grams: number | null;
  unit_original: string | null;
  canonical_ingredient_id: string | null;
  importance: 'critical' | 'enhancing' | 'garnish' | 'optional';
  substitutes: unknown[];
}

export interface RecipeWithIngredients {
  recipe: RecipeRow;
  ingredients: RecipeIngredientRow[];
}

export async function createRecipe(
  imported: ImportedRecipe,
  opts: { householdId?: string | null } = {}
): Promise<RecipeWithIngredients> {
  const supabase = getSupabase();

  const { data: recipeData, error: recipeError } = await supabase
    .from('recipes')
    .insert({
      household_id: opts.householdId ?? null,
      title: imported.title,
      source_url: imported.sourceUrl ?? null,
      hero_image_url: imported.heroImageUrl ?? null,
      total_time_minutes: imported.totalTimeMinutes ?? null,
      servings: imported.servings ?? null,
      instructions: imported.instructions,
      origin: imported.origin,
    })
    .select('*')
    .single();

  if (recipeError || !recipeData) {
    throw new Error(`createRecipe: ${recipeError?.message ?? 'no row returned'}`);
  }

  const recipe = recipeData as RecipeRow;

  if (imported.ingredients.length === 0) {
    return { recipe, ingredients: [] };
  }

  const ingredientRows = imported.ingredients.map((ing: ParsedIngredient) => ({
    recipe_id: recipe.id,
    raw_text: ing.raw,
    quantity_grams: ing.quantityGrams ?? null,
    unit_original: ing.unitOriginal ?? null,
    canonical_ingredient_id: null, // resolver fills this in later (Task 7)
    importance: 'critical' as const,
    substitutes: [],
  }));

  const { data: ingData, error: ingError } = await supabase
    .from('recipe_ingredients')
    .insert(ingredientRows)
    .select('*');

  if (ingError) {
    throw new Error(`createRecipe (ingredients): ${ingError.message}`);
  }

  return { recipe, ingredients: (ingData ?? []) as RecipeIngredientRow[] };
}

export async function getRecipe(id: string): Promise<RecipeWithIngredients | null> {
  const supabase = getSupabase();
  const { data: recipe, error: re } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (re) throw new Error(`getRecipe: ${re.message}`);
  if (!recipe) return null;

  const { data: ings, error: ie } = await supabase
    .from('recipe_ingredients')
    .select('*')
    .eq('recipe_id', id);
  if (ie) throw new Error(`getRecipe (ingredients): ${ie.message}`);

  return { recipe: recipe as RecipeRow, ingredients: (ings ?? []) as RecipeIngredientRow[] };
}
