'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { searchLocal, fetchMealDB, mergeResults, type SearchResult } from '@/lib/search';
import { dishes, CUISINE_COLORS } from '@/lib/dishes';
import { Logo } from '@/components/logo';

/* ── Helpers ─────────────────────────────────────────────────────── */

function highlight(text: string, query: string): ReactNode {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <span key={i} className="text-orange-600 font-semibold">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function getRandomHints(count: number) {
  const shuffled = [...dishes].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function cuisineColor(cuisine: string): string {
  return CUISINE_COLORS[cuisine] || CUISINE_COLORS.default;
}

/* ── Component ───────────────────────────────────────────────────── */

export function SearchPage() {
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
  const [hints] = useState(() => getRandomHints(5));

  // Auto-focus the search input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close dropdown on click outside
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
    (dish: SearchResult) => {
      const params = new URLSearchParams({
        dish: dish.name,
        img: dish.image || '',
        cuisine: dish.cuisine || '',
      });
      router.push(`/recipe?${params.toString()}`);
    },
    [router],
  );

  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);
      setActiveIndex(-1);

      // Cancel any pending API request
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      if (!value.trim() || value.length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }

      // Immediate local search
      const localResults = searchLocal(value);
      setResults(localResults.slice(0, 7));

      // Debounced API search
      setLoading(true);
      debounceRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          const apiResults = await fetchMealDB(value, controller.signal);
          const merged = mergeResults(localResults, apiResults, value);
          setResults(merged);
        } catch {
          // Aborted or network error — keep local results
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    [],
  );

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
          if (activeIndex >= 0 && activeIndex < results.length) {
            navigateToDish(results[activeIndex]);
          } else if (results.length > 0) {
            navigateToDish(results[0]);
          }
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

  // Scroll active item into view in the dropdown
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
    <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] px-4" style={{ backgroundColor: '#FAFAF8' }}>
      <div className="w-full max-w-xl flex flex-col items-center gap-6 py-12">
        {/* ── Logo & branding ──────────────────────────────────── */}
        <div className="flex flex-col items-center gap-2">
          <Logo size={80} />
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#1A1A18' }}>
            hoely
          </h1>
          <p className="text-sm" style={{ color: '#7A7A72' }}>
            Thai &amp; Asian recipes, real prices
          </p>
        </div>

        {/* ── Search input + dropdown ──────────────────────────── */}
        <div ref={wrapperRef} className="relative w-full">
          <div
            className="flex items-center gap-3 px-4 py-3 bg-white transition-shadow focus-within:shadow-lg"
            style={{
              borderRadius: '16px',
              border: '1px solid rgba(0,0,0,0.06)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            {/* Search icon */}
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#AEAEA6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>

            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search dishes..."
              className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-[#AEAEA6]"
              style={{ color: '#1A1A18' }}
              autoComplete="off"
              spellCheck={false}
            />

            {/* Loading spinner */}
            {loading && (
              <svg
                className="animate-spin shrink-0"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#E8590C"
                strokeWidth="2.5"
              >
                <path d="M12 2 A10 10 0 0 1 22 12" strokeLinecap="round" />
              </svg>
            )}

            {/* Clear button */}
            {query && !loading && (
              <button
                onClick={clearSearch}
                className="shrink-0 p-0.5 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Clear search"
                type="button"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#AEAEA6"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          {/* ── Dropdown results ──────────────────────────────── */}
          {results.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute left-0 right-0 mt-2 bg-white overflow-hidden z-50"
              style={{
                borderRadius: '16px',
                border: '1px solid rgba(0,0,0,0.06)',
                boxShadow: '0 12px 40px rgba(0,0,0,0.10)',
                maxHeight: '420px',
                overflowY: 'auto',
              }}
            >
              {results.map((dish, index) => (
                <button
                  key={`${dish.name}-${index}`}
                  data-result-item
                  type="button"
                  onClick={() => navigateToDish(dish)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors group"
                  style={{
                    backgroundColor: activeIndex === index ? '#F5F5F0' : 'transparent',
                  }}
                >
                  {/* Dish image or avatar fallback */}
                  {dish.image && dish.image.startsWith('http') ? (
                    <img
                      src={dish.image}
                      alt={dish.name}
                      className="w-10 h-10 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
                      style={{ backgroundColor: cuisineColor(dish.cuisine) }}
                    >
                      {dish.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium truncate" style={{ color: '#1A1A18' }}>
                      {highlight(dish.name, query)}
                    </div>
                    <div className="text-xs truncate" style={{ color: '#AEAEA6' }}>
                      {[dish.cuisine, dish.category].filter(Boolean).join(' · ')}
                    </div>
                  </div>

                  {/* Arrow icon */}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#AEAEA6"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Hint buttons ─────────────────────────────────────── */}
        <div className="flex flex-wrap justify-center gap-2 mt-2">
          {hints.map((dish) => (
            <button
              key={dish.name}
              type="button"
              onClick={() => {
                setQuery(dish.name);
                handleSearch(dish.name);
                inputRef.current?.focus();
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-full transition-colors hover:bg-orange-50"
              style={{
                backgroundColor: '#F5F5F0',
                color: '#7A7A72',
                border: '1px solid rgba(0,0,0,0.04)',
              }}
            >
              {dish.name}
            </button>
          ))}
        </div>

        {/* ── Footer ───────────────────────────────────────────── */}
        <p className="text-xs mt-6" style={{ color: '#AEAEA6' }}>
          Prices from Meny &amp; aFood
        </p>
      </div>
    </div>
  );
}
