import { describe, it, expect } from "vitest";
import {
  parseSize,
  parseSizeFromName,
  isBulkProduct,
  scoreSizePreference,
  scoreQuantityFit,
} from "../ingredients/size-parser";

describe("parseSize", () => {
  it("parses basic ml", () => {
    const r = parseSize("400ml");
    expect(r).toEqual({ value: 400, unit: "ml", original: "400ml" });
  });

  it("parses liters and converts to ml", () => {
    const r = parseSize("1.5L");
    expect(r?.value).toBe(1500);
    expect(r?.unit).toBe("ml");
  });

  it("parses cl → ml", () => {
    const r = parseSize("33cl");
    expect(r?.value).toBe(330);
    expect(r?.unit).toBe("ml");
  });

  it("parses dl → ml", () => {
    const r = parseSize("2dl");
    expect(r?.value).toBe(200);
    expect(r?.unit).toBe("ml");
  });

  it("parses grams", () => {
    const r = parseSize("500g");
    expect(r).toEqual({ value: 500, unit: "g", original: "500g" });
  });

  it("parses kg → g", () => {
    const r = parseSize("2.5kg");
    expect(r?.value).toBe(2500);
    expect(r?.unit).toBe("g");
  });

  it("parses stk", () => {
    const r = parseSize("6stk");
    expect(r?.value).toBe(6);
    expect(r?.unit).toBe("stk");
  });

  it("normalizes pcs → stk", () => {
    const r = parseSize("12pcs");
    expect(r?.unit).toBe("stk");
  });

  it("handles comma decimals", () => {
    const r = parseSize("2,9L");
    expect(r?.value).toBe(2900);
  });

  it("returns null for empty input", () => {
    expect(parseSize(null)).toBeNull();
    expect(parseSize("")).toBeNull();
  });

  it("returns null for unparseable strings", () => {
    expect(parseSize("hello")).toBeNull();
  });
});

describe("parseSizeFromName", () => {
  it("extracts size from product name", () => {
    const r = parseSizeFromName("LOTUS Coconut Milk 400ml TH");
    expect(r?.value).toBe(400);
    expect(r?.unit).toBe("ml");
  });

  it("handles multi-pack pattern", () => {
    const r = parseSizeFromName("24x70g Instant Noodles");
    expect(r?.value).toBe(1680);
    expect(r?.unit).toBe("g");
  });

  it("returns null when no size found", () => {
    expect(parseSizeFromName("Fresh Garlic")).toBeNull();
  });
});

describe("isBulkProduct", () => {
  it("detects bulk keywords", () => {
    expect(isBulkProduct("Chicken Breast Catering 5kg", null, null)).toBe(true);
    expect(isBulkProduct("Rice kartong 10kg", null, null)).toBe(true);
  });

  it("detects multi-packs of 6+", () => {
    expect(isBulkProduct("Noodles 12x400g", null, null)).toBe(true);
  });

  it("does not flag small multi-packs", () => {
    expect(isBulkProduct("Noodles 3x70g", null, null)).toBe(false);
  });

  it("detects large sizes", () => {
    expect(isBulkProduct("Soy Sauce", { value: 5000, unit: "ml", original: "5L" }, null)).toBe(true);
    expect(isBulkProduct("Rice", { value: 6000, unit: "g", original: "6kg" }, null)).toBe(true);
  });

  it("detects price outliers", () => {
    expect(isBulkProduct("Fish Sauce", null, 500)).toBe(true);
  });

  it("does not flag normal products", () => {
    expect(isBulkProduct("Fish Sauce 200ml", { value: 200, unit: "ml", original: "200ml" }, 35)).toBe(false);
  });
});

describe("scoreSizePreference", () => {
  it("returns 0.5 for null size", () => {
    expect(scoreSizePreference(null)).toBe(0.5);
  });

  it("scores ideal sauce size as 1.0", () => {
    expect(scoreSizePreference({ value: 200, unit: "ml", original: "200ml" }, "sauce")).toBe(1.0);
  });

  it("scores acceptable range as 0.7", () => {
    expect(scoreSizePreference({ value: 800, unit: "ml", original: "800ml" }, "sauce")).toBe(0.7);
  });

  it("penalizes too-small sizes", () => {
    expect(scoreSizePreference({ value: 10, unit: "ml", original: "10ml" }, "sauce")).toBe(0.4);
  });

  it("penalizes too-large sizes", () => {
    expect(scoreSizePreference({ value: 5000, unit: "ml", original: "5L" }, "sauce")).toBe(0.2);
  });
});

describe("scoreQuantityFit", () => {
  it("returns 0.5 for null inputs", () => {
    expect(scoreQuantityFit(null, null, null)).toBe(0.5);
    expect(scoreQuantityFit("400", "ml", null)).toBe(0.5);
  });

  it("scores perfect fit as 1.0", () => {
    const product = { value: 400, unit: "ml", original: "400ml" };
    expect(scoreQuantityFit("400", "ml", product)).toBe(1.0);
  });

  it("scores double-size as 0.8 (good fit)", () => {
    const product = { value: 800, unit: "ml", original: "800ml" };
    expect(scoreQuantityFit("400", "ml", product)).toBe(0.8);
  });

  it("handles unit conversion (tbsp → ml)", () => {
    const product = { value: 60, unit: "ml", original: "60ml" };
    // 4 tbsp = 60ml → perfect fit
    expect(scoreQuantityFit("4", "tbsp", product)).toBe(1.0);
  });

  it("returns 0.5 for incompatible units", () => {
    const product = { value: 400, unit: "ml", original: "400ml" };
    expect(scoreQuantityFit("2", "stk", product)).toBe(0.5);
  });
});
