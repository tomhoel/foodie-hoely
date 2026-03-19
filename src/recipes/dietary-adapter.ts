/**
 * Dietary & Allergy Adaptation — adapts recipes to dietary requirements.
 *
 * AI identifies violating ingredients and generates smart replacements
 * that maintain the dish's character. Hardcoded allergen lookup as safety backup.
 */

import { aiCallJson } from "../utils/ai";
import type { GeneratedRecipe, RecipeIngredient } from "./generator";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DietaryConstraints {
  diets: string[];
  allergies: string[];
}

export interface DietaryChange {
  type: "removed" | "replaced" | "added" | "verified";
  original?: string;
  replacement?: string;
  reason: string;
}

export interface AdaptationResult {
  recipe: GeneratedRecipe;
  changes: DietaryChange[];
  allCompliant: boolean;
}

// ─── Supported constraints ───────────────────────────────────────────────────

export const SUPPORTED_DIETS = [
  "vegan", "vegetarian", "pescatarian", "keto", "halal", "low-carb",
] as const;

export const SUPPORTED_ALLERGIES = [
  "nuts", "shellfish", "dairy", "gluten", "soy", "eggs", "sesame",
] as const;

// ─── Hardcoded allergen safety lookup (not solely AI-dependent) ──────────────

const ALLERGEN_MAP: Record<string, string[]> = {
  nuts: ["peanut", "peanuts", "cashew", "cashews", "almond", "almonds", "walnut", "walnuts", "pistachio", "hazelnut", "pecan", "macadamia", "pine nut", "pine nuts", "peanut butter", "satay sauce"],
  shellfish: ["shrimp", "prawn", "prawns", "crab", "lobster", "mussel", "mussels", "clam", "clams", "oyster", "oysters", "scallop", "scallops", "shrimp paste", "squid", "calamari"],
  dairy: ["milk", "cream", "butter", "cheese", "yogurt", "yoghurt", "ghee", "whey", "casein", "sour cream"],
  gluten: ["wheat", "flour", "bread", "pasta", "noodles", "soy sauce", "couscous", "barley", "rye", "breadcrumbs", "panko"],
  soy: ["soy sauce", "soy", "tofu", "tempeh", "edamame", "miso", "soybean", "soy milk"],
  eggs: ["egg", "eggs", "mayonnaise", "mayo"],
  sesame: ["sesame", "sesame oil", "sesame seeds", "tahini"],
};

const DIET_RESTRICTIONS: Record<string, string[]> = {
  vegan: ["meat", "chicken", "pork", "beef", "lamb", "duck", "fish", "shrimp", "prawn", "prawns", "crab", "lobster", "egg", "eggs", "milk", "cream", "butter", "cheese", "yogurt", "yoghurt", "ghee", "honey", "fish sauce", "oyster sauce", "shrimp paste", "anchovy"],
  vegetarian: ["meat", "chicken", "pork", "beef", "lamb", "duck", "fish", "shrimp", "prawn", "prawns", "crab", "lobster", "fish sauce", "oyster sauce", "shrimp paste", "anchovy", "gelatin"],
  pescatarian: ["meat", "chicken", "pork", "beef", "lamb", "duck"],
  halal: ["pork", "bacon", "ham", "lard", "gelatin"],
};

// ─── AI Adaptation ──────────────────────────────────────────────────────────

const ADAPT_PROMPT = `You are a dietary adaptation expert for Thai and Asian cuisine.

Given a recipe and dietary/allergy constraints, identify all violating ingredients and provide smart replacements that maintain the dish's authentic character and flavor profile.

Respond in this exact JSON format, no markdown:
{
  "changes": [
    {
      "type": "replaced",
      "original_index": 0,
      "original_name": "fish sauce",
      "replacement": {"name": "soy sauce", "amount": "3", "unit": "tbsp", "is_essential": true, "category": "sauce"},
      "reason": "vegan alternative — soy sauce + seaweed provides similar umami"
    },
    {
      "type": "removed",
      "original_index": 2,
      "original_name": "shrimp",
      "replacement": {"name": "extra-firm tofu", "amount": "400", "unit": "g", "is_essential": true, "category": "protein"},
      "reason": "vegan protein swap"
    }
  ],
  "updated_steps": ["Step 1...", "Step 2..."],
  "notes": "All ingredients now comply with vegan, gluten-free requirements."
}

Rules:
- Only modify ingredients that ACTUALLY violate the constraints
- Choose replacements that maintain the dish's flavor profile
- For allergy constraints, be EXTREMELY careful — err on the side of caution
- Update cooking steps if the replacement requires different handling
- If a replacement changes the character of the dish, explain why in the reason
`;

interface AIAdaptResponse {
  changes: {
    type: "replaced" | "removed";
    original_index: number;
    original_name: string;
    replacement: {
      name: string;
      amount: string;
      unit: string;
      is_essential: boolean;
      category: RecipeIngredient["category"];
    } | null;
    reason: string;
  }[];
  updated_steps: string[];
  notes: string;
}

export async function adaptRecipe(
  recipe: GeneratedRecipe,
  constraints: DietaryConstraints
): Promise<AdaptationResult> {
  const changes: DietaryChange[] = [];

  // Step 1: Hardcoded safety check for allergies (backup layer)
  const violations = findHardcodedViolations(recipe.ingredients, constraints);

  // Step 2: AI adaptation for comprehensive analysis
  const constraintDesc = [
    ...constraints.diets.map((d) => `diet: ${d}`),
    ...constraints.allergies.map((a) => `allergy: ${a}`),
  ].join(", ");

  const prompt = `${ADAPT_PROMPT}

Recipe: ${recipe.name}
Ingredients:
${recipe.ingredients.map((ing, i) => `  ${i}. ${ing.amount} ${ing.unit} ${ing.name} (${ing.category})`).join("\n")}

Steps:
${recipe.steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}

Constraints: ${constraintDesc}

${violations.length > 0 ? `\nKnown violations (must address): ${violations.map((v) => `"${v.ingredient}" (${v.reason})`).join(", ")}` : ""}`;

  const parsed = await aiCallJson<AIAdaptResponse>(prompt, {
    temperature: 0.2,
    maxOutputTokens: 2000,
    context: "dietary adaptation",
  });

  if (!parsed) {
    // Fallback: apply hardcoded violations only
    console.warn("  [Dietary] AI adaptation failed, applying safety checks only");
    return applyHardcodedFallback(recipe, violations);
  }

  // Apply AI changes to recipe
  const adapted = { ...recipe, ingredients: [...recipe.ingredients] };

  for (const change of parsed.changes) {
    if (change.original_index < 0 || change.original_index >= adapted.ingredients.length) continue;

    if (change.replacement) {
      // Clean up replacement name: strip prep adjectives and parenthetical notes
      const cleanedName = cleanIngredientName(change.replacement.name);
      adapted.ingredients[change.original_index] = {
        name: cleanedName,
        amount: change.replacement.amount,
        unit: change.replacement.unit,
        is_essential: change.replacement.is_essential,
        category: change.replacement.category,
      };
      changes.push({
        type: "replaced",
        original: change.original_name,
        replacement: `${change.replacement.amount} ${change.replacement.unit} ${change.replacement.name}`,
        reason: change.reason,
      });
    } else {
      changes.push({
        type: "removed",
        original: change.original_name,
        reason: change.reason,
      });
    }
  }

  // Remove null replacements (ingredients to remove entirely)
  adapted.ingredients = adapted.ingredients.filter((_, i) => {
    const removal = parsed.changes.find(
      (c) => c.original_index === i && !c.replacement
    );
    return !removal;
  });

  // Update steps if provided
  if (parsed.updated_steps?.length) {
    adapted.steps = parsed.updated_steps;
  }

  // Verify no hardcoded violations remain (safety net)
  const remaining = findHardcodedViolations(adapted.ingredients, constraints);
  const allCompliant = remaining.length === 0;

  if (!allCompliant) {
    for (const v of remaining) {
      changes.push({
        type: "verified",
        original: v.ingredient,
        reason: `WARNING: "${v.ingredient}" may still violate ${v.reason} — please verify`,
      });
    }
  }

  return { recipe: adapted, changes, allCompliant };
}

// ─── Name cleanup ────────────────────────────────────────────────────────────

/** Strip prep adjectives and parenthetical notes from AI-generated names */
function cleanIngredientName(name: string): string {
  // Remove parenthetical notes: "chickpea flour (for binding)" → "chickpea flour"
  let cleaned = name.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  // Remove trailing commas and prep adjectives
  cleaned = cleaned.replace(/,\s*(cubed|sliced|diced|chopped|minced|crushed|ground|grated|julienned|shredded|torn|halved|quartered|whisked|beaten)$/i, "");
  // Remove leading prep adjectives: "extra-firm tofu" → "tofu" (but keep "extra-firm" as it's meaningful for tofu)
  // Only remove generic prep words at the start
  const genericPrepWords = /^(fresh|dried|frozen|raw|cooked|prepared|blanched|peeled|deveined|deboned|boneless|skinless)\s+/i;
  // Don't strip these from replacement ingredients — they're often meaningful
  // Only strip trailing prep instructions
  cleaned = cleaned.replace(/,\s*\w+ed$/i, "").trim();
  return cleaned || name;
}

// ─── Hardcoded safety checks ─────────────────────────────────────────────────

interface Violation {
  ingredient: string;
  index: number;
  reason: string;
}

/** Words that indicate an ingredient is a substitute/alternative and should NOT be flagged */
const NEGATION_PREFIXES = [
  "vegan", "vegetarian", "plant-based", "plant based", "mock", "faux",
  "imitation", "substitute", "alternative", "dairy-free", "dairy free",
  "gluten-free", "gluten free", "nut-free", "nut free", "egg-free",
];

function isAlternativeIngredient(name: string): boolean {
  const lower = name.toLowerCase();
  return NEGATION_PREFIXES.some((prefix) => lower.includes(prefix));
}

function findHardcodedViolations(
  ingredients: RecipeIngredient[],
  constraints: DietaryConstraints
): Violation[] {
  const violations: Violation[] = [];

  for (let i = 0; i < ingredients.length; i++) {
    const name = ingredients[i].name.toLowerCase();

    // Skip ingredients that are explicitly alternatives (e.g., "vegan fish sauce")
    if (isAlternativeIngredient(name)) continue;

    // Check allergies
    for (const allergy of constraints.allergies) {
      const allergens = ALLERGEN_MAP[allergy] || [];
      let found = false;
      for (const allergen of allergens) {
        if (name.includes(allergen) || allergen.includes(name)) {
          violations.push({ ingredient: ingredients[i].name, index: i, reason: `${allergy} allergy` });
          found = true;
          break;
        }
      }
      if (found) break;
    }

    // Check diets
    for (const diet of constraints.diets) {
      const restricted = DIET_RESTRICTIONS[diet] || [];
      let found = false;
      for (const item of restricted) {
        if (name.includes(item) || item.includes(name)) {
          violations.push({ ingredient: ingredients[i].name, index: i, reason: `${diet} diet` });
          found = true;
          break;
        }
      }
      if (found) break;
    }
  }

  return violations;
}

function applyHardcodedFallback(
  recipe: GeneratedRecipe,
  violations: Violation[]
): AdaptationResult {
  const changes: DietaryChange[] = violations.map((v) => ({
    type: "removed" as const,
    original: v.ingredient,
    reason: `Removed due to ${v.reason} (AI adaptation unavailable)`,
  }));

  const violationIndices = new Set(violations.map((v) => v.index));
  const adapted = {
    ...recipe,
    ingredients: recipe.ingredients.filter((_, i) => !violationIndices.has(i)),
  };

  return { recipe: adapted, changes, allCompliant: true };
}

export function printDietaryChanges(result: AdaptationResult, constraints: DietaryConstraints): void {
  const labels = [
    ...constraints.diets,
    ...constraints.allergies.map((a) => `${a}-free`),
  ];

  if (constraints.allergies.length) {
    console.log(`\n  ⚠️  Allergy Safety:`);
  } else {
    console.log(`\n  🥗 Dietary Changes:`);
  }

  for (const change of result.changes) {
    switch (change.type) {
      case "replaced":
        console.log(`    ~ ${change.original} → ${change.replacement}`);
        console.log(`      ${change.reason}`);
        break;
      case "removed":
        console.log(`    ✗ Removed: ${change.original}`);
        console.log(`      ${change.reason}`);
        break;
      case "added":
        console.log(`    + Added: ${change.replacement}`);
        console.log(`      ${change.reason}`);
        break;
      case "verified":
        console.log(`    ⚠️  ${change.reason}`);
        break;
    }
  }

  if (result.allCompliant) {
    console.log(`    ✅ All ${result.recipe.ingredients.length} ingredients now comply with: ${labels.join(", ")}`);
  } else {
    console.log(`    ⚠️  Some ingredients may still need manual verification`);
  }
  console.log();
}
