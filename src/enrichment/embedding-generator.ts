/**
 * Embedding Generator — creates vector embeddings for products
 * and ingredient mappings using Google's embedding model.
 *
 * These embeddings power the semantic search (Tier 2 matching).
 *
 * v3 changes:
 * - In-memory embedding cache (1D) — avoids redundant API calls for common ingredients
 * - Parallel embedding generation (1E) — 5 concurrent instead of sequential
 * - Chunked .in() queries (3C) — prevents silent failures with >1000 IDs
 */

import { GoogleGenAI } from "@google/genai";
import { config } from "../config";
import { getSupabase, startSyncLog, completeSyncLog, failSyncLog } from "../db/client";
import { chunkedIn } from "../utils/chunked-query";
import { logger } from "../utils/logger";
import type { Product, IngredientMapping } from "../db/types";

const ai = new GoogleGenAI({ apiKey: config.google.apiKey });

/** Subset of Product fields needed for embedding text */
type EmbeddableProduct = Pick<Product, "id" | "name" | "brand" | "description" | "ai_description" | "ai_description_en" | "ai_tags" | "category" | "subcategory" | "size" | "vendor">;

// ─── Embedding cache (1D) ───────────────────────────────────────────────────

const embeddingCache = new Map<string, number[]>();

function getCachedEmbedding(text: string): number[] | undefined {
  return embeddingCache.get(text);
}

function setCachedEmbedding(text: string, embedding: number[]): void {
  // Evict oldest entries if cache is full (~3MB at 500 entries of 768 dims)
  if (embeddingCache.size >= config.embedding.maxCacheSize) {
    const firstKey = embeddingCache.keys().next().value;
    if (firstKey !== undefined) embeddingCache.delete(firstKey);
  }
  embeddingCache.set(text, embedding);
}

// Build a rich text representation for embedding
function buildEmbeddingText(product: EmbeddableProduct): string {
  const parts: string[] = [];

  parts.push(product.name);
  if (product.brand) parts.push(`Brand: ${product.brand}`);
  if (product.ai_description) parts.push(product.ai_description);
  if (product.ai_description_en) parts.push(product.ai_description_en);
  if (product.description) parts.push(product.description);
  if (product.category) parts.push(`Category: ${product.category}`);
  if (product.subcategory) parts.push(`Subcategory: ${product.subcategory}`);
  if (product.ai_tags?.length) parts.push(`Tags: ${product.ai_tags.join(", ")}`);
  if (product.size) parts.push(`Size: ${product.size}`);
  if (product.vendor) parts.push(`Vendor: ${product.vendor}`);

  return parts.join(". ");
}

function buildIngredientEmbeddingText(ingredient: IngredientMapping): string {
  const parts: string[] = [];

  parts.push(ingredient.canonical_name);
  if (ingredient.aliases?.length) parts.push(`Also known as: ${ingredient.aliases.join(", ")}`);
  if (ingredient.search_terms_no?.length) parts.push(`Norwegian: ${ingredient.search_terms_no.join(", ")}`);
  if (ingredient.search_terms_en?.length) parts.push(`English: ${ingredient.search_terms_en.join(", ")}`);
  if (ingredient.search_terms_th?.length) parts.push(`Thai: ${ingredient.search_terms_th.join(", ")}`);
  if (ingredient.category) parts.push(`Category: ${ingredient.category}`);
  if (ingredient.notes) parts.push(ingredient.notes);

  return parts.join(". ");
}

async function generateEmbedding(text: string, retries = 3): Promise<number[]> {
  // Check cache first (1D)
  const cached = getCachedEmbedding(text);
  if (cached) {
    logger.debug("Embeddings", `Cache hit: "${text.slice(0, 40)}..."`);
    return cached;
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await ai.models.embedContent({
        model: config.google.embeddingModel,
        contents: text,
        config: { outputDimensionality: 768 },
      });
      const resp = response as any;
      const embedding = resp.embeddings?.[0]?.values || resp.embedding?.values || [];

      if (embedding.length > 0) {
        setCachedEmbedding(text, embedding);
      }

      return embedding;
    } catch (err: any) {
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  return [];
}

// ─── Concurrency helper (1E) ────────────────────────────────────────────────

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      await fn(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
}

// ─── Product embeddings ──────────────────────────────────────────────────────

export async function generateProductEmbeddings(options: {
  source?: "afood" | "meny";
  limit?: number;
  force?: boolean;
} = {}): Promise<{ generated: number }> {
  const db = getSupabase();
  const logId = await startSyncLog(options.source || "all", "embeddings");

  try {
    // Find products that need embeddings (paginate to get all)
    const pageSize = options.limit || 1000;
    let allProducts: EmbeddableProduct[] = [];
    let from = 0;

    while (true) {
      let query = db
        .from("products")
        .select("id, name, brand, description, ai_description, ai_description_en, ai_tags, category, subcategory, size, vendor")
        .eq("in_stock", true)
        .not("ai_description", "is", null)
        .range(from, from + pageSize - 1);

      if (options.source) {
        query = query.eq("source", options.source);
      }

      const { data, error: fetchErr } = await query;
      if (fetchErr) throw fetchErr;
      if (!data || data.length === 0) break;
      allProducts = allProducts.concat(data);
      if (data.length < pageSize || options.limit) break;
      from += pageSize;
    }

    const products = allProducts;
    if (products.length === 0) {
      console.log("[Embeddings] No products need embeddings");
      await completeSyncLog(logId, { embeddings_generated: 0 });
      return { generated: 0 };
    }

    // Filter out products that already have embeddings (unless force)
    // Uses chunkedIn (3C) to handle large ID arrays safely
    let productIds = products.map((p) => p.id);
    if (!options.force) {
      const existing = await chunkedIn<{ product_id: string }>(
        (ids) => db.from("product_embeddings").select("product_id").in("product_id", ids),
        productIds
      );
      const existingIds = new Set(existing.map((e) => e.product_id));
      productIds = productIds.filter((id) => !existingIds.has(id));
    }

    const toEmbed = products.filter((p) => productIds.includes(p.id));
    if (!toEmbed.length) {
      console.log("[Embeddings] All products already have embeddings");
      await completeSyncLog(logId, { embeddings_generated: 0 });
      return { generated: 0 };
    }

    console.log(`[Embeddings] Generating embeddings for ${toEmbed.length} products...`);

    let generated = 0;
    let failed = 0;

    // Parallel embedding generation (1E) — process concurrently instead of 1-at-a-time
    await runWithConcurrency(toEmbed, config.embedding.concurrency, async (product, i) => {
      try {
        const text = buildEmbeddingText(product);
        const embedding = await generateEmbedding(text);

        if (embedding.length > 0) {
          const { error: upsertError } = await db
            .from("product_embeddings")
            .upsert(
              {
                product_id: product.id,
                embedding: JSON.stringify(embedding),
                embedding_text: text,
                model_version: config.google.embeddingModel,
              },
              { onConflict: "product_id" }
            );

          if (upsertError) {
            console.warn(`[Embeddings] Upsert failed for "${product.name}": ${upsertError.message}`);
            failed++;
          } else {
            generated++;
          }
        }
      } catch (err: any) {
        console.warn(`[Embeddings] Failed "${product.name}": ${err.message}`);
        failed++;
      }

      if ((i + 1) % 50 === 0 || i + 1 === toEmbed.length) {
        console.log(`[Embeddings] Progress: ${i + 1}/${toEmbed.length} (${generated} ok, ${failed} failed)`);
      }
    });

    console.log(`[Embeddings] Generated ${generated} product embeddings`);
    await completeSyncLog(logId, { embeddings_generated: generated });
    return { generated };
  } catch (err: any) {
    console.error(`[Embeddings] Failed:`, err.message);
    await failSyncLog(logId, err.message);
    throw err;
  }
}

// ─── Ingredient embeddings ───────────────────────────────────────────────────

export async function generateIngredientEmbeddings(options: {
  force?: boolean;
} = {}): Promise<{ generated: number }> {
  const db = getSupabase();

  const { data: ingredients, error } = await db
    .from("ingredient_mappings")
    .select("*");

  if (error) throw error;
  if (!ingredients?.length) {
    console.log("[Embeddings] No ingredients to embed");
    return { generated: 0 };
  }

  // Filter already embedded
  let toEmbed = ingredients;
  if (!options.force) {
    const { data: existing } = await db
      .from("ingredient_embeddings")
      .select("ingredient_id");
    const existingIds = new Set((existing || []).map((e: { ingredient_id: string }) => e.ingredient_id));
    toEmbed = ingredients.filter((i) => !existingIds.has(i.id));
  }

  if (!toEmbed.length) {
    console.log("[Embeddings] All ingredients already have embeddings");
    return { generated: 0 };
  }

  console.log(`[Embeddings] Generating embeddings for ${toEmbed.length} ingredients...`);

  let generated = 0;

  // Parallel with concurrency limiter (1E)
  await runWithConcurrency(toEmbed, config.embedding.concurrency, async (ingredient) => {
    const text = buildIngredientEmbeddingText(ingredient);
    const embedding = await generateEmbedding(text);

    const { error: upsertError } = await db
      .from("ingredient_embeddings")
      .upsert(
        {
          ingredient_id: ingredient.id,
          embedding: JSON.stringify(embedding),
          embedding_text: text,
        },
        { onConflict: "ingredient_id" }
      );

    if (!upsertError) generated++;
  });

  console.log(`[Embeddings] Generated ${generated} ingredient embeddings`);
  return { generated };
}

// ─── Query helper (used by matcher) ──────────────────────────────────────────

export { generateEmbedding };
