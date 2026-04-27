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
