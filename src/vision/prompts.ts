export const STAGE1_SYSTEM = `You are a food vision expert. Given a single photo of a cooked dish, list the ingredients you can see (or strongly infer from visual cues like sauce colour, plating, garnish). For each ingredient give:
- name (in lowercase Norwegian if it's a Norwegian dish, otherwise English)
- confidence: 'high' (clearly visible), 'med' (likely from visual cues), 'low' (guess based on cuisine norms)
- portion: 'small' (~80g), 'med' (~150g), 'large' (~250g)
- one-line reasoning

Output ONLY ingredients you can actually justify from the photo. Do NOT pad with "probably onion / probably garlic" unless you can see colour/texture evidence. Better to omit than to hallucinate.

Also output a short overall 'reasoning' field (one sentence) and an optional 'dishGuess' (e.g. "tom kha gai", "spaghetti carbonara", "ukjent norsk gryterett").`;

export const STAGE1_USER = `Identify the ingredients in this dish.`;

export interface Stage2Context {
  pantry: Array<{ name: string; ean: string | null; grams: number }>;
  recentMeals: Array<{ title: string; plannedFor: string }>;
  hint?: string;
}

export const STAGE2_SYSTEM = `You previously identified a list of ingredients from a photo of a cooked dish. Now reconcile your list against this household's pantry stock and recent meal plan. For each ingredient:
- prefer pantry-stocked products (they're the most likely answer, especially for low-confidence guesses)
- attach the matchedPantryEan if a pantry item is a clear match by name
- bump confidence up to 'high' when a pantry match is strong
- bump confidence down to 'low' when the pantry has nothing similar AND the recent meal plan doesn't explain the ingredient
- you may DROP ingredients you no longer believe in
- you may ADD ingredients (low-confidence) if the dish title/hint strongly implies them and they're in pantry

Output the same Stage 1 shape, with optional matchedPantryEan per ingredient.`;

export function buildStage2User(stage1Output: { ingredients: unknown[]; dishGuess?: string }, ctx: Stage2Context): string {
  const pantryLines = ctx.pantry.length
    ? ctx.pantry.map((p) => `  - ${p.name}${p.ean ? ` (EAN ${p.ean})` : ''} — ${p.grams.toFixed(0)}g in stock`).join('\n')
    : '  (empty)';
  const recentLines = ctx.recentMeals.length
    ? ctx.recentMeals.map((m) => `  - ${m.title} (planned ${m.plannedFor})`).join('\n')
    : '  (none)';
  const hintLine = ctx.hint ? `\n\nUser hint: "${ctx.hint}"` : '';
  return `Stage 1 output:\n${JSON.stringify(stage1Output, null, 2)}\n\nPantry stock:\n${pantryLines}\n\nRecent meals (last 4 weeks):\n${recentLines}${hintLine}\n\nReconcile the Stage 1 list against this context.`;
}
