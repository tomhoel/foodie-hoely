import { describe, it, expect } from 'vitest';
import { extractRecipeFromHtml } from '../recipes/import/json-ld-extractor';

const matpratHtml = `<!DOCTYPE html>
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "name": "Tom Kha Gai",
  "image": ["https://matprat.no/img/tom-kha-gai.jpg"],
  "totalTime": "PT45M",
  "recipeYield": "4 porsjoner",
  "recipeIngredient": [
    "400 ml kokosmelk",
    "200 g kyllingfilet",
    "2 ss fiskesaus",
    "noen blader koriander"
  ],
  "recipeInstructions": [
    { "@type": "HowToStep", "text": "Kok opp kokosmelken." },
    { "@type": "HowToStep", "text": "Tilsett kylling og krydder." }
  ]
}
</script>
</head><body></body></html>`;

const graphHtml = `<!DOCTYPE html>
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebPage", "name": "Some page" },
    {
      "@type": "Recipe",
      "name": "Pad Thai",
      "image": "https://godt.no/pad-thai.jpg",
      "totalTime": "PT30M",
      "recipeYield": 2,
      "recipeIngredient": ["200 g risnudler", "150 g kyllingfilet"],
      "recipeInstructions": "Kok nudlene. Stek kyllingen. Bland alt sammen."
    }
  ]
}
</script>
</head><body></body></html>`;

const noRecipeHtml = `<html><head><script type="application/ld+json">{"@type":"Article","name":"Not a recipe"}</script></head></html>`;
const malformedHtml = `<html><head><script type="application/ld+json">{ this is { not json }</script></head></html>`;

describe('extractRecipeFromHtml', () => {
  it('extracts a simple top-level Recipe', () => {
    const r = extractRecipeFromHtml(matpratHtml, 'https://matprat.no/test');
    expect(r).not.toBeNull();
    expect(r!.title).toBe('Tom Kha Gai');
    expect(r!.heroImageUrl).toBe('https://matprat.no/img/tom-kha-gai.jpg');
    expect(r!.totalTimeMinutes).toBe(45);
    expect(r!.servings).toBe(4);
    expect(r!.ingredientsRaw).toEqual([
      '400 ml kokosmelk',
      '200 g kyllingfilet',
      '2 ss fiskesaus',
      'noen blader koriander',
    ]);
    expect(r!.instructions).toHaveLength(2);
    expect(r!.instructions[0]).toBe('Kok opp kokosmelken.');
    expect(r!.sourceUrl).toBe('https://matprat.no/test');
  });

  it('finds a Recipe inside @graph array', () => {
    const r = extractRecipeFromHtml(graphHtml, 'https://godt.no/pad-thai');
    expect(r).not.toBeNull();
    expect(r!.title).toBe('Pad Thai');
    expect(r!.heroImageUrl).toBe('https://godt.no/pad-thai.jpg');
    expect(r!.totalTimeMinutes).toBe(30);
    expect(r!.servings).toBe(2);
    expect(r!.ingredientsRaw).toEqual(['200 g risnudler', '150 g kyllingfilet']);
    expect(r!.instructions).toHaveLength(3); // string was split on sentence boundaries
  });

  it('returns null when no Recipe is found', () => {
    expect(extractRecipeFromHtml(noRecipeHtml, 'https://example.com')).toBeNull();
  });

  it('returns null on malformed JSON-LD without throwing', () => {
    expect(extractRecipeFromHtml(malformedHtml, 'https://example.com')).toBeNull();
  });

  it('handles ImageObject form for image field', () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      '@type': 'Recipe',
      name: 'Test',
      image: { '@type': 'ImageObject', url: 'https://example.com/img.jpg' },
      recipeIngredient: ['1 ss salt'],
      recipeInstructions: [{ '@type': 'HowToStep', text: 'Cook.' }],
    })}</script></head></html>`;
    const r = extractRecipeFromHtml(html, 'https://example.com');
    expect(r!.heroImageUrl).toBe('https://example.com/img.jpg');
  });

  it('parses ISO 8601 durations (PT1H30M → 90 min)', () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      '@type': 'Recipe',
      name: 'Long',
      totalTime: 'PT1H30M',
      recipeIngredient: ['1 stk something'],
      recipeInstructions: 'Wait.',
    })}</script></head></html>`;
    const r = extractRecipeFromHtml(html, 'https://example.com');
    expect(r!.totalTimeMinutes).toBe(90);
  });

  it('parses servings from string with leading number', () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      '@type': 'Recipe',
      name: 'X',
      recipeYield: '6 personer',
      recipeIngredient: ['1 stk x'],
      recipeInstructions: 'do',
    })}</script></head></html>`;
    const r = extractRecipeFromHtml(html, 'https://example.com');
    expect(r!.servings).toBe(6);
  });
});
