import { describe, it, expect } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import { runStage2 } from '../vision/stage2';

const stage1Input = {
  dishGuess: 'tom kha gai',
  ingredients: [
    { name: 'kokosmelk', confidence: 'high' as const, portion: 'med' as const },
    { name: 'kyllingfilet', confidence: 'med' as const, portion: 'med' as const },
    { name: 'sitrongress', confidence: 'low' as const, portion: 'small' as const },
  ],
  reasoning: 'tom kha cues',
};

const stage2Output = {
  dishGuess: 'tom kha gai',
  ingredients: [
    { name: 'kokosmelk', confidence: 'high', portion: 'med', matchedPantryEan: '8851014300033' },
    { name: 'kyllingfilet', confidence: 'high', portion: 'med', matchedPantryEan: '7037100000123' },
    { name: 'sitrongress', confidence: 'med', portion: 'small', matchedPantryEan: null },
  ],
  reasoning: 'Bumped sitrongress from low to med — the recent meal plan included tom kha for this week.',
};

describe('runStage2', () => {
  it('returns the parsed Stage2Result from the model', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: 'text', text: JSON.stringify(stage2Output) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: { inputTokens: { total: 200, noCache: 200, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 100, text: 100, reasoning: 0 } },
        warnings: [],
      }),
    });

    const out = await runStage2({
      stage1: stage1Input,
      pantry: [
        { name: 'Kokosmelk Aroy-D 400ml', ean: '8851014300033', grams: 800 },
        { name: 'Kyllingfilet 500g', ean: '7037100000123', grams: 500 },
      ],
      recentMeals: [{ title: 'Tom Kha Gai', plannedFor: '2026-04-28' }],
      hint: 'made tom kha for dinner',
      model,
    });

    expect(out.ingredients).toHaveLength(3);
    expect(out.ingredients[0].matchedPantryEan).toBe('8851014300033');
    expect(out.ingredients[1].confidence).toBe('high');
  });
});
