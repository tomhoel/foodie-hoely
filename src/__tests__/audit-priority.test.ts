import { describe, it, expect } from 'vitest';
import { computeAuditPriority, selectTopAuditItems, type PantryAuditCandidate } from '../audit/priority';

describe('computeAuditPriority', () => {
  it('zero confidence + zero usage → uncertainty term dominates', () => {
    const p = computeAuditPriority({ confidence: 0, recipeDependency: 0 });
    expect(p).toBeGreaterThan(0);
  });

  it('higher uncertainty AND higher recipe dependency → higher priority', () => {
    const a = computeAuditPriority({ confidence: 0.9, recipeDependency: 1 });
    const b = computeAuditPriority({ confidence: 0.4, recipeDependency: 4 });
    expect(b).toBeGreaterThan(a);
  });

  it('confidence 1.0 + zero usage → priority 0', () => {
    expect(computeAuditPriority({ confidence: 1, recipeDependency: 0 })).toBe(0);
  });
});

describe('selectTopAuditItems', () => {
  const items: PantryAuditCandidate[] = [
    { pantryItemId: 'a', name: 'salt',         ean: null,   currentGrams: 100, currentConfidence: 0.95, recipeDependency: 0 },
    { pantryItemId: 'b', name: 'kokosmelk',    ean: '111',  currentGrams: 200, currentConfidence: 0.4,  recipeDependency: 3 },
    { pantryItemId: 'c', name: 'fish sauce',   ean: '222',  currentGrams: 50,  currentConfidence: 0.5,  recipeDependency: 1 },
    { pantryItemId: 'd', name: 'sitrongress',  ean: null,   currentGrams: 30,  currentConfidence: 0.3,  recipeDependency: 2 },
  ];

  it('returns items sorted by priority descending', () => {
    const top = selectTopAuditItems(items, 4);
    expect(top.map((i) => i.pantryItemId)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('returns at most n items', () => {
    expect(selectTopAuditItems(items, 2)).toHaveLength(2);
    expect(selectTopAuditItems(items, 100)).toHaveLength(items.length);
  });

  it('attaches a numeric auditPriority to each returned item', () => {
    const top = selectTopAuditItems(items, 1);
    expect(top[0]).toHaveProperty('auditPriority');
    expect(typeof top[0].auditPriority).toBe('number');
  });
});
