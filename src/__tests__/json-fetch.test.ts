import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { jsonFetch, JsonFetchError } from '../ingestion/http/json-fetch';

const TestSchema = z.object({ ok: z.boolean(), value: z.number() });

describe('jsonFetch', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns parsed body when response is 2xx and matches schema', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ ok: true, value: 42 }), { status: 200 })
    );
    const result = await jsonFetch('https://example.com/x', { schema: TestSchema });
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it('throws JsonFetchError when body fails Zod validation', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ ok: 'yes', value: 'forty-two' }), { status: 200 })
    );
    await expect(jsonFetch('https://example.com/x', { schema: TestSchema })).rejects.toThrow(JsonFetchError);
  });

  it('retries on 5xx up to maxRetries then throws', async () => {
    const mock = globalThis.fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValue(new Response('Bad Gateway', { status: 502 }));
    await expect(jsonFetch('https://example.com/x', { schema: TestSchema, maxRetries: 2, baseBackoffMs: 1 })).rejects.toThrow(JsonFetchError);
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it('retries on 429 then succeeds when API recovers', async () => {
    const mock = globalThis.fetch as ReturnType<typeof vi.fn>;
    mock
      .mockResolvedValueOnce(new Response('Rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, value: 1 }), { status: 200 }));
    const result = await jsonFetch('https://example.com/x', { schema: TestSchema, baseBackoffMs: 1 });
    expect(result).toEqual({ ok: true, value: 1 });
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('throws JsonFetchError on 4xx without retry', async () => {
    const mock = globalThis.fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValue(new Response('Not found', { status: 404 }));
    await expect(jsonFetch('https://example.com/x', { schema: TestSchema, maxRetries: 3, baseBackoffMs: 1 })).rejects.toThrow(JsonFetchError);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('passes custom headers and method through to fetch', async () => {
    const mock = globalThis.fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValue(new Response(JSON.stringify({ ok: true, value: 0 }), { status: 200 }));
    await jsonFetch('https://example.com/x', {
      schema: TestSchema, method: 'POST', headers: { Authorization: 'Bearer abc' }, body: JSON.stringify({ q: 'hello' }),
    });
    const callArgs = mock.mock.calls[0];
    expect(callArgs[0]).toBe('https://example.com/x');
    const init = callArgs[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer abc');
  });
});
