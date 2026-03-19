/**
 * Meal Planner — AI-optimized multi-meal planning with ingredient reuse.
 *
 * Plans multiple meals, generates recipes for each, and produces
 * a consolidated shopping list with reuse savings.
 */

import { aiCallJson } from "../utils/ai";
import { askUser, closeReadline } from "../utils/prompt";
import { cook, printCart } from "../recipes/generator";
import type { ShoppingCart } from "../recipes/generator";
import { consolidateCarts, printConsolidatedCart } from "./consolidator";
import { loadProfile, mergeOverrides, type TasteProfile } from "../profile/taste-profile";

export interface MealPlan {
  meals: PlannedMeal[];
  reuse_ingredients: { ingredient: string; meal_count: number }[];
}

export interface PlannedMeal {
  day: string;
  name: string;
  description: string;
  difficulty: string;
  cook_time: string;
  key_ingredients: string[];
}

const PLAN_PROMPT = `You are a meal planning expert specializing in Thai and Asian cuisine.

Create a meal plan that optimizes for ingredient reuse across meals to minimize waste and shopping cost.

Respond in this exact JSON format, no markdown:
{
  "meals": [
    {
      "day": "Mon",
      "name": "Pad Thai",
      "description": "Classic stir-fried rice noodles",
      "difficulty": "easy",
      "cook_time": "30 min",
      "key_ingredients": ["rice noodles", "fish sauce", "garlic", "lime"]
    }
  ],
  "reuse_ingredients": [
    {"ingredient": "garlic", "meal_count": 5},
    {"ingredient": "soy sauce", "meal_count": 4}
  ]
}

Rules:
- Maximize ingredient reuse across meals (garlic, soy sauce, lime, rice, etc.)
- Mix difficulties throughout the week (easier on busy days, harder on weekends)
- Vary cuisines within Asian (Thai, Japanese, Korean, Chinese, Vietnamese, Indian)
- Include a variety of proteins and vegetables
- Keep cook times realistic
- List only 4-6 key ingredients per meal (the ones that drive the recipe)
`;

export async function generateMealPlan(options: {
  meals: number;
  budget?: number;
  tasteProfile?: TasteProfile;
  preferSource?: "afood" | "meny";
}): Promise<void> {
  const { meals, budget } = options;

  let budgetLine = "";
  if (budget) {
    budgetLine = `\nBudget: ${budget} kr total for all meals. Choose recipes that fit within this budget.`;
  }

  let tasteLine = "";
  if (options.tasteProfile) {
    tasteLine = `\nTaste preferences: spice ${options.tasteProfile.spice}/10, sweet ${options.tasteProfile.sweetness}/10`;
  }

  const prompt = `${PLAN_PROMPT}\n\nNumber of meals: ${meals}${budgetLine}${tasteLine}`;

  console.log(`\n📅 AI Meal Planner (${meals} meals${budget ? `, budget ${budget} kr` : ""})\n`);
  console.log(`  Generating meal plan...\n`);

  const plan = await aiCallJson<MealPlan>(prompt, {
    temperature: 0.7,
    maxOutputTokens: 2000,
    context: "meal planning",
  });

  if (!plan?.meals?.length) {
    throw new Error("Failed to generate meal plan after retries.");
  }

  // Display plan
  for (const meal of plan.meals) {
    console.log(
      `  ${meal.day}: ${meal.name.padEnd(30)} — ${meal.difficulty}, ${meal.cook_time}`
    );
  }
  console.log();

  // Show ingredient reuse
  if (plan.reuse_ingredients?.length) {
    console.log(`  ♻️  Ingredient Reuse:`);
    for (const item of plan.reuse_ingredients.slice(0, 6)) {
      console.log(`    ${item.ingredient}: ${item.meal_count}/${meals} meals`);
    }
    console.log();
  }

  // Ask which to generate
  const answer = await askUser(
    `Generate all recipes? (y/n) or pick a meal number (1-${plan.meals.length}): `
  );

  if (answer === null) {
    closeReadline();
    console.log("No selection made.");
    return;
  }

  const mealsToGenerate: PlannedMeal[] = [];

  if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes" || answer === "all") {
    mealsToGenerate.push(...plan.meals);
  } else {
    const num = parseInt(answer, 10);
    if (num >= 1 && num <= plan.meals.length) {
      mealsToGenerate.push(plan.meals[num - 1]);
    } else {
      closeReadline();
      console.log("No meals selected.");
      return;
    }
  }

  closeReadline();

  // Generate recipes in parallel (concurrency 2 to respect Gemini rate limits)
  const PLAN_CONCURRENCY = 2;
  console.log(`\n  Generating ${mealsToGenerate.length} recipes (${PLAN_CONCURRENCY} at a time)...\n`);

  const generatedCarts: { mealName: string; cart: ShoppingCart; meal: PlannedMeal }[] =
    new Array(mealsToGenerate.length);
  let nextIdx = 0;

  async function worker(): Promise<void> {
    while (nextIdx < mealsToGenerate.length) {
      const idx = nextIdx++;
      const meal = mealsToGenerate[idx];

      const cart = await cook(meal.name, {
        servings: 4,
        preferSource: options.preferSource,
      });

      generatedCarts[idx] = { mealName: meal.name, cart, meal };
    }
  }

  const workers = Array.from(
    { length: Math.min(PLAN_CONCURRENCY, mealsToGenerate.length) },
    () => worker()
  );
  await Promise.all(workers);

  // Print results in order after all complete
  for (const entry of generatedCarts) {
    if (!entry) continue;
    console.log(`\n${"─".repeat(60)}`);
    console.log(`  🍳 ${entry.meal.day}: ${entry.meal.name}`);
    console.log(`${"─".repeat(60)}`);
    printCart(entry.cart);
  }

  // Consolidate if multiple meals
  if (generatedCarts.length > 1) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  📋 Consolidated Plan Summary`);
    console.log(`${"═".repeat(60)}`);

    const consolidated = consolidateCarts(generatedCarts);
    printConsolidatedCart(consolidated);

    if (budget) {
      if (consolidated.total_price <= budget) {
        console.log(`  ✅ Under budget: ${consolidated.total_price.toFixed(0)} kr / ${budget} kr\n`);
      } else {
        console.log(
          `  ⚠️  Over budget: ${consolidated.total_price.toFixed(0)} kr / ${budget} kr (+${(consolidated.total_price - budget).toFixed(0)} kr)\n`
        );
      }
    }
  }
}
