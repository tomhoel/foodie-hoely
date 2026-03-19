import { describe, it, expect } from "vitest";
import { scoreProduct, rankProducts, type CandidateProduct, type ScoringContext } from "../ingredients/product-scorer";

function makeProduct(overrides: Partial<CandidateProduct> = {}): CandidateProduct {
  return {
    id: "test-1",
    name: "Coconut Milk 400ml",
    source: "meny",
    price: 30,
    size: "400ml",
    unit: "ml",
    weight_kg: 0.4,
    category: "sauce",
    brand: null,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    ingredientName: "coconut milk",
    ingredientCategory: "sauce",
    neededAmount: "400",
    neededUnit: "ml",
    ...overrides,
  };
}

describe("scoreProduct", () => {
  it("scores exact name match highly", () => {
    const result = scoreProduct(
      makeProduct({ name: "coconut milk" }),
      makeCtx()
    );
    expect(result.scores.nameRelevance).toBe(1.0);
    expect(result.score).toBeGreaterThan(0.8);
  });

  it("scores near-zero for irrelevant products", () => {
    const result = scoreProduct(
      makeProduct({ name: "Chocolate Ice Cream 1L" }),
      makeCtx({ ingredientName: "garlic" })
    );
    expect(result.scores.nameRelevance).toBeLessThan(0.1);
    expect(result.score).toBeLessThan(0.05);
  });

  it("penalizes brand-name-only matches", () => {
    const result = scoreProduct(
      makeProduct({ name: "HAPPY BELLY gyoza skin 200g" }),
      makeCtx({ ingredientName: "pork belly" })
    );
    expect(result.scores.nameRelevance).toBeLessThan(0.2);
  });

  it("penalizes compound products", () => {
    const result = scoreProduct(
      makeProduct({ name: "Egg og Reker" }),
      makeCtx({ ingredientName: "egg" })
    );
    expect(result.scores.nameRelevance).toBeLessThan(0.5);
  });

  it("penalizes bulk products", () => {
    const normal = scoreProduct(
      makeProduct({ name: "coconut milk 400ml", price: 30 }),
      makeCtx()
    );
    const bulk = scoreProduct(
      makeProduct({ name: "coconut milk catering 5L", price: 500 }),
      makeCtx()
    );
    expect(bulk.score).toBeLessThan(normal.score);
  });
});

describe("rankProducts", () => {
  it("ranks better matches first", () => {
    const products = [
      makeProduct({ id: "bad", name: "Garlic Sauce 500ml", price: 45 }),
      makeProduct({ id: "good", name: "garlic", price: 25 }),
      makeProduct({ id: "ok", name: "Garlic Bread", price: 35 }),
    ];

    const ranked = rankProducts(products, makeCtx({ ingredientName: "garlic", ingredientCategory: "vegetable" }));
    expect(ranked[0].id).toBe("good");
  });

  it("returns empty for empty input", () => {
    expect(rankProducts([], makeCtx())).toEqual([]);
  });
});
