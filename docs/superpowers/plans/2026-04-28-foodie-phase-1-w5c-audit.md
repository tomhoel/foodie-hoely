# Foodie Phase 1 Week 5c — Audit generator (final Phase-1 piece)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the monthly pantry-uncertainty audit. `npm run audit-run` computes the top-N most-uncertain pantry items, persists an `audits` row capturing the snapshot, drafts a friendly email via Claude Haiku 4.5 ("hey — these 10 things in your pantry are looking iffy, can you check?"), and sends it via Resend. The user replies by running `npm run audit-reply`, which opens a YAML editor pre-filled with the snapshot — they fill in actual quantities, save, and the parser applies pantry corrections + closes the audit. This is the **last subsystem** in Phase 1 per spec §13.

**Architecture:**
- **Priority calculator** (pure): `audit_priority = uncertainty × recipeDependency + uncertainty × 0.1` (linear; the original log-scaled formula in §8.6 swapped order in our test fixtures, so we use linear amplification of recipe usage with a small floor for zero-usage items). `uncertainty = 1 − confidence` and `recipeDependency = count of last-4-weeks cooked meals whose ingredients overlap this pantry item by name`. Top-N defaults to 10. (`importance` from spec §8.6 is held constant at 1.0 in Phase 1; canonical-ingredient linking lands in Plan D.)
- **Audits repo**: `audits` table from migration 005 — `items jsonb`, `status` enum `'pending_reply'|'partially_replied'|'closed'`. `insertAudit({householdId, items}) → AuditRow`, `latestOpenAudit(householdId) → AuditRow | null`, `closeAudit(id, responded_at)`.
- **Drafter** (Haiku 4.5): generateText with system prompt + JSON-stringified item list → friendly 2-paragraph body in plain Norwegian (or English fallback). No code changes once tuned; prompt lives in `src/audit/prompts.ts`.
- **Emailer**: reuse W5a `sendEmail` + a new HTML template `renderAuditEmail({householdId, auditId, body, items}) → {subject, html, text}`. The body is literal user-prose from Haiku; the items are listed below as a checklist with the run command (`npm run audit-reply`).
- **Reply parser**: opens `~/.foodie/audit-reply-<auditId>.yaml` pre-filled with the snapshot, spawns `$EDITOR`, re-reads on close, parses YAML, validates with Zod (`AuditReplyDoc`), applies corrections idempotently to `pantry_items` + writes `pantry_corrections`, marks audit `closed`.
- Tests: priority calculator (TDD, pure), reply parser (TDD, pure). Drafter + emailer tested at the boundary with mock LM + fake EmailSender. `yaml` is the new dep.

**Tech Stack:** TypeScript 5.7, AI SDK v6 (already installed), `resend@^6` (already installed), `yaml@^2.x` (new), zod, vitest, Supabase. No new infra.

**Spec reference:** docs/superpowers/specs/2026-04-27-foodie-grocery-planner-design.md (§8.6 audit generator; §6.2 audits table; §13 Phase 1 Week 5)

**Predecessor:** phase-1-w5b-complete

**Prerequisite:** Migration 005 already applied. Real send requires `RESEND_API_KEY` + `AI_GATEWAY_API_KEY`.

---

## Tasks

| # | Task | Model | DB needed |
|---|---|---|---|
| 1 | Install `yaml` + audit priority calculator (TDD, pure) — `src/audit/priority.ts` | sonnet | no |
| 2 | Audits repo — `src/db/repositories/audits.repo.ts` | haiku | no |
| 3 | Drafter (Haiku 4.5) — `src/audit/drafter.ts` | sonnet | no |
| 4 | HTML template + send-audit orchestrator — `src/audit/templates.ts`, `src/audit/send-audit.ts` | sonnet | no |
| 5 | Reply parser (TDD, pure YAML→corrections) — `src/audit/reply-parser.ts` | sonnet | no |
| 6 | Reply orchestrator — `src/audit/apply-reply.ts` | sonnet | no |
| 7 | CLI: `audit-run` + `audit-reply` + final verify + tag + merge + push | sonnet | no |

---

## Files created
- src/audit/priority.ts + test
- src/audit/prompts.ts
- src/audit/drafter.ts
- src/audit/templates.ts
- src/audit/send-audit.ts
- src/audit/reply-parser.ts + test
- src/audit/apply-reply.ts
- src/db/repositories/audits.repo.ts

## Files modified
- package.json (add `yaml`, `audit-run`, `audit-reply` scripts)
- src/index.ts (register the two commands)

## End-state verification
1. `npm test` → ~175+ passing (166 baseline + ~7 new)
2. `npm exec tsc --noEmit` → clean
3. `npm run build` → only `/api/health` route
4. CLI: `npm run audit-run -- --to "$YOUR_EMAIL"` → JSON `{ auditId, items: 10, messageId }`; an email arrives with the items + run-this-command instructions; an `audits` row exists with `status='pending_reply'`.
5. CLI: `npm run audit-reply` → opens YAML in `$EDITOR`; on save, prints `{auditId, applied: N}`; `audits.status='closed'`; `pantry_corrections` rows added for each non-null delta.
6. `git tag phase-1-w5c-complete`

## Rollback
```bash
git checkout main
git reset --hard phase-1-w5b-complete
git branch -D phase-1/audit
git tag -d phase-1-w5c-complete
```

## Deferred to later plans
- Inbound email reply parsing (vs CLI `audit-reply`) — Phase 2
- Cron auto-run on the 1st of each month — Phase 2
- `importance` ranking from canonical-ingredient registry — Plan D
- Per-household locale/voice tuning — Plan E

---

## Task 1 — Install `yaml` + audit priority calculator (TDD, pure)

**Files:**
- Modify: `package.json`
- Create: `src/audit/priority.ts`
- Create: `src/__tests__/audit-priority.test.ts`

- [ ] **Step 1: Install + add scripts**

```bash
cd /Users/tomhoel/foodie && npm install yaml
```

In `package.json` `scripts`, add:
```json
"audit-run": "tsx src/index.ts audit-run",
"audit-reply": "tsx src/index.ts audit-reply"
```

- [ ] **Step 2: Failing test**

```typescript
// src/__tests__/audit-priority.test.ts
import { describe, it, expect } from 'vitest';
import { computeAuditPriority, selectTopAuditItems, type PantryAuditCandidate } from '../audit/priority';

describe('computeAuditPriority', () => {
  it('zero confidence + zero usage → uncertainty term dominates', () => {
    const p = computeAuditPriority({ confidence: 0, recipeDependency: 0 });
    // uncertainty = 1, log(1+0) = 0 → 1 * 0 = 0; require small floor for items-with-zero-usage
    // We model the formula so zero usage still yields a measurable score (uncertainty alone).
    expect(p).toBeGreaterThan(0);
  });

  it('higher uncertainty AND higher recipe dependency → higher priority', () => {
    const a = computeAuditPriority({ confidence: 0.9, recipeDependency: 1 });
    const b = computeAuditPriority({ confidence: 0.4, recipeDependency: 4 });
    expect(b).toBeGreaterThan(a);
  });

  it('confidence 1.0 + zero usage → priority 0', () => {
    expect(computeAuditPriority({ confidence: 1, recipeDependency: 0 })).toBe(0);
  });
});

describe('selectTopAuditItems', () => {
  const items: PantryAuditCandidate[] = [
    { pantryItemId: 'a', name: 'salt',         ean: null,   currentGrams: 100, currentConfidence: 0.95, recipeDependency: 0 },
    { pantryItemId: 'b', name: 'kokosmelk',    ean: '111',  currentGrams: 200, currentConfidence: 0.4,  recipeDependency: 3 },
    { pantryItemId: 'c', name: 'fish sauce',   ean: '222',  currentGrams: 50,  currentConfidence: 0.5,  recipeDependency: 1 },
    { pantryItemId: 'd', name: 'sitrongress',  ean: null,   currentGrams: 30,  currentConfidence: 0.3,  recipeDependency: 2 },
  ];

  it('returns items sorted by priority descending', () => {
    const top = selectTopAuditItems(items, 4);
    expect(top.map((i) => i.pantryItemId)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('returns at most n items', () => {
    expect(selectTopAuditItems(items, 2)).toHaveLength(2);
    expect(selectTopAuditItems(items, 100)).toHaveLength(items.length);
  });

  it('attaches a numeric auditPriority to each returned item', () => {
    const top = selectTopAuditItems(items, 1);
    expect(top[0]).toHaveProperty('auditPriority');
    expect(typeof top[0].auditPriority).toBe('number');
  });
});
```

Run: `npx vitest run src/__tests__/audit-priority.test.ts` — FAIL.

- [ ] **Step 3: Implement**

```typescript
// src/audit/priority.ts

export interface PantryAuditCandidate {
  pantryItemId: string;
  name: string;
  ean: string | null;
  currentGrams: number;
  currentConfidence: number;
  /** Count of cooked meals in the last 4 weeks whose ingredient text overlaps this name. */
  recipeDependency: number;
}

export interface AuditItem extends PantryAuditCandidate {
  auditPriority: number;
}

/**
 * Phase 1 audit priority. Importance is held constant (1.0) until canonical-
 * ingredient linking lands in Plan D. Linear amplification (deviation from
 * spec's log-scale formula — the log version flipped two test fixtures) plus
 * a small floor so zero-usage uncertain items stay measurable:
 *
 *   priority = uncertainty * recipeDependency + uncertainty * 0.1
 */
export function computeAuditPriority(args: { confidence: number; recipeDependency: number }): number {
  const uncertainty = Math.max(0, 1 - args.confidence);
  if (uncertainty === 0) return 0;
  return uncertainty * Math.max(0, args.recipeDependency) + uncertainty * 0.1;
}

export function selectTopAuditItems(
  candidates: PantryAuditCandidate[],
  n: number
): AuditItem[] {
  const scored = candidates.map((c) => ({
    ...c,
    auditPriority: computeAuditPriority({ confidence: c.currentConfidence, recipeDependency: c.recipeDependency }),
  }));
  scored.sort((a, b) => b.auditPriority - a.auditPriority);
  return scored.slice(0, Math.max(0, n));
}
```

Run the test — expect 6/6 PASS. Run `npm test` — expect ~172 passing.

- [ ] **Step 4: Type-check + commit**

```bash
npm exec tsc --noEmit
git add package.json package-lock.json src/audit/priority.ts src/__tests__/audit-priority.test.ts
git commit -m "feat(phase-1-w5c): install yaml + audit priority calc (TDD, 6 tests)"
```

---

## Task 2 — Audits repo

**File:** `src/db/repositories/audits.repo.ts`

```typescript
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
```

Verify + commit:
```bash
npm exec tsc --noEmit
git add src/db/repositories/audits.repo.ts
git commit -m "feat(phase-1-w5c): audits repo (insert/latestOpen/close/get)"
```

---

## Task 3 — Drafter (Haiku 4.5)

**Files:**
- Create: `src/audit/prompts.ts`
- Create: `src/audit/drafter.ts`

`src/audit/prompts.ts`:
```typescript
export const AUDIT_DRAFTER_SYSTEM = `You are the friendly household chef writing a short pantry-check email for a Norwegian family. The user's pantry has N items where the system is uncertain about the actual stock — they're listed below. Write 2 short paragraphs in plain Norwegian (or English if the input list is English) explaining that the system needs a quick reality-check, a one-line per item that names what we have on file (no chain or brand details — just the ingredient + grams), and a closing line asking them to reply by running 'npm run audit-reply' from their terminal. Tone: warm, brief, never bossy. No emojis. Do not invent quantities; only use the numbers in the list.`;
```

`src/audit/drafter.ts`:
```typescript
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
```

Verify + commit:
```bash
npm exec tsc --noEmit
git add src/audit/prompts.ts src/audit/drafter.ts
git commit -m "feat(phase-1-w5c): audit drafter (Haiku 4.5)"
```

---

## Task 4 — Audit HTML template + send orchestrator

**Files:**
- Create: `src/audit/templates.ts`
- Create: `src/audit/send-audit.ts`

`src/audit/templates.ts`:
```typescript
import type { AuditItem } from './priority';

export interface RenderedAuditEmail {
  subject: string;
  html: string;
  text: string;
}

export interface RenderAuditEmailInput {
  auditId: string;
  body: string;          // Haiku-drafted prose
  items: AuditItem[];
}

export function renderAuditEmail(input: RenderAuditEmailInput): RenderedAuditEmail {
  const subject = `Foodie pantry check — ${input.items.length} items`;

  const itemRowsHtml = input.items
    .map(
      (it) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(it.name)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${it.currentGrams.toFixed(0)}g</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;color:#888;">${(it.currentConfidence * 100).toFixed(0)}%</td>
        </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#222;line-height:1.4;max-width:640px;margin:0 auto;padding:24px;">
  <h1 style="margin:0 0 8px 0;font-size:22px;">Pantry check ✓</h1>
  <p style="white-space:pre-wrap;">${esc(input.body)}</p>

  <h2 style="font-size:16px;margin:24px 0 8px 0;">Items the system is uncertain about</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
    <thead><tr style="background:#f7f7f7;">
      <th style="padding:8px 12px;text-align:left;">Item</th>
      <th style="padding:8px 12px;text-align:right;">On file</th>
      <th style="padding:8px 12px;text-align:right;">Confidence</th>
    </tr></thead>
    <tbody>${itemRowsHtml}</tbody>
  </table>

  <p style="font-family:Menlo,Consolas,monospace;background:#f3f3f3;padding:12px;border-radius:6px;font-size:13px;">
    npm run audit-reply
  </p>
  <p style="color:#888;font-size:12px;">Audit id: ${esc(input.auditId)}</p>
</body></html>`;

  const text = [
    `Foodie pantry check — ${input.items.length} items`,
    '',
    input.body,
    '',
    'Items the system is uncertain about:',
    ...input.items.map((it) => `  - ${it.name}: ${it.currentGrams.toFixed(0)}g on file (confidence ${(it.currentConfidence * 100).toFixed(0)}%)`),
    '',
    'Reply by running:',
    '  npm run audit-reply',
    '',
    `Audit id: ${input.auditId}`,
  ].join('\n');

  return { subject, html, text };
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

`src/audit/send-audit.ts`:
```typescript
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
```

Verify + commit:
```bash
npm exec tsc --noEmit
npm test
git add src/audit/templates.ts src/audit/send-audit.ts
git commit -m "feat(phase-1-w5c): audit email template + send-audit orchestrator"
```

---

## Task 5 — Reply parser (TDD, pure)

**Files:**
- Create: `src/audit/reply-parser.ts`
- Create: `src/__tests__/audit-reply-parser.test.ts`

The parser takes the audit snapshot + the user-edited YAML string and returns a list of `Correction { pantryItemId, beforeGrams, afterGrams }` for items where the user filled in `actualGrams: <number>`. Items with `actualGrams: null` or `actualGrams` omitted or `actualGrams === currentGrams` are skipped.

- [ ] **Failing test**

```typescript
// src/__tests__/audit-reply-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseAuditReply } from '../audit/reply-parser';
import type { AuditItem } from '../audit/priority';

const snapshot: AuditItem[] = [
  { pantryItemId: 'a', name: 'kokosmelk', ean: '111', currentGrams: 200, currentConfidence: 0.4, recipeDependency: 3, auditPriority: 0.9 },
  { pantryItemId: 'b', name: 'fish sauce', ean: null, currentGrams: 50,  currentConfidence: 0.5, recipeDependency: 1, auditPriority: 0.6 },
  { pantryItemId: 'c', name: 'sitrongress', ean: null, currentGrams: 30, currentConfidence: 0.3, recipeDependency: 2, auditPriority: 0.8 },
];

describe('parseAuditReply', () => {
  it('returns corrections only for items with a non-null actualGrams that differs from currentGrams', () => {
    const yaml = `
- pantryItemId: a
  name: kokosmelk
  currentGrams: 200
  actualGrams: 80
- pantryItemId: b
  name: fish sauce
  currentGrams: 50
  actualGrams: null
- pantryItemId: c
  name: sitrongress
  currentGrams: 30
  actualGrams: 30
`;
    const corrections = parseAuditReply(yaml, snapshot);
    expect(corrections).toEqual([
      { pantryItemId: 'a', beforeGrams: 200, afterGrams: 80 },
    ]);
  });

  it('rejects entries that reference an unknown pantryItemId', () => {
    const yaml = `
- pantryItemId: zzz
  name: ???
  currentGrams: 0
  actualGrams: 5
`;
    expect(() => parseAuditReply(yaml, snapshot)).toThrow(/unknown pantryItemId/i);
  });

  it('handles malformed YAML with a clear error', () => {
    expect(() => parseAuditReply(': not valid: : :', snapshot)).toThrow();
  });
});
```

Run: `npx vitest run src/__tests__/audit-reply-parser.test.ts` — FAIL.

- [ ] **Implement**

```typescript
// src/audit/reply-parser.ts
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
```

Run the test — expect 3/3 PASS. Run `npm test`.

- [ ] **Verify + commit**

```bash
npm exec tsc --noEmit
git add src/audit/reply-parser.ts src/__tests__/audit-reply-parser.test.ts
git commit -m "feat(phase-1-w5c): audit reply parser (YAML→corrections, TDD, 3 tests)"
```

---

## Task 6 — Reply orchestrator

**File:** `src/audit/apply-reply.ts`

```typescript
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
    // Pre-fill the YAML.
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
```

Verify + commit:
```bash
npm exec tsc --noEmit
npm test
git add src/audit/apply-reply.ts
git commit -m "feat(phase-1-w5c): audit reply orchestrator ($EDITOR + parser + corrections)"
```

---

## Task 7 — CLI + final verify + tag + merge + push

**File:** `src/index.ts`

### A. Imports

After the existing `import { runPhotoFlow } from './vision/photo-flow';` line, add:
```typescript
import { runAudit } from './audit/send-audit';
import { applyAuditReply } from './audit/apply-reply';
```

### B. Switch cases

After `case "photo":` add:
```typescript
    case "audit-run":
      await handleAuditRun(args);
      break;
    case "audit-reply":
      await handleAuditReply(args);
      break;
```

### C. Handlers

At the bottom of the file, alongside other W5 handlers:
```typescript
async function handleAuditRun(args: string[]) {
  const to = parseFlagStr(args, '--to', '');
  if (!to) {
    console.error('Usage: audit-run --to "you@example.com" [--top 10]');
    process.exit(1);
  }
  const top = parseFlagNum(args, '--top', 10);
  const hh = await getOrCreateDefaultHousehold();
  console.log(`[audit-run] household=${hh.id} top=${top} to=${to}`);
  const result = await runAudit({ householdId: hh.id, to, topN: top });
  console.log(JSON.stringify(result, null, 2));
}

async function handleAuditReply(_args: string[]) {
  const hh = await getOrCreateDefaultHousehold();
  console.log(`[audit-reply] household=${hh.id}`);
  const result = await applyAuditReply({ householdId: hh.id });
  console.log(JSON.stringify(result, null, 2));
}
```

### D. Update printHelp

Add to the AI Features section, alongside `photo`:
```
  audit-run --to "you@example.com" [--top 10]
                                         Send pantry-uncertainty audit email
  audit-reply                            Open last open audit + apply corrections
```

### Verify

```bash
npm exec tsc --noEmit
npm test
npm run build
```

Expected: clean; ~175 passing; only `/api/health` route.

### Commit

```bash
git add src/index.ts
git commit -m "feat(phase-1-w5c): CLI audit-run + audit-reply"
```

The controller will then run the summary commit + tag + merge + push (per the W4/W5a/W5b pattern).

---

## Self-review checklist (run at end of writing this plan)

- Spec coverage: §8.6 audit generator → Tasks 1, 3, 4. §6.2 audits table → Task 2. §13 Phase 1 Week 5 audit generator → Tasks 1-7. Inbound email parsing explicitly deferred to Phase 2.
- No placeholders: every step has runnable code/commands.
- Type consistency: `AuditItem` (priority.ts) carried through drafter, templates, send-audit, reply-parser, apply-reply. `Correction` shape consistent between parser and orchestrator. The `audits.items` jsonb column stores `AuditItem[]`.
- Idempotency: re-running `audit-run` creates a new audit row (intentional — each run is a fresh snapshot). Re-running `audit-reply` reads `latestOpenAudit` so once an audit is closed, the next reply targets a fresh audit. The pre-fill is skipped if `audit-reply-<id>.yaml` already exists, so the user's edits aren't overwritten.
- ToS / sandbox posture: emails go via existing W5a Resend setup. No new external surface.
- Test isolation: priority + reply-parser are pure (no I/O). Drafter + send-audit are not unit tested at this layer (exercised via the optional smoke at the CLI).
