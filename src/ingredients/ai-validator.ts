/**
 * AI Match Validator — uses Gemini 3.1 Flash Lite to review
 * and correct ingredient-to-product matches.
 *
 * Runs AFTER the three-tier matching system as a quality gate.
 * For each match, the AI checks: "Is this product actually what
 * the recipe needs?" If not, searches for a better alternative.
 *
 * v4 changes:
 * - Uses shared aiCallJson wrapper (retry on 429/503)
 * - Parallelized replacement searches (WRONG verdicts processed concurrently)
 */

import { aiCallJson } from "../utils/ai";
import type { MatchResult } from "../db/types";

const VALIDATE_PROMPT = `You are a grocery shopping expert for Norwegian stores (aFood Market, Meny).

A recipe matching system paired recipe ingredients with grocery products. Review each match and determine if the product is correct.

For each ingredient→product pair, respond with:
- "OK" if the product is what the recipe actually needs
- "WRONG: reason | better search term" if the match is incorrect

Be strict but CAREFUL. Common mistakes to catch:
- "eggs" matched to "egg salad" or "egg noodles" instead of plain eggs
- "garlic" matched to "garlic sauce" instead of fresh garlic
- "sugar" matched to "sugar snaps" (a vegetable) instead of actual sugar
- "pork belly" matched to a brand called "HAPPY BELLY"
- "water" matched to any product (water doesn't need to be purchased)
- "carrot" matched to "carrot cake" instead of fresh carrot
- Pickled/preserved variants when fresh is needed
- Bulk commercial sizes when household size is needed
- "chili" matched to a PRODUCT flavored with chili (e.g. "Tunfisk Thai Chili" is tuna, not chili)

CRITICAL RULES for your corrections:
- If the current match is REASONABLE (e.g. fresh chili matched to fresh chili), say OK even if it's not perfect
- When suggesting a "better search term", ONLY suggest the raw ingredient name in Norwegian — NEVER suggest a specific branded product or a product that is a completely different food category
- A product that CONTAINS the ingredient as a flavor is NOT the same as the raw ingredient (e.g. "Thai Chili Tuna" is NOT "bird eye chili")
- When in doubt, say OK — a slightly imperfect match is better than a wrong correction

Respond in this exact JSON format, no markdown:
[
  {"index": 0, "verdict": "OK"},
  {"index": 1, "verdict": "WRONG: product is egg salad, not plain eggs | egg frittgående"},
  {"index": 2, "verdict": "SKIP: water does not need to be purchased"}
]

Matches to review:`;

export async function validateMatches(
  ingredients: string[],
  matches: MatchResult[]
): Promise<{
  validatedMatches: MatchResult[];
  corrections: number;
  skipped: number;
  validationSkipped: boolean;
}> {
  // Build the review payload
  const pairs = ingredients.map((ing, i) => {
    const m = matches[i];
    const product = m.product
      ? `${m.product.name} (${m.product.price} kr, ${m.product.source})`
      : m.substitute
        ? `SUBSTITUTE: ${m.substitute.name}`
        : "NOT FOUND";
    return `${i}. "${ing}" → ${product}`;
  });

  const prompt = `${VALIDATE_PROMPT}\n${pairs.join("\n")}`;

  try {
    // Use shared AI wrapper — retries on rate limits and transient errors
    const verdicts = await aiCallJson<{ index: number; verdict: string }[]>(prompt, {
      temperature: 0.1,
      maxOutputTokens: 1500,
      context: "match validation",
    });

    if (!verdicts) {
      console.warn(`  [AI] Validation returned unparseable response. Using original matches.`);
      return { validatedMatches: matches, corrections: 0, skipped: 0, validationSkipped: true };
    }

    // Process verdicts
    const validatedMatches = [...matches];
    let corrections = 0;
    let skipped = 0;

    // Separate SKIP verdicts (instant) from WRONG verdicts (need replacement search)
    const wrongVerdicts: { index: number; betterTerm: string }[] = [];

    for (const v of verdicts) {
      if (v.index < 0 || v.index >= matches.length) continue;

      if (v.verdict.startsWith("SKIP")) {
        validatedMatches[v.index] = {
          ...matches[v.index],
          product: null,
          substitute: null,
          confidence: 0,
          notes: v.verdict.replace("SKIP: ", ""),
        };
        skipped++;
        console.log(`  [AI] SKIP #${v.index} "${ingredients[v.index]}": ${v.verdict}`);
      } else if (v.verdict.startsWith("WRONG")) {
        const searchTermMatch = v.verdict.match(/\|\s*(.+)$/);
        const betterTerm = searchTermMatch?.[1]?.trim();
        if (betterTerm) {
          wrongVerdicts.push({ index: v.index, betterTerm });
        }
      }
    }

    // Parallelize all replacement searches (instead of sequential)
    if (wrongVerdicts.length > 0) {
      const replacements = await Promise.all(
        wrongVerdicts.map(async (v) => {
          const betterMatch = await searchForBetterProduct(
            v.betterTerm,
            matches[v.index].product?.source
          );
          return { ...v, betterMatch };
        })
      );

      for (const r of replacements) {
        const v = verdicts.find((vv) => vv.index === r.index);
        if (r.betterMatch) {
          validatedMatches[r.index] = {
            ...matches[r.index],
            product: r.betterMatch,
            confidence: 0.85,
            notes: `AI-corrected: ${v?.verdict.split("|")[0].replace("WRONG: ", "").trim()}`,
          };
          corrections++;
          console.log(`  [AI] FIX  #${r.index} "${ingredients[r.index]}": ${matches[r.index].product?.name} → ${r.betterMatch.name}`);
        } else {
          console.log(`  [AI] WARN #${r.index} "${ingredients[r.index]}": ${v?.verdict} (no replacement found)`);
        }
      }
    }

    return { validatedMatches, corrections, skipped, validationSkipped: false };
  } catch (err: any) {
    console.warn(`  [AI] Validation failed: ${err.message}. Using original matches.`);
    return { validatedMatches: matches, corrections: 0, skipped: 0, validationSkipped: true };
  }
}

// ─── Replacement search (2B — upgraded to use full matcher) ─────────────────

async function searchForBetterProduct(
  searchTerm: string,
  preferredSource?: string
): Promise<MatchResult["product"] | null> {
  try {
    const { matchIngredient } = await import("./matcher");
    const result = await matchIngredient(searchTerm, {
      source: preferredSource as "afood" | "meny" | undefined,
      skipValidation: true,
    });

    if (result.product) {
      return { ...result.product, similarity: 0.85 };
    }

    // Try without source filter
    if (preferredSource) {
      const fallback = await matchIngredient(searchTerm, { skipValidation: true });
      if (fallback.product) {
        return { ...fallback.product, similarity: 0.85 };
      }
    }

    return null;
  } catch {
    return searchForBetterProductFallback(searchTerm, preferredSource);
  }
}

async function searchForBetterProductFallback(
  searchTerm: string,
  preferredSource?: string
): Promise<MatchResult["product"] | null> {
  const { getSupabase } = await import("../db/client");
  const db = getSupabase();

  let query = db
    .from("products")
    .select("id, name, brand, price, source, image_url, product_url, ai_description")
    .eq("in_stock", true)
    .ilike("name", `%${searchTerm}%`)
    .limit(5);

  if (preferredSource) {
    query = query.eq("source", preferredSource);
  }

  const { data: products } = await query;

  if (!products?.length) {
    if (!preferredSource) return null;
    const { data: anyProducts } = await db
      .from("products")
      .select("id, name, brand, price, source, image_url, product_url, ai_description")
      .eq("in_stock", true)
      .ilike("name", `%${searchTerm}%`)
      .limit(5);

    if (!anyProducts?.length) return null;
    const p = anyProducts[0];
    return {
      product_id: p.id, name: p.name, brand: p.brand, price: p.price,
      source: p.source, image_url: p.image_url, product_url: p.product_url,
      ai_description: p.ai_description, similarity: 0.85,
    };
  }

  const p = products[0];
  return {
    product_id: p.id, name: p.name, brand: p.brand, price: p.price,
    source: p.source, image_url: p.image_url, product_url: p.product_url,
    ai_description: p.ai_description, similarity: 0.85,
  };
}
