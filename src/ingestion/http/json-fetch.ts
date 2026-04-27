/**
 * jsonFetch — fetch + retry + Zod validation in one call.
 * Used by adapters to talk to external HTTP APIs. The response body is parsed
 * as JSON and validated against the provided Zod schema. Retries 5xx and 429
 * with exponential backoff (jitter ±20%); 4xx fail immediately.
 */

import type { ZodTypeAny, z } from 'zod';

export class JsonFetchError extends Error {
  constructor(message: string, public readonly url: string, public readonly status?: number, public readonly cause?: unknown) {
    super(message);
    this.name = 'JsonFetchError';
  }
}

export interface JsonFetchOptions<Schema extends ZodTypeAny> {
  schema: Schema;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: BodyInit;
  maxRetries?: number;
  baseBackoffMs?: number;
  timeoutMs?: number;
}

export async function jsonFetch<Schema extends ZodTypeAny>(url: string, opts: JsonFetchOptions<Schema>): Promise<z.infer<Schema>> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseBackoffMs = opts.baseBackoffMs ?? 500;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers: opts.headers,
        body: opts.body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status >= 500 || res.status === 429) {
        if (attempt < maxRetries) {
          await sleep(jitteredBackoff(baseBackoffMs, attempt));
          continue;
        }
        throw new JsonFetchError(`HTTP ${res.status} after ${attempt + 1} attempts`, url, res.status);
      }
      if (!res.ok) {
        throw new JsonFetchError(`HTTP ${res.status}`, url, res.status);
      }
      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch (e) {
        throw new JsonFetchError(`Response is not valid JSON`, url, res.status, e);
      }
      const parsed = opts.schema.safeParse(json);
      if (!parsed.success) {
        throw new JsonFetchError(`Response failed schema validation: ${parsed.error.message}`, url, res.status, parsed.error);
      }
      return parsed.data;
    } catch (e) {
      clearTimeout(timer);
      lastError = e;
      if (e instanceof JsonFetchError) throw e;
      if (attempt < maxRetries) {
        await sleep(jitteredBackoff(baseBackoffMs, attempt));
        continue;
      }
      throw new JsonFetchError(`Network error after ${attempt + 1} attempts: ${e instanceof Error ? e.message : String(e)}`, url, undefined, e);
    }
  }
  throw new JsonFetchError(`Exhausted retries`, url, undefined, lastError);
}

function jitteredBackoff(baseMs: number, attempt: number): number {
  const exp = baseMs * Math.pow(2, attempt);
  const jitter = exp * 0.2 * (Math.random() - 0.5);
  return exp + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
