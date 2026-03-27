'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

/* ── Types ──────────────────────────────────────────────────────── */

interface Ingredient {
  name: string;
  amount: string | number;
  unit?: string;
  category?: string;
}

interface AltProduct {
  product_name: string;
  product_price: number;
  image_url?: string;
  compare_price?: number | null;
  compare_unit?: string | null;
  weight_kg?: number | null;
  size?: string;
}

interface CartItem {
  ingredient: Ingredient;
  product_name: string;
  product_price: number;
  product_image?: string;
  compare_price?: number | null;
  compare_unit?: string | null;
  weight_kg?: number | null;
  size?: string;
  source: 'meny' | 'afood';
  tier?: number;
  alt?: AltProduct | null;
}

interface StapleItem {
  ingredient: Ingredient;
}

interface UnmatchedItem {
  ingredient: Ingredient;
  suggestion?: string;
}

interface Recipe {
  servings: number;
  description: string;
  prep_time: string;
  cook_time: string;
  difficulty: string;
  steps: string[];
  tips?: string[];
}

interface CartData {
  recipe: Recipe;
  items: CartItem[];
  staples?: StapleItem[];
  unmatched?: UnmatchedItem[];
}

interface StoreProduct {
  name: string;
  price: number;
  image?: string;
  cmpPrice?: number | null;
  cmpUnit?: string | null;
  wKg?: number | null;
  size?: string;
}

interface EstResult {
  est: number | null;
  basis: string | null;
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function fmtNum(n: number): string {
  return n % 1 === 0 ? n.toString() : n.toFixed(1);
}

function fmtAmt(amount: string | number, unit?: string): string {
  const a = parseFloat(String(amount));
  const u = unit || '';
  if (isNaN(a)) return (amount || '') + (u ? ' ' + u : '');
  return fmtNum(a) + (u ? ' ' + u : '');
}

function toUnit(val: number, from: string, to: string): number | null {
  if (isNaN(val) || !from || !to) return null;
  const f = from.toLowerCase().replace(/\.$/, '');
  const t = to.toLowerCase().replace(/\.$/, '');
  if (f === t) return val;
  // Weight
  if (t === 'kg') {
    if (f === 'g') return val / 1000;
  }
  if (t === 'g') {
    if (f === 'kg') return val * 1000;
  }
  // Volume
  if (t === 'l' || t === 'ltr') {
    if (f === 'ml') return val / 1000;
    if (f === 'dl') return val / 10;
    if (f === 'cl') return val / 100;
  }
  if (t === 'ml') {
    if (f === 'l' || f === 'ltr') return val * 1000;
    if (f === 'dl') return val * 100;
  }
  return null;
}

function estCost(
  price: number,
  cmpPrice: number | null | undefined,
  cmpUnit: string | null | undefined,
  weightKg: number | null | undefined,
  recipeAmt: number,
  recipeUnit: string,
): EstResult {
  if (!price || isNaN(recipeAmt)) return { est: null, basis: null };
  // Try compare_price first
  if (cmpPrice && cmpUnit) {
    const conv = toUnit(recipeAmt, recipeUnit, cmpUnit);
    if (conv !== null) {
      return { est: cmpPrice * conv, basis: cmpUnit };
    }
  }
  // Fallback: use weight_kg to derive per-kg cost
  if (weightKg && weightKg > 0) {
    const conv = toUnit(recipeAmt, recipeUnit, 'kg');
    if (conv !== null) {
      const perKg = price / weightKg;
      return { est: perKg * conv, basis: 'kg' };
    }
  }
  return { est: null, basis: null };
}

function phSvg(cat?: string): string {
  const c: Record<string, string> = {
    protein: '#E8590C',
    vegetable: '#059669',
    sauce: '#D97706',
    spice: '#B84500',
    carb: '#C44408',
    dairy: '#003087',
    other: '#9A3412',
  };
  const l: Record<string, string> = {
    protein: 'P',
    vegetable: 'V',
    sauce: 'S',
    spice: 'Sp',
    carb: 'C',
    dairy: 'D',
    other: '?',
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

function getStoreProducts(item: CartItem): { meny: StoreProduct | null; afood: StoreProduct | null } {
  let meny: StoreProduct | null = null;
  let afood: StoreProduct | null = null;

  if (item.source === 'meny') {
    meny = {
      name: item.product_name,
      price: item.product_price,
      image: item.product_image,
      cmpPrice: item.compare_price,
      cmpUnit: item.compare_unit,
      wKg: item.weight_kg,
      size: item.size,
    };
    if (item.alt) {
      afood = {
        name: item.alt.product_name,
        price: item.alt.product_price,
        image: item.alt.image_url,
        cmpPrice: item.alt.compare_price,
        cmpUnit: item.alt.compare_unit,
        wKg: item.alt.weight_kg,
        size: item.alt.size,
      };
    }
  } else {
    afood = {
      name: item.product_name,
      price: item.product_price,
      image: item.product_image,
      cmpPrice: item.compare_price,
      cmpUnit: item.compare_unit,
      wKg: item.weight_kg,
      size: item.size,
    };
    if (item.alt) {
      meny = {
        name: item.alt.product_name,
        price: item.alt.product_price,
        image: item.alt.image_url,
        cmpPrice: item.alt.compare_price,
        cmpUnit: item.alt.compare_unit,
        wKg: item.alt.weight_kg,
        size: item.alt.size,
      };
    }
  }

  return { meny, afood };
}

function getEffectivePrice(prod: StoreProduct | null, recipeAmt: number, recipeUnit: string): number {
  if (!prod) return 0;
  const ec = estCost(prod.price, prod.cmpPrice, prod.cmpUnit, prod.wKg, recipeAmt, recipeUnit);
  return ec.est !== null ? ec.est : prod.price || 0;
}

/* ── Loading Messages ────────────────────────────────────────────── */

const LOADING_MESSAGES = [
  'Generating recipe with AI...',
  'Matching ingredients at Meny & aFood...',
  'Finding the best prices...',
];

/* ── Component ───────────────────────────────────────────────────── */

export function RecipePage() {
  const params = useSearchParams();
  const router = useRouter();
  const dishName = params.get('dish') || '';
  const dishImg = params.get('img') || '';
  const dishCuisine = params.get('cuisine') || '';

  const [cart, setCart] = useState<CartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [servings, setServings] = useState(4);
  const [baseServings, setBaseServings] = useState(4);
  const [selectedStores, setSelectedStores] = useState<Record<number, string>>({});
  const [statusMsg, setStatusMsg] = useState(LOADING_MESSAGES[0]);
  const msgTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Redirect if no dish
  useEffect(() => {
    if (!dishName) {
      router.push('/');
    }
  }, [dishName, router]);

  // Loading message rotation
  useEffect(() => {
    if (!loading) return;
    let i = 0;
    setStatusMsg(LOADING_MESSAGES[0]);
    msgTimerRef.current = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      setStatusMsg(LOADING_MESSAGES[i]);
    }, 4000);
    return () => {
      if (msgTimerRef.current) clearInterval(msgTimerRef.current);
    };
  }, [loading]);

  // Fetch recipe
  const fetchCook = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dish: dishName, servings: 4 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load recipe');
      setCart(data);
      setBaseServings(data.recipe.servings);
      setServings(data.recipe.servings);
      // Default store selection from API source
      const defaults: Record<number, string> = {};
      data.items.forEach((item: CartItem, i: number) => {
        defaults[i] = item.source;
      });
      setSelectedStores(defaults);
      setLoading(false);
    } catch (err: unknown) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }, [dishName]);

  useEffect(() => {
    if (dishName) fetchCook();
  }, [dishName, fetchCook]);

  // Servings stepper
  function changeServings(delta: number) {
    setServings((prev) => Math.max(1, Math.min(20, prev + delta)));
  }

  // Store selection
  function selectStore(originalIndex: number, store: string) {
    if (!cart) return;
    const item = cart.items[originalIndex];
    const { meny, afood } = getStoreProducts(item);
    // Check if the store is available
    if (store === 'meny' && !meny) return;
    if (store === 'afood' && !afood) return;

    setSelectedStores((prev) => ({ ...prev, [originalIndex]: store }));
  }

  // Calculate totals
  const scale = servings / baseServings;

  let total = 0;
  let menyTotal = 0;
  let afoodTotal = 0;
  let itemCount = 0;

  if (cart) {
    cart.items.forEach((item, i) => {
      const sel = selectedStores[i] || item.source;
      const { meny, afood } = getStoreProducts(item);
      const rAmt = parseFloat(String(item.ingredient.amount));
      const rUnit = item.ingredient.unit || '';

      const prod = sel === 'meny' ? meny : afood;
      const price = getEffectivePrice(prod, rAmt, rUnit);

      total += price;
      itemCount++;
      if (sel === 'meny') menyTotal += price;
      else afoodTotal += price;
    });
  }

  const trumf = (menyTotal * 0.01).toFixed(2);
  const eurobonus = Math.floor((total / 100) * 20);

  // Sort items: both stores first, then single-store
  const sortedItems = cart
    ? cart.items
        .map((item, i) => ({ item, i }))
        .sort((a, b) => {
          const aHas = a.item.alt ? 2 : 1;
          const bHas = b.item.alt ? 2 : 1;
          return bHas - aHas;
        })
    : [];

  if (!dishName) return null;

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center gap-3 border-b border-[rgba(0,0,0,0.06)] bg-[rgba(250,250,248,0.92)] px-5 py-3.5 backdrop-blur-[16px]">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-[10px] border-none bg-white text-[#1A1A18] shadow-[0_1px_4px_rgba(0,0,0,0.06)] transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.1)]"
          aria-label="Back to search"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 3L6 9l6 6" />
          </svg>
        </Link>
        <span className="text-[1.1rem] font-semibold tracking-[-0.02em] text-[#1A1A18]">hoely</span>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-[640px] px-5 pt-6 text-center" aria-label="Recipe overview">
          {dishImg && (
            <img
              src={dishImg.startsWith('http') || dishImg.startsWith('/') ? dishImg : '/' + dishImg}
              alt={`Photo of ${dishName}`}
              className="mx-auto mb-4 block aspect-[4/3] w-full max-w-[320px] rounded-[22px] bg-[#f0f0ec] object-cover max-[480px]:max-w-[260px]"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          {dishCuisine && (
            <span className="mb-2 inline-block rounded-[20px] bg-[rgba(232,89,12,0.06)] px-2.5 py-[3px] text-[0.72rem] font-semibold uppercase tracking-[0.05em] text-[#E8590C]">
              {dishCuisine}
            </span>
          )}
          <h1 className="text-[1.8rem] font-semibold leading-[1.2] tracking-[-0.02em] max-[480px]:text-[1.5rem]">{dishName}</h1>

          {cart && (
            <>
              <p className="mt-2 text-[0.88rem] leading-[1.5] text-[#7A7A72]">{cart.recipe.description}</p>
              <div className="mt-5 flex flex-wrap items-start justify-center gap-5 border-b border-[rgba(0,0,0,0.06)] pb-5">
                {/* Servings stepper */}
                <div className="flex flex-col items-center gap-1">
                  <div className="inline-flex items-center gap-1 rounded-[10px] border border-[rgba(0,0,0,0.06)] bg-white p-[3px]">
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-transparent text-[#1A1A18] transition-colors hover:bg-[rgba(232,89,12,0.06)]"
                      onClick={() => changeServings(-1)}
                      aria-label="Decrease servings"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M4 8h8" />
                      </svg>
                    </button>
                    <span className="min-w-[22px] text-center text-[0.95rem] font-semibold" aria-live="polite" aria-label={`${servings} servings`}>{servings}</span>
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-lg border-none bg-transparent text-[#1A1A18] transition-colors hover:bg-[rgba(232,89,12,0.06)]"
                      onClick={() => changeServings(1)}
                      aria-label="Increase servings"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M4 8h8M8 4v8" />
                      </svg>
                    </button>
                  </div>
                  <span className="text-[0.68rem] uppercase tracking-[0.05em] text-[#AEAEA6]">servings</span>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <span className="text-[0.9rem] font-semibold">{cart.recipe.prep_time}</span>
                  <span className="text-[0.68rem] uppercase tracking-[0.05em] text-[#AEAEA6]">prep</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[0.9rem] font-semibold">{cart.recipe.cook_time}</span>
                  <span className="text-[0.68rem] uppercase tracking-[0.05em] text-[#AEAEA6]">cook</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[0.9rem] font-semibold">{cart.recipe.difficulty}</span>
                  <span className="text-[0.68rem] uppercase tracking-[0.05em] text-[#AEAEA6]">level</span>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Loading */}
        {loading && (
          <section className="mx-auto max-w-[680px] px-5 py-5" aria-label="Loading recipe">
            <p className="mb-5 animate-pulse text-center text-[0.85rem] font-medium text-[#E8590C]" role="status">{statusMsg}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[65, 70, 55, 60, 75, 50].map((w, i) => (
                <div key={i} className="flex items-center gap-3.5 rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white px-4 py-3.5">
                  <div className="h-12 w-12 flex-shrink-0 animate-[shimmer_1.5s_infinite] rounded-xl bg-gradient-to-r from-[#f0f0ec] via-[#e8e8e4] to-[#f0f0ec] bg-[length:400px_100%]" />
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="h-[11px] animate-[shimmer_1.5s_infinite] rounded-md bg-gradient-to-r from-[#f0f0ec] via-[#e8e8e4] to-[#f0f0ec] bg-[length:400px_100%]" style={{ width: `${w}%` }} />
                    <div className="h-[11px] animate-[shimmer_1.5s_infinite] rounded-md bg-gradient-to-r from-[#f0f0ec] via-[#e8e8e4] to-[#f0f0ec] bg-[length:400px_100%]" style={{ width: `${w + 15}%` }} />
                    <div className="h-[11px] animate-[shimmer_1.5s_infinite] rounded-md bg-gradient-to-r from-[#f0f0ec] via-[#e8e8e4] to-[#f0f0ec] bg-[length:400px_100%]" style={{ width: `${w - 20}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Error */}
        {error && !loading && (
          <section className="px-5 py-[60px] text-center" aria-label="Error">
            <p className="mb-4 text-[0.9rem] text-[#7A7A72]">{error}</p>
            <button
              onClick={() => fetchCook()}
              className="rounded-[10px] border-none bg-[#E8590C] px-6 py-2.5 font-medium text-white transition-colors hover:bg-[#D14E0A]"
            >
              Try again
            </button>
          </section>
        )}

        {/* Content */}
        {cart && !loading && (
          <section className="mx-auto max-w-[680px] px-5 pb-[120px]" aria-label="Shopping list and recipe details">
            {/* Section header */}
            <div className="mb-3.5 mt-6 flex items-baseline gap-2">
              <h2 className="text-[1.1rem] font-semibold">Shopping List</h2>
              <span className="text-[0.82rem] text-[#AEAEA6]">{cart.items.length} items</span>
            </div>

            {/* Compare header */}
            <div className="mb-2.5 grid grid-cols-2 gap-2">
              <span className="flex w-fit items-center gap-1.5 rounded-[10px] bg-[#00843D] px-3 py-[5px] text-[0.78rem] font-semibold text-white">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 6h12l-1.5 8H3.5z" />
                  <path d="M5.5 6V4a2.5 2.5 0 015 0v2" />
                </svg>
                Meny
              </span>
              <span className="flex w-fit items-center gap-1.5 rounded-[10px] bg-[#C41E3A] px-3 py-[5px] text-[0.78rem] font-semibold text-white">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round">
                  <line x1="6" y1="2" x2="4" y2="14" />
                  <line x1="10" y1="2" x2="8" y2="14" />
                  <path d="M3 8h8" />
                </svg>
                aFood
              </span>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2.5">
              {sortedItems.map(({ item, i }, idx) => (
                <ShoppingCard
                  key={i}
                  item={item}
                  originalIndex={i}
                  animationDelay={idx * 40}
                  selectedStore={selectedStores[i] || item.source}
                  onSelectStore={selectStore}
                  scale={scale}
                />
              ))}
            </div>

            {/* Staples (Assumed at home) */}
            {cart.staples && cart.staples.length > 0 && (
              <details className="mt-5 overflow-hidden rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 text-[0.9rem] font-medium [&::-webkit-details-marker]:hidden">
                  <ChevronIcon />
                  Assumed at home
                  <span className="text-[0.72rem] font-normal text-[#AEAEA6]">({cart.staples.length})</span>
                </summary>
                <div className="px-4 pb-3.5 pt-1">
                  {cart.staples.map((s, idx) => (
                    <div
                      key={idx}
                      className="border-b border-[rgba(0,0,0,0.06)] py-1.5 text-[0.82rem] text-[#7A7A72] last:border-b-0"
                    >
                      {s.ingredient.name} &middot; {fmtAmt(s.ingredient.amount, s.ingredient.unit)}
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Unmatched */}
            {cart.unmatched && cart.unmatched.length > 0 && (
              <div>
                <div className="mb-3.5 mt-6 flex items-baseline gap-2">
                  <h2 className="text-[1.1rem] font-semibold">Not available</h2>
                </div>
                <div className="px-0">
                  {cart.unmatched.map((u, idx) => (
                    <div key={idx} className="border-b border-[rgba(0,0,0,0.06)] py-2.5 last:border-b-0">
                      <span className="text-[0.85rem] text-[#1A1A18]">
                        {u.ingredient.name} &middot; {fmtAmt(u.ingredient.amount, u.ingredient.unit)}
                      </span>
                      {u.suggestion && (
                        <span className="mt-0.5 block text-[0.78rem] text-[#AEAEA6]">{u.suggestion}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Steps */}
            <details className="mt-5 overflow-hidden rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 text-[0.9rem] font-medium [&::-webkit-details-marker]:hidden">
                <ChevronIcon />
                Recipe Steps
              </summary>
              <ol className="list-decimal px-4 pb-3.5 pl-8 pt-1">
                {cart.recipe.steps.map((step, idx) => (
                  <li
                    key={idx}
                    className="border-b border-[rgba(0,0,0,0.06)] py-2 text-[0.85rem] leading-[1.5] text-[#7A7A72] last:border-b-0"
                  >
                    {step}
                  </li>
                ))}
              </ol>
            </details>

            {/* Tips */}
            {cart.recipe.tips && cart.recipe.tips.length > 0 && (
              <details className="mt-5 overflow-hidden rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 text-[0.9rem] font-medium [&::-webkit-details-marker]:hidden">
                  <ChevronIcon />
                  Chef Tips
                </summary>
                <ul className="list-none px-4 pb-3.5 pt-1">
                  {cart.recipe.tips.map((tip, idx) => (
                    <li
                      key={idx}
                      className="border-b border-[rgba(0,0,0,0.06)] py-2 text-[0.85rem] leading-[1.5] text-[#7A7A72] last:border-b-0"
                    >
                      <span className="font-bold text-[#E8590C]">&bull; </span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}
      </main>

      {/* Bottom Bar */}
      {cart && !loading && (
        <footer className="fixed inset-x-0 bottom-0 z-[100] border-t border-[rgba(0,0,0,0.06)] bg-[rgba(255,255,255,0.92)] px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-[16px]" aria-label="Order summary">
          <div className="flex items-center justify-between">
            <span className="text-[1.3rem] font-semibold max-[480px]:text-[1.1rem]">~{Math.round(total)} kr</span>
            <div className="flex gap-3.5 text-[0.78rem] text-[#7A7A72]">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-[#00843D]" aria-hidden="true" />
                {trumf} Trumf
              </span>
              <span className="flex items-center gap-1">
                <svg className="text-[#000080]" width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                  <path d="M6 0L4.5 4H0l3.5 3L2 12l4-3 4 3-1.5-5L12 4H7.5z" />
                </svg>
                {eurobonus} EB
              </span>
            </div>
          </div>
          <div className="mt-[3px] text-[0.72rem] text-[#AEAEA6]">
            {itemCount} items &middot; {Math.round(menyTotal)} kr Meny &middot; {Math.round(afoodTotal)} kr aFood
          </div>
        </footer>
      )}
    </div>
  );
}

/* ── Sub-Components ──────────────────────────────────────────────── */

function ChevronIcon() {
  return (
    <svg
      className="flex-shrink-0 transition-transform [[open]>&]:rotate-180"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="#7A7A72"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 7l3 3 3-3" />
    </svg>
  );
}

interface ShoppingCardProps {
  item: CartItem;
  originalIndex: number;
  animationDelay: number;
  selectedStore: string;
  onSelectStore: (index: number, store: string) => void;
  scale: number;
}

function ShoppingCard({ item, originalIndex, animationDelay, selectedStore, onSelectStore, scale }: ShoppingCardProps) {
  const { meny, afood } = getStoreProducts(item);
  const rAmt = parseFloat(String(item.ingredient.amount));
  const rUnit = item.ingredient.unit || '';
  const scaledAmt = isNaN(rAmt) ? item.ingredient.amount : rAmt * scale;
  const amtStr = fmtAmt(scaledAmt, item.ingredient.unit);
  const tierClass = `t${item.tier || 1}`;
  const tierLabel = item.tier === 1 ? 'Direct match' : item.tier === 2 ? 'Semantic match' : 'Substitute';

  return (
    <article
      className="animate-[cardIn_0.3s_ease_both] overflow-hidden rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white"
      style={{ animationDelay: `${animationDelay}ms` }}
      aria-label={`${item.ingredient.name} shopping options`}
    >
      {/* Card header */}
      <div className="flex flex-wrap items-center gap-1.5 px-3.5 pt-3">
        <span className="text-[0.88rem] font-medium text-[#E8590C]">{item.ingredient.name}</span>
        <span className="text-[0.78rem] text-[#AEAEA6]">{amtStr}</span>
        <span
          className={`h-[7px] w-[7px] flex-shrink-0 cursor-help rounded-full ${
            tierClass === 't1' ? 'bg-[#059669]' : tierClass === 't2' ? 'bg-[#D97706]' : 'bg-[#E8590C]'
          }`}
          title={tierLabel}
          aria-label={tierLabel}
        />
      </div>

      {/* Store comparison */}
      <div className="grid grid-cols-2 gap-2 px-3 pb-3 pt-2.5">
        <StoreOption
          store="meny"
          prod={meny}
          selected={selectedStore === 'meny'}
          category={item.ingredient.category}
          recipeAmt={rAmt}
          recipeUnit={rUnit}
          onClick={() => onSelectStore(originalIndex, 'meny')}
        />
        <StoreOption
          store="afood"
          prod={afood}
          selected={selectedStore === 'afood'}
          category={item.ingredient.category}
          recipeAmt={rAmt}
          recipeUnit={rUnit}
          onClick={() => onSelectStore(originalIndex, 'afood')}
        />
      </div>
    </article>
  );
}

interface StoreOptionProps {
  store: string;
  prod: StoreProduct | null;
  selected: boolean;
  category?: string;
  recipeAmt: number;
  recipeUnit: string;
  onClick: () => void;
}

function StoreOption({ store, prod, selected, category, recipeAmt, recipeUnit, onClick }: StoreOptionProps) {
  if (!prod) {
    return (
      <div className="flex cursor-default flex-col items-center rounded-xl border-2 border-dashed border-[rgba(0,0,0,0.06)] py-3.5 text-center opacity-35" aria-label={`Not available at ${store === 'meny' ? 'Meny' : 'aFood'}`}>
        <span className="text-[0.75rem] text-[#AEAEA6]">&mdash;</span>
      </div>
    );
  }

  const ec = estCost(prod.price, prod.cmpPrice, prod.cmpUnit, prod.wKg, recipeAmt, recipeUnit);
  const imgSrc = prod.image || phSvg(category);
  const placeholder = phSvg(category);
  const storeName = store === 'meny' ? 'Meny' : 'aFood';

  return (
    <button
      type="button"
      className={`relative flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 p-2.5 text-center transition-all ${
        selected
          ? 'border-[#E8590C] bg-[rgba(232,89,12,0.06)]'
          : 'border-[rgba(0,0,0,0.06)] hover:border-[rgba(0,0,0,0.12)]'
      }`}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`Select ${prod.name} from ${storeName}${ec.est !== null ? `, estimated ${ec.est.toFixed(0)} kr` : prod.price ? `, ${prod.price.toFixed(0)} kr` : ''}`}
    >
      {/* Checkmark */}
      {selected && (
        <span className="absolute right-1.5 top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#E8590C]" aria-hidden="true">
          <svg viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" className="h-2.5 w-2.5">
            <path d="M2 5.5l2 2 4-4.5" />
          </svg>
        </span>
      )}

      {/* Product image */}
      <img
        className="h-10 w-10 rounded-[10px] bg-[#f0f0ec] object-cover"
        src={imgSrc}
        alt={`${prod.name} product`}
        loading="lazy"
        onError={(e) => {
          const el = e.target as HTMLImageElement;
          el.onerror = null;
          el.src = placeholder;
        }}
      />

      {/* Product name */}
      <div className="line-clamp-2 text-[0.72rem] leading-[1.3] text-[#7A7A72]">{prod.name}</div>

      {/* Price */}
      {ec.est !== null ? (
        <>
          <div className="text-[0.9rem] font-semibold">~{ec.est.toFixed(0)} kr</div>
          <div className="-mt-0.5 text-[0.62rem] text-[#AEAEA6]">
            {prod.price ? prod.price.toFixed(0) + ' kr' : ''}
            {ec.basis ? ' / ' + ec.basis : ''}
          </div>
        </>
      ) : (
        <div className="text-[0.9rem] font-semibold">{prod.price ? prod.price.toFixed(0) + ' kr' : '\u2013'}</div>
      )}
    </button>
  );
}
