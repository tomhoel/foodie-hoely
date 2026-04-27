import { NextRequest, NextResponse } from 'next/server';
import { cook } from '@/src/recipes/generator';
import { getSupabase } from '@/src/db/client';
import {
  normalizeCacheKey,
  getCachedRecipe,
  setCachedRecipe,
  touchCacheEntry,
  isCacheStale,
} from '@/src/cache/recipe-cache';

/**
 * Enrich cart items with compare_price/weight data from the products table.
 * This always runs fresh — product data should never be stale.
 */
async function enrichItems(cart: any) {
  const productIds: string[] = [];
  for (const item of cart.items) {
    if (item.match?.product?.product_id) productIds.push(item.match.product.product_id);
    if (item.alt?.product_id) productIds.push(item.alt.product_id);
  }

  const pdMap = new Map<string, any>();
  if (productIds.length) {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('products')
      .select('id, size, weight_kg, compare_price, compare_unit')
      .in('id', productIds);
    for (const p of data || []) pdMap.set(p.id, p);
  }

  return cart.items.map((item: any) => {
    const pid = item.match?.product?.product_id;
    const pd = pid ? pdMap.get(pid) : null;
    const altPd = item.alt?.product_id ? pdMap.get(item.alt.product_id) : null;

    return {
      ingredient: item.ingredient,
      product_name: item.product_name,
      product_price: item.product_price,
      product_url: item.product_url,
      product_image: item.match?.product?.image_url || null,
      product_brand: item.match?.product?.brand || null,
      source: item.source,
      tier: item.match?.tier || null,
      compare_price: pd?.compare_price || null,
      compare_unit: pd?.compare_unit || null,
      weight_kg: pd?.weight_kg || null,
      size: pd?.size || null,
      alt: item.alt ? {
        product_name: item.alt.product_name,
        product_price: item.alt.product_price,
        source: item.alt.source,
        image_url: item.alt.image_url || null,
        compare_price: altPd?.compare_price || null,
        compare_unit: altPd?.compare_unit || null,
        weight_kg: altPd?.weight_kg || null,
        size: altPd?.size || null,
      } : null,
    };
  });
}

export async function POST(request: NextRequest) {
  try {
    const { dish, servings } = await request.json();
    if (!dish || typeof dish !== 'string') {
      return NextResponse.json({ error: 'Missing "dish" in request body' }, { status: 400 });
    }

    const cacheKey = normalizeCacheKey(dish);

    // Check if we have a cached recipe (just the AI-generated recipe, not products)
    const cached = await getCachedRecipe(cacheKey);
    const hasFreshRecipe = cached && !isCacheStale(cached);

    // Call cook() — with cached recipe to skip Gemini, or fresh generation
    const cart = await cook(dish, {
      servings: servings || 4,
      cachedRecipe: hasFreshRecipe ? cached.recipe : undefined,
    });

    // Cache the recipe if we just generated a new one
    if (!hasFreshRecipe) {
      setCachedRecipe(cacheKey, dish, cart.recipe).catch((err) => {
        console.warn('[cache] Failed to write recipe cache:', err.message);
      });
    } else {
      // Bump access stats in the background
      touchCacheEntry(cacheKey).catch(() => {});
    }

    // Product matching + enrichment always runs fresh (done inside cook() above)
    const items = await enrichItems(cart);

    return NextResponse.json({
      recipe: cart.recipe,
      items,
      staples: cart.staples.map((s: any) => ({ ingredient: s.ingredient })),
      unmatched: cart.unmatched,
      summary: cart.summary,
    });
  } catch (err: any) {
    console.error('cook() error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
