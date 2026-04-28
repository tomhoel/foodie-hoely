import { describe, it, expect } from 'vitest';
import { parseAuditReply } from '../audit/reply-parser';
import type { AuditItem } from '../audit/priority';

const snapshot: AuditItem[] = [
  { pantryItemId: 'a', name: 'kokosmelk', ean: '111', currentGrams: 200, currentConfidence: 0.4, recipeDependency: 3, auditPriority: 0.9 },
  { pantryItemId: 'b', name: 'fish sauce', ean: null, currentGrams: 50,  currentConfidence: 0.5, recipeDependency: 1, auditPriority: 0.6 },
  { pantryItemId: 'c', name: 'sitrongress', ean: null, currentGrams: 30, currentConfidence: 0.3, recipeDependency: 2, auditPriority: 0.8 },
];

describe('parseAuditReply', () => {
  it('returns corrections only for items with a non-null actualGrams that differs from currentGrams', () => {
    const yaml = `
- pantryItemId: a
  name: kokosmelk
  currentGrams: 200
  actualGrams: 80
- pantryItemId: b
  name: fish sauce
  currentGrams: 50
  actualGrams: null
- pantryItemId: c
  name: sitrongress
  currentGrams: 30
  actualGrams: 30
`;
    const corrections = parseAuditReply(yaml, snapshot);
    expect(corrections).toEqual([
      { pantryItemId: 'a', beforeGrams: 200, afterGrams: 80 },
    ]);
  });

  it('rejects entries that reference an unknown pantryItemId', () => {
    const yaml = `
- pantryItemId: zzz
  name: ???
  currentGrams: 0
  actualGrams: 5
`;
    expect(() => parseAuditReply(yaml, snapshot)).toThrow(/unknown pantryItemId/i);
  });

  it('handles malformed YAML with a clear error', () => {
    expect(() => parseAuditReply(': not valid: : :', snapshot)).toThrow();
  });
});
