/**
 * KassalappAdapter — kassal.app v1 API for Kiwi product catalog + prices.
 * Per spec source-of-truth: handles chains without direct API integration.
 * v1 supports KIWI; SPAR/JOKER are wired in later.
 * Auth: Bearer token via env KASSALAPP_API_KEY.
 * Rate: 60 rpm; throttles at 50 rpm with TokenBucket.
 */

import type {
  AdapterCapability, ChainCode, HealthStatus, IngestionAdapter,
  OfferRecord, PriceUpdate, SyncOptions, SyncResult,
} from '../adapter.interface';
import { jsonFetch } from '../http/json-fetch';
import { TokenBucket } from '../http/token-bucket';
import {
  KassalappEanLookupResponseSchema, KassalappProductsResponseSchema,
  type KassalappProduct, type KassalappProductsResponse,
} from './kassalapp-schemas';
import { upsertProducts, type ProductUpsert } from '../../db/repositories/products.repo';

const BASE_URL = 'https://kassal.app/api/v1';

const STORE_CODE_TO_CHAIN: Record<string, ChainCode> = {
  KIWI: 'KIWI', MENY_NO: 'MENY', SPAR_NO: 'SPAR', JOKER_NO: 'JOKER',
};

const CHAIN_TO_STORE_CODE: Record<ChainCode, string | undefined> = {
  KIWI: 'KIWI', MENY: 'MENY_NO', SPAR: 'SPAR_NO', JOKER: 'JOKER_NO', AFOOD: undefined,
};

export interface KassalappAdapterOptions {
  apiKey: string;
  baseUrl?: string;
  chains?: ChainCode[];
}

export class KassalappAdapter implements IngestionAdapter {
  readonly name = 'kassalapp';
  readonly capabilities: AdapterCapability[] = ['products', 'prices'];
  readonly chains: ChainCode[];

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly bucket: TokenBucket;

  constructor(opts: KassalappAdapterOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? BASE_URL;
    this.chains = opts.chains ?? ['KIWI'];
    this.bucket = new TokenBucket({ capacity: 50, refillPerMinute: 50 });
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' };
  }

  async syncProducts(opts: SyncOptions): Promise<SyncResult> {
    const started = new Date();
    const errors: SyncResult['errors'] = [];
    let totalUpserted = 0;

    for (const chain of this.chains) {
      const storeCode = CHAIN_TO_STORE_CODE[chain];
      if (!storeCode) {
        errors.push({ message: `chain ${chain} has no kassalapp store mapping`, context: { chain } });
        continue;
      }

      let nextUrl: string | null = `${this.baseUrl}/products?store=${storeCode}&size=100&page=1`;
      let processed = 0;
      const cap = opts.limit ?? Infinity;

      while (nextUrl && processed < cap) {
        await this.bucket.take();
        try {
          const response: KassalappProductsResponse = await jsonFetch(nextUrl, {
            schema: KassalappProductsResponseSchema,
            headers: this.headers(),
          });
          const upserts: ProductUpsert[] = response.data.map((p: KassalappProduct) => this.mapToProductUpsert(p, chain));
          if (upserts.length > 0) {
            const result = await upsertProducts(upserts);
            totalUpserted += result.upserted;
            for (const e of result.errors) errors.push({ message: e.message, context: { external_id: e.external_id } });
          }
          processed += response.data.length;
          nextUrl = response.links?.next ?? null;
        } catch (e) {
          errors.push({ message: e instanceof Error ? e.message : String(e), context: { url: nextUrl } });
          nextUrl = null;
        }
      }
    }
    return { adapter: this.name, started, finished: new Date(), productsUpserted: totalUpserted, errors };
  }

  async refreshPrices(eans: string[]): Promise<PriceUpdate[]> {
    const updates: PriceUpdate[] = [];
    for (const ean of eans) {
      await this.bucket.take();
      try {
        const response = await jsonFetch(`${this.baseUrl}/products/ean/${encodeURIComponent(ean)}`, {
          schema: KassalappEanLookupResponseSchema,
          headers: this.headers(),
        });
        for (const product of response.data.products) {
          const chain = STORE_CODE_TO_CHAIN[product.store.code];
          if (!chain || !this.chains.includes(chain)) continue;
          if (typeof product.current_price !== 'number') continue;
          updates.push({
            ean, price: product.current_price, currency: 'NOK',
            observedAt: new Date(product.updated_at ?? Date.now()),
          });
        }
      } catch (e) {
        console.error(`[kassalapp] refreshPrices failed for ean ${ean}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return updates;
  }

  async fetchOffers(_dealerCode: ChainCode): Promise<OfferRecord[]> {
    throw new Error('KassalappAdapter does not provide offers; use EtilbudsavisAdapter (spec)');
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      await this.bucket.take();
      const res = await fetch(`${this.baseUrl}/products?size=1`, { headers: this.headers() });
      const body = await res.text();
      if (!res.ok) return { ok: false, lastSuccess: new Date(0), error: `HTTP ${res.status}` };
      KassalappProductsResponseSchema.parse(JSON.parse(body));
      const remaining = res.headers.get('X-RateLimit-Remaining');
      return { ok: true, lastSuccess: new Date(), rateLimitRemaining: remaining ? Number(remaining) : undefined };
    } catch (e) {
      return { ok: false, lastSuccess: new Date(0), error: e instanceof Error ? e.message : String(e) };
    }
  }

  private mapToProductUpsert(p: KassalappProduct, chain: ChainCode): ProductUpsert {
    const sourceMap: Record<ChainCode, ProductUpsert['source']> = {
      KIWI: 'kiwi', MENY: 'meny', SPAR: 'kiwi', JOKER: 'kiwi', AFOOD: 'afood',
    };
    return {
      source: sourceMap[chain],
      chain_code: chain,
      external_id: String(p.id),
      ean: p.ean ?? null,
      name: p.name,
      brand: p.brand ?? null,
      vendor: p.vendor ?? null,
      description: p.description ?? null,
      category: p.category?.[0]?.name ?? null,
      weight_kg: p.weight && p.weight_unit === 'g' ? p.weight / 1000 : null,
      price: p.current_price ?? null,
      compare_price: p.current_unit_price ?? null,
      compare_unit: p.weight_unit ?? null,
      image_url: p.image ?? null,
      product_url: p.url ?? null,
      in_stock: true,
      raw_data: p,
    };
  }
}
