import { generateText, stepCountIs, type LanguageModel } from 'ai';
import { createPlannerTools, type PlannerContext, type FinalizeSlot } from './tools';
import { PLANNER_SYSTEM_PROMPT, buildUserPrompt } from './prompts';
import { config } from '../config';

export interface PlannerOutcome {
  recipeIds: string[];
  servings: number[];
  reasoning: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface RunPlannerOptions {
  /** Override model (used by tests). Defaults to AI Gateway Sonnet. */
  model?: LanguageModel;
  /** Step budget. Defaults to 8 (~1 list + 1 history + 3 cost_plan revisions + 1 finalize + slack). */
  maxSteps?: number;
}

export async function runPlannerLoop(
  ctx: PlannerContext,
  opts: RunPlannerOptions = {}
): Promise<PlannerOutcome> {
  const finalize: FinalizeSlot = { value: null };
  const tools = createPlannerTools(ctx, finalize);

  const result = await generateText({
    // In production, the AI SDK v6 gateway resolves the string model id when
    // AI_GATEWAY_API_KEY is set. Tests always pass a mock LanguageModelV3.
    model: opts.model ?? (config.aiGateway.plannerModel as LanguageModel),
    system: PLANNER_SYSTEM_PROMPT,
    prompt: buildUserPrompt({
      weekStart: ctx.weekStart,
      recipeCount: ctx.recipeCount,
      weeklyBudgetNok: ctx.weeklyBudgetNok,
    }),
    // Type-cast: createPlannerTools returns a precise zod-typed shape, but
    // generateText's TOOLS generic infers a wider shape during inference.
    // The runtime contract is correct; loosen the type to satisfy the SDK.
    tools: tools as Parameters<typeof generateText>[0]['tools'],
    stopWhen: stepCountIs(opts.maxSteps ?? 8),
  });

  if (!finalize.value) {
    throw new Error(
      `planner did not finalize within step budget. finishReason=${result.finishReason} steps=${result.steps?.length ?? 0}`
    );
  }

  if (finalize.value.recipeIds.length !== finalize.value.servings.length) {
    throw new Error('finalize_plan: recipeIds and servings length mismatch');
  }

  return {
    recipeIds: finalize.value.recipeIds,
    servings: finalize.value.servings,
    reasoning: finalize.value.reasoning,
    usage: {
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
    },
  };
}
