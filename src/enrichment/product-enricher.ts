/**
 * Product Enricher — uses Gemini Flash Lite to generate
 * rich descriptions and tags for products lacking metadata.
 *
 * This is especially critical for aFood products that only have names.
 *
 * v3 changes:
 * - Safe JSON parsing (3A) — graceful handling of malformed AI responses
 * - Retry logic with exponential backoff (3B) — handles Gemini 429 errors
 */

import { GoogleGenAI } from "@google/genai";
import { config } from "../config";
import { getSupabase, startSyncLog, completeSyncLog, failSyncLog } from "../db/client";
import { safeParseJson } from "../utils/json";
import type { Product } from "../db/types";

const ai = new GoogleGenAI({ apiKey: config.google.apiKey });

type EnrichableProduct = Pick<Product, "id" | "name" | "brand" | "description" | "category" | "subcategory" | "size" | "vendor" | "source">;

interface EnrichmentResult {
  description_no: string;
  description_en: string;
  tags: string[];
}

const ENRICH_PROMPT = `You are a grocery product specialist for Norwegian and Asian food markets.
Given a product's available info, generate:
1. A rich description in Norwegian (2-3 sentences covering what it is, how it's used in cooking, what cuisine it belongs to)
2. A rich description in English (same content)
3. Searchable tags (ingredient type, cuisine, use case, dietary info)

Respond in this exact JSON format, no markdown:
{
  "description_no": "...",
  "description_en": "...",
  "tags": ["tag1", "tag2", "tag3"]
}

Product info:`;

function buildProductContext(product: EnrichableProduct): string {
  const parts: string[] = [];
  parts.push(`Name: ${product.name}`);
  if (product.brand) parts.push(`Brand: ${product.brand}`);
  if (product.description) parts.push(`Description: ${product.description}`);
  if (product.category) parts.push(`Category: ${product.category}`);
  if (product.subcategory) parts.push(`Subcategory: ${product.subcategory}`);
  if (product.size) parts.push(`Size: ${product.size}`);
  if (product.vendor) parts.push(`Vendor: ${product.vendor}`);
  parts.push(`Source: ${product.source === "afood" ? "aFood Market (Asian specialty store in Norway)" : "Meny (Norwegian supermarket)"}`);
  return parts.join("\n");
}

// Retry wrapper with exponential backoff (3B)
async function enrichWithRetry(
  product: EnrichableProduct,
  maxRetries: number = 3
): Promise<EnrichmentResult | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const context = buildProductContext(product);
      const response = await ai.models.generateContent({
        model: config.google.flashModel,
        contents: `${ENRICH_PROMPT}\n${context}`,
        config: {
          temperature: 0.3,
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const text = response.text?.trim() || "";
      const result = safeParseJson<EnrichmentResult>(
        text,
        `enrichment of "${product.name}"`
      );

      if (result) return result;

      // JSON parse failed — don't retry for parse errors, only for API errors
      return null;
    } catch (err: any) {
      const isRateLimit = err.message?.includes("429") || err.message?.includes("RATE");
      if (attempt < maxRetries - 1 && isRateLimit) {
        const delayMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
        console.warn(`[Enricher] Rate limited on "${product.name}", retrying in ${delayMs}ms...`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  return null;
}

export async function enrichProducts(options: {
  source?: "afood" | "meny";
  limit?: number;
  force?: boolean;
} = {}): Promise<{ enriched: number }> {
  const db = getSupabase();
  const logId = await startSyncLog(options.source || "all", "enrichment");

  try {
    // Find products that need enrichment (paginate to get all)
    const pageSize = options.limit || 1000; // Supabase max per request
    let allProducts: EnrichableProduct[] = [];
    let from = 0;

    while (true) {
      let query = db
        .from("products")
        .select("id, name, brand, description, category, subcategory, size, vendor, source")
        .eq("in_stock", true)
        .range(from, from + pageSize - 1);

      if (!options.force) {
        query = query.is("ai_description", null);
      }
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
      console.log("[Enricher] No products need enrichment");
      await completeSyncLog(logId, { products_enriched: 0 });
      return { enriched: 0 };
    }

    console.log(`[Enricher] Enriching ${products.length} products with Flash Lite...`);

    let enriched = 0;
    let failed = 0;

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      try {
        const result = await enrichWithRetry(product);

        if (!result) {
          failed++;
          continue;
        }

        const { error: updateError } = await db
          .from("products")
          .update({
            ai_description: result.description_no || null,
            ai_description_en: result.description_en || null,
            ai_tags: result.tags || [],
          })
          .eq("id", product.id);

        if (updateError) {
          console.warn(`[Enricher] DB update failed for ${product.id}: ${updateError.message}`);
          failed++;
        } else {
          enriched++;
        }
      } catch (err: any) {
        console.warn(`[Enricher] Failed to enrich "${product.name}": ${err.message}`);
        failed++;
      }

      if ((i + 1) % 25 === 0) {
        console.log(`[Enricher] Progress: ${i + 1}/${products.length} (${enriched} enriched, ${failed} failed)`);
      }

      // Small delay to respect rate limits
      await new Promise((r) => setTimeout(r, 100));
    }

    console.log(`[Enricher] Done: ${enriched} enriched, ${failed} failed out of ${products.length}`);
    await completeSyncLog(logId, { products_enriched: enriched });
    return { enriched };
  } catch (err: any) {
    console.error(`[Enricher] Failed:`, err.message);
    await failSyncLog(logId, err.message);
    throw err;
  }
}
