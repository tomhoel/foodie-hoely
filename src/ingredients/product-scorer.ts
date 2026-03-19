/**
 * Product Scorer — ranks candidate products for an ingredient query.
 *
 * Scores products on four dimensions:
 *   1. Name relevance (does it actually match the ingredient?)
 *   2. Size preference (household vs bulk)
 *   3. Quantity fit (does the size match what the recipe needs?)
 *   4. Price reasonableness (outlier detection)
 *
 * This replaces the naive "first ilike result" approach.
 */

import {
  parseSize,
  parseSizeFromName,
  isBulkProduct,
  scoreSizePreference,
  scoreQuantityFit,
  type ParsedSize,
} from "./size-parser";

export interface ScoringContext {
  ingredientName: string;    // "garlic", "coconut milk"
  ingredientCategory?: string; // "protein", "sauce", "vegetable", etc.
  neededAmount?: string;     // "400"
  neededUnit?: string;       // "ml"
}

export interface CandidateProduct {
  id: string;
  name: string;
  source: "afood" | "meny";
  price: number | null;
  size: string | null;
  unit: string | null;
  weight_kg: number | null;
  category: string | null;
  brand: string | null;
}

export interface ScoredProduct extends CandidateProduct {
  score: number;
  scores: {
    nameRelevance: number;
    sizePreference: number;
    quantityFit: number;
    priceReasonableness: number;
  };
}

// ─── Main scoring function ───────────────────────────────────────────────────

export function scoreProduct(product: CandidateProduct, context: ScoringContext): ScoredProduct {
  const nameRelevance = scoreNameRelevance(product.name, context.ingredientName);
  const productSize = parseSize(product.size) || parseSizeFromName(product.name);
  const sizePreference = scoreSizePreference(productSize, context.ingredientCategory);
  const quantityFit = scoreQuantityFit(context.neededAmount || null, context.neededUnit || null, productSize);
  const priceReasonableness = scorePriceReasonableness(product.price, context.ingredientCategory);

  // If the product name has ZERO relevance to the ingredient, score near-zero
  // This prevents random products from scoring 0.4+ on size/price alone
  if (nameRelevance < 0.1) {
    return {
      ...product,
      score: nameRelevance * 0.1, // effectively 0
      scores: { nameRelevance, sizePreference, quantityFit, priceReasonableness },
    };
  }

  // Bulk products get a hard penalty
  if (isBulkProduct(product.name, productSize, product.price)) {
    const score = (nameRelevance * 0.45 + sizePreference * 0.20 + quantityFit * 0.20 + priceReasonableness * 0.15) * 0.3;
    return {
      ...product,
      score,
      scores: { nameRelevance, sizePreference, quantityFit, priceReasonableness },
    };
  }

  const score = nameRelevance * 0.45 + sizePreference * 0.20 + quantityFit * 0.20 + priceReasonableness * 0.15;

  return {
    ...product,
    score,
    scores: { nameRelevance, sizePreference, quantityFit, priceReasonableness },
  };
}

// Score and rank multiple products, return sorted best-first
export function rankProducts(products: CandidateProduct[], context: ScoringContext): ScoredProduct[] {
  return products
    .map((p) => scoreProduct(p, context))
    .sort((a, b) => b.score - a.score);
}

// ─── Name Relevance ──────────────────────────────────────────────────────────

// Words that indicate a product is a processed/compound item, not raw ingredient
const PRODUCT_TYPE_WORDS = new Set([
  "sauce", "saus", "paste", "pasta", "powder", "pulver",
  "oil", "olje", "vinegar", "eddik", "syrup", "sirup",
  "chips", "snack", "candy", "biscuit", "cookie", "crackers",
  "mix", "seasoning", "krydder", "dressing", "marinade",
  "ice", "is", "bar", "drink", "juice", "soda",
  "pappadum", "noodle", "noodles", "nudler", "soup", "suppe",
  "curry", "hummus", "springroll", "vårruller", "dumpling",
  "instant", "inst", "ready", "ferdig",
  "majones", "mayonnaise", "mayo",
  "nan", "naan", "bread", "brød", "flatbrød",
  "peanuts", "peanøtter", "mandler", "cashew", "almonds", "nuts", "nøtter",
  "tunfisk", "tuna", "salmon", "laks",
  "olje", "pickled", "preserved", "eggplant", "aubergine",
  "yogurt", "yoghurt",
  "cakes", "kake", "kaker", "pie", "tart",
  "snaps", "sugarsnaps",
  "gyoza", "skin", "wrapper", "wrappers", "dough", "deig",
  "mixer", "bitters", "soda", "tonic",
  "salat", "salad", "spread", "smørepålegg",
  "mung", "kidney", "black",
]);

// Words indicating the ingredient is a component, not the main product
const COMPOUND_INDICATOR_WORDS = new Set([
  "with", "w/", "med", "and", "og", "in", "i",
  "flavour", "flavor", "flv", "flavored", "style",
]);

// Qualifier words that should match between ingredient and product
const QUALIFIER_WORDS = new Set([
  "fresh", "fersk", "dried", "tørket", "frozen", "frossen",
  "roasted", "ristet", "fried", "stekt", "boiled", "kokt",
  "raw", "rå", "smoked", "røkt", "pickled", "syltet",
  "light", "lett", "dark", "mørk", "sweet", "søt",
  "crushed", "knust", "minced", "hakket", "sliced", "skivet",
  "whole", "hel", "ground", "malt", "chopped",
  "preserved", "fermented",
]);

function scoreNameRelevance(productName: string, ingredientName: string): number {
  const pName = productName.toLowerCase();
  const iName = ingredientName.toLowerCase();
  const iWords = iName.split(/\s+/);
  const pWords = pName.split(/[\s\-/]+/).filter((w) => w.length > 1);

  // Exact or near-exact match (product IS the ingredient)
  if (pName === iName) return 1.0;

  // Starts with ingredient name — but check what follows
  if (pName.startsWith(iName + " ") || pName.startsWith(iName + ",")) {
    const rest = pName.slice(iName.length).trim().replace(/^[,\s]+/, "");
    const restWords = rest.split(/[\s\-/]+/).filter((w) => w.length > 1);

    // Check if it's a compound/mix product: "Egg og Reker", "Chicken and Rice"
    const hasCompound = restWords.some((w) => COMPOUND_INDICATOR_WORDS.has(w));
    if (hasCompound) {
      return 0.25; // Mixed product, not the pure ingredient
    }

    // Check if the rest contains other food-type words
    const hasExtraFoodWords = restWords.some((w) => PRODUCT_TYPE_WORDS.has(w));
    if (hasExtraFoodWords) {
      return 0.3; // "Chili Olje", "Chili Nan" — different product
    }
    return 0.95; // "Chili 100g TH" — likely the actual ingredient
  }

  // Brand name trap: if ingredient words match the BRAND part of a product name
  // (e.g., "pork belly" matching "HAPPY BELLY gyoza skin"), penalize heavily.
  // Detect by checking if matches are only in ALL-CAPS brand prefix.
  const brandMatch = pName.match(/^([A-Z][A-Z\s\-]+)\s/);
  if (brandMatch) {
    const brandPart = brandMatch[1].toLowerCase();
    const restPart = pName.slice(brandMatch[0].length).toLowerCase();
    const matchesOnlyInBrand = iWords.every((w) => brandPart.includes(w)) &&
      !iWords.some((w) => restPart.includes(w));
    if (matchesOnlyInBrand) {
      return 0.05; // Matches brand name only, not actual product
    }
  }

  // Check if all ingredient words appear as standalone words in the product
  const allWordsPresent = iWords.every((word) => {
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, "i");
    return regex.test(pName);
  });

  // Check if the product is a compound/mix (e.g., "Egg og Reker", "Springroll w/ Shrimp")
  const hasCompoundIndicator = pWords.some((w) => COMPOUND_INDICATOR_WORDS.has(w));
  if (hasCompoundIndicator) {
    // Ingredient appears AFTER a compound word → it's a sub-component
    const afterRegex = new RegExp(
      `(?:with|w/|med|and|og|in|flavou?r)\\s+.*\\b${escapeRegex(iWords[iWords.length - 1])}\\b`,
      "i"
    );
    if (afterRegex.test(pName)) {
      return 0.15;
    }
    // Ingredient appears BEFORE a compound word → it's mixed with something else
    // e.g., "Egg og Reker" — egg is there but it's a salad/mix, not plain eggs
    const beforeRegex = new RegExp(
      `\\b${escapeRegex(iWords[0])}\\b\\s+(?:og|and|&|with|w/)\\s+\\w`,
      "i"
    );
    if (beforeRegex.test(pName)) {
      return 0.25; // It contains the ingredient but is a mix
    }
  }

  let score = allWordsPresent ? 0.85 : 0;

  // Norwegian compound word matching: "jasminris" ≈ "jasmine rice"
  if (!allWordsPresent && iWords.length > 1) {
    const allPrefixesMatch = iWords.every((word) =>
      pName.includes(word.slice(0, Math.min(word.length, 4)))
    );
    if (allPrefixesMatch) {
      const extraTypes = pWords.filter((w) => PRODUCT_TYPE_WORDS.has(w) && !iWords.includes(w));
      score = extraTypes.length === 0 ? 0.80 : 0.3;
    }
  }

  // If still no match, check partial word matches
  if (score === 0) {
    const matchingWords = iWords.filter((word) => {
      const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, "i");
      return regex.test(pName);
    });
    score = (matchingWords.length / iWords.length) * 0.5;
  }

  // Contamination penalty: product has food-type words not in the ingredient
  const extraTypeWords = pWords.filter(
    (w) => PRODUCT_TYPE_WORDS.has(w) && !iWords.includes(w)
  );
  if (extraTypeWords.length > 0) {
    score -= 0.3 * extraTypeWords.length; // stronger penalty
  }

  // Name ratio penalty: if the product name is much longer than the ingredient name,
  // the ingredient is likely a minor component (e.g., "garlic" in "Hummus Tahimi w/ Garlic 380g")
  const significantProductWords = pWords.filter(
    (w) => w.length > 2 && !/^\d/.test(w) && !["stk", "pk", "ml", "kg", "th", "vn", "cn", "us", "sg", "nl", "jp", "kr"].includes(w)
  );
  const nameRatio = iWords.length / significantProductWords.length;
  if (nameRatio < 0.3) {
    score -= 0.2; // ingredient is tiny part of a long product name
  }

  // Qualifier checks
  const ingredientQualifiers = iWords.filter((w) => QUALIFIER_WORDS.has(w));
  const productQualifiers = pWords.filter((w) => QUALIFIER_WORDS.has(w));

  if (ingredientQualifiers.length > 0) {
    for (const q of ingredientQualifiers) {
      if (!pWords.includes(q)) score -= 0.1;
    }
  }

  // Product has qualifiers that the ingredient doesn't specify
  // "sweet potato" when ingredient is "potato" → penalty
  for (const pq of productQualifiers) {
    if (!ingredientQualifiers.includes(pq)) {
      score -= 0.15;
    }
  }

  return Math.max(0, Math.min(1, score));
}

// ─── Price Reasonableness ────────────────────────────────────────────────────

const PRICE_RANGES: Record<string, [number, number]> = {
  sauce: [15, 100],
  spice: [10, 80],
  carb: [15, 100],
  protein: [30, 200],
  vegetable: [8, 60],
  dairy: [10, 80],
  other: [10, 150],
};

function scorePriceReasonableness(price: number | null, category?: string): number {
  if (!price) return 0.5;

  const range = PRICE_RANGES[category || "other"] || PRICE_RANGES.other;
  const [low, high] = range;

  if (price >= low && price <= high) return 1.0;
  if (price < low) return 0.8; // cheap is fine
  if (price <= high * 2) return 0.5;
  if (price <= high * 3) return 0.3;
  return 0.1; // extremely expensive = likely bulk
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
