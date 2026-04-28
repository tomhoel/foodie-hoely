/**
 * Zod schemas for the subset of Trumf JSON API used by Foodie Phase 1.
 *
 * Endpoints (no public docs — names verified against community projects:
 * `VemundFredriksen/TrumfReceiptAnalyzer` and `ttyridal/trumf-data-fetch`):
 *   GET /trumf/husstand/transaksjoner?fra=YYYY-MM-DD&til=YYYY-MM-DD
 *   GET /trumf/husstand/transaksjoner/detaljer/{batchid}
 *
 * Norwegian field names (kept verbatim) translated below:
 *   batchid     → trumf_batch_id (unique transaction identifier)
 *   butikk      → store / dealer name
 *   dato        → transaction date (ISO or yyyy-mm-dd)
 *   sum         → total NOK
 *   bonus       → trumf bonus earned NOK
 *   varer       → line items
 *   vareTekst   → product name (raw)
 *   ean         → EAN barcode (string, may include leading zeros)
 *   antall      → quantity (often 1, sometimes weight in kg)
 *   belop       → line total NOK
 */

import { z } from 'zod';

export const TrumfTransaksjonSummary = z.object({
  batchid: z.string().min(1),
  butikk: z.string().optional(),
  dato: z.string(),
  sum: z.number(),
  bonus: z.number().optional(),
  bonusEkstra: z.number().optional(),
}).passthrough();
export type TrumfTransaksjonSummary = z.infer<typeof TrumfTransaksjonSummary>;

export const TrumfTransaksjonerResponse = z.object({
  transaksjoner: z.array(TrumfTransaksjonSummary),
}).passthrough();
export type TrumfTransaksjonerResponse = z.infer<typeof TrumfTransaksjonerResponse>;

export const TrumfVare = z.object({
  vareTekst: z.string(),
  ean: z.string().optional().nullable(),
  antall: z.number().optional(),
  belop: z.number(),
}).passthrough();
export type TrumfVare = z.infer<typeof TrumfVare>;

export const TrumfTransaksjonDetaljer = z.object({
  batchid: z.string().min(1),
  butikk: z.string().optional(),
  dato: z.string(),
  sum: z.number(),
  bonus: z.number().optional(),
  bonusEkstra: z.number().optional(),
  varer: z.array(TrumfVare),
}).passthrough();
export type TrumfTransaksjonDetaljer = z.infer<typeof TrumfTransaksjonDetaljer>;
