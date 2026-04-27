import { GoogleGenAI } from '@google/genai';
import { getFeaturedDishes } from './dishes';

/**
 * Generate short appetizing descriptions for the featured dishes.
 * Returns a map of dish name -> description. Gracefully returns {} on failure.
 */
export async function generateDescriptions(): Promise<Record<string, string>> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return {};

  try {
    const ai = new GoogleGenAI({ apiKey });
    const featured = getFeaturedDishes();
    const names = featured.map((d) => `${d.name} (${d.cuisine} ${d.category})`);

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: `For each dish below, write one short appetizing description (8-12 words max). Return ONLY valid JSON, no markdown fences.

Dishes: ${names.join(', ')}

Format: {"Dish Name": "short description", ...}`,
      config: {
        temperature: 0.8,
        maxOutputTokens: 300,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const text = response.text?.trim() || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return {};
    return JSON.parse(match[0]);
  } catch {
    return {};
  }
}
