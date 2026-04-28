import { planWeek, type PlanWeekArgs } from '../planner';
import { renderWeeklyPlanEmail } from './templates';
import { sendEmail, buildResendSender } from './client';
import { config } from '../config';
import { getRecipe } from '../db/repositories/recipes.repo';
import { getPantrySummary } from '../db/repositories/pantry.repo';
import { resolveIngredients } from '../optimizer/ingredient-resolver';
import { computePlanCost } from '../optimizer/optimizer';
import type { ChainCode } from '../ingestion/adapter.interface';

export interface SendWeeklyPlanArgs extends PlanWeekArgs {
  to: string;
}

export interface SendWeeklyPlanResult {
  messageId: string;
  mealPlanId: string;
  recipeIds: string[];
  totalNok: number;
}

export async function sendWeeklyPlanEmail(args: SendWeeklyPlanArgs): Promise<SendWeeklyPlanResult> {
  if (!config.email.resendApiKey) {
    throw new Error('RESEND_API_KEY is not set. Add it to your .env.');
  }

  // 1. Generate + persist the plan (existing W4a entrypoint).
  const planResult = await planWeek({
    householdId: args.householdId,
    weekStart: args.weekStart,
    recipeCount: args.recipeCount,
    weeklyBudgetNok: args.weeklyBudgetNok,
    allowedChains: args.allowedChains,
  });

  // 2. Recompute the cost for *exactly* the chosen recipes so the email shows
  //    the same numbers the planner committed. (planWeek persists narration
  //    but discards the final PlanCost; cheaper to recompute than re-architect.)
  const recipes = await Promise.all(planResult.recipeIds.map((id) => getRecipe(id)));
  const eligibleRecipes = new Map(
    planResult.recipeIds
      .map((id, i) => [id, recipes[i]] as const)
      .filter((entry): entry is readonly [string, NonNullable<typeof entry[1]>] => entry[1] !== null)
  );

  const allowedChains: ChainCode[] = args.allowedChains ?? ['MENY', 'KIWI', 'AFOOD'];
  const allIngredientNames = new Set<string>();
  for (const r of eligibleRecipes.values()) {
    for (const ing of r.ingredients) {
      if (typeof ing.quantity_grams === 'number' && ing.quantity_grams > 0) {
        allIngredientNames.add(ing.raw_text.replace(/^\s*\d+(?:[.,/]\d+)?\s*\S*\s*/, '').trim().toLowerCase());
      }
    }
  }
  const productCandidates = await resolveIngredients(Array.from(allIngredientNames), { chains: allowedChains });
  const pantry = await getPantrySummary(args.householdId);

  const cost = computePlanCost({
    mealPlan: planResult.recipeIds.map((id, i) => ({ recipeId: id, servings: planResult.servings[i] })),
    recipes: eligibleRecipes,
    pantry: pantry.map((p) => ({ canonicalName: p.canonicalName, grams: p.grams, confidence: p.confidence })),
    productCandidatesPerIngredient: productCandidates,
    householdContext: {
      allowedChains,
      weeklyBudgetNok: args.weeklyBudgetNok ?? 1500,
      storeStopPenaltyNok: 10,
    },
  });

  // 3. Build the email input shape.
  const startDate = new Date(`${args.weekStart}T00:00:00Z`);
  const recipeEntries = planResult.recipeIds.map((id, i) => {
    const r = eligibleRecipes.get(id)!;
    const recipeCost = cost.perRecipe.find((p) => p.recipeId === id)?.costNok ?? 0;
    return {
      id,
      title: r.recipe.title,
      plannedFor: new Date(startDate.getTime() + i * 86_400_000).toISOString().slice(0, 10),
      servings: planResult.servings[i],
      costNok: recipeCost,
    };
  });

  const rendered = renderWeeklyPlanEmail({
    weekStart: args.weekStart,
    recipes: recipeEntries,
    totalNok: cost.totalNok,
    trumfEstimateNok: cost.trumfEstimateNok,
    pantrySavingsNok: cost.pantrySavingsNok,
    storeStops: cost.storeStops,
    storeBreakdown: cost.storeBreakdown.map((s) => ({
      dealer: String(s.dealer),
      subtotal: s.subtotal,
      trumfEarned: s.trumfEarned,
    })),
    narration: planResult.narration,
    warnings: planResult.warnings,
  });

  // 4. Send.
  const sender = await buildResendSender(config.email.resendApiKey);
  const sent = await sendEmail({
    sender,
    from: config.email.from,
    to: args.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  return {
    messageId: sent.messageId,
    mealPlanId: planResult.mealPlanId,
    recipeIds: planResult.recipeIds,
    totalNok: cost.totalNok,
  };
}
