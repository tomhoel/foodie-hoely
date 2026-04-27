/**
 * Ingredient → product resolver.
 *
 * Given a Norwegian ingredient name (e.g., "kokosmelk"), finds candidate products
 * in our DB that could fulfill it. Returns one ProductCandidate per chain.
 *
 * Phase 1 implementation: simple ILIKE name search + chain filter. The resolver
 * does NOT rank or score; that's the optimizer's job (Task 8).
 *
 * Phase D will add canonical_ingredient_id linking via ingredient_mappings,
 * synonym expansion (Norwegian + English + Thai), and embedding-based fallback.
 */

import { getSupabase } from '../db/client';
import type { ChainCode } from '../ingestion/adapter.interface';

export interface ProductCandidate {
  productId: string;
  source: string;
  chainCode: ChainCode | null;
  externalId: string;
  name: string;
  brand: string | null;
  ean: string | null;
  price: number | null;
  isOffer: boolean;
  imageUrl: string | null;
  productUrl: string | null;
  weightKg: number | null;
}

export interface ResolveOptions {
  /** Limit to these chains (e.g. user's allowed scope). Default = no filter. */
  chains?: ChainCode[];
  /** Cap candidates returned per ingredient. Default 20. */
  limit?: number;
  /** Only return in-stock products. Default true. */
  inStockOnly?: boolean;
}

export async function resolveIngredient(
  ingredientName: string,
  opts: ResolveOptions = {}
): Promise<ProductCandidate[]> {
  const trimmed = ingredientName.trim();
  if (trimmed.length === 0) return [];

  const supabase = getSupabase();
  let query = supabase
    .from('products')
    .select('id, source, chain_code, external_id, name, brand, ean, price, is_offer, image_url, product_url, weight_kg, in_stock')
    .ilike('name', `%${trimmed}%`)
    .limit(opts.limit ?? 20);

  if (opts.chains && opts.chains.length > 0) {
    query = query.in('chain_code', opts.chains);
  }
  if (opts.inStockOnly !== false) {
    query = query.eq('in_stock', true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`resolveIngredient(${ingredientName}): ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    productId: row.id as string,
    source: row.source as string,
    chainCode: (row.chain_code as ChainCode | null) ?? null,
    externalId: row.external_id as string,
    name: row.name as string,
    brand: (row.brand as string | null) ?? null,
    ean: (row.ean as string | null) ?? null,
    price: typeof row.price === 'number' ? row.price : null,
    isOffer: row.is_offer === true,
    imageUrl: (row.image_url as string | null) ?? null,
    productUrl: (row.product_url as string | null) ?? null,
    weightKg: typeof row.weight_kg === 'number' ? row.weight_kg : null,
  }));
}

/**
 * Batch resolver — resolves N ingredient names concurrently.
 * Returns a Map keyed by ingredient name.
 */
export async function resolveIngredients(
  names: string[],
  opts: ResolveOptions = {}
): Promise<Map<string, ProductCandidate[]>> {
  const results = await Promise.all(
    names.map(async (name) => [name, await resolveIngredient(name, opts)] as const)
  );
  return new Map(results);
}
