# Foodie Phase 1 Week 4a — AI Planner Loop Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase-1 AI Planner — a Claude Sonnet 4.6 tool-calling loop that proposes 5-7 recipes per week, calls `cost_plan` to validate against weekly budget, revises if infeasible (max 3 iterations), persists the plan, and runs a Haiku 4.5 narrator pass for the user-facing 2-3 paragraph email summary.

**Architecture:** A single entrypoint `planWeek({householdId, weekStart, recipeCount, weeklyBudgetNok})` orchestrates: (1) load context (eligible recipes, pantry, active offers, recent history, household preferences), (2) build planner tool registry over that context (closure-injected dependencies, no globals), (3) call AI SDK `generateText` with model `anthropic/claude-sonnet-4.6` + tools + `stopWhen: stepCountIs(8)`, (4) when the model calls `finalize_plan`, capture args via tool-side closure and persist to `meal_plans` + `meal_plan_items`, (5) narrator pass via `anthropic/claude-haiku-4.5` writes the user-facing summary into `meal_plans.ai_reasoning`. All LLM traffic routes through Vercel AI Gateway via the AI SDK default behavior. Pantry repo returns `[]` in Phase 1 (real data lands in W4b once Trumf reconciler is built).

**Tech Stack:** TypeScript 5.7, AI SDK 5.x (`ai`, `@ai-sdk/anthropic`), zod (already installed), vitest, Supabase via existing `getSupabase()`. Vercel AI Gateway (env: `AI_GATEWAY_API_KEY`) auto-routes when set.

**Spec reference:** docs/superpowers/specs/2026-04-27-foodie-grocery-planner-design.md (sections 8.2 — AI planner; 8.7 — narrator; 6.2 — meal_plans/meal_plan_items schema)

**Predecessor:** phase-1-w3-complete

**Prerequisite (parallel — does not block Tasks 1-7):** Migration 005 already applied (Tasks 4-5, 9-10 hit live DB).

---

## Tasks

| # | Task | Model | DB needed |
|---|---|---|---|
| 1 | Install `ai` + `@ai-sdk/anthropic`; add `AI_GATEWAY_API_KEY` to config | haiku | no |
| 2 | Households repo — getOrCreateDefaultHousehold() | sonnet | no (interface) |
| 3 | Pantry repo — getPantrySummary() (returns [] when empty) | sonnet | no |
| 4 | Cookbook repo — listEligibleRecipes() + getRecipeDetailsLite() | sonnet | no |
| 5 | Plans repo — createDraftMealPlan() + lockMealPlan() + persistItems() | sonnet | no |
| 6 | Active offers helper — listActiveOffersForChains() | sonnet | no |
| 7 | Planner tools factory (TDD) — src/planner/tools.ts | sonnet | no |
| 8 | Planner loop (TDD with mock LM) — src/planner/loop.ts | sonnet | no |
| 9 | Narrator (Haiku 4.5 plain-language explanation) — src/planner/narrator.ts | sonnet | no |
| 10 | CLI: `plan-week` command + seed:household script | sonnet | YES |
| 11 | Final verify + tag phase-1-w4a-complete | sonnet | no |

---

## Files created
- src/db/repositories/households.repo.ts
- src/db/repositories/pantry.repo.ts
- src/db/repositories/cookbook.repo.ts
- src/db/repositories/plans.repo.ts
- src/db/repositories/active-offers.repo.ts
- src/planner/tools.ts + test
- src/planner/loop.ts + test
- src/planner/narrator.ts
- src/planner/index.ts
- src/planner/prompts.ts
- src/__tests__/__fixtures__/planner/synthetic-context.json
- scripts/seed-household.ts

## Files modified
- package.json (add `ai`, `@ai-sdk/anthropic`, `plan-week`, `seed:household` scripts)
- src/config.ts (add `aiGateway` block)
- src/index.ts (register `plan-week` command)
- .env.example (already has `AI_GATEWAY_API_KEY` — no change)

## End-state verification
1. `npm test` → ~135+ passing (125 baseline + 10 new from TDD tasks)
2. `npm exec tsc --noEmit` → clean
3. `npm run build` → only `/api/health` route (no regression)
4. CLI: `npm run seed:household` → prints UUID; second run is idempotent
5. CLI: `npm run plan-week` (with seeded household + ≥5 recipes in DB) → JSON with `meal_plan_id`, list of recipe IDs, total NOK, narration text; `meal_plans` row exists with `status='locked'` and non-null `ai_reasoning`
6. Mock-LM tests pass without any network call (no `AI_GATEWAY_API_KEY` required for `npm test`)
7. `git tag phase-1-w4a-complete`

## Rollback
```bash
git checkout main
git reset --hard phase-1-w3-complete
git branch -D phase-1/ai-planner
git tag -d phase-1-w4a-complete
```

## Deferred to later plans (do not implement here)
- Trumf adapter + per-user receipt fetcher → W4b
- Receipt reconciler (transactions → pantry/plan match) → W4b
- Real budget enforcement beyond `weeklyBudgetNok` cap → Plan E
- Vision pipeline (Gemini 3 Flash photo → ingredient inference) → Week 5
- Audit generator → Week 5
- Outbound email (the narration is generated, not sent) → Phase 2
- Vercel Workflow DevKit wrap (Phase 2 ops hardening)
- Real Sunday cron (Phase 2 — for now CLI-triggered)
- Multi-tenant RLS exercise (Phase 2 — Phase 1 uses service role)

---

## Task 1 — Install AI SDK + AI Gateway config

**Files:**
- Modify: `package.json`
- Modify: `src/config.ts`

- [ ] **Step 1: Install dependencies**

```bash
npm install ai @ai-sdk/anthropic
```

- [ ] **Step 2: Add `aiGateway` block to config.ts**

Open `src/config.ts`. After the `google` block (around line 14), add a sibling `aiGateway` block. Then update `validateConfig()` to require `AI_GATEWAY_API_KEY`.

```typescript
// in the `config` object, after the `google` block:
aiGateway: {
  apiKey: process.env.AI_GATEWAY_API_KEY || "",
  plannerModel: "anthropic/claude-sonnet-4.6",
  narratorModel: "anthropic/claude-haiku-4.5",
},
```

In `validateConfig()`, add:
```typescript
if (!config.aiGateway.apiKey) missing.push("AI_GATEWAY_API_KEY");
```

- [ ] **Step 3: Add npm scripts**

Edit `package.json` `scripts` block. Add:
```json
"plan-week": "tsx src/index.ts plan-week",
"seed:household": "tsx scripts/seed-household.ts"
```

- [ ] **Step 4: Verify**

```bash
npm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/config.ts
git commit -m "chore(phase-1-w4a): install AI SDK + add AI Gateway config block"
```

---

## Task 2 — Households repo

**Files:**
- Create: `src/db/repositories/households.repo.ts`

- [ ] **Step 1: Implement repo**

```typescript
import { getSupabase } from '../client';

export interface HouseholdRow {
  id: string;
  name: string;
  settings: Record<string, unknown>;
  created_at: string;
}

const DEFAULT_NAME = 'Default Household';

/**
 * Phase 1 helper. Auth lands in Phase 2; until then we operate on a single
 * shared household identified by name. Idempotent: returns the existing row
 * if one with this name already exists.
 */
export async function getOrCreateDefaultHousehold(): Promise<HouseholdRow> {
  const supabase = getSupabase();

  const existing = await supabase
    .from('households')
    .select('*')
    .eq('name', DEFAULT_NAME)
    .maybeSingle();
  if (existing.error) throw new Error(`getOrCreateDefaultHousehold (select): ${existing.error.message}`);
  if (existing.data) return existing.data as HouseholdRow;

  const created = await supabase
    .from('households')
    .insert({ name: DEFAULT_NAME, settings: {} })
    .select('*')
    .single();
  if (created.error || !created.data) {
    throw new Error(`getOrCreateDefaultHousehold (insert): ${created.error?.message ?? 'no row returned'}`);
  }
  return created.data as HouseholdRow;
}

export async function getHouseholdSettings(id: string): Promise<Record<string, unknown>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('households').select('settings').eq('id', id).single();
  if (error || !data) throw new Error(`getHouseholdSettings: ${error?.message ?? 'no row'}`);
  return (data.settings ?? {}) as Record<string, unknown>;
}
```

- [ ] **Step 2: Verify**

```bash
npm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/db/repositories/households.repo.ts
git commit -m "feat(phase-1-w4a): households repo with getOrCreateDefaultHousehold"
```

---

## Task 3 — Pantry repo

**Files:**
- Create: `src/db/repositories/pantry.repo.ts`

- [ ] **Step 1: Implement repo**

```typescript
import { getSupabase } from '../client';

export interface PantryItemRow {
  id: string;
  household_id: string;
  ean: string | null;
  product_name: string;
  canonical_ingredient_id: string | null;
  quantity_grams: number;
  confidence: number;
  last_seen_source: 'receipt' | 'photo' | 'manual';
  last_seen_at: string;
  expected_lifetime_days: number | null;
  decayed_at: string | null;
}

export interface PantrySummaryItem {
  canonicalName: string;   // product_name lowercased — Phase 1 proxy until canonical_ingredient_id resolution lands
  grams: number;
  confidence: number;
  lastSeenSource: 'receipt' | 'photo' | 'manual';
}

/**
 * Phase 1 returns rows as-is. W4b will populate the table from Trumf receipts;
 * before then this returns whatever is in the DB (typically empty).
 */
export async function getPantrySummary(householdId: string): Promise<PantrySummaryItem[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('pantry_items')
    .select('*')
    .eq('household_id', householdId);
  if (error) throw new Error(`getPantrySummary: ${error.message}`);
  return (data ?? []).map((row) => {
    const r = row as PantryItemRow;
    return {
      canonicalName: r.product_name.toLowerCase().trim(),
      grams: Number(r.quantity_grams),
      confidence: Number(r.confidence),
      lastSeenSource: r.last_seen_source,
    };
  });
}
```

- [ ] **Step 2: Verify**

```bash
npm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/db/repositories/pantry.repo.ts
git commit -m "feat(phase-1-w4a): pantry repo with empty-list-friendly summary query"
```

---

## Task 4 — Cookbook repo

**Files:**
- Create: `src/db/repositories/cookbook.repo.ts`

- [ ] **Step 1: Implement**

```typescript
import { getSupabase } from '../client';
import type { RecipeRow } from './recipes.repo';

export interface RecipeListItem {
  id: string;
  title: string;
  total_time_minutes: number | null;
  servings: number | null;
  source_url: string | null;
  origin: string;
  last_cooked_at: string | null;
  times_cooked: number;
}

/**
 * Returns recipes visible to a household: shared (household_id IS NULL) plus
 * the household's own recipes. Phase 1 imports always set household_id=NULL,
 * so this returns the global cookbook.
 */
export async function listEligibleRecipes(householdId: string, limit = 200): Promise<RecipeListItem[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('recipes')
    .select('id, title, total_time_minutes, servings, source_url, origin, last_cooked_at, times_cooked')
    .or(`household_id.is.null,household_id.eq.${householdId}`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listEligibleRecipes: ${error.message}`);
  return (data ?? []) as RecipeListItem[];
}

export interface RecipeDetailsLite {
  id: string;
  title: string;
  total_time_minutes: number | null;
  servings: number | null;
  source_url: string | null;
  ingredients: Array<{
    raw_text: string;
    quantity_grams: number | null;
    importance: 'critical' | 'enhancing' | 'garnish' | 'optional';
  }>;
}

export async function getRecipeDetailsLite(id: string): Promise<RecipeDetailsLite | null> {
  const supabase = getSupabase();
  const { data: recipe, error } = await supabase
    .from('recipes')
    .select('id, title, total_time_minutes, servings, source_url')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getRecipeDetailsLite: ${error.message}`);
  if (!recipe) return null;

  const { data: ingredients, error: ie } = await supabase
    .from('recipe_ingredients')
    .select('raw_text, quantity_grams, importance')
    .eq('recipe_id', id);
  if (ie) throw new Error(`getRecipeDetailsLite (ingredients): ${ie.message}`);

  return { ...(recipe as Omit<RecipeDetailsLite, 'ingredients'>), ingredients: (ingredients ?? []) as RecipeDetailsLite['ingredients'] };
}
```

- [ ] **Step 2: Verify**

```bash
npm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/db/repositories/cookbook.repo.ts
git commit -m "feat(phase-1-w4a): cookbook repo with listEligible + getRecipeDetailsLite"
```

---

## Task 5 — Plans repo

**Files:**
- Create: `src/db/repositories/plans.repo.ts`

- [ ] **Step 1: Implement**

```typescript
import { getSupabase } from '../client';

export interface MealPlanRow {
  id: string;
  household_id: string;
  week_start: string;
  status: 'draft' | 'locked' | 'completed';
  generated_at: string;
  locked_at: string | null;
  ai_reasoning: string | null;
}

export interface MealPlanItemRow {
  id: string;
  meal_plan_id: string;
  recipe_id: string;
  planned_for: string;
  meal_type: 'lunch' | 'dinner' | 'breakfast' | 'snack' | null;
  status: 'planned' | 'cooked' | 'skipped' | 'swapped';
  cooked_confirmed_via: string | null;
}

export interface DraftPlanInput {
  householdId: string;
  weekStart: string; // YYYY-MM-DD (Monday)
}

export async function createDraftMealPlan(input: DraftPlanInput): Promise<MealPlanRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('meal_plans')
    .upsert(
      { household_id: input.householdId, week_start: input.weekStart, status: 'draft' },
      { onConflict: 'household_id,week_start' }
    )
    .select('*')
    .single();
  if (error || !data) throw new Error(`createDraftMealPlan: ${error?.message ?? 'no row'}`);
  return data as MealPlanRow;
}

export interface PersistItemInput {
  recipeId: string;
  plannedFor: string; // YYYY-MM-DD
  mealType?: 'lunch' | 'dinner' | 'breakfast' | 'snack';
}

export async function persistMealPlanItems(
  mealPlanId: string,
  items: PersistItemInput[]
): Promise<MealPlanItemRow[]> {
  if (items.length === 0) return [];
  const supabase = getSupabase();

  // Replace any existing items for this plan (idempotent re-runs).
  const del = await supabase.from('meal_plan_items').delete().eq('meal_plan_id', mealPlanId);
  if (del.error) throw new Error(`persistMealPlanItems (clear): ${del.error.message}`);

  const rows = items.map((it) => ({
    meal_plan_id: mealPlanId,
    recipe_id: it.recipeId,
    planned_for: it.plannedFor,
    meal_type: it.mealType ?? 'dinner',
    status: 'planned' as const,
  }));
  const { data, error } = await supabase.from('meal_plan_items').insert(rows).select('*');
  if (error) throw new Error(`persistMealPlanItems (insert): ${error.message}`);
  return (data ?? []) as MealPlanItemRow[];
}

export async function lockMealPlan(mealPlanId: string, aiReasoning: string): Promise<MealPlanRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('meal_plans')
    .update({ status: 'locked', locked_at: new Date().toISOString(), ai_reasoning: aiReasoning })
    .eq('id', mealPlanId)
    .select('*')
    .single();
  if (error || !data) throw new Error(`lockMealPlan: ${error?.message ?? 'no row'}`);
  return data as MealPlanRow;
}

export async function getRecentCompletedMeals(
  householdId: string,
  weeksBack = 4
): Promise<Array<{ recipe_id: string; planned_for: string }>> {
  const supabase = getSupabase();
  const cutoff = new Date(Date.now() - weeksBack * 7 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('meal_plan_items')
    .select('recipe_id, planned_for, meal_plans!inner(household_id)')
    .eq('meal_plans.household_id', householdId)
    .eq('status', 'cooked')
    .gte('planned_for', cutoff);
  if (error) throw new Error(`getRecentCompletedMeals: ${error.message}`);
  return (data ?? []).map((r) => ({ recipe_id: r.recipe_id as string, planned_for: r.planned_for as string }));
}
```

- [ ] **Step 2: Verify**

```bash
npm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/db/repositories/plans.repo.ts
git commit -m "feat(phase-1-w4a): plans repo (draft/lock/items + recent completed query)"
```

---

## Task 6 — Active offers helper

**Files:**
- Create: `src/db/repositories/active-offers.repo.ts`

- [ ] **Step 1: Implement**

```typescript
import { getSupabase } from '../client';
import type { ChainCode } from '../../ingestion/adapter.interface';

export interface ActiveOffer {
  id: string;
  dealerCode: ChainCode;
  heading: string;
  description: string | null;
  price: number;
  prePrice: number | null;
  unit: string | null;
  runFrom: string | null;
  runTill: string | null;
  matchedProductId: string | null;
}

/**
 * Returns offers whose run window covers `at` (default: now), filtered to allowed chains.
 * Joins through dealers to expose the chain code directly.
 */
export async function listActiveOffersForChains(
  chains: ChainCode[],
  at: Date = new Date()
): Promise<ActiveOffer[]> {
  if (chains.length === 0) return [];
  const supabase = getSupabase();
  const iso = at.toISOString();
  const { data, error } = await supabase
    .from('offers')
    .select('id, heading, description, price, pre_price, unit, run_from, run_till, matched_product_id, dealers!inner(code)')
    .in('dealers.code', chains)
    .or(`run_from.is.null,run_from.lte.${iso}`)
    .or(`run_till.is.null,run_till.gte.${iso}`);
  if (error) throw new Error(`listActiveOffersForChains: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    dealerCode: row.dealers.code as ChainCode,
    heading: row.heading,
    description: row.description,
    price: Number(row.price),
    prePrice: row.pre_price !== null ? Number(row.pre_price) : null,
    unit: row.unit,
    runFrom: row.run_from,
    runTill: row.run_till,
    matchedProductId: row.matched_product_id,
  }));
}
```

- [ ] **Step 2: Verify**

```bash
npm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/db/repositories/active-offers.repo.ts
git commit -m "feat(phase-1-w4a): active-offers repo (chain-filtered, time-windowed)"
```

---

## Task 7 — Planner tools factory (TDD)

**Files:**
- Create: `src/planner/prompts.ts`
- Create: `src/planner/tools.ts`
- Create: `src/__tests__/planner-tools.test.ts`

The tool factory takes pre-loaded context (recipes, pantry, offers, history, preferences) and returns an AI SDK `tools` object whose `execute` functions read from that context. The optimizer-related tools (`cost_recipe`, `cost_plan`) call into the existing `computePlanCost` deterministically.

- [ ] **Step 1: Write the test (failing)**

```typescript
// src/__tests__/planner-tools.test.ts
import { describe, it, expect } from 'vitest';
import { createPlannerTools, type PlannerContext } from '../planner/tools';
import type { RecipeWithIngredients } from '../db/repositories/recipes.repo';

function fakeRecipe(id: string, title: string, grams: number): RecipeWithIngredients {
  return {
    recipe: {
      id, household_id: null, title, source_url: null, hero_image_url: null,
      total_time_minutes: 30, servings: 4, instructions: ['cook'],
      origin: 'imported_url', created_at: '2026-04-01T00:00:00Z',
      last_cooked_at: null, times_cooked: 0,
    },
    ingredients: [
      { id: 'i1', recipe_id: id, raw_text: '200 g kokosmelk', quantity_grams: grams,
        unit_original: 'g', canonical_ingredient_id: null, importance: 'critical', substitutes: [] },
    ],
  };
}

function buildCtx(): PlannerContext {
  return {
    householdId: 'hh-1',
    weekStart: '2026-04-27',
    recipeCount: 5,
    weeklyBudgetNok: 1500,
    allowedChains: ['MENY', 'KIWI'],
    preferences: { spicePreference: 5, dislikes: [] },
    pantry: [],
    activeOffers: [],
    recentHistory: [],
    eligibleRecipes: new Map([
      ['r1', fakeRecipe('r1', 'Tom Kha', 200)],
      ['r2', fakeRecipe('r2', 'Pad Thai', 100)],
    ]),
    productCandidates: new Map([
      ['kokosmelk', [
        { ingredientName: 'kokosmelk', productId: 'p1', name: 'Kokosmelk MENY', chainCode: 'MENY' as const, price: 25, productUrl: 'https://meny.no/x' },
        { ingredientName: 'kokosmelk', productId: 'p2', name: 'Kokosmelk Kiwi',  chainCode: 'KIWI' as const, price: 22, productUrl: 'https://kiwi.no/x' },
      ]],
    ]),
  };
}

describe('createPlannerTools', () => {
  it('list_eligible_recipes returns title + id from context', async () => {
    const ctx = buildCtx();
    const tools = createPlannerTools(ctx);
    const res = await tools.list_eligible_recipes.execute!({}, { toolCallId: 't', messages: [] } as any);
    expect(res).toEqual([
      { id: 'r1', title: 'Tom Kha', totalTimeMinutes: 30, servings: 4 },
      { id: 'r2', title: 'Pad Thai', totalTimeMinutes: 30, servings: 4 },
    ]);
  });

  it('cost_plan returns deterministic PlanCost for given recipes', async () => {
    const ctx = buildCtx();
    const tools = createPlannerTools(ctx);
    const res = await tools.cost_plan.execute!(
      { items: [{ recipeId: 'r1', servings: 4 }] },
      { toolCallId: 't', messages: [] } as any
    );
    expect(res.feasible).toBe(true);
    // Picks Kiwi (22) for 200g kokosmelk.
    expect(res.totalNok).toBeCloseTo(22, 5);
    expect(res.storeBreakdown).toHaveLength(1);
    expect(res.storeBreakdown[0].dealer).toBe('KIWI');
  });

  it('cost_plan flags infeasible when total exceeds budget', async () => {
    const ctx = buildCtx();
    ctx.weeklyBudgetNok = 10;
    const tools = createPlannerTools(ctx);
    const res = await tools.cost_plan.execute!(
      { items: [{ recipeId: 'r1', servings: 4 }] },
      { toolCallId: 't', messages: [] } as any
    );
    expect(res.feasible).toBe(false);
    expect(res.reason).toContain('budget');
  });

  it('finalize_plan stores args in the captured slot', async () => {
    const ctx = buildCtx();
    const captured = { value: null as null | { recipeIds: string[]; servings: number[]; reasoning: string } };
    const tools = createPlannerTools(ctx, captured);
    const res = await tools.finalize_plan.execute!(
      { recipeIds: ['r1', 'r2'], servings: [4, 2], reasoning: 'tasty week' },
      { toolCallId: 't', messages: [] } as any
    );
    expect(res).toEqual({ ok: true });
    expect(captured.value).toEqual({ recipeIds: ['r1', 'r2'], servings: [4, 2], reasoning: 'tasty week' });
  });

  it('get_pantry_summary returns the empty array from context', async () => {
    const ctx = buildCtx();
    const tools = createPlannerTools(ctx);
    const res = await tools.get_pantry_summary.execute!({}, { toolCallId: 't', messages: [] } as any);
    expect(res).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test — should fail**

```bash
npx vitest run src/__tests__/planner-tools.test.ts
```
Expected: FAIL (module not found).

- [ ] **Step 3: Create prompts module**

```typescript
// src/planner/prompts.ts
export const PLANNER_SYSTEM_PROMPT = `You are the household meal planner for the Foodie grocery-planning service.

Your job: propose a weekly plan of N dinner recipes selected from the household's eligible recipe list, then validate it stays within their weekly budget by calling cost_plan. If infeasible, revise (swap recipes, drop one) and re-validate. After at most 3 revisions, you MUST call finalize_plan with your chosen recipe IDs, servings per recipe, and a one-paragraph rationale.

Constraints:
- Use list_eligible_recipes first to see what's available.
- Use get_active_offers to bias recipe choice toward this week's discounts.
- Use get_pantry_summary to favour recipes that draw on existing stock.
- Use get_recent_history to avoid repeats from the last 4 weeks.
- Use get_household_preferences for taste profile + allergens.
- Default servings per recipe = 4 unless the user has fewer/more diners in preferences.
- After cost_plan returns feasible:true, call finalize_plan immediately. Do not call further tools.

Tool-call budget: max 3 cost_plan calls (one initial + two revisions). Then finalize.`;

export function buildUserPrompt(args: { weekStart: string; recipeCount: number; weeklyBudgetNok: number }): string {
  return `Plan ${args.recipeCount} dinner recipes for the week starting ${args.weekStart}. Weekly food budget: ${args.weeklyBudgetNok} NOK.`;
}
```

- [ ] **Step 4: Implement tools.ts (minimal — make the tests pass)**

```typescript
// src/planner/tools.ts
import { tool } from 'ai';
import { z } from 'zod';
import type { ChainCode } from '../ingestion/adapter.interface';
import type { RecipeWithIngredients } from '../db/repositories/recipes.repo';
import type { ProductCandidate } from '../optimizer/ingredient-resolver';
import type { PantrySummaryItem } from '../db/repositories/pantry.repo';
import type { ActiveOffer } from '../db/repositories/active-offers.repo';
import { computePlanCost } from '../optimizer/optimizer';

export interface HouseholdPreferences {
  spicePreference?: number;
  dislikes?: string[];
  diet?: string[];
  allergies?: string[];
  diners?: number;
}

export interface CompletedMealRef {
  recipe_id: string;
  planned_for: string;
}

export interface PlannerContext {
  householdId: string;
  weekStart: string; // YYYY-MM-DD (Monday)
  recipeCount: number;
  weeklyBudgetNok: number;
  allowedChains: ChainCode[];
  preferences: HouseholdPreferences;
  pantry: PantrySummaryItem[];
  activeOffers: ActiveOffer[];
  recentHistory: CompletedMealRef[];
  eligibleRecipes: Map<string, RecipeWithIngredients>;
  productCandidates: Map<string, ProductCandidate[]>;
}

export interface FinalizeSlot {
  value: { recipeIds: string[]; servings: number[]; reasoning: string } | null;
}

export function createPlannerTools(ctx: PlannerContext, finalize: FinalizeSlot = { value: null }) {
  return {
    list_eligible_recipes: tool({
      description: 'List recipe IDs + titles available to this household.',
      inputSchema: z.object({}).strict(),
      execute: async () => {
        return Array.from(ctx.eligibleRecipes.values()).map((r) => ({
          id: r.recipe.id,
          title: r.recipe.title,
          totalTimeMinutes: r.recipe.total_time_minutes,
          servings: r.recipe.servings,
        }));
      },
    }),
    get_recipe_details: tool({
      description: 'Fetch ingredients + cook time for a recipe by id.',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const r = ctx.eligibleRecipes.get(id);
        if (!r) return { error: `recipe ${id} not in eligible set` };
        return {
          id: r.recipe.id,
          title: r.recipe.title,
          totalTimeMinutes: r.recipe.total_time_minutes,
          servings: r.recipe.servings,
          ingredients: r.ingredients.map((i) => ({
            raw: i.raw_text,
            grams: i.quantity_grams,
            importance: i.importance,
          })),
        };
      },
    }),
    cost_recipe: tool({
      description: 'Compute deterministic cost for a single recipe at the given servings.',
      inputSchema: z.object({ recipeId: z.string(), servings: z.number().int().positive() }),
      execute: async ({ recipeId, servings }) => {
        return computePlanCost({
          mealPlan: [{ recipeId, servings }],
          recipes: ctx.eligibleRecipes,
          pantry: ctx.pantry.map((p) => ({ canonicalName: p.canonicalName, grams: p.grams, confidence: p.confidence })),
          productCandidatesPerIngredient: ctx.productCandidates,
          householdContext: {
            allowedChains: ctx.allowedChains,
            weeklyBudgetNok: ctx.weeklyBudgetNok,
            storeStopPenaltyNok: 10,
          },
        });
      },
    }),
    cost_plan: tool({
      description: 'Compute deterministic cost for a multi-recipe plan. Returns feasible:false if it busts the weekly budget.',
      inputSchema: z.object({
        items: z.array(z.object({ recipeId: z.string(), servings: z.number().int().positive() })),
      }),
      execute: async ({ items }) => {
        return computePlanCost({
          mealPlan: items,
          recipes: ctx.eligibleRecipes,
          pantry: ctx.pantry.map((p) => ({ canonicalName: p.canonicalName, grams: p.grams, confidence: p.confidence })),
          productCandidatesPerIngredient: ctx.productCandidates,
          householdContext: {
            allowedChains: ctx.allowedChains,
            weeklyBudgetNok: ctx.weeklyBudgetNok,
            storeStopPenaltyNok: 10,
          },
        });
      },
    }),
    get_pantry_summary: tool({
      description: 'List pantry items currently in stock (canonical name + grams + confidence).',
      inputSchema: z.object({}).strict(),
      execute: async () => ctx.pantry,
    }),
    get_active_offers: tool({
      description: 'List currently-active offers across the household chain scope.',
      inputSchema: z.object({}).strict(),
      execute: async () => ctx.activeOffers,
    }),
    get_household_preferences: tool({
      description: 'Household taste profile, dislikes, allergies, diner count.',
      inputSchema: z.object({}).strict(),
      execute: async () => ctx.preferences,
    }),
    get_recent_history: tool({
      description: 'Recipes the household has cooked in the last 4 weeks (avoid repeats).',
      inputSchema: z.object({}).strict(),
      execute: async () => ctx.recentHistory,
    }),
    finalize_plan: tool({
      description: 'Lock in the chosen recipes for this week. Call this exactly once at the end.',
      inputSchema: z.object({
        recipeIds: z.array(z.string()).min(1),
        servings: z.array(z.number().int().positive()).min(1),
        reasoning: z.string(),
      }),
      execute: async ({ recipeIds, servings, reasoning }) => {
        finalize.value = { recipeIds, servings, reasoning };
        return { ok: true };
      },
    }),
  };
}
```

- [ ] **Step 5: Run tests — should pass**

```bash
npx vitest run src/__tests__/planner-tools.test.ts
```
Expected: 5 passing.

- [ ] **Step 6: Commit**

```bash
git add src/planner/tools.ts src/planner/prompts.ts src/__tests__/planner-tools.test.ts
git commit -m "feat(phase-1-w4a): planner tools factory (TDD, 5 tests)"
```

---

## Task 8 — Planner loop with mock-LM test

**Files:**
- Create: `src/planner/loop.ts`
- Create: `src/__tests__/planner-loop.test.ts`

The loop calls AI SDK `generateText` with the tools from Task 7. For testing we pass a `MockLanguageModelV2` that scripts a tool-call sequence. For real runs we pass the AI Gateway `anthropic/claude-sonnet-4.6` model string.

- [ ] **Step 1: Write the test (failing)**

```typescript
// src/__tests__/planner-loop.test.ts
import { describe, it, expect } from 'vitest';
import { MockLanguageModelV2 } from 'ai/test';
import { simulateReadableStream } from 'ai';
import { runPlannerLoop } from '../planner/loop';
import type { PlannerContext } from '../planner/tools';
import type { RecipeWithIngredients } from '../db/repositories/recipes.repo';

function fakeRecipe(id: string, title: string): RecipeWithIngredients {
  return {
    recipe: {
      id, household_id: null, title, source_url: null, hero_image_url: null,
      total_time_minutes: 30, servings: 4, instructions: ['cook'],
      origin: 'imported_url', created_at: '2026-04-01T00:00:00Z',
      last_cooked_at: null, times_cooked: 0,
    },
    ingredients: [
      { id: 'i1', recipe_id: id, raw_text: '200 g kokosmelk', quantity_grams: 200,
        unit_original: 'g', canonical_ingredient_id: null, importance: 'critical', substitutes: [] },
    ],
  };
}

function buildCtx(): PlannerContext {
  return {
    householdId: 'hh-1',
    weekStart: '2026-04-27',
    recipeCount: 2,
    weeklyBudgetNok: 1500,
    allowedChains: ['KIWI'],
    preferences: { diners: 4 },
    pantry: [],
    activeOffers: [],
    recentHistory: [],
    eligibleRecipes: new Map([['r1', fakeRecipe('r1', 'Tom Kha')], ['r2', fakeRecipe('r2', 'Pad Thai')]]),
    productCandidates: new Map([
      ['kokosmelk', [{ ingredientName: 'kokosmelk', productId: 'p1', name: 'Kokosmelk Kiwi', chainCode: 'KIWI', price: 22, productUrl: null }]],
    ]),
  };
}

describe('runPlannerLoop', () => {
  it('captures finalize_plan args and returns them', async () => {
    const ctx = buildCtx();
    let step = 0;
    const model = new MockLanguageModelV2({
      doGenerate: async () => {
        step++;
        if (step === 1) {
          // First call: ask for eligible recipes
          return {
            content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'list_eligible_recipes', input: {} }],
            finishReason: 'tool-calls',
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            warnings: [],
          };
        }
        if (step === 2) {
          // Second call: cost the plan
          return {
            content: [{
              type: 'tool-call', toolCallId: 'c2', toolName: 'cost_plan',
              input: { items: [{ recipeId: 'r1', servings: 4 }, { recipeId: 'r2', servings: 4 }] },
            }],
            finishReason: 'tool-calls',
            usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
            warnings: [],
          };
        }
        // Third call: finalize
        return {
          content: [{
            type: 'tool-call', toolCallId: 'c3', toolName: 'finalize_plan',
            input: { recipeIds: ['r1', 'r2'], servings: [4, 4], reasoning: 'balanced week' },
          }],
          finishReason: 'tool-calls',
          usage: { inputTokens: 30, outputTokens: 15, totalTokens: 45 },
          warnings: [],
        };
      },
    });

    const out = await runPlannerLoop(ctx, { model });
    expect(out.recipeIds).toEqual(['r1', 'r2']);
    expect(out.servings).toEqual([4, 4]);
    expect(out.reasoning).toBe('balanced week');
  });

  it('throws when finalize_plan is never called', async () => {
    const ctx = buildCtx();
    const model = new MockLanguageModelV2({
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'I refuse.' }],
        finishReason: 'stop',
        usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
        warnings: [],
      }),
    });
    await expect(runPlannerLoop(ctx, { model })).rejects.toThrow(/did not finalize/);
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
npx vitest run src/__tests__/planner-loop.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement loop.ts**

```typescript
// src/planner/loop.ts
import { generateText, stepCountIs, type LanguageModel } from 'ai';
import { createPlannerTools, type PlannerContext, type FinalizeSlot } from './tools';
import { PLANNER_SYSTEM_PROMPT, buildUserPrompt } from './prompts';
import { config } from '../config';

export interface PlannerOutcome {
  recipeIds: string[];
  servings: number[];
  reasoning: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface RunPlannerOptions {
  /** Override model (used by tests). Defaults to AI Gateway Sonnet. */
  model?: LanguageModel;
  /** Step budget. Defaults to 8 (≈ 1 list + 1 history + 3 cost_plan revisions + 1 finalize + slack). */
  maxSteps?: number;
}

export async function runPlannerLoop(
  ctx: PlannerContext,
  opts: RunPlannerOptions = {}
): Promise<PlannerOutcome> {
  const finalize: FinalizeSlot = { value: null };
  const tools = createPlannerTools(ctx, finalize);

  const result = await generateText({
    model: opts.model ?? (config.aiGateway.plannerModel as unknown as LanguageModel),
    system: PLANNER_SYSTEM_PROMPT,
    prompt: buildUserPrompt({
      weekStart: ctx.weekStart,
      recipeCount: ctx.recipeCount,
      weeklyBudgetNok: ctx.weeklyBudgetNok,
    }),
    tools,
    stopWhen: stepCountIs(opts.maxSteps ?? 8),
  });

  if (!finalize.value) {
    throw new Error(
      `planner did not finalize within step budget. finishReason=${result.finishReason} steps=${result.steps?.length ?? 0}`
    );
  }

  if (finalize.value.recipeIds.length !== finalize.value.servings.length) {
    throw new Error('finalize_plan: recipeIds and servings length mismatch');
  }

  return {
    recipeIds: finalize.value.recipeIds,
    servings: finalize.value.servings,
    reasoning: finalize.value.reasoning,
    usage: {
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
    },
  };
}
```

- [ ] **Step 4: Run — should pass**

```bash
npx vitest run src/__tests__/planner-loop.test.ts
```
Expected: 2 passing.

If `MockLanguageModelV2` import path or signature differs in the installed `ai` version, run `npm ls ai` and inspect `node_modules/ai/test`. Adjust import / payload shape (the AI SDK test exports occasionally rename between minor versions). Acceptance: both test cases pass with whatever the current SDK requires.

- [ ] **Step 5: Commit**

```bash
git add src/planner/loop.ts src/__tests__/planner-loop.test.ts
git commit -m "feat(phase-1-w4a): planner loop with mock-LM TDD"
```

---

## Task 9 — Narrator (Haiku 4.5)

**Files:**
- Create: `src/planner/narrator.ts`

- [ ] **Step 1: Implement**

```typescript
// src/planner/narrator.ts
import { generateText, type LanguageModel } from 'ai';
import { config } from '../config';
import type { PlanCost } from '../optimizer/types';
import type { RecipeWithIngredients } from '../db/repositories/recipes.repo';

const NARRATOR_SYSTEM = `You are the friendly household chef writing the weekly plan email for a Norwegian family.
Write 2–3 short paragraphs in plain Norwegian (or English if the input is English) explaining: which dishes are coming up, what they'll cost in total, the Trumf bonus they'll earn, and 1–2 specific reasons this week's selection makes sense (e.g. "X is on offer at Kiwi", "Y is a household favourite", "we have Z in the pantry already"). Use the actual numbers from the data. Do not invent any savings or offers. Tone: warm, informed, never salesy. No emojis.`;

export interface NarratorInput {
  recipes: RecipeWithIngredients[];
  cost: PlanCost;
  plannerReasoning: string;
}

export async function narratePlan(
  input: NarratorInput,
  opts: { model?: LanguageModel } = {}
): Promise<string> {
  const recipeList = input.recipes
    .map((r) => `- ${r.recipe.title} (${r.recipe.total_time_minutes ?? '?'} min, serves ${r.recipe.servings ?? 4})`)
    .join('\n');
  const breakdown = input.cost.storeBreakdown
    .map((b) => `  • ${b.dealer}: ${b.subtotal.toFixed(0)} NOK (Trumf ${b.trumfEarned.toFixed(0)})`)
    .join('\n');

  const prompt = [
    `Recipes for the week:\n${recipeList}`,
    `Total: ${input.cost.totalNok.toFixed(0)} NOK`,
    `Estimated Trumf bonus: ${input.cost.trumfEstimateNok.toFixed(0)} NOK`,
    `Pantry savings: ${input.cost.pantrySavingsNok.toFixed(0)} NOK`,
    `Stops: ${input.cost.storeStops}`,
    breakdown ? `Per store:\n${breakdown}` : '',
    `Planner notes: ${input.plannerReasoning}`,
  ].filter(Boolean).join('\n\n');

  const { text } = await generateText({
    model: opts.model ?? (config.aiGateway.narratorModel as unknown as LanguageModel),
    system: NARRATOR_SYSTEM,
    prompt,
  });
  return text.trim();
}
```

- [ ] **Step 2: Verify**

```bash
npm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/planner/narrator.ts
git commit -m "feat(phase-1-w4a): narrator (Haiku 4.5 plain-language plan summary)"
```

---

## Task 10 — CLI: plan-week + seed:household

**Files:**
- Create: `src/planner/index.ts`
- Create: `scripts/seed-household.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Public entrypoint**

```typescript
// src/planner/index.ts
import { runPlannerLoop } from './loop';
import { narratePlan } from './narrator';
import type { PlannerContext } from './tools';
import { listEligibleRecipes, getRecipeDetailsLite } from '../db/repositories/cookbook.repo';
import { getRecipe, type RecipeWithIngredients } from '../db/repositories/recipes.repo';
import { getPantrySummary } from '../db/repositories/pantry.repo';
import { listActiveOffersForChains } from '../db/repositories/active-offers.repo';
import { createDraftMealPlan, persistMealPlanItems, lockMealPlan, getRecentCompletedMeals } from '../db/repositories/plans.repo';
import { resolveIngredients } from '../optimizer/ingredient-resolver';
import { getHouseholdSettings } from '../db/repositories/households.repo';
import type { ChainCode } from '../ingestion/adapter.interface';
import type { HouseholdPreferences } from './tools';

export interface PlanWeekArgs {
  householdId: string;
  weekStart: string; // YYYY-MM-DD (Monday)
  recipeCount?: number;
  weeklyBudgetNok?: number;
  allowedChains?: ChainCode[];
}

export interface PlanWeekResult {
  mealPlanId: string;
  recipeIds: string[];
  servings: number[];
  totalNok: number;
  trumfEstimateNok: number;
  narration: string;
  warnings: string[];
}

export async function planWeek(args: PlanWeekArgs): Promise<PlanWeekResult> {
  const recipeCount = args.recipeCount ?? 5;
  const weeklyBudgetNok = args.weeklyBudgetNok ?? 1500;
  const allowedChains: ChainCode[] = args.allowedChains ?? ['MENY', 'KIWI', 'AFOOD'];

  // 1. Load context.
  const settings = await getHouseholdSettings(args.householdId);
  const preferences: HouseholdPreferences = (settings.preferences ?? {}) as HouseholdPreferences;
  const pantry = await getPantrySummary(args.householdId);
  const activeOffers = await listActiveOffersForChains(allowedChains);
  const recentHistory = await getRecentCompletedMeals(args.householdId, 4);

  const recipeList = await listEligibleRecipes(args.householdId);
  if (recipeList.length < recipeCount) {
    throw new Error(`only ${recipeList.length} eligible recipes; need at least ${recipeCount}. Import more via recipe-import first.`);
  }
  // Cap to a reasonable working set so prompt stays small.
  const workingSet = recipeList.slice(0, 30);
  const eligibleRecipes = new Map<string, RecipeWithIngredients>();
  for (const r of workingSet) {
    const full = await getRecipe(r.id);
    if (full) eligibleRecipes.set(r.id, full);
  }

  // 2. Resolve product candidates for the union of all ingredient names.
  const allIngredientNames = new Set<string>();
  for (const r of eligibleRecipes.values()) {
    for (const ing of r.ingredients) {
      if (typeof ing.quantity_grams === 'number' && ing.quantity_grams > 0) {
        allIngredientNames.add(ing.raw_text.replace(/^\s*\d+(?:[.,/]\d+)?\s*\S*\s*/, '').trim().toLowerCase());
      }
    }
  }
  const productCandidates = await resolveIngredients(Array.from(allIngredientNames), { chains: allowedChains });

  const ctx: PlannerContext = {
    householdId: args.householdId,
    weekStart: args.weekStart,
    recipeCount,
    weeklyBudgetNok,
    allowedChains,
    preferences,
    pantry,
    activeOffers,
    recentHistory,
    eligibleRecipes,
    productCandidates,
  };

  // 3. Planner loop.
  const outcome = await runPlannerLoop(ctx);

  // 4. Compute final cost (deterministic) for narration + persistence.
  const { computePlanCost } = await import('../optimizer/optimizer');
  const cost = computePlanCost({
    mealPlan: outcome.recipeIds.map((id, i) => ({ recipeId: id, servings: outcome.servings[i] })),
    recipes: eligibleRecipes,
    pantry: pantry.map((p) => ({ canonicalName: p.canonicalName, grams: p.grams, confidence: p.confidence })),
    productCandidatesPerIngredient: productCandidates,
    householdContext: { allowedChains, weeklyBudgetNok, storeStopPenaltyNok: 10 },
  });

  // 5. Persist.
  const draft = await createDraftMealPlan({ householdId: args.householdId, weekStart: args.weekStart });
  const startDate = new Date(`${args.weekStart}T00:00:00Z`);
  const items = outcome.recipeIds.map((id, i) => ({
    recipeId: id,
    plannedFor: new Date(startDate.getTime() + i * 86_400_000).toISOString().slice(0, 10),
    mealType: 'dinner' as const,
  }));
  await persistMealPlanItems(draft.id, items);

  // 6. Narration.
  const narration = await narratePlan({
    recipes: outcome.recipeIds.map((id) => eligibleRecipes.get(id)!).filter(Boolean),
    cost,
    plannerReasoning: outcome.reasoning,
  });

  await lockMealPlan(draft.id, narration);

  return {
    mealPlanId: draft.id,
    recipeIds: outcome.recipeIds,
    servings: outcome.servings,
    totalNok: cost.totalNok,
    trumfEstimateNok: cost.trumfEstimateNok,
    narration,
    warnings: cost.warnings,
  };
}
```

- [ ] **Step 2: seed-household script**

```typescript
// scripts/seed-household.ts
import 'dotenv/config';
import { getOrCreateDefaultHousehold } from '../src/db/repositories/households.repo';

(async () => {
  const hh = await getOrCreateDefaultHousehold();
  console.log(JSON.stringify({ id: hh.id, name: hh.name, created_at: hh.created_at }, null, 2));
})().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
```

- [ ] **Step 3: Wire CLI command**

In `src/index.ts`:
1. After the existing imports, add:
   ```typescript
   import { planWeek } from './planner';
   import { getOrCreateDefaultHousehold } from './db/repositories/households.repo';
   ```
2. In the `switch (command)` block, add a new case:
   ```typescript
   case "plan-week":
     await handlePlanWeek(args);
     break;
   ```
3. Add the handler at the bottom of the file (before `parseFlag`):
   ```typescript
   async function handlePlanWeek(args: string[]) {
     const recipeCount = parseFlagNum(args, '--recipes', 5);
     const weeklyBudgetNok = parseFlagNum(args, '--budget', 1500);
     const chainsRaw = parseFlagStr(args, '--chains', 'MENY,KIWI,AFOOD');
     const allowedChains = chainsRaw.split(',').map((c) => c.trim().toUpperCase()) as ChainCode[];
     const weekStartFlag = parseFlagStr(args, '--week-start', '');
     const weekStart = weekStartFlag || nextMondayIsoDate();

     const hh = await getOrCreateDefaultHousehold();
     console.log(`[plan-week] household=${hh.id} weekStart=${weekStart} recipes=${recipeCount} budget=${weeklyBudgetNok} chains=${allowedChains.join(',')}`);
     const result = await planWeek({ householdId: hh.id, weekStart, recipeCount, weeklyBudgetNok, allowedChains });
     console.log(JSON.stringify(result, null, 2));
   }

   function nextMondayIsoDate(): string {
     const d = new Date();
     const day = d.getUTCDay();           // 0=Sun .. 6=Sat
     const offset = ((1 - day) + 7) % 7;  // days until next Monday (0 if today *is* Monday)
     const target = new Date(d.getTime() + (offset || 7) * 86_400_000);
     return target.toISOString().slice(0, 10);
   }
   ```

- [ ] **Step 4: Compile**

```bash
npm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 5: Verify seed:household idempotency**

```bash
npm run seed:household
npm run seed:household
```
Expected: both runs print the same `id`. (Skip if SUPABASE creds not set locally — note the skip in the commit message.)

- [ ] **Step 6: Commit**

```bash
git add src/planner/index.ts scripts/seed-household.ts src/index.ts
git commit -m "feat(phase-1-w4a): CLI plan-week + seed:household script"
```

---

## Task 11 — Final verify + tag

- [ ] **Step 1: Full type check**

```bash
npm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 2: All tests**

```bash
npm test
```
Expected: ~135+ passing, 0 failing. Old tests untouched.

- [ ] **Step 3: Build**

```bash
npm run build
```
Expected: still only `/api/health` route.

- [ ] **Step 4: End-to-end smoke (optional, requires `AI_GATEWAY_API_KEY` + ≥5 recipes in DB)**

```bash
npm run plan-week -- --recipes 5 --budget 1500
```
Expected: JSON with `mealPlanId`, `recipeIds` length 5, `narration` non-empty. A `meal_plans` row exists with `status='locked'`. If creds aren't configured, log "skipped end-to-end smoke — no AI_GATEWAY_API_KEY" and proceed.

- [ ] **Step 5: Tag**

```bash
git tag phase-1-w4a-complete
```

- [ ] **Step 6: Commit + summary**

If any incidental fixes needed during verify, commit them as `chore(phase-1-w4a): final verify cleanup`. Then write a summary commit:

```bash
git commit --allow-empty -m "Phase 1 Week 4a: AI planner loop complete"
```

---

## Self-review checklist (run at end of writing this plan)

- Spec coverage: §8.2 planner — Tasks 7-8. §8.7 narrator — Task 9. §6.2 plans persistence — Task 5. §13 Week 4 (planner half) — Tasks 1-11. Trumf + receipt reconciler explicitly deferred to W4b — covered in "Deferred to later plans".
- Placeholders: none. All step bodies contain runnable code or exact commands.
- Type consistency: `PlannerContext`, `FinalizeSlot`, `PlannerOutcome`, `PlanCost`, `RecipeWithIngredients`, `ProductCandidate`, `ChainCode` referenced consistently across Tasks 7-10. `cost_plan` accepts `{items: [{recipeId, servings}]}` everywhere it appears.
- Tools have `inputSchema` (AI SDK 5 naming) — confirmed present on all 9 tool definitions.
- Mock LM test (Task 8) uses content blocks with `type: 'tool-call'` shape that AI SDK 5 expects.
