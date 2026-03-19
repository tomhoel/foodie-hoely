/**
 * AI Cooking Coach — step-by-step guided cooking with Q&A.
 *
 * Loads the last generated recipe, expands steps with technique tips,
 * and enters an interactive session for guided cooking.
 */

import { aiCall, aiCallJson } from "../utils/ai";
import { loadJson } from "../utils/storage";
import { askUser, closeReadline } from "../utils/prompt";
import type { GeneratedRecipe } from "../recipes/generator";
import { buildStepExpansionPrompt, buildCoachingQAPrompt, type ExpandedStep } from "./prompts";

export async function startCoachingSession(): Promise<void> {
  const recipe = loadJson<GeneratedRecipe>("last-recipe.json");
  if (!recipe) {
    console.error(`\n  No recipe found. Run "cook" first to generate a recipe.\n`);
    console.error(`  Example: npx tsx src/index.ts cook "pad thai"\n`);
    process.exit(1);
  }

  console.log(`\n👨‍🍳 Loading recipe: ${recipe.name} (${recipe.servings} servings)`);
  console.log(`   ⏱️  Prep: ${recipe.prep_time} | Cook: ${recipe.cook_time} | ${recipe.difficulty}\n`);

  console.log(`📋 Expanding steps with coaching tips...\n`);
  const steps = await expandSteps(recipe);

  if (!steps.length) {
    console.error("Failed to expand recipe steps. Using basic steps.");
    // Fall back to basic steps from recipe
    for (let i = 0; i < recipe.steps.length; i++) {
      console.log(`  Step ${i + 1}/${recipe.steps.length}: ${recipe.steps[i]}\n`);
    }
    closeReadline();
    return;
  }

  console.log(`  ✅ ${steps.length} steps ready. Type "next" to advance, or ask questions.\n`);
  console.log(`${"─".repeat(60)}\n`);

  let currentIdx = 0;
  printStep(steps[currentIdx], steps.length);

  while (true) {
    const input = await askUser("\nYou> ");

    if (input === null) {
      console.log(`\n🎉 Great cooking session! Enjoy your ${recipe.name}!\n`);
      break;
    }
    if (!input) continue;

    const lower = input.toLowerCase().trim();

    if (lower === "done" || lower === "exit" || lower === "quit") {
      console.log(`\n🎉 Great cooking session! Enjoy your ${recipe.name}!\n`);
      break;
    }

    if (lower === "next" || lower === "n") {
      currentIdx++;
      if (currentIdx >= steps.length) {
        console.log(`\n🎉 All steps complete! Your ${recipe.name} is ready. Enjoy!\n`);
        break;
      }
      console.log();
      printStep(steps[currentIdx], steps.length);
      continue;
    }

    if (lower === "prev" || lower === "back" || lower === "p") {
      if (currentIdx > 0) {
        currentIdx--;
        console.log();
        printStep(steps[currentIdx], steps.length);
      } else {
        console.log("  Already at the first step.");
      }
      continue;
    }

    if (lower === "overview" || lower === "steps") {
      printOverview(steps, currentIdx);
      continue;
    }

    if (lower === "help") {
      printCoachHelp();
      continue;
    }

    // It's a question — answer it in context
    console.log(`\n👨‍🍳 `);
    const answer = await answerQuestion(recipe, steps[currentIdx], input);
    console.log(`  ${answer}\n`);
  }

  closeReadline();
}

async function expandSteps(recipe: GeneratedRecipe): Promise<ExpandedStep[]> {
  const prompt = buildStepExpansionPrompt(recipe);

  const steps = await aiCallJson<ExpandedStep[]>(prompt, {
    temperature: 0.5,
    maxOutputTokens: 4000,
    context: "step expansion",
  });

  return steps?.length ? steps : [];
}

async function answerQuestion(
  recipe: GeneratedRecipe,
  currentStep: ExpandedStep,
  question: string
): Promise<string> {
  const prompt = buildCoachingQAPrompt(recipe, currentStep, question);

  try {
    const text = await aiCall(prompt, {
      temperature: 0.6,
      maxOutputTokens: 500,
      context: "cooking Q&A",
    });

    return text || "I'm not sure about that. Try moving to the next step.";
  } catch {
    return "Sorry, I couldn't process that question. Try asking differently.";
  }
}

function printStep(step: ExpandedStep, total: number): void {
  console.log(`Step ${step.step_number}/${total}: ${step.title}`);
  console.log(`  ${step.instruction}`);

  if (step.timer_minutes) {
    console.log(`  ⏱️  Timer: ${step.timer_minutes} minutes`);
  }

  console.log(`\n  💡 ${step.technique_tip}`);

  if (step.visual_cue) {
    console.log(`  👀 Look for: ${step.visual_cue}`);
  }

  if (step.common_mistakes) {
    console.log(`  ⚠️  Avoid: ${step.common_mistakes}`);
  }
}

function printOverview(steps: ExpandedStep[], currentIdx: number): void {
  console.log(`\n  📋 Steps overview:\n`);
  for (let i = 0; i < steps.length; i++) {
    const marker = i === currentIdx ? "→" : " ";
    const check = i < currentIdx ? "✓" : " ";
    console.log(`  ${marker} ${check} ${steps[i].step_number}. ${steps[i].title}`);
  }
  console.log();
}

function printCoachHelp(): void {
  console.log(`
  Coaching commands:
    next/n      — advance to next step
    prev/p      — go back one step
    overview    — show all steps with progress
    <question>  — ask anything about the current step
    done        — finish the session
    help        — show this help
  `);
}
