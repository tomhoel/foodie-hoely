# Foodie Phase 2 Week 8 — Supabase Auth + JWT + auto-household onboarding

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Stand up the auth foundation for multi-tenant Foodie. End state: a new user emails `tom@example.com` to `POST /api/auth/start`, gets a 6-digit OTP via Supabase email, runs `POST /api/auth/verify`, gets back a JWT, and can call `GET /api/me` to see their auto-created household. The first authenticated user inherits the Phase-1 "Default Household" so existing data isn't orphaned. RLS tightening + per-table policies land in W9.

**Architecture:**
- **OTP flow** (vs magic link): Supabase Auth's `signInWithOtp({ email, type: 'email' })` sends a 6-digit code by email. The user types it back into our `verifyOtp` endpoint and gets a session JWT. Headless-CLI-friendly — no browser redirect needed.
- **Migration 006**: Add FK `household_members.user_id REFERENCES auth.users(id) ON DELETE CASCADE`. Add a Postgres function `public.foodie_jwt_hook(event jsonb) → jsonb` that injects `household_id` claim. (User must enable it as the Custom Access Token Hook in Supabase Dashboard → Auth → Hooks → Custom Access Token Hook → select `foodie_jwt_hook`. Documented in plan rollout notes.)
- **Auth helper** `requireAuth(req) → { userId, householdId? }`: extracts `Authorization: Bearer` JWT, validates via `supabase.auth.getUser(token)`. Reads `household_id` claim from the JWT if present (lazy-onboarded users get it on their second token refresh; first-token-without-claim is handled by `/api/me`'s auto-onboard path).
- **Token storage**: same pattern as Trumf token — `~/.foodie/auth-token.json`. CLI commands save/load.
- **First-login household creation** in `/api/me`:
  1. Read `userId` from JWT.
  2. Look up `household_members` for this user. If found → return associated household.
  3. If NOT found AND no `household_members` rows exist anywhere → bootstrap: link to the "Default Household" (preserves Phase-1 data).
  4. If NOT found but other households exist → create a NEW household named `${user.email.split('@')[0]}'s household`, insert household_member row.
- **No RLS tightening yet** — service role + JWT both work via existing permissive policies. API endpoints enforce household scoping at the handler layer (each handler checks `householdId === resource.household_id`). RLS hardening is W9's job.
- Tests: auth helper (TDD with mock `getUser`), first-login logic (TDD with fake DB).

**Tech Stack:** Supabase Auth (SDK already installed via `@supabase/supabase-js`), Next.js 16, vitest. No new deps.

**Spec reference:** §10 Auth & multi-tenancy; §6.3 RLS pattern (deferred to W9); §12 API surface

**Predecessor:** phase-2-w7-complete

---

## Tasks

| # | Task | Model | DB needed |
|---|---|---|---|
| 1 | Migration 006: FK + JWT claim function — `supabase/migrations/006_auth.sql` | sonnet | yes (apply manually) |
| 2 | Auth helper (TDD) — `src/api/auth.ts` | sonnet | no |
| 3 | Auth token storage — `src/auth/token.ts` (mirrors Trumf token pattern) | haiku | no |
| 4 | POST `/api/auth/start` (OTP send) | sonnet | no |
| 5 | POST `/api/auth/verify` (OTP exchange) | sonnet | no |
| 6 | First-login onboarding logic (TDD) — `src/auth/onboard.ts` + GET `/api/me` | sonnet | no (TDD pure); endpoint hits live DB |
| 7 | CLI: `signin` + `signin-verify` | sonnet | no |
| 8 | Final verify + tag + merge + push | sonnet | no |

---

## Files created
- supabase/migrations/006_auth.sql
- src/api/auth.ts + test
- src/auth/token.ts
- src/auth/onboard.ts + test
- app/api/auth/start/route.ts
- app/api/auth/verify/route.ts
- app/api/me/route.ts

## Files modified
- package.json (add `signin`, `signin-verify` scripts)
- src/index.ts (register both CLI commands)

## End-state verification
1. `npm test` → ~195+ passing (185 baseline + ~10 new — auth helper + onboard)
2. `npm exec tsc --noEmit` → clean
3. `npm run build` → 7 routes (4 from W6/7 + new `/api/auth/start`, `/api/auth/verify`, `/api/me`)
4. Manual: apply migration 006 + enable hook in Supabase Dashboard, then run `npm run signin -- --email "$YOUR_EMAIL"` → OTP arrives. Run `npm run signin-verify -- --email "$YOUR_EMAIL" --otp 123456` → `~/.foodie/auth-token.json` written. Hit `GET /api/me` with that bearer → JSON `{userId, householdId, email}`.
5. `git tag phase-2-w8-complete`

## Rollback
```bash
git checkout main
git reset --hard phase-2-w7-complete
git branch -D phase-2/auth
git tag -d phase-2-w8-complete

# Manual: in Supabase Dashboard, disable Custom Access Token Hook;
# then `psql` and reverse migration 006:
#   alter table household_members drop constraint household_members_user_id_fkey;
#   drop function if exists public.foodie_jwt_hook(jsonb);
```

## Deferred to later plans
- RLS policy hardening (replace permissive with auth.uid()-based) — W9
- Welcome email on first signup — W9 (folds into onboarding flow)
- Trumf broker on Vercel Sandbox — W10 (depends on per-user auth being live)
- Custom email sender domain — Phase 3
- Telemetry / cost tracking per household — Phase 3
- Rate limiting (Upstash Redis) — Phase 3
- Magic-link redirect flow (current is OTP only) — when SPA frontend lands

---

## Task 1 — Migration 006

**File:** `supabase/migrations/006_auth.sql`

```sql
-- Phase 2 W8 — Auth foundation
-- Adds the FK from household_members.user_id → auth.users so the JWT-claim
-- hook can resolve household_id, and registers the custom-access-token hook
-- function. Service role still bypasses RLS; user-scoped policies land in W9.

-- 1. FK on household_members.user_id (was uuid without FK in 005).
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'household_members_user_id_fkey'
      and table_name = 'household_members'
  ) then
    alter table household_members
      add constraint household_members_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- 2. JWT custom-claim hook. Supabase calls this function on every token issuance.
--    It receives an `event` jsonb with `user_id` and `claims`, and returns the
--    same shape with potentially-modified claims.
create or replace function public.foodie_jwt_hook(event jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  hh_id uuid;
  new_claims jsonb;
begin
  -- Look up the user's primary household (first row by joined_at — Phase 1 has 1 per user).
  select household_id into hh_id
  from public.household_members
  where user_id = (event->>'user_id')::uuid
  order by joined_at asc
  limit 1;

  new_claims := coalesce(event->'claims', '{}'::jsonb);
  if hh_id is not null then
    new_claims := new_claims || jsonb_build_object('household_id', hh_id::text);
  end if;

  return jsonb_build_object('claims', new_claims);
end;
$$;

-- 3. Grant the hook to Supabase's auth admin role.
grant execute on function public.foodie_jwt_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.foodie_jwt_hook(jsonb) from authenticated, anon, public;

-- 4. After migration, manually enable the hook in Supabase Dashboard:
--    Auth → Hooks → "Custom Access Token Hook" → select `public.foodie_jwt_hook`.
--    The Dashboard also accepts `supabase config.toml` flag, documented in
--    docs/superpowers/plans/2026-04-28-foodie-phase-2-w8-auth.md rollout notes.
```

- [ ] **Step 1: Create the file**

- [ ] **Step 2: Verify SQL syntax**

The migration is plain Postgres + Supabase auth admin role. No vitest test for SQL — the manual end-state verification (Step 5 below) exercises it.

- [ ] **Step 3: Document the manual hook-enable step**

In `.env.example`, add a comment block reminding the operator. (No new env vars in this task.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/006_auth.sql
git commit -m "feat(phase-2-w8): migration 006 — household_members FK + foodie_jwt_hook"
```

---

## Task 2 — Auth helper (TDD)

**Files:**
- Create: `src/api/auth.ts`
- Create: `src/__tests__/auth.test.ts`

`requireAuth(req, deps?) → AuthResult`. The auth check is dependency-injected (the Supabase auth client) so tests don't need a real Supabase instance.

- [ ] **Step 1: Failing test**

```typescript
// src/__tests__/auth.test.ts
import { describe, it, expect, vi } from 'vitest';
import { requireAuth, type AuthDeps } from '../api/auth';

function makeReq(token: string | null): Request {
  const headers = new Headers();
  if (token) headers.set('authorization', `Bearer ${token}`);
  return new Request('http://localhost/api/me', { headers });
}

function makeDeps(overrides: Partial<AuthDeps> = {}): AuthDeps {
  return {
    getUser: vi.fn(async () => ({ data: { user: { id: 'u-1', email: 'x@y.z' } }, error: null })),
    ...overrides,
  };
}

describe('requireAuth', () => {
  it('returns userId + email when bearer is valid', async () => {
    const deps = makeDeps();
    const out = await requireAuth(makeReq('valid-jwt'), deps);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.userId).toBe('u-1');
      expect(out.email).toBe('x@y.z');
    }
    expect(deps.getUser).toHaveBeenCalledWith('valid-jwt');
  });

  it('returns 401 when Authorization header is missing', async () => {
    const out = await requireAuth(makeReq(null), makeDeps());
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(401);
      expect(out.message).toMatch(/missing/i);
    }
  });

  it('returns 401 when Supabase rejects the token', async () => {
    const deps = makeDeps({
      getUser: vi.fn(async () => ({ data: { user: null }, error: { message: 'invalid token' } })),
    });
    const out = await requireAuth(makeReq('bad-jwt'), deps);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(401);
      expect(out.message).toMatch(/invalid token/i);
    }
  });

  it('extracts household_id from JWT claims when present', async () => {
    const claimedJwt = 'header.' + Buffer.from(JSON.stringify({ sub: 'u-1', household_id: 'hh-77' })).toString('base64url') + '.sig';
    const deps = makeDeps();
    const out = await requireAuth(makeReq(claimedJwt), deps);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.householdId).toBe('hh-77');
    }
  });

  it('omits householdId when JWT has no household_id claim', async () => {
    const noClaimJwt = 'header.' + Buffer.from(JSON.stringify({ sub: 'u-1' })).toString('base64url') + '.sig';
    const deps = makeDeps();
    const out = await requireAuth(makeReq(noClaimJwt), deps);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.householdId).toBeUndefined();
    }
  });
});
```

Run: `npx vitest run src/__tests__/auth.test.ts` — FAIL.

- [ ] **Step 2: Implement**

```typescript
// src/api/auth.ts

export interface SupabaseUser {
  id: string;
  email?: string;
}

export interface AuthDeps {
  getUser: (jwt: string) => Promise<{ data: { user: SupabaseUser | null }; error: { message: string } | null }>;
}

export type AuthResult =
  | { ok: true; userId: string; email: string | undefined; householdId: string | undefined }
  | { ok: false; status: 401; message: string };

export async function requireAuth(req: Request, deps: AuthDeps): Promise<AuthResult> {
  const header = req.headers.get('authorization');
  if (!header) return { ok: false, status: 401, message: 'missing Authorization header' };
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, status: 401, message: 'malformed Authorization header' };
  const jwt = match[1];

  const { data, error } = await deps.getUser(jwt);
  if (error || !data.user) {
    return { ok: false, status: 401, message: error?.message ?? 'invalid token' };
  }

  return {
    ok: true,
    userId: data.user.id,
    email: data.user.email,
    householdId: extractHouseholdIdFromJwt(jwt),
  };
}

/** Extracts the household_id claim from a JWT payload without verifying signature. */
function extractHouseholdIdFromJwt(jwt: string): string | undefined {
  const parts = jwt.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    const hh = payload.household_id;
    return typeof hh === 'string' ? hh : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Production helper: builds an AuthDeps blob from the configured Supabase URL/anon-key.
 * Lazy-imports to keep tests free of SDK overhead.
 */
export async function buildProductionAuthDeps(): Promise<AuthDeps> {
  const { createClient } = await import('@supabase/supabase-js');
  const { config } = await import('../config');
  const supa = createClient(config.supabase.url, config.supabase.anonKey);
  return {
    getUser: async (jwt: string) => {
      const r = await supa.auth.getUser(jwt);
      return {
        data: { user: r.data.user ? { id: r.data.user.id, email: r.data.user.email ?? undefined } : null },
        error: r.error ? { message: r.error.message } : null,
      };
    },
  };
}

export function authErrorResponse(result: Extract<AuthResult, { ok: false }>): Response {
  return Response.json({ error: result.message }, { status: result.status });
}
```

Run: 5/5 PASS. Run `npm test` — ~190 passing.

- [ ] **Step 3: Type-check + commit**

```bash
npm exec tsc --noEmit
git add src/api/auth.ts src/__tests__/auth.test.ts
git commit -m "feat(phase-2-w8): requireAuth helper + JWT claim extraction (TDD, 5 tests)"
```

---

## Task 3 — Auth token storage

**File:** `src/auth/token.ts`

Mirrors `src/trumf/token.ts` (single JSON at `~/.foodie/auth-token.json`).

```typescript
import { loadJson, saveJson } from '../utils/storage';

const FILENAME = 'auth-token.json';

export interface AuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string; // ISO
  email?: string;
  capturedAt: string;
}

export function loadAuthToken(): AuthToken | null {
  return loadJson<AuthToken>(FILENAME);
}

export function saveAuthToken(input: { accessToken: string; refreshToken?: string; expiresAt?: string; email?: string }): AuthToken {
  if (!input.accessToken || input.accessToken.length < 20) {
    throw new Error('saveAuthToken: accessToken looks invalid (too short).');
  }
  const t: AuthToken = {
    accessToken: input.accessToken.trim(),
    refreshToken: input.refreshToken?.trim(),
    expiresAt: input.expiresAt,
    email: input.email,
    capturedAt: new Date().toISOString(),
  };
  saveJson(FILENAME, t);
  return t;
}

export function maskToken(s: string): string {
  if (s.length <= 6) return '***';
  return `***${s.slice(-6)}`;
}
```

Verify + commit:
```bash
npm exec tsc --noEmit
git add src/auth/token.ts
git commit -m "feat(phase-2-w8): auth token storage at ~/.foodie/auth-token.json"
```

---

## Task 4 — POST `/api/auth/start`

**File:** `app/api/auth/start/route.ts`

```typescript
// Phase 2 W8 — sends a 6-digit OTP via Supabase Auth.
// No auth required (this IS the auth-start path).

import { config } from '../../../../src/config';
import { logEvent } from '../../../../src/api/logger';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const email = (body as { email?: string })?.email?.trim();
  if (!email || !email.includes('@')) {
    return Response.json({ error: 'email is required' }, { status: 400 });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supa = createClient(config.supabase.url, config.supabase.anonKey);
  const { error } = await supa.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });

  if (error) {
    logEvent({ event: 'auth.start_failed', email, error: error.message });
    return Response.json({ error: error.message }, { status: 400 });
  }
  logEvent({ event: 'auth.start_ok', email });
  return Response.json({ ok: true, message: `OTP sent to ${email}` });
}
```

Verify + commit:
```bash
npm exec tsc --noEmit
npm run build
git add app/api/auth/start/route.ts
git commit -m "feat(phase-2-w8): POST /api/auth/start (signInWithOtp)"
```

---

## Task 5 — POST `/api/auth/verify`

**File:** `app/api/auth/verify/route.ts`

```typescript
// Phase 2 W8 — exchanges a 6-digit OTP for a session JWT.
// No auth required — this IS the auth-verify path.

import { config } from '../../../../src/config';
import { logEvent } from '../../../../src/api/logger';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { email, otp } = (body ?? {}) as { email?: string; otp?: string };
  if (!email || !otp) {
    return Response.json({ error: 'email and otp are required' }, { status: 400 });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supa = createClient(config.supabase.url, config.supabase.anonKey);
  const { data, error } = await supa.auth.verifyOtp({ email, token: otp, type: 'email' });

  if (error || !data.session) {
    logEvent({ event: 'auth.verify_failed', email, error: error?.message ?? 'no session' });
    return Response.json({ error: error?.message ?? 'verify failed' }, { status: 401 });
  }

  logEvent({ event: 'auth.verify_ok', email, userId: data.user?.id });
  return Response.json({
    ok: true,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ? new Date(data.session.expires_at * 1000).toISOString() : undefined,
    userId: data.user?.id,
    email: data.user?.email,
  });
}
```

Verify + commit:
```bash
npm exec tsc --noEmit
npm run build
git add app/api/auth/verify/route.ts
git commit -m "feat(phase-2-w8): POST /api/auth/verify (verifyOtp → session)"
```

---

## Task 6 — First-login onboarding (TDD) + GET `/api/me`

**Files:**
- Create: `src/auth/onboard.ts`
- Create: `src/__tests__/auth-onboard.test.ts`
- Create: `app/api/me/route.ts`

The onboard logic is **pure-with-DB-callbacks** so it's TDD-able. It receives a small `OnboardDeps` interface (4 functions) and returns the household to associate with the user.

- [ ] **Step 1: Failing test**

```typescript
// src/__tests__/auth-onboard.test.ts
import { describe, it, expect, vi } from 'vitest';
import { onboardUser, type OnboardDeps } from '../auth/onboard';

function makeDeps(overrides: Partial<OnboardDeps> = {}): OnboardDeps {
  return {
    findMembershipByUser: vi.fn(async () => null),
    countAllMembers: vi.fn(async () => 0),
    findHouseholdByName: vi.fn(async () => null),
    createHousehold: vi.fn(async ({ name }) => ({ id: `hh-new-${name}`, name })),
    insertMember: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('onboardUser', () => {
  it('returns existing household when user already has a membership', async () => {
    const deps = makeDeps({
      findMembershipByUser: vi.fn(async () => ({ household_id: 'hh-existing' })),
    });
    const out = await onboardUser({ userId: 'u-1', email: 'x@y.z' }, deps);
    expect(out.householdId).toBe('hh-existing');
    expect(out.created).toBe(false);
    expect(deps.createHousehold).not.toHaveBeenCalled();
    expect(deps.insertMember).not.toHaveBeenCalled();
  });

  it('first user (zero memberships) inherits the Default Household', async () => {
    const deps = makeDeps({
      findHouseholdByName: vi.fn(async () => ({ id: 'hh-default', name: 'Default Household' })),
    });
    const out = await onboardUser({ userId: 'u-1', email: 'tom@example.com' }, deps);
    expect(out.householdId).toBe('hh-default');
    expect(out.created).toBe(false);
    expect(deps.createHousehold).not.toHaveBeenCalled();
    expect(deps.insertMember).toHaveBeenCalledWith({ householdId: 'hh-default', userId: 'u-1', role: 'owner' });
  });

  it('first user with no Default Household creates a fresh one named after their email', async () => {
    const deps = makeDeps();
    const out = await onboardUser({ userId: 'u-1', email: 'alice@example.com' }, deps);
    expect(out.householdId).toBe('hh-new-alice');
    expect(out.created).toBe(true);
    expect(deps.createHousehold).toHaveBeenCalledWith({ name: 'alice' });
    expect(deps.insertMember).toHaveBeenCalledWith({ householdId: 'hh-new-alice', userId: 'u-1', role: 'owner' });
  });

  it('subsequent user (members exist) creates a fresh household for them', async () => {
    const deps = makeDeps({
      countAllMembers: vi.fn(async () => 3),
    });
    const out = await onboardUser({ userId: 'u-2', email: 'bob@example.com' }, deps);
    expect(out.householdId).toBe('hh-new-bob');
    expect(out.created).toBe(true);
    expect(deps.findHouseholdByName).not.toHaveBeenCalled();
    expect(deps.insertMember).toHaveBeenCalledWith({ householdId: 'hh-new-bob', userId: 'u-2', role: 'owner' });
  });
});
```

Run — FAIL.

- [ ] **Step 2: Implement onboard.ts**

```typescript
// src/auth/onboard.ts

export interface OnboardDeps {
  findMembershipByUser: (userId: string) => Promise<{ household_id: string } | null>;
  countAllMembers: () => Promise<number>;
  findHouseholdByName: (name: string) => Promise<{ id: string; name: string } | null>;
  createHousehold: (args: { name: string }) => Promise<{ id: string; name: string }>;
  insertMember: (args: { householdId: string; userId: string; role: 'owner' | 'member' }) => Promise<void>;
}

export interface OnboardResult {
  householdId: string;
  created: boolean;
}

const DEFAULT_HOUSEHOLD_NAME = 'Default Household';

export async function onboardUser(
  user: { userId: string; email: string },
  deps: OnboardDeps
): Promise<OnboardResult> {
  // 1. Already a member of a household → return it.
  const existing = await deps.findMembershipByUser(user.userId);
  if (existing) {
    return { householdId: existing.household_id, created: false };
  }

  // 2. First-user bootstrap: zero members anywhere AND a Default Household exists → claim it.
  const memberCount = await deps.countAllMembers();
  if (memberCount === 0) {
    const def = await deps.findHouseholdByName(DEFAULT_HOUSEHOLD_NAME);
    if (def) {
      await deps.insertMember({ householdId: def.id, userId: user.userId, role: 'owner' });
      return { householdId: def.id, created: false };
    }
  }

  // 3. Otherwise create a fresh household named after the email local-part.
  const localPart = user.email.split('@')[0] || 'household';
  const fresh = await deps.createHousehold({ name: localPart });
  await deps.insertMember({ householdId: fresh.id, userId: user.userId, role: 'owner' });
  return { householdId: fresh.id, created: true };
}
```

Run the test — expect 4/4 PASS. Run `npm test` — expect ~194 passing.

- [ ] **Step 3: Implement /api/me**

```typescript
// app/api/me/route.ts
import { requireAuth, buildProductionAuthDeps, authErrorResponse } from '../../../src/api/auth';
import { onboardUser, type OnboardDeps } from '../../../src/auth/onboard';
import { getSupabase } from '../../../src/db/client';

export const runtime = 'nodejs';

let cachedAuthDeps: Awaited<ReturnType<typeof buildProductionAuthDeps>> | null = null;
async function getAuthDeps() {
  if (!cachedAuthDeps) cachedAuthDeps = await buildProductionAuthDeps();
  return cachedAuthDeps;
}

function buildOnboardDeps(): OnboardDeps {
  const supa = getSupabase();
  return {
    findMembershipByUser: async (userId) => {
      const { data } = await supa
        .from('household_members')
        .select('household_id')
        .eq('user_id', userId)
        .maybeSingle();
      return data ? { household_id: data.household_id as string } : null;
    },
    countAllMembers: async () => {
      const { count } = await supa.from('household_members').select('*', { count: 'exact', head: true });
      return count ?? 0;
    },
    findHouseholdByName: async (name) => {
      const { data } = await supa.from('households').select('id, name').eq('name', name).maybeSingle();
      return data ? { id: data.id as string, name: data.name as string } : null;
    },
    createHousehold: async ({ name }) => {
      const { data, error } = await supa
        .from('households')
        .insert({ name, settings: {} })
        .select('id, name')
        .single();
      if (error || !data) throw new Error(`createHousehold: ${error?.message ?? 'no row'}`);
      return { id: data.id as string, name: data.name as string };
    },
    insertMember: async ({ householdId, userId, role }) => {
      const { error } = await supa
        .from('household_members')
        .insert({ household_id: householdId, user_id: userId, role });
      if (error) throw new Error(`insertMember: ${error.message}`);
    },
  };
}

export async function GET(req: Request) {
  const auth = await requireAuth(req, await getAuthDeps());
  if (!auth.ok) return authErrorResponse(auth);

  const result = await onboardUser({ userId: auth.userId, email: auth.email ?? '' }, buildOnboardDeps());
  return Response.json({
    userId: auth.userId,
    email: auth.email,
    householdId: result.householdId,
    onboarded: result.created,
    note: result.created
      ? 'New household created. Sign in again to refresh your JWT with the household_id claim.'
      : auth.householdId
        ? undefined
        : 'JWT does not yet carry household_id; sign in again to refresh.',
  });
}
```

Verify + commit:
```bash
npm exec tsc --noEmit
npm test
npm run build
git add src/auth/onboard.ts src/__tests__/auth-onboard.test.ts app/api/me/route.ts
git commit -m "feat(phase-2-w8): onboardUser logic + GET /api/me (TDD, 4 tests)"
```

---

## Task 7 — CLI: `signin` + `signin-verify`

Wire two new CLI commands. The signin command POSTs to `/api/auth/start` of a configured base URL (env `FOODIE_BASE_URL`, defaults to `http://localhost:3000` for local dev). The signin-verify command POSTs to `/api/auth/verify`, saves the returned token to `~/.foodie/auth-token.json`.

- [ ] **Step 1: Add scripts to package.json**

```json
"signin": "tsx src/index.ts signin",
"signin-verify": "tsx src/index.ts signin-verify"
```

- [ ] **Step 2: Add config**

In `src/config.ts` extend the `app` block:
```typescript
  app: {
    recipientEmail: process.env.FOODIE_RECIPIENT_EMAIL || "",
    cronSecret: process.env.CRON_SECRET || "",
    alertEmail: process.env.FOODIE_ALERT_EMAIL || process.env.FOODIE_RECIPIENT_EMAIL || "",
    baseUrl: process.env.FOODIE_BASE_URL || "http://localhost:3000",
  },
```

In `.env.example`, add:
```
# Phase 2 W8 — base URL for CLI signin commands (defaults to localhost:3000)
FOODIE_BASE_URL=
```

- [ ] **Step 3: Add CLI handlers in `src/index.ts`**

Imports (after existing W5/W6/W7 imports):
```typescript
import { saveAuthToken, loadAuthToken, maskToken } from './auth/token';
```

Switch cases (after `case "audit-reply":`):
```typescript
    case "signin":
      await handleSignin(args);
      break;
    case "signin-verify":
      await handleSigninVerify(args);
      break;
    case "whoami":
      await handleWhoami(args);
      break;
```

Handlers (at bottom of file with other W5/W6 handlers):
```typescript
async function handleSignin(args: string[]) {
  const email = parseFlagStr(args, '--email', '');
  if (!email) {
    console.error('Usage: signin --email "you@example.com"');
    process.exit(1);
  }
  const url = `${config.app.baseUrl}/api/auth/start`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!r.ok) {
    console.error(`[signin] ${r.status}: ${await r.text()}`);
    process.exit(1);
  }
  const j = await r.json();
  console.log(`[signin] ${j.message}`);
  console.log('Run: npm run signin-verify -- --email "' + email + '" --otp <6-digit-code>');
}

async function handleSigninVerify(args: string[]) {
  const email = parseFlagStr(args, '--email', '');
  const otp = parseFlagStr(args, '--otp', '');
  if (!email || !otp) {
    console.error('Usage: signin-verify --email "you@example.com" --otp 123456');
    process.exit(1);
  }
  const url = `${config.app.baseUrl}/api/auth/verify`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  });
  if (!r.ok) {
    console.error(`[signin-verify] ${r.status}: ${await r.text()}`);
    process.exit(1);
  }
  const j = await r.json();
  const t = saveAuthToken({
    accessToken: j.accessToken,
    refreshToken: j.refreshToken,
    expiresAt: j.expiresAt,
    email: j.email,
  });
  console.log(`[signin-verify] saved token ${maskToken(t.accessToken)} for ${t.email}`);
  console.log(`Try: curl -H "Authorization: Bearer $(jq -r .accessToken ~/.foodie/auth-token.json)" ${config.app.baseUrl}/api/me`);
}

async function handleWhoami(_args: string[]) {
  const t = loadAuthToken();
  if (!t) {
    console.error('No auth token. Run signin + signin-verify first.');
    process.exit(1);
  }
  const r = await fetch(`${config.app.baseUrl}/api/me`, {
    headers: { authorization: `Bearer ${t.accessToken}` },
  });
  console.log(JSON.stringify(await r.json(), null, 2));
}
```

Update `printHelp()` AI Features section:
```
  signin --email "you@example.com"       Send sign-in OTP to your email
  signin-verify --email --otp 123456     Exchange OTP for a session token (saved at ~/.foodie/auth-token.json)
  whoami                                 Show current authed user + household
```

- [ ] **Step 4: Verify + commit**

```bash
npm exec tsc --noEmit
npm test
git add package.json src/config.ts .env.example src/index.ts
git commit -m "feat(phase-2-w8): CLI signin + signin-verify + whoami"
```

---

## Task 8 — Final verify + tag

```bash
npm exec tsc --noEmit
npm test
npm run build
```

Expected: ~195 passing; 7 routes (`/api/health`, `/api/cron/sync`, `/api/cron/plan-week`, `/api/cron/audit-month`, `/api/auth/start`, `/api/auth/verify`, `/api/me`).

Controller dispatches the final review subagent and then summary commits + tag + merge + push.

### Manual rollout steps (operator)

1. Apply `supabase/migrations/006_auth.sql` to your Supabase project (`supabase db push` or paste in SQL editor).
2. In Supabase Dashboard → Authentication → Hooks → "Custom Access Token Hook" → enable, select `public.foodie_jwt_hook`.
3. Deploy the new routes (`vercel deploy`).
4. From local: `npm run signin -- --email tomhoel96@gmail.com` → 6-digit OTP arrives in your inbox.
5. `npm run signin-verify -- --email tomhoel96@gmail.com --otp <code>` → token saved.
6. `npm run whoami` → JSON with `userId`, `householdId`, `email`. The first time, you'll see `note: "Sign in again to refresh your JWT with the household_id claim."` because the JWT was issued before the membership row existed. Run `signin` + `signin-verify` again — the new JWT has the claim.

---

## Self-review checklist

- Spec coverage: §10 Auth & multi-tenancy → Tasks 1-7. §6.3 RLS pattern → explicitly deferred to W9.
- Test isolation: `requireAuth` and `onboardUser` are pure-with-deps; tested without Supabase or Next.js.
- Production paths: lazy-init Supabase client in `/api/auth/start`, `/api/auth/verify`, `/api/me` (cached singleton via `getAuthDeps()` in /api/me) so cold starts pay the SDK import once, hot calls reuse.
- Onboarding semantics: spec'd in 4 test cases — existing membership / first-user-with-Default / first-user-without-Default / subsequent-user. Each branch has a test.
- Idempotency: re-running `signin-verify` with a valid OTP returns a fresh JWT. Re-hitting `/api/me` with an already-onboarded user is a no-op.
- ToS / posture: Supabase Auth's OTP flow is the documented headless path. No new external surfaces beyond what Supabase exposes.
