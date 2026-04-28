import { describe, it, expect } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import { runStage1 } from '../vision/stage1';

const stage1Output = {
  dishGuess: 'tom kha gai',
  ingredients: [
    { name: 'kokosmelk', confidence: 'high', portion: 'med', reasoning: 'creamy white broth' },
    { name: 'kyllingfilet', confidence: 'high', portion: 'med', reasoning: 'visible white meat chunks' },
    { name: 'sitrongress', confidence: 'med', portion: 'small', reasoning: 'green stalks plated' },
    { name: 'lime', confidence: 'med', portion: 'small', reasoning: 'wedge on rim' },
    { name: 'koriander', confidence: 'low', portion: 'small', reasoning: 'common garnish for tom kha' },
  ],
  reasoning: 'Creamy white-yellow broth with chicken cubes, citrus, and herb garnish — tom kha gai is the most likely match.',
};

describe('runStage1', () => {
  it('returns the parsed Stage1Result from the model', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: 'text', text: JSON.stringify(stage1Output) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 80, text: 80, reasoning: 0 } },
        warnings: [],
      }),
    });

    const out = await runStage1({
      imageBytes: new Uint8Array([0xff, 0xd8, 0xff]),
      mediaType: 'image/jpeg',
      model,
    });

    expect(out.dishGuess).toBe('tom kha gai');
    expect(out.ingredients).toHaveLength(5);
    expect(out.ingredients[0].name).toBe('kokosmelk');
    expect(out.ingredients[0].confidence).toBe('high');
    expect(out.reasoning).toContain('tom kha gai');
  });
});
