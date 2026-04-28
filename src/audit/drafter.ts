import { generateText, type LanguageModel } from 'ai';
import { config } from '../config';
import { AUDIT_DRAFTER_SYSTEM } from './prompts';
import type { AuditItem } from './priority';

export interface DraftAuditEmailArgs {
  items: AuditItem[];
  /** Override model (used by tests). Defaults to AI Gateway Haiku 4.5. */
  model?: LanguageModel;
}

export async function draftAuditEmailBody(args: DraftAuditEmailArgs): Promise<string> {
  const itemLines = args.items
    .map((it) => `- ${it.name}: ${it.currentGrams.toFixed(0)}g on file (confidence ${(it.currentConfidence * 100).toFixed(0)}%)`)
    .join('\n');
  const prompt = `Items to check:\n${itemLines}`;
  const { text } = await generateText({
    // Bare model ID resolved by the AI Gateway at runtime when AI_GATEWAY_API_KEY is set.
    model: args.model ?? (config.aiGateway.narratorModel as unknown as LanguageModel),
    system: AUDIT_DRAFTER_SYSTEM,
    prompt,
  });
  return text.trim();
}
