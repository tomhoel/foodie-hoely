# Next.js Migration + Animate-UI Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the static HTML site to a Next.js App Router project with shadcn/ui and an animate-ui sidebar, preserving all existing functionality (search page, recipe shopping page, API endpoint).

**Architecture:** Next.js 16 App Router with Server Components by default, Client Components only where interactivity is needed (search, recipe page). The sidebar provides navigation structure. The existing `api/cook.ts` Vercel function becomes a Next.js Route Handler. The existing `src/` backend code (recipe generator, matcher, DB client) stays untouched and is imported directly.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, animate-ui sidebar, Fuse.js (client-side search), DM Sans (Google Fonts via next/font)

---

## File Structure

```
app/
  layout.tsx            -- Root layout: sidebar + font + providers
  page.tsx              -- Home page: search bar (Client Component)
  recipe/
    page.tsx            -- Recipe shopping page (Client Component)
  api/
    cook/
      route.ts          -- POST handler (migrated from api/cook.ts)
components/
  app-sidebar.tsx       -- Sidebar config (menu items, branding)
  search-page.tsx       -- Client component: search input + dropdown + hints
  recipe-page.tsx       -- Client component: recipe shopping UI
  logo.tsx              -- SVG bowl logo component
public/
  img/                  -- Moved from landing/img/ (static recipe images)
lib/
  dishes.ts             -- Dish database (extracted from index.html)
  search.ts             -- Search helpers (scoreMatch, mergeResults, etc.)
```

The existing `src/` directory (backend: generator, matcher, DB, etc.) stays exactly as-is. Only `api/cook.ts` moves to `app/api/cook/route.ts`.

---

### Task 1: Initialize Next.js project in-place

**Files:**
- Create: `app/layout.tsx`, `app/page.tsx`
- Create: `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`
- Modify: `package.json` (add Next.js deps, scripts)
- Modify: `tsconfig.json` (Next.js paths)
- Remove: `vercel.json` (Next.js handles routing natively)

- [ ] **Step 1: Install Next.js + React + Tailwind**

```bash
npm install next@latest react@latest react-dom@latest
npm install -D tailwindcss @tailwindcss/postcss postcss
```

- [ ] **Step 2: Add Next.js scripts to package.json**

Add to `scripts`:
```json
"dev": "next dev --turbopack",
"build": "next build",
"start": "next start"
```

- [ ] **Step 3: Create `next.config.ts`**

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow TheMealDB images
  images: {
    remotePatterns: [
      { hostname: 'www.themealdb.com' },
    ],
  },
};

export default nextConfig;
```

- [ ] **Step 4: Create `postcss.config.mjs`**

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

- [ ] **Step 5: Create `app/globals.css`**

```css
@import 'tailwindcss';
```

- [ ] **Step 6: Update `tsconfig.json`**

Update for Next.js App Router compatibility. Keep existing `src/` paths working. Add path alias `@/*` pointing to project root.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 7: Create minimal `app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import './globals.css';

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' });

export const metadata: Metadata = {
  title: 'Hoely',
  description: 'Thai & Asian recipes, real prices',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Create placeholder `app/page.tsx`**

```tsx
export default function Home() {
  return <div>Hoely - coming soon</div>;
}
```

- [ ] **Step 9: Move images to `public/img/`**

```bash
mv landing/img public/img
```

- [ ] **Step 10: Verify dev server starts**

```bash
npm run dev
```

Expected: Next.js dev server at http://localhost:3000 with placeholder page.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: initialize Next.js 16 App Router with Tailwind"
```

---

### Task 2: Set up shadcn/ui + animate-ui sidebar

**Files:**
- Create: `components/ui/sidebar.tsx` (via animate-ui CLI)
- Create: `components/ui/*.tsx` (shadcn primitives installed by sidebar)
- Modify: `app/layout.tsx` (add SidebarProvider)
- Create: `components/app-sidebar.tsx`
- Modify: `app/globals.css` (shadcn CSS variables)

- [ ] **Step 1: Initialize shadcn/ui**

```bash
npx shadcn@latest init
```

Select: New York style, Zinc color, CSS variables = yes.

- [ ] **Step 2: Install animate-ui sidebar**

```bash
npx shadcn@latest add https://animate-ui.com/r/sidebar.json
```

This installs the sidebar component and all its dependencies (button, separator, tooltip, sheet, etc.).

- [ ] **Step 3: Create `components/app-sidebar.tsx`**

```tsx
'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { Search, UtensilsCrossed, ShoppingCart, Heart } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { title: 'Search', url: '/', icon: Search },
  { title: 'Recipes', url: '/recipes', icon: UtensilsCrossed },
  { title: 'Shopping List', url: '/cart', icon: ShoppingCart },
  { title: 'Favorites', url: '/favorites', icon: Heart },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-orange-600 text-white font-bold text-sm">
                  H
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">hoely</span>
                  <span className="text-xs text-muted-foreground">Thai & Asian recipes</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigate</SidebarGroupLabel>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild isActive={pathname === item.url}>
                  <Link href={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="sm">
              <span className="text-xs text-muted-foreground">Prices from Meny & aFood</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
```

- [ ] **Step 4: Install lucide-react**

```bash
npm install lucide-react
```

- [ ] **Step 5: Update `app/layout.tsx` with SidebarProvider**

```tsx
import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import './globals.css';

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' });

export const metadata: Metadata = {
  title: 'Hoely',
  description: 'Thai & Asian recipes, real prices',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} font-sans antialiased`}>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <header className="flex h-14 items-center gap-2 border-b px-4">
              <SidebarTrigger />
            </header>
            <main className="flex-1">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Verify sidebar renders**

```bash
npm run dev
```

Expected: Page loads with animated sidebar on left, trigger button in header, placeholder content.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add shadcn/ui + animate-ui sidebar"
```

---

### Task 3: Extract dish database and search logic to shared modules

**Files:**
- Create: `lib/dishes.ts`
- Create: `lib/search.ts`

- [ ] **Step 1: Create `lib/dishes.ts`**

Extract the entire `localDishes` array and `CC` (cuisine colors) map from `landing/index.html` into a typed TypeScript module. This is a large data file.

```ts
export interface Dish {
  name: string;
  cuisine: string;
  category: string;
  tags: string;
  image: string | null;
}

export const CUISINE_COLORS: Record<string, string> = {
  Thai: '#E8590C',
  Korean: '#D14E0A',
  Japanese: '#B84500',
  Vietnamese: '#059669',
  Chinese: '#C44408',
  Indian: '#D97706',
  Indonesian: '#9A3412',
  default: '#9A3412',
};

const T = 'https://www.themealdb.com/images/media/meals/';

export const dishes: Dish[] = [
  // Copy the entire localDishes array from landing/index.html lines 168-348
  // Update image paths: "img/xxx.jpg" -> "/img/xxx.jpg" (add leading slash for public dir)
  // ... (all ~130 dishes)
];
```

Image paths must change from `"img/red-curry.jpg"` to `"/img/red-curry.jpg"` since they now serve from `public/`.

- [ ] **Step 2: Create `lib/search.ts`**

Extract search helper functions from `landing/index.html`:

```ts
import Fuse from 'fuse.js';
import { dishes, type Dish } from './dishes';

export interface SearchResult extends Dish {
  _score: number;
  _api?: boolean;
  time?: string;
}

const fuse = new Fuse(dishes, {
  keys: [
    { name: 'name', weight: 0.6 },
    { name: 'tags', weight: 0.25 },
    { name: 'cuisine', weight: 0.15 },
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
      const sc = scoreMatch(d.name, query);
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
    if (!seen.has(k)) { seen.add(k); merged.push(d); }
  }
  for (const d of fuseResults) {
    const k = d.name.toLowerCase();
    if (!seen.has(k)) { seen.add(k); merged.push(d); }
  }
  return merged.sort((a, b) => b._score - a._score);
}

export async function fetchMealDB(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const r = await fetch(
    `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`,
    { signal }
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

export function mergeResults(local: SearchResult[], api: SearchResult[], query: string): SearchResult[] {
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
      all.push(apiMatch ? { ...d, image: d.image || apiMatch.image, time: apiMatch.time || d.time } : d);
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
```

- [ ] **Step 3: Install fuse.js**

```bash
npm install fuse.js
```

- [ ] **Step 4: Commit**

```bash
git add lib/dishes.ts lib/search.ts
git commit -m "feat: extract dish database and search logic to shared modules"
```

---

### Task 4: Build the search page (home)

**Files:**
- Create: `components/search-page.tsx`
- Create: `components/logo.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create `components/logo.tsx`**

Extract the SVG bowl logo from `landing/index.html` lines 111-135 into a React component.

```tsx
export function Logo({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Steam wisps */}
      <path d="M28 22 Q30 16 28 10" stroke="#E8590C" strokeWidth="2" strokeLinecap="round" opacity=".35">
        <animate attributeName="d" values="M28 22 Q30 16 28 10;M28 22 Q26 15 28 8;M28 22 Q30 16 28 10" dur="3s" repeatCount="indefinite" />
      </path>
      <path d="M40 20 Q42 13 40 6" stroke="#E8590C" strokeWidth="2.5" strokeLinecap="round" opacity=".5">
        <animate attributeName="d" values="M40 20 Q42 13 40 6;M40 20 Q38 12 40 4;M40 20 Q42 13 40 6" dur="2.5s" repeatCount="indefinite" />
      </path>
      <path d="M52 22 Q54 16 52 10" stroke="#E8590C" strokeWidth="2" strokeLinecap="round" opacity=".35">
        <animate attributeName="d" values="M52 22 Q54 16 52 10;M52 22 Q50 15 52 8;M52 22 Q54 16 52 10" dur="3.5s" repeatCount="indefinite" />
      </path>
      {/* Bowl body */}
      <path d="M12 36 C12 36 10 56 28 64 C36 68 44 68 52 64 C70 56 68 36 68 36Z" fill="#E8590C" />
      <ellipse cx="40" cy="36" rx="30" ry="8" fill="#D14E0A" />
      <ellipse cx="40" cy="36" rx="26" ry="5.5" fill="#E8590C" />
      <ellipse cx="40" cy="37" rx="22" ry="4" fill="#F5A060" opacity=".6" />
      {/* Chopsticks */}
      <line x1="54" y1="18" x2="36" y2="44" stroke="#3D2B1F" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="60" y1="20" x2="42" y2="46" stroke="#3D2B1F" strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="40" cy="66" rx="10" ry="2.5" fill="#C44408" />
    </svg>
  );
}
```

- [ ] **Step 2: Create `components/search-page.tsx`**

A Client Component that replicates the search page functionality using React state and Tailwind classes matching the existing design tokens (`--accent: #E8590C`, warm surfaces, etc.). Port all the search, dropdown, keyboard navigation, and hint logic from `landing/index.html`.

This is the largest component. It should:
- Use `useState` for query, results, loading, active index
- Use `useRef` for abort controller and debounce timer
- Use `useRouter` from `next/navigation` for `router.push('/recipe?...')`
- Call `searchLocal()` immediately on input, debounce `fetchMealDB()` at 300ms
- Render dropdown with dish rows (image or avatar fallback, name with highlight, meta)
- Support keyboard navigation (ArrowUp/Down, Enter, Escape, Tab)
- Show random hints at bottom
- Auto-focus input on mount

- [ ] **Step 3: Update `app/page.tsx`**

```tsx
import { SearchPage } from '@/components/search-page';

export default function Home() {
  return <SearchPage />;
}
```

- [ ] **Step 4: Verify search page works**

```bash
npm run dev
```

Expected: Search page renders inside the sidebar layout. Typing shows local results immediately, API results after debounce. Clicking a dish navigates to `/recipe?dish=...`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: build search page with sidebar layout"
```

---

### Task 5: Migrate the API route

**Files:**
- Create: `app/api/cook/route.ts`
- Remove: `api/cook.ts` (old Vercel function)

- [ ] **Step 1: Create `app/api/cook/route.ts`**

Convert the Vercel serverless function to a Next.js Route Handler. The logic stays identical, just the request/response API changes.

```ts
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
```

- [ ] **Step 2: Delete old `api/cook.ts`**

```bash
rm api/cook.ts
rmdir api
```

- [ ] **Step 3: Delete `vercel.json`**

No longer needed — Next.js handles routing natively.

```bash
rm vercel.json
```

- [ ] **Step 4: Verify API works**

```bash
curl -X POST http://localhost:3000/api/cook \
  -H "Content-Type: application/json" \
  -d '{"dish":"Pad Thai","servings":4}'
```

Expected: JSON response with recipe, items, staples (or error about missing Supabase if not configured).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: migrate API endpoint to Next.js Route Handler"
```

---

### Task 6: Build the recipe shopping page

**Files:**
- Create: `components/recipe-page.tsx`
- Create: `app/recipe/page.tsx`

- [ ] **Step 1: Create `components/recipe-page.tsx`**

A Client Component that replicates all recipe page functionality:
- Reads `dish`, `img`, `cuisine` from URL search params via `useSearchParams()`
- Calls `POST /api/cook` on mount
- Manages state: cart data, servings, selected stores per item, loading/error
- Renders: hero section, loading skeleton, shopping cards with Meny/aFood comparison, store selection, servings stepper, staples/steps/tips collapsibles, bottom bar with totals
- Port all helper functions: `estCost`, `toUnit`, `fmtAmt`, `phSvg`

Style with Tailwind classes that match the existing design tokens.

- [ ] **Step 2: Create `app/recipe/page.tsx`**

```tsx
import { Suspense } from 'react';
import { RecipePage } from '@/components/recipe-page';

export default function Recipe() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading...</div>}>
      <RecipePage />
    </Suspense>
  );
}
```

`Suspense` is required because `useSearchParams()` needs it.

- [ ] **Step 3: Verify full flow works**

1. Go to http://localhost:3000
2. Search for "Pad Thai"
3. Click the result
4. Should navigate to `/recipe?dish=Pad%20Thai&...`
5. Recipe page should load, call API, show shopping list

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: build recipe shopping page with store comparison"
```

---

### Task 7: Clean up old files

**Files:**
- Remove: `landing/` directory (all HTML files, gen scripts)
- Keep: `public/img/` (already moved in Task 1)

- [ ] **Step 1: Remove old landing files**

```bash
rm -rf landing/
```

- [ ] **Step 2: Update `.gitignore`**

Add `.next` to gitignore:

```
.next
```

- [ ] **Step 3: Verify everything still works**

```bash
npm run dev
```

Full flow: search -> pick dish -> recipe page with sidebar visible on all pages.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove old static HTML landing files"
```

---

## Notes

- The existing `src/` backend code is NOT modified. It's imported directly by the Route Handler.
- The `landing/gen-images.mjs` and `landing/regen-images.mjs` scripts can be moved to a `scripts/` directory if you want to keep them, or deleted since the images are already generated.
- The sidebar items for "Recipes", "Shopping List", and "Favorites" are placeholder navigation — those pages can be built later.
- `dotenv` is not needed in Next.js — it reads `.env` files automatically.
