/**
 * Shared fetch retry and delay utilities for sync scripts.
 */

import { config } from "../config";

/** Fetch with automatic retry on 429/500/503 errors. */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts: { maxRetries?: number; backoffMs?: number } = {},
): Promise<Response> {
  const maxRetries = opts.maxRetries ?? config.sync.maxRetries;
  const backoffMs = opts.backoffMs ?? 1000;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, init);

      if (res.ok || (res.status < 500 && res.status !== 429)) {
        return res;
      }

      // Retryable status
      if (attempt < maxRetries) {
        const wait = backoffMs * Math.pow(2, attempt);
        console.warn(`[retry] ${res.status} on ${url}, retrying in ${wait}ms (attempt ${attempt + 1}/${maxRetries})`);
        await delay(wait);
        continue;
      }

      return res; // Return the failed response on last attempt
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        const wait = backoffMs * Math.pow(2, attempt);
        console.warn(`[retry] Network error on ${url}, retrying in ${wait}ms (attempt ${attempt + 1}/${maxRetries})`);
        await delay(wait);
        continue;
      }
    }
  }

  throw lastError || new Error(`Failed after ${maxRetries} retries: ${url}`);
}

/** Delay with random jitter to avoid robotic request patterns. */
export function delayWithJitter(baseMs?: number): Promise<void> {
  const base = baseMs ?? config.sync.delayMs;
  const jitter = Math.random() * config.sync.jitterMs;
  return new Promise((resolve) => setTimeout(resolve, base + jitter));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
