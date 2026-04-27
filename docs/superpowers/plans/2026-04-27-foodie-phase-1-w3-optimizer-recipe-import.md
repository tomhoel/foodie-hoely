# Foodie Phase 1 Week 3 — Optimizer + Recipe Import Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build (1) the deterministic optimizer that takes a recipe set and returns a chain-optimized shopping list with cost + Trumf estimate, and (2) the recipe import pipeline (URL → schema.org JSON-LD → Norwegian-aware ingredient parser → DB).

**Architecture:** Recipe import is a pure HTTP pipeline: cheerio extracts `<script type="application/ld+json">` blocks from any Norwegian recipe site, walks the JSON for `@type:"Recipe"`, normalizes to our `Recipe`/`RecipeIngredient` shape. The Norwegian ingredient parser is regex-only in Plan C (LLM enrichment deferred to Plan D where it co-locates with the AI planner). The optimizer is pure deterministic code — given a meal plan + pantry + offer overlay, it solves the store-split assignment to minimize `price - trumf - savings + soft_stop_penalty`, validating hard constraints (budget). All outputs are JSON; CLI commands wrap them.

**Tech Stack:** TypeScript 5.7, native fetch, `cheerio` (new — HTML parsing), zod, vitest, Supabase via existing `getSupabase()` factory.

**Spec reference:** docs/superpowers/specs/2026-04-27-foodie-grocery-planner-design.md (sections 4 — recipe import, 8.1 — optimizer)
**Predecessor:** phase-1-w2-complete

**Prerequisite (parallel — does not block Tasks 1-9):** Apply migration 005_planning_core.sql. Tasks 6 (recipes repo) and 10 (CLI integration) hit live DB.

## Tasks

| # | Task | Model | DB needed |
|---|---|---|---|
| 1 | Install cheerio | haiku | no |
| 2 | Norwegian unit table — src/recipes/nlp/norwegian-units.ts | haiku | no |
| 3 | Ingredient parser (TDD, regex-only, Norwegian-aware) — src/recipes/nlp/ingredient-parser.ts | sonnet | no |
| 4 | JSON-LD recipe extractor (TDD) — src/recipes/import/json-ld-extractor.ts | sonnet | no |
| 5 | Recipe importer (URL → fetch → extract → parse → normalize) — src/recipes/import/recipe-importer.ts | sonnet | no |
| 6 | Recipes repo — src/db/repositories/recipes.repo.ts | sonnet | no (interface only) |
| 7 | Ingredient → product resolver — src/optimizer/ingredient-resolver.ts | sonnet | no (uses repo) |
| 8 | Optimizer types + scoring (TDD) — src/optimizer/types.ts + src/optimizer/score.ts | sonnet | no |
| 9 | Optimizer main algorithm (TDD with synthetic fixtures) — src/optimizer/optimizer.ts | sonnet | no |
| 10 | CLI: recipe-import + cost-recipe commands | sonnet | YES (live recipes write) |
| 11 | Final verify + tag phase-1-w3-complete | sonnet | no |

## End-state verification

1. npm test → ~125+ passing (109 baseline + 16 new from TDD tasks)
2. npm exec tsc --noEmit → clean
3. npm run build → only /api/health route
4. CLI: `npm run recipe-import https://matprat.no/...` → recipe persisted (with Supabase) or printed (without)
5. CLI: `npm run cost-recipe <id> --servings 4` → JSON with per-store breakdown + total NOK + Trumf estimate
6. git tag phase-1-w3-complete

## Files created
- src/recipes/nlp/norwegian-units.ts
- src/recipes/nlp/ingredient-parser.ts + test
- src/recipes/import/json-ld-extractor.ts + test
- src/recipes/import/recipe-importer.ts + test
- src/db/repositories/recipes.repo.ts
- src/optimizer/types.ts
- src/optimizer/score.ts + test
- src/optimizer/optimizer.ts + test
- src/optimizer/ingredient-resolver.ts
- src/__tests__/__fixtures__/recipes/matprat-tom-kha-gai-jsonld.json
- src/__tests__/__fixtures__/optimizer/synthetic-pantry.json
- src/__tests__/__fixtures__/optimizer/synthetic-products.json

## Files modified
- package.json (add cheerio, recipe-import + cost-recipe scripts)
- src/index.ts (recipe-import + cost-recipe handlers)

## Rollback

```bash
git checkout main
git reset --hard phase-1-w2-complete
git branch -D phase-1/optimizer-recipes
git tag -d phase-1-w3-complete
```

## Deferred to later plans

- LLM ingredient parser fallback (low-confidence enrichment) — Plan D (co-locates with AI planner)
- Photo-of-recipe import (vision pipeline) — Plan E
- Cookbook UI (manual recipe entry forms) — Phase 3 frontend
- Receipt-inferred recipes — Plan D (depends on Trumf adapter)
