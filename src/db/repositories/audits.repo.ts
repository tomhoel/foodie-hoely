import { getSupabase } from '../client';

export interface AuditRow {
  id: string;
  household_id: string;
  generated_at: string;
  items: unknown;
  status: 'pending_reply' | 'partially_replied' | 'closed';
  responded_at: string | null;
}

export async function insertAudit(input: {
  householdId: string;
  items: unknown;
}): Promise<AuditRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('audits')
    .insert({
      household_id: input.householdId,
      items: input.items,
      status: 'pending_reply',
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`insertAudit: ${error?.message ?? 'no row'}`);
  return data as AuditRow;
}

export async function latestOpenAudit(householdId: string): Promise<AuditRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('audits')
    .select('*')
    .eq('household_id', householdId)
    .neq('status', 'closed')
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`latestOpenAudit: ${error.message}`);
  return (data as AuditRow | null) ?? null;
}

export async function closeAudit(id: string): Promise<AuditRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('audits')
    .update({ status: 'closed', responded_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error || !data) throw new Error(`closeAudit: ${error?.message ?? 'no row'}`);
  return data as AuditRow;
}

export async function getAudit(id: string): Promise<AuditRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('audits').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`getAudit: ${error.message}`);
  return (data as AuditRow | null) ?? null;
}
