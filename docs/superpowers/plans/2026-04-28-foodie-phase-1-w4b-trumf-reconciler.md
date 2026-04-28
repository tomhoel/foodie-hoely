# Foodie Phase 1 Week 4b — Trumf integration + Receipt reconciler

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase-1 Trumf integration loop — manual bearer-token CLI capture → fetch transactions from `platform-rest-prod.ngdata.no` → persist to `transactions` + `transaction_lines` (idempotent on `trumf_batch_id`) → reconcile each line against pantry (EAN→product upsert) and against recently-planned meals (mark `cooked` when ingredient overlap > 60%).

**Architecture:**
- **Token storage** lives in `~/.foodie/trumf-token.json` (NOT in DB; Phase 2 moves to encrypted DB via Vercel Sandbox broker). Single-file pattern reuses `src/utils/storage.ts`.
- **TrumfClient** wraps `jsonFetch` with `Authorization: Bearer <token>` and Zod-validates responses. Two endpoints: `/trumf/husstand/transaksjoner?fra=&til=` (list) and `/trumf/husstand/transaksjoner/detaljer/{batchid}` (line items).
- **Transactions repo** upserts `transactions` keyed by `trumf_batch_id` and bulk-inserts `transaction_lines` per batch (idempotent — clear-then-insert per batch).
- **Pantry updater** for each line: try EAN→`products.id` lookup, then upsert `pantry_items` by `(household_id, ean)` falling back to `(household_id, product_name)`. Confidence = 0.95 when EAN-matched, 0.7 when name-only.
- **Plan matcher** for each transaction: find `meal_plan_items` planned within ±2 days of `purchased_at` for the same household; for each candidate, compute ingredient-name overlap via `recipe_ingredients.raw_text` token Jaccard against `transaction_lines.name_raw`; if best score > 0.6, mark `meal_plan_items.status='cooked'` with `cooked_confirmed_via='receipt'`.
- **Reconciler orchestrator** runs the pantry updater + plan matcher inside one transaction sync pass.
- **CLI** exposes `trumf-set-token` (paste a token JSON, save to disk) and `trumf-sync` (fetch + persist + reconcile).
- Real Trumf API is **never** called in tests; all HTTP is fixture-driven via `jsonFetch` with a mock fetch.

**Tech Stack:** TypeScript 5.7, native `fetch` (Node 22), zod, vitest, Supabase via existing `getSupabase()`. No new dependencies.

**Spec reference:** docs/superpowers/specs/2026-04-27-foodie-grocery-planner-design.md (§4 Trumf JSON API, §6.2 transactions/transaction_lines schema, §8.4 receipt reconciler, §11.4 GDPR fallback — explicitly deferred)

**Predecessor:** phase-1-w4a-complete

**Prerequisite (parallel):** Migration 005 already applied. Tasks 4, 8 hit live DB; Tasks 1-3, 5-7 do not.

---

## Tasks

| # | Task | Model | DB needed |
|---|---|---|---|
| 1 | Trumf token storage (`src/trumf/token.ts`) | haiku | no |
| 2 | Trumf Zod schemas (`src/trumf/schemas.ts`) | haiku | no |
| 3 | TrumfClient (`src/trumf/client.ts`, TDD) | sonnet | no |
| 4 | Transactions repo (`src/db/repositories/transactions.repo.ts`) | sonnet | no |
| 5 | Pantry updater (`src/reconciler/pantry-updater.ts`, TDD) | sonnet | no |
| 6 | Plan matcher (`src/reconciler/plan-matcher.ts`, TDD) | sonnet | no |
| 7 | Reconciler orchestrator (`src/reconciler/index.ts`) | sonnet | no |
| 8 | Trumf sync orchestrator (`src/trumf/sync.ts`) | sonnet | no |
| 9 | CLI: `trumf-set-token` + `trumf-sync` | sonnet | no |
| 10 | Final verify + tag `phase-1-w4b-complete` | sonnet | no |

---

## Files created
- src/trumf/token.ts
- src/trumf/schemas.ts
- src/trumf/client.ts + test
- src/trumf/sync.ts
- src/db/repositories/transactions.repo.ts
- src/reconciler/pantry-updater.ts + test
- src/reconciler/plan-matcher.ts + test
- src/reconciler/index.ts
- src/__tests__/__fixtures__/trumf/transaksjoner-sample.json
- src/__tests__/__fixtures__/trumf/detaljer-sample.json

## Files modified
- package.json (add `trumf-set-token`, `trumf-sync` scripts)
- src/index.ts (register `trumf-set-token` + `trumf-sync` commands)

## End-state verification
1. `npm test` → ~155+ passing (145 baseline + ~10 new from TDD tasks)
2. `npm exec tsc --noEmit` → clean
3. `npm run build` → only `/api/health` route
4. CLI: `npm run trumf-set-token -- --bearer "<JWT>"` → writes `~/.foodie/trumf-token.json`, prints masked confirmation
5. CLI: `npm run trumf-sync` (with valid token + at least one historical receipt) → persists rows in `transactions` + `transaction_lines`, prints summary; second run is idempotent (no duplicate rows)
6. `git tag phase-1-w4b-complete`

## Rollback
```bash
git checkout main
git reset --hard phase-1-w4a-complete
git branch -D phase-1/trumf-reconciler
git tag -d phase-1-w4b-complete
```

## Deferred to later plans
- GDPR-export fallback (`POST /api/trumf/import-gdpr-export`) — spec §11.4, Phase 2
- Encrypted DB-resident token storage + Vercel Sandbox broker — Phase 2 §11
- Token auto-refresh against NGData refresh endpoint — Phase 2 (Phase-1 user manually re-pastes when expired)
- Trumf bonus + personal-offers endpoints (`/trumf/medlemskap/...`, `/trumf/kundetilbud/...`) — future
- Unknown-purchases queue + AI ingredient-matching for unmatched lines — Plan D
- Cooking-signature learner upsert from confirmed cooks — Plan D
- Vercel cron auto-pull every 6h — Phase 2

---

## Task 1 — Trumf token storage

**Files:**
- Create: `src/trumf/token.ts`

- [ ] **Step 1: Implement**

```typescript
/**
 * Phase 1 Trumf bearer-token persistence. Stored at ~/.foodie/trumf-token.json.
 * Phase 2 replaces this with encrypted DB-resident storage + Sandbox broker
 * (see design spec §11). Until then the user manually captures a bearer from
 * their logged-in browser DevTools and pastes it into `npm run trumf-set-token`.
 */

import { loadJson, saveJson } from '../utils/storage';

const FILENAME = 'trumf-token.json';

export interface TrumfToken {
  bearer: string;
  /** Optional refresh token; Phase 1 refresh is manual, so this is informational. */
  refresh?: string;
  /** ISO timestamp; derived locally when set. */
  capturedAt: string;
  /** Optional ISO timestamp; if known by user, helps surface "expires soon" warnings. */
  expiresAt?: string;
}

export function loadTrumfToken(): TrumfToken | null {
  return loadJson<TrumfToken>(FILENAME);
}

export function saveTrumfToken(input: { bearer: string; refresh?: string; expiresAt?: string }): TrumfToken {
  if (!input.bearer || input.bearer.length < 20) {
    throw new Error('saveTrumfToken: bearer looks invalid (too short).');
  }
  const token: TrumfToken = {
    bearer: input.bearer.trim(),
    refresh: input.refresh?.trim(),
    capturedAt: new Date().toISOString(),
    expiresAt: input.expiresAt,
  };
  saveJson(FILENAME, token);
  return token;
}

/** Mask all but the last 6 chars for log output. */
export function maskBearer(bearer: string): string {
  if (bearer.length <= 6) return '***';
  return `***${bearer.slice(-6)}`;
}
```

- [ ] **Step 2: Verify**

```bash
npm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/trumf/token.ts
git commit -m "feat(phase-1-w4b): trumf token storage at ~/.foodie/trumf-token.json"
```

---

## Task 2 — Trumf Zod schemas

**Files:**
- Create: `src/trumf/schemas.ts`

- [ ] **Step 1: Implement**

```typescript
/**
 * Zod schemas for the subset of Trumf JSON API used by Foodie Phase 1.
 *
 * Endpoints (no public docs — names verified against community projects:
 * `VemundFredriksen/TrumfReceiptAnalyzer` and `ttyridal/trumf-data-fetch`):
 *   GET /trumf/husstand/transaksjoner?fra=YYYY-MM-DD&til=YYYY-MM-DD
 *   GET /trumf/husstand/transaksjoner/detaljer/{batchid}
 *
 * Norwegian field names (kept verbatim) translated below:
 *   batchid     → trumf_batch_id (unique transaction identifier)
 *   butikk      → store / dealer name
 *   dato        → transaction date (ISO or yyyy-mm-dd)
 *   sum         → total NOK
 *   bonus       → trumf bonus earned NOK
 *   varer       → line items
 *   vareTekst   → product name (raw)
 *   ean         → EAN barcode (string, may include leading zeros)
 *   antall      → quantity (often 1, sometimes weight in kg)
 *   belop       → line total NOK
 */

import { z } from 'zod';

export const TrumfTransaksjonSummary = z.object({
  batchid: z.string().min(1),
  butikk: z.string().optional(),
  dato: z.string(),
  sum: z.number(),
  bonus: z.number().optional(),
  bonusEkstra: z.number().optional(),
}).passthrough();
export type TrumfTransaksjonSummary = z.infer<typeof TrumfTransaksjonSummary>;

export const TrumfTransaksjonerResponse = z.object({
  transaksjoner: z.array(TrumfTransaksjonSummary),
}).passthrough();
export type TrumfTransaksjonerResponse = z.infer<typeof TrumfTransaksjonerResponse>;

export const TrumfVare = z.object({
  vareTekst: z.string(),
  ean: z.string().optional().nullable(),
  antall: z.number().optional(),
  belop: z.number(),
}).passthrough();
export type TrumfVare = z.infer<typeof TrumfVare>;

export const TrumfTransaksjonDetaljer = z.object({
  batchid: z.string().min(1),
  butikk: z.string().optional(),
  dato: z.string(),
  sum: z.number(),
  bonus: z.number().optional(),
  bonusEkstra: z.number().optional(),
  varer: z.array(TrumfVare),
}).passthrough();
export type TrumfTransaksjonDetaljer = z.infer<typeof TrumfTransaksjonDetaljer>;
```

- [ ] **Step 2: Verify**

```bash
npm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/trumf/schemas.ts
git commit -m "feat(phase-1-w4b): zod schemas for Trumf transaksjoner + detaljer"
```

---

## Task 3 — TrumfClient (TDD)

**Files:**
- Create: `src/trumf/client.ts`
- Create: `src/__tests__/trumf-client.test.ts`
- Create: `src/__tests__/__fixtures__/trumf/transaksjoner-sample.json`
- Create: `src/__tests__/__fixtures__/trumf/detaljer-sample.json`

- [ ] **Step 1: Write fixtures**

`src/__tests__/__fixtures__/trumf/transaksjoner-sample.json`:
```json
{
  "transaksjoner": [
    {
      "batchid": "BATCH-2026-04-15-001",
      "butikk": "MENY Sandvika",
      "dato": "2026-04-15",
      "sum": 487.40,
      "bonus": 4.87,
      "bonusEkstra": 0
    },
    {
      "batchid": "BATCH-2026-04-22-002",
      "butikk": "Kiwi Drammen",
      "dato": "2026-04-22",
      "sum": 312.10,
      "bonus": 3.12
    }
  ]
}
```

`src/__tests__/__fixtures__/trumf/detaljer-sample.json`:
```json
{
  "batchid": "BATCH-2026-04-15-001",
  "butikk": "MENY Sandvika",
  "dato": "2026-04-15",
  "sum": 487.40,
  "bonus": 4.87,
  "varer": [
    { "vareTekst": "Kokosmelk Aroy-D 400ml", "ean": "8851014300033", "antall": 2, "belop": 49.80 },
    { "vareTekst": "Sitrongress fersk",      "ean": "7038010000010", "antall": 1, "belop": 18.90 },
    { "vareTekst": "Kyllingfilet 500g",      "ean": "7037100000123", "antall": 1, "belop": 119.00 },
    { "vareTekst": "Limefrukt løsvekt",      "ean": null,             "antall": 4, "belop": 28.00 }
  ]
}
```

- [ ] **Step 2: Write the failing test**

`src/__tests__/trumf-client.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TrumfClient } from '../trumf/client';

const transaksjonerFixture = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__/trumf/transaksjoner-sample.json'), 'utf-8')
);
const detaljerFixture = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__/trumf/detaljer-sample.json'), 'utf-8')
);

describe('TrumfClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('listTransaksjoner sends bearer + fra/til and parses response', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(transaksjonerFixture), { status: 200 }));
    const client = new TrumfClient({ bearer: 'fake-jwt-token-1234567890', fetchImpl: fetchMock });

    const out = await client.listTransaksjoner({ fra: '2026-04-01', til: '2026-04-30' });

    expect(out.transaksjoner).toHaveLength(2);
    expect(out.transaksjoner[0].batchid).toBe('BATCH-2026-04-15-001');
    expect(fetchMock).toHaveBeenCalledOnce();
    const callArgs = fetchMock.mock.calls[0];
    const url = String(callArgs[0]);
    const init = (callArgs[1] ?? {}) as RequestInit;
    expect(url).toContain('/trumf/husstand/transaksjoner');
    expect(url).toContain('fra=2026-04-01');
    expect(url).toContain('til=2026-04-30');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer fake-jwt-token-1234567890');
  });

  it('getTransaksjonDetaljer hits the per-batch endpoint and parses lines', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(detaljerFixture), { status: 200 }));
    const client = new TrumfClient({ bearer: 'fake-jwt-token-1234567890', fetchImpl: fetchMock });

    const out = await client.getTransaksjonDetaljer('BATCH-2026-04-15-001');
    expect(out.batchid).toBe('BATCH-2026-04-15-001');
    expect(out.varer).toHaveLength(4);
    expect(out.varer[3].ean).toBeNull();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/trumf/husstand/transaksjoner/detaljer/BATCH-2026-04-15-001');
  });

  it('throws on 401 with a useful message (auth failure)', async () => {
    const fetchMock = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    const client = new TrumfClient({ bearer: 'expired', fetchImpl: fetchMock, maxRetries: 0 });
    await expect(client.listTransaksjoner({ fra: '2026-04-01', til: '2026-04-30' })).rejects.toThrow(/401/);
  });
});
```

- [ ] **Step 3: Run test — should FAIL (no module)**

```bash
npx vitest run src/__tests__/trumf-client.test.ts
```
Expected: FAIL ("Cannot find module '../trumf/client'").

- [ ] **Step 4: Implement client**

`src/trumf/client.ts`:
```typescript
import { z } from 'zod';
import { TrumfTransaksjonerResponse, TrumfTransaksjonDetaljer } from './schemas';

const DEFAULT_BASE = 'https://platform-rest-prod.ngdata.no';
const USER_AGENT = 'Foodie/0.1 (Phase-1 personal use; +https://github.com/tomhoel/foodie-hoely)';

export interface TrumfClientOptions {
  bearer: string;
  baseUrl?: string;
  /** Test seam — defaults to global fetch. */
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  baseBackoffMs?: number;
}

export class TrumfClient {
  private readonly bearer: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;

  constructor(opts: TrumfClientOptions) {
    if (!opts.bearer) throw new Error('TrumfClient: bearer is required');
    this.bearer = opts.bearer;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxRetries = opts.maxRetries ?? 2;
    this.baseBackoffMs = opts.baseBackoffMs ?? 500;
  }

  async listTransaksjoner(args: { fra: string; til: string }): Promise<z.infer<typeof TrumfTransaksjonerResponse>> {
    const url = `${this.baseUrl}/trumf/husstand/transaksjoner?fra=${encodeURIComponent(args.fra)}&til=${encodeURIComponent(args.til)}`;
    return this.requestJson(url, TrumfTransaksjonerResponse);
  }

  async getTransaksjonDetaljer(batchid: string): Promise<z.infer<typeof TrumfTransaksjonDetaljer>> {
    if (!batchid) throw new Error('getTransaksjonDetaljer: batchid is required');
    const url = `${this.baseUrl}/trumf/husstand/transaksjoner/detaljer/${encodeURIComponent(batchid)}`;
    return this.requestJson(url, TrumfTransaksjonDetaljer);
  }

  private async requestJson<S extends z.ZodTypeAny>(url: string, schema: S): Promise<z.infer<S>> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await this.fetchImpl(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.bearer}`,
            'Accept': 'application/json',
            'User-Agent': USER_AGENT,
          },
        });
        if (res.status === 401 || res.status === 403) {
          throw new Error(`Trumf ${res.status} (auth) — token may be expired. Re-run \`npm run trumf-set-token\`.`);
        }
        if (res.status >= 500 || res.status === 429) {
          if (attempt < this.maxRetries) {
            await this.sleep(this.backoff(attempt));
            continue;
          }
          throw new Error(`Trumf ${res.status} after ${attempt + 1} attempts: ${url}`);
        }
        if (!res.ok) {
          throw new Error(`Trumf ${res.status}: ${url}`);
        }
        const json = await res.json();
        const parsed = schema.safeParse(json);
        if (!parsed.success) {
          throw new Error(`Trumf response failed schema validation: ${parsed.error.message}`);
        }
        return parsed.data;
      } catch (e) {
        lastErr = e;
        // Re-throw immediately on auth/parse errors (their message is user-actionable).
        if (e instanceof Error && /^Trumf (401|403|response)/.test(e.message)) throw e;
        if (attempt >= this.maxRetries) throw e;
        await this.sleep(this.backoff(attempt));
      }
    }
    throw new Error(`Trumf: exhausted retries on ${url}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
  }

  private backoff(attempt: number): number {
    return this.baseBackoffMs * Math.pow(2, attempt);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
```

- [ ] **Step 5: Run test — should PASS**

```bash
npx vitest run src/__tests__/trumf-client.test.ts
```
Expected: 3/3 passing.

- [ ] **Step 6: Type-check + full suite**

```bash
npm exec tsc --noEmit
npm test
```
Expected: clean; total now ~148 passing (no regressions).

- [ ] **Step 7: Commit**

```bash
git add src/trumf/client.ts src/trumf/schemas.ts src/__tests__/trumf-client.test.ts src/__tests__/__fixtures__/trumf/
git commit -m "feat(phase-1-w4b): TrumfClient (TDD, 3 tests, fixture-driven)"
```

(If you committed schemas separately in Task 2, just include the new files for Task 3 — the staging command above is harmless even if some files are already committed.)

---

## Task 4 — Transactions repo

**Files:**
- Create: `src/db/repositories/transactions.repo.ts`

- [ ] **Step 1: Implement**

```typescript
import { getSupabase } from '../client';

export interface TransactionRow {
  id: string;
  household_id: string;
  trumf_batch_id: string;
  dealer_id: string | null;
  purchased_at: string;
  total_nok: number;
  trumf_earned_nok: number;
  trumf_extra_nok: number;
  fetched_at: string;
}

export interface TransactionLineRow {
  id: string;
  transaction_id: string;
  ean: string | null;
  name_raw: string;
  quantity: number | null;
  line_total_nok: number;
  reconciled_to_shopping_item_id: string | null;
}

export interface UpsertTransactionInput {
  householdId: string;
  trumfBatchId: string;
  dealerId: string | null;
  purchasedAt: string;
  totalNok: number;
  trumfEarnedNok?: number;
  trumfExtraNok?: number;
}

export interface UpsertResult {
  row: TransactionRow;
  /** True iff this trumf_batch_id was inserted by this call (vs already present). */
  inserted: boolean;
}

export async function upsertTransaction(input: UpsertTransactionInput): Promise<UpsertResult> {
  const supabase = getSupabase();
  const existing = await supabase
    .from('transactions')
    .select('*')
    .eq('trumf_batch_id', input.trumfBatchId)
    .maybeSingle();
  if (existing.error) throw new Error(`upsertTransaction (select): ${existing.error.message}`);
  if (existing.data) return { row: existing.data as TransactionRow, inserted: false };

  const insert = await supabase
    .from('transactions')
    .insert({
      household_id: input.householdId,
      trumf_batch_id: input.trumfBatchId,
      dealer_id: input.dealerId,
      purchased_at: input.purchasedAt,
      total_nok: input.totalNok,
      trumf_earned_nok: input.trumfEarnedNok ?? 0,
      trumf_extra_nok: input.trumfExtraNok ?? 0,
    })
    .select('*')
    .single();
  if (insert.error || !insert.data) throw new Error(`upsertTransaction (insert): ${insert.error?.message ?? 'no row'}`);
  return { row: insert.data as TransactionRow, inserted: true };
}

export interface InsertLineInput {
  ean: string | null;
  nameRaw: string;
  quantity: number | null;
  lineTotalNok: number;
}

/**
 * Replace-then-insert: clears existing lines for this transaction (idempotent
 * re-runs) and inserts the provided rows. Phase-1 receipts are immutable on
 * Trumf's side, so this is safe.
 */
export async function replaceTransactionLines(
  transactionId: string,
  lines: InsertLineInput[]
): Promise<TransactionLineRow[]> {
  const supabase = getSupabase();
  const del = await supabase.from('transaction_lines').delete().eq('transaction_id', transactionId);
  if (del.error) throw new Error(`replaceTransactionLines (clear): ${del.error.message}`);

  if (lines.length === 0) return [];
  const rows = lines.map((l) => ({
    transaction_id: transactionId,
    ean: l.ean,
    name_raw: l.nameRaw,
    quantity: l.quantity,
    line_total_nok: l.lineTotalNok,
  }));
  const ins = await supabase.from('transaction_lines').insert(rows).select('*');
  if (ins.error) throw new Error(`replaceTransactionLines (insert): ${ins.error.message}`);
  return (ins.data ?? []) as TransactionLineRow[];
}

export async function listLinesForTransaction(transactionId: string): Promise<TransactionLineRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('transaction_lines')
    .select('*')
    .eq('transaction_id', transactionId);
  if (error) throw new Error(`listLinesForTransaction: ${error.message}`);
  return (data ?? []) as TransactionLineRow[];
}
```

- [ ] **Step 2: Verify**

```bash
npm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/db/repositories/transactions.repo.ts
git commit -m "feat(phase-1-w4b): transactions repo (idempotent upsert by batchid + replace-lines)"
```

---

## Task 5 — Pantry updater (TDD)

**Files:**
- Create: `src/reconciler/pantry-updater.ts`
- Create: `src/__tests__/pantry-updater.test.ts`

The updater is **pure** — it consumes a list of transaction lines + a "product lookup by EAN" function and returns a list of `PantryUpsert` operations. Persistence happens in the orchestrator (Task 7). This keeps the unit testable without DB.

- [ ] **Step 1: Failing test**

```typescript
// src/__tests__/pantry-updater.test.ts
import { describe, it, expect } from 'vitest';
import { computePantryUpserts, type LineForUpdate, type ProductLookup } from '../reconciler/pantry-updater';

describe('computePantryUpserts', () => {
  it('EAN-matched line yields high-confidence upsert with product link', () => {
    const lines: LineForUpdate[] = [
      { ean: '8851014300033', nameRaw: 'Kokosmelk Aroy-D 400ml', quantity: 2, lineTotalNok: 49.8 },
    ];
    const products: ProductLookup = new Map([
      ['8851014300033', { id: 'prod-1', name: 'Kokosmelk Aroy-D 400ml', weightKg: 0.4 }],
    ]);
    const out = computePantryUpserts({ householdId: 'hh-1', lines, productsByEan: products });
    expect(out).toHaveLength(1);
    expect(out[0].ean).toBe('8851014300033');
    expect(out[0].productName).toBe('Kokosmelk Aroy-D 400ml');
    expect(out[0].confidence).toBeCloseTo(0.95, 5);
    // 2 units × 0.4 kg = 0.8 kg = 800 g
    expect(out[0].quantityGrams).toBeCloseTo(800, 5);
    expect(out[0].lastSeenSource).toBe('receipt');
  });

  it('EAN-missing line yields lower-confidence upsert keyed by name', () => {
    const lines: LineForUpdate[] = [
      { ean: null, nameRaw: 'Limefrukt løsvekt', quantity: 4, lineTotalNok: 28.0 },
    ];
    const out = computePantryUpserts({ householdId: 'hh-1', lines, productsByEan: new Map() });
    expect(out).toHaveLength(1);
    expect(out[0].ean).toBeNull();
    expect(out[0].productName).toBe('Limefrukt løsvekt');
    expect(out[0].confidence).toBeCloseTo(0.7, 5);
    // No EAN/weight → fall back to count×80g default per piece (rough estimate, documented).
    expect(out[0].quantityGrams).toBeCloseTo(320, 5);
  });

  it('empty lines yield empty upserts', () => {
    expect(
      computePantryUpserts({ householdId: 'hh-1', lines: [], productsByEan: new Map() })
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — should FAIL.**

```bash
npx vitest run src/__tests__/pantry-updater.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// src/reconciler/pantry-updater.ts

export interface LineForUpdate {
  ean: string | null;
  nameRaw: string;
  quantity: number | null;
  lineTotalNok: number;
}

export interface ProductLookupEntry {
  id: string;
  name: string;
  /** Per-unit weight in kg if known. Used to convert `antall × weight` into grams. */
  weightKg: number | null;
}

export type ProductLookup = Map<string, ProductLookupEntry>;

export interface PantryUpsert {
  householdId: string;
  ean: string | null;
  productName: string;
  productId: string | null;
  quantityGrams: number;
  confidence: number;
  lastSeenSource: 'receipt';
}

const DEFAULT_PIECE_GRAMS = 80; // rough fallback for piece-counted produce

export interface ComputeArgs {
  householdId: string;
  lines: LineForUpdate[];
  productsByEan: ProductLookup;
}

export function computePantryUpserts(args: ComputeArgs): PantryUpsert[] {
  const out: PantryUpsert[] = [];
  for (const line of args.lines) {
    const eanMatch = line.ean ? args.productsByEan.get(line.ean) : undefined;
    const qty = line.quantity ?? 1;
    let grams: number;
    if (eanMatch && typeof eanMatch.weightKg === 'number' && eanMatch.weightKg > 0) {
      grams = qty * eanMatch.weightKg * 1000;
    } else {
      grams = qty * DEFAULT_PIECE_GRAMS;
    }
    out.push({
      householdId: args.householdId,
      ean: line.ean,
      productName: eanMatch?.name ?? line.nameRaw,
      productId: eanMatch?.id ?? null,
      quantityGrams: grams,
      confidence: eanMatch ? 0.95 : 0.7,
      lastSeenSource: 'receipt',
    });
  }
  return out;
}
```

- [ ] **Step 4: Run — should PASS (3/3).**

```bash
npx vitest run src/__tests__/pantry-updater.test.ts
```

- [ ] **Step 5: Type-check + commit**

```bash
npm exec tsc --noEmit
git add src/reconciler/pantry-updater.ts src/__tests__/pantry-updater.test.ts
git commit -m "feat(phase-1-w4b): pantry updater (pure, EAN/name-fallback, TDD)"
```

---

## Task 6 — Plan matcher (TDD)

**Files:**
- Create: `src/reconciler/plan-matcher.ts`
- Create: `src/__tests__/plan-matcher.test.ts`

Pure function: given a transaction's lines + a set of recently-planned recipes (with their ingredient names), return the best-overlap match if Jaccard > threshold.

- [ ] **Step 1: Failing test**

```typescript
// src/__tests__/plan-matcher.test.ts
import { describe, it, expect } from 'vitest';
import { matchTransactionToPlannedMeal, tokenize } from '../reconciler/plan-matcher';

describe('tokenize', () => {
  it('lowercases, strips diacritics, splits non-letter chars, filters short tokens', () => {
    expect(tokenize('Kokosmelk Aroy-D 400ml')).toEqual(['kokosmelk', 'aroy', '400ml']);
    expect(tokenize('Sitrongress fersk')).toEqual(['sitrongress', 'fersk']);
    expect(tokenize('Limefrukt løsvekt')).toEqual(['limefrukt', 'losvekt']);
  });
});

describe('matchTransactionToPlannedMeal', () => {
  const candidates = [
    {
      mealPlanItemId: 'mpi-1',
      recipeId: 'r-1',
      plannedFor: '2026-04-15',
      title: 'Tom Kha Gai',
      ingredientTexts: ['200 g kokosmelk', 'kyllingfilet 500 g', 'sitrongress', '4 lime'],
    },
    {
      mealPlanItemId: 'mpi-2',
      recipeId: 'r-2',
      plannedFor: '2026-04-15',
      title: 'Spaghetti Carbonara',
      ingredientTexts: ['500 g spaghetti', '200 g pancetta', '4 egg', 'parmesan'],
    },
  ];

  it('chooses the recipe with highest overlap when above threshold', () => {
    const lines = [
      'Kokosmelk Aroy-D 400ml',
      'Kyllingfilet 500g',
      'Sitrongress fersk',
      'Limefrukt løsvekt',
    ];
    const out = matchTransactionToPlannedMeal({
      transactionDate: '2026-04-15',
      lineNames: lines,
      candidates,
      windowDays: 2,
      minOverlap: 0.3,
    });
    expect(out).not.toBeNull();
    expect(out!.mealPlanItemId).toBe('mpi-1');
    expect(out!.score).toBeGreaterThan(0.3);
  });

  it('returns null when no candidate clears the threshold', () => {
    const lines = ['Snickers Mini', 'Coca-Cola 1.5L', 'Avispapir Aftenposten'];
    const out = matchTransactionToPlannedMeal({
      transactionDate: '2026-04-15',
      lineNames: lines,
      candidates,
      windowDays: 2,
      minOverlap: 0.3,
    });
    expect(out).toBeNull();
  });

  it('skips candidates outside the date window', () => {
    const lines = ['Kokosmelk Aroy-D 400ml', 'Kyllingfilet 500g', 'Sitrongress fersk', 'Limefrukt'];
    const out = matchTransactionToPlannedMeal({
      transactionDate: '2026-04-25',  // 10 days after planned-for
      lineNames: lines,
      candidates,
      windowDays: 2,
      minOverlap: 0.3,
    });
    expect(out).toBeNull();
  });
});
```

- [ ] **Step 2: Run — FAIL.**

```bash
npx vitest run src/__tests__/plan-matcher.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// src/reconciler/plan-matcher.ts

export interface PlanMatchCandidate {
  mealPlanItemId: string;
  recipeId: string;
  plannedFor: string; // YYYY-MM-DD
  title: string;
  ingredientTexts: string[];
}

export interface MatchArgs {
  transactionDate: string; // YYYY-MM-DD or ISO timestamp; only the date part matters
  lineNames: string[];
  candidates: PlanMatchCandidate[];
  windowDays?: number;     // default 2
  minOverlap?: number;     // default 0.3 (Jaccard)
}

export interface MatchResult {
  mealPlanItemId: string;
  recipeId: string;
  score: number;
  matchedTokens: string[];
}

const DEFAULT_WINDOW_DAYS = 2;
const DEFAULT_MIN_OVERLAP = 0.3;
const STOPWORDS = new Set([
  'g', 'kg', 'ml', 'dl', 'l', 'ss', 'ts', 'stk', 'kopp',
  'fersk', 'løsvekt', 'losvekt', 'lite', 'mye', 'frukt',
]);

export function tokenize(s: string): string[] {
  const lowered = s
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/å/g, 'a');
  return lowered
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function dateOnly(s: string): string {
  return s.slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  const da = new Date(`${dateOnly(a)}T00:00:00Z`).getTime();
  const db = new Date(`${dateOnly(b)}T00:00:00Z`).getTime();
  return Math.abs(Math.round((da - db) / 86_400_000));
}

function jaccard(a: Set<string>, b: Set<string>): { score: number; intersection: string[] } {
  const inter = new Set<string>();
  for (const t of a) if (b.has(t)) inter.add(t);
  const union = new Set<string>([...a, ...b]);
  if (union.size === 0) return { score: 0, intersection: [] };
  return { score: inter.size / union.size, intersection: Array.from(inter) };
}

export function matchTransactionToPlannedMeal(args: MatchArgs): MatchResult | null {
  const windowDays = args.windowDays ?? DEFAULT_WINDOW_DAYS;
  const minOverlap = args.minOverlap ?? DEFAULT_MIN_OVERLAP;

  const lineTokens = new Set(args.lineNames.flatMap(tokenize));
  if (lineTokens.size === 0) return null;

  let best: MatchResult | null = null;
  for (const c of args.candidates) {
    if (dayDiff(args.transactionDate, c.plannedFor) > windowDays) continue;
    const recipeTokens = new Set(c.ingredientTexts.flatMap(tokenize));
    const { score, intersection } = jaccard(lineTokens, recipeTokens);
    if (score >= minOverlap && (!best || score > best.score)) {
      best = {
        mealPlanItemId: c.mealPlanItemId,
        recipeId: c.recipeId,
        score,
        matchedTokens: intersection,
      };
    }
  }
  return best;
}
```

- [ ] **Step 4: Run — PASS (4/4).**

```bash
npx vitest run src/__tests__/plan-matcher.test.ts
```

- [ ] **Step 5: Type-check + commit**

```bash
npm exec tsc --noEmit
git add src/reconciler/plan-matcher.ts src/__tests__/plan-matcher.test.ts
git commit -m "feat(phase-1-w4b): plan matcher (Jaccard token overlap, ±2 day window, TDD)"
```

---

## Task 7 — Reconciler orchestrator

**Files:**
- Create: `src/reconciler/index.ts`

Wires the pure pieces (Task 5 + 6) to live DB writes: looks up products by EAN, writes pantry upserts, queries planned meals around the transaction date, marks `cooked` if a strong match exists.

- [ ] **Step 1: Implement**

```typescript
import { getSupabase } from '../db/client';
import type { TransactionRow, TransactionLineRow } from '../db/repositories/transactions.repo';
import { computePantryUpserts, type ProductLookup, type PantryUpsert } from './pantry-updater';
import { matchTransactionToPlannedMeal, type PlanMatchCandidate } from './plan-matcher';

export interface ReconcileResult {
  transactionId: string;
  pantryUpserted: number;
  pantryLinkedByEan: number;
  planMatched: { mealPlanItemId: string; recipeId: string; score: number } | null;
}

export async function reconcileTransaction(
  txn: TransactionRow,
  lines: TransactionLineRow[]
): Promise<ReconcileResult> {
  const supabase = getSupabase();

  // 1. Look up products by EAN in one batch.
  const eans = lines.map((l) => l.ean).filter((e): e is string => typeof e === 'string' && e.length > 0);
  let productsByEan: ProductLookup = new Map();
  if (eans.length > 0) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, ean, weight_kg')
      .in('ean', eans);
    if (error) throw new Error(`reconcileTransaction (products): ${error.message}`);
    for (const row of data ?? []) {
      const r = row as { id: string; name: string; ean: string | null; weight_kg: number | null };
      if (r.ean) productsByEan.set(r.ean, { id: r.id, name: r.name, weightKg: r.weight_kg ?? null });
    }
  }

  // 2. Compute pantry upserts (pure).
  const upserts: PantryUpsert[] = computePantryUpserts({
    householdId: txn.household_id,
    lines: lines.map((l) => ({ ean: l.ean, nameRaw: l.name_raw, quantity: l.quantity, lineTotalNok: l.line_total_nok })),
    productsByEan,
  });

  // 3. Apply pantry upserts. Phase-1 uses a delete+insert by (household_id, ean OR product_name)
  //    so re-running stays idempotent. ean-keyed rows take precedence.
  let linkedByEan = 0;
  for (const u of upserts) {
    if (u.ean) {
      const del = await supabase
        .from('pantry_items')
        .delete()
        .eq('household_id', u.householdId)
        .eq('ean', u.ean);
      if (del.error) throw new Error(`pantry_items (clear by ean): ${del.error.message}`);
      linkedByEan++;
    } else {
      const del = await supabase
        .from('pantry_items')
        .delete()
        .eq('household_id', u.householdId)
        .is('ean', null)
        .eq('product_name', u.productName);
      if (del.error) throw new Error(`pantry_items (clear by name): ${del.error.message}`);
    }
    const ins = await supabase.from('pantry_items').insert({
      household_id: u.householdId,
      ean: u.ean,
      product_name: u.productName,
      quantity_grams: u.quantityGrams,
      confidence: u.confidence,
      last_seen_source: u.lastSeenSource,
      last_seen_at: txn.purchased_at,
    });
    if (ins.error) throw new Error(`pantry_items (insert): ${ins.error.message}`);
  }

  // 4. Find candidate planned meals within ±2 days.
  const purchaseDay = txn.purchased_at.slice(0, 10);
  const candidates = await loadCandidatesForHousehold(txn.household_id, purchaseDay);

  // 5. Score the match.
  const match = matchTransactionToPlannedMeal({
    transactionDate: purchaseDay,
    lineNames: lines.map((l) => l.name_raw),
    candidates,
    windowDays: 2,
    minOverlap: 0.3,
  });

  // 6. If matched, mark the meal_plan_item as cooked.
  if (match) {
    const upd = await supabase
      .from('meal_plan_items')
      .update({ status: 'cooked', cooked_confirmed_via: 'receipt' })
      .eq('id', match.mealPlanItemId);
    if (upd.error) throw new Error(`mark cooked: ${upd.error.message}`);
  }

  return {
    transactionId: txn.id,
    pantryUpserted: upserts.length,
    pantryLinkedByEan: linkedByEan,
    planMatched: match ? { mealPlanItemId: match.mealPlanItemId, recipeId: match.recipeId, score: match.score } : null,
  };
}

async function loadCandidatesForHousehold(householdId: string, purchaseDay: string): Promise<PlanMatchCandidate[]> {
  const supabase = getSupabase();
  // ±3 days to be safe (matcher itself enforces ±2).
  const cutoffStart = new Date(`${purchaseDay}T00:00:00Z`);
  cutoffStart.setUTCDate(cutoffStart.getUTCDate() - 3);
  const cutoffEnd = new Date(`${purchaseDay}T00:00:00Z`);
  cutoffEnd.setUTCDate(cutoffEnd.getUTCDate() + 3);
  const startStr = cutoffStart.toISOString().slice(0, 10);
  const endStr = cutoffEnd.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('meal_plan_items')
    .select('id, recipe_id, planned_for, status, meal_plans!inner(household_id), recipes!inner(title, recipe_ingredients(raw_text))')
    .eq('meal_plans.household_id', householdId)
    .neq('status', 'cooked')
    .gte('planned_for', startStr)
    .lte('planned_for', endStr);
  if (error) throw new Error(`loadCandidatesForHousehold: ${error.message}`);

  return (data ?? []).map((row: any) => ({
    mealPlanItemId: row.id as string,
    recipeId: row.recipe_id as string,
    plannedFor: row.planned_for as string,
    title: row.recipes?.title ?? '',
    ingredientTexts: (row.recipes?.recipe_ingredients ?? []).map((ri: any) => ri.raw_text as string),
  }));
}
```

- [ ] **Step 2: Verify**

```bash
npm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/reconciler/index.ts
git commit -m "feat(phase-1-w4b): reconciler orchestrator (pantry upserts + cooked-confirm)"
```

---

## Task 8 — Trumf sync orchestrator

**Files:**
- Create: `src/trumf/sync.ts`

End-to-end: load token → fetch transaksjoner list for date range → for each batch, fetch detaljer → resolve dealer_id by chain code → upsert transaction + lines → reconcile.

- [ ] **Step 1: Implement**

```typescript
import { TrumfClient } from './client';
import { loadTrumfToken, maskBearer } from './token';
import { getSupabase } from '../db/client';
import { upsertTransaction, replaceTransactionLines } from '../db/repositories/transactions.repo';
import { reconcileTransaction } from '../reconciler';
import type { ChainCode } from '../ingestion/adapter.interface';

export interface TrumfSyncOptions {
  householdId: string;
  fra: string;          // YYYY-MM-DD
  til: string;          // YYYY-MM-DD
  /** Override TrumfClient (test seam). */
  client?: TrumfClient;
}

export interface TrumfSyncSummary {
  fetched: number;
  inserted: number;
  reconciled: Array<{
    trumfBatchId: string;
    pantryUpserted: number;
    planMatched: boolean;
  }>;
  errors: string[];
}

const STORE_TO_CHAIN: Array<{ pattern: RegExp; chain: ChainCode }> = [
  { pattern: /\bmeny\b/i, chain: 'MENY' },
  { pattern: /\bkiwi\b/i, chain: 'KIWI' },
  { pattern: /\bspar\b/i, chain: 'SPAR' },
  { pattern: /\bjoker\b/i, chain: 'JOKER' },
];

function classifyChain(butikk: string | undefined): ChainCode | null {
  if (!butikk) return null;
  for (const m of STORE_TO_CHAIN) if (m.pattern.test(butikk)) return m.chain;
  return null;
}

async function dealerIdForChain(chain: ChainCode | null): Promise<string | null> {
  if (!chain) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase.from('dealers').select('id').eq('code', chain).maybeSingle();
  if (error) throw new Error(`dealerIdForChain (${chain}): ${error.message}`);
  return (data?.id as string | undefined) ?? null;
}

export async function syncTrumfReceipts(opts: TrumfSyncOptions): Promise<TrumfSyncSummary> {
  const summary: TrumfSyncSummary = { fetched: 0, inserted: 0, reconciled: [], errors: [] };

  const client = opts.client ?? buildClientFromDisk();

  const list = await client.listTransaksjoner({ fra: opts.fra, til: opts.til });
  summary.fetched = list.transaksjoner.length;

  for (const summary_t of list.transaksjoner) {
    try {
      const detaljer = await client.getTransaksjonDetaljer(summary_t.batchid);
      const chain = classifyChain(detaljer.butikk ?? summary_t.butikk);
      const dealerId = await dealerIdForChain(chain);

      const { row: txn, inserted } = await upsertTransaction({
        householdId: opts.householdId,
        trumfBatchId: detaljer.batchid,
        dealerId,
        purchasedAt: new Date(`${detaljer.dato}T12:00:00Z`).toISOString(),
        totalNok: detaljer.sum,
        trumfEarnedNok: detaljer.bonus,
        trumfExtraNok: detaljer.bonusEkstra,
      });

      const insertedLines = await replaceTransactionLines(
        txn.id,
        detaljer.varer.map((v) => ({
          ean: v.ean ?? null,
          nameRaw: v.vareTekst,
          quantity: v.antall ?? null,
          lineTotalNok: v.belop,
        }))
      );

      if (inserted) summary.inserted++;

      const recRes = await reconcileTransaction(txn, insertedLines);
      summary.reconciled.push({
        trumfBatchId: detaljer.batchid,
        pantryUpserted: recRes.pantryUpserted,
        planMatched: recRes.planMatched !== null,
      });
    } catch (e) {
      summary.errors.push(`${summary_t.batchid}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return summary;
}

function buildClientFromDisk(): TrumfClient {
  const token = loadTrumfToken();
  if (!token) {
    throw new Error('No Trumf token found. Run `npm run trumf-set-token -- --bearer "<JWT>"` first.');
  }
  console.log(`[trumf] using bearer ${maskBearer(token.bearer)} captured ${token.capturedAt}`);
  return new TrumfClient({ bearer: token.bearer });
}
```

- [ ] **Step 2: Verify**

```bash
npm exec tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/trumf/sync.ts
git commit -m "feat(phase-1-w4b): trumf sync orchestrator (fetch + persist + reconcile)"
```

---

## Task 9 — CLI: trumf-set-token + trumf-sync

**Files:**
- Modify: `package.json`
- Modify: `src/index.ts`

- [ ] **Step 1: Add npm scripts**

In `package.json` `scripts`, add:
```json
"trumf-set-token": "tsx src/index.ts trumf-set-token",
"trumf-sync": "tsx src/index.ts trumf-sync"
```

- [ ] **Step 2: Wire CLI command in `src/index.ts`**

A. Imports — after the existing `import { planWeek } from './planner';` and `import { getOrCreateDefaultHousehold } from './db/repositories/households.repo';` lines, add:
```typescript
import { saveTrumfToken, loadTrumfToken, maskBearer } from './trumf/token';
import { syncTrumfReceipts } from './trumf/sync';
```

B. Switch cases — alongside `case "plan-week":` add:
```typescript
    case "trumf-set-token":
      handleTrumfSetToken(args);
      break;
    case "trumf-sync":
      await handleTrumfSync(args);
      break;
```

C. Handlers — at the bottom of the file (alongside `handlePlanWeek` / `nextMondayIsoDate`), add:
```typescript
function handleTrumfSetToken(args: string[]) {
  const bearer = parseFlagStr(args, '--bearer', '');
  const refresh = parseFlagStr(args, '--refresh', '');
  const expiresAt = parseFlagStr(args, '--expires-at', '');
  if (!bearer) {
    console.error('Usage: trumf-set-token --bearer "<JWT>" [--refresh "<token>"] [--expires-at "<ISO>"]');
    console.error('Capture the bearer from your logged-in browser at trumf.no via DevTools → Network → any /trumf/* request → Authorization header.');
    process.exit(1);
  }
  const saved = saveTrumfToken({
    bearer,
    refresh: refresh || undefined,
    expiresAt: expiresAt || undefined,
  });
  console.log(`[trumf-set-token] saved bearer ${maskBearer(saved.bearer)} at ${saved.capturedAt}`);
}

async function handleTrumfSync(args: string[]) {
  const token = loadTrumfToken();
  if (!token) {
    console.error('No Trumf token. Run `npm run trumf-set-token -- --bearer "<JWT>"` first.');
    process.exit(1);
  }
  const fra = parseFlagStr(args, '--fra', defaultFraDate());
  const til = parseFlagStr(args, '--til', new Date().toISOString().slice(0, 10));
  const hh = await getOrCreateDefaultHousehold();
  console.log(`[trumf-sync] household=${hh.id} fra=${fra} til=${til}`);
  const summary = await syncTrumfReceipts({ householdId: hh.id, fra, til });
  console.log(JSON.stringify(summary, null, 2));
}

function defaultFraDate(): string {
  // Default range: last 30 days.
  const d = new Date(Date.now() - 30 * 86_400_000);
  return d.toISOString().slice(0, 10);
}
```

D. Help text — extend the existing `printHelp()` AI Features section to mention `trumf-set-token` and `trumf-sync`. Two-liner suffices:
```
  trumf-set-token --bearer "<JWT>"       Save Trumf bearer for receipt sync
  trumf-sync [--fra YYYY-MM-DD] [--til YYYY-MM-DD]
                                         Pull Trumf receipts → pantry + plan match
```

- [ ] **Step 3: Type-check + tests**

```bash
npm exec tsc --noEmit
npm test
```
Expected: clean; ~155+ passing.

- [ ] **Step 4: Commit**

```bash
git add package.json src/index.ts
git commit -m "feat(phase-1-w4b): CLI trumf-set-token + trumf-sync"
```

---

## Task 10 — Final verify + tag

- [ ] **Step 1: Full type-check, tests, build**

```bash
npm exec tsc --noEmit
npm test
npm run build
```
Expected: clean; ~155+ tests passing; only `/api/health` route.

- [ ] **Step 2: End-to-end smoke (optional — requires real Trumf token + DB)**

```bash
npm run trumf-set-token -- --bearer "$TRUMF_BEARER"
npm run trumf-sync -- --fra 2026-04-01 --til 2026-04-30
```
Expected JSON: `fetched > 0`, `inserted > 0` on first run, `inserted = 0` on second (idempotent), `reconciled[]` populated. Skip if creds unavailable.

- [ ] **Step 3: Tag**

```bash
git commit --allow-empty -m "Phase 1 Week 4b: Trumf integration + receipt reconciler complete"
git tag phase-1-w4b-complete
```

- [ ] **Step 4: Merge to main + push**

```bash
git checkout main
git merge --ff-only phase-1/trumf-reconciler
git push origin main
git push origin phase-1-w4b-complete
git branch -d phase-1/trumf-reconciler
```

---

## Self-review checklist (run at end of writing this plan)

- Spec coverage: §4 Trumf API → Tasks 2, 3, 8. §6.2 transactions/transaction_lines schema → Task 4 (uses migration 005 as-is). §8.4 receipt reconciler → Tasks 5, 6, 7. §11 token broker → Phase 2 (deferred) — Phase-1 manual capture is Task 1 + 9. §11.4 GDPR fallback → deferred.
- No placeholders: every step has runnable code or exact commands.
- Type consistency: `TransactionRow` / `TransactionLineRow` shapes match between Tasks 4, 5, 7, 8. `PantryUpsert` shape between Tasks 5 and 7. `PlanMatchCandidate` shape between Tasks 6 and 7. `ChainCode` from `src/ingestion/adapter.interface.ts` consistent throughout.
- ToS posture: real Trumf API never called in tests; explicit user consent + bearer-token-only path; user-controlled CLI; matches design spec stance ("we operate with explicit user consent, GDPR Art. 15 right-of-access argument").
- Idempotency: transactions upsert by `trumf_batch_id`; transaction_lines clear-then-insert per batch; pantry_items clear-then-insert by `(household_id, ean)` or `(household_id, product_name)`. Re-running is safe.
