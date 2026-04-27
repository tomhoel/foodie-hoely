/**
 * Norwegian ingredient parser.
 *
 * Takes raw ingredient text (e.g., "2 ss soyasaus") and returns structured fields.
 * Regex-only — fuzzy quantities ("noen", "litt") are flagged as low confidence
 * for downstream LLM enrichment in Plan D.
 *
 * Returned `quantityGrams` is the canonical numeric quantity:
 *   - For weight units (g, kg, hg) → grams
 *   - For volume units (ml, ss, ts, dl, l, kopp) → milliliters (1:1 with grams for cooking purposes)
 *   - For count units (stk, pakke) → undefined (count lives in `quantity`)
 *   - For pinch units (klype, neve) → small gram values (0.5, 30)
 */

import { findUnit } from './norwegian-units';

export type ParseConfidence = 'high' | 'low';

export interface ParsedIngredient {
  raw: string;
  quantity?: number;
  unitOriginal?: string;
  quantityGrams?: number;
  name: string;
  confidence: ParseConfidence;
}

const FUZZY_QUANTITY_PATTERNS: readonly RegExp[] = [
  /^\s*noen\b/i,
  /^\s*litt\b/i,
  /^\s*etter\s+smak\b/i,
  /^\s*en\s+klype\b/i, // "en klype" without a number — handled as low confidence text
];

export function parseIngredient(rawInput: string): ParsedIngredient {
  const raw = rawInput.trim();

  if (raw.length === 0) {
    return { raw, name: '', confidence: 'low' };
  }

  // Detect fuzzy quantity prefixes (noen, litt, etter smak).
  for (const fuzzy of FUZZY_QUANTITY_PATTERNS) {
    if (fuzzy.test(raw)) {
      const name = stripParenthetical(
        raw.replace(fuzzy, '').replace(/^[^a-zåæøA-ZÅÆØ]+/, '').trim()
      );
      return { raw, name, confidence: 'low' };
    }
  }

  // Match: optional quantity (with fractions, ranges, comma-decimals) + optional unit + name.
  // Quantity patterns: "2", "1/2", "1,5", "1.5", "2-3"
  const quantityRegex = /^\s*(\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?(?:\s*\/\s*\d+)?)\s*/;
  const match = raw.match(quantityRegex);

  if (!match) {
    // No quantity at all — treat as low confidence.
    return { raw, name: stripParenthetical(raw), confidence: 'low' };
  }

  const quantity = parseQuantity(match[1]);
  if (quantity === undefined) {
    return { raw, name: stripParenthetical(raw), confidence: 'low' };
  }

  const afterQuantity = raw.slice(match[0].length).trim();
  if (afterQuantity.length === 0) {
    return { raw, quantity, name: '', confidence: 'low' };
  }

  // First token after quantity might be a unit.
  const tokens = afterQuantity.split(/\s+/);
  const firstToken = tokens[0];
  const unit = findUnit(firstToken);

  if (unit) {
    const name = stripParenthetical(tokens.slice(1).join(' ')).trim();
    if (name.length === 0) {
      return { raw, quantity, unitOriginal: firstToken, name: '', confidence: 'low' };
    }
    const quantityGrams = unit.category === 'count' ? undefined : quantity * unit.baseValue;
    return {
      raw,
      quantity,
      unitOriginal: firstToken,
      quantityGrams,
      name,
      confidence: 'high',
    };
  }

  // No unit — treat the rest as the name (e.g., "3 hvitløksfedd").
  const name = stripParenthetical(afterQuantity);
  return {
    raw,
    quantity,
    unitOriginal: undefined,
    quantityGrams: undefined,
    name,
    confidence: 'high',
  };
}

function parseQuantity(token: string): number | undefined {
  const cleaned = token.trim();
  // Range "2-3" → upper bound
  const rangeMatch = cleaned.match(/^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)$/);
  if (rangeMatch) {
    return parseFloat(rangeMatch[2].replace(',', '.'));
  }
  // Fraction "1/2"
  const fractionMatch = cleaned.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fractionMatch) {
    const num = parseInt(fractionMatch[1], 10);
    const den = parseInt(fractionMatch[2], 10);
    if (den === 0) return undefined;
    return num / den;
  }
  // Plain number with optional decimal (comma or dot)
  const plain = parseFloat(cleaned.replace(',', '.'));
  return Number.isFinite(plain) ? plain : undefined;
}

function stripParenthetical(text: string): string {
  return text.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}
