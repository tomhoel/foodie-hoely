/**
 * Tests for the isNameRelevant function used by the price optimizer.
 * We test the logic indirectly since it's not exported, by testing
 * the patterns it should accept/reject.
 */
import { describe, it, expect } from "vitest";

// Re-implement the logic here for unit testing since it's not exported
function isNameRelevant(ingredientName: string, productName: string): boolean {
  const iWords = ingredientName.toLowerCase().split(/\s+/);
  const pName = productName.toLowerCase();
  const pCore = pName.replace(/\b\d+\s*(g|kg|ml|l|cl|stk|pk|pcs)\b/gi, "")
    .replace(/\b[A-Z]{2}\b/g, "").trim();
  const pWords = pCore.split(/[\s\-/]+/).filter((w) => w.length > 1);

  const identityChangingWords = new Set([
    "leaf", "leaves", "oil", "sauce", "paste", "powder", "juice",
    "seed", "seeds", "butter", "cream", "milk", "extract", "syrup",
    "dried", "pickled", "preserved", "flour", "starch", "vinegar",
    "skin", "peel", "zest",
  ]);

  const allPresent = iWords.every((word) => {
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
    return regex.test(pCore);
  });

  if (!allPresent) return false;

  const extraWords = pWords.filter(
    (w) => !iWords.some((iw) => w.startsWith(iw) || iw.startsWith(w))
  );

  for (const extra of extraWords) {
    if (identityChangingWords.has(extra)) return false;
  }

  return true;
}

describe("isNameRelevant (price optimizer)", () => {
  it("accepts exact matches", () => {
    expect(isNameRelevant("lime", "Lime")).toBe(true);
    expect(isNameRelevant("oyster sauce", "Oyster Sauce")).toBe(true);
    expect(isNameRelevant("coconut milk", "Coconut Milk")).toBe(true);
  });

  it("accepts matches with size suffixes", () => {
    expect(isNameRelevant("lime", "Lime 4pk")).toBe(true);
    expect(isNameRelevant("oyster sauce", "Oyster Sauce 255g")).toBe(true);
  });

  it("rejects lime → lime leaf", () => {
    expect(isNameRelevant("lime", "Lime leaf 50g")).toBe(false);
  });

  it("rejects lime → lime juice", () => {
    expect(isNameRelevant("lime", "Lime Juice 500ml")).toBe(false);
  });

  it("rejects garlic → garlic sauce", () => {
    expect(isNameRelevant("garlic", "Garlic Sauce 200ml")).toBe(false);
  });

  it("rejects galangal → lemongrass", () => {
    expect(isNameRelevant("galangal", "Lemongrass 100g")).toBe(false);
  });

  it("accepts multi-word ingredients", () => {
    expect(isNameRelevant("fish sauce", "Fish Sauce 200ml")).toBe(true);
    expect(isNameRelevant("coconut milk", "Coconut Milk 400ml TH")).toBe(true);
  });

  it("accepts product with brand prefix", () => {
    expect(isNameRelevant("oyster sauce", "LKK Panda Oyster sauce 255g")).toBe(true);
  });

  it("rejects sesame → sesame oil", () => {
    expect(isNameRelevant("sesame", "Sesame Oil 200ml")).toBe(false);
  });
});
