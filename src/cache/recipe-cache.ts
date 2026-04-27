/**
 * Recipe Cache — caches only the AI-generated recipe (not product matches).
 *
 * Strategy:
 *   - Recipe (steps, tips, ingredients list): cached 30 days — expensive Gemini call
 *   - Product matching (prices, availability): always fresh — run against live DB every request
 *
 * This means the first request for "Pad Thai" pays the Gemini cost.
 * Every subsequent request skips generation but still matches fresh products.
 */

import { getSupabase } from '../db/client';

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Normalize dish name into a stable cache key */
export function normalizeCacheKey(dish: string): string {
  return dish
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export interface CachedRecipe {
  id: string;
  cache_key: string;
  dish_name: string;
  recipe: any;
  updated_at: string;
}

/** Fetch a cached recipe by key. Returns null on miss or error. */
export async function getCachedRecipe(cacheKey: string): Promise<CachedRecipe | null> {
  const db = getSupabase();
  const { data, error } = await db
    .from('recipe_cache')
    .select('id, cache_key, dish_name, recipe, updated_at')
    .eq('cache_key', cacheKey)
    .single();

  if (error || !data) return null;
  return data as CachedRecipe;
}

/** Insert or update a cached recipe. Only stores the recipe, not product matches. */
export async function setCachedRecipe(
  cacheKey: string,
  dishName: string,
  recipe: any,
): Promise<void> {
  const db = getSupabase();
  await db
    .from('recipe_cache')
    .upsert(
      {
        cache_key: cacheKey,
        dish_name: dishName,
        recipe,
        base_servings: recipe.servings || 4,
        access_count: 1,
        last_accessed_at: new Date().toISOString(),
      },
      { onConflict: 'cache_key' },
    );
}

/** Bump access stats on a cache hit (fire-and-forget). */
export async function touchCacheEntry(cacheKey: string): Promise<void> {
  const db = getSupabase();
  const { data } = await db
    .from('recipe_cache')
    .select('access_count')
    .eq('cache_key', cacheKey)
    .single();

  await db
    .from('recipe_cache')
    .update({
      last_accessed_at: new Date().toISOString(),
      access_count: (data?.access_count || 0) + 1,
    })
    .eq('cache_key', cacheKey);
}

/** Check if a cache entry is stale (older than 30 days). */
export function isCacheStale(entry: CachedRecipe): boolean {
  return Date.now() - new Date(entry.updated_at).getTime() > MAX_AGE_MS;
}
