/**
 * Norwegian cooking unit conversions.
 * Used by the ingredient parser to normalize quantities to grams or milliliters.
 *
 * Sources: standard Norwegian cooking measurements.
 *   ss = spiseskje (tablespoon)
 *   ts = teskje (teaspoon)
 *   dl = desiliter
 *   stk = stykk (piece)
 *   klype = pinch
 *   neve = handful
 *   kopp = cup (Norwegian standard 2.4 dl)
 */

export type UnitCategory = 'volume_ml' | 'weight_g' | 'count' | 'pinch';

export interface UnitDefinition {
  /** All synonyms for this unit, normalized to lowercase. */
  aliases: readonly string[];
  /** Base value in the canonical unit for the category (ml for volume, g for weight, 1 for count). */
  baseValue: number;
  category: UnitCategory;
}

export const NORWEGIAN_UNITS: readonly UnitDefinition[] = [
  // Volume (ml is canonical)
  { aliases: ['ss', 'ss.', 'spiseskje', 'spiseskjeer', 'tbsp'], baseValue: 15, category: 'volume_ml' },
  { aliases: ['ts', 'ts.', 'teskje', 'teskjeer', 'tsp'], baseValue: 5, category: 'volume_ml' },
  { aliases: ['dl', 'desiliter', 'desiliterene'], baseValue: 100, category: 'volume_ml' },
  { aliases: ['l', 'liter'], baseValue: 1000, category: 'volume_ml' },
  { aliases: ['ml', 'milliliter'], baseValue: 1, category: 'volume_ml' },
  { aliases: ['kopp', 'kopper'], baseValue: 240, category: 'volume_ml' },
  // Weight (g is canonical)
  { aliases: ['g', 'gram', 'gr'], baseValue: 1, category: 'weight_g' },
  { aliases: ['kg', 'kilo', 'kilogram'], baseValue: 1000, category: 'weight_g' },
  { aliases: ['hg', 'hekto', 'hektogram'], baseValue: 100, category: 'weight_g' },
  // Count
  { aliases: ['stk', 'stk.', 'stykk', 'stykker'], baseValue: 1, category: 'count' },
  { aliases: ['pakke', 'pakker', 'pk', 'pk.'], baseValue: 1, category: 'count' },
  { aliases: ['bunt', 'bunter'], baseValue: 1, category: 'count' },
  { aliases: ['boks', 'boksen', 'bokser'], baseValue: 1, category: 'count' },
  // Pinch (approximate; 0.5 g for klype, 30 g for neve)
  { aliases: ['klype', 'klyper'], baseValue: 0.5, category: 'pinch' },
  { aliases: ['neve', 'never'], baseValue: 30, category: 'pinch' },
];

/** Look up a unit by any of its aliases (case-insensitive). Returns undefined if unknown. */
export function findUnit(token: string): UnitDefinition | undefined {
  const normalized = token.trim().toLowerCase();
  return NORWEGIAN_UNITS.find((u) => u.aliases.includes(normalized));
}
