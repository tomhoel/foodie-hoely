import { describe, it, expect } from "vitest";

// We can't test the full adaptRecipe (needs AI), but we can test the
// hardcoded allergen detection by importing and testing the module's
// exported types + the SUPPORTED_* constants.
import { SUPPORTED_DIETS, SUPPORTED_ALLERGIES } from "../recipes/dietary-adapter";

describe("dietary-adapter constants", () => {
  it("has expected diets", () => {
    expect(SUPPORTED_DIETS).toContain("vegan");
    expect(SUPPORTED_DIETS).toContain("vegetarian");
    expect(SUPPORTED_DIETS).toContain("keto");
    expect(SUPPORTED_DIETS).toContain("halal");
  });

  it("has expected allergies", () => {
    expect(SUPPORTED_ALLERGIES).toContain("nuts");
    expect(SUPPORTED_ALLERGIES).toContain("shellfish");
    expect(SUPPORTED_ALLERGIES).toContain("gluten");
    expect(SUPPORTED_ALLERGIES).toContain("dairy");
    expect(SUPPORTED_ALLERGIES).toContain("soy");
    expect(SUPPORTED_ALLERGIES).toContain("eggs");
    expect(SUPPORTED_ALLERGIES).toContain("sesame");
  });
});
