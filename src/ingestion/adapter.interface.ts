/**
 * IngestionAdapter — the only interface external data sources implement.
 *
 * One adapter per source (MENY direct API, Kassalapp, Etilbudsavis, AFood, Trumf).
 * The orchestrator (src/ingestion/orchestrator.ts) is the only file that knows
 * which adapter handles which (chain, dataType). No adapter calls another.
 *
 * See spec §3 (source-of-truth matrix) and §7.1 for design rationale.
 */

export type ChainCode = 'MENY' | 'KIWI' | 'AFOOD' | 'SPAR' | 'JOKER';

export type AdapterCapability = 'products' | 'prices' | 'offers' | 'transactions';

export interface SyncOptions {
  /** When provided, only refresh products updated after this timestamp. */
  since?: Date;
  /** Cap the number of products processed in this run. */
  limit?: number;
  /** When true, skip writes; just compute what would change. */
  dryRun?: boolean;
}

export interface SyncResult {
  adapter: string;
  started: Date;
  finished: Date;
  productsUpserted: number;
  errors: Array<{ message: string; context?: unknown }>;
}

export interface PriceUpdate {
  ean: string;
  price: number;
  currency: 'NOK';
  observedAt: Date;
  isOffer?: boolean;
  comparePrice?: number;
}

export interface OfferRecord {
  externalId: string;
  dealerCode: ChainCode;
  heading: string;
  description?: string;
  price: number;
  prePrice?: number;
  runFrom: Date;
  runTill: Date;
  imageUrl?: string;
}

export interface HealthStatus {
  ok: boolean;
  lastSuccess: Date;
  rateLimitRemaining?: number;
  error?: string;
}

export interface IngestionAdapter {
  readonly name: string;
  readonly capabilities: AdapterCapability[];
  readonly chains: ChainCode[];

  syncProducts(opts: SyncOptions): Promise<SyncResult>;
  refreshPrices(eans: string[]): Promise<PriceUpdate[]>;
  fetchOffers(dealerCode: ChainCode): Promise<OfferRecord[]>;
  healthCheck(): Promise<HealthStatus>;
}
