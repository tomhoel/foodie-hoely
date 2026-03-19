-- Fix vector dimensions: gemini-embedding-001 outputs 3072 dimensions (not 768)

-- Drop old indexes first
drop index if exists idx_product_embeddings_hnsw;
drop index if exists idx_ingredient_embeddings_hnsw;

-- Drop old functions that reference vector(768)
drop function if exists match_products;
drop function if exists match_ingredients;

-- Alter columns
alter table product_embeddings alter column embedding type vector(3072);
alter table ingredient_embeddings alter column embedding type vector(3072);

-- Recreate HNSW indexes
create index idx_product_embeddings_hnsw on product_embeddings
  using hnsw (embedding vector_cosine_ops);

create index idx_ingredient_embeddings_hnsw on ingredient_embeddings
  using hnsw (embedding vector_cosine_ops);

-- Recreate functions with correct dimensions
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
    and (source_filter is null or p.source = source_filter)
    and 1 - (pe.embedding <=> query_embedding) > match_threshold
  order by pe.embedding <=> query_embedding
  limit match_count;
end;
$$;

create or replace function match_ingredients(
  query_embedding vector(3072),
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
