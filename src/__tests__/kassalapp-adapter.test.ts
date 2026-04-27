import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KassalappAdapter } from '../ingestion/adapters/kassalapp.adapter';

const __dirname = dirname(fileURLToPath(import.meta.url));

vi.mock('../db/repositories/products.repo', () => ({
  upsertProducts: vi.fn(async (rows: unknown[]) => ({ upserted: rows.length, errors: [] })),
}));

import { upsertProducts } from '../db/repositories/products.repo';

function fixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', 'kassalapp', name), 'utf-8');
}

describe('KassalappAdapter', () => {
  let adapter: KassalappAdapter;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    (upsertProducts as ReturnType<typeof vi.fn>).mockClear();
    adapter = new KassalappAdapter({ apiKey: 'test-key' });
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('declares correct adapter shape', () => {
    expect(adapter.name).toBe('kassalapp');
    expect(adapter.capabilities.sort()).toEqual(['prices', 'products']);
    expect(adapter.chains).toContain('KIWI');
  });

  it('syncProducts paginates and upserts mapped products', async () => {
    const mock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const page1 = JSON.parse(fixture('products-paginated-kiwi.json'));
    const page2 = { data: [], links: { next: null }, meta: { current_page: 2 } };
    mock
      .mockResolvedValueOnce(new Response(JSON.stringify(page1), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(page2), { status: 200 }));

    const result = await adapter.syncProducts({ limit: 1000 });

    expect(result.adapter).toBe('kassalapp');
    expect(result.errors).toEqual([]);
    expect(result.productsUpserted).toBe(2);
    expect(upsertProducts).toHaveBeenCalledTimes(1);
    const upsertCall = (upsertProducts as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upsertCall).toHaveLength(2);
    expect(upsertCall[0]).toMatchObject({
      source: 'kiwi', chain_code: 'KIWI', external_id: '1001',
      ean: '7038010029721', name: 'Tine Yoghurt Naturell 4 pk', price: 25.0,
    });
  });

  it('refreshPrices uses /products/ean/{ean} and returns Kiwi-only matches', async () => {
    const mock = globalThis.fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response(fixture('product-by-ean.json'), { status: 200 }));
    const updates = await adapter.refreshPrices(['7038010029721']);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ ean: '7038010029721', price: 25.0, currency: 'NOK' });
  });

  it('fetchOffers throws — kassalapp does not surface offers', async () => {
    await expect(adapter.fetchOffers('KIWI')).rejects.toThrow(/does not provide offers/i);
  });

  it('healthCheck returns ok when /products responds', async () => {
    const mock = globalThis.fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response(JSON.stringify({ data: [], links: {}, meta: {} }), { status: 200 }));
    const result = await adapter.healthCheck();
    expect(result.ok).toBe(true);
  });

  it('healthCheck returns ok=false on non-2xx', async () => {
    const mock = globalThis.fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response('unauth', { status: 401 }));
    const result = await adapter.healthCheck();
    expect(result.ok).toBe(false);
  });

  it('passes Bearer token in Authorization header', async () => {
    const mock = globalThis.fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response(JSON.stringify({ data: [], links: {}, meta: {} }), { status: 200 }));
    await adapter.healthCheck();
    const init = mock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-key');
  });
});
