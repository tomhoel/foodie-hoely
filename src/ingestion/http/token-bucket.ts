/**
 * Simple token-bucket rate limiter.
 * Used by adapters that hit rate-limited external APIs (e.g., kassalapp's 60 rpm).
 * take() returns immediately if a token is available, or waits until one refills.
 * Tokens refill continuously based on refillPerMinute; capacity caps the burst.
 */

export interface TokenBucketOptions {
  capacity: number;
  refillPerMinute: number;
}

export class TokenBucket {
  private tokens: number;
  private lastRefillAt: number;
  private readonly capacity: number;
  private readonly refillIntervalMs: number;

  constructor(opts: TokenBucketOptions) {
    this.capacity = opts.capacity;
    this.tokens = opts.capacity;
    this.refillIntervalMs = 60_000 / opts.refillPerMinute;
    this.lastRefillAt = Date.now();
  }

  available(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  async take(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    return new Promise<void>((resolve) => {
      const tryConsume = () => {
        this.refill();
        if (this.tokens >= 1) {
          this.tokens -= 1;
          resolve();
        } else {
          const waitMs = this.refillIntervalMs - ((Date.now() - this.lastRefillAt) % this.refillIntervalMs);
          setTimeout(tryConsume, Math.max(waitMs, 10));
        }
      };
      tryConsume();
    });
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillAt;
    const tokensToAdd = elapsed / this.refillIntervalMs;
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefillAt = now;
  }
}
