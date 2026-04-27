import { getSupabase } from '../client';
import type { RecipeRow } from './recipes.repo';

export interface RecipeListItem {
  id: string;
  title: string;
  total_time_minutes: number | null;
  servings: number | null;
  source_url: string | null;
  origin: string;
  last_cooked_at: string | null;
  times_cooked: number;
}

/**
 * Returns recipes visible to a household: shared (household_id IS NULL) plus
 * the household's own recipes. Phase 1 imports always set household_id=NULL,
 * so this returns the global cookbook.
 */
export async function listEligibleRecipes(householdId: string, limit = 200): Promise<RecipeListItem[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('recipes')
    .select('id, title, total_time_minutes, servings, source_url, origin, last_cooked_at, times_cooked')
    .or(`household_id.is.null,household_id.eq.${householdId}`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listEligibleRecipes: ${error.message}`);
  return (data ?? []) as RecipeListItem[];
}

export interface RecipeDetailsLite {
  id: string;
  title: string;
  total_time_minutes: number | null;
  servings: number | null;
  source_url: string | null;
  ingredients: Array<{
    raw_text: string;
    quantity_grams: number | null;
    importance: 'critical' | 'enhancing' | 'garnish' | 'optional';
  }>;
}

export async function getRecipeDetailsLite(id: string): Promise<RecipeDetailsLite | null> {
  const supabase = getSupabase();
  const { data: recipe, error } = await supabase
    .from('recipes')
    .select('id, title, total_time_minutes, servings, source_url')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getRecipeDetailsLite: ${error.message}`);
  if (!recipe) return null;

  const { data: ingredients, error: ie } = await supabase
    .from('recipe_ingredients')
    .select('raw_text, quantity_grams, importance')
    .eq('recipe_id', id);
  if (ie) throw new Error(`getRecipeDetailsLite (ingredients): ${ie.message}`);

  return { ...(recipe as Omit<RecipeDetailsLite, 'ingredients'>), ingredients: (ingredients ?? []) as RecipeDetailsLite['ingredients'] };
}
