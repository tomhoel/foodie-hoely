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
