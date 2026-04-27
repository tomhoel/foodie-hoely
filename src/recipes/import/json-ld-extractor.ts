/**
 * JSON-LD recipe extractor.
 *
 * Walks an HTML document looking for <script type="application/ld+json"> blocks,
 * parses each as JSON, recursively searches for any `@type: "Recipe"` node
 * (handling @graph arrays and arrays of nodes), and returns a normalized Recipe.
 *
 * Returns null if no Recipe is found (or if all JSON blocks are malformed).
 */

import * as cheerio from 'cheerio';

export interface ExtractedRecipe {
  title: string;
  sourceUrl: string;
  heroImageUrl?: string;
  totalTimeMinutes?: number;
  servings?: number;
  ingredientsRaw: string[];
  instructions: string[];
}

export function extractRecipeFromHtml(html: string, sourceUrl: string): ExtractedRecipe | null {
  const $ = cheerio.load(html);
  const blocks = $('script[type="application/ld+json"]')
    .toArray()
    .map((el) => $(el).contents().text());

  for (const text of blocks) {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      continue;
    }
    const recipe = findRecipeNode(json);
    if (recipe) return normalize(recipe, sourceUrl);
  }
  return null;
}

function findRecipeNode(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const t = obj['@type'];
  if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) {
    return obj;
  }
  // Look in @graph and any other nested arrays/objects.
  for (const v of Object.values(obj)) {
    const found = findRecipeNode(v);
    if (found) return found;
  }
  return null;
}

function normalize(node: Record<string, unknown>, sourceUrl: string): ExtractedRecipe {
  return {
    title: typeof node.name === 'string' ? node.name : 'Untitled',
    sourceUrl,
    heroImageUrl: extractImageUrl(node.image),
    totalTimeMinutes: parseIsoDurationMinutes(node.totalTime),
    servings: parseServings(node.recipeYield),
    ingredientsRaw: extractIngredients(node.recipeIngredient),
    instructions: extractInstructions(node.recipeInstructions),
  };
}

function extractImageUrl(image: unknown): string | undefined {
  if (!image) return undefined;
  if (typeof image === 'string') return image;
  if (Array.isArray(image)) {
    const first = image[0];
    return typeof first === 'string' ? first : extractImageUrl(first);
  }
  if (typeof image === 'object') {
    const obj = image as Record<string, unknown>;
    if (typeof obj.url === 'string') return obj.url;
    if (typeof obj['@id'] === 'string') return obj['@id'] as string;
  }
  return undefined;
}

function parseIsoDurationMinutes(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  // ISO 8601 duration: PT[nH][nM][nS]
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return undefined;
  const [, h, m, s] = match;
  const hours = h ? parseInt(h, 10) : 0;
  const minutes = m ? parseInt(m, 10) : 0;
  const seconds = s ? parseInt(s, 10) : 0;
  const total = hours * 60 + minutes + Math.round(seconds / 60);
  return total > 0 ? total : undefined;
}

function parseServings(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const match = value.match(/^\s*(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  if (Array.isArray(value)) {
    for (const v of value) {
      const r = parseServings(v);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

function extractIngredients(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string').map((s) => s.trim());
  }
  if (typeof value === 'string') {
    return value.split(/\n|;/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function extractInstructions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((step) => {
        if (typeof step === 'string') return step.trim();
        if (step && typeof step === 'object' && typeof (step as Record<string, unknown>).text === 'string') {
          return ((step as Record<string, unknown>).text as string).trim();
        }
        return '';
      })
      .filter((s) => s.length > 0);
  }
  if (typeof value === 'string') {
    // Split on sentence boundaries (period followed by whitespace).
    return value
      .split(/(?<=\.)\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}
