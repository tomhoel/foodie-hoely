# Foodie Phase 1 Week 2 — Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement three real ingestion adapters — `EtilbudsavisAdapter`, `KassalappAdapter`, and full `MenyDirectAdapter` — each conforming to the `IngestionAdapter` interface from Phase 0, backed by Zod-validated HTTP clients and fixture-based tests, and wired into the CLI orchestrator.

**Architecture:** Each adapter owns one external source per the spec source-of-truth matrix. EtilbudsavisAdapter handles offer catalogs across all chains. KassalappAdapter handles Kiwi product catalog + prices via the kassal.app v1 API (with token-bucket rate limiting at 50 rpm). MenyDirectAdapter (extended from Phase 0) gets real refreshPrices and healthCheck implementations using the existing NGData ingestion logic. AFoodAdapter is left unchanged. All HTTP responses validated through Zod schemas.

**Tech Stack:** TypeScript 5.7, native fetch (Node 22), zod (new), vitest, Supabase Postgres (via existing supabase-js client).

**Spec reference:** docs/superpowers/specs/2026-04-27-foodie-grocery-planner-design.md (sections 3, 4, 7)
**Predecessor:** docs/superpowers/plans/2026-04-27-foodie-phase-0-demolition.md (must be tagged phase-0-complete)

**Prerequisite (parallel — does not block Tasks 1-10):** Apply migration 005_planning_core.sql to the Supabase project (Tasks 11-13 hit live DB and need this).

> NOTE: This is the lean version of Plan B. Full task code (test bodies, implementations, fixtures) is included inline below. Each task's code block is verbatim — copy-paste into the right file.


## Tasks (executed via subagent dispatch from PM session)

| # | Task | Model | DB needed |
|---|---|---|---|
| 1 | Install zod | haiku | no |
| 2 | TokenBucket (TDD) — src/ingestion/http/token-bucket.ts | sonnet | no |
| 3 | jsonFetch helper (TDD) — src/ingestion/http/json-fetch.ts | sonnet | no |
| 4 | Etilbudsavis Zod schemas | sonnet | no |
| 5 | EtilbudsavisAdapter (TDD) + fixtures | sonnet | no |
| 6 | Kassalapp Zod schemas | sonnet | no |
| 7 | products.repo (DB write helper) | sonnet | no (interface only) |
| 8 | KassalappAdapter (TDD) + fixtures | sonnet | no |
| 9 | Extend MenyDirectAdapter — real refreshPrices + healthCheck | sonnet | no |
| 10 | Wire all 4 adapters into CLI orchestrator (src/index.ts) | sonnet | no |
| 11 | Dealer seed script + offers.repo | sonnet | YES |
| 12 | Async buildOrchestrator pulls dealer IDs from DB | sonnet | YES |
| 13 | Live smoke test — sync etilbudsavis + sync kiwi | sonnet | YES (for full success) |
| 14 | Final verify + tag phase-1-w2-complete | sonnet | no |

## Files created

- src/ingestion/http/token-bucket.ts + test
- src/ingestion/http/json-fetch.ts + test
- src/ingestion/adapters/etilbudsavis-schemas.ts
- src/ingestion/adapters/etilbudsavis.adapter.ts + test + 2 fixtures
- src/ingestion/adapters/kassalapp-schemas.ts
- src/ingestion/adapters/kassalapp.adapter.ts + test + 2 fixtures
- src/db/repositories/products.repo.ts
- src/db/repositories/offers.repo.ts
- scripts/seed-dealers.ts

## Files modified

- package.json (add zod, sync:kiwi, sync:etilbudsavis, seed:dealers scripts)
- src/ingestion/adapters/meny-direct.adapter.ts (real refreshPrices + healthCheck)
- src/index.ts (register all 4 adapters in async buildOrchestrator)

## End-state verification

1. npm test → 109 passing (84 baseline + 5 token-bucket + 6 json-fetch + 7 etilbudsavis + 7 kassalapp)
2. npm exec tsc --noEmit → clean
3. npm run build → only /api/health route
4. Orchestrator routing matrix (verified via tsx -e snippet in Task 14):
   - MENY products → meny-direct
   - KIWI products → kassalapp
   - AFOOD products → afood
   - MENY offers → etilbudsavis
   - KIWI offers → etilbudsavis
5. git tag phase-1-w2-complete

## Rollback

```bash
git checkout main
git reset --hard phase-0-complete
git branch -D phase-1/adapters
git tag -d phase-1-w2-complete
```

