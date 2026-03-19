/**
 * Ingredient Mapping Seeder — uses Gemini Flash Lite to generate
 * the ingredient knowledge base for Thai/Asian cooking.
 *
 * Run once to bootstrap, then manually curate as needed.
 */

import { GoogleGenAI } from "@google/genai";
import { config } from "../config";
import { getSupabase } from "../db/client";
import { safeParseJson } from "../utils/json";
import { clearMappingsCache } from "./matcher";

const ai = new GoogleGenAI({ apiKey: config.google.apiKey });

// Core Thai/Asian ingredients organized by category
const INGREDIENT_GROUPS = {
  "curry_pastes_and_bases": [
    "red curry paste", "green curry paste", "yellow curry paste",
    "massaman curry paste", "panang curry paste", "tom yum paste",
    "tom kha paste", "pad thai sauce",
  ],
  "sauces_and_condiments": [
    "fish sauce", "soy sauce", "dark soy sauce", "light soy sauce",
    "oyster sauce", "sweet chili sauce", "sriracha",
    "hoisin sauce", "teriyaki sauce", "sesame oil",
    "rice vinegar", "tamarind paste", "shrimp paste",
    "chili oil", "chili garlic sauce", "mirin",
    "sake", "shaoxing wine",
  ],
  "coconut_products": [
    "coconut milk", "coconut cream", "coconut oil",
    "desiccated coconut", "coconut sugar",
  ],
  "noodles_and_rice": [
    "rice noodles", "glass noodles", "egg noodles", "udon noodles",
    "ramen noodles", "soba noodles", "rice paper",
    "jasmine rice", "sticky rice", "sushi rice",
    "rice flour", "tapioca starch",
  ],
  "herbs_and_aromatics": [
    "lemongrass", "galangal", "kaffir lime leaves",
    "Thai basil", "cilantro", "mint",
    "ginger", "turmeric", "pandan leaves",
    "spring onion", "shallots", "garlic",
    "bird's eye chili", "dried chili",
  ],
  "proteins": [
    "tofu", "tempeh", "dried shrimp",
    "chicken thigh", "pork belly", "beef flank",
    "shrimp", "squid", "fish fillet",
    "fish balls", "fish cake",
  ],
  "vegetables": [
    "bok choy", "Chinese cabbage", "water spinach",
    "bamboo shoots", "water chestnuts", "baby corn",
    "bean sprouts", "eggplant", "Thai eggplant",
    "long beans", "snow peas", "mushrooms",
    "shiitake mushrooms", "oyster mushrooms", "enoki mushrooms",
    "daikon radish", "lotus root",
  ],
  "pantry_staples": [
    "palm sugar", "rock sugar", "brown sugar",
    "peanuts", "cashew nuts", "sesame seeds",
    "dried seaweed", "nori", "bonito flakes",
    "star anise", "cinnamon stick", "cardamom",
    "cumin", "coriander seeds", "white pepper",
    "five spice powder", "MSG",
  ],
  "wrappers_and_misc": [
    "wonton wrappers", "spring roll wrappers",
    "banana leaves", "corn starch",
    "panko breadcrumbs", "tempura flour",
  ],
  "everyday_basics": [
    "eggs", "vegetable oil", "garlic", "onion", "red onion", "white onion",
    "chicken breast", "chicken thigh", "pork", "pork belly", "beef", "beef chuck",
    "shrimp", "prawns", "lime", "lemon", "sugar", "salt", "black pepper", "white pepper",
    "butter", "cream", "milk", "flour", "chili", "bell pepper", "red bell pepper",
    "tomato", "cherry tomatoes", "cucumber", "carrot", "potato", "broccoli",
    "chicken broth", "chicken stock", "soy milk",
    "green beans", "cilantro", "coriander", "lime juice",
    "roasted peanuts", "nori", "soy sauce",
  ],
};

const SEED_PROMPT = `You are a food expert specializing in Thai and Asian cuisine in Norway.

For the ingredient below, generate a complete mapping that will help an AI match this ingredient to products available at Norwegian grocery stores (Meny, aFood Market).

Respond in this exact JSON format, no markdown:
{
  "canonical_name": "the standard English name",
  "aliases": ["alternative names in any language"],
  "search_terms_no": ["Norwegian search terms that would find this in a Norwegian store"],
  "search_terms_en": ["English search terms"],
  "search_terms_th": ["Thai romanized names if applicable"],
  "category": "ingredient category",
  "cuisine_tags": ["thai", "asian", etc],
  "importance": "critical|enhancing|garnish|optional",
  "substitutes": [
    {"name": "substitute ingredient", "ratio": "ratio", "quality": "excellent|good|acceptable|poor", "notes": "when/why to use"}
  ],
  "notes": "Tips about brands, quality, what to look for in Norwegian stores. Mention specific brands available at aFood Market or Meny if you know them (e.g., Aroy-D, Mae Ploy, Squid Brand, Blue Dragon)."
}

Ingredient: `;

export async function seedIngredientMappings(options: {
  categories?: string[];
  force?: boolean;
} = {}): Promise<{ seeded: number; skipped: number }> {
  const db = getSupabase();

  // Determine which ingredients to seed
  const groups = options.categories
    ? Object.entries(INGREDIENT_GROUPS).filter(([key]) => options.categories!.includes(key))
    : Object.entries(INGREDIENT_GROUPS);

  const allIngredients = groups.flatMap(([, items]) => items);

  // Check what's already in the DB
  const { data: existing } = await db
    .from("ingredient_mappings")
    .select("canonical_name");
  const existingNames = new Set((existing || []).map((e: { canonical_name: string }) => e.canonical_name.toLowerCase()));

  const toSeed = options.force
    ? allIngredients
    : allIngredients.filter((name) => !existingNames.has(name.toLowerCase()));

  if (!toSeed.length) {
    console.log("[Seeder] All ingredients already mapped");
    return { seeded: 0, skipped: allIngredients.length };
  }

  console.log(`[Seeder] Generating mappings for ${toSeed.length} ingredients (${allIngredients.length - toSeed.length} already exist)...`);

  let seeded = 0;
  let failed = 0;

  for (let i = 0; i < toSeed.length; i++) {
    const ingredient = toSeed[i];
    try {
      const response = await ai.models.generateContent({
        model: config.google.flashModel,
        contents: SEED_PROMPT + ingredient,
        config: {
          temperature: 0.3,
          maxOutputTokens: 2048,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const text = response.text?.trim() || "";
      const mapping = safeParseJson<any>(text, `seeding "${ingredient}"`);
      if (!mapping) {
        console.warn(`[Seeder] Skipping "${ingredient}": unparseable AI response`);
        failed++;
        continue;
      }

      const { error } = await db
        .from("ingredient_mappings")
        .upsert(
          {
            canonical_name: mapping.canonical_name || ingredient,
            aliases: mapping.aliases || [],
            search_terms_no: mapping.search_terms_no || [],
            search_terms_en: mapping.search_terms_en || [],
            search_terms_th: mapping.search_terms_th || [],
            category: mapping.category || null,
            cuisine_tags: mapping.cuisine_tags || [],
            importance: mapping.importance || "critical",
            substitutes: mapping.substitutes || [],
            notes: mapping.notes || null,
            availability: "unknown",
          },
          { onConflict: "canonical_name" }
        );

      if (error) {
        console.warn(`[Seeder] DB insert failed for "${ingredient}": ${error.message}`);
        failed++;
      } else {
        seeded++;
      }
    } catch (err: any) {
      console.warn(`[Seeder] Failed to generate mapping for "${ingredient}": ${err.message}`);
      failed++;
    }

    if ((i + 1) % 10 === 0) {
      console.log(`[Seeder] Progress: ${i + 1}/${toSeed.length} (${seeded} seeded, ${failed} failed)`);
    }

    // Rate limit: ~100ms between calls
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`[Seeder] Done: ${seeded} seeded, ${failed} failed`);

  // Clear the matcher's in-memory cache so it picks up new mappings
  clearMappingsCache();

  return { seeded, skipped: allIngredients.length - toSeed.length };
}

// Link ingredient mappings to actual products in the DB
export async function linkIngredientsToProducts(): Promise<{ linked: number }> {
  const db = getSupabase();

  const { data: mappings, error } = await db
    .from("ingredient_mappings")
    .select("id, canonical_name, search_terms_no, search_terms_en, category");
  if (error) throw error;
  if (!mappings?.length) return { linked: 0 };

  console.log(`[Linker] Linking ${mappings.length} ingredients to products...`);

  let linked = 0;

  for (const mapping of mappings) {
    // English first (aFood uses English names), then Norwegian (Meny)
    const searchTerms = [
      ...(mapping.search_terms_en || []),
      ...(mapping.search_terms_no || []),
      mapping.canonical_name,
    ];
    const uniqueTerms = [...new Set(searchTerms.map((t: string) => t.toLowerCase()))];
    const allCandidates: Array<{ id: string; name: string; source: "afood" | "meny"; price: number | null; size: string | null; unit: string | null; weight_kg: number | null; category: string | null; brand: string | null; _matchedTerm: string }> = [];

    for (const term of uniqueTerms.slice(0, 8)) {
      const { data: products } = await db
        .from("products")
        .select("id, name, source, price, size, unit, weight_kg, category, brand")
        .eq("in_stock", true)
        .ilike("name", `%${term}%`)
        .limit(10);

      if (products?.length) {
        for (const p of products) {
          if (!allCandidates.find((c) => c.id === p.id)) {
            allCandidates.push({ ...p, _matchedTerm: term });
          }
        }
      }
    }

    // Score candidates against BOTH canonical name AND the search term that found them.
    // This handles English→Norwegian mismatches (e.g., "coconut milk" vs "kokosmelk").
    const { scoreProduct } = await import("./product-scorer");
    const scored = allCandidates.map((p) => {
      const canonicalScore = scoreProduct(p, {
        ingredientName: mapping.canonical_name,
        ingredientCategory: mapping.category || undefined,
      });
      // Also score against the search term that matched
      const termScore = p._matchedTerm
        ? scoreProduct(p, {
            ingredientName: p._matchedTerm,
            ingredientCategory: mapping.category || undefined,
          })
        : canonicalScore;
      // Use whichever score is higher
      return termScore.score > canonicalScore.score
        ? { ...termScore, score: termScore.score }
        : canonicalScore;
    }).sort((a, b) => b.score - a.score);

    // Take top 5 products with score > 0.3
    const topProducts = scored.filter((p) => p.score > 0.3).slice(0, 5);

    const preferredProducts = topProducts.map((p) => ({
      source: p.source,
      product_id: p.id,
      name: p.name,
      confidence: Math.round(p.score * 100) / 100,
      size: p.size,
      price: p.price,
    }));

    if (preferredProducts.length > 0) {
      const sources = new Set(preferredProducts.map((p) => p.source));
      const availability = sources.has("afood") && sources.has("meny")
        ? "both"
        : sources.has("afood")
          ? "afood_only"
          : "meny_only";

      const { error: updateError } = await db
        .from("ingredient_mappings")
        .update({
          preferred_products: preferredProducts,
          availability,
        })
        .eq("id", mapping.id);

      if (!updateError) linked++;
    }
  }

  console.log(`[Linker] Linked ${linked} ingredients to products`);

  // Clear the matcher's in-memory cache so it picks up updated preferred_products
  clearMappingsCache();

  return { linked };
}

export { INGREDIENT_GROUPS };
