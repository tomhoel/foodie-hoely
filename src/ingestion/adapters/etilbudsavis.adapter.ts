/**
 * EtilbudsavisAdapter — Tjek squid v2 API ingestion.
 * Source-of-truth for: weekly offer flyers (campaign window + heading + price + image)
 * across MENY/Kiwi/Spar/Joker.
 */

import type {
  AdapterCapability, ChainCode, HealthStatus, IngestionAdapter,
  OfferRecord, PriceUpdate, SyncOptions, SyncResult,
} from '../adapter.interface';
import { jsonFetch } from '../http/json-fetch';
import {
  TjekCatalogsResponseSchema, TjekDealersResponseSchema, TjekOffersResponseSchema,
} from './etilbudsavis-schemas';

const BASE_URL = 'https://api.etilbudsavis.dk';
const USER_AGENT = 'foodie-hoely/1.0 (+https://github.com/tomhoel/foodie-hoely)';

export type DealerIdMap = Partial<Record<ChainCode, string>>;

export interface EtilbudsavisAdapterOptions {
  dealerIdMap: DealerIdMap;
  baseUrl?: string;
}

export class EtilbudsavisAdapter implements IngestionAdapter {
  readonly name = 'etilbudsavis';
  readonly capabilities: AdapterCapability[] = ['offers'];
  readonly chains: ChainCode[];

  private readonly baseUrl: string;
  private readonly dealerIdMap: DealerIdMap;

  constructor(opts: EtilbudsavisAdapterOptions) {
    this.dealerIdMap = opts.dealerIdMap;
    this.baseUrl = opts.baseUrl ?? BASE_URL;
    this.chains = Object.keys(opts.dealerIdMap) as ChainCode[];
  }

  async syncProducts(_opts: SyncOptions): Promise<SyncResult> {
    throw new Error('etilbudsavis does not provide products; use kassalapp/meny-direct (spec)');
  }

  async refreshPrices(_eans: string[]): Promise<PriceUpdate[]> {
    throw new Error('etilbudsavis does not provide prices; use kassalapp/meny-direct (spec)');
  }

  async fetchOffers(dealerCode: ChainCode): Promise<OfferRecord[]> {
    const dealerId = this.dealerIdMap[dealerCode];
    if (!dealerId) {
      throw new Error(`No etilbudsavis dealer id configured for chain ${dealerCode}`);
    }

    const catalogsUrl = new URL(`${this.baseUrl}/v2/catalogs`);
    catalogsUrl.searchParams.set('dealer_ids', dealerId);
    catalogsUrl.searchParams.set('r_locale', 'nb_NO');
    catalogsUrl.searchParams.set('limit', '20');

    const catalogs = await jsonFetch(catalogsUrl.toString(), {
      schema: TjekCatalogsResponseSchema,
      headers: { 'User-Agent': USER_AGENT },
    });

    const now = Date.now();
    const activeCatalogs = catalogs.filter((c) => {
      const from = c.run_from ? Date.parse(c.run_from) : -Infinity;
      const till = c.run_till ? Date.parse(c.run_till) : Infinity;
      return now >= from && now <= till;
    });

    const allOffers: OfferRecord[] = [];
    for (const cat of activeCatalogs) {
      const offersUrl = new URL(`${this.baseUrl}/v2/offers`);
      offersUrl.searchParams.set('catalog_id', cat.id);
      offersUrl.searchParams.set('limit', '400');
      const offers = await jsonFetch(offersUrl.toString(), {
        schema: TjekOffersResponseSchema,
        headers: { 'User-Agent': USER_AGENT },
      });
      for (const o of offers) {
        allOffers.push({
          externalId: o.id,
          dealerCode,
          heading: o.heading,
          description: o.description,
          price: o.pricing.price,
          prePrice: o.pricing.pre_price ?? undefined,
          runFrom: new Date(o.run_from ?? cat.run_from ?? new Date().toISOString()),
          runTill: new Date(o.run_till ?? cat.run_till ?? new Date().toISOString()),
          imageUrl: o.images?.view ?? o.images?.thumb,
        });
      }
    }
    return allOffers;
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const url = `${this.baseUrl}/v2/dealers?limit=10`;
      await jsonFetch(url, {
        schema: TjekDealersResponseSchema,
        headers: { 'User-Agent': USER_AGENT },
        maxRetries: 0,
      });
      return { ok: true, lastSuccess: new Date() };
    } catch (e) {
      return { ok: false, lastSuccess: new Date(0), error: e instanceof Error ? e.message : String(e) };
    }
  }
}
