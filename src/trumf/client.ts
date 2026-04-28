import { z } from 'zod';
import { TrumfTransaksjonerResponse, TrumfTransaksjonDetaljer } from './schemas';

const DEFAULT_BASE = 'https://platform-rest-prod.ngdata.no';
const USER_AGENT = 'Foodie/0.1 (Phase-1 personal use; +https://github.com/tomhoel/foodie-hoely)';

export interface TrumfClientOptions {
  bearer: string;
  baseUrl?: string;
  /** Test seam — defaults to global fetch. */
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  baseBackoffMs?: number;
}

export class TrumfClient {
  private readonly bearer: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;

  constructor(opts: TrumfClientOptions) {
    if (!opts.bearer) throw new Error('TrumfClient: bearer is required');
    this.bearer = opts.bearer;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxRetries = opts.maxRetries ?? 2;
    this.baseBackoffMs = opts.baseBackoffMs ?? 500;
  }

  async listTransaksjoner(args: { fra: string; til: string }): Promise<z.infer<typeof TrumfTransaksjonerResponse>> {
    const url = `${this.baseUrl}/trumf/husstand/transaksjoner?fra=${encodeURIComponent(args.fra)}&til=${encodeURIComponent(args.til)}`;
    return this.requestJson(url, TrumfTransaksjonerResponse);
  }

  async getTransaksjonDetaljer(batchid: string): Promise<z.infer<typeof TrumfTransaksjonDetaljer>> {
    if (!batchid) throw new Error('getTransaksjonDetaljer: batchid is required');
    const url = `${this.baseUrl}/trumf/husstand/transaksjoner/detaljer/${encodeURIComponent(batchid)}`;
    return this.requestJson(url, TrumfTransaksjonDetaljer);
  }

  private async requestJson<S extends z.ZodTypeAny>(url: string, schema: S): Promise<z.infer<S>> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await this.fetchImpl(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.bearer}`,
            'Accept': 'application/json',
            'User-Agent': USER_AGENT,
          },
        });
        if (res.status === 401 || res.status === 403) {
          throw new Error(`Trumf ${res.status} (auth) — token may be expired. Re-run \`npm run trumf-set-token\`.`);
        }
        if (res.status >= 500 || res.status === 429) {
          if (attempt < this.maxRetries) {
            await this.sleep(this.backoff(attempt));
            continue;
          }
          throw new Error(`Trumf ${res.status} after ${attempt + 1} attempts: ${url}`);
        }
        if (!res.ok) {
          throw new Error(`Trumf ${res.status}: ${url}`);
        }
        const json = await res.json();
        const parsed = schema.safeParse(json);
        if (!parsed.success) {
          throw new Error(`Trumf response failed schema validation: ${parsed.error.message}`);
        }
        return parsed.data;
      } catch (e) {
        lastErr = e;
        // Re-throw immediately on auth/parse errors (their message is user-actionable).
        if (e instanceof Error && /^Trumf (401|403|response)/.test(e.message)) throw e;
        if (attempt >= this.maxRetries) throw e;
        await this.sleep(this.backoff(attempt));
      }
    }
    throw new Error(`Trumf: exhausted retries on ${url}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
  }

  private backoff(attempt: number): number {
    return this.baseBackoffMs * Math.pow(2, attempt);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
