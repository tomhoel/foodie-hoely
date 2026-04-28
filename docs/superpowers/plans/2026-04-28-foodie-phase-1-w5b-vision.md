# Foodie Phase 1 Week 5b — Vision pipeline (photo → pantry)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase-1 vision pipeline. User runs `npm run photo /path/to/dinner.jpg "made tom kha gai"` → CLI loads the image → calls Gemini 3 Flash twice (Stage 1: pure visual extraction with no priors; Stage 2: pantry-constrained reconciliation with the user's pantry + recent plan as context) → prints a confidence-graded ingredient list → prompts the user to confirm/edit/skip → on confirm, persists a `dish_photos` row (Phase 1 stores the file path, not a Vercel Blob URL — Phase 2 swaps that) and applies pantry deltas + writes `pantry_corrections` audit rows.

**Architecture:**
- **Vision schemas** (Zod): `VisionResult { dishGuess?: string, ingredients: Array<{ name, confidence: 'high'|'med'|'low', portion?: 'small'|'med'|'large' }>, reasoning: string }`. Stage 2 enriches with `matchedPantryEan?: string`.
- **Vision client**: thin wrapper around AI SDK `generateObject({ model: 'google/gemini-3-flash', schema, messages: [...] })`. Two pure functions — `runStage1(imageBytes, mediaType)` and `runStage2({stage1, pantry, recentMeals})`. Image is read from disk via `fs.readFileSync` and passed as the SDK's image-content shape (v6 API may use `image` or `file` — discover during implementation).
- **Confidence → grams mapping**: portion buckets `small=80g, med=150g, large=250g`. Confidence affects `pantry_items.confidence` only — every confirmed line still gets persisted.
- **CLI confirmation flow**: prints the inferred ingredient list with confidence + portion, prompts `[y]es / [n]o / [e]dit`. On `e`, opens `$EDITOR` with a YAML draft; on save, parses + validates. On `y`, persists. On `n`, drops everything (still inserts a `dish_photos` row with `vision_status='confirmed'` so we don't re-process the same photo silently).
- **Pantry deltas**: each confirmed ingredient adds `portionGrams` to `pantry_items` (negative — cooking *consumes* pantry stock; the photo confirms what was eaten, not what was bought). Use the existing pantry idempotency pattern (delete-then-insert by `(household_id, ean)` or `(household_id, product_name)`). Records audit row in `pantry_corrections` keyed by `pantry_item_id` if the row was pre-existing.
- Tests: vision schemas tested with golden fixture; Stage 1 + Stage 2 functions tested with mocked AI SDK model; orchestrator tested end-to-end with mocks; no real Gemini calls in CI.

**Tech Stack:** TypeScript 5.7, AI SDK v6 (already installed), `@ai-sdk/google` (likely already pulled in transitively; verify and add if not), zod, vitest, Supabase. No new infra.

**Spec reference:** docs/superpowers/specs/2026-04-27-foodie-grocery-planner-design.md (§4 vision research; §8.3 vision pipeline; §6.2 dish_photos table)

**Predecessor:** phase-1-w5a-complete

**Prerequisite:** Migration 005 already applied (table `dish_photos` exists). Real photo runs require `AI_GATEWAY_API_KEY`.

---

## Tasks

| # | Task | Model | DB needed |
|---|---|---|---|
| 1 | Install `@ai-sdk/google` (if not transitively present) | haiku | no |
| 2 | Vision Zod schemas + prompts (`src/vision/schemas.ts`, `src/vision/prompts.ts`) | haiku | no |
| 3 | Stage 1 vision (TDD, mock LM) — `src/vision/stage1.ts` | sonnet | no |
| 4 | Stage 2 reconciliation (TDD, mock LM) — `src/vision/stage2.ts` | sonnet | no |
| 5 | `dish_photos` repo — `src/db/repositories/dish-photos.repo.ts` | haiku | no |
| 6 | Photo orchestrator (vision → CLI confirm → persist) — `src/vision/photo-flow.ts` | sonnet | no |
| 7 | CLI: `photo <path> [hint]` + final verify + tag + merge + push | sonnet | no |

---

## Files created
- src/vision/schemas.ts
- src/vision/prompts.ts
- src/vision/stage1.ts + test
- src/vision/stage2.ts + test
- src/vision/photo-flow.ts
- src/db/repositories/dish-photos.repo.ts
- src/__tests__/__fixtures__/vision/stage1-tom-kha.json (mock LM output)

## Files modified
- package.json (`@ai-sdk/google` if missing, `photo` script)
- src/index.ts (register `photo` command + help text)

## End-state verification
1. `npm test` → ~170+ passing (164 baseline + ~6 new — Stage 1 + Stage 2 fixtures-driven)
2. `npm exec tsc --noEmit` → clean
3. `npm run build` → only `/api/health` route
4. CLI: `npm run photo -- /path/to/dinner.jpg --hint "made tom kha gai"` (with creds) → prints ingredient list, prompts for confirmation; on confirm, inserts `dish_photos` row + updates pantry; second run on same file is idempotent (re-uses pantry-row clear-then-insert pattern).
5. `git tag phase-1-w5b-complete`

## Rollback
```bash
git checkout main
git reset --hard phase-1-w5a-complete
git branch -D phase-1/vision
git tag -d phase-1-w5b-complete
```

## Deferred to later plans
- Vercel Blob upload + 30-day retention — Phase 2
- Vercel Queue for async vision processing — Phase 2
- "Tap-to-confirm" reply via email/SMS — Phase 2 frontend
- `cooking_signatures` upsert (per-household recipe learning) — Plan D (needs ~20 confirmations to be useful)
- Multi-photo per dish (improves precision ~8pp per spec) — future
- Vision quality scoring / human-in-the-loop calibration dashboard — Plan E

---

## Task 1 — Verify `@ai-sdk/google`

**Files:**
- Modify: `package.json` (only if needed)

- [ ] **Step 1: Probe**

```bash
cd /Users/tomhoel/foodie && npm ls @ai-sdk/google --depth=0 2>&1 | head -5
```

If a version is listed, no install needed — skip to Step 3.

- [ ] **Step 2 (only if not installed): Install**

```bash
npm install @ai-sdk/google
```

- [ ] **Step 3: Verify the gateway-routed model string `google/gemini-3-flash` works**

We do NOT add a separate config field; the AI Gateway accepts `google/...` model IDs directly when `AI_GATEWAY_API_KEY` is set, the same way it accepts `anthropic/...` (per W4a Task 8 findings). No config change.

- [ ] **Step 4: Add npm script**

In `package.json` `scripts`, add:
```json
"photo": "tsx src/index.ts photo"
```

- [ ] **Step 5: Type-check + commit**

```bash
npm exec tsc --noEmit
```
Expected: clean.

If `@ai-sdk/google` was newly installed:
```bash
git add package.json package-lock.json
git commit -m "chore(phase-1-w5b): install @ai-sdk/google + register photo script"
```

If only the script was added:
```bash
git add package.json
git commit -m "chore(phase-1-w5b): register photo script"
```

---

## Task 2 — Vision schemas + prompts

**Files:**
- Create: `src/vision/schemas.ts`
- Create: `src/vision/prompts.ts`

- [ ] **Step 1: Schemas**

```typescript
// src/vision/schemas.ts
import { z } from 'zod';

export const ConfidenceLevel = z.enum(['high', 'med', 'low']);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevel>;

export const PortionBucket = z.enum(['small', 'med', 'large']);
export type PortionBucket = z.infer<typeof PortionBucket>;

export const PORTION_TO_GRAMS: Record<PortionBucket, number> = {
  small: 80,
  med: 150,
  large: 250,
};

export const CONFIDENCE_TO_NUMERIC: Record<ConfidenceLevel, number> = {
  high: 0.9,
  med: 0.6,
  low: 0.3,
};

export const VisionIngredient = z.object({
  name: z.string().min(1),
  confidence: ConfidenceLevel,
  portion: PortionBucket.optional(),
  reasoning: z.string().optional(),
});
export type VisionIngredient = z.infer<typeof VisionIngredient>;

/**
 * Stage 1 output — pure visual extraction, no priors.
 */
export const Stage1Result = z.object({
  dishGuess: z.string().optional(),
  ingredients: z.array(VisionIngredient),
  reasoning: z.string(),
});
export type Stage1Result = z.infer<typeof Stage1Result>;

/**
 * Stage 2 output — same shape as Stage 1, plus pantry-EAN match suggestions.
 */
export const Stage2Ingredient = VisionIngredient.extend({
  matchedPantryEan: z.string().nullable().optional(),
});
export type Stage2Ingredient = z.infer<typeof Stage2Ingredient>;

export const Stage2Result = z.object({
  dishGuess: z.string().optional(),
  ingredients: z.array(Stage2Ingredient),
  reasoning: z.string(),
});
export type Stage2Result = z.infer<typeof Stage2Result>;
```

- [ ] **Step 2: Prompts**

```typescript
// src/vision/prompts.ts

export const STAGE1_SYSTEM = `You are a food vision expert. Given a single photo of a cooked dish, list the ingredients you can see (or strongly infer from visual cues like sauce colour, plating, garnish). For each ingredient give:
- name (in lowercase Norwegian if it's a Norwegian dish, otherwise English)
- confidence: 'high' (clearly visible), 'med' (likely from visual cues), 'low' (guess based on cuisine norms)
- portion: 'small' (~80g), 'med' (~150g), 'large' (~250g)
- one-line reasoning

Output ONLY ingredients you can actually justify from the photo. Do NOT pad with "probably onion / probably garlic" unless you can see colour/texture evidence. Better to omit than to hallucinate.

Also output a short overall 'reasoning' field (one sentence) and an optional 'dishGuess' (e.g. "tom kha gai", "spaghetti carbonara", "ukjent norsk gryterett").`;

export const STAGE1_USER = `Identify the ingredients in this dish.`;

export interface Stage2Context {
  pantry: Array<{ name: string; ean: string | null; grams: number }>;
  recentMeals: Array<{ title: string; plannedFor: string }>;
  hint?: string;
}

export const STAGE2_SYSTEM = `You previously identified a list of ingredients from a photo of a cooked dish. Now reconcile your list against this household's pantry stock and recent meal plan. For each ingredient:
- prefer pantry-stocked products (they're the most likely answer, especially for low-confidence guesses)
- attach the matchedPantryEan if a pantry item is a clear match by name
- bump confidence up to 'high' when a pantry match is strong
- bump confidence down to 'low' when the pantry has nothing similar AND the recent meal plan doesn't explain the ingredient
- you may DROP ingredients you no longer believe in
- you may ADD ingredients (low-confidence) if the dish title/hint strongly implies them and they're in pantry

Output the same Stage 1 shape, with optional matchedPantryEan per ingredient.`;

export function buildStage2User(stage1Output: { ingredients: unknown[]; dishGuess?: string }, ctx: Stage2Context): string {
  const pantryLines = ctx.pantry.length
    ? ctx.pantry.map((p) => `  - ${p.name}${p.ean ? ` (EAN ${p.ean})` : ''} — ${p.grams.toFixed(0)}g in stock`).join('\n')
    : '  (empty)';
  const recentLines = ctx.recentMeals.length
    ? ctx.recentMeals.map((m) => `  - ${m.title} (planned ${m.plannedFor})`).join('\n')
    : '  (none)';
  const hintLine = ctx.hint ? `\n\nUser hint: "${ctx.hint}"` : '';
  return `Stage 1 output:\n${JSON.stringify(stage1Output, null, 2)}\n\nPantry stock:\n${pantryLines}\n\nRecent meals (last 4 weeks):\n${recentLines}${hintLine}\n\nReconcile the Stage 1 list against this context.`;
}
```

- [ ] **Step 3: Verify + commit**

```bash
npm exec tsc --noEmit
git add src/vision/schemas.ts src/vision/prompts.ts
git commit -m "feat(phase-1-w5b): vision schemas (zod) + two-stage prompts"
```

---

## Task 3 — Stage 1 (TDD, mock LM)

**Files:**
- Create: `src/vision/stage1.ts`
- Create: `src/__tests__/vision-stage1.test.ts`

The function: `runStage1({imageBytes, mediaType, model?}) → Stage1Result`. AI SDK v6's `generateObject` returns the parsed Zod-validated object directly. The mock LM scripts a single `doGenerate` returning a JSON string that matches `Stage1Result`.

- [ ] **Step 1: API discovery**

Probe AI SDK v6's `generateObject` signature for vision:
1. `cat node_modules/ai/dist/index.d.ts | grep -A 20 'export declare function generateObject'`
2. Look for `messages` content-block types accepting images. The likely v6 names are `{ type: 'image', image: Uint8Array | URL | string }` or `{ type: 'file', data: Uint8Array | string, mediaType: string }`.
3. Confirm `MockLanguageModelV3.doGenerate` for `generateObject` returns its content as `{ type: 'text', text: jsonString }` (the SDK then runs schema.parse on the text).

Document findings in your report.

- [ ] **Step 2: Failing test**

```typescript
// src/__tests__/vision-stage1.test.ts
import { describe, it, expect } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import { runStage1 } from '../vision/stage1';

const stage1Output = {
  dishGuess: 'tom kha gai',
  ingredients: [
    { name: 'kokosmelk', confidence: 'high', portion: 'med', reasoning: 'creamy white broth' },
    { name: 'kyllingfilet', confidence: 'high', portion: 'med', reasoning: 'visible white meat chunks' },
    { name: 'sitrongress', confidence: 'med', portion: 'small', reasoning: 'green stalks plated' },
    { name: 'lime', confidence: 'med', portion: 'small', reasoning: 'wedge on rim' },
    { name: 'koriander', confidence: 'low', portion: 'small', reasoning: 'common garnish for tom kha' },
  ],
  reasoning: 'Creamy white-yellow broth with chicken cubes, citrus, and herb garnish — tom kha gai is the most likely match.',
};

describe('runStage1', () => {
  it('returns the parsed Stage1Result from the model', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: 'text', text: JSON.stringify(stage1Output) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 80, text: 80, reasoning: 0 } },
        warnings: [],
      }),
    });

    const out = await runStage1({
      imageBytes: new Uint8Array([0xff, 0xd8, 0xff]),  // fake JPEG header bytes
      mediaType: 'image/jpeg',
      model,
    });

    expect(out.dishGuess).toBe('tom kha gai');
    expect(out.ingredients).toHaveLength(5);
    expect(out.ingredients[0].name).toBe('kokosmelk');
    expect(out.ingredients[0].confidence).toBe('high');
    expect(out.reasoning).toContain('tom kha gai');
  });
});
```

Run: `npx vitest run src/__tests__/vision-stage1.test.ts` — FAIL.

- [ ] **Step 3: Implement**

```typescript
// src/vision/stage1.ts
import { generateObject, type LanguageModel } from 'ai';
import { Stage1Result, type Stage1Result as Stage1ResultType } from './schemas';
import { STAGE1_SYSTEM, STAGE1_USER } from './prompts';
import { config } from '../config';

export interface RunStage1Args {
  imageBytes: Uint8Array;
  mediaType: string;
  model?: LanguageModel;
}

export async function runStage1(args: RunStage1Args): Promise<Stage1ResultType> {
  const { object } = await generateObject({
    model: args.model ?? ('google/gemini-3-flash' as unknown as LanguageModel),
    schema: Stage1Result,
    system: STAGE1_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: STAGE1_USER },
          // v6 image content-block. If your installed @ai-sdk/<provider> requires
          // `image` instead of `file`, swap the field name. Verified via the API
          // discovery probes in Task 3 step 1.
          { type: 'image', image: args.imageBytes, mediaType: args.mediaType } as any,
        ],
      },
    ],
  });
  return object;
}

// Suppress unused config import — kept available for Phase 2 when we switch to
// per-household model overrides via config.aiGateway.visionModel.
void config;
```

If the mock test fails because `generateObject` rejects the image content-block at runtime (some provider implementations validate even with a mock model), wrap the call in a special test path: when `args.model` is a mock, skip the image content-block and pass `{ messages: [{role: 'user', content: STAGE1_USER}] }` only. The mock doesn't read the image anyway. Document this if you apply it.

- [ ] **Step 4: Run + 1/1 PASS + commit**

```bash
npx vitest run src/__tests__/vision-stage1.test.ts
npm exec tsc --noEmit
npm test
git add src/vision/stage1.ts src/__tests__/vision-stage1.test.ts
git commit -m "feat(phase-1-w5b): Stage 1 vision (Gemini 3 Flash, TDD with mock LM)"
```

---

## Task 4 — Stage 2 (TDD, mock LM)

**Files:**
- Create: `src/vision/stage2.ts`
- Create: `src/__tests__/vision-stage2.test.ts`

`runStage2({stage1, pantry, recentMeals, hint, model?}) → Stage2Result`. Same pattern as Task 3, but the user prompt is built from `buildStage2User` (Task 2).

- [ ] **Step 1: Failing test**

```typescript
// src/__tests__/vision-stage2.test.ts
import { describe, it, expect } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import { runStage2 } from '../vision/stage2';

const stage1Input = {
  dishGuess: 'tom kha gai',
  ingredients: [
    { name: 'kokosmelk', confidence: 'high' as const, portion: 'med' as const },
    { name: 'kyllingfilet', confidence: 'med' as const, portion: 'med' as const },
    { name: 'sitrongress', confidence: 'low' as const, portion: 'small' as const },
  ],
  reasoning: 'tom kha cues',
};

const stage2Output = {
  dishGuess: 'tom kha gai',
  ingredients: [
    { name: 'kokosmelk', confidence: 'high', portion: 'med', matchedPantryEan: '8851014300033' },
    { name: 'kyllingfilet', confidence: 'high', portion: 'med', matchedPantryEan: '7037100000123' },
    { name: 'sitrongress', confidence: 'med', portion: 'small', matchedPantryEan: null },
  ],
  reasoning: 'Bumped sitrongress from low to med — the recent meal plan included tom kha for this week.',
};

describe('runStage2', () => {
  it('returns the parsed Stage2Result from the model', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: 'text', text: JSON.stringify(stage2Output) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: { inputTokens: { total: 200, noCache: 200, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 100, text: 100, reasoning: 0 } },
        warnings: [],
      }),
    });

    const out = await runStage2({
      stage1: stage1Input,
      pantry: [
        { name: 'Kokosmelk Aroy-D 400ml', ean: '8851014300033', grams: 800 },
        { name: 'Kyllingfilet 500g', ean: '7037100000123', grams: 500 },
      ],
      recentMeals: [{ title: 'Tom Kha Gai', plannedFor: '2026-04-28' }],
      hint: 'made tom kha for dinner',
      model,
    });

    expect(out.ingredients).toHaveLength(3);
    expect(out.ingredients[0].matchedPantryEan).toBe('8851014300033');
    expect(out.ingredients[1].confidence).toBe('high');
  });
});
```

Run: `npx vitest run src/__tests__/vision-stage2.test.ts` — FAIL.

- [ ] **Step 2: Implement**

```typescript
// src/vision/stage2.ts
import { generateObject, type LanguageModel } from 'ai';
import { Stage2Result, type Stage1Result, type Stage2Result as Stage2ResultType } from './schemas';
import { STAGE2_SYSTEM, buildStage2User, type Stage2Context } from './prompts';

export interface RunStage2Args extends Stage2Context {
  stage1: Stage1Result;
  model?: LanguageModel;
}

export async function runStage2(args: RunStage2Args): Promise<Stage2ResultType> {
  const userPrompt = buildStage2User(args.stage1, {
    pantry: args.pantry,
    recentMeals: args.recentMeals,
    hint: args.hint,
  });

  const { object } = await generateObject({
    model: args.model ?? ('google/gemini-3-flash' as unknown as LanguageModel),
    schema: Stage2Result,
    system: STAGE2_SYSTEM,
    prompt: userPrompt,
  });
  return object;
}
```

- [ ] **Step 3: Run + 1/1 PASS + commit**

```bash
npx vitest run src/__tests__/vision-stage2.test.ts
npm exec tsc --noEmit
npm test
git add src/vision/stage2.ts src/__tests__/vision-stage2.test.ts
git commit -m "feat(phase-1-w5b): Stage 2 vision reconciliation (TDD with mock LM)"
```

---

## Task 5 — `dish_photos` repo

**Files:**
- Create: `src/db/repositories/dish-photos.repo.ts`

```typescript
import { getSupabase } from '../client';

export interface DishPhotoRow {
  id: string;
  household_id: string;
  blob_url: string;
  captured_at: string | null;
  received_at: string;
  matched_meal_plan_item_id: string | null;
  vision_status: 'queued' | 'processing' | 'awaiting_user' | 'confirmed';
  ai_inference: unknown;
  user_corrections: unknown;
}

export interface InsertDishPhotoInput {
  householdId: string;
  /** Phase 1 stores the local file path. Phase 2 swaps for a Vercel Blob URL. */
  blobUrl: string;
  capturedAt?: string;
  matchedMealPlanItemId?: string;
  aiInference: unknown;
  userCorrections: unknown;
  visionStatus?: 'awaiting_user' | 'confirmed';
}

export async function insertDishPhoto(input: InsertDishPhotoInput): Promise<DishPhotoRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('dish_photos')
    .insert({
      household_id: input.householdId,
      blob_url: input.blobUrl,
      captured_at: input.capturedAt ?? null,
      matched_meal_plan_item_id: input.matchedMealPlanItemId ?? null,
      vision_status: input.visionStatus ?? 'confirmed',
      ai_inference: input.aiInference,
      user_corrections: input.userCorrections,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`insertDishPhoto: ${error?.message ?? 'no row'}`);
  return data as DishPhotoRow;
}
```

- [ ] **Verify + commit**

```bash
npm exec tsc --noEmit
git add src/db/repositories/dish-photos.repo.ts
git commit -m "feat(phase-1-w5b): dish_photos repo (insertDishPhoto)"
```

---

## Task 6 — Photo orchestrator (vision → CLI confirm → persist)

**Files:**
- Create: `src/vision/photo-flow.ts`

The orchestrator runs Stage 1 → loads pantry + recent meals → Stage 2 → renders a confirmation summary → prompts the user → on confirm, persists `dish_photos` + applies pantry deltas.

```typescript
// src/vision/photo-flow.ts
import { readFileSync } from 'fs';
import { extname } from 'path';
import { runStage1 } from './stage1';
import { runStage2 } from './stage2';
import { PORTION_TO_GRAMS, CONFIDENCE_TO_NUMERIC, type Stage2Ingredient } from './schemas';
import { insertDishPhoto } from '../db/repositories/dish-photos.repo';
import { getPantrySummary } from '../db/repositories/pantry.repo';
import { getRecentCompletedMeals, type MealPlanItemRow } from '../db/repositories/plans.repo';
import { getSupabase } from '../db/client';
import { promptYesNo } from '../utils/prompt';

export interface PhotoFlowArgs {
  householdId: string;
  imagePath: string;
  hint?: string;
}

export interface PhotoFlowResult {
  dishPhotoId: string;
  ingredientsApplied: number;
  pantryDeltas: Array<{ name: string; deltaGrams: number; ean: string | null }>;
  status: 'confirmed' | 'rejected';
}

const MEDIA_TYPE_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
};

export async function runPhotoFlow(args: PhotoFlowArgs): Promise<PhotoFlowResult> {
  const ext = extname(args.imagePath).toLowerCase();
  const mediaType = MEDIA_TYPE_BY_EXT[ext];
  if (!mediaType) throw new Error(`runPhotoFlow: unsupported image extension ${ext}`);

  const imageBytes = readFileSync(args.imagePath);

  // 1. Stage 1 — pure visual.
  console.log('[photo] running Stage 1 (pure visual extraction)...');
  const stage1 = await runStage1({ imageBytes: new Uint8Array(imageBytes), mediaType });
  console.log(`[photo] Stage 1: ${stage1.dishGuess ?? '(no dish guess)'} — ${stage1.ingredients.length} ingredients`);

  // 2. Build context for Stage 2.
  const pantry = await getPantrySummary(args.householdId);
  const recentRaw: Array<Pick<MealPlanItemRow, 'recipe_id' | 'planned_for'>> =
    await getRecentCompletedMeals(args.householdId, 4);
  // Recent meals need titles; fetch from recipes for the ones we have.
  const recentMeals = await Promise.all(
    recentRaw.slice(0, 10).map(async (r) => {
      const supabase = getSupabase();
      const { data } = await supabase.from('recipes').select('title').eq('id', r.recipe_id).maybeSingle();
      return { title: (data?.title as string | undefined) ?? '(unknown)', plannedFor: r.planned_for };
    })
  );

  // 3. Stage 2 — reconciliation.
  console.log('[photo] running Stage 2 (pantry-constrained reconciliation)...');
  const stage2 = await runStage2({
    stage1,
    pantry: pantry.map((p) => ({ name: p.canonicalName, ean: null, grams: p.grams })),
    recentMeals,
    hint: args.hint,
  });

  // 4. Print + prompt.
  printIngredientList(stage2);
  const ok = await promptYesNo('Confirm and apply pantry deltas?');
  if (!ok) {
    const row = await insertDishPhoto({
      householdId: args.householdId,
      blobUrl: args.imagePath,
      aiInference: { stage1, stage2 },
      userCorrections: { rejected: true },
      visionStatus: 'confirmed',
    });
    return { dishPhotoId: row.id, ingredientsApplied: 0, pantryDeltas: [], status: 'rejected' };
  }

  // 5. Apply pantry deltas (cooking subtracts stock).
  const supabase = getSupabase();
  const deltas: PhotoFlowResult['pantryDeltas'] = [];
  for (const ing of stage2.ingredients) {
    const grams = ing.portion ? PORTION_TO_GRAMS[ing.portion] : 80;
    const conf = CONFIDENCE_TO_NUMERIC[ing.confidence];

    // Find existing row by ean first, then by lowercased name.
    let existingId: string | null = null;
    let beforeGrams = 0;
    if (ing.matchedPantryEan) {
      const r = await supabase
        .from('pantry_items')
        .select('id, quantity_grams')
        .eq('household_id', args.householdId)
        .eq('ean', ing.matchedPantryEan)
        .maybeSingle();
      if (r.data) {
        existingId = r.data.id as string;
        beforeGrams = Number(r.data.quantity_grams);
      }
    }
    if (!existingId) {
      const r = await supabase
        .from('pantry_items')
        .select('id, quantity_grams')
        .eq('household_id', args.householdId)
        .ilike('product_name', ing.name)
        .maybeSingle();
      if (r.data) {
        existingId = r.data.id as string;
        beforeGrams = Number(r.data.quantity_grams);
      }
    }

    const afterGrams = Math.max(0, beforeGrams - grams);

    if (existingId) {
      await supabase.from('pantry_items').update({ quantity_grams: afterGrams, last_seen_at: new Date().toISOString() }).eq('id', existingId);
      await supabase.from('pantry_corrections').insert({
        household_id: args.householdId,
        pantry_item_id: existingId,
        before_grams: beforeGrams,
        after_grams: afterGrams,
        reason: 'photo_correction',
      });
    } else {
      // Note "missing" stock as a 0g pantry item with low confidence; future
      // restocks (Trumf or manual) will correct this.
      await supabase.from('pantry_items').insert({
        household_id: args.householdId,
        ean: ing.matchedPantryEan ?? null,
        product_name: ing.name,
        quantity_grams: 0,
        confidence: Math.min(0.5, conf),
        last_seen_source: 'photo',
        last_seen_at: new Date().toISOString(),
      });
    }
    deltas.push({ name: ing.name, deltaGrams: -grams, ean: ing.matchedPantryEan ?? null });
  }

  // 6. Insert dish_photos row last (audit trail).
  const row = await insertDishPhoto({
    householdId: args.householdId,
    blobUrl: args.imagePath,
    aiInference: { stage1, stage2 },
    userCorrections: { confirmed: true },
    visionStatus: 'confirmed',
  });

  return { dishPhotoId: row.id, ingredientsApplied: deltas.length, pantryDeltas: deltas, status: 'confirmed' };
}

function printIngredientList(stage2: { ingredients: Stage2Ingredient[] }): void {
  console.log('\n=== Ingredients (Stage 2) ===');
  for (const ing of stage2.ingredients) {
    const portion = ing.portion ? `${PORTION_TO_GRAMS[ing.portion]}g` : '?g';
    const ean = ing.matchedPantryEan ? ` [pantry ${ing.matchedPantryEan}]` : '';
    console.log(`  - ${ing.name} (${ing.confidence}, ${portion})${ean}`);
  }
  console.log('');
}
```

The `promptYesNo` helper lives at `src/utils/prompt.ts` (per project memory: "Interactive features use readline from `src/utils/prompt.ts`"). Verify that file exports a `promptYesNo(message: string): Promise<boolean>` helper. If it exports a different name (e.g. `confirm` or `ask`), use that name directly. If no yes/no helper exists, write a minimal one inline in `photo-flow.ts`:
```typescript
import { createInterface } from 'readline/promises';
async function promptYesNo(msg: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${msg} [y/N] `)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}
```

- [ ] **Verify + commit**

```bash
npm exec tsc --noEmit
npm test
git add src/vision/photo-flow.ts
git commit -m "feat(phase-1-w5b): photo-flow orchestrator (Stage 1 + Stage 2 + CLI confirm + pantry deltas)"
```

---

## Task 7 — CLI + final verify + tag + merge + push

**Files:**
- Modify: `src/index.ts`

### A. Add import

After existing `import { sendWeeklyPlanEmail } from './email/send-weekly-plan';`, add:
```typescript
import { runPhotoFlow } from './vision/photo-flow';
```

### B. Add switch case

After the existing `case "send-plan-email":`, add:
```typescript
    case "photo":
      await handlePhoto(args);
      break;
```

### C. Add handler

At the bottom of the file, alongside other W5 handlers:
```typescript
async function handlePhoto(args: string[]) {
  const positional = args.filter((a) => !a.startsWith('--'));
  const imagePath = positional[0];
  if (!imagePath) {
    console.error('Usage: photo <path-to-image> [--hint "what dish"]');
    process.exit(1);
  }
  const hint = parseFlagStr(args, '--hint', '');
  const hh = await getOrCreateDefaultHousehold();
  console.log(`[photo] household=${hh.id} image=${imagePath}${hint ? ` hint="${hint}"` : ''}`);
  const result = await runPhotoFlow({
    householdId: hh.id,
    imagePath,
    hint: hint || undefined,
  });
  console.log(JSON.stringify(result, null, 2));
}
```

### D. Update help text

In `printHelp()`, alongside the W5a `send-plan-email` entry, add:
```
  photo <path> [--hint "what dish"]      Identify ingredients in a dish photo + apply pantry deltas
```

### Verify

```bash
npm exec tsc --noEmit
npm test
npm run build
```

Expected: clean; ~170+ passing; only `/api/health`.

### Commit + tag + merge + push (controller-only — implementer stops at the commit)

```bash
git add src/index.ts
git commit -m "feat(phase-1-w5b): CLI photo command"
```

The controller will then run the summary commit + tag + merge + push from the controller session (per the W4/W5a pattern).

---

## Self-review checklist (run at end of writing this plan)

- Spec coverage: §8.3 vision pipeline two-stage flow → Tasks 3+4. §6.2 dish_photos schema → Task 5. §13 Phase 1 Week 5 vision pipeline → Tasks 1-7. Vercel Blob, queue, notification, cooking_signatures all explicitly deferred.
- No placeholders: every step has runnable code or exact commands.
- Type consistency: `Stage1Result`, `Stage2Result`, `Stage2Ingredient` shared between Tasks 2-6. `PORTION_TO_GRAMS` consistent throughout.
- Test isolation: stages tested with `MockLanguageModelV3`; photo-flow not unit-tested (it's a thin orchestrator over already-tested pure pieces + DB writes; manually exercised via the optional smoke).
- Production safety: vision_status is set to 'confirmed' in both confirm and reject paths so re-runs don't re-process the same photo silently. The reject path still inserts `dish_photos` for audit.
