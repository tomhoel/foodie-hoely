import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenBucket } from '../ingestion/http/token-bucket';

describe('TokenBucket', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('allows immediate consumption when tokens are available', async () => {
    const bucket = new TokenBucket({ capacity: 5, refillPerMinute: 60 });
    await bucket.take();
    expect(bucket.available()).toBe(4);
  });

  it('refills over time at the configured rate', async () => {
    const bucket = new TokenBucket({ capacity: 5, refillPerMinute: 60 });
    for (let i = 0; i < 5; i++) await bucket.take();
    expect(bucket.available()).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(bucket.available()).toBe(2);
  });

  it('caps refill at capacity', async () => {
    const bucket = new TokenBucket({ capacity: 5, refillPerMinute: 60 });
    vi.advanceTimersByTime(60_000);
    expect(bucket.available()).toBe(5);
  });

  it('take() blocks until a token is available', async () => {
    const bucket = new TokenBucket({ capacity: 1, refillPerMinute: 60 });
    await bucket.take();
    const start = Date.now();
    const pending = bucket.take();
    vi.advanceTimersByTime(1000);
    await pending;
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(1000);
  });

  it('multiple concurrent take() calls resolve in order', async () => {
    const bucket = new TokenBucket({ capacity: 1, refillPerMinute: 60 });
    await bucket.take();
    const order: number[] = [];
    const p1 = bucket.take().then(() => order.push(1));
    const p2 = bucket.take().then(() => order.push(2));
    vi.advanceTimersByTime(1000);
    await p1;
    vi.advanceTimersByTime(1000);
    await p2;
    expect(order).toEqual([1, 2]);
  });
});
