import { describe, it, expect } from "vitest";
import { buildTastePromptSection } from "../profile/taste-prompt";
import type { TasteProfile } from "../profile/taste-profile";

describe("buildTastePromptSection", () => {
  it("generates low instructions for values 1-3", () => {
    const profile: TasteProfile = { spice: 1, sweetness: 2, sourness: 3, umami: 1, saltiness: 2 };
    const result = buildTastePromptSection(profile);
    expect(result).toContain("very little to no chili");
    expect(result).toContain("Minimize sugar");
    expect(result).toContain("Reduce lime juice");
    expect(result).toContain("minimal fish sauce");
    expect(result).toContain("Reduce salt");
  });

  it("generates medium instructions for values 4-7", () => {
    const profile: TasteProfile = { spice: 5, sweetness: 5, sourness: 5, umami: 5, saltiness: 5 };
    const result = buildTastePromptSection(profile);
    expect(result).toContain("moderate amount of chili");
    expect(result).toContain("standard amounts of sugar");
  });

  it("generates high instructions for values 8-10", () => {
    const profile: TasteProfile = { spice: 9, sweetness: 8, sourness: 10, umami: 9, saltiness: 8 };
    const result = buildTastePromptSection(profile);
    expect(result).toContain("generous amounts of fresh chili");
    expect(result).toContain("extra lime juice");
    expect(result).toContain("extra fish sauce");
    expect(result).toContain("Season generously");
  });

  it("includes numeric values in output", () => {
    const profile: TasteProfile = { spice: 7, sweetness: 3, sourness: 8, umami: 5, saltiness: 6 };
    const result = buildTastePromptSection(profile);
    expect(result).toContain("Spice level 7/10");
    expect(result).toContain("Sweetness 3/10");
    expect(result).toContain("Sourness 8/10");
  });
});
