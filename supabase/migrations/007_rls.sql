-- Phase 2 W9 — RLS hardening
--
-- Replaces the *_phase0_permissive policies (all rows visible to authenticated
-- users) with member-scoped policies that only expose rows belonging to
-- households the auth.uid() is a member of.
--
-- Service role bypasses RLS by definition, so all CLI + cron + API code
-- continues to work unchanged. This migration is purely defense-in-depth: if
-- a future client uses the anon key + a user JWT to query Supabase directly,
-- they only see their household's data.
--
-- After this migration:
--   - Authenticated user with JWT can SELECT/INSERT/UPDATE/DELETE rows where
--     household_id ∈ their household_members.household_id list.
--   - Recipes with household_id IS NULL are readable by any authenticated user
--     (shared recipe library) but writable by no user (service role only).
--   - household_members read policy lets a member see siblings in the same
--     household; writes are service-role-only (invitation flow lands in W10).
--   - trumf_credentials remains service-role-only (no user policy).
--
-- Idempotent: every CREATE POLICY is preceded by DROP POLICY IF EXISTS.

-- ─── Helper: drop the W5-era permissive policies ────────────────────────────

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
    execute format('drop policy if exists %I on %I', t || '_phase0_permissive', t);
  end loop;
end $$;

-- ─── households (row's id IS the household_id) ──────────────────────────────

drop policy if exists households_member_read on households;
create policy households_member_read on households
  for select using (
    id in (select household_id from household_members where user_id = auth.uid())
  );

drop policy if exists households_member_write on households;
create policy households_member_write on households
  for all using (
    id in (select household_id from household_members where user_id = auth.uid())
  ) with check (
    id in (select household_id from household_members where user_id = auth.uid())
  );

-- ─── household_members (read siblings; writes service-role-only) ────────────

drop policy if exists household_members_member_read on household_members;
create policy household_members_member_read on household_members
  for select using (
    user_id = auth.uid()
    OR household_id in (select household_id from household_members where user_id = auth.uid())
  );

-- No write policy — invitation/role-change flow goes through service role
-- (Phase 2 W10 introduces the user-facing path).

-- ─── Direct household_id columns ────────────────────────────────────────────
-- pantry_items, pantry_corrections, meal_plans, transactions, budgets,
-- dish_photos, cooking_signatures, audits, ai_usage

do $$
declare
  t text;
  direct_household_tables text[] := array[
    'pantry_items','pantry_corrections',
    'meal_plans','transactions',
    'budgets','dish_photos','cooking_signatures','audits','ai_usage'
  ];
begin
  foreach t in array direct_household_tables loop
    execute format('drop policy if exists %I on %I', t || '_member_read', t);
    execute format(
      'create policy %I on %I for select using (household_id in (select household_id from household_members where user_id = auth.uid()))',
      t || '_member_read', t
    );
    execute format('drop policy if exists %I on %I', t || '_member_write', t);
    execute format(
      'create policy %I on %I for all using (household_id in (select household_id from household_members where user_id = auth.uid())) with check (household_id in (select household_id from household_members where user_id = auth.uid()))',
      t || '_member_write', t
    );
  end loop;
end $$;

-- ─── recipes (nullable household_id; shared recipes readable by all auth users) ─

drop policy if exists recipes_member_read on recipes;
create policy recipes_member_read on recipes
  for select using (
    household_id is null
    OR household_id in (select household_id from household_members where user_id = auth.uid())
  );

drop policy if exists recipes_member_write on recipes;
create policy recipes_member_write on recipes
  for all using (
    household_id in (select household_id from household_members where user_id = auth.uid())
  ) with check (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );

-- ─── Indirect tables (FK to a parent that has household_id) ─────────────────

-- recipe_ingredients → recipes
drop policy if exists recipe_ingredients_member_read on recipe_ingredients;
create policy recipe_ingredients_member_read on recipe_ingredients
  for select using (
    recipe_id in (
      select id from recipes
      where household_id is null
        OR household_id in (select household_id from household_members where user_id = auth.uid())
    )
  );

drop policy if exists recipe_ingredients_member_write on recipe_ingredients;
create policy recipe_ingredients_member_write on recipe_ingredients
  for all using (
    recipe_id in (
      select id from recipes
      where household_id in (select household_id from household_members where user_id = auth.uid())
    )
  ) with check (
    recipe_id in (
      select id from recipes
      where household_id in (select household_id from household_members where user_id = auth.uid())
    )
  );

-- recipe_embeddings → recipes
drop policy if exists recipe_embeddings_member_read on recipe_embeddings;
create policy recipe_embeddings_member_read on recipe_embeddings
  for select using (
    recipe_id in (
      select id from recipes
      where household_id is null
        OR household_id in (select household_id from household_members where user_id = auth.uid())
    )
  );

drop policy if exists recipe_embeddings_member_write on recipe_embeddings;
create policy recipe_embeddings_member_write on recipe_embeddings
  for all using (
    recipe_id in (
      select id from recipes
      where household_id in (select household_id from household_members where user_id = auth.uid())
    )
  ) with check (
    recipe_id in (
      select id from recipes
      where household_id in (select household_id from household_members where user_id = auth.uid())
    )
  );

-- meal_plan_items → meal_plans
drop policy if exists meal_plan_items_member_read on meal_plan_items;
create policy meal_plan_items_member_read on meal_plan_items
  for select using (
    meal_plan_id in (
      select id from meal_plans
      where household_id in (select household_id from household_members where user_id = auth.uid())
    )
  );

drop policy if exists meal_plan_items_member_write on meal_plan_items;
create policy meal_plan_items_member_write on meal_plan_items
  for all using (
    meal_plan_id in (
      select id from meal_plans
      where household_id in (select household_id from household_members where user_id = auth.uid())
    )
  ) with check (
    meal_plan_id in (
      select id from meal_plans
      where household_id in (select household_id from household_members where user_id = auth.uid())
    )
  );

-- shopping_lists → meal_plans
drop policy if exists shopping_lists_member_read on shopping_lists;
create policy shopping_lists_member_read on shopping_lists
  for select using (
    meal_plan_id in (
      select id from meal_plans
      where household_id in (select household_id from household_members where user_id = auth.uid())
    )
  );

drop policy if exists shopping_lists_member_write on shopping_lists;
create policy shopping_lists_member_write on shopping_lists
  for all using (
    meal_plan_id in (
      select id from meal_plans
      where household_id in (select household_id from household_members where user_id = auth.uid())
    )
  ) with check (
    meal_plan_id in (
      select id from meal_plans
      where household_id in (select household_id from household_members where user_id = auth.uid())
    )
  );

-- shopping_list_items → shopping_lists → meal_plans
drop policy if exists shopping_list_items_member_read on shopping_list_items;
create policy shopping_list_items_member_read on shopping_list_items
  for select using (
    shopping_list_id in (
      select sl.id from shopping_lists sl
      join meal_plans mp on mp.id = sl.meal_plan_id
      where mp.household_id in (select household_id from household_members where user_id = auth.uid())
    )
  );

drop policy if exists shopping_list_items_member_write on shopping_list_items;
create policy shopping_list_items_member_write on shopping_list_items
  for all using (
    shopping_list_id in (
      select sl.id from shopping_lists sl
      join meal_plans mp on mp.id = sl.meal_plan_id
      where mp.household_id in (select household_id from household_members where user_id = auth.uid())
    )
  ) with check (
    shopping_list_id in (
      select sl.id from shopping_lists sl
      join meal_plans mp on mp.id = sl.meal_plan_id
      where mp.household_id in (select household_id from household_members where user_id = auth.uid())
    )
  );

-- transaction_lines → transactions
drop policy if exists transaction_lines_member_read on transaction_lines;
create policy transaction_lines_member_read on transaction_lines
  for select using (
    transaction_id in (
      select id from transactions
      where household_id in (select household_id from household_members where user_id = auth.uid())
    )
  );

drop policy if exists transaction_lines_member_write on transaction_lines;
create policy transaction_lines_member_write on transaction_lines
  for all using (
    transaction_id in (
      select id from transactions
      where household_id in (select household_id from household_members where user_id = auth.uid())
    )
  ) with check (
    transaction_id in (
      select id from transactions
      where household_id in (select household_id from household_members where user_id = auth.uid())
    )
  );

-- budget_categories → budgets
drop policy if exists budget_categories_member_read on budget_categories;
create policy budget_categories_member_read on budget_categories
  for select using (
    budget_id in (
      select id from budgets
      where household_id in (select household_id from household_members where user_id = auth.uid())
    )
  );

drop policy if exists budget_categories_member_write on budget_categories;
create policy budget_categories_member_write on budget_categories
  for all using (
    budget_id in (
      select id from budgets
      where household_id in (select household_id from household_members where user_id = auth.uid())
    )
  ) with check (
    budget_id in (
      select id from budgets
      where household_id in (select household_id from household_members where user_id = auth.uid())
    )
  );

-- budget_envelopes → budgets
drop policy if exists budget_envelopes_member_read on budget_envelopes;
create policy budget_envelopes_member_read on budget_envelopes
  for select using (
    budget_id in (
      select id from budgets
      where household_id in (select household_id from household_members where user_id = auth.uid())
    )
  );

drop policy if exists budget_envelopes_member_write on budget_envelopes;
create policy budget_envelopes_member_write on budget_envelopes
  for all using (
    budget_id in (
      select id from budgets
      where household_id in (select household_id from household_members where user_id = auth.uid())
    )
  ) with check (
    budget_id in (
      select id from budgets
      where household_id in (select household_id from household_members where user_id = auth.uid())
    )
  );

-- ─── trumf_credentials — no user policy. RLS already enabled in migration 005;
--    without any policy, only service role can access. Intentional.
