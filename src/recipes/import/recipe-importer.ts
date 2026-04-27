/**
 * Recipe importer — given a URL, fetches the HTML, extracts the Recipe via
 * JSON-LD, and parses each ingredient string with the Norwegian parser.
 *
 * Output is the canonical Recipe + RecipeIngredient[] shape that gets persisted
 * to the `recipes` and `recipe_ingredients` tables (see Task 6).
 */

import { extractRecipeFromHtml } from './json-ld-extractor';
import { parseIngredient, type ParsedIngredient } from '../nlp/ingredient-parser';

const USER_AGENT = 'foodie-hoely/1.0 (+https://github.com/tomhoel/foodie-hoely)';

export type RecipeOrigin =
  | 'imported_url'
  | 'photo'
  | 'ai_generated'
  | 'inferred_from_receipt'
  | 'manual';

export interface ImportedRecipe {
  title: string;
  sourceUrl: string;
  heroImageUrl?: string;
  totalTimeMinutes?: number;
  servings?: number;
  origin: RecipeOrigin;
  instructions: string[];
  ingredients: ParsedIngredient[];
}

export async function importRecipeFromUrl(url: string): Promise<ImportedRecipe> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  const html = await res.text();
  const extracted = extractRecipeFromHtml(html, url);
  if (!extracted) {
    throw new Error(`No recipe found at ${url} (no schema.org/Recipe JSON-LD detected)`);
  }
  const ingredients = extracted.ingredientsRaw.map((raw) => parseIngredient(raw));
  return {
    title: extracted.title,
    sourceUrl: extracted.sourceUrl,
    heroImageUrl: extracted.heroImageUrl,
    totalTimeMinutes: extracted.totalTimeMinutes,
    servings: extracted.servings,
    origin: 'imported_url',
    instructions: extracted.instructions,
    ingredients,
  };
}
