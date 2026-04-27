import { describe, it, expect } from 'vitest';
import { parseIngredient } from '../recipes/nlp/ingredient-parser';

describe('parseIngredient (Norwegian)', () => {
  it('parses simple quantity + unit + name', () => {
    const r = parseIngredient('2 ss soyasaus');
    expect(r).toMatchObject({
      raw: '2 ss soyasaus',
      quantity: 2,
      unitOriginal: 'ss',
      quantityGrams: 30,                // 2 ss × 15 ml = 30 ml ≈ 30 g (volume→g 1:1 default)
      name: 'soyasaus',
      confidence: 'high',
    });
  });

  it('parses fractional quantities (1/2)', () => {
    const r = parseIngredient('1/2 dl kokosmelk');
    expect(r.quantity).toBe(0.5);
    expect(r.unitOriginal).toBe('dl');
    expect(r.quantityGrams).toBe(50);   // 0.5 × 100 ml
    expect(r.name).toBe('kokosmelk');
    expect(r.confidence).toBe('high');
  });

  it('parses decimal quantities (1,5 → 1.5 with comma) and (1.5)', () => {
    expect(parseIngredient('1,5 kg kjøttdeig').quantity).toBe(1.5);
    expect(parseIngredient('1.5 kg kjøttdeig').quantity).toBe(1.5);
  });

  it('parses range quantities and uses the upper bound (2-3 → 3)', () => {
    const r = parseIngredient('2-3 stk hvitløksfedd');
    expect(r.quantity).toBe(3);
    expect(r.unitOriginal).toBe('stk');
    expect(r.name).toBe('hvitløksfedd');
  });

  it('parses kg correctly (1 kg → 1000 g)', () => {
    const r = parseIngredient('1 kg poteter');
    expect(r.quantityGrams).toBe(1000);
  });

  it('returns low confidence for fuzzy quantities ("noen", "litt", "etter smak")', () => {
    const fuzzy = ['noen blader koriander', 'litt salt', 'etter smak pepper'];
    for (const text of fuzzy) {
      const r = parseIngredient(text);
      expect(r.confidence).toBe('low');
      expect(r.quantityGrams).toBeUndefined();
      expect(r.name.length).toBeGreaterThan(0);
    }
  });

  it('handles unit-less ingredients ("3 hvitløksfedd")', () => {
    const r = parseIngredient('3 hvitløksfedd');
    expect(r.quantity).toBe(3);
    expect(r.unitOriginal).toBeUndefined();
    expect(r.name).toBe('hvitløksfedd');
    expect(r.confidence).toBe('high');
  });

  it('returns low confidence for completely unparseable input', () => {
    const r = parseIngredient('');
    expect(r.confidence).toBe('low');
    expect(r.name).toBe('');
  });

  it('strips parenthetical notes from the name', () => {
    const r = parseIngredient('200 g kyllingfilet (uten skinn)');
    expect(r.name).toBe('kyllingfilet');
    expect(r.quantityGrams).toBe(200);
  });

  it('handles "klype" as 0.5g and "neve" as 30g', () => {
    expect(parseIngredient('1 klype salt').quantityGrams).toBe(0.5);
    expect(parseIngredient('1 neve persille').quantityGrams).toBe(30);
  });
});
