import { selectTopAuditItems, type PantryAuditCandidate } from './priority';
import { draftAuditEmailBody } from './drafter';
import { renderAuditEmail } from './templates';
import { sendEmail, buildResendSender } from '../email/client';
import { insertAudit } from '../db/repositories/audits.repo';
import { config } from '../config';
import { getSupabase } from '../db/client';

export interface RunAuditArgs {
  householdId: string;
  to: string;
  topN?: number;
}

export interface RunAuditResult {
  auditId: string;
  itemCount: number;
  messageId: string;
}

export async function runAudit(args: RunAuditArgs): Promise<RunAuditResult> {
  if (!config.email.resendApiKey) throw new Error('RESEND_API_KEY is not set.');
  const topN = args.topN ?? 10;

  // 1. Pull pantry candidates with computed recipe dependency.
  const candidates = await loadAuditCandidates(args.householdId);
  if (candidates.length === 0) {
    throw new Error('No pantry items to audit (pantry is empty).');
  }
  const top = selectTopAuditItems(candidates, topN);

  // 2. Persist the audit snapshot first so the user has something to reply to even if email fails.
  const audit = await insertAudit({
    householdId: args.householdId,
    items: top,
  });

  // 3. Draft the email body via Haiku.
  const body = await draftAuditEmailBody({ items: top });

  // 4. Render + send.
  const rendered = renderAuditEmail({ auditId: audit.id, body, items: top });
  const sender = await buildResendSender(config.email.resendApiKey);
  const sent = await sendEmail({
    sender,
    from: config.email.from,
    to: args.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  return { auditId: audit.id, itemCount: top.length, messageId: sent.messageId };
}

async function loadAuditCandidates(householdId: string): Promise<PantryAuditCandidate[]> {
  const supabase = getSupabase();

  const { data: pantryRows, error: pe } = await supabase
    .from('pantry_items')
    .select('id, ean, product_name, quantity_grams, confidence')
    .eq('household_id', householdId);
  if (pe) throw new Error(`loadAuditCandidates (pantry): ${pe.message}`);

  // Recipe dependency: count cooked meals (last 4 weeks) whose ingredient
  // raw_text overlaps each pantry item's name (substring, lowercased).
  const cutoff = new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);
  const { data: cookedRows, error: ce } = await supabase
    .from('meal_plan_items')
    .select('id, recipes!inner(recipe_ingredients(raw_text)), meal_plans!inner(household_id)')
    .eq('meal_plans.household_id', householdId)
    .eq('status', 'cooked')
    .gte('planned_for', cutoff);
  if (ce) throw new Error(`loadAuditCandidates (cooked): ${ce.message}`);

  // Flatten to a list of lowercased ingredient texts.
  const cookedTexts: string[] = [];
  for (const row of (cookedRows ?? []) as any[]) {
    const ings = row?.recipes?.recipe_ingredients ?? [];
    for (const ing of ings) cookedTexts.push(String(ing.raw_text ?? '').toLowerCase());
  }

  return (pantryRows ?? []).map((row: any) => {
    const name = String(row.product_name ?? '').trim();
    const lname = name.toLowerCase();
    const dep = lname.length > 2 ? cookedTexts.filter((t) => t.includes(lname)).length : 0;
    return {
      pantryItemId: row.id as string,
      name,
      ean: (row.ean as string | null) ?? null,
      currentGrams: Number(row.quantity_grams),
      currentConfidence: Number(row.confidence),
      recipeDependency: dep,
    };
  });
}
