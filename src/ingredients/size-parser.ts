/**
 * Size Parser — extracts and normalizes product sizes/quantities.
 * Detects bulk products vs household sizes.
 */

export interface ParsedSize {
  value: number;
  unit: string;        // normalized: "ml", "g", "stk", "pk"
  original: string;
}

// Parse "400ml", "1L", "2.9L", "500g", "1kg", "6stk" etc.
export function parseSize(sizeStr: string | null): ParsedSize | null {
  if (!sizeStr) return null;
  const match = sizeStr.match(/(\d+(?:[.,]\d+)?)\s*(ml|l|cl|dl|g|kg|stk|pk|pcs|pieces?)\b/i);
  if (!match) return null;

  const value = parseFloat(match[1].replace(",", "."));
  const rawUnit = match[2].toLowerCase();

  // Normalize units
  let normalizedValue = value;
  let normalizedUnit = rawUnit;

  switch (rawUnit) {
    case "l":
      normalizedValue = value * 1000;
      normalizedUnit = "ml";
      break;
    case "cl":
      normalizedValue = value * 10;
      normalizedUnit = "ml";
      break;
    case "dl":
      normalizedValue = value * 100;
      normalizedUnit = "ml";
      break;
    case "kg":
      normalizedValue = value * 1000;
      normalizedUnit = "g";
      break;
    case "pcs":
    case "piece":
    case "pieces":
      normalizedUnit = "stk";
      break;
  }

  return { value: normalizedValue, unit: normalizedUnit, original: sizeStr };
}

// Parse size from a product name string
export function parseSizeFromName(name: string): ParsedSize | null {
  // Match patterns like "500ml", "1L", "400G", "20kg", "24x70g"
  // Prefer the main size, not the sub-unit in multi-packs
  const multiMatch = name.match(/(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(ml|l|g|kg)\b/i);
  if (multiMatch) {
    const count = parseInt(multiMatch[1]);
    const perUnit = parseFloat(multiMatch[2].replace(",", "."));
    const unit = multiMatch[3].toLowerCase();
    const totalSize = `${count * perUnit}${unit}`;
    return parseSize(totalSize);
  }

  // Standard single size
  const match = name.match(/(\d+(?:[.,]\d+)?)\s*(ml|l|cl|dl|g|kg|stk|pk)\b/i);
  if (match) {
    return parseSize(`${match[1]}${match[2]}`);
  }

  return null;
}

// Detect bulk/commercial products
const BULK_KEYWORDS = [
  "krt", "carton", "kartong", "kasse", "case", "bulk",
  "storkjøkken", "storhusholdning", "professional", "catering",
];

export function isBulkProduct(name: string, size: ParsedSize | null, price: number | null): boolean {
  const lowerName = name.toLowerCase();

  // Keyword check
  if (BULK_KEYWORDS.some((kw) => lowerName.includes(kw))) return true;

  // Multi-pack pattern: "24x", "12x", "6x" (6+ units)
  const multiMatch = lowerName.match(/(\d+)\s*x\s*\d/);
  if (multiMatch && parseInt(multiMatch[1]) >= 6) return true;

  // Size thresholds
  if (size) {
    if (size.unit === "ml" && size.value > 3000) return true;   // > 3L
    if (size.unit === "g" && size.value > 5000) return true;    // > 5kg
  }

  // Price outlier (very rough heuristic)
  if (price && price > 400) return true;

  return false;
}

// Household size ranges per category
interface SizeRange {
  ideal: [number, number];      // ideal range in base units (ml or g)
  acceptable: [number, number]; // acceptable range
}

const SIZE_RANGES: Record<string, SizeRange> = {
  sauce: { ideal: [50, 500], acceptable: [30, 1000] },
  spice: { ideal: [20, 200], acceptable: [10, 500] },
  carb: { ideal: [200, 2000], acceptable: [100, 5000] },   // rice, noodles
  protein: { ideal: [200, 1000], acceptable: [100, 2000] },
  vegetable: { ideal: [50, 500], acceptable: [20, 1000] },
  dairy: { ideal: [200, 1000], acceptable: [100, 1500] },
  other: { ideal: [100, 1000], acceptable: [50, 2000] },
};

// Score how well a product's size fits household use
export function scoreSizePreference(
  size: ParsedSize | null,
  category: string = "other"
): number {
  if (!size) return 0.5; // neutral when unknown

  const range = SIZE_RANGES[category] || SIZE_RANGES.other;

  if (size.value >= range.ideal[0] && size.value <= range.ideal[1]) return 1.0;
  if (size.value >= range.acceptable[0] && size.value <= range.acceptable[1]) return 0.7;
  if (size.value < range.acceptable[0]) return 0.4; // too small
  return 0.2; // too large (bulk)
}

// Score how well a product size fits a recipe's needed amount
export function scoreQuantityFit(
  neededAmount: string | null,
  neededUnit: string | null,
  productSize: ParsedSize | null
): number {
  if (!neededAmount || !productSize) return 0.5; // neutral

  const needed = parseAmount(neededAmount, neededUnit);
  if (!needed) return 0.5;

  // Convert to same unit system
  const productInBase = productSize.value; // already normalized to ml or g
  const neededInBase = needed.value;

  // Check if units are compatible
  if (!unitsCompatible(needed.unit, productSize.unit)) return 0.5; // can't compare

  const ratio = productInBase / neededInBase;

  if (ratio >= 0.8 && ratio <= 1.5) return 1.0;   // perfect fit
  if (ratio >= 0.5 && ratio <= 2.0) return 0.8;   // good fit
  if (ratio >= 0.2 && ratio <= 3.0) return 0.6;   // acceptable
  if (ratio > 3.0 && ratio <= 5.0) return 0.4;    // wasteful
  return 0.3; // way too big or too small
}

function parseAmount(amount: string, unit: string | null): { value: number; unit: string } | null {
  const num = parseFloat(amount.replace(",", "."));
  if (isNaN(num)) return null;

  const u = (unit || "").toLowerCase();

  // Normalize common recipe units to ml/g
  switch (u) {
    case "ml": return { value: num, unit: "ml" };
    case "l": return { value: num * 1000, unit: "ml" };
    case "cl": return { value: num * 10, unit: "ml" };
    case "dl": return { value: num * 100, unit: "ml" };
    case "g": return { value: num, unit: "g" };
    case "kg": return { value: num * 1000, unit: "g" };
    case "tbsp": return { value: num * 15, unit: "ml" };
    case "tsp": return { value: num * 5, unit: "ml" };
    case "cup": return { value: num * 240, unit: "ml" };
    default: return { value: num, unit: u || "stk" };
  }
}

function unitsCompatible(unit1: string, unit2: string): boolean {
  const liquids = ["ml", "l", "cl", "dl"];
  const weights = ["g", "kg"];
  if (liquids.includes(unit1) && liquids.includes(unit2)) return true;
  if (weights.includes(unit1) && weights.includes(unit2)) return true;
  if (unit1 === unit2) return true;
  // ml and g are roughly compatible for cooking
  if ((unit1 === "ml" && unit2 === "g") || (unit1 === "g" && unit2 === "ml")) return true;
  return false;
}
