-- Recipe Cache — avoid redundant Gemini calls for the same dish
-- Stores the full CartData response keyed by normalized dish name

create table recipe_cache (
  id uuid primary key default gen_random_uuid(),

  -- Cache key: normalized lowercase dish name (e.g. "pad thai")
  cache_key text not null unique,
  dish_name text not null,

  -- Cached response payload
  recipe jsonb not null,
  items jsonb not null default '[]'::jsonb,
  staples jsonb not null default '[]'::jsonb,
  unmatched jsonb not null default '[]'::jsonb,
  summary jsonb,

  -- Recipe was generated at this serving size (scaling is client-side)
  base_servings int not null default 4,

  -- Track when the product data used for matching was last synced
  products_snapshot_at timestamptz not null default now(),

  -- Usage stats
  access_count int not null default 1,

  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now()
);

create index idx_recipe_cache_key on recipe_cache(cache_key);
create index idx_recipe_cache_accessed on recipe_cache(last_accessed_at desc);

-- Reuse the existing updated_at trigger function
create trigger recipe_cache_updated_at
  before update on recipe_cache
  for each row execute function update_updated_at();
