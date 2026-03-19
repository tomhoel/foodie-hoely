/**
 * Builds AI prompt sections from a TasteProfile.
 * Maps numeric values (1-10) to concrete cooking instructions.
 */

import type { TasteProfile } from "./taste-profile";

const SPICE_MAP: Record<string, string> = {
  low:    "Use very little to no chili. Omit bird's eye chili. Use mild paprika instead of hot peppers.",
  medium: "Use a moderate amount of chili. Include standard amounts of chili flakes or fresh chili.",
  high:   "Use generous amounts of fresh chili. Include extra dried chili, bird's eye chili, and chili flakes. Double the standard chili amounts.",
};

const SWEET_MAP: Record<string, string> = {
  low:    "Minimize sugar and sweet ingredients. Reduce palm sugar, honey, or sweet sauces by half or more.",
  medium: "Use standard amounts of sugar and sweet ingredients.",
  high:   "Add extra sweetness. Increase palm sugar or honey. Consider adding sweet chili sauce or extra coconut cream.",
};

const SOUR_MAP: Record<string, string> = {
  low:    "Reduce lime juice, vinegar, and tamarind. Use minimal sour elements.",
  medium: "Use standard amounts of lime, vinegar, and tamarind.",
  high:   "Add extra lime juice, tamarind, or rice vinegar. Include pickled elements. Emphasize sour balance.",
};

const UMAMI_MAP: Record<string, string> = {
  low:    "Use minimal fish sauce and soy sauce. Skip MSG.",
  medium: "Use standard amounts of fish sauce, soy sauce, and oyster sauce.",
  high:   "Add extra fish sauce, soy sauce, and oyster sauce. Consider adding MSG (1/2 tsp), dried mushrooms, or miso for umami depth.",
};

const SALT_MAP: Record<string, string> = {
  low:    "Reduce salt, soy sauce, and fish sauce. Use low-sodium alternatives where possible.",
  medium: "Use standard seasoning levels.",
  high:   "Season generously with salt. Increase soy sauce and fish sauce slightly. Add finishing salt.",
};

function getLevel(value: number): "low" | "medium" | "high" {
  if (value <= 3) return "low";
  if (value <= 7) return "medium";
  return "high";
}

export function buildTastePromptSection(profile: TasteProfile): string {
  const spice = SPICE_MAP[getLevel(profile.spice)];
  const sweet = SWEET_MAP[getLevel(profile.sweetness)];
  const sour = SOUR_MAP[getLevel(profile.sourness)];
  const umami = UMAMI_MAP[getLevel(profile.umami)];
  const salt = SALT_MAP[getLevel(profile.saltiness)];

  return `
Adjust the recipe to match this taste profile:
- Spice level ${profile.spice}/10: ${spice}
- Sweetness ${profile.sweetness}/10: ${sweet}
- Sourness ${profile.sourness}/10: ${sour}
- Umami ${profile.umami}/10: ${umami}
- Saltiness ${profile.saltiness}/10: ${salt}

Adapt ingredient quantities and choices to match these preferences while keeping the dish authentic.
`;
}
