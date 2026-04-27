-- Product lifecycle management for automated daily sync
-- Adds discontinued tracking, price change timestamps, and richer sync stats

-- 1. Add lifecycle columns to products
alter table products add column if not exists is_discontinued boolean not null default false;
alter table products add column if not exists price_changed_at timestamptz;

-- 2. Partial index for the hot query path (active, in-stock products)
create index if not exists idx_products_active
  on products(source)
  where is_discontinued = false and in_stock = true;

-- 3. Add richer stats columns to sync_log
alter table sync_log add column if not exists products_added int default 0;
alter table sync_log add column if not exists products_updated int default 0;
alter table sync_log add column if not exists products_removed int default 0;
alter table sync_log add column if not exists price_changes int default 0;

-- 4. Update match_products to exclude discontinued products
create or replace function match_products(
  query_embedding vector(3072),
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
    and p.is_discontinued = false
    and (source_filter is null or p.source = source_filter)
    and 1 - (pe.embedding <=> query_embedding) > match_threshold
  order by pe.embedding <=> query_embedding
  limit match_count;
end;
$$;
