# Foodie Phase 1 Week 5a — Sunday plan email delivery

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the weekly plan + cost breakdown + Trumf estimate + narration as an HTML email and send it via Resend's API. Expose a CLI command `send-plan-email` for manual Sunday trigger (Vercel cron is Phase 2 ops hardening). This closes the Phase-1 user-facing loop: every Sunday the user runs one command and receives a fully-realized weekly plan in their inbox.

**Architecture:**
- **Resend client** (~30 LOC): thin wrapper around `resend` SDK; `from = "Foodie <onboarding@resend.dev>"` (Resend's sandbox sender — no domain setup needed in Phase 1).
- **HTML template**: pure function `renderWeeklyPlanEmail(input) → { subject, html, text }`. Inputs are the existing `PlanWeekResult` shape from W4a + the recipe titles + per-store breakdown from the optimizer's `PlanCost`. No JSX, no React — string templating with HTML escaping. A plain-text fallback is emitted alongside the HTML.
- **Orchestrator** `sendWeeklyPlanEmail(args)`: calls `planWeek` (W4a), pulls the recipes by ID, computes a fresh `PlanCost` for the chosen plan, renders the email, sends via Resend.
- **CLI** `send-plan-email --to user@example.com [--week-start YYYY-MM-DD]`: end-to-end one-shot.
- Tests: pure renderer tested with golden-output snapshot; Resend client tested with mock fetch.
- Real Resend API never called in tests.

**Tech Stack:** TypeScript 5.7, `resend@^4.x` (new dep), vitest, AI SDK v6 (already installed), Supabase (already installed). No new infra.

**Spec reference:** docs/superpowers/specs/2026-04-27-foodie-grocery-planner-design.md (§5.3 step 7 "waitUntil: send email summary"; §13 Phase 1 Week 5)

**Predecessor:** phase-1-w4b-complete

**Prerequisite (parallel):** Migration 005 already applied. Real send requires `RESEND_API_KEY` + verified recipient (in sandbox mode Resend only sends to the email associated with the API key holder's account; Phase 2 adds a custom domain).

---

## Tasks

| # | Task | Model | DB needed |
|---|---|---|---|
| 1 | Install `resend` + add config block | haiku | no |
| 2 | Email HTML/text renderer (TDD, pure) — `src/email/templates.ts` | sonnet | no |
| 3 | Resend client (TDD, mock fetch) — `src/email/client.ts` | sonnet | no |
| 4 | `sendWeeklyPlanEmail` orchestrator — `src/email/send-weekly-plan.ts` | sonnet | no |
| 5 | CLI: `send-plan-email` + final verify + tag | sonnet | no |

---

## Files created
- src/email/client.ts + test
- src/email/templates.ts + test
- src/email/send-weekly-plan.ts

## Files modified
- package.json (add `resend`, `send-plan-email` script)
- src/config.ts (add `email` block)
- src/index.ts (register `send-plan-email`)
- .env.example (add `RESEND_API_KEY`, `RESEND_FROM`)

## End-state verification
1. `npm test` → ~165+ passing (155 baseline + ~8 new)
2. `npm exec tsc --noEmit` → clean
3. `npm run build` → only `/api/health` route
4. CLI: `npm run send-plan-email -- --to "$YOUR_EMAIL"` (with `RESEND_API_KEY` + `AI_GATEWAY_API_KEY` + ≥5 recipes) → JSON `{ messageId: "...", mealPlanId: "..." }`; an email arrives at the configured address with Subject "Foodie weekly plan — week of YYYY-MM-DD" and an HTML body listing recipes, total NOK, Trumf bonus, per-store breakdown, narration paragraph.
5. `git tag phase-1-w5a-complete`

## Rollback
```bash
git checkout main
git reset --hard phase-1-w4b-complete
git branch -D phase-1/sunday-email
git tag -d phase-1-w5a-complete
```

## Deferred to later plans
- Vercel cron auto-trigger (Sunday 06:00 UTC) — Phase 2
- Custom sender domain (`noreply@foodie.app`) — Phase 2
- Vercel Queue + Workflow DevKit for durable retries on send — Phase 2
- React Email components / Tailwind-styled template — Phase 3 frontend
- Multi-recipient households (currently `--to` is a single address) — when auth lands in Phase 2
- Click-to-confirm "I cooked this" links in the email body — W5b/W5c

---

## Task 1 — Install Resend + config

**Files:**
- Modify: `package.json`
- Modify: `src/config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install dependency**

```bash
npm install resend
```

- [ ] **Step 2: Add npm script**

In `package.json` `scripts`, add:
```json
"send-plan-email": "tsx src/index.ts send-plan-email"
```

- [ ] **Step 3: Add `email` config block**

In `src/config.ts`, add a sibling block after the existing `aiGateway` block (before `meny`):
```typescript
  email: {
    resendApiKey: process.env.RESEND_API_KEY || "",
    from: process.env.RESEND_FROM || "Foodie <onboarding@resend.dev>",
  },
```

Do NOT add `RESEND_API_KEY` to `validateConfig()` — only `send-plan-email` needs it; we don't want every other CLI command to fail when it's unset. The orchestrator (Task 4) will check it directly.

- [ ] **Step 4: Document env vars**

Append to `.env.example`:
```
# Resend — Phase 1 email delivery (sandbox sender; Phase 2 swaps for noreply@foodie.app)
RESEND_API_KEY=
RESEND_FROM="Foodie <onboarding@resend.dev>"
```

- [ ] **Step 5: Verify**

```bash
npm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/config.ts .env.example
git commit -m "chore(phase-1-w5a): install resend + add email config block"
```

---

## Task 2 — Email renderer (TDD, pure)

**Files:**
- Create: `src/email/templates.ts`
- Create: `src/__tests__/email-templates.test.ts`

The renderer is pure: `(input) → { subject, html, text }`. No I/O, no LLM calls.

- [ ] **Step 1: Failing test**

```typescript
// src/__tests__/email-templates.test.ts
import { describe, it, expect } from 'vitest';
import { renderWeeklyPlanEmail } from '../email/templates';

describe('renderWeeklyPlanEmail', () => {
  const baseInput = {
    weekStart: '2026-05-04',
    recipes: [
      { id: 'r1', title: 'Tom Kha Gai', plannedFor: '2026-05-04', servings: 4, costNok: 87.5 },
      { id: 'r2', title: 'Pad Thai',    plannedFor: '2026-05-05', servings: 4, costNok: 112.0 },
    ],
    totalNok: 199.5,
    trumfEstimateNok: 1.99,
    pantrySavingsNok: 0,
    storeStops: 2,
    storeBreakdown: [
      { dealer: 'KIWI' as const, subtotal: 145.0, trumfEarned: 1.45 },
      { dealer: 'MENY' as const, subtotal: 54.5,  trumfEarned: 0.55 },
    ],
    narration: 'A balanced week of Thai favourites, leaning on Kiwi this week because of their kokosmelk offer.',
    warnings: [] as string[],
  };

  it('subject mentions the week-start date', () => {
    const out = renderWeeklyPlanEmail(baseInput);
    expect(out.subject).toBe('Foodie weekly plan — week of 2026-05-04');
  });

  it('html body lists every recipe by title with cost', () => {
    const out = renderWeeklyPlanEmail(baseInput);
    expect(out.html).toContain('Tom Kha Gai');
    expect(out.html).toContain('Pad Thai');
    expect(out.html).toContain('87.50');
    expect(out.html).toContain('112.00');
  });

  it('html body shows total NOK + Trumf + per-store breakdown', () => {
    const out = renderWeeklyPlanEmail(baseInput);
    expect(out.html).toContain('199.50');     // total
    expect(out.html).toContain('1.99');       // trumf
    expect(out.html).toContain('KIWI');
    expect(out.html).toContain('MENY');
    expect(out.html).toContain('145.00');     // kiwi subtotal
    expect(out.html).toContain('54.50');      // meny subtotal
  });

  it('html body includes the narration paragraph', () => {
    const out = renderWeeklyPlanEmail(baseInput);
    expect(out.html).toContain('balanced week of Thai favourites');
  });

  it('text fallback contains the same numeric facts', () => {
    const out = renderWeeklyPlanEmail(baseInput);
    expect(out.text).toContain('Tom Kha Gai');
    expect(out.text).toContain('199.50');
    expect(out.text).toContain('KIWI 145.00');
  });

  it('escapes HTML special chars in recipe titles', () => {
    const out = renderWeeklyPlanEmail({
      ...baseInput,
      recipes: [{ id: 'r1', title: '<script>alert(1)</script>', plannedFor: '2026-05-04', servings: 4, costNok: 50 }],
    });
    expect(out.html).not.toContain('<script>alert(1)</script>');
    expect(out.html).toContain('&lt;script&gt;');
  });

  it('warnings block appears only when warnings is non-empty', () => {
    const withWarnings = renderWeeklyPlanEmail({ ...baseInput, warnings: ['no candidate for "fish sauce"'] });
    expect(withWarnings.html).toContain('Warnings');
    expect(withWarnings.html).toContain('fish sauce');

    const without = renderWeeklyPlanEmail(baseInput);
    expect(without.html).not.toContain('Warnings');
  });
});
```

Run: `npx vitest run src/__tests__/email-templates.test.ts` — expect FAIL (module not found).

- [ ] **Step 2: Implement**

```typescript
// src/email/templates.ts

export interface WeeklyPlanEmailInput {
  weekStart: string;
  recipes: Array<{
    id: string;
    title: string;
    plannedFor: string;
    servings: number;
    costNok: number;
  }>;
  totalNok: number;
  trumfEstimateNok: number;
  pantrySavingsNok: number;
  storeStops: number;
  storeBreakdown: Array<{
    dealer: string;
    subtotal: number;
    trumfEarned: number;
  }>;
  narration: string;
  warnings: string[];
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderWeeklyPlanEmail(input: WeeklyPlanEmailInput): RenderedEmail {
  const subject = `Foodie weekly plan — week of ${input.weekStart}`;

  const recipeRowsHtml = input.recipes
    .map(
      (r) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(formatDay(r.plannedFor))}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(r.title)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${formatNok(r.costNok)}</td>
        </tr>`
    )
    .join('');

  const storeRowsHtml = input.storeBreakdown
    .map(
      (s) =>
        `<tr>
          <td style="padding:6px 12px;">${esc(s.dealer)}</td>
          <td style="padding:6px 12px;text-align:right;">${formatNok(s.subtotal)}</td>
          <td style="padding:6px 12px;text-align:right;color:#888;">+${formatNok(s.trumfEarned)} Trumf</td>
        </tr>`
    )
    .join('');

  const warningsHtml = input.warnings.length
    ? `<h3 style="margin-top:24px;color:#a00;">Warnings</h3>
       <ul>${input.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`
    : '';

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#222;line-height:1.4;max-width:640px;margin:0 auto;padding:24px;">
  <h1 style="margin:0 0 8px 0;font-size:22px;">Your week, planned 🍳</h1>
  <p style="color:#666;margin:0 0 24px 0;">Week of ${esc(input.weekStart)}</p>

  <h2 style="font-size:16px;margin:0 0 8px 0;">Meals</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
    <thead><tr style="background:#f7f7f7;">
      <th style="padding:8px 12px;text-align:left;">Day</th>
      <th style="padding:8px 12px;text-align:left;">Recipe</th>
      <th style="padding:8px 12px;text-align:right;">Cost</th>
    </tr></thead>
    <tbody>${recipeRowsHtml}</tbody>
    <tfoot><tr>
      <td colspan="2" style="padding:8px 12px;font-weight:600;border-top:2px solid #222;">Total</td>
      <td style="padding:8px 12px;font-weight:600;text-align:right;border-top:2px solid #222;">${formatNok(input.totalNok)}</td>
    </tr></tfoot>
  </table>

  <h2 style="font-size:16px;margin:0 0 8px 0;">Where to shop</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px;">
    <tbody>${storeRowsHtml}</tbody>
  </table>
  <p style="color:#666;font-size:13px;margin:0 0 24px 0;">${input.storeStops} ${input.storeStops === 1 ? 'stop' : 'stops'} · estimated Trumf bonus ${formatNok(input.trumfEstimateNok)} NOK${input.pantrySavingsNok > 0 ? ` · pantry savings ${formatNok(input.pantrySavingsNok)} NOK` : ''}</p>

  <h2 style="font-size:16px;margin:0 0 8px 0;">Why this plan</h2>
  <p style="white-space:pre-wrap;">${esc(input.narration)}</p>

  ${warningsHtml}
</body></html>`;

  const text = [
    `Foodie weekly plan — week of ${input.weekStart}`,
    '',
    'Meals:',
    ...input.recipes.map((r) => `  ${formatDay(r.plannedFor)} — ${r.title} (${formatNok(r.costNok)} NOK)`),
    '',
    `Total: ${formatNok(input.totalNok)} NOK`,
    `Trumf bonus: ${formatNok(input.trumfEstimateNok)} NOK`,
    input.pantrySavingsNok > 0 ? `Pantry savings: ${formatNok(input.pantrySavingsNok)} NOK` : '',
    `Stops: ${input.storeStops}`,
    '',
    'Per store:',
    ...input.storeBreakdown.map((s) => `  ${s.dealer} ${formatNok(s.subtotal)} NOK (+${formatNok(s.trumfEarned)} Trumf)`),
    '',
    'Why this plan:',
    input.narration,
    '',
    ...(input.warnings.length ? ['Warnings:', ...input.warnings.map((w) => `  - ${w}`)] : []),
  ]
    .filter((line) => line !== '')
    .join('\n');

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

function formatNok(n: number): string {
  return n.toFixed(2);
}

function formatDay(iso: string): string {
  // YYYY-MM-DD → "Mon May 4"
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
```

Run: `npx vitest run src/__tests__/email-templates.test.ts` — expect 7/7 PASS.

- [ ] **Step 3: Type-check + commit**

```bash
npm exec tsc --noEmit
git add src/email/templates.ts src/__tests__/email-templates.test.ts
git commit -m "feat(phase-1-w5a): pure email renderer (HTML + text fallback, TDD, 7 tests)"
```

---

## Task 3 — Resend client (TDD)

**Files:**
- Create: `src/email/client.ts`
- Create: `src/__tests__/email-client.test.ts`

The client is a thin wrapper around `resend.emails.send`. We inject the Resend instance for testability — production path constructs it from env, tests inject a fake.

- [ ] **Step 1: Failing test**

```typescript
// src/__tests__/email-client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { sendEmail, type EmailSender } from '../email/client';

describe('sendEmail', () => {
  it('forwards subject/html/text + from/to to the underlying sender', async () => {
    const send = vi.fn(async () => ({ data: { id: 'msg-123' }, error: null }));
    const fake: EmailSender = { emails: { send } };

    const out = await sendEmail({
      sender: fake,
      from: 'Foodie <onboarding@resend.dev>',
      to: 'tom@example.com',
      subject: 'Test',
      html: '<p>hi</p>',
      text: 'hi',
    });

    expect(out).toEqual({ messageId: 'msg-123' });
    expect(send).toHaveBeenCalledOnce();
    const args = send.mock.calls[0][0];
    expect(args.from).toBe('Foodie <onboarding@resend.dev>');
    expect(args.to).toEqual(['tom@example.com']);
    expect(args.subject).toBe('Test');
    expect(args.html).toBe('<p>hi</p>');
    expect(args.text).toBe('hi');
  });

  it('throws with a useful message when the sender returns an error', async () => {
    const send = vi.fn(async () => ({ data: null, error: { message: 'invalid api key' } }));
    const fake: EmailSender = { emails: { send } };

    await expect(
      sendEmail({
        sender: fake,
        from: 'x@y.z',
        to: 't@u.v',
        subject: 'x',
        html: 'x',
        text: 'x',
      })
    ).rejects.toThrow(/invalid api key/);
  });
});
```

Run: `npx vitest run src/__tests__/email-client.test.ts` — FAIL.

- [ ] **Step 2: Implement**

```typescript
// src/email/client.ts

/**
 * Minimal interface against the resend SDK we actually use. Lets us inject a
 * fake in tests without pulling the real Resend client into the test process.
 */
export interface EmailSender {
  emails: {
    send: (args: {
      from: string;
      to: string[];
      subject: string;
      html: string;
      text: string;
    }) => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
  };
}

export interface SendEmailArgs {
  sender: EmailSender;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  messageId: string;
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const res = await args.sender.emails.send({
    from: args.from,
    to: [args.to],
    subject: args.subject,
    html: args.html,
    text: args.text,
  });
  if (res.error) throw new Error(`sendEmail: ${res.error.message}`);
  if (!res.data) throw new Error('sendEmail: no message id returned');
  return { messageId: res.data.id };
}

/**
 * Production helper — instantiates a real Resend client from the API key.
 * Imported lazily so tests don't pay the cost of loading the SDK.
 */
export async function buildResendSender(apiKey: string): Promise<EmailSender> {
  if (!apiKey) throw new Error('buildResendSender: RESEND_API_KEY is required');
  const { Resend } = await import('resend');
  return new Resend(apiKey) as unknown as EmailSender;
}
```

Run: `npx vitest run src/__tests__/email-client.test.ts` — expect 2/2 PASS.

- [ ] **Step 3: Type-check + full suite + commit**

```bash
npm exec tsc --noEmit
npm test
git add src/email/client.ts src/__tests__/email-client.test.ts
git commit -m "feat(phase-1-w5a): resend client wrapper (TDD, 2 tests, lazy SDK import)"
```

---

## Task 4 — `sendWeeklyPlanEmail` orchestrator

**Files:**
- Create: `src/email/send-weekly-plan.ts`

Wires planWeek → fresh PlanCost computation (so the email reflects exactly what was persisted) → renderer → Resend send.

- [ ] **Step 1: Implement**

```typescript
// src/email/send-weekly-plan.ts

import { planWeek, type PlanWeekArgs } from '../planner';
import { renderWeeklyPlanEmail } from './templates';
import { sendEmail, buildResendSender } from './client';
import { config } from '../config';
import { getRecipe } from '../db/repositories/recipes.repo';
import { listEligibleRecipes } from '../db/repositories/cookbook.repo';
import { getRecentCompletedMeals } from '../db/repositories/plans.repo';
import { getPantrySummary } from '../db/repositories/pantry.repo';
import { listActiveOffersForChains } from '../db/repositories/active-offers.repo';
import { resolveIngredients } from '../optimizer/ingredient-resolver';
import { computePlanCost } from '../optimizer/optimizer';
import type { ChainCode } from '../ingestion/adapter.interface';

export interface SendWeeklyPlanArgs extends PlanWeekArgs {
  to: string;
}

export interface SendWeeklyPlanResult {
  messageId: string;
  mealPlanId: string;
  recipeIds: string[];
  totalNok: number;
}

export async function sendWeeklyPlanEmail(args: SendWeeklyPlanArgs): Promise<SendWeeklyPlanResult> {
  if (!config.email.resendApiKey) {
    throw new Error('RESEND_API_KEY is not set. Add it to your .env.');
  }

  // 1. Generate + persist the plan (this is the existing W4a entrypoint).
  const planResult = await planWeek({
    householdId: args.householdId,
    weekStart: args.weekStart,
    recipeCount: args.recipeCount,
    weeklyBudgetNok: args.weeklyBudgetNok,
    allowedChains: args.allowedChains,
  });

  // 2. Recompute the cost for *exactly* the chosen recipes so the email shows the
  //    same numbers the planner committed. (planWeek persists narration but
  //    discards the final PlanCost; cheaper to recompute than re-architect.)
  const recipes = await Promise.all(planResult.recipeIds.map((id) => getRecipe(id)));
  const eligibleRecipes = new Map(planResult.recipeIds.map((id, i) => [id, recipes[i]!]).filter(([, r]) => r));

  const allowedChains: ChainCode[] = args.allowedChains ?? ['MENY', 'KIWI', 'AFOOD'];
  const allIngredientNames = new Set<string>();
  for (const r of eligibleRecipes.values()) {
    for (const ing of r.ingredients) {
      if (typeof ing.quantity_grams === 'number' && ing.quantity_grams > 0) {
        allIngredientNames.add(ing.raw_text.replace(/^\s*\d+(?:[.,/]\d+)?\s*\S*\s*/, '').trim().toLowerCase());
      }
    }
  }
  const productCandidates = await resolveIngredients(Array.from(allIngredientNames), { chains: allowedChains });
  const pantry = await getPantrySummary(args.householdId);

  const cost = computePlanCost({
    mealPlan: planResult.recipeIds.map((id, i) => ({ recipeId: id, servings: planResult.servings[i] })),
    recipes: eligibleRecipes,
    pantry: pantry.map((p) => ({ canonicalName: p.canonicalName, grams: p.grams, confidence: p.confidence })),
    productCandidatesPerIngredient: productCandidates,
    householdContext: {
      allowedChains,
      weeklyBudgetNok: args.weeklyBudgetNok ?? 1500,
      storeStopPenaltyNok: 10,
    },
  });

  // 3. Build the email input shape.
  const startDate = new Date(`${args.weekStart}T00:00:00Z`);
  const recipeEntries = planResult.recipeIds.map((id, i) => {
    const r = eligibleRecipes.get(id)!;
    const recipeCost = cost.perRecipe.find((p) => p.recipeId === id)?.costNok ?? 0;
    return {
      id,
      title: r.recipe.title,
      plannedFor: new Date(startDate.getTime() + i * 86_400_000).toISOString().slice(0, 10),
      servings: planResult.servings[i],
      costNok: recipeCost,
    };
  });

  const rendered = renderWeeklyPlanEmail({
    weekStart: args.weekStart,
    recipes: recipeEntries,
    totalNok: cost.totalNok,
    trumfEstimateNok: cost.trumfEstimateNok,
    pantrySavingsNok: cost.pantrySavingsNok,
    storeStops: cost.storeStops,
    storeBreakdown: cost.storeBreakdown.map((s) => ({
      dealer: String(s.dealer),
      subtotal: s.subtotal,
      trumfEarned: s.trumfEarned,
    })),
    narration: planResult.narration,
    warnings: planResult.warnings,
  });

  // 4. Send.
  const sender = await buildResendSender(config.email.resendApiKey);
  const sent = await sendEmail({
    sender,
    from: config.email.from,
    to: args.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  return {
    messageId: sent.messageId,
    mealPlanId: planResult.mealPlanId,
    recipeIds: planResult.recipeIds,
    totalNok: cost.totalNok,
  };
}

// Suppress the otherwise-unused `listEligibleRecipes` and `getRecentCompletedMeals`
// imports that future-W5b/c will pick up. Keep them available so downstream
// orchestrators don't need to re-import; tree-shaking trims them at build time.
export const _unused = { listEligibleRecipes, getRecentCompletedMeals };
```

- [ ] **Step 2: Type-check + commit**

```bash
npm exec tsc --noEmit
npm test
git add src/email/send-weekly-plan.ts
git commit -m "feat(phase-1-w5a): sendWeeklyPlanEmail orchestrator (planWeek + renderer + resend)"
```

---

## Task 5 — CLI + final verify + tag

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add imports**

After existing imports, add:
```typescript
import { sendWeeklyPlanEmail } from './email/send-weekly-plan';
```

- [ ] **Step 2: Add switch case**

In `main()`'s switch, alongside `case "plan-week":`, add:
```typescript
    case "send-plan-email":
      await handleSendPlanEmail(args);
      break;
```

- [ ] **Step 3: Add handler**

At the bottom of the file, alongside `handlePlanWeek`/`handleTrumfSync`, add:
```typescript
async function handleSendPlanEmail(args: string[]) {
  const to = parseFlagStr(args, '--to', '');
  if (!to) {
    console.error('Usage: send-plan-email --to "you@example.com" [--week-start YYYY-MM-DD] [--recipes 5] [--budget 1500] [--chains MENY,KIWI,AFOOD]');
    process.exit(1);
  }
  const recipeCount = parseFlagNum(args, '--recipes', 5);
  const weeklyBudgetNok = parseFlagNum(args, '--budget', 1500);
  const chainsRaw = parseFlagStr(args, '--chains', 'MENY,KIWI,AFOOD');
  const allowedChains = chainsRaw.split(',').map((c) => c.trim().toUpperCase()) as ChainCode[];
  const weekStartFlag = parseFlagStr(args, '--week-start', '');
  const weekStart = weekStartFlag || nextMondayIsoDate();

  const hh = await getOrCreateDefaultHousehold();
  console.log(`[send-plan-email] household=${hh.id} weekStart=${weekStart} to=${to}`);
  const result = await sendWeeklyPlanEmail({
    householdId: hh.id,
    weekStart,
    recipeCount,
    weeklyBudgetNok,
    allowedChains,
    to,
  });
  console.log(JSON.stringify(result, null, 2));
}
```

- [ ] **Step 4: Update help text**

In `printHelp()`, alongside the `plan-week` and `trumf-sync` lines, add:
```
  send-plan-email --to "you@example.com" [--week-start YYYY-MM-DD]
                                         Plan + email weekly meal plan
```

- [ ] **Step 5: Full verify**

```bash
npm exec tsc --noEmit
npm test
npm run build
```
Expected: clean; ~165 passing; only `/api/health` route.

- [ ] **Step 6: End-to-end smoke (optional — requires `RESEND_API_KEY`, `AI_GATEWAY_API_KEY`, ≥5 recipes)**

```bash
npm run send-plan-email -- --to "$YOUR_EMAIL"
```
Expected JSON: `{messageId: "...", mealPlanId: "...", recipeIds: [...], totalNok: ...}`. An email arrives at `$YOUR_EMAIL` (Resend sandbox sender restricts to the API-key-owner's inbox until a domain is verified).

- [ ] **Step 7: Commit**

```bash
git add src/index.ts
git commit -m "feat(phase-1-w5a): CLI send-plan-email"
```

- [ ] **Step 8: Summary commit + tag + merge + push**

```bash
git commit --allow-empty -m "Phase 1 Week 5a: Sunday plan email delivery complete"
git tag phase-1-w5a-complete
git checkout main
git merge --ff-only phase-1/sunday-email
git push origin main
git push origin phase-1-w5a-complete
git branch -d phase-1/sunday-email
```

---

## Self-review checklist (run at end of writing this plan)

- Spec coverage: §5.3 step 7 (send email summary) — Tasks 2–5. §13 Week 5 "first real Sunday batch sent to your inbox" — full flow ships in Task 5. Vision pipeline (§8.3) and audit generator (§8.6) explicitly deferred to W5b/W5c. Vercel cron auto-trigger explicitly deferred to Phase 2.
- No placeholders: every step has runnable code/commands.
- Type consistency: `WeeklyPlanEmailInput` (Task 2) ↔ `sendWeeklyPlanEmail` (Task 4) shape matches; `ChainCode` consistent; `PlanWeekResult` field names (`mealPlanId`, `recipeIds`, `servings`, `narration`, `warnings`) match the W4a `planner/index.ts` export.
- HTML escaping is applied at every interpolated user-data point (recipe titles, narration, warnings, dealer codes, weekStart).
- Test isolation: renderer tests are pure (no I/O); email-client tests use a fake `EmailSender` (no resend SDK needed at runtime).
- ToS / sandbox posture: defaults to Resend's free `onboarding@resend.dev` sender — no domain ownership required. Phase 2 swaps for `noreply@foodie.app`.
