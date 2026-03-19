/**
 * Meny (NorgesGruppen) → Supabase sync pipeline
 *
 * Fetches products by searching across common ingredient categories,
 * then upserts into the unified products table.
 */

import { config } from "../config";
import { getSupabase, startSyncLog, completeSyncLog, failSyncLog } from "../db/client";
import type { ProductInsert } from "../db/types";

const HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  "fwc-chain-id": config.meny.chainId,
  "Content-Type": "application/json",
  "Origin": "https://meny.no",
  "Referer": "https://meny.no/",
};

const IMAGE_BASE = "https://bilder.ngdata.no";

// Broad search terms to discover the product catalog
// Covers major grocery categories relevant to Asian/Thai cooking + everyday items
const DISCOVERY_TERMS = [
  // Proteins
  "kylling", "svin", "storfe", "lam", "fisk", "reke", "tofu", "egg",
  // Vegetables
  "løk", "hvitløk", "ingefær", "chili", "paprika", "brokkoli", "gulrot",
  "sopp", "spinat", "mais", "bønner", "erter", "agurk", "tomat", "salat",
  // Asian specific
  "kokosmelk", "kokosmjølk", "soyasaus", "fiskesaus", "østerssaus",
  "risnudler", "nudler", "ris", "jasminris", "basmati",
  "curry", "sambal", "sriracha", "wasabi", "miso",
  "wok", "teriyaki", "hoisin", "sesamolje",
  "vårruller", "dumpling", "gyoza",
  "lime", "sitrongress", "koriander", "basilikum", "mynte",
  // Dairy & staples
  "melk", "fløte", "smør", "ost", "yoghurt",
  "mel", "sukker", "salt", "pepper", "olje", "eddik",
  // Canned & preserved
  "hermetikk", "boks", "tørket", "frosne",
  // Sauces & condiments
  "saus", "ketchup", "majones", "sennep", "dressing",
  // Noodles & pasta
  "pasta", "spaghetti", "penne",
];

// ─── API helpers ─────────────────────────────────────────────────────────────

async function searchProducts(query: string, pageSize: number = 50): Promise<any> {
  const params = new URLSearchParams({
    search: query,
    page_size: String(pageSize),
    store_id: config.meny.storeId,
    full_response: "true",
  });
  const url = `${config.meny.apiBase}/api/episearch/${config.meny.chainId}/products?${params}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

function parseProduct(hit: any): ProductInsert & { _ean: string } {
  const source = hit.contentData?._source || {};
  const ean = source.ean || "";

  return {
    _ean: ean,
    source: "meny",
    external_id: ean,
    name: source.title || "",
    slug: source.slugifiedUrl || null,
    brand: source.brand || null,
    description: source.subtitle || null,
    category: source.categoryName || null,
    subcategory: source.shoppingListGroupName || null,
    size: extractSize(source.title, source.subtitle),
    unit: source.unit || null,
    weight_kg: source.weight || null,
    price: source.pricePerUnit ?? null,
    compare_price: source.comparePricePerUnit ?? null,
    compare_unit: source.compareUnit || null,
    image_url: ean ? `${IMAGE_BASE}/${ean}/meny/large.jpg` : null,
    product_url: source.slugifiedUrl ? `https://meny.no/varer${source.slugifiedUrl}` : null,
    ean,
    in_stock: !source.isOutOfStock,
    is_offer: source.isOffer || false,
    vendor: source.vendor || null,
    raw_data: source,
  };
}

function extractSize(title: string, subtitle: string): string | null {
  const combined = `${title} ${subtitle}`;
  const match = combined.match(/(\d+(?:[.,]\d+)?)\s*(ml|l|cl|g|kg|stk|pk)\b/i);
  return match ? `${match[1]}${match[2].toLowerCase()}` : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main sync ───────────────────────────────────────────────────────────────

export async function syncMeny(): Promise<{ synced: number }> {
  const db = getSupabase();
  const logId = await startSyncLog("meny", "full");

  try {
    console.log(`[Meny] Starting sync with ${DISCOVERY_TERMS.length} search terms...`);

    // Collect unique products across all search terms
    const seen = new Set<string>(); // EAN dedup
    const allProducts: ProductInsert[] = [];

    for (let i = 0; i < DISCOVERY_TERMS.length; i++) {
      const term = DISCOVERY_TERMS[i];
      try {
        const data = await searchProducts(term);
        const hits = data.hits?.hits || [];

        for (const hit of hits) {
          const parsed = parseProduct(hit);
          if (parsed._ean && !seen.has(parsed._ean)) {
            seen.add(parsed._ean);
            const { _ean, ...product } = parsed;
            allProducts.push(product);
          }
        }

        if ((i + 1) % 10 === 0) {
          console.log(`[Meny] Searched ${i + 1}/${DISCOVERY_TERMS.length} terms, ${allProducts.length} unique products...`);
        }
      } catch (err: any) {
        console.warn(`[Meny] Search "${term}" failed: ${err.message}`);
      }

      await delay(config.sync.delayMs);
    }

    console.log(`[Meny] Found ${allProducts.length} unique products. Upserting to DB...`);

    // Upsert in batches
    let synced = 0;
    for (let i = 0; i < allProducts.length; i += config.sync.batchSize) {
      const batch = allProducts.slice(i, i + config.sync.batchSize);
      const { error } = await db
        .from("products")
        .upsert(
          batch.map((p) => ({ ...p, last_synced_at: new Date().toISOString() })),
          { onConflict: "source,external_id" }
        );
      if (error) throw new Error(`Upsert failed: ${error.message}`);
      synced += batch.length;
    }

    console.log(`[Meny] Synced ${synced} products`);
    await completeSyncLog(logId, { products_synced: synced });
    return { synced };
  } catch (err: any) {
    console.error(`[Meny] Sync failed:`, err.message);
    await failSyncLog(logId, err.message);
    throw err;
  }
}

