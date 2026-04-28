// src/vision/photo-flow.ts
import { readFileSync } from 'fs';
import { extname } from 'path';
import { runStage1 } from './stage1';
import { runStage2 } from './stage2';
import { PORTION_TO_GRAMS, CONFIDENCE_TO_NUMERIC, type Stage2Ingredient } from './schemas';
import { insertDishPhoto } from '../db/repositories/dish-photos.repo';
import { getPantrySummary } from '../db/repositories/pantry.repo';
import { getRecentCompletedMeals } from '../db/repositories/plans.repo';
import { getSupabase } from '../db/client';
import { askUser, closeReadline } from '../utils/prompt';

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
  const recentRaw = await getRecentCompletedMeals(args.householdId, 4);
  const supabase = getSupabase();
  const recentMeals = await Promise.all(
    recentRaw.slice(0, 10).map(async (r) => {
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
  closeReadline();

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
  const deltas: PhotoFlowResult['pantryDeltas'] = [];
  for (const ing of stage2.ingredients) {
    const grams = ing.portion ? PORTION_TO_GRAMS[ing.portion] : 80;
    const conf = CONFIDENCE_TO_NUMERIC[ing.confidence];

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
      const upd = await supabase
        .from('pantry_items')
        .update({ quantity_grams: afterGrams, last_seen_at: new Date().toISOString() })
        .eq('id', existingId);
      if (upd.error) throw new Error(`pantry_items update: ${upd.error.message}`);
      const ins = await supabase.from('pantry_corrections').insert({
        household_id: args.householdId,
        pantry_item_id: existingId,
        before_grams: beforeGrams,
        after_grams: afterGrams,
        reason: 'photo_correction',
      });
      if (ins.error) throw new Error(`pantry_corrections insert: ${ins.error.message}`);
    } else {
      const ins = await supabase.from('pantry_items').insert({
        household_id: args.householdId,
        ean: ing.matchedPantryEan ?? null,
        product_name: ing.name,
        quantity_grams: 0,
        confidence: Math.min(0.5, conf),
        last_seen_source: 'photo',
        last_seen_at: new Date().toISOString(),
      });
      if (ins.error) throw new Error(`pantry_items insert: ${ins.error.message}`);
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

async function promptYesNo(message: string): Promise<boolean> {
  const answer = await askUser(`${message} [y/N] `);
  if (!answer) return false;
  const lower = answer.trim().toLowerCase();
  return lower === 'y' || lower === 'yes';
}
