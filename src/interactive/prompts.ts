/**
 * Prompt templates for the interactive recipe refiner.
 * Manages conversation history for multi-turn coherence.
 */

import type { GeneratedRecipe } from "../recipes/generator";

export interface RefinementDiff {
  added: { name: string; amount: string; unit: string; category: string }[];
  removed: string[];
  modified: { name: string; change: string }[];
  updated_recipe: GeneratedRecipe;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export class ConversationHistory {
  private messages: ConversationMessage[] = [];

  add(role: "user" | "assistant", content: string): void {
    this.messages.push({ role, content });
    // Keep last 10 turns to avoid token overflow
    if (this.messages.length > 20) {
      this.messages = this.messages.slice(-20);
    }
  }

  format(): string {
    return this.messages
      .map((m) => `${m.role === "user" ? "User" : "Chef"}: ${m.content}`)
      .join("\n");
  }

  clear(): void {
    this.messages = [];
  }
}

export function buildRefinementPrompt(
  recipe: GeneratedRecipe,
  userRequest: string,
  history: ConversationHistory
): string {
  const historyText = history.format();
  const historySection = historyText ? `\nConversation so far:\n${historyText}\n` : "";

  return `You are an expert Thai/Asian cuisine chef helping a user refine their recipe interactively.

Current recipe: ${recipe.name} (${recipe.servings} servings)
Ingredients:
${recipe.ingredients.map((i, idx) => `  ${idx}. ${i.amount} ${i.unit} ${i.name} (${i.category}, essential: ${i.is_essential})`).join("\n")}

Steps:
${recipe.steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}
${historySection}
User request: ${userRequest}

Respond with a JSON diff showing what changed. Use this exact format, no markdown:
{
  "added": [
    {"name": "ingredient name", "amount": "200", "unit": "g", "category": "vegetable"}
  ],
  "removed": ["ingredient name to remove"],
  "modified": [
    {"name": "ingredient name", "change": "amount 2 → 4 pcs"}
  ],
  "updated_recipe": {
    "name": "${recipe.name}",
    "description": "...",
    "servings": ${recipe.servings},
    "prep_time": "${recipe.prep_time}",
    "cook_time": "${recipe.cook_time}",
    "difficulty": "${recipe.difficulty}",
    "cuisine": "${recipe.cuisine}",
    "ingredients": [full updated ingredients array],
    "steps": [full updated steps array],
    "tips": [full updated tips array]
  }
}

Rules:
- Apply the user's changes while keeping the recipe coherent
- Use simple 1-3 word ingredient names (same rules as recipe generation)
- If removing a key ingredient, suggest a replacement
- If the user asks for a "cheaper version", swap to budget-friendly alternatives
- Return the COMPLETE updated_recipe, not just changes
- Keep amounts realistic for ${recipe.servings} servings`;
}
