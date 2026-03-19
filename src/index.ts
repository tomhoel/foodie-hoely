#!/usr/bin/env tsx
/**
 * Foodie CLI — AI-powered cooking companion
 *
 * Core commands:
 *   cook <dish> [flags]             Generate recipe + shopping cart
 *   cook <dish> --interactive       Interactive recipe refinement
 *   cook <dish> --diet vegan        Dietary adaptation
 *   cook <dish> --allergy nuts      Allergy-safe adaptation
 *   cook <dish> --optimize          Cross-store price optimization
 *
 * AI features:
 *   fuse <cuisineA> <cuisineB>      Fusion recipe lab
 *   pantry "ingredients..."         What can I cook?
 *   coach                           Step-by-step cooking guidance
 *   plan --meals 5 [--budget 800]   AI meal planner
 *
 * Taste profile:
 *   profile set --spice 8 --sweet 3 Set taste preferences
 *   profile show                    Show current profile
 *   profile reset                   Reset to defaults
 *
 * Infrastructure:
 *   sync [afood|meny|all]           Sync products from stores
 *   enrich / embed / seed / link    Data pipeline commands
 *   pipeline                        Full pipeline
 *   stats                           Database statistics
 */

import { validateConfig } from "./config";
import { getSupabase } from "./db/client";
import { syncAfood } from "./sync/afood-sync";
import { syncMeny } from "./sync/meny-sync";
import { enrichProducts } from "./enrichment/product-enricher";
import { generateProductEmbeddings, generateIngredientEmbeddings } from "./enrichment/embedding-generator";
import { seedIngredientMappings, linkIngredientsToProducts } from "./ingredients/mapping-seeder";
import { matchIngredient, matchRecipeIngredients } from "./ingredients/matcher";
import { cook, printCart } from "./recipes/generator";
import { loadProfile, saveProfile, showProfile, resetProfile, parseTasteFlags } from "./profile/taste-profile";
import { startInteractiveSession } from "./interactive/refiner";
import { fusionFlow } from "./recipes/fusion";
import { pantryFlow } from "./pantry/suggest";
import { startCoachingSession } from "./coaching/coach";
import { optimizeCart, printOptimization } from "./optimization/price-optimizer";
import { generateMealPlan } from "./planning/meal-planner";
import type { DietaryConstraints } from "./recipes/dietary-adapter";

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "help") {
    printHelp();
    return;
  }

  // Validate env vars before running any command
  validateConfig();

  switch (command) {
    case "sync":
      await handleSync(args[0]);
      break;
    case "enrich":
      await handleEnrich(args);
      break;
    case "embed":
      await handleEmbed(args);
      break;
    case "seed":
      await handleSeed(args);
      break;
    case "link":
      await handleLink();
      break;
    case "match":
      await handleMatch(args.join(" "));
      break;
    case "recipe":
      await handleRecipe(args.join(" "));
      break;
    case "cook":
      await handleCook(args);
      break;
    case "profile":
      handleProfile(args);
      break;
    case "fuse":
      await handleFuse(args);
      break;
    case "pantry":
      await handlePantry(args);
      break;
    case "coach":
      await handleCoach();
      break;
    case "plan":
      await handlePlan(args);
      break;
    case "pipeline":
      await handlePipeline();
      break;
    case "stats":
      await handleStats();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

// ─── Command handlers ────────────────────────────────────────────────────────

async function handleSync(source?: string) {
  switch (source) {
    case "afood":
      await syncAfood();
      break;
    case "meny":
      await syncMeny();
      break;
    case "all":
    case undefined:
      console.log("=== Syncing all sources ===\n");
      await syncAfood();
      console.log("");
      await syncMeny();
      break;
    default:
      console.error(`Unknown source: ${source}. Use: afood, meny, or all`);
      process.exit(1);
  }
}

async function handleEnrich(args: string[]) {
  const source = parseFlag(args, "--source") as "afood" | "meny" | undefined;
  const limit = parseFlag(args, "--limit");
  const force = args.includes("--force");

  await enrichProducts({
    source,
    limit: limit ? parseInt(limit) : undefined,
    force,
  });
}

async function handleEmbed(args: string[]) {
  const source = parseFlag(args, "--source") as "afood" | "meny" | undefined;
  const limit = parseFlag(args, "--limit");
  const force = args.includes("--force");

  await generateProductEmbeddings({
    source,
    limit: limit ? parseInt(limit) : undefined,
    force,
  });
  await generateIngredientEmbeddings({ force });
}

async function handleSeed(args: string[]) {
  const force = args.includes("--force");
  await seedIngredientMappings({ force });
}

async function handleLink() {
  await linkIngredientsToProducts();
}

async function handleMatch(ingredient: string) {
  if (!ingredient) {
    console.error("Usage: match <ingredient>");
    process.exit(1);
  }

  console.log(`\nMatching: "${ingredient}"\n`);
  const result = await matchIngredient(ingredient);

  console.log(`\nResult:`);
  console.log(`  Tier: ${result.tier} (${result.tier_label})`);
  console.log(`  Confidence: ${(result.confidence * 100).toFixed(1)}%`);

  if (result.product) {
    console.log(`  Product: ${result.product.name}`);
    console.log(`  Brand: ${result.product.brand || "N/A"}`);
    console.log(`  Price: ${result.product.price} kr`);
    console.log(`  Source: ${result.product.source}`);
    console.log(`  URL: ${result.product.product_url}`);
    if (result.product.ai_description) {
      console.log(`  Description: ${result.product.ai_description}`);
    }
  }

  if (result.substitute) {
    console.log(`  Substitute: ${result.substitute.name}`);
    console.log(`  Ratio: ${result.substitute.ratio}`);
    console.log(`  Quality: ${result.substitute.quality}`);
    if (result.substitute.notes) {
      console.log(`  Notes: ${result.substitute.notes}`);
    }
  }

  if (result.notes) {
    console.log(`  Notes: ${result.notes}`);
  }
}

async function handleRecipe(recipeName: string) {
  if (!recipeName) {
    console.error("Usage: recipe <recipe name or comma-separated ingredients>");
    process.exit(1);
  }

  // If it looks like a recipe name, we could use AI to generate ingredients
  // For now, treat as comma-separated ingredients
  const ingredients = recipeName.includes(",")
    ? recipeName.split(",").map((s) => s.trim())
    : [recipeName]; // single ingredient

  if (ingredients.length === 1 && !recipeName.includes(",")) {
    // Treat as a recipe name — show a helpful message
    console.log(`\nTip: Pass comma-separated ingredients for full matching:`);
    console.log(`  npx tsx src/index.ts recipe "coconut milk,fish sauce,chicken,rice noodles,lime"\n`);
  }

  const { matches, summary } = await matchRecipeIngredients(ingredients);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Recipe Matching Summary`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  Total ingredients: ${summary.total}`);
  console.log(`  Tier 1 (direct):   ${summary.tier1}`);
  console.log(`  Tier 2 (semantic):  ${summary.tier2}`);
  console.log(`  Tier 3 (substitute):${summary.tier3}`);
  console.log(`  Unmatched:          ${summary.unmatched}`);
  console.log(`  Estimated total:    ${summary.estimatedTotal.toFixed(2)} kr`);
  console.log(`  Sources: aFood=${summary.sources.afood}, Meny=${summary.sources.meny}`);
}

async function handleCook(args: string[]) {
  const servingsFlag = parseFlag(args, "--servings") || parseFlag(args, "-s");
  const sourceFlag = parseFlag(args, "--source") as "afood" | "meny" | undefined;
  const dietFlag = parseFlag(args, "--diet");
  const allergyFlag = parseFlag(args, "--allergy");
  const interactive = args.includes("--interactive") || args.includes("-i");
  const optimize = args.includes("--optimize");
  const tasteOverrides = parseTasteFlags(args);

  // Flags that take a value
  const valueFlagNames = new Set(["--servings", "-s", "--source", "--diet", "--allergy", "--spice", "--sweet", "--sweetness", "--sour", "--sourness", "--umami", "--salt", "--saltiness"]);
  // Boolean flags
  const boolFlagNames = new Set(["--interactive", "-i", "--optimize", "--verbose"]);

  // Remove flags from args to get the dish name
  const dishParts: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (valueFlagNames.has(args[i])) {
      i++; // skip flag value
      continue;
    }
    if (boolFlagNames.has(args[i])) {
      continue;
    }
    dishParts.push(args[i]);
  }

  const dish = dishParts.join(" ");
  if (!dish) {
    console.error('Usage: cook "pad thai" [--servings 4] [--source afood] [--diet vegan] [--allergy nuts] [--interactive] [--optimize]');
    process.exit(1);
  }

  // Build dietary constraints
  const dietary: DietaryConstraints = {
    diets: dietFlag ? dietFlag.split(",").map((s) => s.trim()) : [],
    allergies: allergyFlag ? allergyFlag.split(",").map((s) => s.trim()) : [],
  };

  const cart = await cook(dish, {
    servings: servingsFlag ? parseInt(servingsFlag) : 4,
    preferSource: sourceFlag,
    dietary,
    tasteOverrides: Object.keys(tasteOverrides).length > 0 ? tasteOverrides : undefined,
  });

  printCart(cart);

  // Price optimization
  if (optimize) {
    console.log(`\n💰 Optimizing prices across stores...\n`);
    const result = await optimizeCart(cart);
    printOptimization(result);
    if (result.switches.length > 0) {
      printCart(result.cart);
    }
  }

  // Interactive refinement
  if (interactive) {
    await startInteractiveSession(cart.recipe, cart, { preferSource: sourceFlag });
  }
}

function handleProfile(args: string[]) {
  const subcommand = args[0];

  switch (subcommand) {
    case "set": {
      const overrides = parseTasteFlags(args);
      if (Object.keys(overrides).length === 0) {
        console.error('Usage: profile set --spice 8 --sweet 3 --sour 7 --umami 9 --salt 5');
        process.exit(1);
      }
      const existing = loadProfile() || { spice: 5, sweetness: 5, sourness: 5, umami: 5, saltiness: 5 };
      const updated = { ...existing, ...overrides };
      saveProfile(updated);
      console.log(`\n✅ Taste profile saved.`);
      showProfile(updated);
      break;
    }
    case "show": {
      const profile = loadProfile();
      if (!profile) {
        console.log(`\n  No taste profile set. Use "profile set --spice 8 --sweet 3" to create one.\n`);
      } else {
        showProfile(profile);
      }
      break;
    }
    case "reset": {
      resetProfile();
      console.log(`\n✅ Taste profile reset to defaults.\n`);
      showProfile(loadProfile()!);
      break;
    }
    default:
      console.error('Usage: profile [set|show|reset]');
      console.error('  set   --spice 8 --sweet 3 --sour 7 --umami 9 --salt 5');
      console.error('  show  Display current profile');
      console.error('  reset Reset to default values');
      process.exit(1);
  }
}

async function handleFuse(args: string[]) {
  if (args.length < 2) {
    console.error('Usage: fuse <cuisineA> <cuisineB>');
    console.error('Example: fuse thai mexican');
    process.exit(1);
  }

  const sourceFlag = parseFlag(args, "--source") as "afood" | "meny" | undefined;
  const servingsFlag = parseFlag(args, "--servings");

  await fusionFlow(args[0], args[1], {
    servings: servingsFlag ? parseInt(servingsFlag) : 4,
    preferSource: sourceFlag,
  });
}

async function handlePantry(args: string[]) {
  const sourceFlag = parseFlag(args, "--source") as "afood" | "meny" | undefined;
  const servingsFlag = parseFlag(args, "--servings");

  // Remove flags to get the pantry items string
  const parts: string[] = [];
  const valueFlagNames = new Set(["--source", "--servings"]);
  for (let i = 0; i < args.length; i++) {
    if (valueFlagNames.has(args[i])) {
      i++;
      continue;
    }
    parts.push(args[i]);
  }

  const pantryInput = parts.join(" ");
  if (!pantryInput) {
    console.error('Usage: pantry "chicken, coconut milk, rice, garlic, soy sauce"');
    process.exit(1);
  }

  await pantryFlow(pantryInput, {
    servings: servingsFlag ? parseInt(servingsFlag) : 4,
    preferSource: sourceFlag,
  });
}

async function handleCoach() {
  await startCoachingSession();
}

async function handlePlan(args: string[]) {
  const mealsFlag = parseFlag(args, "--meals");
  const budgetFlag = parseFlag(args, "--budget");
  const sourceFlag = parseFlag(args, "--source") as "afood" | "meny" | undefined;

  const meals = mealsFlag ? parseInt(mealsFlag) : 5;
  const budget = budgetFlag ? parseInt(budgetFlag) : undefined;

  await generateMealPlan({
    meals,
    budget,
    tasteProfile: loadProfile() || undefined,
    preferSource: sourceFlag,
  });
}

async function handlePipeline() {
  console.log("=== FULL PIPELINE ===\n");

  console.log("Step 1/6: Sync aFood products...");
  await syncAfood();

  console.log("\nStep 2/6: Sync Meny products...");
  await syncMeny();

  console.log("\nStep 3/6: AI-enrich products (Flash Lite)...");
  await enrichProducts();

  console.log("\nStep 4/6: Seed ingredient mappings...");
  await seedIngredientMappings();

  console.log("\nStep 5/6: Generate embeddings...");
  await generateProductEmbeddings();
  await generateIngredientEmbeddings();

  console.log("\nStep 6/6: Link ingredients to products...");
  await linkIngredientsToProducts();

  console.log("\n=== PIPELINE COMPLETE ===");
  await handleStats();
}

async function handleStats() {
  const db = getSupabase();

  const [products, afood, meny, enriched, embedded, ingredients, linked, syncs] = await Promise.all([
    db.from("products").select("id", { count: "exact", head: true }),
    db.from("products").select("id", { count: "exact", head: true }).eq("source", "afood"),
    db.from("products").select("id", { count: "exact", head: true }).eq("source", "meny"),
    db.from("products").select("id", { count: "exact", head: true }).not("ai_description", "is", null),
    db.from("product_embeddings").select("id", { count: "exact", head: true }),
    db.from("ingredient_mappings").select("id", { count: "exact", head: true }),
    db.from("ingredient_mappings").select("id", { count: "exact", head: true }).neq("preferred_products", "[]"),
    db.from("sync_log").select("*").order("started_at", { ascending: false }).limit(5),
  ]);

  console.log(`\n${"=".repeat(50)}`);
  console.log("  Foodie Database Stats");
  console.log(`${"=".repeat(50)}`);
  console.log(`  Products total:      ${products.count || 0}`);
  console.log(`    aFood:             ${afood.count || 0}`);
  console.log(`    Meny:              ${meny.count || 0}`);
  console.log(`  AI-enriched:         ${enriched.count || 0}`);
  console.log(`  With embeddings:     ${embedded.count || 0}`);
  console.log(`  Ingredient mappings: ${ingredients.count || 0}`);
  console.log(`    Linked to products:${linked.count || 0}`);

  if (syncs.data?.length) {
    console.log(`\n  Recent syncs:`);
    for (const s of syncs.data) {
      const time = new Date(s.started_at).toLocaleString("no-NO");
      console.log(`    ${time} | ${s.source} ${s.sync_type} | ${s.status} | ${s.products_synced || 0} products`);
    }
  }
  console.log("");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function printHelp() {
  console.log(`
Foodie CLI — AI-powered cooking companion

Core:
  cook <dish> [flags]                    Generate recipe + shopping cart
    --servings 4                         Number of servings
    --source afood|meny                  Preferred store
    --diet vegan,gluten-free             Dietary adaptation
    --allergy nuts,shellfish             Allergy-safe adaptation
    --interactive / -i                   Interactive recipe refinement
    --optimize                           Cross-store price optimization
    --spice 8 --sweet 3 ...              Per-recipe taste overrides

AI Features:
  fuse <cuisineA> <cuisineB>             Fusion recipe lab
  pantry "chicken, rice, garlic..."      What can I cook with these?
  coach                                  Step-by-step cooking guidance
  plan --meals 5 [--budget 800]          AI meal planner

Taste Profile:
  profile set --spice 8 --sweet 3        Set taste preferences (1-10)
  profile show                           Show current profile
  profile reset                          Reset to defaults

Matching:
  match <ingredient>                     Match single ingredient
  recipe <ingredients>                   Match comma-separated ingredients

Infrastructure:
  sync [afood|meny|all]                  Sync products from stores
  enrich [--source] [--limit] [--force]  AI-enrich descriptions
  embed [--source] [--limit] [--force]   Generate embeddings
  seed [--force]                         Seed ingredient mappings
  link                                   Link ingredients to products
  pipeline                               Run full pipeline
  stats                                  Database statistics

Examples:
  npx tsx src/index.ts cook "pad thai"
  npx tsx src/index.ts cook "pad thai" --interactive
  npx tsx src/index.ts cook "green curry" --diet vegan --allergy nuts
  npx tsx src/index.ts cook "tom yum soup" --optimize --spice 9
  npx tsx src/index.ts fuse thai mexican
  npx tsx src/index.ts pantry "chicken, coconut milk, rice, garlic"
  npx tsx src/index.ts coach
  npx tsx src/index.ts plan --meals 5 --budget 800
  npx tsx src/index.ts profile set --spice 8 --sweet 3 --umami 9
`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
