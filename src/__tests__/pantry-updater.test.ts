import { describe, it, expect } from 'vitest';
import { computePantryUpserts, type LineForUpdate, type ProductLookup } from '../reconciler/pantry-updater';

describe('computePantryUpserts', () => {
  it('EAN-matched line yields high-confidence upsert with product link', () => {
    const lines: LineForUpdate[] = [
      { ean: '8851014300033', nameRaw: 'Kokosmelk Aroy-D 400ml', quantity: 2, lineTotalNok: 49.8 },
    ];
    const products: ProductLookup = new Map([
      ['8851014300033', { id: 'prod-1', name: 'Kokosmelk Aroy-D 400ml', weightKg: 0.4 }],
    ]);
    const out = computePantryUpserts({ householdId: 'hh-1', lines, productsByEan: products });
    expect(out).toHaveLength(1);
    expect(out[0].ean).toBe('8851014300033');
    expect(out[0].productName).toBe('Kokosmelk Aroy-D 400ml');
    expect(out[0].confidence).toBeCloseTo(0.95, 5);
    // 2 units × 0.4 kg = 0.8 kg = 800 g
    expect(out[0].quantityGrams).toBeCloseTo(800, 5);
    expect(out[0].lastSeenSource).toBe('receipt');
  });

  it('EAN-missing line yields lower-confidence upsert keyed by name', () => {
    const lines: LineForUpdate[] = [
      { ean: null, nameRaw: 'Limefrukt løsvekt', quantity: 4, lineTotalNok: 28.0 },
    ];
    const out = computePantryUpserts({ householdId: 'hh-1', lines, productsByEan: new Map() });
    expect(out).toHaveLength(1);
    expect(out[0].ean).toBeNull();
    expect(out[0].productName).toBe('Limefrukt løsvekt');
    expect(out[0].confidence).toBeCloseTo(0.7, 5);
    // No EAN/weight → fall back to count×80g default per piece (rough estimate, documented).
    expect(out[0].quantityGrams).toBeCloseTo(320, 5);
  });

  it('empty lines yield empty upserts', () => {
    expect(
      computePantryUpserts({ householdId: 'hh-1', lines: [], productsByEan: new Map() })
    ).toEqual([]);
  });
});
