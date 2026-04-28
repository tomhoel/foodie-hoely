import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TrumfClient } from '../trumf/client';

const transaksjonerFixture = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__/trumf/transaksjoner-sample.json'), 'utf-8')
);
const detaljerFixture = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__/trumf/detaljer-sample.json'), 'utf-8')
);

describe('TrumfClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('listTransaksjoner sends bearer + fra/til and parses response', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(transaksjonerFixture), { status: 200 }));
    const client = new TrumfClient({ bearer: 'fake-jwt-token-1234567890', fetchImpl: fetchMock });

    const out = await client.listTransaksjoner({ fra: '2026-04-01', til: '2026-04-30' });

    expect(out.transaksjoner).toHaveLength(2);
    expect(out.transaksjoner[0].batchid).toBe('BATCH-2026-04-15-001');
    expect(fetchMock).toHaveBeenCalledOnce();
    const calls = fetchMock.mock.calls as unknown as [Parameters<typeof fetch>];
    const callArgs = calls[0];
    const url = String(callArgs[0]);
    const init = (callArgs[1] ?? {}) as RequestInit;
    expect(url).toContain('/trumf/husstand/transaksjoner');
    expect(url).toContain('fra=2026-04-01');
    expect(url).toContain('til=2026-04-30');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer fake-jwt-token-1234567890');
  });

  it('getTransaksjonDetaljer hits the per-batch endpoint and parses lines', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(detaljerFixture), { status: 200 }));
    const client = new TrumfClient({ bearer: 'fake-jwt-token-1234567890', fetchImpl: fetchMock });

    const out = await client.getTransaksjonDetaljer('BATCH-2026-04-15-001');
    expect(out.batchid).toBe('BATCH-2026-04-15-001');
    expect(out.varer).toHaveLength(4);
    expect(out.varer[3].ean).toBeNull();
    const url = String((fetchMock.mock.calls as unknown as [Parameters<typeof fetch>])[0][0]);
    expect(url).toContain('/trumf/husstand/transaksjoner/detaljer/BATCH-2026-04-15-001');
  });

  it('throws on 401 with a useful message (auth failure)', async () => {
    const fetchMock = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    const client = new TrumfClient({ bearer: 'expired', fetchImpl: fetchMock, maxRetries: 0 });
    await expect(client.listTransaksjoner({ fra: '2026-04-01', til: '2026-04-30' })).rejects.toThrow(/401/);
  });
});
