'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, ChevronDown, Plus, Minus, Check, Clock, Flame,
  Users, BarChart3, ShoppingBag, Star, Copy, Heart, ExternalLink,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  type CartData, type CartItem, type StoreProduct,
  fmtAmt, fmtNum, estCost, phSvg, getStoreProducts, getEffectivePrice,
} from './types';

const LOADING_MESSAGES = [
  'Generating recipe with AI...',
  'Matching ingredients at Meny & aFood...',
  'Finding the best prices...',
];

/* ── Favorites localStorage helpers ─────────────────────────────── */

interface FavoriteEntry { cacheKey: string; dishName: string; image: string; cuisine: string; savedAt: string }

function getFavorites(): FavoriteEntry[] {
  try { return JSON.parse(localStorage.getItem('recipe-favorites') || '[]'); } catch { return []; }
}
function isFavorited(dish: string): boolean {
  return getFavorites().some((f) => f.dishName.toLowerCase() === dish.toLowerCase());
}
function toggleFavorite(dish: string, image: string, cuisine: string): boolean {
  const favs = getFavorites();
  const idx = favs.findIndex((f) => f.dishName.toLowerCase() === dish.toLowerCase());
  if (idx >= 0) {
    favs.splice(idx, 1);
    localStorage.setItem('recipe-favorites', JSON.stringify(favs));
    return false;
  }
  favs.push({ cacheKey: dish.toLowerCase().trim().replace(/\s+/g, ' '), dishName: dish, image, cuisine, savedAt: new Date().toISOString() });
  localStorage.setItem('recipe-favorites', JSON.stringify(favs));
  return true;
}

/* ── Main Component ─────────────────────────────────────────────── */

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
  const [faved, setFaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const msgTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { if (!dishName) router.push('/'); }, [dishName, router]);
  useEffect(() => { if (dishName) setFaved(isFavorited(dishName)); }, [dishName]);

  useEffect(() => {
    if (!loading) return;
    let i = 0;
    setStatusMsg(LOADING_MESSAGES[0]);
    msgTimerRef.current = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      setStatusMsg(LOADING_MESSAGES[i]);
    }, 4000);
    return () => { if (msgTimerRef.current) clearInterval(msgTimerRef.current); };
  }, [loading]);

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
      const defaults: Record<number, string> = {};
      data.items.forEach((item: CartItem, i: number) => { defaults[i] = item.source; });
      setSelectedStores(defaults);
      setLoading(false);
    } catch (err: unknown) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }, [dishName]);

  useEffect(() => { if (dishName) fetchCook(); }, [dishName, fetchCook]);

  function changeServings(delta: number) {
    setServings((prev) => Math.max(1, Math.min(20, prev + delta)));
  }

  function selectStore(idx: number, store: string) {
    if (!cart) return;
    const item = cart.items[idx];
    const { meny, afood } = getStoreProducts(item);
    if (store === 'meny' && !meny) return;
    if (store === 'afood' && !afood) return;
    setSelectedStores((prev) => ({ ...prev, [idx]: store }));
  }

  function handleFavorite() {
    setFaved(toggleFavorite(dishName, dishImg, dishCuisine));
  }

  async function handleCopyList() {
    if (!cart) return;
    const lines = cart.items.map((item, i) => {
      const sel = selectedStores[i] || item.source;
      const { meny, afood } = getStoreProducts(item);
      const prod = sel === 'meny' ? meny : afood;
      const store = sel === 'meny' ? 'Meny' : 'aFood';
      const amt = fmtAmt(item.ingredient.amount, item.ingredient.unit);
      const price = prod?.price ? `, ${prod.price.toFixed(0)} kr` : '';
      return `- ${amt} ${item.ingredient.name} (${store}${price})`;
    });
    const text = `${dishName} (${servings} servings)\n\n${lines.join('\n')}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: dishName, text });
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* cancelled */ }
  }

  const scale = servings / baseServings;
  let total = 0, menyTotal = 0, afoodTotal = 0, itemCount = 0;
  if (cart) {
    cart.items.forEach((item, i) => {
      const sel = selectedStores[i] || item.source;
      const { meny, afood } = getStoreProducts(item);
      const rAmt = parseFloat(String(item.ingredient.amount));
      const rUnit = item.ingredient.unit || '';
      const prod = sel === 'meny' ? meny : afood;
      total += getEffectivePrice(prod, rAmt, rUnit);
      itemCount++;
      if (sel === 'meny') menyTotal += getEffectivePrice(prod, rAmt, rUnit);
      else afoodTotal += getEffectivePrice(prod, rAmt, rUnit);
    });
  }
  const trumf = (menyTotal * 0.01).toFixed(2);
  const eurobonus = Math.floor((total / 100) * 20);
  const sortedItems = cart
    ? cart.items.map((item, i) => ({ item, i })).sort((a, b) => (b.item.alt ? 2 : 1) - (a.item.alt ? 2 : 1))
    : [];

  if (!dishName) return null;

  return (
    <div className="pb-20">

      {/* ── Compact Header ─────────────────────────────────── */}
      <div className="px-6 pt-4 pb-4 border-b border-border">
        {/* Back row */}
        <div className="flex items-center justify-between mb-3">
          <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="size-4" /> Back
          </Link>
          <button
            type="button"
            onClick={handleFavorite}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm hover:bg-accent transition-colors cursor-pointer"
          >
            <Heart className={`size-4 ${faved ? 'fill-orange-500 text-orange-500' : 'text-muted-foreground'}`} />
            <span className={faved ? 'text-orange-600' : 'text-muted-foreground'}>{faved ? 'Saved' : 'Save'}</span>
          </button>
        </div>

        {/* Dish info row: thumbnail + name + metadata */}
        <div className="flex items-center gap-4">
          {dishImg && (
            <img
              src={dishImg.startsWith('http') || dishImg.startsWith('/') ? dishImg : '/' + dishImg}
              alt={dishName}
              className="size-14 rounded-xl object-cover bg-muted shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="text-lg font-semibold text-foreground truncate">{dishName}</h1>
              {dishCuisine && (
                <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-600 shrink-0 dark:bg-orange-950/30 dark:text-orange-400">
                  {dishCuisine}
                </span>
              )}
            </div>
            {cart && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Clock className="size-3" /> {cart.recipe.prep_time} prep</span>
                <span className="flex items-center gap-1"><Flame className="size-3" /> {cart.recipe.cook_time} cook</span>
                <span className="capitalize">{cart.recipe.difficulty}</span>
              </div>
            )}
          </div>

          {/* Servings stepper */}
          {cart && (
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
                <button
                  className="flex size-7 items-center justify-center rounded-md text-foreground transition-colors hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/20 cursor-pointer"
                  onClick={() => changeServings(-1)}
                  aria-label="Decrease servings"
                >
                  <Minus className="size-3.5" />
                </button>
                <span className="min-w-[24px] text-center text-sm font-semibold tabular-nums" aria-live="polite">{servings}</span>
                <button
                  className="flex size-7 items-center justify-center rounded-md text-foreground transition-colors hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/20 cursor-pointer"
                  onClick={() => changeServings(1)}
                  aria-label="Increase servings"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              <Users className="size-3.5 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Description */}
        {cart && <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{cart.recipe.description}</p>}
      </div>

      {/* ── Loading ────────────────────────────────────────── */}
      {loading && (
        <div className="px-6 pt-6" aria-label="Loading recipe">
          <p className="mb-4 animate-pulse text-center text-sm font-medium text-orange-600" role="status">{statusMsg}</p>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                <Skeleton className="size-9 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2.5 w-1/3" />
                </div>
                <Skeleton className="h-8 w-16 rounded-md" />
                <Skeleton className="h-8 w-16 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────── */}
      {error && !loading && (
        <div className="px-6 py-16 text-center">
          <p className="mb-4 text-sm text-muted-foreground">{error}</p>
          <button onClick={() => fetchCook()} className="rounded-lg bg-orange-600 px-5 py-2 text-sm font-medium text-white hover:bg-orange-700 cursor-pointer">
            Try again
          </button>
        </div>
      )}

      {/* ── Main Content: Two columns ──────────────────────── */}
      {cart && !loading && (
        <div className="px-6 pt-5 grid lg:grid-cols-[1fr_340px] gap-8">

          {/* ── LEFT: Shopping List (primary) ──────────────── */}
          <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-baseline gap-2">
                <h2 className="text-base font-semibold text-foreground">Shopping List</h2>
                <span className="text-sm text-muted-foreground">{cart.items.length} items</span>
              </div>
              <button
                type="button"
                onClick={handleCopyList}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
                {copied ? 'Copied' : 'Copy list'}
              </button>
            </div>

            {/* Dense table */}
            <div className="rounded-xl border border-border [&>*:first-child]:rounded-t-xl [&>*:last-child]:rounded-b-xl">
              {/* Column headers */}
              <div className="grid grid-cols-[minmax(120px,1fr)_1fr_1fr] bg-muted/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider">
                <span className="text-muted-foreground">Ingredient</span>
                <span className="px-2" style={{ color: 'var(--store-meny)' }}>Meny</span>
                <span className="px-2" style={{ color: 'var(--store-afood)' }}>aFood</span>
              </div>

              {/* Rows */}
              {sortedItems.map(({ item, i }) => (
                <ShoppingRow
                  key={i}
                  item={item}
                  originalIndex={i}
                  selectedStore={selectedStores[i] || item.source}
                  onSelectStore={selectStore}
                  scale={scale}
                  isScaled={servings !== baseServings}
                />
              ))}
            </div>

            {/* Unmatched */}
            {cart.unmatched && cart.unmatched.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Not available</h3>
                {cart.unmatched.map((u, idx) => (
                  <div key={idx} className="py-1.5 text-sm border-b border-border last:border-b-0">
                    <span className="font-medium text-foreground">{u.ingredient.name}</span>
                    <span className="text-muted-foreground"> &middot; {fmtAmt(u.ingredient.amount, u.ingredient.unit)}</span>
                    {u.suggestion && <span className="block text-xs text-muted-foreground/70 mt-0.5">{u.suggestion}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── RIGHT: Steps & Tips ────────────────────────── */}
          <div className="lg:sticky lg:top-14 lg:self-start lg:max-h-[calc(100dvh-112px)] lg:overflow-y-auto lg:pr-1" style={{ scrollbarWidth: 'thin' }}>
            {/* Steps */}
            <details open>
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground mb-3 [&::-webkit-details-marker]:hidden">
                <ChevronDown className="size-4 text-muted-foreground transition-transform [[open]>&]:rotate-180" />
                Recipe Steps
                <span className="text-xs font-normal text-muted-foreground">({cart.recipe.steps.length})</span>
              </summary>
              <ol className="space-y-3 pl-1 mb-6">
                {cart.recipe.steps.map((step, idx) => (
                  <li key={idx} className="flex gap-3 text-sm leading-relaxed">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-orange-50 text-[11px] font-semibold text-orange-600 dark:bg-orange-950/30 dark:text-orange-400">
                      {idx + 1}
                    </span>
                    <span className="text-muted-foreground pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </details>

            {/* Tips */}
            {cart.recipe.tips && cart.recipe.tips.length > 0 && (
              <details>
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground mb-3 [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="size-4 text-muted-foreground transition-transform [[open]>&]:rotate-180" />
                  Chef Tips
                </summary>
                <ul className="space-y-2 pl-1 mb-6">
                  {cart.recipe.tips.map((tip, idx) => (
                    <li key={idx} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                      <span className="text-orange-500 font-bold shrink-0">&bull;</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* Staples */}
            {cart.staples && cart.staples.length > 0 && (
              <details>
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground mb-3 [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="size-4 text-muted-foreground transition-transform [[open]>&]:rotate-180" />
                  Assumed at home
                  <span className="text-xs font-normal text-muted-foreground">({cart.staples.length})</span>
                </summary>
                <div className="space-y-1 pl-1">
                  {cart.staples.map((s, idx) => (
                    <div key={idx} className="text-sm text-muted-foreground">
                      {s.ingredient.name} &middot; {fmtAmt(s.ingredient.amount, s.ingredient.unit)}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      )}

      {/* ── Bottom Bar ─────────────────────────────────────── */}
      {cart && !loading && (
        <div className="sticky bottom-0 z-50 mt-6 border-t border-border bg-background/95 backdrop-blur-md px-6 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between">
            <span className="text-xl font-semibold text-foreground tabular-nums">~{Math.round(total * scale)} kr</span>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ backgroundColor: 'var(--store-meny)' }} />
                {trumf} Trumf
              </span>
              <span className="flex items-center gap-1">
                <Star className="size-3 text-[#000080]" fill="#000080" />
                {eurobonus} EB
              </span>
            </div>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {itemCount} items &middot; {Math.round(menyTotal * scale)} kr Meny &middot; {Math.round(afoodTotal * scale)} kr aFood
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Shopping Row ─────────────────────────────────────────────── */

interface ShoppingRowProps {
  item: CartItem;
  originalIndex: number;
  selectedStore: string;
  onSelectStore: (index: number, store: string) => void;
  scale: number;
  isScaled: boolean;
}

function ShoppingRow({ item, originalIndex, selectedStore, onSelectStore, scale, isScaled }: ShoppingRowProps) {
  const { meny, afood } = getStoreProducts(item);
  const rAmt = parseFloat(String(item.ingredient.amount));
  const rUnit = item.ingredient.unit || '';
  const scaledAmt = isNaN(rAmt) ? item.ingredient.amount : rAmt * scale;
  const tierColor = item.tier === 1 ? 'bg-green-500' : item.tier === 2 ? 'bg-amber-500' : 'bg-orange-500';

  const menyEc = meny ? estCost(meny.price, meny.cmpPrice, meny.cmpUnit, meny.wKg, rAmt, rUnit) : null;
  const afoodEc = afood ? estCost(afood.price, afood.cmpPrice, afood.cmpUnit, afood.wKg, rAmt, rUnit) : null;
  const menyPrice = menyEc?.est ?? meny?.price ?? null;
  const afoodPrice = afoodEc?.est ?? afood?.price ?? null;
  const menyCheaper = menyPrice !== null && afoodPrice !== null && menyPrice < afoodPrice;
  const afoodCheaper = menyPrice !== null && afoodPrice !== null && afoodPrice < menyPrice;

  return (
    <div className="grid grid-cols-[minmax(120px,1fr)_1fr_1fr] items-center border-b border-border last:border-b-0">
      {/* Ingredient */}
      <div className="flex items-center gap-2 px-3 py-2 min-w-0">
        <span className={`size-2 rounded-full shrink-0 ${tierColor}`} />
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground capitalize truncate">{item.ingredient.name}</div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {isScaled && <span className="line-through mr-1 text-muted-foreground/40">{fmtAmt(item.ingredient.amount, rUnit)}</span>}
            {fmtAmt(scaledAmt, rUnit)}
          </div>
        </div>
      </div>

      {/* Meny */}
      <ProductCell
        prod={meny}
        price={menyPrice}
        isEstimated={!!menyEc?.est}
        selected={selectedStore === 'meny'}
        cheapest={menyCheaper}
        category={item.ingredient.category}
        onClick={() => meny && onSelectStore(originalIndex, 'meny')}
      />

      {/* aFood */}
      <ProductCell
        prod={afood}
        price={afoodPrice}
        isEstimated={!!afoodEc?.est}
        selected={selectedStore === 'afood'}
        cheapest={afoodCheaper}
        category={item.ingredient.category}
        onClick={() => afood && onSelectStore(originalIndex, 'afood')}
      />
    </div>
  );
}

/* ── Product Cell ─────────────────────────────────────────────── */

interface ProductCellProps {
  prod: StoreProduct | null;
  price: number | null;
  isEstimated: boolean;
  selected: boolean;
  cheapest: boolean;
  category?: string;
  onClick: () => void;
}

function ProductCell({ prod, price, isEstimated, selected, cheapest, category, onClick }: ProductCellProps) {
  if (!prod) {
    return <div className="py-2 px-2 text-center text-xs text-muted-foreground/30">&mdash;</div>;
  }

  const imgSrc = prod.image || phSvg(category);
  const placeholder = phSvg(category);

  return (
    <div className="relative group/cell">
      <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-2 py-2 px-2 w-full min-w-0 transition-colors cursor-pointer ${
          selected ? 'bg-orange-50/70 dark:bg-orange-950/20' : 'hover:bg-accent/40'
        }`}
        aria-pressed={selected}
      >
        <img
          className="size-8 rounded-lg bg-muted object-contain shrink-0"
          src={imgSrc}
          alt=""
          loading="lazy"
          onError={(e) => { const el = e.target as HTMLImageElement; el.onerror = null; el.src = placeholder; }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground truncate leading-tight">{prod.name}</div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className={`text-sm tabular-nums ${
              selected ? 'font-bold text-orange-600' : cheapest ? 'font-semibold text-green-700 dark:text-green-400' : 'font-medium text-foreground'
            }`}>
              {isEstimated && '~'}{price !== null ? Math.round(price) : '\u2013'} kr
            </span>
            {selected && <Check className="size-3 text-orange-600 shrink-0" strokeWidth={3} />}
          </div>
        </div>
      </button>

      {/* Hover detail popup */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-full z-50 hidden group-hover/cell:block pb-2">
        <div className="bg-card border border-border rounded-xl shadow-lg p-3 w-56">
          <div className="flex gap-3">
            <img
              className="size-14 rounded-lg bg-muted object-contain shrink-0"
              src={imgSrc}
              alt={prod.name}
              onError={(e) => { const el = e.target as HTMLImageElement; el.onerror = null; el.src = placeholder; }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground leading-snug">{prod.name}</div>
              {prod.size && <div className="text-xs text-muted-foreground mt-0.5">{prod.size}</div>}
              <div className="text-sm font-bold text-foreground mt-1 tabular-nums">
                {prod.price ? prod.price.toFixed(0) + ' kr' : '\u2013'}
              </div>
            </div>
          </div>
          {prod.url && (
            <a
              href={prod.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 mt-2.5 w-full rounded-lg bg-accent hover:bg-accent/80 py-1.5 text-xs font-medium text-foreground transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              View product <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
