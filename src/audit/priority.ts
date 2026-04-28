export interface PantryAuditCandidate {
  pantryItemId: string;
  name: string;
  ean: string | null;
  currentGrams: number;
  currentConfidence: number;
  /** Count of cooked meals in the last 4 weeks whose ingredient text overlaps this name. */
  recipeDependency: number;
}

export interface AuditItem extends PantryAuditCandidate {
  auditPriority: number;
}

/**
 * Phase 1 audit priority. Importance is held constant (1.0) until canonical-
 * ingredient linking lands in Plan D. The formula:
 *
 *   priority = uncertainty * recipeDependency + uncertainty * 0.1
 *
 * The `+ uncertainty * 0.1` floor keeps zero-usage items measurable so a
 * household with an empty cookbook still gets useful audit candidates.
 * recipeDependency is used directly (not log-scaled) so that a higher meal
 * count always dominates a lower one when uncertainty is similar.
 */
export function computeAuditPriority(args: { confidence: number; recipeDependency: number }): number {
  const uncertainty = Math.max(0, 1 - args.confidence);
  if (uncertainty === 0) return 0;
  const dep = Math.max(0, args.recipeDependency);
  return uncertainty * dep + uncertainty * 0.1;
}

export function selectTopAuditItems(
  candidates: PantryAuditCandidate[],
  n: number
): AuditItem[] {
  const scored = candidates.map((c) => ({
    ...c,
    auditPriority: computeAuditPriority({ confidence: c.currentConfidence, recipeDependency: c.recipeDependency }),
  }));
  scored.sort((a, b) => b.auditPriority - a.auditPriority);
  return scored.slice(0, Math.max(0, n));
}
