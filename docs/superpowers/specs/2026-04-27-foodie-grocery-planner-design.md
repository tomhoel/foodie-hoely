# Foodie — Grocery Planning Backend (Design Spec)

**Date:** 2026-04-27
**Status:** Approved (pending user review of this document)
**Author:** Tom + Claude
**Replaces:** The Next.js website portion of the existing repo

---

## 1. Vision

A multi-tenant Norwegian grocery planning backend that:

- Plans weekly meals from a household's cookbook + AI suggestions
- Translates each plan into a chain-optimized shopping list across MENY, Kiwi, and AFood
- Maximizes Trumf bonus earnings within hard budget constraints
- Tracks pantry through receipts, photo recognition, and lightweight monthly audits
- Learns each household's actual cooking patterns over time
- Stays operationally cheap (~$10–20/mo infra for first 100 households)

No frontend in v1. The backend exposes a clean REST surface that a future SPA, mobile app, or share-extension can consume.

---

## 2. Decisions log (from brainstorming)

| # | Decision | Choice |
|---|---|---|
| Q1 | Scope | Full vision: recipes ↔ shopping ↔ pantry ↔ Trumf ↔ budget ↔ usage ↔ learning |
| Q2 | Tenancy | Multi-tenant from day one. Household = tenant root. RLS on every per-household table. |
| Q3 | Budget model | Multi-tier hybrid: monthly cap + optional category sub-caps + envelopes for one-offs |
| Q4 | Personal-data ingestion | Trumf JSON API as primary path (token broker on Vercel Sandbox). GDPR JSON export upload as fallback. Email inbound dropped from v1. |
| Q5 | Recipe sources | User cookbook + AI-generated suggestions + receipt-inferred dishes + photo-recognized dishes |
| Q6 | Planning cadence | Sunday batch (canonical plan) + intra-week event-driven nudges (additive only) |
| Q7 | Store scope | MENY (NGData direct) + Kiwi (Kassalapp) + AFood (existing scraper). Spar/Joker easy to add later via same Kassalapp adapter. |
| Q8 | Optimization model | Hybrid: deterministic optimizer (hard constraints + numeric scoring) + AI orchestrator (recipe selection via tool-calling) + AI narrator (post-plan explanation). Stop count is a soft cost, not a hard cap. |
| Q9 | Ordering integration | A) produce list; B) AFood real cart deep-links + MENY product page links + Kiwi shop-in-store; D) receipt reconciliation closes the loop. C (cart auto-fill) parked. |
| Q10 | Pantry model | Receipts-driven trunk + decay model + manual corrections + photo recognition + targeted monthly audit |
| Q11 | AI providers | Vercel AI Gateway. Claude Sonnet 4.6 for planner. Gemini 3 Flash for vision. Haiku 4.5 for parsing/narration. `gemini-embedding-001` already in use, kept. |

---

## 3. Source-of-truth matrix (the non-negotiable rule)

Every data type has exactly one canonical source. No double-ingestion.

| Data type | Single source | Adapter |
|---|---|---|
| MENY catalog + prices + `is_offer` boolean | NGData direct (`platform-rest-prod.ngdata.no`) | `MenyDirectAdapter` (existing `meny-sync.ts`, extended) |
| Kiwi catalog + prices | Kassalapp (`store=KIWI`) | `KassalappAdapter` (new) |
| Kiwi `is_offer` boolean | Etilbudsavis (fuzzy match by `dealer_id + heading`) | `EtilbudsavisAdapter` |
| AFood catalog + prices + `is_offer` | Existing WooCommerce scraper | `AFoodAdapter` (existing `afood-sync.ts`) |
| Campaign windows (`run_from`/`run_till`/headings) — all chains | Etilbudsavis (squid v2 REST API) | `EtilbudsavisAdapter` |
| Per-user receipts (line items + EAN) | Trumf JSON API | `TrumfAdapter` (per-user, broker-managed) |
| Per-user Trumf bonus + personal offers | Trumf JSON API | Same `TrumfAdapter` |
| Cross-chain price comparison | Our own Postgres (joined on EAN) | (no adapter — pure DB query) |

What this explicitly kills:
- Ingesting MENY through Kassalapp.
- Deriving "is_offer" from Kassalapp's `price_history` (we agreed campaign windows come from etilbudsavis only).
- Calling Kassalapp `/products/ean/{ean}` for cross-chain comparison (our DB has the data; join on EAN).
- Email inbound for receipts (MENY/Kiwi don't email receipts; Trumf API is the only automated path).

---

## 4. Verified facts from research (April 2026)

These facts shape the design. If any change, the design must be re-validated.

### Kassalapp.no
- Auth: `Authorization: Bearer <key>`. Base: `https://kassal.app/api/v1`.
- Rate limit: **60 requests/minute** rolling, no daily cap observed. Response headers expose `X-RateLimit-Remaining`.
- Pagination max `size=100`. Laravel-style `meta`/`links`.
- Per-product fields: name, brand, vendor, ean, url, image, category tree, ingredients, current_price, weight, store, **price_history (last ~25)**, allergens, nutrition, labels.
- **No `is_offer` flag exists.** No standalone `/offers` endpoint.
- Per-chain filter: `store=MENY_NO|KIWI|SPAR_NO|JOKER_NO|COOP_NO|BUNNPRIS|ODA_NO`.
- Webhooks endpoint exists (`/webhooks`) — change-notification capable.
- Data freshness: MENY/KIWI/SPAR/JOKER refresh daily ~07:00 UTC.

### Etilbudsavis (Tjek squid v2)
- Base: `https://api.etilbudsavis.dk` (works for `.no`/`.se` content via `r_locale=nb_NO`).
- Auth: none required for v2 read endpoints (set a real `User-Agent`).
- Endpoints used: `/v2/dealers`, `/v2/catalogs`, `/v2/offers?catalog_id=...`, `/v2/offers/search`, `/v2/stores`.
- Offer fields: `id`, `heading`, `description`, `pricing.{price, pre_price, currency}`, `quantity.{unit, size, pieces}`, `images`, `run_from`, `run_till`, `dealer.{id, name}`, `catalog_id`. **No EAN.**
- Norwegian flyer cycle: new catalogs typically arrive Sun 18:00 → Mon 06:00 UTC.
- Observed safe rate: ~5 req/s.
- ToS: gray area; acceptable for low-frequency caching, fall back gracefully on 403.

### Trumf JSON API
- Base: `https://platform-rest-prod.ngdata.no/trumf/...`
- Auth: per-user bearer token (issued to first-party SPA / mobile app, not public OAuth).
- Bot protection: low-medium (no Cloudflare/Akamai), Azure Front Door + APIM only.
- Endpoints used:
  - `/trumf/husstand/transaksjoner?fra=YYYY-MM-DD&til=YYYY-MM-DD` — list transactions
  - `/trumf/husstand/transaksjoner/detaljer/{batchid}` — line items including **EAN, vareTekst, antall, belop**
  - `/trumf/medlemskap/transaksjoner/digitalkvittering/{id}` — digital receipt
  - `/trumf/medlemskap/...` and `/trumf/kundetilbud/...` — bonus + personal offers (discoverable via HAR)
- Schema is uniform across MENY/Kiwi/Spar/Joker.
- Session lifetime: web ~24h sliding; mobile-style refresh tokens 30–90d.
- ToS: prohibits scraping; we operate with explicit user consent, GDPR Art. 15 right-of-access argument.
- Datatilsynet history: NorgesGruppen fined NOK 5M (2020) for over-collection — handle conservatively.
- Reference implementations (proof of pattern): `ttyridal/trumf-data-fetch` (archived Nov 2025); `VemundFredriksen/TrumfReceiptAnalyzer` (active).

### Vercel platform (April 2026 status)
- AI Gateway: GA. Zero markup. Use via AI SDK with `provider/model` strings. `AI_GATEWAY_API_KEY`.
- Vercel Functions: Fluid Compute default; 300s default maxDuration, 800s on Pro. Active CPU pricing (idle await is cheap).
- Vercel Cron: GA, UTC only, HTTP GET, `Authorization: Bearer ${CRON_SECRET}` injected.
- Vercel Queues: public beta. Use for fan-out + durable retries.
- Vercel Workflow DevKit: available, built on Queues. Use for multi-step durable jobs.
- Vercel Sandbox: GA (Jan 2026). Firecracker microVMs, Chromium/Playwright supported. Per-execution pricing.
- Vercel Blob: GA (private storage public beta). EU region available.
- `vercel.json` deprecated, `vercel.ts` is the recommended config format.
- Region: `fra1` (Frankfurt) for EU residency + lowest Supabase EU latency.

### AI model lineup (verified live from AI Gateway)
| Model ID | $/M in | $/M out | Use |
|---|---|---|---|
| `anthropic/claude-sonnet-4.6` | $3.00 | $15.00 | Planner loop (tool-calling) |
| `anthropic/claude-haiku-4.5` | $1.00 | $5.00 | Parsing, narration, audit prompts |
| `google/gemini-3-flash` | $0.50 | $3.00 | Vision pipeline (Stage 1 + Stage 2) |
| `google/gemini-3.1-flash-lite-preview` | $0.25 | $1.50 | Cheap fallback for Haiku tasks |
| `google/gemini-embedding-001` | $0.20 | — | Embeddings (already in use) |

### Norwegian recipe imports
- ~85% of major Norwegian sites ship `schema.org/Recipe` JSON-LD: matprat.no, godt.no, mat.tv2.no, vg.no/mat, dagbladet.no/mat.
- Universal extraction: parse `<script type="application/ld+json">`, walk for `@type:"Recipe"` (handle `@graph` arrays). ~50 LOC.
- No Norwegian-specific ingredient NLP library exists. Use hybrid regex + LLM:
  - Regex for common cases: `^(\d+([.,/]\d+)?(\s*-\s*\d+)?)\s*(ss|ts|dl|l|g|kg|stk|kopp|klype|neve)?\s+(.+)$`
  - Norwegian unit table: `ss=15ml`, `ts=5ml`, `dl=100ml`, `klype≈0.5g`, `neve≈30g`, `stk=count`
  - LLM (Haiku 4.5) for fuzzy quantities (`noen`, `litt`, `etter smak`, `1-2`, `1/2`) and canonicalization
- Copyright stance: ingredients + numbered procedural steps + attribution back is the industry norm and safe under Norwegian/EU originality threshold. Don't store long prose, personal stories, or original photos without attribution.

### Vision (food photos)
- `google/gemini-3-flash` leads the OpenFoodNet fine-grained ingredient benchmark (~84% F1 vs Sonnet 4.6 ~81% vs GPT-5.1 ~82%).
- Two-stage prompt beats one-stage by ~12pp F1: Stage 1 = pure visual extraction (no priors); Stage 2 = pantry-constrained reconciliation.
- Confidence calibration: `high|med|low` with required `reasoning` is well-calibrated. Map to 0.9 / 0.6 / 0.3.
- Quantity estimation: prefer **portion buckets** (`small/med/large` → 80/150/250g per food class) over precise grams.
- Multi-angle photos in one request improves precision ~8pp.
- Cost: ~$0.0018/photo end-to-end. ~$54/mo for 1000 households at 30 photos/HH/mo.

### Storefront ordering
- **MENY**: SPA, no public add-to-cart URL. Best we can do: deep-link to product page (`https://meny.no/varer/...`).
- **Kiwi**: NOT a storefront. Info site only. No nationwide online ordering. We surface prices but do not promise online cart.
- **AFood**: WooCommerce. `?add-to-cart={id}&quantity={n}` works natively. Real cart deep-links.

---

## 5. Architecture

### 5.1 System overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        FOODIE BACKEND (Vercel)                       │
│                                                                      │
│  ┌────────────┐   ┌──────────────┐   ┌─────────────────────────┐    │
│  │ INGESTION  │──▶│ INTELLIGENCE │──▶│   API SURFACE           │    │
│  │ (cron+wh)  │   │ (optimizer + │   │ (REST, future-frontend) │    │
│  └─────┬──────┘   │  AI planner) │   └─────────────────────────┘    │
│        │          └──────┬───────┘              │                    │
│        ▼                 ▼                      ▼                    │
│  ┌────────────────────────────────────────────────────┐              │
│  │   SUPABASE POSTGRES (RLS, pgvector)  +  BLOB       │              │
│  └────────────────────────────────────────────────────┘              │
│        ▲                                       ▲                     │
│        │                                       │                     │
│  ┌─────┴────────┐                       ┌──────┴────────┐            │
│  │ TRUMF TOKEN  │                       │ NOTIFICATIONS │            │
│  │ BROKER       │                       │ (email out)   │            │
│  │ (Sandbox)    │                       └───────────────┘            │
│  └──────────────┘                                                    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
       │              │              │            │             │
       ▼              ▼              ▼            ▼             ▼
   kassalapp    etilbudsavis    Trumf API    AI Gateway    AFood/MENY
                                                            (deep-links)
```

### 5.2 External dependencies

| External | Our use | Auth | Failure mode |
|---|---|---|---|
| kassalapp.no | Kiwi catalog + prices | Bearer key | 60 rpm — backoff + cache |
| Etilbudsavis (Tjek squid v2) | Weekly offer flyers, 7 chains, campaign windows | None | Fall back to last-known offers if 5xx; abandon gracefully on 403 |
| Trumf JSON API | Per-user line-item receipts, bonus, personal offers | Per-user bearer (broker-managed) | Token expires → user re-auth; alert after 24h failure |
| AFood (WooCommerce) | Existing scraper kept; cart deep-links | None | Existing retry helpers |
| AI Gateway | Sonnet 4.6 / Gemini 3 Flash / Haiku 4.5 / embeddings | `AI_GATEWAY_API_KEY` | Multi-provider fallback configured per call |
| Vercel Blob | Photos, GDPR export uploads, generated PDFs | Env-injected | EU region |
| Supabase | Source of truth + RLS + pgvector | Service key (server) / anon (future client) | Single SLA dependency — accepted |

### 5.3 Canonical data flow — Sunday batch

```
SAT 23:00 UTC   etilbudsavis-sync      → fetch new catalogs for upcoming week
SUN 02:00 UTC   kassalapp-sync         → refresh Kiwi prices for tracked EANs
SUN 06:00 UTC   plan-week-cron         → enqueue plan-household jobs (1 per active HH)
                  │
                  ▼
                Vercel Queue: plan-household
                  │
                  ▼ (per-HH worker, Fluid Compute, maxDuration 600s, 2GB)
                ┌────────────────────────────────────────────────┐
                │ 1. Refresh pantry (decay + receipts + photos)  │
                │ 2. Load preferences + budget + cookbook        │
                │ 3. Filter offers to HH's chain scope           │
                │ 4. AI planner loop (Claude Sonnet 4.6):        │
                │    a. Propose 5-7 recipes for next 7 days      │
                │    b. Tool: cost_recipe(id) → optimizer        │
                │    c. Tool: build_shopping_list(plan)          │
                │    d. If !budget_ok → revise (max 3 iters)     │
                │ 5. Lock plan, persist                          │
                │ 6. AI narration (Haiku 4.5): plain-language    │
                │ 7. waitUntil: send email summary               │
                └────────────────────────────────────────────────┘
```

### 5.4 Mid-week reactivity (event-driven)

| Trigger | Handler | Outcome |
|---|---|---|
| New offer detected (cron diff) | `check_swap_value` per HH | Email nudge if savings Δ > threshold |
| Trumf receipt arrives | `reconcile_receipt` → update pantry | Silent (logged) |
| Photo uploaded (CLI/API) | Vision pipeline → propose deltas | Notification with structured confirm |
| Audit reply received | `parse_corrections` → update pantry | Silent (logged) |
| Budget threshold hit | `replan_remaining_week` | Email warning |
| Recipe URL imported | `import_recipe` (JSON-LD → NLP) | Email "saved to cookbook" |
| Trumf token expiring | Broker re-auth flow | Email "reconnect Trumf" |

The locked weekly plan is the contract; mid-week is **additive only** — no silent rewrites.

---

## 6. Data model

### 6.1 Tables KEPT from existing schema

| Table | Change |
|---|---|
| `products` | Add `chain_code` (`'MENY'\|'KIWI'\|'AFOOD'`) and `is_specialty` (bool). Keep existing `is_offer`, `compare_price` columns (populated for chains whose API surfaces this natively: MENY + AFood). |
| `product_embeddings` | Unchanged |
| `price_history` | Unchanged (append-only) |
| `ingredient_mappings` | Unchanged (Norwegian + Thai aliases already valuable) |
| `ingredient_embeddings` | Unchanged |
| `sync_log` | Add `adapter_name` column |

### 6.2 New tables

#### Tenancy
```sql
households (id, name, created_at, settings jsonb)
household_members (household_id, user_id, role 'owner'|'member', joined_at)
```

#### Pantry
```sql
pantry_items (
  id, household_id, ean, product_name, canonical_ingredient_id,
  quantity_grams, confidence (0..1), last_seen_source 'receipt'|'photo'|'manual',
  last_seen_at, expected_lifetime_days, decayed_at, created_at, updated_at
)
pantry_corrections (
  id, household_id, pantry_item_id, before_grams, after_grams,
  reason 'audit'|'reply'|'photo_correction', corrected_at
)
```

#### Cookbook & recipes
```sql
recipes (
  id, household_id (nullable for shared/public), title, source_url,
  hero_image_url, total_time_minutes, servings, instructions text[],
  origin 'imported_url'|'photo'|'ai_generated'|'inferred_from_receipt',
  created_at, last_cooked_at, times_cooked
)
recipe_ingredients (
  id, recipe_id, raw_text, quantity_grams, unit_original,
  canonical_ingredient_id, importance 'critical'|'enhancing'|'garnish'|'optional',
  substitutes jsonb
)
recipe_embeddings (recipe_id, embedding vector(768))
```

#### Offers (etilbudsavis canonical)
```sql
dealers (
  id, code 'MENY'|'KIWI'|'SPAR'|'JOKER'|'AFOOD',
  trumf_eligible bool, etilbudsavis_dealer_id text
)
catalogs (
  id, dealer_id, etilbudsavis_catalog_id text unique, published_at,
  run_from, run_till, fetched_at
)
offers (
  id, catalog_id, dealer_id, heading, description, price, pre_price,
  unit, size_grams, image_url, run_from, run_till,
  matched_product_id (fk products, nullable),
  matched_ean text (nullable), matched_at, match_confidence (0..1)
)
```

#### Plans, lists, transactions
```sql
meal_plans (
  id, household_id, week_start (date), status 'draft'|'locked'|'completed',
  generated_at, locked_at, ai_reasoning text
)
meal_plan_items (
  id, meal_plan_id, recipe_id, planned_for (date),
  meal_type 'lunch'|'dinner', status 'planned'|'cooked'|'skipped'|'swapped',
  cooked_confirmed_via 'photo'|'receipt'|'manual'|'inferred'
)
shopping_lists (
  id, meal_plan_id, status 'draft'|'sent'|'partially_purchased'|'completed',
  total_estimated_nok, total_trumf_estimate_nok,
  store_stop_count, generated_at
)
shopping_list_items (
  id, shopping_list_id, product_id, suggested_dealer_id,
  quantity_grams, estimated_price, alternative_dealer_ids[],
  deep_link_url, status 'todo'|'bought'|'skipped'|'substituted',
  earns_trumf bool
)
transactions (
  id, household_id, trumf_batch_id text unique,
  dealer_id, purchased_at, total_nok, trumf_earned_nok, trumf_extra_nok,
  fetched_at
)
transaction_lines (
  id, transaction_id, ean, name_raw, quantity, line_total_nok,
  reconciled_to_shopping_item_id (nullable)
)
```

#### Budget
```sql
budgets (
  id, household_id, period 'weekly'|'monthly',
  total_nok, applies_from, applies_until, is_active
)
budget_categories (
  id, budget_id, category text, cap_nok, current_spend_nok
)
budget_envelopes (
  id, budget_id, name, available_nok, used_nok, expires_at
)
```

#### Photos & vision
```sql
dish_photos (
  id, household_id, blob_url, captured_at, received_at,
  matched_meal_plan_item_id (nullable),
  vision_status 'queued'|'processing'|'awaiting_user'|'confirmed',
  ai_inference jsonb, user_corrections jsonb
)
```

#### Learning
```sql
cooking_signatures (
  household_id, recipe_canonical_name, observed_ingredients jsonb,
  typical_portions_per_person, observation_count, last_observed_at
)
audits (
  id, household_id, generated_at, items jsonb,
  status 'pending_reply'|'partially_replied'|'closed', responded_at
)
```

#### Trumf credentials (sensitive)
```sql
trumf_credentials (
  household_id, refresh_token_encrypted bytea, access_token_encrypted bytea,
  access_token_expires_at, refresh_token_expires_at,
  last_successful_refresh, last_failure_reason, last_failure_at
)
```
- Encryption: pgsodium `crypto_aead_det_encrypt` with per-row nonce, key from Supabase Vault.
- Service role only; no RLS read for users (system-managed).

#### Ops
```sql
ai_usage (
  id, household_id, model, input_tokens, output_tokens,
  usd_cost, called_at, purpose
)
system_alerts (
  id, severity, source, message, context jsonb, created_at, resolved_at
)
```

### 6.3 RLS policy pattern

Applied uniformly to all per-household tables:

```sql
alter table <name> enable row level security;

create policy "household_member_read" on <name>
  for select using (
    household_id in (
      select household_id from household_members where user_id = auth.uid()
    )
  );

create policy "household_member_write" on <name>
  for all using (
    household_id in (
      select household_id from household_members
      where user_id = auth.uid() and role in ('owner', 'member')
    )
  );
```

Service role bypasses RLS for cron / system jobs.

---

## 7. Ingestion subsystem

### 7.1 Adapter interface

```typescript
// src/ingestion/adapter.interface.ts
export interface IngestionAdapter {
  readonly name: string;
  readonly capabilities: AdapterCapability[];   // ['products', 'prices', 'offers']
  readonly chains: ChainCode[];

  syncProducts(opts: SyncOptions): Promise<SyncResult>;
  refreshPrices(eans: string[]): Promise<PriceUpdate[]>;
  fetchOffers(dealerCode: ChainCode): Promise<Offer[]>;  // EtilbudsavisAdapter only
  healthCheck(): Promise<{ ok: boolean; lastSuccess: Date; rateLimitRemaining?: number }>;
}
```

### 7.2 Adapters & cron schedule

| Adapter | Cron (UTC) | Job type | Concerns |
|---|---|---|---|
| `MenyDirectAdapter` | `0 1 * * *` | Full product refresh | Polite 100ms gaps, custom UA |
| `KassalappAdapter` | `0 2 * * *` | Full Kiwi product refresh | Token bucket 50 rpm (10 rpm safety margin) |
| `AFoodAdapter` | `0 3 * * *` | Existing pattern | Existing retry helpers |
| `EtilbudsavisAdapter` | `0 23 * * 6` + `0 12 * * 1` | New catalogs + late-Monday catch | 5 rps cap, ETag/If-Modified-Since |
| `TrumfAdapter` | per-HH every 6h or on-demand | Receipts + offers + bonus | Token broker manages refresh |

### 7.3 Idempotency

Every adapter writes via natural keys, never blind insert:

- Products: `(source, external_id)` unique
- Offers: `etilbudsavis_offer_id` unique
- Transactions: `trumf_batch_id` unique
- Catalogs: `etilbudsavis_catalog_id` unique

Re-running a sync is always safe.

### 7.4 Failure handling

- Each adapter logs to `sync_log` with status + error message
- 3 consecutive failures → `system_alerts` row → outbound email
- Etilbudsavis 5xx for >24h → fall back to last-fetched catalog
- Trumf auth failure → mark `trumf_credentials.last_failure_reason='token_expired'` → email user

### 7.5 File organization

```
src/ingestion/
├── adapters/
│   ├── meny-direct.adapter.ts
│   ├── kassalapp.adapter.ts
│   ├── afood.adapter.ts
│   ├── etilbudsavis.adapter.ts
│   └── trumf.adapter.ts
├── adapter.interface.ts
└── orchestrator.ts
```

`orchestrator.ts` is the registry: given `(chain, dataType)` it routes to the right adapter. **No file calls more than one external source.**

---

## 8. Intelligence layer

### 8.1 Optimizer (deterministic)

**Input:** candidate meal plan (recipe IDs + servings) + household state (pantry, budget remaining, chain scope, taste profile)

**Output:**
```typescript
interface PlanCost {
  feasible: boolean;
  reason?: string;
  total_nok: number;
  trumf_estimate_nok: number;
  store_stops: number;
  store_breakdown: Array<{
    dealer: ChainCode;
    items: ShoppingItem[];
    subtotal: number;
    trumf_earned: number;
  }>;
  per_recipe: Array<{ recipe_id: string; cost_nok: number; }>;
  warnings: string[];
  pantry_savings_nok: number;
}
```

**Algorithm:**
1. Resolve `recipe.ingredients` → candidate products (same `canonical_ingredient_id`), filtered to chain scope + allergens.
2. Subtract pantry items with sufficient confidence.
3. For each remaining ingredient, enumerate `(dealer × product)` options.
4. Apply offer overlay from `offers` table (campaign window + price).
5. Solve store assignment minimizing:
   ```
   Σ(item_price)
   + soft_stop_penalty × n_stops  (default -10 NOK per stop, tunable per HH)
   - Σ(trumf_bonus_earned)
   - Σ(offer_savings)
   + waste_risk_penalty
   ```
   Heuristic shortcut for lists < 30 items: enumerate all store-split combinations.
6. Validate hard constraints (budget cap, allergens). Fail → `feasible: false` with reason.

Pure code. Tested with fixtures. ~50ms per invocation. No LLM call.

### 8.2 AI Planner (Claude Sonnet 4.6, tool-calling loop)

**Tools:**
```typescript
tools = {
  list_eligible_recipes: () => Recipe[],
  get_recipe_details: (id) => RecipeDetails,
  cost_recipe: (id, servings) => RecipeCost,
  cost_plan: (recipe_ids[], servings) => PlanCost,
  get_pantry_summary: () => PantryItem[],
  get_active_offers: () => Offer[],
  get_household_preferences: () => Preferences,
  get_recent_history: (weeks: 4) => CompletedMeal[],
  finalize_plan: (recipe_ids[], reasoning) => void,
}
```

**Loop:**
1. System prompt + household summary + tools available
2. Model proposes initial 5–7 recipes, calls `cost_plan`
3. If `feasible: false`, model reads reason and revises
4. Max 3 iterations, then `finalize_plan`
5. AI reasoning stored in `meal_plans.ai_reasoning`

**Cost:** ~10-15K input + 3K output ≈ $0.05/HH/week without caching, ~$0.005/HH/week with prompt caching. **~$20/mo at 1000 households.**

### 8.3 Vision pipeline (Gemini 3 Flash, two-stage)

```
Photo → Vercel Blob (private, 30-day retention)
      → Job queued to vision-process
      → Stage 1: pure visual extraction (Gemini Flash, low temp, no priors)
      → Stage 2: pantry-constrained reconciliation (with planned recipe + pantry context)
      → Result stored in dish_photos.ai_inference
      → Notification with structured "tap-to-confirm" reply format
      → User reply parsed (Haiku 4.5) → pantry updated
      → cooking_signatures upserted
```

Cost: ~$0.0018/photo end-to-end.

### 8.4 Receipt reconciler

For each new `transaction_lines` row:
1. EAN match → look up product → identify canonical ingredient → add quantity to pantry (`last_seen_source='receipt'`, confidence=0.95)
2. Plan match → check `meal_plan_items` planned ±2 days → find recipe with highest ingredient overlap → if overlap > 60%, mark `cooked` with `cooked_confirmed_via='receipt'`
3. Update `transactions.trumf_earned_nok` for budget tracking
4. Unmatched items → `unknown_purchases` queue → AI guesses recipe periodically

### 8.5 Cooking signature learner

After each confirmed dish (photo, receipt, or manual):
- Upsert `cooking_signatures` keyed by `(household_id, recipe_canonical_name)`
- Track ingredient frequency, typical quantities, garnish habits, substitutions
- After ~20 confirmations, vision Stage 2 prompt accuracy improves materially because it knows *this household's* version of common dishes.

### 8.6 Audit generator (monthly cron + on-demand)

1. Compute `audit_priority = importance × uncertainty × recipe_dependency` per pantry item
2. Pick top 10
3. Haiku 4.5 drafts the email body in user's voice/locale
4. Sent via outbound email
5. Reply parsed → corrections committed → `audits.status='closed'`

### 8.7 Narrator (post-plan)

- Separate Haiku 4.5 call after plan locks
- Inputs: locked plan, optimizer breakdown, recent history, current offers
- Output: 2-3 paragraph plain-language explanation referencing real numbers
- Stored on `meal_plans` and surfaced in the weekly email

---

## 9. Orchestration

### 9.1 Cron schedule

| When (UTC) | Endpoint | Purpose |
|---|---|---|
| `0 1 * * *` | `/api/cron/sync-meny` | Daily MENY product refresh |
| `0 2 * * *` | `/api/cron/sync-kassalapp` | Daily Kiwi product refresh |
| `0 3 * * *` | `/api/cron/sync-afood` | Daily AFood scrape |
| `0 23 * * 6` | `/api/cron/sync-etilbudsavis` | Saturday-night flyer pull |
| `0 12 * * 1` | `/api/cron/sync-etilbudsavis` | Monday-noon catch-up |
| `0 6 * * 0` | `/api/cron/plan-week` | Sunday batch enqueuer |
| `0 */6 * * *` | `/api/cron/trumf-refresh` | Per-HH Trumf refresh enqueuer |
| `0 9 1 * *` | `/api/cron/audit-month` | Monthly audit enqueuer |
| `0 * * * *` | `/api/cron/offer-diff` | Hourly offer change detection |

All cron handlers are **thin enqueuers**: they fan out to Vercel Queues and return in under 1 second.

### 9.2 Vercel Queues

| Queue | Purpose | Retry policy |
|---|---|---|
| `plan-household` | Per-HH weekly plan worker | 3 retries, exponential |
| `vision-process` | Photo → ingredient inference | 2 retries |
| `trumf-refresh` | Per-HH receipt + offer pull | 3 retries; on auth fail → user email |
| `receipt-reconcile` | Match new receipt to plan + pantry | 5 retries |
| `email-out` | Outbound smoothing | 5 retries; DLQ on permanent fail |
| `adapter-sync` | Per-source ingestion jobs | 3 retries |

### 9.3 Vercel Workflow DevKit

Used for the Sunday plan because it has multiple steps that benefit from durable retry:

```typescript
// src/workflows/plan-household.workflow.ts
export const planHousehold = workflow({
  name: 'plan-household',
  steps: {
    refreshPantry:    step(async (ctx) => { /* decay + receipts + photos */ }),
    loadPreferences:  step(async (ctx) => { /* cookbook, budget, signatures */ }),
    filterOffers:     step(async (ctx) => { /* chain scope filter */ }),
    aiPlanLoop:       step({ retries: 2, timeout: '5m' }, async (ctx) => { /* … */ }),
    persistPlan:      step(async (ctx) => { /* DB write */ }),
    aiNarrate:        step({ retries: 1 }, async (ctx) => { /* Haiku call */ }),
    sendEmail:        step({ retries: 5 }, async (ctx) => { /* outbound */ }),
  },
});
```

If `aiPlanLoop` succeeds but `sendEmail` flakes, only the email step retries.

---

## 10. Auth & multi-tenancy

### 10.1 Auth provider

- **v1**: Supabase Auth, email magic link (passwordless)
- **v1.5**: BankID added (reused from Trumf broker flow)
- JWT custom claim: `household_id` populated via DB trigger on first login

### 10.2 Authorization model

```
auth.users  →  household_members (M:N)  →  households  →  per-HH tables
```

RLS pattern (Section 6.3) applied to every per-household table.

### 10.3 Onboarding flow (Phase 2)

1. `POST /api/auth/signup` with email
2. Magic link sent
3. User clicks → JWT minted, household auto-created
4. Welcome email with Trumf connect URL + setup checklist
5. Trumf connect once → first sync triggers

---

## 11. Trumf token broker

The trickiest subsystem. Designed for scale, security, recoverability.

### 11.1 Connect flow

```
USER clicks "Connect Trumf"
   │
   ▼
/api/trumf/connect/start
   │ - generate one-time session token
   │ - store in trumf_connect_session table
   │ - launch Vercel Sandbox
   ▼
VERCEL SANDBOX (Firecracker microVM)
   │ - Playwright launches headless Chromium
   │ - Navigates to www.trumf.no/login
   │ - Provides callback URL for BankID redirect
   │   (BankID itself happens in user's actual browser)
   │ - On success, captures bearer + refresh tokens
   │ - Encrypts (pgsodium) + writes to trumf_credentials
   │ - Sandbox dies
   ▼
Subsequent calls (no Sandbox):
   │
   ▼
/api/queue/trumf-refresh consumer
   │ - read trumf_credentials
   │ - if access expired, POST to NGData refresh endpoint
   │ - call /trumf/husstand/transaksjoner
   │ - upsert transactions + transaction_lines
   │ - enqueue receipt-reconcile per new tx
```

### 11.2 Why Vercel Sandbox

- Pay per use (~$2-5/mo total for 1000 users at re-auth ~once per quarter)
- Ephemeral by design — no long-lived secrets on disk
- No reused IP fingerprint (each microVM is fresh)
- No DevOps

### 11.3 Failure handling

| Failure | Detection | Action |
|---|---|---|
| Refresh token expires | NGData 401 on refresh | Mark `trumf_credentials.last_failure_reason='token_expired'`, email user |
| BankID step fails during connect | Sandbox returns error | Email user with retry link |
| NGData 5xx | Worker throws | Queue retries, alert after 3 fails |
| User revokes access | All endpoints 401 | Same as token expired |
| Rate limit | 429 | Backoff, spread refresh times |

### 11.4 GDPR-export fallback

`POST /api/trumf/import-gdpr-export` accepts the JSON file from `trumf.no/personvern/bestill-innsyn`. Same parser, same downstream pipeline. Lower freshness (30-day SLA) but zero credential storage.

---

## 12. API surface

REST routes, JSON, auth via Supabase JWT (Bearer) unless noted.

```
# Auth & identity
POST   /api/auth/signup
GET    /api/me
GET    /api/households/current
PATCH  /api/households/current/settings

# Cookbook
GET    /api/recipes
POST   /api/recipes/import-url            { url }
POST   /api/recipes/import-photo          { blob_id }
POST   /api/recipes                       { manual recipe }
PATCH  /api/recipes/:id
DELETE /api/recipes/:id

# Pantry
GET    /api/pantry
PATCH  /api/pantry/:id                    { quantity_grams }
POST   /api/pantry/audit/run              # trigger on-demand audit

# Plans + shopping
GET    /api/plans/current
GET    /api/plans/:weekStart
POST   /api/plans/regenerate              # force re-run for current week
POST   /api/plans/:id/lock
GET    /api/plans/:id/shopping-list       # full list with deep links per dealer
PATCH  /api/shopping/items/:id            { status }

# Budget
GET    /api/budget/current
POST   /api/budget                        { period, total_nok, categories[] }
PATCH  /api/budget/categories/:id

# Trumf
POST   /api/trumf/connect/start           # returns sandbox URL
GET    /api/trumf/status
POST   /api/trumf/import-gdpr-export      # multipart upload
POST   /api/trumf/disconnect

# Photos (direct upload to Blob)
POST   /api/photos/upload-url             # returns signed Blob upload URL
POST   /api/photos/notify                 { blob_id, hint? }
GET    /api/photos/:id

# Webhooks (no JWT, signature-verified)
POST   /api/webhooks/kassalapp            # product changes (optional, if subscribed)

# Cron (no JWT, Cron-Auth bearer)
GET    /api/cron/*
```

---

## 13. Phasing

### Phase 0 — Demolition & reorganization (Week 1)
- Delete `app/`, `components/`, `lib/`, `hooks/`, `public/` (Next.js website code)
- Rip out `app/recipe/`, `app/favorites/`, `components/search-page.tsx`, etc.
- Move `src/sync/*` → `src/ingestion/adapters/*` per new structure
- Add `src/ingestion/adapter.interface.ts` and `orchestrator.ts`
- Create migration `005_planning_core.sql` (all new tables from §6.2 with `household_id` columns and RLS policies enabled-but-permissive in Phase 1; tightened in Phase 2)
- Wire `vercel.ts` (replacing `vercel.json`)
- Outcome: clean repo, schema ready, no functional change beyond structure

**Auth note:** Phase 1 uses the Supabase **service role key** (server-side, in env vars) for all DB writes. RLS policies are *defined* in Phase 0 but bypassed by service role — this lets us validate the policies' SQL without blocking development. Phase 2 introduces real user-scoped JWTs and exercises the RLS path end-to-end.

### Phase 1 — Single-household MVP (Weeks 2–5)

End-to-end loop working for *just you*, no auth surface, no frontend.

- **Week 2**: Adapters (Etilbudsavis + extended MENY direct + Kassalapp)
- **Week 3**: Optimizer + recipe import (URL → JSON-LD → ingredient NLP)
- **Week 4**: AI planner loop + Trumf integration (Phase-1 mode: capture bearer token from your logged-in browser via DevTools, paste into a local `pnpm trumf-set-token` CLI; refresh token captured the same way every ~30 days. Skips Vercel Sandbox + BankID flow until Phase 2.) + receipt reconciler
- **Week 5**: Vision pipeline + audit generator + first real Sunday batch sent to your inbox

CLI tools (no frontend) for Phase 1 inputs:
- `pnpm photo path/to/dinner.jpg "made tom kha gai"`
- `pnpm audit-reply` (opens YAML editor)
- `pnpm trumf-import path/to/export.json`
- `pnpm recipe-import https://matprat.no/...`

By end of Phase 1: every Sunday morning you receive a fully-realized weekly plan email derived from real Trumf receipts, real pantry inference, real offers. **Eat from this for 4 weeks before Phase 2.**

### Phase 2 — Multi-tenant hardening (Weeks 6–9)
- Supabase Auth wiring + JWT custom claims
- RLS audit (all tables, all policies, fuzzed)
- Onboarding flow (signup → welcome email → Trumf connect)
- Trumf broker on Vercel Sandbox (vs. local during Phase 1)
- Outbound email (Resend or Postmark) on `noreply@foodie.app`
- Telemetry, cost tracking per household, error alerting
- Rate limiting on user-facing endpoints (Upstash Redis)
- Onboard 2-3 friend households

### Phase 3 — Frontend (out of scope here, intentionally enabled)
- API surface designed for SPA consumption
- iOS Share Extension for "save recipe"
- Web app (separate Next.js project consuming this API)

---

## 14. Testing strategy

### Layer 1 — Unit tests (`vitest`)
- Optimizer math (50+ fixtures: empty pantry, all-on-offer, no orderable chain, allergen filter, store-stop thresholds)
- Norwegian ingredient NLP (golden cases for `2 ss soyasaus`, `1/2 dl kokosmelk`, `noen blader koriander`, `klype salt`)
- Trumf JSON parser (against `VemundFredriksen/TrumfReceiptAnalyzer` fixtures + sanitized real GDPR export)
- Etilbudsavis offer matcher (known headings → expected EAN matches)
- Pantry decay model (time-based expiry, confidence degradation)
- Receipt reconciler (0/1/multiple plan match scenarios)
- Budget category enforcement (envelope/category/cap math)

### Layer 2 — Adapter integration tests (recorded fixtures)
- VCR-style HTTP recording per adapter, `__fixtures__/` dirs
- Kassalapp: 5 scenarios (search, EAN lookup, paginated, rate limit, 5xx)
- Etilbudsavis: catalog list + offer list + dealer list (real Norwegian data)
- Trumf: sanitized GDPR export + sanitized live API capture
- MENY direct (NGData): search + product detail
- AFood: existing test pattern preserved

### Layer 3 — AI contract tests (golden outputs with semantic checks)
- Planner loop: fixed inputs → plan must contain N recipes, total cost in budget, all chains in scope, `finalize_plan` called
- Vision pipeline: 10-photo fixture set → ≥80% expected ingredients identified at high/med confidence
- Recipe extractor: 20 Norwegian URLs → valid `Recipe` shape
- Narrator: must mention specific savings number from optimizer (no hallucinated numbers)

Run with temperature 0 + prompt caching. Failure threshold: any drop below 90% pass rate triggers CI fail.

### Layer 4 — End-to-end smoke (synthetic household)
- `synthetic-household.fixture.ts` defines known starting state
- Single test runs entire Sunday batch through workflow runtime
- Asserts: plan generated, shopping list produced, email queued, all DB invariants hold
- Runs in CI on every PR

### Layer 5 — Live validation
- Weekly: eat from Phase 1 plan, log discrepancies in `feedback` table
- Monthly: review prediction accuracy (planned vs cooked, receipt-reconciled vs expected)
- Tune optimizer weights, vision prompts, decay-model lifetimes from real data

### Pre-merge CI checklist
- [ ] `vitest run` all green
- [ ] All adapters: ≥1 fixture-replay test passing
- [ ] AI golden tests pass at ≥90%
- [ ] Schema migrations dry-run on Supabase shadow DB
- [ ] No new external API calls outside adapter interface (lint rule)
- [ ] No new direct LLM calls outside intelligence layer (lint rule)

---

## 15. Observability & ops

- **OpenTelemetry via `@vercel/otel`** on every Function (auto-traces external HTTP, AI Gateway, Supabase)
- **Structured logs**: `pino` with `{ household_id, request_id, adapter, duration_ms, cost_usd }`
- **Cost tracking**: `ai_usage` table per call → dashboard for per-household economics
- **Alerts** (initially → email):
  - Adapter 3 consecutive failures
  - AI golden test failure on a deploy
  - Trumf token expired > 24h
  - Budget catastrophe (planning blew through hard constraint)
  - Per-household AI cost > $0.50/month (runaway detection)
- **Health endpoint**: `GET /api/health` returns adapter status + last successful runs + queue depths

---

## 16. Security & GDPR

- **Trumf credentials**: pgsodium per-row encryption, key from Supabase Vault, never readable from anon
- **Webhook auth**: signature verification or Basic Auth + IP allowlist; Cron via `Authorization: Bearer ${CRON_SECRET}`
- **Rate limiting** on user-facing endpoints: Upstash Redis token-bucket, per-user
- **GDPR**:
  - All data EU-resident (Supabase EU, Vercel `fra1`, Vercel Blob EU)
  - `GET /api/me/export` returns full JSON dump (Art. 15)
  - `DELETE /api/me` cascades all household data (Art. 17)
  - Receipt line items kept 24 months max, then aggregated and lines purged
  - Datatilsynet's 2020 NorgesGruppen fine (NOK 5M, over-collection) → minimal-data principle enforced
- **Secrets**: Vercel env vars (synced via `vercel env pull` for local), nothing in git, `.env.local` gitignored

---

## 17. Open risks & mitigations

| Risk | Mitigation |
|---|---|
| Trumf API breaks (auth or schema) | Adapter interface isolates; GDPR-export fallback path; Zod schema validation; alert on first parse failure |
| Etilbudsavis ToS challenge | Cache aggressively, polite UA, low frequency, abandon gracefully on 403 |
| AI cost runaway | Per-household cost alerting; prompt caching; model-routing heuristic — start every plan run with Haiku 4.5; promote to Sonnet 4.6 only if Haiku fails to converge in 3 iterations OR optimizer reports `feasible: false` after Haiku's `finalize_plan` |
| Datatilsynet scrutiny on receipt data | User-consented, line items purged after 24 months, never shared, opt-in audit logs accessible to user |
| Vision quality gap on Norwegian dishes | Cooking-signature learner closes gap over time; confidence-based human-in-the-loop early on |
| Kassalapp pricing change / shutdown | Adapter swap is a config flip; fallback to extending NGData adapter for Kiwi if needed |
| MENY NGData schema drift | Smoke test in cron sync; Zod validation on response |
| Vercel Queues GA timing (currently beta) | Pin SDK version; if breaking change, fall back to Inngest or Trigger.dev |

---

## 18. References

### Verified live (research, April 2026)
- Kassalapp API: `https://kassal.app/api/v1` (probed with provided key)
- Etilbudsavis squid v2: `https://api.etilbudsavis.dk/v2/...`
- Trumf JSON API: `https://platform-rest-prod.ngdata.no/trumf/...`
- Vercel AI Gateway models: `https://ai-gateway.vercel.sh/v1/models`

### Community projects (proof of pattern)
- [`ttyridal/trumf-data-fetch`](https://github.com/ttyridal/trumf-data-fetch) (archived 2025-11)
- [`VemundFredriksen/TrumfReceiptAnalyzer`](https://github.com/VemundFredriksen/TrumfReceiptAnalyzer) (active, Jan 2026)
- [`olejorgenb/trumf_receipt_tools`](https://github.com/olejorgenb/trumf_receipt_tools)
- [`okanten/norgesgruppen-api-wrapper`](https://github.com/okanten/norgesgruppen-api-wrapper)
- [`olgasafonova/tilbudstrolden-mcp`](https://github.com/olgasafonova/tilbudstrolden-mcp) (etilbudsavis MCP)
- [`hhursev/recipe-scrapers`](https://github.com/hhursev/recipe-scrapers) (matprat.no + godt.no supported)
- [`zebzolino/MenyPy`](https://github.com/zebzolino/MenyPy)

### Vercel docs
- [AI Gateway](https://vercel.com/docs/ai-gateway)
- [Vercel Functions / Fluid Compute](https://vercel.com/docs/functions)
- [Vercel Cron](https://vercel.com/docs/cron-jobs)
- [Vercel Queues](https://vercel.com/docs/queues)
- [Vercel Workflow DevKit](https://vercel.com/docs/workflow)
- [Vercel Sandbox](https://vercel.com/docs/sandbox)
- [Vercel Blob](https://vercel.com/docs/blob)
- [`vercel.ts` config](https://vercel.com/docs/project-configuration/vercel-ts)

### Norwegian domain
- [MENY digital kvittering](https://meny.no/kundefordeler/digital-kvittering)
- [Trumf personvern/innsyn](https://www.trumf.no/personvern)
- [WooCommerce add-to-cart URL docs](https://woocommerce.com/document/quick-guide-to-woocommerce-add-to-cart-urls/)
- [Datatilsynet 20/03046 (Trumf fine)](https://gdprhub.eu/index.php?title=Datatilsynet_%28Norway%29_-_20%2F03046)

---

## 19. What this design explicitly does NOT do (v1)

- No frontend — backend + CLI only in Phase 1, REST in Phase 2
- No CloudMailin / email inbound (CLI/API ingestion replaces it)
- No MENY cart auto-fill (parked: option C from Q9)
- No Spar/Joker chains (easy to add later via same Kassalapp adapter)
- No Coop/Rema/Bunnpris (no Trumf, out of scope per Q7)
- No mobile app, no iOS Share Extension (Phase 3)
- No nutrition tracking dashboard (data is captured, but not surfaced as a v1 feature)
- No recipe rating / social features
- No grocery delivery integration beyond AFood's WooCommerce cart links
