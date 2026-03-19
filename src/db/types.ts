// Database types matching the Supabase schema

export interface Product {
  id: string;
  source: "afood" | "meny";
  external_id: string;
  name: string;
  slug: string | null;
  brand: string | null;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  size: string | null;
  unit: string | null;
  weight_kg: number | null;
  price: number | null;
  compare_price: number | null;
  compare_unit: string | null;
  currency: string;
  image_url: string | null;
  product_url: string | null;
  ean: string | null;
  sku: string | null;
  in_stock: boolean;
  is_offer: boolean;
  vendor: string | null;
  raw_data: Record<string, unknown> | null;
  ai_description: string | null;
  ai_description_en: string | null;
  ai_tags: string[];
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface ProductInsert {
  source: "afood" | "meny";
  external_id: string;
  name: string;
  slug?: string | null;
  brand?: string | null;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  size?: string | null;
  unit?: string | null;
  weight_kg?: number | null;
  price?: number | null;
  compare_price?: number | null;
  compare_unit?: string | null;
  image_url?: string | null;
  product_url?: string | null;
  ean?: string | null;
  sku?: string | null;
  in_stock?: boolean;
  is_offer?: boolean;
  vendor?: string | null;
  raw_data?: Record<string, unknown>;
}

export interface ProductEmbedding {
  id: string;
  product_id: string;
  embedding: number[];
  embedding_text: string;
  model_version: string;
  created_at: string;
}

export interface PriceHistory {
  id: string;
  product_id: string;
  price: number;
  was_offer: boolean;
  recorded_at: string;
}

export interface IngredientMapping {
  id: string;
  canonical_name: string;
  aliases: string[];
  search_terms_no: string[];
  search_terms_en: string[];
  search_terms_th: string[];
  category: string | null;
  cuisine_tags: string[];
  importance: "critical" | "enhancing" | "garnish" | "optional";
  preferred_products: PreferredProduct[];
  substitutes: Substitute[];
  notes: string | null;
  availability: "afood_only" | "meny_only" | "both" | "neither" | "unknown";
  created_at: string;
  updated_at: string;
}

export interface PreferredProduct {
  source: "afood" | "meny";
  product_id: string;
  name: string;
  confidence: number;
  size?: string | null;
  price?: number | null;
}

// Structured ingredient for quantity-aware matching
export interface StructuredIngredient {
  name: string;
  amount?: string;
  unit?: string;
  category?: string;
}

export interface Substitute {
  name: string;
  ratio: string;
  quality: "excellent" | "good" | "acceptable" | "poor";
  notes?: string;
}

export interface SyncLog {
  id: string;
  source: string;
  sync_type: string;
  status: "started" | "completed" | "failed";
  products_synced: number;
  products_enriched: number;
  embeddings_generated: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

// Semantic search result
export interface ProductMatch {
  product_id: string;
  name: string;
  brand: string | null;
  price: number | null;
  source: "afood" | "meny";
  image_url: string | null;
  product_url: string | null;
  ai_description: string | null;
  similarity: number;
}

export interface IngredientMatch {
  ingredient_id: string;
  canonical_name: string;
  aliases: string[];
  importance: string;
  preferred_products: PreferredProduct[];
  substitutes: Substitute[];
  similarity: number;
}

// Three-tier matching result
export interface MatchResult {
  ingredient: string;
  tier: 1 | 2 | 3;
  tier_label: "direct_mapping" | "semantic_search" | "substitution";
  product: ProductMatch | null;
  substitute: Substitute | null;
  confidence: number;
  notes: string | null;
}
