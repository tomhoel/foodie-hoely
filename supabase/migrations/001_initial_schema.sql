-- Foodie Product Database Schema
-- Run this in your Supabase SQL editor

-- Enable pgvector for semantic search
create extension if not exists vector;

-- ─── PRODUCTS ────────────────────────────────────────────────────────────────
-- Unified product table for both aFood and Meny

create table products (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('afood', 'meny')),
  external_id text not null,
  name text not null,
  slug text,
  brand text,
  description text,            -- original description from source (if any)
  category text,
  subcategory text,
  size text,                   -- e.g. "400ml", "1kg"
  unit text,                   -- e.g. "ml", "kg", "stk"
  weight_kg float,
  price float,
  compare_price float,
  compare_unit text,
  currency text default 'NOK',
  image_url text,
  product_url text,
  ean text,
  sku text,
  in_stock boolean default true,
  is_offer boolean default false,
  vendor text,
  raw_data jsonb,              -- full original API response for reference

  -- AI-enriched fields (populated by Flash Lite)
  ai_description text,         -- rich description for AI matching
  ai_description_en text,      -- English version
  ai_tags text[] default '{}', -- searchable tags: ["coconut","milk","uht","thai"]

  last_synced_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(source, external_id)
);

create index idx_products_source on products(source);
create index idx_products_name on products using gin(to_tsvector('simple', name));
create index idx_products_in_stock on products(in_stock) where in_stock = true;
create index idx_products_ai_tags on products using gin(ai_tags);

-- ─── PRODUCT EMBEDDINGS ─────────────────────────────────────────────────────
-- Vector embeddings for semantic product search

create table product_embeddings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  embedding vector(768),       -- text-embedding-004 outputs 768 dimensions
  embedding_text text,         -- the text that was embedded (for debugging)
  model_version text default 'text-embedding-004',
  created_at timestamptz default now(),

  unique(product_id)
);

-- IVFFlat index for fast similarity search (create after inserting data)
-- Run this AFTER initial data load:
-- create index idx_product_embeddings_vector on product_embeddings
--   using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Use HNSW for now (works without pre-loaded data)
create index idx_product_embeddings_hnsw on product_embeddings
  using hnsw (embedding vector_cosine_ops);

-- ─── PRICE HISTORY ──────────────────────────────────────────────────────────
-- Track price changes over time

create table price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  price float not null,
  was_offer boolean default false,
  recorded_at timestamptz default now()
);

create index idx_price_history_product on price_history(product_id, recorded_at desc);

-- ─── INGREDIENT MAPPINGS ────────────────────────────────────────────────────
-- AI knowledge layer for Thai/Asian ingredient matching

create table ingredient_mappings (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null unique,       -- "fish sauce"
  aliases text[] default '{}',               -- ["nam pla","fiskesaus","น้ำปลา"]
  search_terms_no text[] default '{}',       -- Norwegian search terms
  search_terms_en text[] default '{}',       -- English search terms
  search_terms_th text[] default '{}',       -- Thai search terms
  category text,                             -- "condiment/sauce"
  cuisine_tags text[] default '{}',          -- ["thai","vietnamese","asian"]
  importance text default 'critical'
    check (importance in ('critical', 'enhancing', 'garnish', 'optional')),

  -- Direct product links (validated matches)
  preferred_products jsonb default '[]',
  -- e.g. [{"source":"afood","product_id":"uuid","name":"...","confidence":0.95}]

  -- What to use when unavailable
  substitutes jsonb default '[]',
  -- e.g. [{"name":"soy sauce + salt","ratio":"1:1","quality":"acceptable","notes":"..."}]

  notes text,                                -- brand tips, usage notes
  availability text default 'unknown'
    check (availability in ('afood_only', 'meny_only', 'both', 'neither', 'unknown')),

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_ingredient_canonical on ingredient_mappings(canonical_name);
create index idx_ingredient_aliases on ingredient_mappings using gin(aliases);
create index idx_ingredient_cuisine on ingredient_mappings using gin(cuisine_tags);

-- ─── INGREDIENT EMBEDDINGS ──────────────────────────────────────────────────
-- Vector embeddings for semantic ingredient matching

create table ingredient_embeddings (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references ingredient_mappings(id) on delete cascade,
  embedding vector(768),
  embedding_text text,
  created_at timestamptz default now(),

  unique(ingredient_id)
);

create index idx_ingredient_embeddings_hnsw on ingredient_embeddings
  using hnsw (embedding vector_cosine_ops);

-- ─── SYNC LOG ───────────────────────────────────────────────────────────────
-- Track sync operations for monitoring

create table sync_log (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  sync_type text not null,       -- "full", "incremental", "enrichment", "embeddings"
  status text not null check (status in ('started', 'completed', 'failed')),
  products_synced int default 0,
  products_enriched int default 0,
  embeddings_generated int default 0,
  error_message text,
  started_at timestamptz default now(),
  completed_at timestamptz
);

-- ─── HELPER FUNCTIONS ───────────────────────────────────────────────────────

-- Semantic product search function
create or replace function match_products(
  query_embedding vector(768),
  match_threshold float default 0.5,
  match_count int default 10,
  source_filter text default null
)
returns table (
  product_id uuid,
  name text,
  brand text,
  price float,
  source text,
  image_url text,
  product_url text,
  ai_description text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    p.id as product_id,
    p.name,
    p.brand,
    p.price,
    p.source,
    p.image_url,
    p.product_url,
    p.ai_description,
    1 - (pe.embedding <=> query_embedding) as similarity
  from product_embeddings pe
  join products p on p.id = pe.product_id
  where
    p.in_stock = true
    and (source_filter is null or p.source = source_filter)
    and 1 - (pe.embedding <=> query_embedding) > match_threshold
  order by pe.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Semantic ingredient search function
create or replace function match_ingredients(
  query_embedding vector(768),
  match_threshold float default 0.4,
  match_count int default 5
)
returns table (
  ingredient_id uuid,
  canonical_name text,
  aliases text[],
  importance text,
  preferred_products jsonb,
  substitutes jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    im.id as ingredient_id,
    im.canonical_name,
    im.aliases,
    im.importance,
    im.preferred_products,
    im.substitutes,
    1 - (ie.embedding <=> query_embedding) as similarity
  from ingredient_embeddings ie
  join ingredient_mappings im on im.id = ie.ingredient_id
  where 1 - (ie.embedding <=> query_embedding) > match_threshold
  order by ie.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger products_updated_at before update on products
  for each row execute function update_updated_at();

create trigger ingredient_mappings_updated_at before update on ingredient_mappings
  for each row execute function update_updated_at();
