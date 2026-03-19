/**
 * Three-Tier Ingredient Matcher (v3 — parallel, cached, category-aware)
 *
 * Tier 1: Direct mapping lookup → score preferred products → pick best
 * Tier 2: Semantic vector search → score candidates → pick best
 * Tier 3: Substitution suggestions (fallback)
 *
 * Now quantity-aware: prefers appropriate product sizes for the recipe.
 *
 * v3 changes:
 * - In-memory mapping cache (1C) — eliminates 3-6 DB queries per ingredient
 * - Batch product lookups (1B) — single .in() query instead of N+1
 * - Parallel ingredient matching (1A) — 5 concurrent via concurrency limiter
 * - Category context boost in Tier 2 (2C) — +0.15 when categories match
 */

import { getSupabase } from "../db/client";
import { generateEmbedding } from "../enrichment/embedding-generator";
import { scoreProduct, type ScoringContext, type CandidateProduct } from "./product-scorer";
import { config } from "../config";
import { logger } from "../utils/logger";
import type { MatchResult, ProductMatch, Substitute, StructuredIngredient, IngredientMapping, Product } from "../db/types";

/** Shape returned by the match_products RPC */
interface RpcMatch {
  product_id: string;
  similarity: number;
}

/** Product fields selected for Tier 1/2 scoring */
type ProductRow = Pick<Product, "id" | "name" | "brand" | "price" | "source" | "image_url" | "product_url" | "ai_description" | "in_stock" | "size" | "unit" | "weight_kg" | "category">;

interface BlendedCandidate extends RpcMatch {
  product: ProductRow;
  productScore: number;
  blendedScore: number;
}

interface MatchOptions {
  source?: "afood" | "meny";
  maxResults?: number;
  similarityThreshold?: number;
  amount?: string;
  unit?: string;
  category?: string;
  skipValidation?: boolean;
}

const DEFAULT_OPTIONS: Required<MatchOptions> = {
  source: undefined as any,
  maxResults: 10,
  similarityThreshold: config.matching.similarityThreshold,
  amount: undefined as any,
  unit: undefined as any,
  category: undefined as any,
  skipValidation: false,
};

function buildScoringContext(ingredient: string, opts: MatchOptions): ScoringContext {
  return {
    ingredientName: ingredient,
    ingredientCategory: opts.category,
    neededAmount: opts.amount,
    neededUnit: opts.unit,
  };
}

// ─── In-memory mapping cache (1C) ────────────────────────────────────────────

let mappingsCache: Map<string, IngredientMapping> | null = null;
let mappingsList: IngredientMapping[] | null = null;

async function getMappingsCache(): Promise<Map<string, IngredientMapping>> {
  if (mappingsCache) return mappingsCache;

  const db = getSupabase();
  const { data } = await db.from("ingredient_mappings").select("*");

  mappingsCache = new Map();
  mappingsList = data || [];

  for (const m of mappingsList) {
    // Index by canonical name
    mappingsCache.set(m.canonical_name.toLowerCase(), m);
    // Index by aliases
    for (const alias of m.aliases || []) {
      mappingsCache.set(alias.toLowerCase(), m);
    }
  }

  logger.debug("Matcher", `Loaded ${mappingsList.length} mappings into cache`);
  return mappingsCache;
}

async function getAllMappings(): Promise<IngredientMapping[]> {
  await getMappingsCache();
  return mappingsList!;
}

/** Call after linker/seeder updates to refresh the cache */
export function clearMappingsCache(): void {
  mappingsCache = null;
  mappingsList = null;
}

async function findMapping(ingredient: string): Promise<IngredientMapping | null> {
  const cache = await getMappingsCache();
  const normalized = ingredient.toLowerCase().trim();

  // Try exact match (canonical or alias)
  const exact = cache.get(normalized);
  if (exact) return exact;

  // Try fuzzy: find any key that contains the normalized name
  const all = await getAllMappings();
  for (const m of all) {
    if (m.canonical_name.toLowerCase().includes(normalized) ||
        normalized.includes(m.canonical_name.toLowerCase())) {
      return m;
    }
  }

  return null;
}

// ─── Tier 1: Direct Mapping ─────────────────────────────────────────────────

async function tier1DirectMapping(
  ingredient: string,
  opts: Required<MatchOptions>
): Promise<MatchResult | null> {
  const db = getSupabase();

  const mapping = await findMapping(ingredient);
  if (!mapping) return null;

  const preferredProducts = mapping.preferred_products || [];

  // Filter by source if specified
  const candidates = opts.source
    ? preferredProducts.filter((p) => p.source === opts.source)
    : preferredProducts;

  if (!candidates.length) return null;

  // Batch load all candidate products (1B) instead of N+1 queries
  const candidateIds = candidates.map((c) => c.product_id);
  const { data: products } = await db
    .from("products")
    .select("id, name, brand, price, source, image_url, product_url, ai_description, in_stock, size, unit, weight_kg")
    .in("id", candidateIds);

  if (!products?.length) return null;

  // Build a lookup map
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Use the STORED confidence from the linker (which scored against search terms)
  // rather than re-scoring against the canonical English name (which fails for
  // Norwegian products like "Hvitløk" vs "garlic").
  for (const candidate of candidates) {
    const product = productMap.get(candidate.product_id);
    if (!product?.in_stock) continue;

    // Optionally re-score for quantity fit if recipe provides amount/unit
    let confidence = candidate.confidence;
    if (opts.amount || opts.unit) {
      const ctx = buildScoringContext(ingredient, opts);
      const productScore = scoreProduct(
        { id: product.id, name: product.name, source: product.source, price: product.price,
          size: product.size, unit: product.unit, weight_kg: product.weight_kg,
          category: null, brand: product.brand },
        ctx
      );
      // Blend stored confidence with quantity fit
      const qFit = productScore.scores.quantityFit;
      confidence = candidate.confidence * config.matching.quantityBlend.stored +
                   qFit * config.matching.quantityBlend.fit;
    }

    return {
      ingredient,
      tier: 1,
      tier_label: "direct_mapping",
      product: {
        product_id: product.id,
        name: product.name,
        brand: product.brand,
        price: product.price,
        source: product.source,
        image_url: product.image_url,
        product_url: product.product_url,
        ai_description: product.ai_description,
        similarity: confidence,
      },
      substitute: null,
      confidence,
      notes: mapping.notes,
    };
  }

  return null; // No in-stock candidates
}

// ─── Tier 2: Semantic Search (2C — category boost) ──────────────────────────

async function tier2SemanticSearch(
  ingredient: string,
  opts: Required<MatchOptions>
): Promise<MatchResult | null> {
  const db = getSupabase();

  const queryEmbedding = await generateEmbedding(ingredient);
  if (!queryEmbedding.length) return null;

  // Fetch more candidates than needed so we can score them
  const { data: matches, error } = await db.rpc("match_products", {
    query_embedding: JSON.stringify(queryEmbedding),
    match_threshold: opts.similarityThreshold,
    match_count: config.matching.tier2CandidateCount,
    source_filter: opts.source || null,
  });

  if (error || !matches?.length) return null;

  // Load full product data for scoring
  const productIds = (matches as RpcMatch[]).map((m) => m.product_id);
  const { data: products } = await db
    .from("products")
    .select("id, name, brand, price, source, image_url, product_url, ai_description, size, unit, weight_kg, category")
    .in("id", productIds);

  if (!products?.length) return null;

  // Check if Tier 1 found a mapping with a category to pass as context (2C)
  const mapping = await findMapping(ingredient);
  const mappingCategory = mapping?.category || opts.category;

  // Score each candidate: blend semantic similarity with product score
  const ctx = buildScoringContext(ingredient, opts);
  const { semantic: semanticWeight, productScore: scoreWeight } = config.matching.blendWeights;
  const categoryBoost = config.matching.categoryBoost;

  const blended: BlendedCandidate[] = [];
  for (const m of matches as RpcMatch[]) {
    const product = products.find((p) => p.id === m.product_id);
    if (!product) continue;

    const scored = scoreProduct(
      {
        id: product.id,
        name: product.name,
        source: product.source as "afood" | "meny",
        price: product.price,
        size: product.size,
        unit: product.unit,
        weight_kg: product.weight_kg,
        category: product.category,
        brand: product.brand,
      },
      ctx
    );

    // Category boost (2C): add bonus when product category matches mapping category
    let bonus = 0;
    if (mappingCategory && product.category) {
      const prodCat = product.category.toLowerCase();
      const mapCat = mappingCategory.toLowerCase();
      if (prodCat.includes(mapCat) || mapCat.includes(prodCat)) {
        bonus = categoryBoost;
      }
    }

    blended.push({
      ...m,
      product: product as ProductRow,
      productScore: scored.score,
      blendedScore: m.similarity * semanticWeight + scored.score * scoreWeight + bonus,
    });
  }

  // Sort by blended score
  blended.sort((a, b) => b.blendedScore - a.blendedScore);

  if (!blended.length) return null;

  const best = blended[0];
  return {
    ingredient,
    tier: 2,
    tier_label: "semantic_search",
    product: {
      product_id: best.product.id,
      name: best.product.name,
      brand: best.product.brand,
      price: best.product.price,
      source: best.product.source,
      image_url: best.product.image_url,
      product_url: best.product.product_url,
      ai_description: best.product.ai_description,
      similarity: best.blendedScore,
    },
    substitute: null,
    confidence: best.blendedScore,
    notes: null,
  };
}

// ─── Tier 3: Substitution ───────────────────────────────────────────────────

async function tier3Substitution(ingredient: string): Promise<MatchResult | null> {
  const db = getSupabase();

  // Try cached mapping lookup first (uses in-memory cache)
  const mapping = await findMapping(ingredient);

  if (!mapping) {
    // Semantic fallback on ingredient mappings
    const queryEmbedding = await generateEmbedding(ingredient);
    if (queryEmbedding.length) {
      const { data: semanticMappings } = await db.rpc("match_ingredients", {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: 0.4,
        match_count: 1,
      });
      if (semanticMappings?.length) {
        const sm = semanticMappings[0];
        const subs = sm.substitutes || [];
        if (subs.length) {
          return {
            ingredient,
            tier: 3,
            tier_label: "substitution",
            product: null,
            substitute: subs[0],
            confidence: sm.similarity * 0.5,
            notes: `No exact match. Closest: "${sm.canonical_name}". Suggesting substitute.`,
          };
        }
      }
    }
    return null;
  }

  const subs = (mapping.substitutes || []) as Substitute[];
  if (!subs.length) return null;

  const qualityOrder = ["excellent", "good", "acceptable", "poor"];
  const sorted = [...subs].sort(
    (a, b) => qualityOrder.indexOf(a.quality) - qualityOrder.indexOf(b.quality)
  );

  return {
    ingredient,
    tier: 3,
    tier_label: "substitution",
    product: null,
    substitute: sorted[0],
    confidence: 0.4,
    notes: mapping.notes || `"${ingredient}" not available. Suggesting substitute.`,
  };
}

// ─── Main matcher ────────────────────────────────────────────────────────────

export async function matchIngredient(
  ingredient: string,
  options: MatchOptions = {}
): Promise<MatchResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const direct = await tier1DirectMapping(ingredient, opts);
  if (direct) return direct;

  const semantic = await tier2SemanticSearch(ingredient, opts);
  if (semantic) return semantic;

  const sub = await tier3Substitution(ingredient);
  if (sub) return sub;

  return {
    ingredient,
    tier: 3,
    tier_label: "substitution",
    product: null,
    substitute: null,
    confidence: 0,
    notes: `No match found for "${ingredient}" in any store or ingredient database.`,
  };
}

// ─── Concurrency limiter (1A) ───────────────────────────────────────────────

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
}

// Match a full recipe ingredient list (accepts strings or structured ingredients)
export async function matchRecipeIngredients(
  ingredients: (string | StructuredIngredient)[],
  options: MatchOptions = {}
): Promise<{
  matches: MatchResult[];
  summary: {
    total: number;
    tier1: number;
    tier2: number;
    tier3: number;
    unmatched: number;
    estimatedTotal: number;
    sources: { afood: number; meny: number };
  };
}> {
  console.log(`[Matcher] Matching ${ingredients.length} ingredients...`);

  // Pre-warm the mapping cache before parallel matching
  await getMappingsCache();

  const matches: MatchResult[] = new Array(ingredients.length);

  // Parallel matching with concurrency limiter (1A)
  const indexedIngredients = ingredients.map((ing, idx) => ({ ing, idx }));

  await runWithConcurrency(
    indexedIngredients,
    config.matching.concurrency,
    async ({ ing, idx }) => {
      const isStructured = typeof ing !== "string";
      const name = isStructured ? ing.name : ing;
      const ingredientOpts: MatchOptions = {
        ...options,
        amount: isStructured ? ing.amount : undefined,
        unit: isStructured ? ing.unit : undefined,
        category: isStructured ? ing.category : undefined,
      };

      const result = await matchIngredient(name, ingredientOpts);
      matches[idx] = result;

      const icon = result.tier === 1 ? "1" : result.tier === 2 ? "2" : "3";
      const status = result.product
        ? `${result.product.name} (${result.product.price} kr)`
        : result.substitute
          ? `SUBSTITUTE: ${result.substitute.name}`
          : "NOT FOUND";
      console.log(`  [T${icon}] ${name} -> ${status}`);
    }
  );

  const tier1 = matches.filter((m) => m.tier === 1).length;
  const tier2 = matches.filter((m) => m.tier === 2).length;
  const tier3 = matches.filter((m) => m.tier === 3 && m.substitute).length;
  const unmatched = matches.filter((m) => m.confidence === 0).length;
  const estimatedTotal = matches.reduce((sum, m) => sum + (m.product?.price || 0), 0);

  const afood = matches.filter((m) => m.product?.source === "afood").length;
  const meny = matches.filter((m) => m.product?.source === "meny").length;

  return {
    matches,
    summary: { total: ingredients.length, tier1, tier2, tier3, unmatched, estimatedTotal, sources: { afood, meny } },
  };
}
