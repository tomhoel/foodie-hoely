/* ── Shared types & helpers for the recipe page ────────────────── */

export interface Ingredient {
  name: string;
  amount: string | number;
  unit?: string;
  category?: string;
}

export interface AltProduct {
  product_name: string;
  product_price: number;
  image_url?: string;
  compare_price?: number | null;
  compare_unit?: string | null;
  weight_kg?: number | null;
  size?: string;
}

export interface CartItem {
  ingredient: Ingredient;
  product_name: string;
  product_price: number;
  product_image?: string;
  product_url?: string;
  compare_price?: number | null;
  compare_unit?: string | null;
  weight_kg?: number | null;
  size?: string;
  source: 'meny' | 'afood';
  tier?: number;
  alt?: AltProduct | null;
}

export interface StapleItem {
  ingredient: Ingredient;
}

export interface UnmatchedItem {
  ingredient: Ingredient;
  suggestion?: string;
}

export interface Recipe {
  servings: number;
  description: string;
  prep_time: string;
  cook_time: string;
  difficulty: string;
  steps: string[];
  tips?: string[];
}

export interface CartData {
  recipe: Recipe;
  items: CartItem[];
  staples?: StapleItem[];
  unmatched?: UnmatchedItem[];
}

export interface StoreProduct {
  name: string;
  price: number;
  image?: string;
  url?: string;
  cmpPrice?: number | null;
  cmpUnit?: string | null;
  wKg?: number | null;
  size?: string;
}

export interface EstResult {
  est: number | null;
  basis: string | null;
}

/* ── Formatting helpers ──────────────────────────────────────────── */

export function fmtNum(n: number): string {
  return n % 1 === 0 ? n.toString() : n.toFixed(1);
}

export function fmtAmt(amount: string | number, unit?: string): string {
  const a = parseFloat(String(amount));
  const u = unit || '';
  if (isNaN(a)) return (amount || '') + (u ? ' ' + u : '');
  return fmtNum(a) + (u ? ' ' + u : '');
}

export function toUnit(val: number, from: string, to: string): number | null {
  if (isNaN(val) || !from || !to) return null;
  const f = from.toLowerCase().replace(/\.$/, '');
  const t = to.toLowerCase().replace(/\.$/, '');
  if (f === t) return val;
  if (t === 'kg' && f === 'g') return val / 1000;
  if (t === 'g' && f === 'kg') return val * 1000;
  if ((t === 'l' || t === 'ltr') && f === 'ml') return val / 1000;
  if ((t === 'l' || t === 'ltr') && f === 'dl') return val / 10;
  if ((t === 'l' || t === 'ltr') && f === 'cl') return val / 100;
  if (t === 'ml' && (f === 'l' || f === 'ltr')) return val * 1000;
  if (t === 'ml' && f === 'dl') return val * 100;
  return null;
}

export function estCost(
  price: number,
  cmpPrice: number | null | undefined,
  cmpUnit: string | null | undefined,
  weightKg: number | null | undefined,
  recipeAmt: number,
  recipeUnit: string,
): EstResult {
  if (!price || isNaN(recipeAmt)) return { est: null, basis: null };
  if (cmpPrice && cmpUnit) {
    const conv = toUnit(recipeAmt, recipeUnit, cmpUnit);
    if (conv !== null) return { est: cmpPrice * conv, basis: cmpUnit };
  }
  if (weightKg && weightKg > 0) {
    const conv = toUnit(recipeAmt, recipeUnit, 'kg');
    if (conv !== null) {
      const perKg = price / weightKg;
      return { est: perKg * conv, basis: 'kg' };
    }
  }
  return { est: null, basis: null };
}

/** Category placeholder SVG for products without images */
export function phSvg(cat?: string): string {
  const c: Record<string, string> = {
    protein: '#E8590C', vegetable: '#059669', sauce: '#D97706',
    spice: '#B84500', carb: '#C44408', dairy: '#003087', other: '#9A3412',
  };
  const l: Record<string, string> = {
    protein: 'P', vegetable: 'V', sauce: 'S', spice: 'Sp', carb: 'C', dairy: 'D', other: '?',
  };
  const col = c[cat || ''] || c.other;
  const lt = l[cat || ''] || '?';
  return (
    'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" rx="12" fill="${col}" opacity="0.12"/><text x="24" y="30" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="600" fill="${col}">${lt}</text></svg>`,
    )
  );
}

/** Extract Meny/aFood products from a CartItem */
export function getStoreProducts(item: CartItem): { meny: StoreProduct | null; afood: StoreProduct | null } {
  let meny: StoreProduct | null = null;
  let afood: StoreProduct | null = null;

  if (item.source === 'meny') {
    meny = {
      name: item.product_name, price: item.product_price, image: item.product_image, url: item.product_url,
      cmpPrice: item.compare_price, cmpUnit: item.compare_unit, wKg: item.weight_kg, size: item.size,
    };
    if (item.alt) {
      afood = {
        name: item.alt.product_name, price: item.alt.product_price, image: item.alt.image_url,
        cmpPrice: item.alt.compare_price, cmpUnit: item.alt.compare_unit, wKg: item.alt.weight_kg, size: item.alt.size,
      };
    }
  } else {
    afood = {
      name: item.product_name, price: item.product_price, image: item.product_image, url: item.product_url,
      cmpPrice: item.compare_price, cmpUnit: item.compare_unit, wKg: item.weight_kg, size: item.size,
    };
    if (item.alt) {
      meny = {
        name: item.alt.product_name, price: item.alt.product_price, image: item.alt.image_url,
        cmpPrice: item.alt.compare_price, cmpUnit: item.alt.compare_unit, wKg: item.alt.weight_kg, size: item.alt.size,
      };
    }
  }
  return { meny, afood };
}

/** Get effective price for an ingredient (estimated or full product price) */
export function getEffectivePrice(prod: StoreProduct | null, recipeAmt: number, recipeUnit: string): number {
  if (!prod) return 0;
  const ec = estCost(prod.price, prod.cmpPrice, prod.cmpUnit, prod.wKg, recipeAmt, recipeUnit);
  return ec.est !== null ? ec.est : prod.price || 0;
}
