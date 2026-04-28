import { generateObject, type LanguageModel } from 'ai';
import { Stage2Result, type Stage1Result, type Stage2Result as Stage2ResultType } from './schemas';
import { STAGE2_SYSTEM, buildStage2User, type Stage2Context } from './prompts';

export interface RunStage2Args extends Stage2Context {
  stage1: Stage1Result;
  model?: LanguageModel;
}

/**
 * Stage 2 — reconcile Stage 1's pure-visual ingredient list against the
 * household's pantry stock and recent meal plan. Text-only prompt; image not
 * sent. Returns Stage2Result (same shape as Stage 1 + matchedPantryEan).
 */
export async function runStage2(args: RunStage2Args): Promise<Stage2ResultType> {
  const userPrompt = buildStage2User(args.stage1, {
    pantry: args.pantry,
    recentMeals: args.recentMeals,
    hint: args.hint,
  });

  const { object } = await generateObject({
    // See stage1.ts for the cast rationale (Gateway resolves the string ID).
    model: args.model ?? ('google/gemini-3-flash' as unknown as LanguageModel),
    schema: Stage2Result,
    system: STAGE2_SYSTEM,
    prompt: userPrompt,
  });
  return object;
}
