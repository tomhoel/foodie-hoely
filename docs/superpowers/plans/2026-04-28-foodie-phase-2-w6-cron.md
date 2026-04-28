# Foodie Phase 2 Week 6 — Cron automation (hands-off Sunday loop)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual Phase-1 CLI runs with Vercel cron schedules. By end of W6 the user no longer runs `send-plan-email` on Sundays — the deployed instance does it automatically. Three cron endpoints land: `/api/cron/sync` (daily ingestion refresh), `/api/cron/plan-week` (Sunday morning plan + email), `/api/cron/audit-month` (monthly pantry audit). All endpoints reuse the existing Phase-1 orchestrators (`runSync`, `planWeek`, `sendWeeklyPlanEmail`, `runAudit`) — zero duplication of business logic.

**Architecture:**
- **Cron auth**: every endpoint verifies `Authorization: Bearer ${CRON_SECRET}` via a small helper `verifyCronAuth(req)` that returns 401 if missing/wrong. Vercel injects this header automatically when calling `/api/cron/*` paths.
- **Recipient email**: configurable via `FOODIE_RECIPIENT_EMAIL` env var (single household for now; Phase 2 W7 introduces per-household settings). Cron handlers read it; CLI handlers continue to take `--to` flag.
- **Endpoints are thin**: each cron handler is ~20 LOC — auth check → call existing orchestrator → return JSON summary. Long-running calls (planner ≈ 30-60s, sync ≈ 2-5min) are within Vercel Functions' 300s default `maxDuration`. The planner cron declares `maxDuration: 600` for headroom.
- **Trumf is NOT cron'd in W6**: bearer token lives at `~/.foodie/trumf-token.json` on the user's machine, not on Vercel. Phase-2-W7 (broker on Vercel Sandbox) is when Trumf becomes server-side. For now, the user still runs `npm run trumf-sync` locally before the Sunday cron fires.
- **Testing**: cron-auth helper is unit-tested (TDD, 3 cases). Endpoints themselves are integration-only (smoke test via `curl localhost:3000/api/cron/sync` with the Bearer header). Real cron runs are deployment-time concerns.

**Tech Stack:** Next.js 16 (already installed), Node runtime, existing AI SDK / Resend / Supabase deps. No new dependencies.

**Spec reference:** docs/superpowers/specs/2026-04-27-foodie-grocery-planner-design.md (§9.1 cron schedule; §5.3 Sunday batch flow)

**Predecessor:** phase-1-complete

**Prerequisite:** Vercel project deployed; `CRON_SECRET`, `FOODIE_RECIPIENT_EMAIL`, `RESEND_API_KEY`, `AI_GATEWAY_API_KEY`, all the Supabase + Kassalapp keys set in Vercel env. Local testing works without deployment via `npx tsx` or `next dev`.

---

## Tasks

| # | Task | Model | DB needed |
|---|---|---|---|
| 1 | Cron auth helper (TDD, 3 tests) — `src/api/cron-auth.ts` | sonnet | no |
| 2 | Add `FOODIE_RECIPIENT_EMAIL` to config + .env.example | haiku | no |
| 3 | `/api/cron/sync` endpoint (meny + kiwi + etilbudsavis) | sonnet | no |
| 4 | `/api/cron/plan-week` endpoint (planWeek + sendWeeklyPlanEmail) | sonnet | no |
| 5 | `/api/cron/audit-month` endpoint (runAudit) | haiku | no |
| 6 | `vercel.ts` cron schedule + final verify + tag + merge + push | sonnet | no |

---

## Files created
- src/api/cron-auth.ts + test
- app/api/cron/sync/route.ts
- app/api/cron/plan-week/route.ts
- app/api/cron/audit-month/route.ts

## Files modified
- src/config.ts (add `app.recipientEmail`)
- .env.example (add `FOODIE_RECIPIENT_EMAIL`, document `CRON_SECRET`)
- vercel.ts (replace stub cron with real schedule)

## End-state verification
1. `npm test` → ~178+ passing (175 baseline + 3 new — cron-auth)
2. `npm exec tsc --noEmit` → clean
3. `npm run build` → routes `/api/health`, `/api/cron/sync`, `/api/cron/plan-week`, `/api/cron/audit-month` listed
4. Local smoke: `next dev &` then `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync` → JSON response (assuming env is set)
5. Local smoke: same for `plan-week` and `audit-month`
6. `git tag phase-2-w6-complete`

## Rollback
```bash
git checkout main
git reset --hard phase-1-complete
git branch -D phase-2/cron
git tag -d phase-2-w6-complete
```

## Deferred to later plans
- `/api/cron/trumf-refresh` (per-household receipt pull) — needs Phase-2 token broker (W7)
- `/api/cron/sync-meny`, `sync-kassalapp`, etc. as separate endpoints — combined `sync` is fine for one-household; per-chain split lands when concurrency matters
- `/api/cron/offer-diff` (hourly etilbudsavis diff) — Plan D mid-week reactivity
- Per-household settings (notification email, schedule overrides) — W7
- Vercel Workflow DevKit wrap of plan-week — when failure-mode complexity justifies it (Phase 3)

---

## Task 1 — Cron auth helper (TDD)

**Files:**
- Create: `src/api/cron-auth.ts`
- Create: `src/__tests__/cron-auth.test.ts`

A pure function that takes the incoming request's `Authorization` header (or just the raw value) plus the expected secret, and returns either `{ ok: true }` or `{ ok: false, status: 401, message }`. Endpoints construct a `Response` from the result.

- [ ] **Step 1: Failing test**

```typescript
// src/__tests__/cron-auth.test.ts
import { describe, it, expect } from 'vitest';
import { verifyCronAuth } from '../api/cron-auth';

describe('verifyCronAuth', () => {
  it('accepts a matching Bearer token', () => {
    const out = verifyCronAuth({ authorizationHeader: 'Bearer s3cret', expectedSecret: 's3cret' });
    expect(out.ok).toBe(true);
  });

  it('rejects a missing Authorization header', () => {
    const out = verifyCronAuth({ authorizationHeader: null, expectedSecret: 's3cret' });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(401);
      expect(out.message).toMatch(/missing/i);
    }
  });

  it('rejects a wrong-secret Bearer token', () => {
    const out = verifyCronAuth({ authorizationHeader: 'Bearer wrong', expectedSecret: 's3cret' });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(401);
      expect(out.message).toMatch(/invalid|unauthorized/i);
    }
  });

  it('rejects when the expected secret is empty (server misconfigured)', () => {
    const out = verifyCronAuth({ authorizationHeader: 'Bearer s3cret', expectedSecret: '' });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(500);
      expect(out.message).toMatch(/CRON_SECRET/i);
    }
  });
});
```

Run `npx vitest run src/__tests__/cron-auth.test.ts` — FAIL (module not found).

- [ ] **Step 2: Implement**

```typescript
// src/api/cron-auth.ts

export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 500; message: string };

export interface VerifyCronAuthArgs {
  /** Raw value of the `Authorization` header, or null if absent. */
  authorizationHeader: string | null;
  expectedSecret: string;
}

export function verifyCronAuth(args: VerifyCronAuthArgs): CronAuthResult {
  if (!args.expectedSecret) {
    return { ok: false, status: 500, message: 'CRON_SECRET is not set on the server' };
  }
  if (!args.authorizationHeader) {
    return { ok: false, status: 401, message: 'missing Authorization header' };
  }
  const expected = `Bearer ${args.expectedSecret}`;
  if (args.authorizationHeader !== expected) {
    return { ok: false, status: 401, message: 'invalid bearer' };
  }
  return { ok: true };
}

/** Convenience: build a Response for the unauthorized branches. */
export function cronAuthResponse(result: Extract<CronAuthResult, { ok: false }>): Response {
  return new Response(JSON.stringify({ error: result.message }), {
    status: result.status,
    headers: { 'content-type': 'application/json' },
  });
}
```

Run the test — expect 4/4 PASS. Run `npm test` — expect ~179 passing.

- [ ] **Step 3: Type-check + commit**

```bash
npm exec tsc --noEmit
git add src/api/cron-auth.ts src/__tests__/cron-auth.test.ts
git commit -m "feat(phase-2-w6): cron auth helper (TDD, 4 tests)"
```

Note: 4 tests instead of the plan's 3 — test for empty server-side secret is added because that's a real failure mode (deploy without CRON_SECRET set).

---

## Task 2 — `FOODIE_RECIPIENT_EMAIL` config

**Files:**
- Modify: `src/config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add `app` block to config.ts**

In `src/config.ts`, after the existing `email` block, add:
```typescript
  app: {
    recipientEmail: process.env.FOODIE_RECIPIENT_EMAIL || "",
    cronSecret: process.env.CRON_SECRET || "",
  },
```

Do NOT add either to `validateConfig()` — only the cron endpoints need them, and they check at the call site.

- [ ] **Step 2: Document in .env.example**

Append to `.env.example`:
```
# Phase 2 W6 — cron destination + auth
FOODIE_RECIPIENT_EMAIL=
# CRON_SECRET is already documented above; set it before deploying.
```

(`CRON_SECRET` is already in `.env.example` from W4a.)

- [ ] **Step 3: Verify + commit**

```bash
npm exec tsc --noEmit
git add src/config.ts .env.example
git commit -m "chore(phase-2-w6): add FOODIE_RECIPIENT_EMAIL + cronSecret to app config"
```

---

## Task 3 — `/api/cron/sync` endpoint

**Files:**
- Create: `app/api/cron/sync/route.ts`

This endpoint runs the existing daily ingestion routine: MENY + Kiwi (Kassalapp) + Etilbudsavis offers. It reuses the `Orchestrator` setup that the CLI uses, so logic stays in one place.

- [ ] **Step 1: Implement**

```typescript
// app/api/cron/sync/route.ts
import { headers } from 'next/headers';
import { verifyCronAuth, cronAuthResponse } from '../../../../src/api/cron-auth';
import { config } from '../../../../src/config';
import { Orchestrator } from '../../../../src/ingestion/orchestrator';
import { MenyDirectAdapter } from '../../../../src/ingestion/adapters/meny-direct.adapter';
import { AFoodAdapter } from '../../../../src/ingestion/adapters/afood.adapter';
import { KassalappAdapter } from '../../../../src/ingestion/adapters/kassalapp.adapter';
import { EtilbudsavisAdapter } from '../../../../src/ingestion/adapters/etilbudsavis.adapter';
import { listDealers } from '../../../../src/db/repositories/offers.repo';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min — sync over all chains

export async function GET() {
  const h = await headers();
  const auth = verifyCronAuth({
    authorizationHeader: h.get('authorization'),
    expectedSecret: config.app.cronSecret,
  });
  if (!auth.ok) return cronAuthResponse(auth);

  const startedAt = Date.now();
  const orch = new Orchestrator();
  orch.register(new MenyDirectAdapter());
  orch.register(new AFoodAdapter());

  if (process.env.KASSALAPP_API_KEY) {
    orch.register(new KassalappAdapter({ apiKey: process.env.KASSALAPP_API_KEY, chains: ['KIWI'] }));
  }

  // Etilbudsavis dealer IDs from DB.
  const dealers = await listDealers().catch(() => []);
  const dealerIdMap: Partial<Record<'MENY' | 'KIWI' | 'SPAR' | 'JOKER', string>> = {};
  for (const d of dealers) {
    if (d.etilbudsavis_dealer_id && (d.code === 'MENY' || d.code === 'KIWI' || d.code === 'SPAR' || d.code === 'JOKER')) {
      dealerIdMap[d.code] = d.etilbudsavis_dealer_id;
    }
  }
  if (Object.keys(dealerIdMap).length > 0) {
    orch.register(new EtilbudsavisAdapter({ dealerIdMap }));
  }

  const summary: Array<{ adapter: string; productsUpserted?: number; offersFetched?: number; errors: string[] }> = [];
  for (const a of orch.listAdapters()) {
    try {
      if (a.name === 'etilbudsavis') {
        let total = 0;
        const errs: string[] = [];
        for (const chain of a.chains) {
          try {
            const offers = await a.fetchOffers(chain);
            total += offers.length;
          } catch (e) {
            errs.push(`${chain}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        summary.push({ adapter: a.name, offersFetched: total, errors: errs });
      } else {
        const result = await a.syncProducts({});
        summary.push({
          adapter: a.name,
          productsUpserted: result.productsUpserted,
          errors: result.errors.map((e) => e.message),
        });
      }
    } catch (e) {
      summary.push({ adapter: a.name, errors: [e instanceof Error ? e.message : String(e)] });
    }
  }

  return Response.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    adapters: summary,
  });
}
```

- [ ] **Step 2: Verify**

```bash
npm exec tsc --noEmit
npm run build
```

Expected: clean build; new `/api/cron/sync` route in the route list.

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/sync/route.ts
git commit -m "feat(phase-2-w6): /api/cron/sync endpoint (meny + kiwi + etilbudsavis)"
```

---

## Task 4 — `/api/cron/plan-week` endpoint

**Files:**
- Create: `app/api/cron/plan-week/route.ts`

```typescript
// app/api/cron/plan-week/route.ts
import { headers } from 'next/headers';
import { verifyCronAuth, cronAuthResponse } from '../../../../src/api/cron-auth';
import { config } from '../../../../src/config';
import { sendWeeklyPlanEmail } from '../../../../src/email/send-weekly-plan';
import { getOrCreateDefaultHousehold } from '../../../../src/db/repositories/households.repo';

export const runtime = 'nodejs';
export const maxDuration = 600; // planner loop + Resend send can take 1-2 min

export async function GET() {
  const h = await headers();
  const auth = verifyCronAuth({
    authorizationHeader: h.get('authorization'),
    expectedSecret: config.app.cronSecret,
  });
  if (!auth.ok) return cronAuthResponse(auth);

  if (!config.app.recipientEmail) {
    return Response.json(
      { error: 'FOODIE_RECIPIENT_EMAIL is not set' },
      { status: 500 }
    );
  }

  const startedAt = Date.now();
  const hh = await getOrCreateDefaultHousehold();
  const weekStart = nextMondayIsoDate();

  const result = await sendWeeklyPlanEmail({
    householdId: hh.id,
    weekStart,
    recipeCount: 5,
    weeklyBudgetNok: 1500,
    allowedChains: ['MENY', 'KIWI', 'AFOOD'],
    to: config.app.recipientEmail,
  });

  return Response.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    weekStart,
    ...result,
  });
}

function nextMondayIsoDate(): string {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sun .. 6=Sat
  const offset = ((1 - day) + 7) % 7;
  const target = new Date(d.getTime() + (offset || 7) * 86_400_000);
  return target.toISOString().slice(0, 10);
}
```

- [ ] **Verify + commit**

```bash
npm exec tsc --noEmit
npm run build
git add app/api/cron/plan-week/route.ts
git commit -m "feat(phase-2-w6): /api/cron/plan-week endpoint (planWeek + email)"
```

---

## Task 5 — `/api/cron/audit-month` endpoint

**Files:**
- Create: `app/api/cron/audit-month/route.ts`

```typescript
// app/api/cron/audit-month/route.ts
import { headers } from 'next/headers';
import { verifyCronAuth, cronAuthResponse } from '../../../../src/api/cron-auth';
import { config } from '../../../../src/config';
import { runAudit } from '../../../../src/audit/send-audit';
import { getOrCreateDefaultHousehold } from '../../../../src/db/repositories/households.repo';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET() {
  const h = await headers();
  const auth = verifyCronAuth({
    authorizationHeader: h.get('authorization'),
    expectedSecret: config.app.cronSecret,
  });
  if (!auth.ok) return cronAuthResponse(auth);

  if (!config.app.recipientEmail) {
    return Response.json(
      { error: 'FOODIE_RECIPIENT_EMAIL is not set' },
      { status: 500 }
    );
  }

  const startedAt = Date.now();
  const hh = await getOrCreateDefaultHousehold();

  // Pantry may be empty — bail early with a 200 OK so cron doesn't alarm.
  try {
    const result = await runAudit({
      householdId: hh.id,
      to: config.app.recipientEmail,
      topN: 10,
    });
    return Response.json({ ok: true, durationMs: Date.now() - startedAt, ...result });
  } catch (e) {
    if (e instanceof Error && /pantry is empty/i.test(e.message)) {
      return Response.json({ ok: true, skipped: 'pantry empty' });
    }
    throw e;
  }
}
```

- [ ] **Verify + commit**

```bash
npm exec tsc --noEmit
npm run build
git add app/api/cron/audit-month/route.ts
git commit -m "feat(phase-2-w6): /api/cron/audit-month endpoint (runAudit)"
```

---

## Task 6 — `vercel.ts` cron schedule + final verify

**Files:**
- Modify: `vercel.ts`

- [ ] **Step 1: Replace the stub crons**

```typescript
import { type VercelConfig } from '@vercel/config/v1';

// See spec §9.1 (cron schedule).
// All paths return JSON; cron auth is enforced via Authorization: Bearer ${CRON_SECRET}.
// Vercel injects the bearer header automatically when calling /api/cron/* paths.

export const config: VercelConfig = {
  framework: 'nextjs',
  // Region: fra1 (Frankfurt) for EU residency + lowest Supabase EU latency.
  regions: ['fra1'],
  functions: {
    'app/api/**/*.ts': {
      maxDuration: 300,
    },
    'app/api/cron/plan-week/route.ts': {
      maxDuration: 600, // planner + email can take 1-2 min
    },
    'app/api/cron/sync/route.ts': {
      maxDuration: 300,
    },
  },
  crons: [
    // Daily ingestion refresh — kassalapp updates ~07:00 UTC, etilbudsavis flyer windows roll Sun→Mon.
    { path: '/api/cron/sync', schedule: '0 4 * * *' },
    // Sunday plan + email at 06:00 UTC = 07:00 Oslo (Norway is UTC+1 in winter, +2 summer).
    { path: '/api/cron/plan-week', schedule: '0 6 * * 0' },
    // Monthly pantry audit on the 1st at 09:00 UTC.
    { path: '/api/cron/audit-month', schedule: '0 9 1 * *' },
    // Health-check ping every hour — proves cron mechanism + catches deploy regressions.
    { path: '/api/health', schedule: '0 * * * *' },
  ],
};
```

- [ ] **Step 2: Full verify**

```bash
npm exec tsc --noEmit
npm test
npm run build
```
Expected: clean; ~179 passing; routes `/api/health`, `/api/cron/sync`, `/api/cron/plan-week`, `/api/cron/audit-month` all listed in the build output.

- [ ] **Step 3: Local smoke (optional — requires env)**

Set `CRON_SECRET=test-secret` and any other vars in `.env.local`, then:
```bash
next dev &
NEXT_PID=$!
sleep 3

# Sync
curl -s -H "Authorization: Bearer test-secret" http://localhost:3000/api/cron/sync | head -c 500

# Plan-week (requires Supabase + AI Gateway + Resend; takes ~1 min)
curl -s -H "Authorization: Bearer test-secret" http://localhost:3000/api/cron/plan-week | head -c 500

# Audit-month
curl -s -H "Authorization: Bearer test-secret" http://localhost:3000/api/cron/audit-month | head -c 500

# Wrong secret → 401
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer wrong" http://localhost:3000/api/cron/sync

kill $NEXT_PID
```

- [ ] **Step 4: Commit**

```bash
git add vercel.ts
git commit -m "feat(phase-2-w6): vercel.ts cron schedule (sync daily + plan-week sunday + audit-month)"
```

The controller will then run the summary commit + tag + merge + push (per the established pattern).

---

## Self-review checklist (run at end of writing this plan)

- Spec coverage: §9.1 cron schedule → Tasks 3-6. Combined `/api/cron/sync` collapses spec's per-chain endpoints into one (deferred to W7 if per-chain isolation becomes valuable). Trumf-refresh, offer-diff explicitly deferred.
- No placeholders.
- Type consistency: `verifyCronAuth` return shape consistent across endpoints; `runAudit`, `sendWeeklyPlanEmail`, `getOrCreateDefaultHousehold` interfaces unchanged from Phase 1.
- ToS: same as Phase 1 (no new external surface). Resend sandbox sender continues to work — Phase 2 W7 swaps the sender domain.
- Test isolation: `cron-auth.ts` is pure + unit-tested. Endpoints are integration-tested via local curl smoke.
- Failure modes: empty pantry → audit returns 200 with `skipped`; missing FOODIE_RECIPIENT_EMAIL → 500 with clear message; wrong/missing CRON_SECRET → 401 with clear message.
