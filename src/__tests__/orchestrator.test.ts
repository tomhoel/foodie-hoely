import { describe, it, expect, beforeEach } from 'vitest';
import { Orchestrator } from '../ingestion/orchestrator';
import type { ChainCode, OfferRecord, IngestionAdapter } from '../ingestion/adapter.interface';

function makeFakeAdapter(overrides: Partial<IngestionAdapter> = {}): IngestionAdapter {
  return {
    name: 'fake',
    capabilities: ['products'],
    chains: ['MENY'],
    syncProducts: async () => ({ adapter: 'fake', started: new Date(), finished: new Date(), productsUpserted: 0, errors: [] }),
    refreshPrices: async () => [],
    fetchOffers: async (_dealerCode: ChainCode): Promise<OfferRecord[]> => { throw new Error('not supported'); },
    healthCheck: async () => ({ ok: true, lastSuccess: new Date() }),
    ...overrides,
  };
}

describe('Orchestrator', () => {
  let orch: Orchestrator;

  beforeEach(() => {
    orch = new Orchestrator();
  });

  it('register() adds an adapter and getByName() returns it', () => {
    const a = makeFakeAdapter({ name: 'meny-direct' });
    orch.register(a);
    expect(orch.getByName('meny-direct')).toBe(a);
  });

  it('throws when registering two adapters claiming the same (chain, capability)', () => {
    orch.register(makeFakeAdapter({ name: 'a', chains: ['MENY'], capabilities: ['products'] }));
    expect(() =>
      orch.register(makeFakeAdapter({ name: 'b', chains: ['MENY'], capabilities: ['products'] }))
    ).toThrow(/already registered/i);
  });

  it('routeFor(chain, capability) returns the adapter that owns that combo', () => {
    const meny = makeFakeAdapter({ name: 'meny-direct', chains: ['MENY'], capabilities: ['products', 'prices'] });
    const eta = makeFakeAdapter({ name: 'etilbudsavis', chains: ['MENY', 'KIWI'], capabilities: ['offers'] });
    orch.register(meny);
    orch.register(eta);
    expect(orch.routeFor('MENY', 'products')).toBe(meny);
    expect(orch.routeFor('MENY', 'offers')).toBe(eta);
    expect(orch.routeFor('KIWI', 'offers')).toBe(eta);
  });

  it('routeFor returns undefined when no adapter handles the combo', () => {
    orch.register(makeFakeAdapter({ chains: ['MENY'], capabilities: ['products'] }));
    expect(orch.routeFor('JOKER', 'transactions')).toBeUndefined();
  });

  it('listAdapters() returns all registered adapters', () => {
    orch.register(makeFakeAdapter({ name: 'a' }));
    orch.register(makeFakeAdapter({ name: 'b', chains: ['KIWI'] }));
    expect(orch.listAdapters().map((x) => x.name).sort()).toEqual(['a', 'b']);
  });
});
