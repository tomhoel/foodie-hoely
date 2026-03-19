/**
 * Price Optimizer — cross-store price optimization after cart generation.
 *
 * For each cart item, finds alternative products from the other store
 * and presents savings opportunities. Only accepts alternatives that
 * are genuinely the same ingredient (name relevance check).
 */

import { matchIngredient } from "../ingredients/matcher";
import type { ShoppingCart, ShoppingCartItem } from "../recipes/generator";

export interface PriceSwitch {
  ingredient: string;
  original_product: string;
  original_price: number;
  original_source: string;
  alternative_product: string;
  alternative_price: number;
  alternative_source: string;
  savings: number;
}

export interface OptimizationResult {
  original_total: number;
  optimized_total: number;
  savings: number;
  savings_percent: number;
  switches: PriceSwitch[];
  cart: ShoppingCart;
}

const OPTIMIZER_CONCURRENCY = 5;

export async function optimizeCart(cart: ShoppingCart): Promise<OptimizationResult> {
  const switches: PriceSwitch[] = [];
  const optimizedItems = [...cart.items];

  // Parallelize alternative lookups — each item is independent
  await Promise.all(
    cart.items.map(async (item, i) => {
      if (!item.product_price) return;

      const otherSource = item.source === "afood" ? "meny" : "afood";

      const alternative = await findValidAlternative(
        item.ingredient.name,
        otherSource,
        item.ingredient
      );

      if (!alternative) return;

      if (alternative.price < item.product_price) {
        const savings = item.product_price - alternative.price;
        switches.push({
          ingredient: item.ingredient.name,
          original_product: item.product_name,
          original_price: item.product_price,
          original_source: item.source,
          alternative_product: alternative.name,
          alternative_price: alternative.price,
          alternative_source: alternative.source,
          savings,
        });

        optimizedItems[i] = {
          ...item,
          product_name: alternative.name,
          product_price: alternative.price,
          product_url: alternative.product_url,
          source: alternative.source,
          match: {
            ...item.match,
            product: {
              product_id: alternative.product_id,
              name: alternative.name,
              brand: alternative.brand,
              price: alternative.price,
              source: alternative.source,
              image_url: alternative.image_url,
              product_url: alternative.product_url,
              ai_description: alternative.ai_description,
              similarity: alternative.confidence,
            },
          },
        };
      }
    })
  );

  const originalTotal = cart.summary.total_price;
  const totalSavings = switches.reduce((sum, s) => sum + s.savings, 0);
  const optimizedTotal = originalTotal - totalSavings;

  const optimizedCart: ShoppingCart = {
    ...cart,
    items: optimizedItems,
    summary: {
      ...cart.summary,
      total_price: optimizedTotal,
      afood_items: optimizedItems.filter((i) => i.source === "afood").length,
      meny_items: optimizedItems.filter((i) => i.source === "meny").length,
    },
  };

  return {
    original_total: originalTotal,
    optimized_total: optimizedTotal,
    savings: totalSavings,
    savings_percent: originalTotal > 0 ? (totalSavings / originalTotal) * 100 : 0,
    switches,
    cart: optimizedCart,
  };
}

interface ValidAlternative {
  product_id: string;
  name: string;
  brand: string | null;
  price: number;
  source: "afood" | "meny";
  image_url: string | null;
  product_url: string | null;
  ai_description: string | null;
  confidence: number;
}

/**
 * Find a valid alternative from another store.
 * Only returns alternatives that are genuinely the same ingredient
 * by checking name relevance between the ingredient and the product.
 */
async function findValidAlternative(
  ingredientName: string,
  source: "afood" | "meny",
  ingredient: { amount: string; unit: string; category: string }
): Promise<ValidAlternative | null> {
  try {
    const result = await matchIngredient(ingredientName, {
      source,
      amount: ingredient.amount,
      unit: ingredient.unit,
      category: ingredient.category,
    });

    if (!result.product?.price) return null;

    // Quality gate: for price optimization, the alternative must actually be
    // the SAME ingredient. Apply name relevance check to ALL tiers.
    // This prevents mapping-level ambiguity (e.g., "lime" mapping links
    // to both "Lime" and "Lime leaf" in different stores).
    if ((result.tier === 1 || result.tier === 2) && result.confidence >= 0.4) {
      if (isNameRelevant(ingredientName, result.product.name)) {
        return {
          product_id: result.product.product_id,
          name: result.product.name,
          brand: result.product.brand,
          price: result.product.price,
          source: result.product.source,
          image_url: result.product.image_url,
          product_url: result.product.product_url,
          ai_description: result.product.ai_description,
          confidence: result.confidence,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a product name is genuinely related to an ingredient.
 * Prevents cross-ingredient switches (e.g., galangal → lemongrass,
 * lime → lime leaf).
 */
function isNameRelevant(ingredientName: string, productName: string): boolean {
  const iWords = ingredientName.toLowerCase().split(/\s+/);
  const pName = productName.toLowerCase();
  // Strip size/origin suffixes for comparison: "Lime leaf 50g TH" → "lime leaf"
  const pCore = pName.replace(/\b\d+\s*(g|kg|ml|l|cl|stk|pk|pcs)\b/gi, "")
    .replace(/\b[A-Z]{2}\b/g, "").trim();
  const pWords = pCore.split(/[\s\-/]+/).filter((w) => w.length > 1);

  // For short ingredient names (1 word like "lime"), check that the product
  // doesn't add food-type words that change the ingredient identity
  // "lime" should match "Lime" or "Lime 4pk" but NOT "Lime leaf" or "Lime sauce"
  const identityChangingWords = new Set([
    "leaf", "leaves", "oil", "sauce", "paste", "powder", "juice",
    "seed", "seeds", "butter", "cream", "milk", "extract", "syrup",
    "dried", "pickled", "preserved", "flour", "starch", "vinegar",
    "skin", "peel", "zest",
  ]);

  // Check if ALL ingredient words appear in the product
  const allPresent = iWords.every((word) => {
    const regex = new RegExp(`\\b${escapeRegex(word)}`, "i");
    return regex.test(pCore);
  });

  if (!allPresent) return false;

  // Check that the product doesn't have extra words that change the identity
  const extraWords = pWords.filter(
    (w) => !iWords.some((iw) => w.startsWith(iw) || iw.startsWith(w))
  );

  for (const extra of extraWords) {
    if (identityChangingWords.has(extra)) return false;
  }

  return true;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function printOptimization(result: OptimizationResult): void {
  if (result.switches.length === 0) {
    console.log(`\n💰 Price Optimization: No cheaper alternatives found. Your cart is already well-priced!\n`);
    return;
  }

  console.log(`\n💰 Price Optimization:`);
  console.log(`  Current: ${result.original_total.toFixed(0)} kr → Optimized: ${result.optimized_total.toFixed(0)} kr (SAVE ${result.savings.toFixed(0)} kr / ${result.savings_percent.toFixed(0)}%)\n`);

  console.log(`  Switches:`);
  for (const s of result.switches) {
    console.log(`    ${s.ingredient}: ${s.original_source} ${s.original_price}kr → ${s.alternative_source} ${s.alternative_price}kr (save ${s.savings.toFixed(0)}kr)`);
    console.log(`      ${s.original_product} → ${s.alternative_product}`);
  }
  console.log();
}
