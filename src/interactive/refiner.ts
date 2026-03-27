/**
 * Interactive Recipe Refiner — conversational recipe editing loop.
 *
 * After generating a recipe, the user enters a readline loop to modify
 * it through natural language. Only changed ingredients are re-matched.
 */

import { aiCallJson } from "../utils/ai";
import { askUser, closeReadline } from "../utils/prompt";
import { matchIngredient } from "../ingredients/matcher";
import { buildShoppingCart, printCart } from "../recipes/generator";
import type { GeneratedRecipe, ShoppingCart, ShoppingCartItem, UnmatchedItem } from "../recipes/generator";
import { ConversationHistory, buildRefinementPrompt, type RefinementDiff } from "./prompts";
import type { MatchResult } from "../db/types";

export async function startInteractiveSession(
  recipe: GeneratedRecipe,
  cart: ShoppingCart,
  options: { preferSource?: "afood" | "meny" } = {}
): Promise<ShoppingCart> {
  const history = new ConversationHistory();
  let currentRecipe = recipe;
  let currentCart = cart;

  console.log(`\n🔄 Interactive mode. Type changes or "done" to finish.\n`);

  while (true) {
    const input = await askUser("You> ");

    if (input === null) {
      console.log(`\n✅ Final cart ready. Happy cooking!\n`);
      break;
    }
    if (!input) continue;

    const lower = input.toLowerCase().trim();
    if (lower === "done" || lower === "exit" || lower === "quit") {
      console.log(`\n✅ Final cart ready. Happy cooking!\n`);
      break;
    }

    if (lower === "show" || lower === "recipe") {
      printCurrentRecipe(currentRecipe);
      continue;
    }

    if (lower === "cart") {
      printCart(currentCart);
      continue;
    }

    if (lower === "help") {
      printInteractiveHelp();
      continue;
    }

    console.log(`🍳 Refining...`);

    const result = await refineRecipe(currentRecipe, input, history);

    if (!result) {
      console.log(`  Could not apply changes. Try rephrasing your request.\n`);
      continue;
    }

    // Show diff
    printDiff(result);

    // Track conversation
    history.add("user", input);
    history.add("assistant", summarizeDiff(result));

    currentRecipe = result.updated_recipe;

    // Incremental re-matching: only re-match changed/added ingredients,
    // reuse existing matches for unchanged ones (saves 5-8s per refinement)
    const changedNames = new Set([
      ...result.added.map((a) => a.name.toLowerCase()),
      ...result.modified.map((m) => m.name.toLowerCase()),
    ]);
    const removedNames = new Set(result.removed.map((r) => r.toLowerCase()));

    if (changedNames.size > 0 || removedNames.size > 0) {
      console.log(`  🛒 Updating cart (re-matching ${changedNames.size} changed ingredients)...\n`);
      currentCart = await incrementalRebuildCart(
        currentRecipe,
        currentCart,
        changedNames,
        removedNames,
        options.preferSource
      );
      printCart(currentCart);
    }
  }

  closeReadline();
  return currentCart;
}

async function refineRecipe(
  recipe: GeneratedRecipe,
  userRequest: string,
  history: ConversationHistory
): Promise<RefinementDiff | null> {
  const prompt = buildRefinementPrompt(recipe, userRequest, history);

  const diff = await aiCallJson<RefinementDiff>(prompt, {
    temperature: 0.5,
    maxOutputTokens: 3000,
    context: "recipe refinement",
  });

  if (diff?.updated_recipe) {
    diff.updated_recipe.servings = recipe.servings;
    return diff;
  }

  return null;
}

/**
 * Incrementally rebuild the shopping cart: only re-match changed/added
 * ingredients, reuse existing matches for unchanged ones.
 */
async function incrementalRebuildCart(
  recipe: GeneratedRecipe,
  previousCart: ShoppingCart,
  changedNames: Set<string>,
  removedNames: Set<string>,
  preferSource?: "afood" | "meny"
): Promise<ShoppingCart> {
  // Build a lookup of existing matches by ingredient name
  const existingMatches = new Map<string, { item: ShoppingCartItem } | { unmatched: UnmatchedItem }>();
  for (const item of previousCart.items) {
    existingMatches.set(item.ingredient.name.toLowerCase(), { item });
  }
  for (const item of previousCart.unmatched) {
    existingMatches.set(item.ingredient.name.toLowerCase(), { unmatched: item });
  }

  const items: ShoppingCartItem[] = [];
  const unmatched: UnmatchedItem[] = [];

  // Separate unchanged (reuse) from changed (need re-matching)
  const toRematch: { ingredient: typeof recipe.ingredients[0]; idx: number }[] = [];

  for (let idx = 0; idx < recipe.ingredients.length; idx++) {
    const ingredient = recipe.ingredients[idx];
    const name = ingredient.name.toLowerCase();

    if (removedNames.has(name)) continue;

    if (!changedNames.has(name)) {
      const existing = existingMatches.get(name);
      if (existing && "item" in existing) {
        items.push({ ...existing.item, ingredient });
        continue;
      }
      if (existing && "unmatched" in existing) {
        unmatched.push({ ...existing.unmatched, ingredient });
        continue;
      }
    }

    // Queue for parallel re-matching
    toRematch.push({ ingredient, idx });
  }

  // Re-match all changed ingredients in parallel
  if (toRematch.length > 0) {
    const results = await Promise.all(
      toRematch.map(async ({ ingredient }) => {
        const result = await matchIngredient(ingredient.name, {
          source: preferSource,
          amount: String(ingredient.amount || ""),
          unit: String(ingredient.unit || ""),
          category: ingredient.category,
        });
        return { ingredient, result };
      })
    );

    for (const { ingredient, result } of results) {
      if (result.product) {
        items.push({
          ingredient,
          match: result,
          product_name: result.product.name,
          product_price: result.product.price,
          product_url: result.product.product_url,
          source: result.product.source,
        });
        const icon = result.tier === 1 ? "T1" : "T2";
        console.log(`  [${icon}] ${ingredient.name} -> ${result.product.name} (${result.product.price} kr)`);
      } else if (result.substitute) {
        unmatched.push({
          ingredient,
          suggestion: `Use ${result.substitute.name} (${result.substitute.quality} substitute, ${result.substitute.ratio})`,
        });
        console.log(`  [T3] ${ingredient.name} -> SUBSTITUTE: ${result.substitute.name}`);
      } else {
        unmatched.push({ ingredient, suggestion: null });
        console.log(`  [--] ${ingredient.name} -> NOT FOUND`);
      }
    }
  }

  const totalPrice = items.reduce((sum, i) => sum + (i.product_price || 0), 0);
  const afoodItems = items.filter((i) => i.source === "afood").length;
  const menyItems = items.filter((i) => i.source === "meny").length;

  return {
    recipe,
    items,
    staples: [],
    unmatched,
    summary: {
      total_price: totalPrice,
      staples_price: 0,
      item_count: items.length,
      staples_count: 0,
      afood_items: afoodItems,
      meny_items: menyItems,
      substitutions: items.filter((i) => i.match.tier === 3).length,
      unmatched_count: unmatched.length,
      validation_skipped: true,
    },
  };
}

function printDiff(diff: RefinementDiff): void {
  for (const item of diff.added) {
    console.log(`  + Added: ${item.name} (${item.amount}${item.unit})`);
  }
  for (const name of diff.removed) {
    console.log(`  - Removed: ${name}`);
  }
  for (const item of diff.modified) {
    console.log(`  ~ Modified: ${item.name} — ${item.change}`);
  }
  if (diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0) {
    console.log(`  (no ingredient changes)`);
  }
  console.log();
}

function summarizeDiff(diff: RefinementDiff): string {
  const parts: string[] = [];
  if (diff.added.length) parts.push(`Added ${diff.added.map((a) => a.name).join(", ")}`);
  if (diff.removed.length) parts.push(`Removed ${diff.removed.join(", ")}`);
  if (diff.modified.length) parts.push(`Modified ${diff.modified.map((m) => m.name).join(", ")}`);
  return parts.join(". ") || "No changes.";
}

function printCurrentRecipe(recipe: GeneratedRecipe): void {
  console.log(`\n  📖 ${recipe.name}`);
  console.log(`  ${recipe.description}\n`);
  console.log(`  Ingredients:`);
  for (const ing of recipe.ingredients) {
    console.log(`    ${ing.amount} ${ing.unit} ${ing.name}`);
  }
  console.log(`\n  Steps:`);
  recipe.steps.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
  console.log();
}

function printInteractiveHelp(): void {
  console.log(`
  Interactive commands:
    <any text>  — describe changes (e.g. "make it spicier", "remove shrimp")
    show/recipe — show current recipe
    cart        — show current shopping cart
    done        — finish and exit
    help        — show this help
  `);
}
