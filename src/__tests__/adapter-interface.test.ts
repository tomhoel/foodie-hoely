import { describe, it, expect } from 'vitest';
import type { IngestionAdapter, AdapterCapability, ChainCode } from '../ingestion/adapter.interface';

describe('IngestionAdapter interface', () => {
  it('declares required ChainCode literal union', () => {
    const validCodes: ChainCode[] = ['MENY', 'KIWI', 'AFOOD', 'SPAR', 'JOKER'];
    // Compile-time only — if this typechecks, the union covers our v1 chains.
    expect(validCodes).toHaveLength(5);
  });

  it('declares required AdapterCapability literal union', () => {
    const caps: AdapterCapability[] = ['products', 'prices', 'offers', 'transactions'];
    expect(caps).toHaveLength(4);
  });

  it('a class implementing the interface compiles', () => {
    class TestAdapter implements IngestionAdapter {
      readonly name = 'test';
      readonly capabilities: AdapterCapability[] = ['products'];
      readonly chains: ChainCode[] = ['MENY'];
      async syncProducts() {
        return { adapter: this.name, started: new Date(), finished: new Date(), productsUpserted: 0, errors: [] };
      }
      async refreshPrices(eans: string[]) {
        return eans.map((ean) => ({ ean, price: 0, currency: 'NOK' as const, observedAt: new Date() }));
      }
      async fetchOffers() {
        throw new Error('test adapter does not support offers');
      }
      async healthCheck() {
        return { ok: true, lastSuccess: new Date() };
      }
    }
    const a = new TestAdapter();
    expect(a.name).toBe('test');
    expect(a.capabilities).toContain('products');
  });
});
