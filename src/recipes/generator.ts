/**
 * Recipe Generator — uses Gemini to generate Thai/Asian recipes
 * and matches all ingredients to available products from aFood + Meny.
 *
 * This is the user-facing brain of the service:
 *   "I want to cook Pad Thai for 4 people"
 *   → full recipe + matched products + shopping cart + total price
 */

import { matchRecipeIngredients } from "../ingredients/matcher";
import { validateMatches } from "../ingredients/ai-validator";
import { aiCallJson } from "../utils/ai";
import { loadJson, saveJson } from "../utils/storage";
import { loadProfile, mergeOverrides, type TasteProfile } from "../profile/taste-profile";
import { buildTastePromptSection } from "../profile/taste-prompt";
import { adaptRecipe, printDietaryChanges, type DietaryConstraints } from "./dietary-adapter";
import type { MatchResult } from "../db/types";

// ─── Pantry Staples — items most home cooks already have ─────────────────────

const DEFAULT_STAPLES = new Set([
  "oil", "cooking oil", "vegetable oil", "sunflower oil", "canola oil",
  "olive oil", "sesame oil", "salt", "pepper", "black pepper",
  "sugar", "white sugar", "brown sugar", "water", "ice",
  "garlic", "onion", "butter", "flour", "rice",
  "soy sauce", "vinegar", "cornstarch", "baking powder",
  "egg", "eggs",
]);

function loadStaples(): Set<string> {
  const custom = loadJson<string[]>("pantry-staples.json");
  if (custom?.length) {
    return new Set([...DEFAULT_STAPLES, ...custom.map((s) => s.toLowerCase())]);
  }
  return DEFAULT_STAPLES;
}

export function isStaple(ingredientName: string): boolean {
  const staples = loadStaples();
  const name = ingredientName.toLowerCase().trim();
  if (staples.has(name)) return true;
  // Check if any staple is a substring match (e.g., "sesame oil" matches "oil")
  // But be careful — only match if the staple IS the ingredient, not a component
  for (const staple of staples) {
    if (name === staple) return true;
  }
  return false;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GeneratedRecipe {
  name: string;
  description: string;
  servings: number;
  prep_time: string;
  cook_time: string;
  difficulty: "easy" | "medium" | "hard";
  cuisine: string;
  ingredients: RecipeIngredient[];
  steps: string[];
  tips: string[];
}

export interface RecipeIngredient {
  name: string;
  amount: string;
  unit: string;
  is_essential: boolean;
  category: "protein" | "vegetable" | "sauce" | "spice" | "carb" | "dairy" | "other";
}

export interface ShoppingCart {
  recipe: GeneratedRecipe;
  items: ShoppingCartItem[];
  staples: ShoppingCartItem[];
  unmatched: UnmatchedItem[];
  summary: {
    total_price: number;
    staples_price: number;
    item_count: number;
    staples_count: number;
    afood_items: number;
    meny_items: number;
    substitutions: number;
    unmatched_count: number;
    validation_skipped: boolean;
  };
}

export interface ShoppingCartItem {
  ingredient: RecipeIngredient;
  match: MatchResult;
  product_name: string;
  product_price: number | null;
  product_url: string | null;
  source: "afood" | "meny";
  alt?: AlternativeProduct | null;
}

export interface AlternativeProduct {
  product_name: string;
  product_price: number | null;
  source: "afood" | "meny";
  image_url: string | null;
  product_id: string;
}

export interface UnmatchedItem {
  ingredient: RecipeIngredient;
  suggestion: string | null;
}

// ─── Recipe Generation (2A — constrained naming rules) ──────────────────────

const RECIPE_PROMPT = `You are a Thai and Asian cuisine chef. Generate a detailed recipe.

Respond in this exact JSON format, no markdown:
{
  "name": "Recipe Name",
  "description": "Short appetizing description (1-2 sentences)",
  "servings": 4,
  "prep_time": "15 min",
  "cook_time": "20 min",
  "difficulty": "easy|medium|hard",
  "cuisine": "thai|japanese|chinese|korean|vietnamese|indian|asian",
  "ingredients": [
    {"name": "ingredient in English", "amount": "400", "unit": "ml", "is_essential": true, "category": "sauce|protein|vegetable|spice|carb|dairy|other"}
  ],
  "steps": [
    "Step 1 instruction...",
    "Step 2 instruction..."
  ],
  "tips": [
    "Helpful tip about the dish..."
  ]
}

Important ingredient naming rules:
- Use simple, common ingredient names the AI can match to Norwegian grocery stores
- For Thai ingredients use English names (e.g. "fish sauce" not "nam pla")
- Ingredient names should be max 3 words
- GOOD names: "jasmine rice", "fish sauce", "garlic", "lime", "coconut milk", "soy sauce"
- BAD names: "day-old cooked jasmine rice", "premium Thai fish sauce", "freshly squeezed lime juice"
- Never add preparation adjectives (minced, sliced, day-old, fresh, dried) to ingredient names
- Preparation details belong in steps, not ingredient names
- Do not include "water" as an ingredient
- Do NOT include common pantry staples that most home cooks already have: cooking oil, salt, pepper, sugar, garlic, onion, butter, flour, rice, eggs, vinegar, cornstarch
- Only include specialty ingredients that the user actually needs to buy (e.g. fish sauce, curry paste, coconut milk, lemongrass — YES. Plain oil, salt, pepper, garlic — NO)
- If a recipe truly depends on a specific TYPE of oil/sugar (e.g. "sesame oil", "palm sugar"), include it. But generic "oil" and "sugar" should be assumed at home
- Include amounts that make sense for the serving size
- Mark garnishes and optional items as is_essential: false
- Be specific about cuts/prep in the steps, not the ingredient names

`;

export async function generateRecipe(
  request: string,
  servings: number = 4,
  options: { tasteProfile?: TasteProfile; tasteOverrides?: Partial<TasteProfile> } = {}
): Promise<GeneratedRecipe> {
  // Build taste section if profile exists
  let tasteSection = "";
  const profile = options.tasteProfile || loadProfile();
  if (profile) {
    const effective = options.tasteOverrides
      ? mergeOverrides(profile, options.tasteOverrides)
      : profile;
    tasteSection = buildTastePromptSection(effective);
    console.log(`  🎨 Using taste profile (spice: ${effective.spice}, sweet: ${effective.sweetness}, sour: ${effective.sourness}, umami: ${effective.umami})`);
  }

  const prompt = `${RECIPE_PROMPT}${tasteSection}\nRequest: ${request}\nServings: ${servings}`;

  const recipe = await aiCallJson<GeneratedRecipe>(prompt, {
    temperature: 0.7,
    maxOutputTokens: 3000,
    context: "recipe generation",
  });

  if (!recipe) {
    throw new Error("Failed to generate recipe: AI returned invalid JSON after retries. Please try again.");
  }

  recipe.servings = servings;
  return recipe;
}

// ─── Shopping Cart Builder ───────────────────────────────────────────────────

export async function buildShoppingCart(
  recipe: GeneratedRecipe,
  options: { preferSource?: "afood" | "meny" } = {}
): Promise<ShoppingCart> {
  // Pass structured ingredients with amount/unit/category for smart matching
  // Coerce amounts to strings — AI sometimes returns numbers in refined recipes
  const structuredIngredients = recipe.ingredients.map((i) => ({
    name: i.name,
    amount: String(i.amount || ""),
    unit: String(i.unit || ""),
    category: i.category,
  }));

  const { matches: rawMatches } = await matchRecipeIngredients(structuredIngredients, {
    source: options.preferSource,
  });

  // AI validation layer: Gemini 3.1 Flash Lite reviews and corrects matches
  console.log(`\n🤖 AI validating matches (Gemini 3.1 Flash Lite)...\n`);
  const ingredientNames = recipe.ingredients.map((i) => `${String(i.amount || "")} ${String(i.unit || "")} ${i.name}`);
  const { validatedMatches: matches, corrections, skipped, validationSkipped } = await validateMatches(
    ingredientNames,
    rawMatches
  );

  if (validationSkipped) {
    console.log(`  [AI] ⚠️  Validation was skipped due to an error — matches may be less accurate\n`);
  } else if (corrections > 0 || skipped > 0) {
    console.log(`  [AI] ${corrections} corrections, ${skipped} skipped\n`);
  } else {
    console.log(`  [AI] All matches validated OK\n`);
  }

  const items: ShoppingCartItem[] = [];
  const staples: ShoppingCartItem[] = [];
  const unmatched: UnmatchedItem[] = [];

  for (let idx = 0; idx < recipe.ingredients.length; idx++) {
    const ingredient = recipe.ingredients[idx];
    const match = matches[idx];

    if (match.product) {
      const cartItem: ShoppingCartItem = {
        ingredient,
        match,
        product_name: match.product.name,
        product_price: match.product.price,
        product_url: match.product.product_url,
        source: match.product.source,
      };

      // Separate pantry staples from items to buy
      if (isStaple(ingredient.name)) {
        staples.push(cartItem);
      } else {
        items.push(cartItem);
      }
    } else if (match.substitute) {
      unmatched.push({
        ingredient,
        suggestion: `Use ${match.substitute.name} (${match.substitute.quality} substitute, ${match.substitute.ratio})`,
      });
    } else {
      unmatched.push({
        ingredient,
        suggestion: null,
      });
    }
  }

  // Find alternatives from the other store (parallel, non-blocking)
  console.log(`  🔄 Finding alternatives at the other store...\n`);
  const { matchIngredient } = await import("../ingredients/matcher");
  await Promise.all(
    items.map(async (item) => {
      const otherSource = item.source === "afood" ? "meny" : "afood";
      try {
        const alt = await matchIngredient(item.ingredient.name, {
          source: otherSource as "afood" | "meny",
          amount: String(item.ingredient.amount || ""),
          unit: String(item.ingredient.unit || ""),
          category: item.ingredient.category,
        });
        if (alt.product?.price) {
          item.alt = {
            product_name: alt.product.name,
            product_price: alt.product.price,
            source: alt.product.source,
            image_url: alt.product.image_url,
            product_id: alt.product.product_id,
          };
        }
      } catch {
        // Non-critical — just skip alternatives on failure
      }
    })
  );

  const totalPrice = items.reduce((sum, i) => sum + (i.product_price || 0), 0);
  const staplesPrice = staples.reduce((sum, i) => sum + (i.product_price || 0), 0);
  const allMatchedItems = [...items, ...staples];
  const afoodItems = allMatchedItems.filter((i) => i.source === "afood").length;
  const menyItems = allMatchedItems.filter((i) => i.source === "meny").length;
  const substitutions = matches.filter((m) => m.tier === 3).length;

  return {
    recipe,
    items,
    staples,
    unmatched,
    summary: {
      total_price: totalPrice,
      staples_price: staplesPrice,
      item_count: items.length,
      staples_count: staples.length,
      afood_items: afoodItems,
      meny_items: menyItems,
      substitutions,
      unmatched_count: unmatched.length,
      validation_skipped: validationSkipped,
    },
  };
}

// ─── Full Flow: request → recipe → cart ──────────────────────────────────────

export async function cook(
  request: string,
  options: {
    servings?: number;
    preferSource?: "afood" | "meny";
    dietary?: DietaryConstraints;
    tasteProfile?: TasteProfile;
    tasteOverrides?: Partial<TasteProfile>;
  } = {}
): Promise<ShoppingCart> {
  const servings = options.servings || 4;

  console.log(`\n🍳 Generating recipe: "${request}" (${servings} servings)...\n`);
  let recipe = await generateRecipe(request, servings, {
    tasteProfile: options.tasteProfile,
    tasteOverrides: options.tasteOverrides,
  });

  console.log(`📖 ${recipe.name}`);
  console.log(`   ${recipe.description}`);
  console.log(`   ⏱️  Prep: ${recipe.prep_time} | Cook: ${recipe.cook_time} | ${recipe.difficulty}`);
  console.log(`   🍽️  ${recipe.servings} servings | ${recipe.cuisine} cuisine`);
  console.log(`   📋 ${recipe.ingredients.length} ingredients\n`);

  // Apply dietary/allergy adaptations if specified
  if (options.dietary && (options.dietary.diets.length > 0 || options.dietary.allergies.length > 0)) {
    const labels = [
      ...options.dietary.diets,
      ...options.dietary.allergies.map((a) => `${a}-free`),
    ];
    console.log(`  🥗 Adapting for: ${labels.join(", ")}\n`);
    const adaptation = await adaptRecipe(recipe, options.dietary);
    printDietaryChanges(adaptation, options.dietary);
    recipe = adaptation.recipe;
  }

  console.log(`🛒 Matching ingredients to products...\n`);
  const cart = await buildShoppingCart(recipe, { preferSource: options.preferSource });

  // Save recipe for coaching feature
  try {
    saveJson("last-recipe.json", recipe);
  } catch {
    // Non-critical — don't fail the cook flow
  }

  return cart;
}

// ─── Pretty Print ────────────────────────────────────────────────────────────

export function printCart(cart: ShoppingCart): void {
  const { recipe, items, staples, unmatched, summary } = cart;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  🍳 ${recipe.name}`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  ${recipe.description}\n`);

  // Steps
  console.log(`  📋 Steps:`);
  recipe.steps.forEach((step, i) => {
    console.log(`     ${i + 1}. ${step}`);
  });

  // Tips
  if (recipe.tips?.length) {
    console.log(`\n  💡 Tips:`);
    recipe.tips.forEach((tip) => console.log(`     • ${tip}`));
  }

  // Shopping list — items to buy
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  🛒 Shopping List`);
  console.log(`${"─".repeat(60)}\n`);

  // Group by source
  const afoodItems = items.filter((i) => i.source === "afood");
  const menyItems = items.filter((i) => i.source === "meny");

  const storeIcon = (s: string) => s === "afood" ? "📦" : "🏪";
  const storeName = (s: string) => s === "afood" ? "aFood" : "Meny";

  function printStoreGroup(storeItems: ShoppingCartItem[], icon: string, name: string) {
    if (!storeItems.length) return;
    console.log(`  ${icon} ${name} (${storeItems.length} items):`);
    for (const item of storeItems) {
      const price = item.product_price ? `${item.product_price} kr` : "N/A";
      const tier = item.match.tier === 1 ? "✓" : "~";
      console.log(`     ${tier} ${item.ingredient.amount} ${item.ingredient.unit} ${item.ingredient.name}`);
      console.log(`       → ${item.product_name} (${price})`);
      if (item.alt) {
        const altPrice = item.alt.product_price ? `${item.alt.product_price} kr` : "N/A";
        const altIcon = storeIcon(item.alt.source);
        console.log(`       ${altIcon} Also at ${storeName(item.alt.source)}: ${item.alt.product_name} (${altPrice})`);
      }
    }
    console.log();
  }

  printStoreGroup(afoodItems, "📦", "aFood Market");
  printStoreGroup(menyItems, "🏪", "Meny");

  // Pantry staples — assumed at home
  if (staples.length) {
    console.log(`  🏠 Assumed at home (${staples.length} items):`);
    for (const item of staples) {
      console.log(`     · ${item.ingredient.amount} ${item.ingredient.unit} ${item.ingredient.name}`);
    }
    console.log();
  }

  if (unmatched.length) {
    console.log(`  ⚠️  Not available (${unmatched.length} items):`);
    for (const item of unmatched) {
      console.log(`     ✗ ${item.ingredient.amount} ${item.ingredient.unit} ${item.ingredient.name}`);
      if (item.suggestion) {
        console.log(`       → ${item.suggestion}`);
      }
    }
    console.log();
  }

  // Summary
  console.log(`${"─".repeat(60)}`);
  console.log(`  💰 Items to buy: ${summary.total_price.toFixed(2)} kr`);
  if (summary.staples_count > 0) {
    console.log(`  🏠 Pantry staples: ${summary.staples_count} items assumed at home`);
  }
  console.log(`  📊 ${summary.item_count} to buy (${summary.afood_items} aFood, ${summary.meny_items} Meny)`);
  if (summary.substitutions > 0) {
    console.log(`  🔄 ${summary.substitutions} substitutions suggested`);
  }
  if (summary.unmatched_count > 0) {
    console.log(`  ⚠️  ${summary.unmatched_count} items not found`);
  }
  if (summary.validation_skipped) {
    console.log(`  ⚠️  AI validation was skipped — results may be less accurate`);
  }
  console.log(`${"═".repeat(60)}\n`);
}
