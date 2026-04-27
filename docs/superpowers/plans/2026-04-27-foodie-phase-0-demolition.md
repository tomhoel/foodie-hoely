# Foodie Phase 0 — Demolition & Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Next.js website code, restructure `src/sync/` into the new adapter pattern, add the planning-core schema migration, and migrate `vercel.json` → `vercel.ts`. End state: clean repo where `npm test` and `npm build` both pass, and the system is ready for Phase 1 adapter work.

**Architecture:** Surgical demolition of the website (`app/page.tsx`, `app/recipe/`, `app/favorites/`, `components/`, `hooks/`, `public/`, frontend `lib/*`). Keep Next.js App Router for the API surface. Move `src/sync/*.ts` to `src/ingestion/adapters/*.adapter.ts`. Add `IngestionAdapter` interface + orchestrator registry. Apply migration `005_planning_core.sql` with all new tables from spec §6.2 (RLS enabled but permissive — tightened in Phase 2). Replace `vercel.json` with typed `vercel.ts`.

**Tech Stack:** Next.js 16 App Router (API routes only), TypeScript 5.7, Supabase (Postgres + pgvector), vitest, tsx for CLI, Vercel Cron.

**Spec reference:** `docs/superpowers/specs/2026-04-27-foodie-grocery-planner-design.md` (sections 5, 6, 7, 9, 13)

---

## File-level decomposition

### Files DELETED in this plan
```
app/page.tsx
app/layout.tsx                    (replaced with minimal version)
app/globals.css
app/recipe/                       (entire directory)
app/favorites/                    (entire directory)
app/api/cook/route.ts             (cook moves to CLI only)
app/api/cron/                     (existing untracked stubs — wiped, recreated in Plan B/E)
components/                       (entire directory)
hooks/                            (entire directory)
public/                           (entire directory)
lib/dishes.ts
lib/describe.ts
lib/search.ts
lib/utils.ts
src/sync/sync-orchestrator.ts     (replaced by src/ingestion/orchestrator.ts)
vercel.json                       (replaced by vercel.ts)
next-env.d.ts                     (auto-regenerated)
tsconfig.tsbuildinfo              (auto-regenerated)
```

### Files MOVED in this plan
```
src/sync/meny-sync.ts             → src/ingestion/adapters/meny-direct.adapter.ts
src/sync/afood-sync.ts            → src/ingestion/adapters/afood.adapter.ts
src/sync/price-tracker.ts         → src/ingestion/price-tracker.ts
src/sync/retry-helpers.ts         → src/ingestion/retry-helpers.ts
```

### Files CREATED in this plan
```
app/layout.tsx                    (minimal — required by App Router)
app/api/health/route.ts           (smoke endpoint to confirm Next.js still serves)
src/ingestion/adapter.interface.ts
src/ingestion/orchestrator.ts
src/__tests__/adapter-interface.test.ts
src/__tests__/orchestrator.test.ts
supabase/migrations/005_planning_core.sql
vercel.ts
.env.example                      (refresh — drop website-only vars, add new ones placeholders)
```

### Files MODIFIED in this plan
```
package.json                      (drop frontend deps, drop unused scripts)
next.config.ts                    (remove image patterns)
src/index.ts                      (update import paths after move)
.gitignore                        (add tsconfig.tsbuildinfo if missing)
tsconfig.json                     (verify still correct after restructure)
src/recipes/generator.ts          (update meny-sync import path if referenced)
src/recipes/dietary-adapter.ts    (update import paths if referenced)
src/recipes/fusion.ts             (update import paths if referenced)
```

---

## Task 1: Safety net — tag, branch, baseline

**Files:**
- No code changes — git operations only

- [ ] **Step 1: Verify clean working tree expectations**

```bash
git status --short
```

Expected: shows the existing modifications (M) and untracked files (??) we already have. Note them — we want to know what we're starting with.

- [ ] **Step 2: Stash any unstaged work to preserve it**

```bash
git stash push -u -m "pre-phase-0 wip" || echo "nothing to stash"
```

Expected: either "Saved working directory and index state pre-phase-0 wip" OR "nothing to stash". Don't proceed if this errors.

- [ ] **Step 3: Tag the current commit as the rollback point**

```bash
git tag pre-phase-0-demolition
git tag --list | grep pre-phase-0
```

Expected: `pre-phase-0-demolition`

- [ ] **Step 4: Create a feature branch (optional but recommended)**

```bash
git checkout -b phase-0/demolition
git branch --show-current
```

Expected: `phase-0/demolition`

- [ ] **Step 5: Verify baseline test suite runs (record what's passing now)**

```bash
npm install
npm test 2>&1 | tail -20
```

Expected: vitest summary showing N tests, X passed, Y failed. Record the numbers — we need them green at the end of this plan.

If vitest is not installed, expected output mentions missing dep — install it: `npm add -D vitest`

- [ ] **Step 6: Commit the baseline (no actual changes — just for the audit trail)**

No commit needed; tag is sufficient. Move on.

---

## Task 2: Inventory check — what `lib/` files are imported outside the website?

**Files:**
- Read: `lib/dishes.ts`, `lib/describe.ts`, `lib/search.ts`, `lib/utils.ts`

- [ ] **Step 1: Grep for non-website imports of each `lib/` file**

```bash
grep -r "from ['\"]@/lib/" --include="*.ts" --include="*.tsx" src/ app/ 2>&1 | grep -v "components/\|hooks/\|app/recipe\|app/favorites\|app/page\|app/layout"
```

Expected: very few or zero hits (the `lib/*` files are website-only). Confirm this assumption holds. If `src/` references any `lib/*`, note which file → it must move to `src/` instead of being deleted.

- [ ] **Step 2: If any `lib/*` is imported from `src/`, mark it for relocation**

If the grep above shows e.g. `src/recipes/generator.ts` importing `@/lib/utils`, then `lib/utils.ts` must move to `src/utils/cn.ts` (or equivalent) instead of being deleted. Document any such finds in the task as a relocation step.

For this plan we ASSUME no such imports exist (verify in Step 1). If verification fails, add relocation tasks before proceeding to Task 3.

---

## Task 3: Delete website routes from `app/`

**Files:**
- Delete: `app/page.tsx`, `app/globals.css`
- Delete: `app/recipe/` (directory)
- Delete: `app/favorites/` (directory)

- [ ] **Step 1: Delete the website page files**

```bash
rm -f app/page.tsx app/globals.css
rm -rf app/recipe app/favorites
ls app/
```

Expected: `api  layout.tsx` (only `api/` directory and existing `layout.tsx` remain).

- [ ] **Step 2: Verify no orphan imports of deleted files**

```bash
grep -rn "from ['\"]@/app/page\|from ['\"]@/app/recipe\|from ['\"]@/app/favorites" --include="*.ts" --include="*.tsx" . 2>&1 || echo "no references found"
```

Expected: `no references found`. If references exist, fix them before continuing.

- [ ] **Step 3: Commit the page deletion**

```bash
git add -A
git commit -m "chore(phase-0): delete Next.js website routes"
```

Expected: commit succeeds with `4 files changed, 0 insertions, NNN deletions`.

---

## Task 4: Replace `app/layout.tsx` with API-only minimal version

**Files:**
- Modify: `app/layout.tsx`

Reason: Next.js App Router requires a root layout even for API-only apps. The existing one imports DM Sans, ./globals.css, and `<Providers>` — all of which we're deleting. We need a no-op layout that passes children through.

- [ ] **Step 1: Replace `app/layout.tsx` content**

Overwrite the file with:

```tsx
// Minimal root layout — required by Next.js App Router even for API-only apps.
// No pages are rendered; this exists only to satisfy the framework.
export const metadata = { title: 'Foodie API' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Type-check the layout**

```bash
npm exec tsc --noEmit -p tsconfig.json 2>&1 | head -20
```

Expected: no errors related to `app/layout.tsx`. If `globals.css` is still referenced anywhere in `next.config.ts` or imports, fix.

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "chore(phase-0): replace app/layout.tsx with minimal API-only stub"
```

---

## Task 5: Delete `app/api/cook/route.ts` and existing cron stubs

**Files:**
- Delete: `app/api/cook/route.ts`
- Delete: `app/api/cron/` (untracked stubs from prior work)

Reason: The cook endpoint was for the website's interactive recipe page; we've moved cook to a CLI command. The cron stubs in `app/api/cron/` will be re-created in Plans B + E with new schedule from spec §9.1.

- [ ] **Step 1: Delete the cook endpoint and cron stubs**

```bash
rm -rf app/api/cook app/api/cron
ls app/api/
```

Expected: empty directory listing OR error "No such file or directory" (in which case `rmdir app/api 2>/dev/null` and we'll recreate it in the next task).

- [ ] **Step 2: Recreate `app/api/` with a health endpoint stub**

Mkdir then create `app/api/health/route.ts`:

```bash
mkdir -p app/api/health
```

Then write `app/api/health/route.ts`:

```typescript
// Smoke test: confirms the Next.js API surface is reachable.
// Used by Vercel health checks and during local dev.
export const runtime = 'nodejs';

export async function GET() {
  return Response.json({
    ok: true,
    service: 'foodie-api',
    timestamp: new Date().toISOString(),
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(phase-0): replace app/api/cook with health endpoint stub"
```

---

## Task 6: Delete `components/`, `hooks/`, `public/`

**Files:**
- Delete: `components/` (entire directory)
- Delete: `hooks/` (entire directory)
- Delete: `public/` (entire directory)

- [ ] **Step 1: Delete the directories**

```bash
rm -rf components hooks public
ls
```

Expected: `components`, `hooks`, `public` no longer in the listing.

- [ ] **Step 2: Verify no orphan imports**

```bash
grep -rn "from ['\"]@/components\|from ['\"]@/hooks" --include="*.ts" --include="*.tsx" . 2>&1 || echo "no references found"
```

Expected: `no references found`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(phase-0): delete components/, hooks/, public/ (website-only)"
```

---

## Task 7: Delete frontend-only `lib/*` files

**Files:**
- Delete: `lib/dishes.ts`, `lib/describe.ts`, `lib/search.ts`, `lib/utils.ts`
- Delete: `lib/` (if empty after)

Note: Task 2 verified these are not imported from `src/`. If Task 2 found imports, that file must be moved to `src/utils/` first instead of deleted.

- [ ] **Step 1: Delete the lib files**

```bash
rm -rf lib
ls -d lib 2>&1 || echo "lib/ removed"
```

Expected: `lib/ removed`.

- [ ] **Step 2: Verify no orphan `@/lib/...` imports anywhere**

```bash
grep -rn "from ['\"]@/lib/" --include="*.ts" --include="*.tsx" . 2>&1 || echo "no references found"
```

Expected: `no references found`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(phase-0): delete lib/ (website-only modules)"
```

---

## Task 8: Slim `next.config.ts`

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Replace `next.config.ts` content**

Overwrite with:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // API-only application — no images, no static assets, no rewrites for now.
  // App Router still required for the /api routes.
};

export default nextConfig;
```

- [ ] **Step 2: Verify Next.js config loads cleanly**

```bash
npm exec next info 2>&1 | head -10
```

Expected: prints Next.js version, OS info, no parse errors.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "chore(phase-0): strip image config from next.config.ts"
```

---

## Task 9: Slim `package.json` — remove frontend dependencies

**Files:**
- Modify: `package.json`

Remove these dependency entries (frontend-only):

| Remove from `dependencies` | Why |
|---|---|
| `@base-ui/react` | UI library |
| `class-variance-authority` | UI styling |
| `clsx` | UI styling |
| `fuse.js` | Frontend search |
| `lucide-react` | Icons |
| `shadcn` | Component scaffolding |
| `tailwind-merge` | Tailwind utility |
| `tw-animate-css` | Tailwind animations |

| Remove from `devDependencies` | Why |
|---|---|
| `@tailwindcss/postcss` | Tailwind |
| `postcss` | Tailwind |
| `tailwindcss` | Tailwind |

KEEP these (required for backend):
- `@google/genai`, `@supabase/supabase-js`, `dotenv`, `next`, `pg`, `react`, `react-dom`
- `@types/node`, `@types/react`, `tsx`, `typescript`, `vitest`

- [ ] **Step 1: Read current `package.json`**

```bash
cat package.json
```

Capture the content.

- [ ] **Step 2: Rewrite `package.json` with frontend deps removed**

Replace with the trimmed version. The full `scripts` section, `keywords`, `author`, `license`, `type: "module"` all stay the same.

```json
{
  "name": "foodie",
  "version": "1.0.0",
  "description": "Norwegian grocery planning backend (MENY + Kiwi + AFood)",
  "main": "src/index.ts",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "sync": "tsx src/index.ts sync all",
    "sync:afood": "tsx src/index.ts sync afood",
    "sync:meny": "tsx src/index.ts sync meny",
    "enrich": "tsx src/index.ts enrich",
    "embed": "tsx src/index.ts embed",
    "seed": "tsx src/index.ts seed",
    "link": "tsx src/index.ts link",
    "pipeline": "tsx src/index.ts pipeline",
    "stats": "tsx src/index.ts stats",
    "cook": "tsx src/index.ts cook",
    "match": "tsx src/index.ts match",
    "recipe": "tsx src/index.ts recipe",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "module",
  "dependencies": {
    "@google/genai": "^1.46.0",
    "@supabase/supabase-js": "^2.49.0",
    "dotenv": "^16.4.0",
    "next": "^16.2.1",
    "pg": "^8.20.0",
    "react": "^19.2.4",
    "react-dom": "^19.2.4"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "19.2.14",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^4.1.0"
  }
}
```

Note: Removed `--turbopack` from `dev` because it occasionally has compat issues with Next 16 in API-only mode. Add back if you need it.

- [ ] **Step 3: Reinstall to prune the lockfile**

```bash
rm -rf node_modules pnpm-lock.yaml package-lock.json
npm install
```

Expected: install completes, fewer packages than before. Note the count.

- [ ] **Step 4: Verify type-check still passes**

```bash
npm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```

Expected: no errors. If errors mention missing modules from removed packages, those files were missed in the demolition tasks — search for the import and remove it.

- [ ] **Step 5: Verify tests still pass**

```bash
npm test 2>&1 | tail -10
```

Expected: same pass/fail counts as Task 1 baseline. If any new failures, they're caused by removed deps — fix.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml 2>/dev/null || git add package.json package-lock.json
git commit -m "chore(phase-0): remove frontend-only dependencies"
```

---

## Task 10: Verify `next build` works after demolition

**Files:**
- No changes — verification only

- [ ] **Step 1: Run a full Next build**

```bash
npm build 2>&1 | tail -30
```

Expected: build completes, output mentions `.next/` directory, **only the `/api/health` route is listed** under "Route (app)". No page routes.

If build fails with "Cannot find module 'tailwindcss'" or similar — check `postcss.config.mjs` and remove if it references tailwind:

```bash
cat postcss.config.mjs
```

If it references tailwind, replace with:

```javascript
export default {};
```

Or delete it entirely if it has no other config:

```bash
rm postcss.config.mjs
```

- [ ] **Step 2: Commit any postcss cleanup**

```bash
git add -A
git commit -m "chore(phase-0): clean up postcss config" || echo "nothing to commit"
```

---

## Task 11: Restructure `src/sync/` → `src/ingestion/adapters/`

**Files:**
- Move: `src/sync/meny-sync.ts` → `src/ingestion/adapters/meny-direct.adapter.ts`
- Move: `src/sync/afood-sync.ts` → `src/ingestion/adapters/afood.adapter.ts`
- Move: `src/sync/price-tracker.ts` → `src/ingestion/price-tracker.ts`
- Move: `src/sync/retry-helpers.ts` → `src/ingestion/retry-helpers.ts`
- Delete: `src/sync/sync-orchestrator.ts` (replaced in Task 14)

Note: This task moves files only; no code changes inside the files. Import-path updates happen in Task 12.

- [ ] **Step 1: Create the new directory structure**

```bash
mkdir -p src/ingestion/adapters
ls src/ingestion/
```

Expected: `adapters` is shown.

- [ ] **Step 2: Move the files using `git mv` (preserves history)**

```bash
git mv src/sync/meny-sync.ts src/ingestion/adapters/meny-direct.adapter.ts
git mv src/sync/afood-sync.ts src/ingestion/adapters/afood.adapter.ts
git mv src/sync/price-tracker.ts src/ingestion/price-tracker.ts
git mv src/sync/retry-helpers.ts src/ingestion/retry-helpers.ts
git rm src/sync/sync-orchestrator.ts
rmdir src/sync 2>/dev/null && echo "src/sync removed" || echo "src/sync not empty (unexpected)"
```

Expected: `src/sync removed`. If anything else is in `src/sync/`, list it and decide.

- [ ] **Step 3: Update internal cross-imports inside the moved files**

Inside the moved adapter files, look for relative imports of `./price-tracker`, `./retry-helpers`, `./sync-orchestrator`. Update them:

```bash
grep -rn "from ['\"]\\./" src/ingestion/ 2>&1
```

Replace any references like `./price-tracker` → `../price-tracker` (since the file moved one level deeper into `adapters/`):

```bash
# Use sed in-place on the two adapter files
sed -i 's|from "./price-tracker"|from "../price-tracker"|g' src/ingestion/adapters/meny-direct.adapter.ts src/ingestion/adapters/afood.adapter.ts
sed -i 's|from "./retry-helpers"|from "../retry-helpers"|g' src/ingestion/adapters/meny-direct.adapter.ts src/ingestion/adapters/afood.adapter.ts
sed -i 's|from "./sync-orchestrator"|from "../orchestrator"|g' src/ingestion/adapters/meny-direct.adapter.ts src/ingestion/adapters/afood.adapter.ts 2>/dev/null || true
```

Expected: no errors. Re-grep to verify:

```bash
grep -rn "from ['\"]\\./" src/ingestion/adapters/
```

Expected: imports now use `../price-tracker`, `../retry-helpers`.

- [ ] **Step 4: Update external imports of `src/sync/*` from elsewhere in the codebase**

```bash
grep -rn "from ['\"].*sync/" --include="*.ts" src/ app/ 2>&1
```

Expected: shows places that imported from `src/sync/`. Update them:

```bash
# in src/, references to ../sync/meny-sync → ../ingestion/adapters/meny-direct.adapter
grep -rl "sync/meny-sync" --include="*.ts" src/ | xargs -r sed -i 's|sync/meny-sync|ingestion/adapters/meny-direct.adapter|g'
grep -rl "sync/afood-sync" --include="*.ts" src/ | xargs -r sed -i 's|sync/afood-sync|ingestion/adapters/afood.adapter|g'
grep -rl "sync/price-tracker" --include="*.ts" src/ | xargs -r sed -i 's|sync/price-tracker|ingestion/price-tracker|g'
grep -rl "sync/retry-helpers" --include="*.ts" src/ | xargs -r sed -i 's|sync/retry-helpers|ingestion/retry-helpers|g'
grep -rl "sync/sync-orchestrator" --include="*.ts" src/ | xargs -r sed -i 's|sync/sync-orchestrator|ingestion/orchestrator|g'
```

- [ ] **Step 5: Type-check**

```bash
npm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -20
```

Expected: no errors. If errors mention missing modules from `src/sync/...`, find the un-replaced reference and fix it.

- [ ] **Step 6: Tests still pass**

```bash
npm test 2>&1 | tail -10
```

Expected: same pass/fail counts as baseline.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(phase-0): move src/sync/ to src/ingestion/adapters/"
```

---

## Task 12: Add `IngestionAdapter` interface

**Files:**
- Create: `src/ingestion/adapter.interface.ts`
- Create: `src/__tests__/adapter-interface.test.ts`

- [ ] **Step 1: Write the failing test for the interface contract**

Create `src/__tests__/adapter-interface.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { IngestionAdapter, AdapterCapability, ChainCode } from '../ingestion/adapter.interface';

describe('IngestionAdapter interface', () => {
  it('declares required ChainCode literal union', () => {
    const validCodes: ChainCode[] = ['MENY', 'KIWI', 'AFOOD', 'SPAR', 'JOKER'];
    // Compile-time only — if this typechecks, the union covers our v1 chains.
    expect(validCodes).toHaveLength(5);
  });

  it('declares required AdapterCapability literal union', () => {
    const caps: AdapterCapability[] = ['products', 'prices', 'offers', 'transactions'];
    expect(caps).toHaveLength(4);
  });

  it('a class implementing the interface compiles', () => {
    class TestAdapter implements IngestionAdapter {
      readonly name = 'test';
      readonly capabilities: AdapterCapability[] = ['products'];
      readonly chains: ChainCode[] = ['MENY'];
      async syncProducts() {
        return { adapter: this.name, started: new Date(), finished: new Date(), productsUpserted: 0, errors: [] };
      }
      async refreshPrices(eans: string[]) {
        return eans.map((ean) => ({ ean, price: 0, currency: 'NOK' as const, observedAt: new Date() }));
      }
      async fetchOffers() {
        throw new Error('test adapter does not support offers');
      }
      async healthCheck() {
        return { ok: true, lastSuccess: new Date() };
      }
    }
    const a = new TestAdapter();
    expect(a.name).toBe('test');
    expect(a.capabilities).toContain('products');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails (interface doesn't exist yet)**

```bash
npm test src/__tests__/adapter-interface.test.ts 2>&1 | tail -10
```

Expected: FAIL with "Cannot find module '../ingestion/adapter.interface'" or similar.

- [ ] **Step 3: Write the interface implementation**

Create `src/ingestion/adapter.interface.ts`:

```typescript
/**
 * IngestionAdapter — the only interface external data sources implement.
 *
 * One adapter per source (MENY direct API, Kassalapp, Etilbudsavis, AFood, Trumf).
 * The orchestrator (src/ingestion/orchestrator.ts) is the only file that knows
 * which adapter handles which (chain, dataType). No adapter calls another.
 *
 * See spec §3 (source-of-truth matrix) and §7.1 for design rationale.
 */

export type ChainCode = 'MENY' | 'KIWI' | 'AFOOD' | 'SPAR' | 'JOKER';

export type AdapterCapability = 'products' | 'prices' | 'offers' | 'transactions';

export interface SyncOptions {
  /** When provided, only refresh products updated after this timestamp. */
  since?: Date;
  /** Cap the number of products processed in this run. */
  limit?: number;
  /** When true, skip writes; just compute what would change. */
  dryRun?: boolean;
}

export interface SyncResult {
  adapter: string;
  started: Date;
  finished: Date;
  productsUpserted: number;
  errors: Array<{ message: string; context?: unknown }>;
}

export interface PriceUpdate {
  ean: string;
  price: number;
  currency: 'NOK';
  observedAt: Date;
  isOffer?: boolean;
  comparePrice?: number;
}

export interface OfferRecord {
  externalId: string;
  dealerCode: ChainCode;
  heading: string;
  description?: string;
  price: number;
  prePrice?: number;
  runFrom: Date;
  runTill: Date;
  imageUrl?: string;
}

export interface HealthStatus {
  ok: boolean;
  lastSuccess: Date;
  rateLimitRemaining?: number;
  error?: string;
}

export interface IngestionAdapter {
  readonly name: string;
  readonly capabilities: AdapterCapability[];
  readonly chains: ChainCode[];

  syncProducts(opts: SyncOptions): Promise<SyncResult>;
  refreshPrices(eans: string[]): Promise<PriceUpdate[]>;
  fetchOffers(dealerCode: ChainCode): Promise<OfferRecord[]>;
  healthCheck(): Promise<HealthStatus>;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test src/__tests__/adapter-interface.test.ts 2>&1 | tail -10
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Type-check the whole project**

```bash
npm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/ingestion/adapter.interface.ts src/__tests__/adapter-interface.test.ts
git commit -m "feat(phase-0): add IngestionAdapter interface contract"
```

---

## Task 13: Add the orchestrator (registry + dispatcher)

**Files:**
- Create: `src/ingestion/orchestrator.ts`
- Create: `src/__tests__/orchestrator.test.ts`

The orchestrator is the registry: callers ask "give me the adapter for `(chain, capability)`" and the orchestrator routes. It is the only file that imports adapter implementations.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/orchestrator.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Orchestrator } from '../ingestion/orchestrator';
import type { IngestionAdapter } from '../ingestion/adapter.interface';

function makeFakeAdapter(overrides: Partial<IngestionAdapter> = {}): IngestionAdapter {
  return {
    name: 'fake',
    capabilities: ['products'],
    chains: ['MENY'],
    syncProducts: async () => ({ adapter: 'fake', started: new Date(), finished: new Date(), productsUpserted: 0, errors: [] }),
    refreshPrices: async () => [],
    fetchOffers: async () => { throw new Error('not supported'); },
    healthCheck: async () => ({ ok: true, lastSuccess: new Date() }),
    ...overrides,
  };
}

describe('Orchestrator', () => {
  let orch: Orchestrator;

  beforeEach(() => {
    orch = new Orchestrator();
  });

  it('register() adds an adapter and getByName() returns it', () => {
    const a = makeFakeAdapter({ name: 'meny-direct' });
    orch.register(a);
    expect(orch.getByName('meny-direct')).toBe(a);
  });

  it('throws when registering two adapters claiming the same (chain, capability)', () => {
    orch.register(makeFakeAdapter({ name: 'a', chains: ['MENY'], capabilities: ['products'] }));
    expect(() =>
      orch.register(makeFakeAdapter({ name: 'b', chains: ['MENY'], capabilities: ['products'] }))
    ).toThrow(/already registered/i);
  });

  it('routeFor(chain, capability) returns the adapter that owns that combo', () => {
    const meny = makeFakeAdapter({ name: 'meny-direct', chains: ['MENY'], capabilities: ['products', 'prices'] });
    const eta = makeFakeAdapter({ name: 'etilbudsavis', chains: ['MENY', 'KIWI'], capabilities: ['offers'] });
    orch.register(meny);
    orch.register(eta);
    expect(orch.routeFor('MENY', 'products')).toBe(meny);
    expect(orch.routeFor('MENY', 'offers')).toBe(eta);
    expect(orch.routeFor('KIWI', 'offers')).toBe(eta);
  });

  it('routeFor returns undefined when no adapter handles the combo', () => {
    orch.register(makeFakeAdapter({ chains: ['MENY'], capabilities: ['products'] }));
    expect(orch.routeFor('JOKER', 'transactions')).toBeUndefined();
  });

  it('listAdapters() returns all registered adapters', () => {
    orch.register(makeFakeAdapter({ name: 'a' }));
    orch.register(makeFakeAdapter({ name: 'b', chains: ['KIWI'] }));
    expect(orch.listAdapters().map((x) => x.name).sort()).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test src/__tests__/orchestrator.test.ts 2>&1 | tail -10
```

Expected: FAIL with "Cannot find module '../ingestion/orchestrator'".

- [ ] **Step 3: Write the orchestrator**

Create `src/ingestion/orchestrator.ts`:

```typescript
/**
 * Orchestrator — single registry of all IngestionAdapters.
 *
 * Callers ask for an adapter by name OR by (chain, capability) routing key.
 * Enforces the source-of-truth invariant from spec §3:
 * each (chain, capability) combo has exactly one adapter.
 *
 * No adapter ever calls another adapter; they all go through this registry
 * if cross-source data is ever needed (rare — usually a DB query suffices).
 */

import type { AdapterCapability, ChainCode, IngestionAdapter } from './adapter.interface';

export class Orchestrator {
  private byName = new Map<string, IngestionAdapter>();
  private routes = new Map<string, IngestionAdapter>();

  register(adapter: IngestionAdapter): void {
    if (this.byName.has(adapter.name)) {
      throw new Error(`Adapter "${adapter.name}" is already registered`);
    }
    for (const chain of adapter.chains) {
      for (const capability of adapter.capabilities) {
        const key = this.routeKey(chain, capability);
        const existing = this.routes.get(key);
        if (existing) {
          throw new Error(
            `Route (${chain}, ${capability}) is already registered to "${existing.name}", ` +
              `cannot register "${adapter.name}" for the same combo. ` +
              `See spec §3 source-of-truth matrix.`
          );
        }
        this.routes.set(key, adapter);
      }
    }
    this.byName.set(adapter.name, adapter);
  }

  getByName(name: string): IngestionAdapter | undefined {
    return this.byName.get(name);
  }

  routeFor(chain: ChainCode, capability: AdapterCapability): IngestionAdapter | undefined {
    return this.routes.get(this.routeKey(chain, capability));
  }

  listAdapters(): IngestionAdapter[] {
    return Array.from(this.byName.values());
  }

  private routeKey(chain: ChainCode, capability: AdapterCapability): string {
    return `${chain}::${capability}`;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test src/__tests__/orchestrator.test.ts 2>&1 | tail -10
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Type-check**

```bash
npm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/ingestion/orchestrator.ts src/__tests__/orchestrator.test.ts
git commit -m "feat(phase-0): add Orchestrator registry with route uniqueness invariant"
```

---

## Task 14: Refactor `meny-direct.adapter.ts` to implement `IngestionAdapter`

**Files:**
- Modify: `src/ingestion/adapters/meny-direct.adapter.ts`

The existing file likely exports a function `syncMeny()` or a class `MenySync`. We wrap it in a class implementing `IngestionAdapter` without breaking the existing logic. Tests for the underlying logic stay the same.

- [ ] **Step 1: Read the existing file**

```bash
cat src/ingestion/adapters/meny-direct.adapter.ts | head -50
```

Note the existing exports — we'll preserve them but add the adapter class.

- [ ] **Step 2: Append the IngestionAdapter implementation at the bottom of the file**

Note: the existing file exports `syncMeny()` and a local `SyncOptions` interface. To avoid the name collision with our adapter interface's `SyncOptions`, alias the import.

Add this to the END of `src/ingestion/adapters/meny-direct.adapter.ts` (do not remove existing exports):

```typescript
// ─── IngestionAdapter implementation ─────────────────────────────────────────
import type {
  AdapterCapability,
  ChainCode,
  HealthStatus,
  IngestionAdapter,
  OfferRecord,
  PriceUpdate,
  SyncOptions as AdapterSyncOptions,
  SyncResult,
} from '../adapter.interface';

export class MenyDirectAdapter implements IngestionAdapter {
  readonly name = 'meny-direct';
  readonly capabilities: AdapterCapability[] = ['products', 'prices'];
  readonly chains: ChainCode[] = ['MENY'];

  async syncProducts(opts: AdapterSyncOptions): Promise<SyncResult> {
    const started = new Date();
    let productsUpserted = 0;
    const errors: SyncResult['errors'] = [];
    try {
      // Delegate to the existing syncMeny() exported above.
      // Phase 0 maps the adapter's `since` to legacy `syncTimestamp`;
      // `limit` and `dryRun` are not yet honored by the legacy path
      // and will be wired up properly in Plan B.
      const result = await syncMeny({
        syncTimestamp: opts.since?.toISOString(),
      });
      productsUpserted = result.synced;
    } catch (e) {
      errors.push({ message: e instanceof Error ? e.message : String(e) });
    }
    return { adapter: this.name, started, finished: new Date(), productsUpserted, errors };
  }

  async refreshPrices(_eans: string[]): Promise<PriceUpdate[]> {
    // Phase-0 stub. Real implementation lands in Plan B.
    return [];
  }

  async fetchOffers(_dealerCode: ChainCode): Promise<OfferRecord[]> {
    throw new Error('MenyDirectAdapter does not provide offers; use EtilbudsavisAdapter (spec §3)');
  }

  async healthCheck(): Promise<HealthStatus> {
    // Phase-0 stub. Real check lands in Plan B.
    return { ok: true, lastSuccess: new Date() };
  }
}
```

- [ ] **Step 3: Type-check the file**

```bash
npm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "meny|adapter" | head -10
```

Expected: no errors related to `meny-direct.adapter.ts`. The most likely issue is that the legacy `SyncOptions` interface inside this file conflicts with the imported `AdapterSyncOptions` — the alias in Step 2 should prevent that, but if a conflict appears, rename the legacy interface inside the file (e.g., `LegacyMenySyncOptions`) and update its single call site `syncMeny(opts: LegacyMenySyncOptions = {})`.

- [ ] **Step 4: Tests still pass**

```bash
npm test 2>&1 | tail -10
```

Expected: same pass/fail counts.

- [ ] **Step 5: Commit**

```bash
git add src/ingestion/adapters/meny-direct.adapter.ts
git commit -m "refactor(phase-0): MenyDirectAdapter implements IngestionAdapter (delegates to existing sync)"
```

---

## Task 15: Refactor `afood.adapter.ts` to implement `IngestionAdapter`

**Files:**
- Modify: `src/ingestion/adapters/afood.adapter.ts`

Same pattern as Task 14.

- [ ] **Step 1: Read the existing file's exports**

```bash
grep -n "^export" src/ingestion/adapters/afood.adapter.ts | head -10
```

- [ ] **Step 2: Append the AFoodAdapter class**

Same pattern as Task 14 — alias `SyncOptions` to avoid colliding with the legacy interface in this file.

Add to the bottom of `src/ingestion/adapters/afood.adapter.ts`:

```typescript
// ─── IngestionAdapter implementation ─────────────────────────────────────────
import type {
  AdapterCapability,
  ChainCode,
  HealthStatus,
  IngestionAdapter,
  OfferRecord,
  PriceUpdate,
  SyncOptions as AdapterSyncOptions,
  SyncResult,
} from '../adapter.interface';

export class AFoodAdapter implements IngestionAdapter {
  readonly name = 'afood';
  readonly capabilities: AdapterCapability[] = ['products', 'prices'];
  readonly chains: ChainCode[] = ['AFOOD'];

  async syncProducts(opts: AdapterSyncOptions): Promise<SyncResult> {
    const started = new Date();
    let productsUpserted = 0;
    const errors: SyncResult['errors'] = [];
    try {
      // Delegate to the existing syncAfood() exported above.
      const result = await syncAfood({
        syncTimestamp: opts.since?.toISOString(),
      });
      productsUpserted = result.synced;
    } catch (e) {
      errors.push({ message: e instanceof Error ? e.message : String(e) });
    }
    return { adapter: this.name, started, finished: new Date(), productsUpserted, errors };
  }

  async refreshPrices(_eans: string[]): Promise<PriceUpdate[]> {
    return [];
  }

  async fetchOffers(_dealerCode: ChainCode): Promise<OfferRecord[]> {
    throw new Error('AFoodAdapter does not provide offers; use EtilbudsavisAdapter (spec §3)');
  }

  async healthCheck(): Promise<HealthStatus> {
    return { ok: true, lastSuccess: new Date() };
  }
}
```

- [ ] **Step 3: Type-check + tests**

```bash
npm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
npm test 2>&1 | tail -10
```

Expected: no new errors, tests still pass. Same SyncOptions-alias caveat as Task 14 Step 3 if a name conflict surfaces.

- [ ] **Step 4: Commit**

```bash
git add src/ingestion/adapters/afood.adapter.ts
git commit -m "refactor(phase-0): AFoodAdapter implements IngestionAdapter (delegates to existing scraper)"
```

---

## Task 16: Update `src/index.ts` CLI to use new orchestrator

**Files:**
- Modify: `src/index.ts`

The CLI was importing from `src/sync/sync-orchestrator.ts`. After Task 11, that path is gone. Replace with the new orchestrator + adapter registration.

- [ ] **Step 1: Find the import and call sites**

```bash
grep -n "sync-orchestrator\|syncAll\|syncMeny\|syncAfood" src/index.ts | head -20
```

Note the lines.

- [ ] **Step 2: Replace the imports and the sync command implementation**

In `src/index.ts`, find the section that handles `sync` commands. Replace any reference to the old orchestrator with this pattern:

```typescript
// At the top of src/index.ts, with other imports:
import { Orchestrator } from './ingestion/orchestrator';
import { MenyDirectAdapter } from './ingestion/adapters/meny-direct.adapter';
import { AFoodAdapter } from './ingestion/adapters/afood.adapter';

// Helper used by the sync command(s):
function buildOrchestrator(): Orchestrator {
  const orch = new Orchestrator();
  orch.register(new MenyDirectAdapter());
  orch.register(new AFoodAdapter());
  return orch;
}

// In the `sync` command handler, replace the old call with:
async function runSync(target: 'all' | 'meny' | 'afood') {
  const orch = buildOrchestrator();
  const adapters = orch.listAdapters().filter((a) => {
    if (target === 'all') return true;
    if (target === 'meny') return a.name === 'meny-direct';
    if (target === 'afood') return a.name === 'afood';
    return false;
  });
  for (const a of adapters) {
    console.log(`[sync] ${a.name} starting...`);
    const result = await a.syncProducts({});
    console.log(`[sync] ${a.name} done — upserted ${result.productsUpserted}, errors ${result.errors.length}`);
    for (const err of result.errors) console.error(`  ✗ ${err.message}`);
  }
}
```

- [ ] **Step 3: Type-check**

```bash
npm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4: Smoke-test the CLI (without hitting network — just verify it loads)**

```bash
npm exec tsx src/index.ts --help 2>&1 | head -20 || npm exec tsx src/index.ts 2>&1 | head -20
```

Expected: prints the help banner (the comment block at the top of src/index.ts) or runs without import errors.

- [ ] **Step 5: Tests still pass**

```bash
npm test 2>&1 | tail -10
```

Expected: same pass/fail counts.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "refactor(phase-0): CLI uses new Orchestrator for sync commands"
```

---

## Task 17: Migration `005_planning_core.sql` — all new tables with permissive RLS

**Files:**
- Create: `supabase/migrations/005_planning_core.sql`

This migration adds every new table from spec §6.2. RLS is enabled but policies are permissive in Phase 0 (allow all for service role). Phase 2 tightens policies.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/005_planning_core.sql`:

```sql
-- Phase 0 — Planning core schema
-- Adds all new tables from design spec §6.2.
-- RLS enabled on every per-household table; policies permissive in Phase 0
-- (service role bypasses anyway). Phase 2 introduces user-scoped policies.

-- ─── Existing-table tweaks ──────────────────────────────────────────────────

alter table products
  add column if not exists chain_code text check (chain_code in ('MENY','KIWI','AFOOD','SPAR','JOKER')),
  add column if not exists is_specialty boolean default false;

create index if not exists idx_products_chain_code on products(chain_code);
create index if not exists idx_products_ean on products(ean) where ean is not null;

alter table sync_log
  add column if not exists adapter_name text;

-- ─── Tenancy ────────────────────────────────────────────────────────────────

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null,                      -- references auth.users(id) once Auth is wired in Phase 2
  role text not null check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index if not exists idx_household_members_user on household_members(user_id);

-- ─── Pantry ─────────────────────────────────────────────────────────────────

create table if not exists pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  ean text,
  product_name text not null,
  canonical_ingredient_id uuid references ingredient_mappings(id),
  quantity_grams numeric not null default 0,
  confidence numeric not null default 0.5 check (confidence between 0 and 1),
  last_seen_source text not null check (last_seen_source in ('receipt','photo','manual')),
  last_seen_at timestamptz not null default now(),
  expected_lifetime_days int,
  decayed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pantry_household on pantry_items(household_id);
create index if not exists idx_pantry_canonical on pantry_items(canonical_ingredient_id);

create table if not exists pantry_corrections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  pantry_item_id uuid not null references pantry_items(id) on delete cascade,
  before_grams numeric not null,
  after_grams numeric not null,
  reason text not null check (reason in ('audit','reply','photo_correction')),
  corrected_at timestamptz not null default now()
);

-- ─── Cookbook ───────────────────────────────────────────────────────────────

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,        -- nullable for shared/public
  title text not null,
  source_url text,
  hero_image_url text,
  total_time_minutes int,
  servings int default 4,
  instructions text[] default '{}',
  origin text not null check (origin in ('imported_url','photo','ai_generated','inferred_from_receipt','manual')),
  created_at timestamptz not null default now(),
  last_cooked_at timestamptz,
  times_cooked int not null default 0
);
create index if not exists idx_recipes_household on recipes(household_id);

create table if not exists recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  raw_text text not null,
  quantity_grams numeric,
  unit_original text,
  canonical_ingredient_id uuid references ingredient_mappings(id),
  importance text default 'critical' check (importance in ('critical','enhancing','garnish','optional')),
  substitutes jsonb default '[]'::jsonb
);
create index if not exists idx_recipe_ingredients_recipe on recipe_ingredients(recipe_id);

create table if not exists recipe_embeddings (
  recipe_id uuid primary key references recipes(id) on delete cascade,
  embedding vector(768),
  created_at timestamptz not null default now()
);
create index if not exists idx_recipe_embeddings_hnsw on recipe_embeddings using hnsw (embedding vector_cosine_ops);

-- ─── Offers (etilbudsavis canonical) ────────────────────────────────────────

create table if not exists dealers (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code in ('MENY','KIWI','SPAR','JOKER','AFOOD')),
  trumf_eligible boolean not null default false,
  etilbudsavis_dealer_id text
);

create table if not exists catalogs (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references dealers(id) on delete cascade,
  etilbudsavis_catalog_id text unique not null,
  published_at timestamptz,
  run_from timestamptz,
  run_till timestamptz,
  fetched_at timestamptz not null default now()
);
create index if not exists idx_catalogs_dealer on catalogs(dealer_id);

create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references catalogs(id) on delete cascade,
  dealer_id uuid not null references dealers(id) on delete cascade,
  etilbudsavis_offer_id text unique,
  heading text not null,
  description text,
  price numeric not null,
  pre_price numeric,
  unit text,
  size_grams numeric,
  image_url text,
  run_from timestamptz,
  run_till timestamptz,
  matched_product_id uuid references products(id) on delete set null,
  matched_ean text,
  matched_at timestamptz,
  match_confidence numeric check (match_confidence between 0 and 1)
);
create index if not exists idx_offers_dealer on offers(dealer_id);
create index if not exists idx_offers_run_window on offers(run_from, run_till);
create index if not exists idx_offers_matched_product on offers(matched_product_id) where matched_product_id is not null;

-- ─── Plans, lists, transactions ─────────────────────────────────────────────

create table if not exists meal_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  week_start date not null,
  status text not null default 'draft' check (status in ('draft','locked','completed')),
  generated_at timestamptz not null default now(),
  locked_at timestamptz,
  ai_reasoning text,
  unique (household_id, week_start)
);
create index if not exists idx_meal_plans_household_week on meal_plans(household_id, week_start);

create table if not exists meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references meal_plans(id) on delete cascade,
  recipe_id uuid not null references recipes(id),
  planned_for date not null,
  meal_type text check (meal_type in ('lunch','dinner','breakfast','snack')),
  status text not null default 'planned' check (status in ('planned','cooked','skipped','swapped')),
  cooked_confirmed_via text check (cooked_confirmed_via in ('photo','receipt','manual','inferred'))
);
create index if not exists idx_meal_plan_items_plan on meal_plan_items(meal_plan_id);

create table if not exists shopping_lists (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references meal_plans(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','sent','partially_purchased','completed')),
  total_estimated_nok numeric,
  total_trumf_estimate_nok numeric,
  store_stop_count int,
  generated_at timestamptz not null default now()
);

create table if not exists shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references shopping_lists(id) on delete cascade,
  product_id uuid references products(id),
  suggested_dealer_id uuid references dealers(id),
  quantity_grams numeric,
  estimated_price numeric,
  alternative_dealer_ids uuid[] default '{}',
  deep_link_url text,
  status text not null default 'todo' check (status in ('todo','bought','skipped','substituted')),
  earns_trumf boolean default false
);
create index if not exists idx_shopping_list_items_list on shopping_list_items(shopping_list_id);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  trumf_batch_id text unique not null,
  dealer_id uuid references dealers(id),
  purchased_at timestamptz not null,
  total_nok numeric not null,
  trumf_earned_nok numeric default 0,
  trumf_extra_nok numeric default 0,
  fetched_at timestamptz not null default now()
);
create index if not exists idx_transactions_household_date on transactions(household_id, purchased_at desc);

create table if not exists transaction_lines (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  ean text,
  name_raw text not null,
  quantity numeric,
  line_total_nok numeric not null,
  reconciled_to_shopping_item_id uuid references shopping_list_items(id) on delete set null
);
create index if not exists idx_transaction_lines_tx on transaction_lines(transaction_id);
create index if not exists idx_transaction_lines_ean on transaction_lines(ean) where ean is not null;

-- ─── Budget ─────────────────────────────────────────────────────────────────

create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  period text not null check (period in ('weekly','monthly')),
  total_nok numeric not null,
  applies_from date not null,
  applies_until date,
  is_active boolean not null default true
);
create index if not exists idx_budgets_household_active on budgets(household_id) where is_active;

create table if not exists budget_categories (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references budgets(id) on delete cascade,
  category text not null,
  cap_nok numeric not null,
  current_spend_nok numeric not null default 0
);

create table if not exists budget_envelopes (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references budgets(id) on delete cascade,
  name text not null,
  available_nok numeric not null,
  used_nok numeric not null default 0,
  expires_at date
);

-- ─── Photos & vision ────────────────────────────────────────────────────────

create table if not exists dish_photos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  blob_url text not null,
  captured_at timestamptz,
  received_at timestamptz not null default now(),
  matched_meal_plan_item_id uuid references meal_plan_items(id) on delete set null,
  vision_status text not null default 'queued' check (vision_status in ('queued','processing','awaiting_user','confirmed')),
  ai_inference jsonb,
  user_corrections jsonb
);
create index if not exists idx_dish_photos_household on dish_photos(household_id);

-- ─── Learning ───────────────────────────────────────────────────────────────

create table if not exists cooking_signatures (
  household_id uuid not null references households(id) on delete cascade,
  recipe_canonical_name text not null,
  observed_ingredients jsonb not null default '[]'::jsonb,
  typical_portions_per_person numeric,
  observation_count int not null default 0,
  last_observed_at timestamptz not null default now(),
  primary key (household_id, recipe_canonical_name)
);

create table if not exists audits (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  generated_at timestamptz not null default now(),
  items jsonb not null,
  status text not null default 'pending_reply' check (status in ('pending_reply','partially_replied','closed')),
  responded_at timestamptz
);

-- ─── Trumf credentials (sensitive, service-role only) ───────────────────────

create table if not exists trumf_credentials (
  household_id uuid primary key references households(id) on delete cascade,
  refresh_token_encrypted bytea,
  access_token_encrypted bytea,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  last_successful_refresh timestamptz,
  last_failure_reason text,
  last_failure_at timestamptz
);

-- ─── Ops ────────────────────────────────────────────────────────────────────

create table if not exists ai_usage (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  usd_cost numeric not null default 0,
  called_at timestamptz not null default now(),
  purpose text
);
create index if not exists idx_ai_usage_household_date on ai_usage(household_id, called_at desc);

create table if not exists system_alerts (
  id uuid primary key default gen_random_uuid(),
  severity text not null check (severity in ('info','warning','error','critical')),
  source text not null,
  message text not null,
  context jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ─── RLS — enabled on per-household tables, permissive in Phase 0 ───────────
-- Service role bypasses RLS, so cron/system jobs continue to work.
-- Phase 2 replaces these "true" policies with auth.uid()-scoped ones.

do $$
declare
  t text;
  per_household_tables text[] := array[
    'households','household_members',
    'pantry_items','pantry_corrections',
    'recipes','recipe_ingredients','recipe_embeddings',
    'meal_plans','meal_plan_items','shopping_lists','shopping_list_items',
    'transactions','transaction_lines',
    'budgets','budget_categories','budget_envelopes',
    'dish_photos','cooking_signatures','audits',
    'ai_usage'
  ];
begin
  foreach t in array per_household_tables loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_phase0_permissive', t);
    execute format(
      'create policy %I on %I for all using (true) with check (true)',
      t || '_phase0_permissive', t
    );
  end loop;
end $$;

-- trumf_credentials never gets a public policy (service-role only by design).
alter table trumf_credentials enable row level security;
```

- [ ] **Step 2: Validate the SQL syntactically (no DB needed)**

```bash
# Use Postgres' built-in syntax check via psql if you have a local Postgres, otherwise skip to Step 3.
which psql >/dev/null 2>&1 && echo "psql available" || echo "psql not available — skip to Step 3"
```

If psql is available and you have a local DB:
```bash
psql -d postgres -f supabase/migrations/005_planning_core.sql --single-transaction --set ON_ERROR_STOP=1 -v ON_ERROR_STOP=1 2>&1 | tail -10
```

Otherwise, skip — Supabase's CLI handles validation on push.

- [ ] **Step 3: Apply against Supabase shadow DB (or dry-run via CLI)**

If you have Supabase CLI installed and the project linked:

```bash
which supabase && supabase db push --dry-run 2>&1 | tail -20 || echo "supabase CLI not available — skip dry-run"
```

If not, you'll apply this migration manually in the Supabase dashboard later. Move on.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/005_planning_core.sql
git commit -m "feat(phase-0): migration 005 — planning core tables with permissive RLS"
```

---

## Task 18: Replace `vercel.json` with `vercel.ts`

**Files:**
- Delete: `vercel.json`
- Create: `vercel.ts`

Per spec §4 (now.json removed Mar 31 2026, vercel.ts is the recommended config). The new cron schedule comes from spec §9.1 — but Phase 0 only sets up the file structure with the EXISTING crons. Plan B/C/D/E add their cron entries.

- [ ] **Step 1: Verify `@vercel/config` package availability**

```bash
npm info @vercel/config 2>&1 | head -5
```

Expected: shows package info. If not installed, install:

```bash
npm add @vercel/config
```

- [ ] **Step 2: Create `vercel.ts`**

```typescript
import { type VercelConfig } from '@vercel/config/v1';

// See spec §4 (Vercel platform status) and §9.1 (cron schedule).
// Cron schedules expand in Plans B/C/D/E as new endpoints land.
// Currently includes only the health endpoint and a stub no-op cron
// to confirm the cron mechanism works.

export const config: VercelConfig = {
  framework: 'nextjs',
  // Region: fra1 (Frankfurt) for EU residency + lowest Supabase EU latency.
  regions: ['fra1'],
  functions: {
    'app/api/**/*.ts': {
      maxDuration: 300, // default; Plan E raises planner worker to 600s
    },
  },
  crons: [
    // Health-check ping every hour — proves cron mechanism works,
    // also catches any deploy regressions early.
    { path: '/api/health', schedule: '0 * * * *' },
  ],
};
```

- [ ] **Step 3: Delete the old `vercel.json`**

```bash
git rm vercel.json
```

- [ ] **Step 4: Type-check**

```bash
npm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```

Expected: no errors. If `@vercel/config` types aren't found, ensure `npm add @vercel/config` ran in Step 1.

- [ ] **Step 5: Commit**

```bash
git add vercel.ts package.json pnpm-lock.yaml 2>/dev/null || git add vercel.ts package.json package-lock.json
git commit -m "feat(phase-0): replace vercel.json with typed vercel.ts"
```

---

## Task 19: Refresh `.env.example`

**Files:**
- Modify: `.env.example`

Document the env vars Phase 1 will need so the engineer can fill them in.

- [ ] **Step 1: Read existing `.env.example`**

```bash
cat .env.example
```

- [ ] **Step 2: Replace with the new template**

```bash
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

# AI Gateway (Vercel) — used for all LLM + embedding calls
AI_GATEWAY_API_KEY=

# Google AI (still used for legacy embeddings via @google/genai if needed)
GOOGLE_AI_API_KEY=

# Kassalapp — required for Kiwi catalog ingestion
KASSALAPP_API_KEY=

# Vercel cron auth (Vercel injects this in production; set locally to test)
CRON_SECRET=

# Trumf — Phase 1 manual token capture (Phase 2 uses Sandbox-managed broker)
TRUMF_BEARER=
TRUMF_REFRESH=

# MENY direct (existing var)
MENY_STORE_ID=7080001150488
```

- [ ] **Step 3: Confirm `.env` and `.env.local` are still in `.gitignore`**

```bash
grep -E "^\.env(\.local)?$" .gitignore || echo "MISSING — add them"
```

If missing, append:

```bash
printf "\n.env\n.env.local\n" >> .gitignore
```

- [ ] **Step 4: Commit**

```bash
git add .env.example .gitignore
git commit -m "chore(phase-0): refresh .env.example with Phase 1 vars"
```

---

## Task 20: Final verification + tag

**Files:**
- No changes — verification only

- [ ] **Step 1: Type-check the whole project**

```bash
npm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 2: Run all tests**

```bash
npm test 2>&1 | tail -10
```

Expected: same pass count as Task 1 baseline (no regressions). New tests added in Tasks 12 + 13 should also pass — total count is `baseline + 8` (3 from adapter-interface test + 5 from orchestrator test).

- [ ] **Step 3: Run the build**

```bash
npm build 2>&1 | tail -15
```

Expected: build succeeds. Output should list only `/api/health` under "Route (app)". No page routes.

- [ ] **Step 4: Smoke-test dev server starts**

```bash
npm dev &
DEV_PID=$!
sleep 5
curl -s http://localhost:3000/api/health
kill $DEV_PID 2>/dev/null
wait $DEV_PID 2>/dev/null
echo "---"
```

Expected: curl returns `{"ok":true,"service":"foodie-api","timestamp":"..."}`.

- [ ] **Step 5: Confirm directory structure looks right**

```bash
ls -la
echo "---"
ls src/
echo "---"
ls src/ingestion/
echo "---"
ls src/ingestion/adapters/
echo "---"
ls supabase/migrations/
```

Expected:
- Top level: no `components/`, `hooks/`, `lib/`, `public/`, `vercel.json`. Has `vercel.ts`, `app/`, `src/`, etc.
- `src/`: includes `ingestion/`, no longer has `sync/`.
- `src/ingestion/`: has `adapters/`, `adapter.interface.ts`, `orchestrator.ts`, `price-tracker.ts`, `retry-helpers.ts`.
- `src/ingestion/adapters/`: `meny-direct.adapter.ts`, `afood.adapter.ts`.
- `supabase/migrations/`: includes `005_planning_core.sql`.

- [ ] **Step 6: Tag the milestone**

```bash
git tag phase-0-complete
git tag --list | grep phase
```

Expected: shows `pre-phase-0-demolition` and `phase-0-complete`.

- [ ] **Step 7: Push the branch (if you want a remote backup)**

```bash
git push -u origin phase-0/demolition 2>&1 | tail -5 || echo "no remote configured — skip"
git push --tags 2>&1 | tail -5 || echo "no remote configured — skip"
```

Expected: succeeds, OR "no remote configured" if there's no GitHub origin.

- [ ] **Step 8: Open a PR (optional — depends on workflow)**

If using PR-based merging:

```bash
gh pr create --title "Phase 0: demolition & ingestion restructure" --body "$(cat <<'EOF'
## Summary

- Removes Next.js website code (pages, components, hooks, public, frontend lib)
- Restructures `src/sync/*` → `src/ingestion/adapters/*.adapter.ts`
- Adds `IngestionAdapter` interface + `Orchestrator` registry (with route-uniqueness invariant per spec §3)
- Wraps existing MENY + AFood sync logic as `MenyDirectAdapter` + `AFoodAdapter`
- Migration 005 — all planning-core tables with permissive Phase-0 RLS
- Replaces `vercel.json` with typed `vercel.ts`
- Trims `package.json` of frontend deps

## Test plan

- [x] `npm test` — passes including new adapter-interface + orchestrator tests
- [x] `npm build` — succeeds, only `/api/health` route remains
- [x] `npm dev` + curl `/api/health` returns 200
- [x] Sync CLI loads without import errors

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

If not using PRs, skip.

---

## Self-review checklist (run before claiming done)

- [ ] All 20 tasks have at least one commit
- [ ] No file mentions `lib/dishes`, `lib/utils`, `components/`, `hooks/` anywhere
- [ ] `src/sync/` directory does not exist
- [ ] `src/ingestion/adapter.interface.ts` exports `IngestionAdapter`, `ChainCode`, `AdapterCapability`
- [ ] `src/ingestion/orchestrator.ts` exports `Orchestrator` class
- [ ] `src/ingestion/adapters/meny-direct.adapter.ts` exports `MenyDirectAdapter` class
- [ ] `src/ingestion/adapters/afood.adapter.ts` exports `AFoodAdapter` class
- [ ] `supabase/migrations/005_planning_core.sql` exists and is syntactically valid
- [ ] `vercel.ts` exists, `vercel.json` does not
- [ ] `npm test` passes
- [ ] `npm build` passes
- [ ] `git tag phase-0-complete` exists

---

## Rollback (if anything goes catastrophically wrong)

```bash
git checkout main
git reset --hard pre-phase-0-demolition
git branch -D phase-0/demolition
git tag -d phase-0-complete
```

---

## What this plan explicitly does NOT do (deferred to Plan B+)

- New cron endpoints (Sunday batch enqueuer, kassalapp sync, etilbudsavis sync) — Plan B/E
- KassalappAdapter implementation — Plan B
- EtilbudsavisAdapter implementation — Plan B
- TrumfAdapter implementation — Plan D
- Optimizer, planner, vision, audit, narrator — Plans C/D/E
- Real RLS policies (Phase 0 uses permissive `true` policies)
- Auth wiring (service role used everywhere in Phase 1)
- Migration 005 actually applied to the production Supabase DB — that's a manual step at the very end of Phase 0 once the engineer is ready
