import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { AuditItem } from './priority';

const ReplyEntry = z.object({
  pantryItemId: z.string(),
  name: z.string().optional(),
  currentGrams: z.number().optional(),
  actualGrams: z.number().nullable().optional(),
});

const ReplyDoc = z.array(ReplyEntry);

export interface Correction {
  pantryItemId: string;
  beforeGrams: number;
  afterGrams: number;
}

export function parseAuditReply(yamlText: string, snapshot: AuditItem[]): Correction[] {
  const parsed = parseYaml(yamlText);
  const result = ReplyDoc.safeParse(parsed);
  if (!result.success) throw new Error(`parseAuditReply: ${result.error.message}`);

  const byId = new Map(snapshot.map((s) => [s.pantryItemId, s]));
  const corrections: Correction[] = [];
  for (const entry of result.data) {
    const snap = byId.get(entry.pantryItemId);
    if (!snap) throw new Error(`parseAuditReply: unknown pantryItemId ${entry.pantryItemId}`);
    if (entry.actualGrams === null || entry.actualGrams === undefined) continue;
    if (entry.actualGrams === snap.currentGrams) continue;
    corrections.push({
      pantryItemId: entry.pantryItemId,
      beforeGrams: snap.currentGrams,
      afterGrams: entry.actualGrams,
    });
  }
  return corrections;
}
