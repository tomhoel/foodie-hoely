export interface PlanMatchCandidate {
  mealPlanItemId: string;
  recipeId: string;
  plannedFor: string; // YYYY-MM-DD
  title: string;
  ingredientTexts: string[];
}

export interface MatchArgs {
  transactionDate: string; // YYYY-MM-DD or ISO timestamp; only the date part matters
  lineNames: string[];
  candidates: PlanMatchCandidate[];
  windowDays?: number;  // default 2
  minOverlap?: number;  // default 0.3 (Jaccard)
}

export interface MatchResult {
  mealPlanItemId: string;
  recipeId: string;
  score: number;
  matchedTokens: string[];
}

const DEFAULT_WINDOW_DAYS = 2;
const DEFAULT_MIN_OVERLAP = 0.3;

// Only pure units-of-measure are stopped. Descriptor words like 'fersk'
// (fresh), 'løsvekt'/'losvekt' (loose-weight) are kept: they appear in both
// ingredient texts and receipt line names and contribute positive Jaccard
// signal rather than noise.
const STOPWORDS = new Set([
  'g', 'kg', 'ml', 'dl', 'l', 'ss', 'ts', 'stk', 'kopp',
]);

export function tokenize(s: string): string[] {
  const lowered = s
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/å/g, 'a');
  return lowered
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * Filters tokenize() output to tokens suitable for Jaccard matching:
 * removes purely-numeric tokens (e.g. '200', '500') and tokens that start
 * with a digit (e.g. quantity fragments like '400ml', '500g') which bloat
 * the union without providing semantic ingredient signal.
 * tokenize() is kept pure so callers that only need splitting (e.g. tests)
 * still get the raw alphanumeric tokens including quantity strings.
 */
function matchTokens(texts: string[]): Set<string> {
  return new Set(
    texts.flatMap(tokenize).filter((t) => !/^\d/.test(t)),
  );
}

function dateOnly(s: string): string {
  return s.slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  const da = new Date(`${dateOnly(a)}T00:00:00Z`).getTime();
  const db = new Date(`${dateOnly(b)}T00:00:00Z`).getTime();
  return Math.abs(Math.round((da - db) / 86_400_000));
}

function jaccard(a: Set<string>, b: Set<string>): { score: number; intersection: string[] } {
  const inter = new Set<string>();
  for (const t of a) if (b.has(t)) inter.add(t);
  const union = new Set<string>([...a, ...b]);
  if (union.size === 0) return { score: 0, intersection: [] };
  return { score: inter.size / union.size, intersection: Array.from(inter) };
}

export function matchTransactionToPlannedMeal(args: MatchArgs): MatchResult | null {
  const windowDays = args.windowDays ?? DEFAULT_WINDOW_DAYS;
  const minOverlap = args.minOverlap ?? DEFAULT_MIN_OVERLAP;

  const lineTokens = matchTokens(args.lineNames);
  if (lineTokens.size === 0) return null;

  let best: MatchResult | null = null;
  for (const c of args.candidates) {
    if (dayDiff(args.transactionDate, c.plannedFor) > windowDays) continue;
    const recipeTokens = matchTokens(c.ingredientTexts);
    const { score, intersection } = jaccard(lineTokens, recipeTokens);
    if (score >= minOverlap && (!best || score > best.score)) {
      best = {
        mealPlanItemId: c.mealPlanItemId,
        recipeId: c.recipeId,
        score,
        matchedTokens: intersection,
      };
    }
  }
  return best;
}
