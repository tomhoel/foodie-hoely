import Fuse from 'fuse.js';
import { dishes, type Dish } from './dishes';

export interface SearchResult extends Dish {
  _score: number;
  _api?: boolean;
  time?: string;
}

// Create Fuse instance for fuzzy search
const fuse = new Fuse(dishes, {
  keys: [
    { name: 'name', weight: 0.5 },
    { name: 'nativeName', weight: 0.2 },
    { name: 'tags', weight: 0.2 },
    { name: 'cuisine', weight: 0.1 },
  ],
  threshold: 0.4,
  includeScore: true,
  minMatchCharLength: 2,
});

export function scoreMatch(name: string, query: string): number {
  const n = name.toLowerCase();
  const qr = query.toLowerCase();
  if (n === qr) return 100;
  if (n.startsWith(qr)) return 85;
  if (qr.length > 2 && n.includes(qr)) return 70;
  const words = qr.split(/\s+/);
  if (words.length > 1 && words.every((w) => n.includes(w))) return 55;
  return 0;
}

export function searchLocal(query: string): SearchResult[] {
  if (!query.trim() || query.length < 2) return [];
  const exactResults = dishes
    .map((d) => {
      const sc = Math.max(scoreMatch(d.name, query), d.nativeName ? scoreMatch(d.nativeName, query) : 0);
      return sc > 0 ? { ...d, _score: sc } : null;
    })
    .filter((d): d is SearchResult => d !== null);
  const fuseResults = fuse.search(query).map((r) => ({
    ...r.item,
    _score: Math.round(20 + (1 - (r.score ?? 1)) * 50),
  }));
  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (const d of exactResults.sort((a, b) => b._score - a._score)) {
    const k = d.name.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      merged.push(d);
    }
  }
  for (const d of fuseResults) {
    const k = d.name.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      merged.push(d);
    }
  }
  return merged.sort((a, b) => b._score - a._score);
}

export async function fetchMealDB(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const r = await fetch(
    `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`,
    { signal },
  );
  const d = await r.json();
  return (d.meals || []).map((m: any) => ({
    name: m.strMeal,
    cuisine: m.strArea || '',
    category: m.strCategory || '',
    tags: m.strTags || '',
    image: m.strMealThumb || null,
    _api: true,
    _score: 0,
  }));
}

export function mergeResults(
  local: SearchResult[],
  api: SearchResult[],
  query: string,
): SearchResult[] {
  const apiByName = new Map<string, SearchResult>();
  for (const d of api) {
    const k = d.name.toLowerCase();
    if (!apiByName.has(k)) apiByName.set(k, d);
  }
  const seen = new Set<string>();
  const all: SearchResult[] = [];
  for (const d of local) {
    const k = d.name.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      const apiMatch = apiByName.get(k);
      all.push(
        apiMatch
          ? {
              ...d,
              image: d.image || apiMatch.image,
              time: apiMatch.time || d.time,
            }
          : d,
      );
    }
  }
  for (const d of api) {
    const k = d.name.toLowerCase();
    if (!seen.has(k)) {
      let sc = scoreMatch(d.name, query);
      if (sc === 0) sc = 25;
      seen.add(k);
      all.push({ ...d, _score: sc });
    }
  }
  all.sort((a, b) => (b._score || 0) - (a._score || 0));
  return all.slice(0, 7);
}
