/**
 * Recipe Fusion Lab — combines two cuisines into creative fusion dishes.
 * AI generates culturally-informed fusions with explanations.
 */

import { aiCallJson } from "../utils/ai";
import { cook, printCart } from "./generator";

export interface FusionConcept {
  name: string;
  description: string;
  cuisine_a_elements: string[];
  cuisine_b_elements: string[];
  bridge_elements: string[];
  cultural_note: string;
}

const FUSION_PROMPT = `You are a creative fusion cuisine expert. Combine two cuisines into an innovative but cohesive dish.

Respond in this exact JSON format, no markdown:
{
  "name": "Creative Fusion Dish Name",
  "description": "An appetizing 2-3 sentence description of the dish, written like a restaurant menu item.",
  "cuisine_a_elements": ["element1", "element2"],
  "cuisine_b_elements": ["element1", "element2"],
  "bridge_elements": ["shared ingredient/technique that connects both cuisines"],
  "cultural_note": "1-2 sentences explaining why these cuisines pair well together."
}

Rules:
- Create a dish that genuinely works — not just random combination
- Identify shared DNA between the cuisines (common ingredients, techniques, flavor profiles)
- The fusion should respect both culinary traditions
- The dish should be cookable at home with accessible ingredients
- Be creative but practical
`;

export async function generateFusionConcept(
  cuisineA: string,
  cuisineB: string
): Promise<FusionConcept> {
  const prompt = `${FUSION_PROMPT}\nCuisine A: ${cuisineA}\nCuisine B: ${cuisineB}`;

  const concept = await aiCallJson<FusionConcept>(prompt, {
    temperature: 0.9,
    maxOutputTokens: 1500,
    context: "fusion concept",
  });

  if (!concept) {
    throw new Error("Failed to generate fusion concept after retries.");
  }

  return concept;
}

export function printFusionConcept(concept: FusionConcept, cuisineA: string, cuisineB: string): void {
  const a = cuisineA.charAt(0).toUpperCase() + cuisineA.slice(1);
  const b = cuisineB.charAt(0).toUpperCase() + cuisineB.slice(1);

  console.log(`\n🔬 Fusion Lab: ${a} × ${b}\n`);
  console.log(`  🍳 ${concept.name}`);
  console.log(`     "${concept.description}"\n`);
  console.log(`  Fusion elements:`);
  console.log(`    ${a}:    ${concept.cuisine_a_elements.join(", ")}`);
  console.log(`    ${b}:    ${concept.cuisine_b_elements.join(", ")}`);
  console.log(`    Bridge:  ${concept.bridge_elements.join(", ")} (shared DNA)\n`);
  console.log(`  🧬 Cultural note: ${concept.cultural_note}\n`);
}

export async function fusionFlow(
  cuisineA: string,
  cuisineB: string,
  options: { servings?: number; preferSource?: "afood" | "meny" } = {}
): Promise<void> {
  console.log(`\n🔬 Generating fusion: ${cuisineA} × ${cuisineB}...\n`);

  const concept = await generateFusionConcept(cuisineA, cuisineB);
  printFusionConcept(concept, cuisineA, cuisineB);

  // Use the fusion concept as a recipe request
  const request = `${concept.name}: ${concept.description}. Combine elements from ${cuisineA} (${concept.cuisine_a_elements.join(", ")}) and ${cuisineB} (${concept.cuisine_b_elements.join(", ")}).`;

  const cart = await cook(request, {
    servings: options.servings || 4,
    preferSource: options.preferSource,
  });

  printCart(cart);
}
