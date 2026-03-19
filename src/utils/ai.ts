/**
 * Shared AI call wrapper with retry + exponential backoff.
 *
 * All Gemini calls should go through this to get consistent
 * error handling, rate-limit retry, and logging.
 */

import { GoogleGenAI } from "@google/genai";
import { config } from "../config";
import { safeParseJson } from "./json";

const ai = new GoogleGenAI({ apiKey: config.google.apiKey });

export interface AiCallOptions {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  maxRetries?: number;
  /** Context string for error messages (e.g., "recipe generation") */
  context: string;
}

const DEFAULT_OPTIONS = {
  maxRetries: 3,
  temperature: 0.5,
  maxOutputTokens: 3000,
};

/**
 * Call Gemini with automatic retry on rate limits and transient errors.
 * Returns the raw text response.
 */
export async function aiCall(
  prompt: string,
  options: AiCallOptions
): Promise<string> {
  const {
    model = config.google.flashModel,
    temperature = DEFAULT_OPTIONS.temperature,
    maxOutputTokens = DEFAULT_OPTIONS.maxOutputTokens,
    maxRetries = DEFAULT_OPTIONS.maxRetries,
    context,
  } = options;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature,
          maxOutputTokens,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      return response.text?.trim() || "";
    } catch (err: any) {
      const isRetryable =
        err.message?.includes("429") ||
        err.message?.includes("RATE") ||
        err.message?.includes("503") ||
        err.message?.includes("UNAVAILABLE") ||
        err.message?.includes("DEADLINE") ||
        err.message?.includes("timeout");

      if (attempt < maxRetries - 1 && isRetryable) {
        const delayMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
        console.warn(`[AI] ${context}: ${err.message}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }

      throw new Error(`[AI] ${context} failed after ${attempt + 1} attempts: ${err.message}`);
    }
  }

  throw new Error(`[AI] ${context} failed: exhausted retries`);
}

/**
 * Call Gemini and parse the JSON response. Retries on rate limits
 * and on JSON parse failures (up to 2 parse attempts within the retry loop).
 */
export async function aiCallJson<T>(
  prompt: string,
  options: AiCallOptions
): Promise<T | null> {
  const maxParseAttempts = 2;

  for (let parseAttempt = 0; parseAttempt < maxParseAttempts; parseAttempt++) {
    const text = await aiCall(prompt, {
      ...options,
      // Don't consume all retries on the first parse attempt
      maxRetries: options.maxRetries ?? DEFAULT_OPTIONS.maxRetries,
    });

    const result = safeParseJson<T>(text, options.context);
    if (result !== null) return result;

    if (parseAttempt === 0) {
      console.warn(`[AI] ${options.context}: invalid JSON, retrying generation...`);
    }
  }

  return null;
}
