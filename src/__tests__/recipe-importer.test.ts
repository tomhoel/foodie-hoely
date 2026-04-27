import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { importRecipeFromUrl } from '../recipes/import/recipe-importer';

const sampleHtml = `<html><head>
<script type="application/ld+json">
{
  "@type": "Recipe",
  "name": "Tom Kha Gai",
  "image": "https://example.com/img.jpg",
  "totalTime": "PT45M",
  "recipeYield": "4 porsjoner",
  "recipeIngredient": [
    "400 ml kokosmelk",
    "200 g kyllingfilet",
    "noen blader koriander"
  ],
  "recipeInstructions": [{"@type":"HowToStep","text":"Step 1."}]
}
</script>
</head></html>`;

describe('importRecipeFromUrl', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('fetches, extracts, and parses each ingredient', async () => {
    const mock = globalThis.fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response(sampleHtml, { status: 200, headers: { 'Content-Type': 'text/html' } }));

    const recipe = await importRecipeFromUrl('https://matprat.no/oppskrift/tom-kha-gai');

    expect(recipe.title).toBe('Tom Kha Gai');
    expect(recipe.sourceUrl).toBe('https://matprat.no/oppskrift/tom-kha-gai');
    expect(recipe.heroImageUrl).toBe('https://example.com/img.jpg');
    expect(recipe.totalTimeMinutes).toBe(45);
    expect(recipe.servings).toBe(4);
    expect(recipe.origin).toBe('imported_url');
    expect(recipe.instructions).toEqual(['Step 1.']);
    expect(recipe.ingredients).toHaveLength(3);
    expect(recipe.ingredients[0]).toMatchObject({
      raw: '400 ml kokosmelk',
      quantity: 400,
      unitOriginal: 'ml',
      quantityGrams: 400,
      name: 'kokosmelk',
      confidence: 'high',
    });
    expect(recipe.ingredients[2]).toMatchObject({
      raw: 'noen blader koriander',
      confidence: 'low',
    });
  });

  it('passes a User-Agent header in the fetch request', async () => {
    const mock = globalThis.fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response(sampleHtml, { status: 200 }));
    await importRecipeFromUrl('https://matprat.no/x');
    const init = mock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/foodie-hoely/);
  });

  it('throws when no Recipe is found in the HTML', async () => {
    const mock = globalThis.fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response('<html></html>', { status: 200 }));
    await expect(importRecipeFromUrl('https://x.com')).rejects.toThrow(/no recipe found/i);
  });

  it('throws when fetch returns non-2xx', async () => {
    const mock = globalThis.fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
    await expect(importRecipeFromUrl('https://x.com')).rejects.toThrow(/HTTP 404/);
  });
});
