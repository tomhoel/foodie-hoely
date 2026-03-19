/**
 * aFood Market → Supabase sync pipeline
 *
 * Fetches products from aFood's WP REST API + AJAX search,
 * parses names for brand/size/unit, and upserts into the DB.
 */

import { config } from "../config";
import { getSupabase, startSyncLog, completeSyncLog, failSyncLog } from "../db/client";
import type { ProductInsert } from "../db/types";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
};

// ─── API helpers ─────────────────────────────────────────────────────────────

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, { headers: HEADERS, ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

function parsePriceHtml(html: string): number | null {
  if (!html) return null;
  // Decode HTML entities
  const decoded = html
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  // Match Norwegian price format: "29,90" or "1 049,90"
  const match = decoded.match(/(\d[\d\s]*,\d{2})/);
  if (match) {
    return parseFloat(match[1].replace(/\s/g, "").replace(",", "."));
  }
  const intMatch = decoded.match(/(\d[\d\s]+)/);
  if (intMatch) {
    return parseFloat(intMatch[1].replace(/\s/g, ""));
  }
  return null;
}

// ─── Name parser ─────────────────────────────────────────────────────────────
// Extracts brand, size, unit, and origin from aFood product names
// e.g. "AROY-D coconut milk (UHT) 500ml TH" → brand:AROY-D, size:500ml, unit:ml

interface ParsedName {
  brand: string | null;
  cleanName: string;
  size: string | null;
  unit: string | null;
  weight_kg: number | null;
  origin: string | null;
}

function parseProductName(name: string): ParsedName {
  let working = name.trim();

  // Extract origin country code at the end (e.g. "TH", "JP", "KR", "CN", "VN")
  let origin: string | null = null;
  const originMatch = working.match(/\s+(TH|JP|KR|CN|VN|ID|MY|PH|IN|LA|MM|SG|HK|TW|AU|NZ|US|UK)$/i);
  if (originMatch) {
    origin = originMatch[1].toUpperCase();
    working = working.slice(0, originMatch.index).trim();
  }

  // Extract size/weight patterns: "500ml", "1L", "400G", "1kg", "200g (5x40g)"
  let size: string | null = null;
  let unit: string | null = null;
  let weight_kg: number | null = null;

  const sizeMatch = working.match(/(\d+(?:[.,]\d+)?)\s*(ml|l|g|kg|oz|cl)\b/i);
  if (sizeMatch) {
    const num = parseFloat(sizeMatch[1].replace(",", "."));
    const u = sizeMatch[2].toLowerCase();
    size = `${num}${u}`;
    unit = u;

    // Convert to kg for normalization
    if (u === "kg") weight_kg = num;
    else if (u === "g") weight_kg = num / 1000;
    else if (u === "l") weight_kg = num; // approximate
    else if (u === "ml" || u === "cl") weight_kg = (u === "cl" ? num * 10 : num) / 1000;
  }

  // Extract brand (first word if it's ALL CAPS or a known pattern)
  let brand: string | null = null;
  const words = working.split(/\s+/);
  if (words.length > 1) {
    const first = words[0];
    // Brand is typically ALL CAPS or ends with a dash (e.g. "AROY-D")
    if (/^[A-Z][A-Z0-9-]+$/.test(first) && first.length >= 2) {
      brand = first;
    }
  }

  // Clean name: remove the size pattern and parenthetical sub-packs
  let cleanName = working
    .replace(/\(\d+x\d+[a-z]*\)/gi, "")   // remove "(5x80g)" etc.
    .replace(/\d+(?:[.,]\d+)?\s*(?:ml|l|g|kg|oz|cl)\b/gi, "")
    .replace(/\(UHT\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return { brand, cleanName, size, unit, weight_kg, origin };
}

// ─── AJAX search ─────────────────────────────────────────────────────────────

interface AjaxProduct {
  id: number;
  name: string;
  url: string;
  image: string;
  price: number | null;
}

async function ajaxSearch(query: string): Promise<AjaxProduct[]> {
  const body = new URLSearchParams({
    action: "flatsome_ajax_search_products",
    query,
  });

  const data = await fetchJson(config.afood.ajaxUrl, {
    method: "POST",
    headers: {
      ...HEADERS,
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  return (data.suggestions || [])
    .filter((s: any) => s.type === "Product")
    .map((s: any) => ({
      id: s.id,
      name: s.value,
      url: s.url,
      image: s.img || "",
      price: parsePriceHtml(s.price || ""),
    }));
}

// ─── Catalog fetch ───────────────────────────────────────────────────────────

interface CatalogProduct {
  id: number;
  name: string;
  slug: string;
  url: string;
  categoryIds: number[];
  categoryNames: string[];
  featuredMediaId: number;
  inStock: boolean;
  sku: string;
}

async function fetchCategories(): Promise<Map<number, { name: string; parent: number }>> {
  const categories = new Map<number, { name: string; parent: number }>();
  let page = 1;
  while (true) {
    const data = await fetchJson(`${config.afood.apiUrl}/product_cat?per_page=100&page=${page}`);
    if (!data.length) break;
    for (const cat of data) {
      categories.set(cat.id, { name: cat.name, parent: cat.parent || 0 });
    }
    if (data.length < 100) break;
    page++;
    await delay(config.sync.delayMs);
  }
  return categories;
}

async function fetchCatalogPage(page: number): Promise<{ products: any[]; totalPages: number }> {
  const url = `${config.afood.apiUrl}/product?per_page=100&page=${page}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const totalPages = parseInt(res.headers.get("X-WP-TotalPages") || "0", 10);
  const products = (await res.json()) as any[];
  return { products, totalPages };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main sync ───────────────────────────────────────────────────────────────

export async function syncAfood(): Promise<{ synced: number }> {
  const db = getSupabase();
  const logId = await startSyncLog("afood", "full");

  try {
    console.log("[aFood] Fetching categories...");
    const categories = await fetchCategories();
    console.log(`[aFood] Found ${categories.size} categories`);

    // Fetch full catalog
    console.log("[aFood] Fetching product catalog...");
    const { totalPages } = await fetchCatalogPage(1);
    const allProducts: CatalogProduct[] = [];

    for (let page = 1; page <= totalPages; page++) {
      console.log(`[aFood] Page ${page}/${totalPages}...`);
      const { products } = await fetchCatalogPage(page);

      for (const p of products) {
        const catIds = p.product_cat || [];
        const catNames = catIds
          .map((id: number) => categories.get(id)?.name)
          .filter(Boolean);

        const classList = p.class_list || {};
        const classes: string[] = Array.isArray(classList) ? classList : Object.values(classList) as string[];

        allProducts.push({
          id: p.id,
          name: p.title?.rendered || "",
          slug: p.slug || "",
          url: p.link || "",
          categoryIds: catIds,
          categoryNames: catNames,
          featuredMediaId: p.featured_media || 0,
          inStock: (classes as string[]).includes("instock"),
          sku: "",
        });
      }
      await delay(config.sync.delayMs);
    }

    console.log(`[aFood] Fetched ${allProducts.length} products. Enriching with prices...`);

    // Enrich with prices via AJAX search (batch by first word)
    const firstWords = new Set<string>();
    for (const p of allProducts) {
      const word = p.name.replace(/[^\w\s]/g, "").split(/\s+/)[0]?.toLowerCase();
      if (word && word.length >= 2) firstWords.add(word);
    }

    const priceMap = new Map<number, { price: number | null; image: string }>();
    let batchNum = 0;
    for (const word of firstWords) {
      const results = await ajaxSearch(word);
      for (const r of results) {
        if (!priceMap.has(r.id)) {
          priceMap.set(r.id, { price: r.price, image: r.image });
        }
      }
      batchNum++;
      if (batchNum % 20 === 0) {
        console.log(`[aFood] Price batch ${batchNum}/${firstWords.size}...`);
      }
      await delay(config.sync.delayMs);
    }

    console.log(`[aFood] Got prices for ${priceMap.size} products. Upserting to DB...`);

    // Upsert in batches
    let synced = 0;
    const batch: ProductInsert[] = [];

    for (const p of allProducts) {
      const parsed = parseProductName(p.name);
      const priceInfo = priceMap.get(p.id);

      batch.push({
        source: "afood",
        external_id: String(p.id),
        name: p.name,
        slug: p.slug,
        brand: parsed.brand,
        category: p.categoryNames[0] || null,
        subcategory: p.categoryNames[1] || null,
        size: parsed.size,
        unit: parsed.unit,
        weight_kg: parsed.weight_kg,
        price: priceInfo?.price ?? null,
        image_url: priceInfo?.image || null,
        product_url: p.url,
        sku: p.sku || null,
        in_stock: p.inStock,
        raw_data: { categoryIds: p.categoryIds, categoryNames: p.categoryNames },
      });

      if (batch.length >= config.sync.batchSize) {
        await upsertBatch(db, batch);
        synced += batch.length;
        batch.length = 0;
      }
    }

    if (batch.length > 0) {
      await upsertBatch(db, batch);
      synced += batch.length;
    }

    console.log(`[aFood] Synced ${synced} products`);
    await completeSyncLog(logId, { products_synced: synced });
    return { synced };
  } catch (err: any) {
    console.error(`[aFood] Sync failed:`, err.message);
    await failSyncLog(logId, err.message);
    throw err;
  }
}

async function upsertBatch(db: ReturnType<typeof getSupabase>, batch: ProductInsert[]): Promise<void> {
  const { error } = await db
    .from("products")
    .upsert(
      batch.map((p) => ({ ...p, last_synced_at: new Date().toISOString() })),
      { onConflict: "source,external_id" }
    );
  if (error) throw new Error(`Upsert failed: ${error.message}`);
}

