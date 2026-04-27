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
