'use client';

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, ChevronRight, Loader2 } from 'lucide-react';
import { searchLocal, fetchMealDB, mergeResults, type SearchResult } from '@/lib/search';
import { dishes, CUISINE_COLORS, getFeaturedDishes } from '@/lib/dishes';
import { Logo } from '@/components/logo';

/* ── Helpers ─────────────────────────────────────────────────────── */

function highlight(text: string, query: string): ReactNode {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <span key={i} className="text-orange-600 font-semibold">{part}</span>
    ) : (
      part
    ),
  );
}

function cuisineColor(cuisine: string): string {
  return CUISINE_COLORS[cuisine] || CUISINE_COLORS.default;
}

const CUISINE_FLAG_CODES: Record<string, string> = {
  Thai: 'th',
  Korean: 'kr',
  Japanese: 'jp',
  Vietnamese: 'vn',
  Chinese: 'cn',
  Indian: 'in',
  Indonesian: 'id',
};

/* ── Component ───────────────────────────────────────────────────── */

interface SearchPageProps {
  descriptions?: Record<string, string>;
}

export function SearchPage({ descriptions = {} }: SearchPageProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);

  const cuisines = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of dishes) {
      counts.set(d.cuisine, (counts.get(d.cuisine) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, []);

  const topics = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of dishes) {
      counts.set(d.category, (counts.get(d.category) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, []);

  const featured = useMemo(() => getFeaturedDishes(4), []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setResults([]);
        setActiveIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navigateToDish = useCallback(
    (dish: { name: string; image?: string | null; cuisine?: string }) => {
      const params = new URLSearchParams({
        dish: dish.name,
        img: dish.image || '',
        cuisine: dish.cuisine || '',
      });
      router.push(`/recipe?${params.toString()}`);
    },
    [router],
  );

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    setActiveIndex(-1);
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    if (!value.trim() || value.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const localResults = searchLocal(value);
    setResults(localResults.slice(0, 7));
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const apiResults = await fetchMealDB(value, controller.signal);
        const merged = mergeResults(localResults, apiResults, value);
        setResults(merged);
      } catch { /* aborted */ } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (results.length === 0) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < results.length) navigateToDish(results[activeIndex]);
          else if (results.length > 0) navigateToDish(results[0]);
          break;
        case 'Escape':
          e.preventDefault();
          setResults([]);
          setActiveIndex(-1);
          break;
        case 'Tab':
          if (activeIndex >= 0 && activeIndex < results.length) {
            e.preventDefault();
            const dish = results[activeIndex];
            setQuery(dish.name);
            handleSearch(dish.name);
          }
          break;
      }
    },
    [results, activeIndex, navigateToDish, handleSearch],
  );

  useEffect(() => {
    if (activeIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('[data-result-item]');
      items[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setActiveIndex(-1);
    setLoading(false);
    inputRef.current?.focus();
  };

  return (
    <div className="flex min-h-[calc(100dvh-48px)] flex-col items-center justify-center px-6">
      <div className="w-full -mt-4">

        {/* ── Brand ──────────────────────────────────────────── */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="mb-4">
            <Logo size={40} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            What are you cooking<span className="text-orange-500">?</span>
          </h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {dishes.length} recipes &middot; real prices from Meny &amp; aFood
          </p>
        </div>

        {/* ── Search ──────────────────────────────────────────── */}
        <div ref={wrapperRef} className="relative mb-8 mx-auto max-w-xl">
          <div className="flex items-center gap-3 rounded-2xl bg-muted/50 border border-border px-5 py-4 transition-all focus-within:bg-background focus-within:border-orange-400/60 focus-within:ring-4 focus-within:ring-orange-50 dark:bg-muted/30 dark:focus-within:bg-background dark:focus-within:ring-orange-950/30">
            <Search className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={2} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search dishes... Pad Thai, \u0E1C\u0E31\u0E14\u0E44\u0E17\u0E22, \u30E9\u30FC\u30E1\u30F3"
              className="flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/60"
              autoComplete="off"
              spellCheck={false}
            />
            {loading && <Loader2 className="size-4 shrink-0 animate-spin text-orange-400" />}
            {query && !loading && (
              <button
                onClick={clearSearch}
                className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
                aria-label="Clear search"
                type="button"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Dropdown */}
          {results.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-border bg-background shadow-lg"
              style={{ maxHeight: '340px', overflowY: 'auto' }}
            >
              {results.map((dish, index) => (
                <button
                  key={`${dish.name}-${index}`}
                  data-result-item
                  type="button"
                  onClick={() => navigateToDish(dish)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer group ${
                    activeIndex === index ? 'bg-accent' : 'hover:bg-accent/50'
                  }`}
                >
                  {dish.image ? (
                    <img src={dish.image} alt="" className="size-9 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div
                      className="size-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: cuisineColor(dish.cuisine) }}
                    >
                      {dish.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate text-foreground">
                      {highlight(dish.name, query)}
                      {dish.nativeName && (
                        <span className="ml-1.5 text-xs text-muted-foreground font-normal">{dish.nativeName}</span>
                      )}
                    </div>
                    <div className="text-[11px] truncate text-muted-foreground">
                      {[dish.cuisine, dish.category].filter(Boolean).join(' \u00B7 ')}
                    </div>
                  </div>
                  <ChevronRight className="size-3 shrink-0 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Cuisines ────────────────────────────────────────── */}
        <div className="flex flex-wrap justify-center gap-1 mb-8">
          {cuisines.map(({ name }) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                setQuery(name);
                handleSearch(name);
                inputRef.current?.focus();
              }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] text-foreground/80 hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              {CUISINE_FLAG_CODES[name] && (
                <img
                  src={`https://flagcdn.com/${CUISINE_FLAG_CODES[name]}.svg`}
                  alt={`${name} flag`}
                  className="size-4 rounded-[2px] shrink-0 object-cover"
                />
              )}
              {name}
            </button>
          ))}
        </div>

        {/* ── Featured Dishes ─────────────────────────────────── */}
        {featured.length > 0 && (
          <div className="mb-8 mx-auto max-w-xl">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-3 text-center">
              Popular picks
            </p>
            <div className="grid grid-cols-4 gap-4">
              {featured.map((dish) => (
                <button
                  key={dish.name}
                  type="button"
                  onClick={() => navigateToDish(dish)}
                  className="group text-center cursor-pointer"
                >
                  <img
                    src={dish.image!}
                    alt={dish.name}
                    className="aspect-square w-full rounded-xl object-cover mb-2 transition-transform duration-200 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="text-xs font-medium text-foreground truncate group-hover:text-orange-600 transition-colors">
                    {dish.name}
                  </div>
                  {descriptions[dish.name] && (
                    <p className="text-[10px] leading-tight text-muted-foreground mt-0.5 line-clamp-2">
                      {descriptions[dish.name]}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Categories ──────────────────────────────────────── */}
        <div className="flex flex-wrap justify-center gap-2 mx-auto max-w-xl">
          {topics.map(({ name, count }) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                setQuery(name);
                handleSearch(name);
                inputRef.current?.focus();
              }}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50/60 dark:hover:border-orange-700 dark:hover:text-orange-400 dark:hover:bg-orange-950/30 cursor-pointer"
            >
              {name}
              <span className="ml-1 text-muted-foreground/60 tabular-nums">{count}</span>
            </button>
          ))}
        </div>

        {/* ── Footer ──────────────────────────────────────────── */}
        <div className="mt-10 text-center text-[11px] text-muted-foreground/60 mx-auto max-w-xl">
          Prices from Meny &amp; aFood &middot; Updated daily
        </div>
      </div>
    </div>
  );
}
