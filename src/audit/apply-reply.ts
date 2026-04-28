import { readFileSync, writeFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { stringify as toYaml } from 'yaml';
import { latestOpenAudit, closeAudit } from '../db/repositories/audits.repo';
import { parseAuditReply, type Correction } from './reply-parser';
import { getFoodiePath } from '../utils/storage';
import { getSupabase } from '../db/client';
import type { AuditItem } from './priority';

export interface ApplyReplyArgs {
  householdId: string;
  /** Skip $EDITOR (used by tests/non-interactive environments). The caller pre-fills the reply file. */
  noEditor?: boolean;
}

export interface ApplyReplyResult {
  auditId: string;
  applied: number;
  skipped: number;
}

export async function applyAuditReply(args: ApplyReplyArgs): Promise<ApplyReplyResult> {
  const audit = await latestOpenAudit(args.householdId);
  if (!audit) throw new Error('No open audit. Run `npm run audit-run` first.');
  const snapshot = audit.items as AuditItem[];

  const draftPath = getFoodiePath(`audit-reply-${audit.id}.yaml`);

  if (!existsSync(draftPath) && !args.noEditor) {
    // Pre-fill the YAML with one row per snapshot item; user fills in `actualGrams`.
    const draft = snapshot.map((s) => ({
      pantryItemId: s.pantryItemId,
      name: s.name,
      currentGrams: s.currentGrams,
      actualGrams: null, // user fills in; null = leave alone
    }));
    writeFileSync(draftPath, toYaml(draft), 'utf-8');
    console.log(`[audit-reply] draft written to ${draftPath}`);
  }

  if (!args.noEditor) {
    const editor = process.env.EDITOR || 'vi';
    const r = spawnSync(editor, [draftPath], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`audit-reply: editor exited with code ${r.status}`);
  }

  const yamlText = readFileSync(draftPath, 'utf-8');
  const corrections = parseAuditReply(yamlText, snapshot);

  // Apply corrections.
  const supabase = getSupabase();
  let applied = 0;
  for (const c of corrections) {
    await applyCorrection(c, args.householdId, supabase);
    applied++;
  }

  await closeAudit(audit.id);

  return {
    auditId: audit.id,
    applied,
    skipped: snapshot.length - applied,
  };
}

async function applyCorrection(c: Correction, householdId: string, supabase: ReturnType<typeof getSupabase>) {
  const upd = await supabase
    .from('pantry_items')
    .update({ quantity_grams: c.afterGrams, last_seen_at: new Date().toISOString() })
    .eq('id', c.pantryItemId);
  if (upd.error) throw new Error(`apply-reply (pantry update ${c.pantryItemId}): ${upd.error.message}`);
  const ins = await supabase.from('pantry_corrections').insert({
    household_id: householdId,
    pantry_item_id: c.pantryItemId,
    before_grams: c.beforeGrams,
    after_grams: c.afterGrams,
    reason: 'reply',
  });
  if (ins.error) throw new Error(`apply-reply (correction insert ${c.pantryItemId}): ${ins.error.message}`);
}
