import { NextRequest, NextResponse } from 'next/server';
import { cook } from '@/src/recipes/generator';
import { getSupabase } from '@/src/db/client';

export async function POST(request: NextRequest) {
  try {
    const { dish, servings } = await request.json();
    if (!dish || typeof dish !== 'string') {
      return NextResponse.json({ error: 'Missing "dish" in request body' }, { status: 400 });
    }

    const cart = await cook(dish, { servings: servings || 4 });

    // Collect all product IDs to batch-query compare/weight data
    const productIds: string[] = [];
    for (const item of cart.items) {
      if (item.match?.product?.product_id) productIds.push(item.match.product.product_id);
      if (item.alt?.product_id) productIds.push(item.alt.product_id);
    }

    // Batch lookup compare_price, compare_unit, weight_kg, size
    const pdMap = new Map<string, any>();
    if (productIds.length) {
      const supabase = getSupabase();
      const { data } = await supabase
        .from('products')
        .select('id, size, weight_kg, compare_price, compare_unit')
        .in('id', productIds);
      for (const p of data || []) pdMap.set(p.id, p);
    }

    const items = cart.items.map((item: any) => {
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
