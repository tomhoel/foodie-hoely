/**
 * Shopping Cart Consolidator — merges multiple shopping carts,
 * deduplicates by product, and calculates reuse savings.
 */

import type { ShoppingCart, ShoppingCartItem } from "../recipes/generator";

export interface ConsolidatedCart {
  items: ConsolidatedItem[];
  total_price: number;
  individual_total: number;
  reuse_savings: number;
  afood_count: number;
  meny_count: number;
}

export interface ConsolidatedItem {
  product_name: string;
  product_id: string;
  price: number | null;
  source: "afood" | "meny";
  used_in_meals: string[];
  quantity: number; // how many to buy (deduplicated)
}

export function consolidateCarts(
  carts: { mealName: string; cart: ShoppingCart }[]
): ConsolidatedCart {
  const productMap = new Map<string, ConsolidatedItem>();
  let individualTotal = 0;

  for (const { mealName, cart } of carts) {
    for (const item of cart.items) {
      if (!item.match.product) continue;

      const key = item.match.product.product_id;
      individualTotal += item.product_price || 0;

      const existing = productMap.get(key);
      if (existing) {
        existing.used_in_meals.push(mealName);
        // Don't increase quantity for reusable items (sauces, spices, staples)
        const isReusable = ["sauce", "spice", "other"].includes(item.ingredient.category);
        if (!isReusable) {
          existing.quantity++;
        }
      } else {
        productMap.set(key, {
          product_name: item.product_name,
          product_id: key,
          price: item.product_price,
          source: item.source,
          used_in_meals: [mealName],
          quantity: 1,
        });
      }
    }
  }

  const items = Array.from(productMap.values());
  const totalPrice = items.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);
  const reuseSavings = individualTotal - totalPrice;

  return {
    items,
    total_price: totalPrice,
    individual_total: individualTotal,
    reuse_savings: reuseSavings,
    afood_count: items.filter((i) => i.source === "afood").length,
    meny_count: items.filter((i) => i.source === "meny").length,
  };
}

export function printConsolidatedCart(consolidated: ConsolidatedCart): void {
  const afoodItems = consolidated.items.filter((i) => i.source === "afood");
  const menyItems = consolidated.items.filter((i) => i.source === "meny");

  console.log(`\n🛒 Consolidated Shopping List:\n`);

  if (afoodItems.length) {
    const afoodTotal = afoodItems.reduce((s, i) => s + (i.price || 0) * i.quantity, 0);
    console.log(`  📦 aFood Market: ${afoodItems.length} items (${afoodTotal.toFixed(0)} kr)`);
    for (const item of afoodItems) {
      const qty = item.quantity > 1 ? ` x${item.quantity}` : "";
      const meals = item.used_in_meals.length > 1 ? ` (${item.used_in_meals.length} meals)` : "";
      console.log(`    ${item.product_name}${qty} — ${item.price || "?"} kr${meals}`);
    }
    console.log();
  }

  if (menyItems.length) {
    const menyTotal = menyItems.reduce((s, i) => s + (i.price || 0) * i.quantity, 0);
    console.log(`  🏪 Meny: ${menyItems.length} items (${menyTotal.toFixed(0)} kr)`);
    for (const item of menyItems) {
      const qty = item.quantity > 1 ? ` x${item.quantity}` : "";
      const meals = item.used_in_meals.length > 1 ? ` (${item.used_in_meals.length} meals)` : "";
      console.log(`    ${item.product_name}${qty} — ${item.price || "?"} kr${meals}`);
    }
    console.log();
  }

  if (consolidated.reuse_savings > 0) {
    console.log(`  ♻️  Reuse savings: -${consolidated.reuse_savings.toFixed(0)} kr`);
  }
  console.log(`  💰 TOTAL: ${consolidated.total_price.toFixed(0)} kr`);
  console.log();
}
