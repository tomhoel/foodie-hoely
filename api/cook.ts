import { cook } from '../src/recipes/generator';
import { getSupabase } from '../src/db/client';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { dish, servings } = req.body || {};
    if (!dish || typeof dish !== 'string') {
      return res.status(400).json({ error: 'Missing "dish" in request body' });
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

    const items = cart.items.map(item => {
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

    res.json({
      recipe: cart.recipe,
      items,
      staples: cart.staples.map(s => ({
        ingredient: s.ingredient,
      })),
      unmatched: cart.unmatched,
      summary: cart.summary,
    });
  } catch (err: any) {
    console.error('cook() error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
