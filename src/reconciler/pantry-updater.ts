export interface LineForUpdate {
  ean: string | null;
  nameRaw: string;
  quantity: number | null;
  lineTotalNok: number;
}

export interface ProductLookupEntry {
  id: string;
  name: string;
  /** Per-unit weight in kg if known. Used to convert `antall × weight` into grams. */
  weightKg: number | null;
}

export type ProductLookup = Map<string, ProductLookupEntry>;

export interface PantryUpsert {
  householdId: string;
  ean: string | null;
  productName: string;
  productId: string | null;
  quantityGrams: number;
  confidence: number;
  lastSeenSource: 'receipt';
}

const DEFAULT_PIECE_GRAMS = 80; // rough fallback for piece-counted produce

export interface ComputeArgs {
  householdId: string;
  lines: LineForUpdate[];
  productsByEan: ProductLookup;
}

export function computePantryUpserts(args: ComputeArgs): PantryUpsert[] {
  const out: PantryUpsert[] = [];
  for (const line of args.lines) {
    const eanMatch = line.ean ? args.productsByEan.get(line.ean) : undefined;
    const qty = line.quantity ?? 1;
    let grams: number;
    if (eanMatch && typeof eanMatch.weightKg === 'number' && eanMatch.weightKg > 0) {
      grams = qty * eanMatch.weightKg * 1000;
    } else {
      grams = qty * DEFAULT_PIECE_GRAMS;
    }
    out.push({
      householdId: args.householdId,
      ean: line.ean,
      productName: eanMatch?.name ?? line.nameRaw,
      productId: eanMatch?.id ?? null,
      quantityGrams: grams,
      confidence: eanMatch ? 0.95 : 0.7,
      lastSeenSource: 'receipt',
    });
  }
  return out;
}
