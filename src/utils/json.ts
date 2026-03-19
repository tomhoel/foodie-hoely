/**
 * Safe JSON parsing for AI responses.
 *
 * Gemini sometimes wraps JSON in markdown fences or returns
 * slightly malformed output. This utility handles common cases
 * and provides clear error messages.
 */

export function safeParseJson<T>(text: string, context: string): T | null {
  if (!text || !text.trim()) {
    console.warn(`[JSON] Empty response from ${context}`);
    return null;
  }

  // Strip markdown code fences
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

  // Try parsing directly
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to extract JSON from surrounding text
    const jsonMatch = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as T;
      } catch {
        // fall through
      }
    }

    console.warn(`[JSON] Failed to parse ${context} response: ${cleaned.slice(0, 200)}...`);
    return null;
  }
}
