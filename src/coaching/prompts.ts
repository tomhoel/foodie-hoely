/**
 * Prompt templates for the AI Cooking Coach.
 */

import type { GeneratedRecipe } from "../recipes/generator";

export interface ExpandedStep {
  step_number: number;
  title: string;
  instruction: string;
  technique_tip: string;
  visual_cue: string;
  timer_minutes: number | null;
  common_mistakes: string;
}

export function buildStepExpansionPrompt(recipe: GeneratedRecipe): string {
  return `You are an expert cooking coach. Expand each recipe step into detailed, beginner-friendly instructions with pro tips.

Recipe: ${recipe.name} (${recipe.servings} servings)
Ingredients:
${recipe.ingredients.map((i) => `  ${i.amount} ${i.unit} ${i.name}`).join("\n")}

Steps to expand:
${recipe.steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}

For each step, provide detailed coaching. Respond in this exact JSON format, no markdown:
[
  {
    "step_number": 1,
    "title": "Short step title (3-5 words)",
    "instruction": "Detailed step instruction with quantities and specifics",
    "technique_tip": "Pro tip about technique, timing, or visual cues",
    "visual_cue": "What to look/smell/hear for to know it's done right",
    "timer_minutes": 15,
    "common_mistakes": "What to avoid or watch out for"
  }
]

Rules:
- Be specific about temperatures, timing, and quantities
- Include sensory cues (look, smell, sound, texture)
- Set timer_minutes to null if no waiting is needed
- Focus on technique and "why" behind each action
- Keep language conversational and encouraging
`;
}

export function buildCoachingQAPrompt(
  recipe: GeneratedRecipe,
  currentStep: ExpandedStep,
  question: string
): string {
  return `You are a friendly cooking coach helping someone cook "${recipe.name}".

They are currently on step ${currentStep.step_number}: "${currentStep.title}"
Step details: ${currentStep.instruction}

Full recipe ingredients:
${recipe.ingredients.map((i) => `  ${i.amount} ${i.unit} ${i.name}`).join("\n")}

Their question: ${question}

Answer concisely (2-4 sentences max). Be practical and specific to their current situation. If their question suggests a problem, offer a fix. Keep a warm, encouraging tone.`;
}
