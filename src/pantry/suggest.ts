/**
 * Smart Pantry — "What Can I Cook?"
 *
 * Inverts the normal flow: user inputs ingredients they have,
 * AI suggests recipes that maximize usage, only gap items go to cart.
 */

import { aiCallJson } from "../utils/ai";
import { askUser, closeReadline } from "../utils/prompt";
import { cook, printCart } from "../recipes/generator";

export interface PantrySuggestion {
  name: string;
  description: string;
  pantry_used: string[];
  items_to_buy: string[];
  difficulty: string;
  cook_time: string;
  estimated_cost: number;
}

const PANTRY_PROMPT = `You are a creative chef who specializes in making the most of available ingredients.

Given a list of ingredients the user has in their pantry, suggest 3-5 recipes that maximize the use of these pantry items. Focus on Thai and Asian cuisine.

Respond in this exact JSON format, no markdown:
[
  {
    "name": "Recipe Name",
    "description": "Short appetizing description",
    "pantry_used": ["ingredient1", "ingredient2"],
    "items_to_buy": ["missing item 1", "missing item 2"],
    "difficulty": "easy|medium|hard",
    "cook_time": "30 min",
    "estimated_cost": 50
  }
]

Rules:
- Prioritize recipes that use the MOST pantry items
- Keep the "items to buy" list as short as possible
- Suggest realistic, practical recipes (not random combinations)
- Sort by pantry utilization (most used items first)
- Estimated cost is for the missing items only, in Norwegian kroner
- Include a mix of difficulties
`;

export async function suggestFromPantry(
  pantryItems: string[]
): Promise<PantrySuggestion[]> {
  const prompt = `${PANTRY_PROMPT}\n\nPantry ingredients: ${pantryItems.join(", ")}`;

  const suggestions = await aiCallJson<PantrySuggestion[]>(prompt, {
    temperature: 0.8,
    maxOutputTokens: 2000,
    context: "pantry suggestions",
  });

  if (!suggestions?.length) {
    throw new Error("Failed to generate pantry suggestions after retries.");
  }

  return suggestions;
}

export async function pantryFlow(
  pantryInput: string,
  options: { servings?: number; preferSource?: "afood" | "meny" } = {}
): Promise<void> {
  const pantryItems = pantryInput.split(",").map((s) => s.trim()).filter(Boolean);

  if (pantryItems.length === 0) {
    console.error('Usage: pantry "chicken, coconut milk, rice, garlic"');
    process.exit(1);
  }

  console.log(`\n🧊 Analyzing your pantry (${pantryItems.length} items)...\n`);

  const suggestions = await suggestFromPantry(pantryItems);

  console.log(`📋 Recipes ranked by pantry utilization:\n`);
  for (let i = 0; i < suggestions.length; i++) {
    const s = suggestions[i];
    const used = s.pantry_used.length;
    const total = pantryItems.length;
    const buy = s.items_to_buy.length;
    const cost = s.estimated_cost ? `${s.estimated_cost} kr` : "?";
    console.log(
      `  ${i + 1}. ${s.name.padEnd(30)} Uses: ${used}/${total} items | Buy: ${buy} items (~${cost})`
    );
    console.log(`     ${s.description}`);
    console.log(`     ${s.difficulty}, ${s.cook_time}\n`);
  }

  const answer = await askUser(`Pick (1-${suggestions.length}) or "more": `);
  closeReadline();

  if (answer === null) {
    console.log("No selection made.");
    return;
  }

  const pick = parseInt(answer, 10);
  if (isNaN(pick) || pick < 1 || pick > suggestions.length) {
    console.log("No selection made.");
    return;
  }

  const chosen = suggestions[pick - 1];
  console.log(`\n🍳 Generating: ${chosen.name}...\n`);

  // Generate recipe with constraint to use pantry items
  const request = `${chosen.name}. Must use these pantry ingredients: ${chosen.pantry_used.join(", ")}. Also need: ${chosen.items_to_buy.join(", ")}.`;

  const cart = await cook(request, {
    servings: options.servings || 4,
    preferSource: options.preferSource,
  });

  // Filter cart to highlight what's from pantry vs what needs buying
  const pantryLower = new Set(chosen.pantry_used.map((p) => p.toLowerCase()));

  console.log(`\n🧊 Items from your pantry (no purchase needed):`);
  for (const item of chosen.pantry_used) {
    console.log(`    ✓ ${item}`);
  }

  // Show only items that aren't in the pantry
  const toBuy = cart.items.filter((item) => {
    const name = item.ingredient.name.toLowerCase();
    return !pantryLower.has(name) && ![...pantryLower].some((p) =>
      name.includes(p) || p.includes(name)
    );
  });

  if (toBuy.length > 0) {
    console.log(`\n🛒 Items to buy (${toBuy.length} items):`);
    for (const item of toBuy) {
      const price = item.product_price ? `${item.product_price} kr` : "N/A";
      console.log(`    ${item.ingredient.amount} ${item.ingredient.unit} ${item.ingredient.name}`);
      console.log(`      → ${item.product_name} (${price}, ${item.source})`);
    }
    const buyTotal = toBuy.reduce((sum, i) => sum + (i.product_price || 0), 0);
    console.log(`\n  💰 Extra cost: ${buyTotal.toFixed(0)} kr`);
  } else {
    console.log(`\n  ✅ You have everything you need!`);
  }

  console.log();
  printCart(cart);
}
