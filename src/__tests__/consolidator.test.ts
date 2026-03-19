import { describe, it, expect } from "vitest";
import { consolidateCarts, type ConsolidatedCart } from "../planning/consolidator";
import type { ShoppingCart, ShoppingCartItem, RecipeIngredient } from "../recipes/generator";
import type { MatchResult, ProductMatch } from "../db/types";

function makeCartItem(name: string, productId: string, price: number, source: "afood" | "meny", category: RecipeIngredient["category"] = "protein"): ShoppingCartItem {
  const ingredient: RecipeIngredient = {
    name,
    amount: "200",
    unit: "g",
    is_essential: true,
    category,
  };

  const product: ProductMatch = {
    product_id: productId,
    name: `Product: ${name}`,
    brand: null,
    price,
    source,
    image_url: null,
    product_url: null,
    ai_description: null,
    similarity: 0.9,
  };

  const match: MatchResult = {
    ingredient: name,
    tier: 1,
    tier_label: "direct_mapping",
    product,
    substitute: null,
    confidence: 0.9,
    notes: null,
  };

  return {
    ingredient,
    match,
    product_name: product.name,
    product_price: price,
    product_url: null,
    source,
  };
}

function makeCart(items: ShoppingCartItem[]): ShoppingCart {
  return {
    recipe: {
      name: "Test Recipe",
      description: "",
      servings: 4,
      prep_time: "10 min",
      cook_time: "20 min",
      difficulty: "easy",
      cuisine: "thai",
      ingredients: items.map((i) => i.ingredient),
      steps: [],
      tips: [],
    },
    items,
    unmatched: [],
    summary: {
      total_price: items.reduce((s, i) => s + (i.product_price || 0), 0),
      item_count: items.length,
      afood_items: items.filter((i) => i.source === "afood").length,
      meny_items: items.filter((i) => i.source === "meny").length,
      substitutions: 0,
      unmatched_count: 0,
      validation_skipped: false,
    },
  };
}

describe("consolidateCarts", () => {
  it("deduplicates same product across meals", () => {
    const cart1 = makeCart([
      makeCartItem("garlic", "p1", 25, "meny", "spice"),
      makeCartItem("chicken", "p2", 99, "meny"),
    ]);
    const cart2 = makeCart([
      makeCartItem("garlic", "p1", 25, "meny", "spice"),
      makeCartItem("rice", "p3", 30, "meny", "carb"),
    ]);

    const result = consolidateCarts([
      { mealName: "Meal 1", cart: cart1 },
      { mealName: "Meal 2", cart: cart2 },
    ]);

    // Garlic (spice) should appear once with quantity 1 (reusable)
    const garlic = result.items.find((i) => i.product_id === "p1");
    expect(garlic?.quantity).toBe(1);
    expect(garlic?.used_in_meals).toEqual(["Meal 1", "Meal 2"]);

    expect(result.items).toHaveLength(3); // garlic, chicken, rice
  });

  it("increases quantity for non-reusable items", () => {
    const cart1 = makeCart([makeCartItem("chicken", "p2", 99, "meny", "protein")]);
    const cart2 = makeCart([makeCartItem("chicken", "p2", 99, "meny", "protein")]);

    const result = consolidateCarts([
      { mealName: "Meal 1", cart: cart1 },
      { mealName: "Meal 2", cart: cart2 },
    ]);

    const chicken = result.items.find((i) => i.product_id === "p2");
    expect(chicken?.quantity).toBe(2);
  });

  it("does not increase quantity for sauces/spices (reusable)", () => {
    const cart1 = makeCart([makeCartItem("fish sauce", "p4", 38, "meny", "sauce")]);
    const cart2 = makeCart([makeCartItem("fish sauce", "p4", 38, "meny", "sauce")]);

    const result = consolidateCarts([
      { mealName: "Meal 1", cart: cart1 },
      { mealName: "Meal 2", cart: cart2 },
    ]);

    const fishSauce = result.items.find((i) => i.product_id === "p4");
    expect(fishSauce?.quantity).toBe(1);
  });

  it("calculates reuse savings", () => {
    const cart1 = makeCart([
      makeCartItem("soy sauce", "p5", 25, "meny", "sauce"),
      makeCartItem("chicken", "p2", 99, "meny"),
    ]);
    const cart2 = makeCart([
      makeCartItem("soy sauce", "p5", 25, "meny", "sauce"),
      makeCartItem("rice", "p3", 30, "meny", "carb"),
    ]);

    const result = consolidateCarts([
      { mealName: "Meal 1", cart: cart1 },
      { mealName: "Meal 2", cart: cart2 },
    ]);

    // individual_total = 25 + 99 + 25 + 30 = 179
    // total_price = 25*1 + 99*1 + 30*1 = 154 (soy sauce counted once)
    expect(result.individual_total).toBe(179);
    expect(result.total_price).toBe(154);
    expect(result.reuse_savings).toBe(25);
  });

  it("handles empty carts", () => {
    const result = consolidateCarts([]);
    expect(result.items).toHaveLength(0);
    expect(result.total_price).toBe(0);
  });

  it("counts sources correctly", () => {
    const cart = makeCart([
      makeCartItem("item1", "p1", 10, "afood"),
      makeCartItem("item2", "p2", 20, "meny"),
      makeCartItem("item3", "p3", 30, "afood"),
    ]);

    const result = consolidateCarts([{ mealName: "Test", cart }]);
    expect(result.afood_count).toBe(2);
    expect(result.meny_count).toBe(1);
  });
});
