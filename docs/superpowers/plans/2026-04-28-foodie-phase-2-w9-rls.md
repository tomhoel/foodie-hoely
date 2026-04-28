# Foodie Phase 2 Week 9 — RLS hardening (multi-tenant isolation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Replace the permissive Phase-0/1 RLS policies (`<table>_phase0_permissive` allow-all) with proper member-scoped policies on every per-household table. After W9, an authenticated user holding the anon key + their JWT can only read/write rows belonging to households they're a member of. Service role keeps bypassing RLS, so all existing CLI + cron + API code is unaffected.

**Architecture:**
- **Migration 007** drops every `<table>_phase0_permissive` policy and creates two new ones per table: `<table>_member_read` (SELECT) and `<table>_member_write` (ALL using + with check). Both predicate on `household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())`.
- **Three flavors** of policy:
  1. **Direct `household_id`** column (most tables) — straightforward predicate.
  2. **Indirect `household_id`** (recipe_ingredients → recipes, meal_plan_items → meal_plans, shopping_list_items → shopping_lists, transaction_lines → transactions, budget_categories → budgets) — predicate traverses the FK with a sub-SELECT.
  3. **Special** — `households` (row's `id` == household_id), `household_members` (predicate on `user_id = auth.uid()` directly + members can see siblings), `recipes` (`household_id IS NULL` for shared recipes is readable by any authenticated user).
- **`trumf_credentials`** stays service-role-only; no user policy at all.
- **`getSupabaseForUser(jwt)` helper** — future authenticated-DB-from-client path. Not used yet by W9; added for API endpoints that want to defer to RLS rather than enforce in code.
- **Service role unaffected**: the AFood/MENY/Kiwi syncs, planner, cron jobs, and `/api/me` onboarding write all go through `getSupabase()` which uses `SUPABASE_SERVICE_KEY` and bypasses RLS by definition.
- **Manual rollback** documented: re-create the permissive policies if anything breaks.

**Tech Stack:** SQL only. No new code paths needed — service role keeps working.

**Spec reference:** §6.3 RLS pattern; §10 Auth & multi-tenancy

**Predecessor:** phase-2-w8-complete

---

## Tasks

| # | Task | Model | DB needed |
|---|---|---|---|
| 1 | Migration 007 — RLS hardening on all per-household tables | sonnet | yes (apply manually) |
| 2 | `getSupabaseForUser(jwt)` helper for future authenticated-DB calls | haiku | no |
| 3 | Final verify + tag + merge + push | sonnet | no |

---

## Files created
- supabase/migrations/007_rls.sql
- src/db/client-user.ts

## Files modified
- (none structurally; verify the existing CLI + cron + API still pass `npm test` and `npm run build`)

## End-state verification
1. `npm test` → still 194/194 (no test changes; SQL only)
2. `npm exec tsc --noEmit` → clean
3. `npm run build` → still 7 routes
4. **Manual on a deployed Supabase**:
   - Apply migration 007.
   - Sign in as `tomhoel96@gmail.com` → get JWT_A (linked to household_A via Phase-1 default).
   - Create a fresh test user via Supabase Dashboard → sign in → JWT_B (linked to household_B auto-created on first /api/me).
   - With JWT_B: `curl -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $JWT_B" $SUPABASE_URL/rest/v1/recipes?select=*` → returns only recipes from household_B (or shared). NO recipes from household_A.
   - With JWT_B: same query for `pantry_items`, `meal_plans`, `transactions` → empty (or only their own).
   - `/api/me` with JWT_A still returns household_A and onboarding works (service role bypasses).
5. `git tag phase-2-w9-complete`

## Rollback
```bash
git checkout main
git reset --hard phase-2-w8-complete
git tag -d phase-2-w9-complete

# In Supabase: rerun the relevant block from migration 005 to recreate
# the *_phase0_permissive policies (drop the new policies first).
```

## Deferred
- Per-row policy fuzzing tests — Phase 3 (would require a sandboxed Supabase test environment)
- `partially_replied` audit status flow — when audit reply parser supports partial replies
- Friend invitation flow — W10
- Trumf broker on Sandbox — W10

---

## Task 1 — Migration 007

**File:** `supabase/migrations/007_rls.sql`

Full migration body provided in Task 1 implementation step.

## Task 2 — `getSupabaseForUser(jwt)` helper

A small factory that takes a user JWT and returns a Supabase client authenticated as that user. Future endpoints that want to query via RLS rather than service role use this. W9 doesn't switch any existing endpoint over — that's a follow-up choice.

## Task 3 — Final verify + tag

Same pattern as previous milestones.
