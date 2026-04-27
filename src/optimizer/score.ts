/**
 * Scoring helper — Phase 1 just picks the cheapest candidate per ingredient.
 * Phase D will add Trumf bonus, offer overlay, store-stop penalty, waste risk.
 */

import type { ProductCandidate } from './ingredient-resolver';
import type { ChainCode } from '../ingestion/adapter.interface';

export const TRUMF_ELIGIBLE_CHAINS: readonly ChainCode[] = ['MENY', 'KIWI', 'SPAR', 'JOKER'];
export const TRUMF_RATE = 0.01;

export function isTrumfEligible(chain: ChainCode | null): boolean {
  return chain !== null && TRUMF_ELIGIBLE_CHAINS.includes(chain);
}

export function pickCheapest(
  candidates: ProductCandidate[],
  allowedChains: readonly ChainCode[]
): ProductCandidate | undefined {
  const eligible = candidates.filter(
    (c) => c.chainCode !== null && allowedChains.includes(c.chainCode) && typeof c.price === 'number'
  );
  if (eligible.length === 0) return undefined;
  return eligible.reduce((best, c) => ((c.price ?? Infinity) < (best.price ?? Infinity) ? c : best));
}
