# Foodie Phase 2 Week 7 — Cron alerting + structured logging

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Make every cron failure visible. Wrap the three Phase-2-W6 cron endpoints in a common `wrapCronHandler` that does auth + structured JSON logging + try/catch + Resend-alert-on-failure. Currently if `/api/cron/plan-week` errors out, the user discovers it by *not* receiving their Sunday email and has to dig through Vercel logs to figure out why. After W7 they get a clearly-labelled `[Foodie alert]` email within seconds, with the stack trace + cron name + duration in the body.

**Architecture:**
- `src/api/logger.ts` — tiny structured-JSON helper. `logEvent({event, durationMs, ...rest}) → void` writes a single-line JSON to `console.log`. Vercel Function logs ingest stdout, so JSON lines are searchable in the dashboard. No new deps.
- `src/api/cron-handler.ts` — `wrapCronHandler({name, fn, alertEmailFrom?, alertEmailTo?})` returns a Next.js route handler. Internally:
  1. Verify cron auth (reuses `verifyCronAuth` from W6).
  2. Time the handler call.
  3. On success: log `{event: 'cron.success', name, durationMs, ...result}` and return `Response.json(result)`.
  4. On failure: log `{event: 'cron.failure', name, durationMs, error: e.message, stack: e.stack}`, fire-and-await an alert email via Resend, return `Response.json({error: e.message}, {status: 500})`. Alert email failure is logged but does NOT mask the original error.
- The three existing cron endpoints shrink from ~60 LOC to ~15 LOC each — they just declare `wrapCronHandler({name, fn: async () => {...}})` and export it as `GET`.
- `FOODIE_ALERT_EMAIL` env var. Defaults to `FOODIE_RECIPIENT_EMAIL` so a single config knob keeps working.
- Tests: pure logger (2), cron-handler (4 — auth-fail / handler-success / handler-throws / alert-fail-doesnt-mask).

**Tech Stack:** Next.js 16, AI SDK v6 (already), Resend (already), vitest. No new deps.

**Spec reference:** docs/superpowers/specs/2026-04-27-foodie-grocery-planner-design.md (§15 Observability — alerts on cron failures)

**Predecessor:** phase-2-w6-complete

---

## Tasks

| # | Task | Model | DB needed |
|---|---|---|---|
| 1 | Structured logger (TDD) — `src/api/logger.ts` | haiku | no |
| 2 | `FOODIE_ALERT_EMAIL` config | haiku | no |
| 3 | `wrapCronHandler` helper (TDD, 4 tests) — `src/api/cron-handler.ts` | sonnet | no |
| 4 | Refactor `/api/cron/sync` to use `wrapCronHandler` | sonnet | no |
| 5 | Refactor `/api/cron/plan-week` + `/api/cron/audit-month` | sonnet | no |
| 6 | Final verify + tag + merge + push | sonnet | no |

---

## Files created
- src/api/logger.ts + test
- src/api/cron-handler.ts + test

## Files modified
- src/config.ts (add `app.alertEmail`)
- .env.example (document `FOODIE_ALERT_EMAIL`)
- app/api/cron/sync/route.ts (refactor)
- app/api/cron/plan-week/route.ts (refactor)
- app/api/cron/audit-month/route.ts (refactor)

## End-state verification
1. `npm test` → ~185+ passing (179 baseline + 6 new — 2 logger + 4 cron-handler)
2. `npm exec tsc --noEmit` → clean
3. `npm run build` → still 4 routes (`/api/health`, `/api/cron/sync`, `/api/cron/plan-week`, `/api/cron/audit-month`)
4. Local smoke (with creds): force a failure (e.g. invalidate `RESEND_API_KEY` temporarily) and confirm the cron returns 500 + an alert email lands at `FOODIE_ALERT_EMAIL`.
5. `git tag phase-2-w7-complete`

## Rollback
```bash
git checkout main
git reset --hard phase-2-w6-complete
git branch -D phase-2/cron-alerting
git tag -d phase-2-w7-complete
```

## Deferred to later plans
- Slack webhook alerts — Phase 2 W8
- Cron health-check dashboard endpoint (`/api/health/cron`) — Phase 3
- Sentry / Datadog integration — Phase 3
- Per-household alert recipients — when Auth lands

---

## Task 1 — Structured logger

**Files:**
- Create: `src/api/logger.ts`
- Create: `src/__tests__/logger.test.ts`

A tiny pure function. Tests verify shape, not output (we don't assert on `console.log` directly — that's hard to mock cleanly).

- [ ] **Step 1: Failing test**

```typescript
// src/__tests__/logger.test.ts
import { describe, it, expect } from 'vitest';
import { formatLogLine } from '../api/logger';

describe('formatLogLine', () => {
  it('produces a single-line JSON string with event, timestamp, and rest of fields', () => {
    const out = formatLogLine({ event: 'cron.success', name: 'sync', durationMs: 1234 });
    expect(out).not.toContain('\n');
    const parsed = JSON.parse(out);
    expect(parsed.event).toBe('cron.success');
    expect(parsed.name).toBe('sync');
    expect(parsed.durationMs).toBe(1234);
    expect(typeof parsed.timestamp).toBe('string');
    expect(new Date(parsed.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('includes nested objects untouched', () => {
    const out = formatLogLine({ event: 'cron.failure', name: 'plan-week', error: { message: 'boom', code: 'E_BOOM' } });
    const parsed = JSON.parse(out);
    expect(parsed.error).toEqual({ message: 'boom', code: 'E_BOOM' });
  });
});
```

Run: `npx vitest run src/__tests__/logger.test.ts` — FAIL.

- [ ] **Step 2: Implement**

```typescript
// src/api/logger.ts

export interface LogFields {
  event: string;
  [key: string]: unknown;
}

/** Pure: returns the JSON string a logger would write. Does not call console.* */
export function formatLogLine(fields: LogFields): string {
  return JSON.stringify({ timestamp: new Date().toISOString(), ...fields });
}

/** Side-effecting wrapper. Writes one JSON line to stdout. */
export function logEvent(fields: LogFields): void {
  console.log(formatLogLine(fields));
}
```

Run the test — 2/2 PASS. Run `npm test` — ~181 passing.

- [ ] **Step 3: Type-check + commit**

```bash
npm exec tsc --noEmit
git add src/api/logger.ts src/__tests__/logger.test.ts
git commit -m "feat(phase-2-w7): structured JSON logger (TDD, 2 tests)"
```

---

## Task 2 — `FOODIE_ALERT_EMAIL` config

**Files:**
- Modify: `src/config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Extend the `app` block**

In `src/config.ts`, find the existing `app` block (added in W6 with `recipientEmail` + `cronSecret`). Add a third field:

```typescript
  app: {
    recipientEmail: process.env.FOODIE_RECIPIENT_EMAIL || "",
    cronSecret: process.env.CRON_SECRET || "",
    alertEmail: process.env.FOODIE_ALERT_EMAIL || process.env.FOODIE_RECIPIENT_EMAIL || "",
  },
```

The fallback to `FOODIE_RECIPIENT_EMAIL` means single-config-knob users get sensible default behaviour (alerts go to the same address as plan emails). Households that want a separate ops inbox set both.

- [ ] **Step 2: Document**

In `.env.example`, append:
```
# Phase 2 W7 — cron failure alerts (defaults to FOODIE_RECIPIENT_EMAIL)
FOODIE_ALERT_EMAIL=
```

- [ ] **Step 3: Verify + commit**

```bash
npm exec tsc --noEmit
git add src/config.ts .env.example
git commit -m "chore(phase-2-w7): add FOODIE_ALERT_EMAIL config (defaults to recipientEmail)"
```

---

## Task 3 — `wrapCronHandler` (TDD)

**Files:**
- Create: `src/api/cron-handler.ts`
- Create: `src/__tests__/cron-handler.test.ts`

The wrapper is the meat of W7. Four test cases:
1. Auth fails → 401 returned, handler not called, no email sent
2. Handler succeeds → 200 returned, success log written, no email sent
3. Handler throws → 500 returned, failure log written, alert email sent
4. Handler throws AND alert send throws → 500 still returned with original error (alert failure logged but doesn't mask)

- [ ] **Step 1: Failing test**

```typescript
// src/__tests__/cron-handler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wrapCronHandler, type CronHandlerDeps } from '../api/cron-handler';

const validHeaders = (secret: string) => new Headers({ authorization: `Bearer ${secret}` });

function makeRequest(headers: Headers): Request {
  return new Request('http://localhost/api/cron/test', { method: 'GET', headers });
}

function makeDeps(overrides: Partial<CronHandlerDeps> = {}): CronHandlerDeps {
  return {
    cronSecret: 's3cret',
    alertEmail: 'alerts@example.com',
    alertFrom: 'Foodie <noreply@example.com>',
    sendAlert: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('wrapCronHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 when auth fails; handler is not called; no alert sent', async () => {
    const fn = vi.fn(async () => ({ ok: true }));
    const sendAlert = vi.fn(async () => undefined);
    const handler = wrapCronHandler({ name: 'test', fn }, makeDeps({ sendAlert }));
    const res = await handler(makeRequest(new Headers({ authorization: 'Bearer wrong' })));
    expect(res.status).toBe(401);
    expect(fn).not.toHaveBeenCalled();
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('returns 200 with handler result on success; no alert sent', async () => {
    const fn = vi.fn(async () => ({ ok: true, items: 5 }));
    const sendAlert = vi.fn(async () => undefined);
    const handler = wrapCronHandler({ name: 'test', fn }, makeDeps({ sendAlert }));
    const res = await handler(makeRequest(validHeaders('s3cret')));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, items: 5 });
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('returns 500 + sends alert when handler throws', async () => {
    const fn = vi.fn(async () => { throw new Error('boom'); });
    const sendAlert = vi.fn(async () => undefined);
    const handler = wrapCronHandler({ name: 'test', fn }, makeDeps({ sendAlert }));
    const res = await handler(makeRequest(validHeaders('s3cret')));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('boom');
    expect(sendAlert).toHaveBeenCalledOnce();
    const alertArgs = sendAlert.mock.calls[0][0];
    expect(alertArgs.subject).toMatch(/foodie alert/i);
    expect(alertArgs.subject).toMatch(/test/);
    expect(alertArgs.body).toContain('boom');
  });

  it('alert-send failure does not mask original handler error', async () => {
    const fn = vi.fn(async () => { throw new Error('original error'); });
    const sendAlert = vi.fn(async () => { throw new Error('mailer down'); });
    const handler = wrapCronHandler({ name: 'test', fn }, makeDeps({ sendAlert }));
    const res = await handler(makeRequest(validHeaders('s3cret')));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('original error');
  });
});
```

Run: `npx vitest run src/__tests__/cron-handler.test.ts` — FAIL (module not found).

- [ ] **Step 2: Implement**

```typescript
// src/api/cron-handler.ts
import { verifyCronAuth, cronAuthResponse } from './cron-auth';
import { logEvent } from './logger';

export interface AlertArgs {
  subject: string;
  body: string;
  to: string;
  from: string;
}

export interface CronHandlerDeps {
  cronSecret: string;
  alertEmail: string;
  alertFrom: string;
  sendAlert: (args: AlertArgs) => Promise<void>;
}

export interface WrapCronHandlerArgs<T> {
  name: string;
  fn: () => Promise<T>;
}

export function wrapCronHandler<T>(args: WrapCronHandlerArgs<T>, deps: CronHandlerDeps) {
  return async function handler(req: Request): Promise<Response> {
    const startedAt = Date.now();
    const auth = verifyCronAuth({
      authorizationHeader: req.headers.get('authorization'),
      expectedSecret: deps.cronSecret,
    });
    if (!auth.ok) {
      logEvent({ event: 'cron.auth_failed', name: args.name, status: auth.status });
      return cronAuthResponse(auth);
    }

    try {
      const result = await args.fn();
      const durationMs = Date.now() - startedAt;
      logEvent({ event: 'cron.success', name: args.name, durationMs, result });
      return Response.json(result);
    } catch (e) {
      const durationMs = Date.now() - startedAt;
      const err = e instanceof Error ? e : new Error(String(e));
      logEvent({
        event: 'cron.failure',
        name: args.name,
        durationMs,
        error: err.message,
        stack: err.stack,
      });

      // Fire alert; never let alert failure mask the original error.
      if (deps.alertEmail) {
        try {
          await deps.sendAlert({
            subject: `[Foodie alert] cron ${args.name} failed`,
            body: `Cron: ${args.name}\nDuration: ${durationMs}ms\nError: ${err.message}\n\nStack:\n${err.stack ?? '(no stack)'}`,
            to: deps.alertEmail,
            from: deps.alertFrom,
          });
        } catch (alertErr) {
          logEvent({
            event: 'cron.alert_failed',
            name: args.name,
            error: alertErr instanceof Error ? alertErr.message : String(alertErr),
          });
        }
      }

      return Response.json({ error: err.message }, { status: 500 });
    }
  };
}

/**
 * Production-mode dependency builder. Lazy-imports Resend to keep tests fast.
 * Returns the deps blob ready to pass to `wrapCronHandler`.
 */
export async function buildProductionDeps(args: {
  cronSecret: string;
  alertEmail: string;
  alertFrom: string;
  resendApiKey: string;
}): Promise<CronHandlerDeps> {
  const { buildResendSender, sendEmail } = await import('../email/client');
  const sender = await buildResendSender(args.resendApiKey);
  return {
    cronSecret: args.cronSecret,
    alertEmail: args.alertEmail,
    alertFrom: args.alertFrom,
    sendAlert: async (a: AlertArgs) => {
      await sendEmail({
        sender,
        from: a.from,
        to: a.to,
        subject: a.subject,
        html: `<pre style="white-space:pre-wrap;font-family:Menlo,Consolas,monospace;font-size:12px;">${escapeHtml(a.body)}</pre>`,
        text: a.body,
      });
    },
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
```

Run the test — 4/4 PASS. Run `npm test` — ~185 passing.

- [ ] **Step 3: Verify + commit**

```bash
npm exec tsc --noEmit
git add src/api/cron-handler.ts src/__tests__/cron-handler.test.ts
git commit -m "feat(phase-2-w7): wrapCronHandler with auth + alert-on-failure (TDD, 4 tests)"
```

---

## Task 4 — Refactor `/api/cron/sync`

**File:** `app/api/cron/sync/route.ts` (rewrite)

The shape is: declare a `runSync()` async function that does the existing work and returns the summary. Wrap it. Export the wrapped result as GET.

```typescript
// app/api/cron/sync/route.ts
import { wrapCronHandler, buildProductionDeps } from '../../../../src/api/cron-handler';
import { config } from '../../../../src/config';
import { Orchestrator } from '../../../../src/ingestion/orchestrator';
import { MenyDirectAdapter } from '../../../../src/ingestion/adapters/meny-direct.adapter';
import { AFoodAdapter } from '../../../../src/ingestion/adapters/afood.adapter';
import { KassalappAdapter } from '../../../../src/ingestion/adapters/kassalapp.adapter';
import { EtilbudsavisAdapter } from '../../../../src/ingestion/adapters/etilbudsavis.adapter';
import { listDealers } from '../../../../src/db/repositories/offers.repo';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function runSyncJob() {
  const orch = new Orchestrator();
  orch.register(new MenyDirectAdapter());
  orch.register(new AFoodAdapter());
  if (process.env.KASSALAPP_API_KEY) {
    orch.register(new KassalappAdapter({ apiKey: process.env.KASSALAPP_API_KEY, chains: ['KIWI'] }));
  }
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

  return { adapters: summary };
}

export const GET = await (async () => {
  const deps = await buildProductionDeps({
    cronSecret: config.app.cronSecret,
    alertEmail: config.app.alertEmail,
    alertFrom: config.email.from,
    resendApiKey: config.email.resendApiKey,
  });
  return wrapCronHandler({ name: 'sync', fn: runSyncJob }, deps);
})();
```

Note: the top-level `await` for `buildProductionDeps` means the deps are built once at module load (cold start), not per-request. Faster + lower-memory. If `RESEND_API_KEY` isn't set at deploy time, the lazy `buildResendSender` will throw — that's acceptable (hard fail at boot is better than silently dropping alerts).

- [ ] **Verify + commit**

```bash
npm exec tsc --noEmit
npm test
npm run build
git add app/api/cron/sync/route.ts
git commit -m "refactor(phase-2-w7): /api/cron/sync uses wrapCronHandler"
```

---

## Task 5 — Refactor `plan-week` and `audit-month`

**Files:** `app/api/cron/plan-week/route.ts`, `app/api/cron/audit-month/route.ts`

`app/api/cron/plan-week/route.ts`:
```typescript
import { wrapCronHandler, buildProductionDeps } from '../../../../src/api/cron-handler';
import { config } from '../../../../src/config';
import { sendWeeklyPlanEmail } from '../../../../src/email/send-weekly-plan';
import { getOrCreateDefaultHousehold } from '../../../../src/db/repositories/households.repo';

export const runtime = 'nodejs';
export const maxDuration = 600;

async function runPlanWeekJob() {
  if (!config.app.recipientEmail) {
    throw new Error('FOODIE_RECIPIENT_EMAIL is not set');
  }
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
  return { weekStart, ...result };
}

function nextMondayIsoDate(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const offset = ((1 - day) + 7) % 7;
  const target = new Date(d.getTime() + (offset || 7) * 86_400_000);
  return target.toISOString().slice(0, 10);
}

export const GET = await (async () => {
  const deps = await buildProductionDeps({
    cronSecret: config.app.cronSecret,
    alertEmail: config.app.alertEmail,
    alertFrom: config.email.from,
    resendApiKey: config.email.resendApiKey,
  });
  return wrapCronHandler({ name: 'plan-week', fn: runPlanWeekJob }, deps);
})();
```

`app/api/cron/audit-month/route.ts`:
```typescript
import { wrapCronHandler, buildProductionDeps } from '../../../../src/api/cron-handler';
import { config } from '../../../../src/config';
import { runAudit } from '../../../../src/audit/send-audit';
import { getOrCreateDefaultHousehold } from '../../../../src/db/repositories/households.repo';

export const runtime = 'nodejs';
export const maxDuration = 120;

async function runAuditJob() {
  if (!config.app.recipientEmail) {
    throw new Error('FOODIE_RECIPIENT_EMAIL is not set');
  }
  const hh = await getOrCreateDefaultHousehold();
  try {
    return await runAudit({ householdId: hh.id, to: config.app.recipientEmail, topN: 10 });
  } catch (e) {
    if (e instanceof Error && /pantry is empty/i.test(e.message)) {
      return { skipped: 'pantry empty' as const };
    }
    throw e;
  }
}

export const GET = await (async () => {
  const deps = await buildProductionDeps({
    cronSecret: config.app.cronSecret,
    alertEmail: config.app.alertEmail,
    alertFrom: config.email.from,
    resendApiKey: config.email.resendApiKey,
  });
  return wrapCronHandler({ name: 'audit-month', fn: runAuditJob }, deps);
})();
```

- [ ] **Verify + commit**

```bash
npm exec tsc --noEmit
npm test
npm run build
git add app/api/cron/plan-week/route.ts app/api/cron/audit-month/route.ts
git commit -m "refactor(phase-2-w7): plan-week + audit-month use wrapCronHandler"
```

---

## Task 6 — Final verify + tag + merge + push (controller-only)

```bash
npm exec tsc --noEmit
npm test
npm run build
```

Expected: clean; ~185 passing; same 4 routes.

Then the controller dispatches the final review subagent and (after sign-off) does the summary commit + tag + merge + push.

---

## Self-review checklist (run at end of writing this plan)

- Every cron failure now produces an alert email — not just buried in logs. The `cron.success` and `cron.failure` events make Vercel logs searchable.
- The wrapper is dependency-injected: tests pass a fake `sendAlert`, prod code uses `buildProductionDeps`. No real Resend calls during `npm test`.
- The "alert send failure doesn't mask original error" semantic is enforced by an explicit test (#4).
- The three refactored endpoints shrink to ~40 LOC each (auth + try/catch removed). Per-handler logic stays intact.
- `FOODIE_ALERT_EMAIL` defaults to `FOODIE_RECIPIENT_EMAIL` so the env-var-minimal user gets sensible behaviour.
- Top-level await in `route.ts` is supported in Next.js 16 with `runtime = 'nodejs'`. If a future change breaks it, the alternative is to construct deps inside the handler (per-request, slower) — not a blocker.
