import { generateText, type LanguageModel } from 'ai';
import { config } from '../config';
import type { PlanCost } from '../optimizer/types';
import type { RecipeWithIngredients } from '../db/repositories/recipes.repo';

const NARRATOR_SYSTEM = `You are the friendly household chef writing the weekly plan email for a Norwegian family.
Write 2–3 short paragraphs in plain Norwegian (or English if the input is English) explaining: which dishes are coming up, what they'll cost in total, the Trumf bonus they'll earn, and 1–2 specific reasons this week's selection makes sense (e.g. "X is on offer at Kiwi", "Y is a household favourite", "we have Z in the pantry already"). Use the actual numbers from the data. Do not invent any savings or offers. Tone: warm, informed, never salesy. No emojis.`;

export interface NarratorInput {
  recipes: RecipeWithIngredients[];
  cost: PlanCost;
  plannerReasoning: string;
}

export async function narratePlan(
  input: NarratorInput,
  opts: { model?: LanguageModel } = {}
): Promise<string> {
  const recipeList = input.recipes
    .map((r) => `- ${r.recipe.title} (${r.recipe.total_time_minutes ?? '?'} min, serves ${r.recipe.servings ?? 4})`)
    .join('\n');
  const breakdown = input.cost.storeBreakdown
    .map((b) => `  • ${b.dealer}: ${b.subtotal.toFixed(0)} NOK (Trumf ${b.trumfEarned.toFixed(0)})`)
    .join('\n');

  const prompt = [
    `Recipes for the week:\n${recipeList}`,
    `Total: ${input.cost.totalNok.toFixed(0)} NOK`,
    `Estimated Trumf bonus: ${input.cost.trumfEstimateNok.toFixed(0)} NOK`,
    `Pantry savings: ${input.cost.pantrySavingsNok.toFixed(0)} NOK`,
    `Stops: ${input.cost.storeStops}`,
    breakdown ? `Per store:\n${breakdown}` : '',
    `Planner notes: ${input.plannerReasoning}`,
  ].filter(Boolean).join('\n\n');

  const { text } = await generateText({
    model: opts.model ?? (config.aiGateway.narratorModel as LanguageModel),
    system: NARRATOR_SYSTEM,
    prompt,
  });
  return text.trim();
}
