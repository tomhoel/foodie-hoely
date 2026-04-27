import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EtilbudsavisAdapter } from '../ingestion/adapters/etilbudsavis.adapter';

const __dirname = dirname(fileURLToPath(import.meta.url));

function fixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', 'etilbudsavis', name), 'utf-8');
}

describe('EtilbudsavisAdapter', () => {
  let adapter: EtilbudsavisAdapter;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    adapter = new EtilbudsavisAdapter({
      dealerIdMap: { MENY: 'mn1abc', KIWI: 'kw0xyz', SPAR: 'sp2def', JOKER: 'b3e8Fm' },
    });
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('declares correct adapter shape', () => {
    expect(adapter.name).toBe('etilbudsavis');
    expect(adapter.capabilities).toEqual(['offers']);
    expect(adapter.chains.sort()).toEqual(['JOKER', 'KIWI', 'MENY', 'SPAR']);
  });

  it('fetchOffers maps Tjek offers to OfferRecord[]', async () => {
    const mock = globalThis.fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(
      new Response(JSON.stringify([{
        id: 'cat_001', dealer_id: 'b3e8Fm',
        run_from: '2026-04-27T00:00:00Z', run_till: '2026-05-03T23:59:59Z',
      }]), { status: 200 })
    );
    mock.mockResolvedValueOnce(new Response(fixture('offers-joker-sample.json'), { status: 200 }));
    const offers = await adapter.fetchOffers('JOKER');
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      externalId: 'dJdjaEQTYe4c7q6aRhilD',
      dealerCode: 'JOKER',
      heading: 'Kjottdeig',
      price: 49.9,
      prePrice: 64.9,
    });
    expect(offers[0].runFrom).toBeInstanceOf(Date);
    expect(offers[1].prePrice).toBeUndefined();
  });

  it('throws when called with a chain not in dealerIdMap', async () => {
    await expect(adapter.fetchOffers('AFOOD')).rejects.toThrow(/no etilbudsavis dealer id/i);
  });

  it('syncProducts throws — etilbudsavis does not provide products', async () => {
    await expect(adapter.syncProducts({})).rejects.toThrow(/etilbudsavis does not provide products/i);
  });

  it('refreshPrices throws — etilbudsavis does not provide prices', async () => {
    await expect(adapter.refreshPrices(['7038010029721'])).rejects.toThrow(/does not provide prices/i);
  });

  it('healthCheck returns ok when /v2/dealers responds', async () => {
    const mock = globalThis.fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response(fixture('dealers-list.json'), { status: 200 }));
    const result = await adapter.healthCheck();
    expect(result.ok).toBe(true);
    expect(result.lastSuccess).toBeInstanceOf(Date);
  });

  it('healthCheck returns ok=false when API errors', async () => {
    const mock = globalThis.fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response('boom', { status: 503 }));
    const result = await adapter.healthCheck();
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});
