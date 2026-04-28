// src/__tests__/cron-handler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wrapCronHandler, type CronHandlerDeps } from '../api/cron-handler';

const validHeaders = (secret: string) => new Headers({ authorization: `Bearer ${secret}` });

function makeRequest(headers: Headers): Request {
  return new Request('http://localhost/api/cron/test', { method: 'GET', headers });
}

function makeDeps(overrides: Partial<CronHandlerDeps> = {}): CronHandlerDeps {
  return {
    cronSecret: 's3cret',
    alertEmail: 'alerts@example.com',
    alertFrom: 'Foodie <noreply@example.com>',
    sendAlert: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('wrapCronHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 when auth fails; handler is not called; no alert sent', async () => {
    const fn = vi.fn(async () => ({ ok: true }));
    const sendAlert = vi.fn(async () => undefined);
    const handler = wrapCronHandler({ name: 'test', fn }, makeDeps({ sendAlert }));
    const res = await handler(makeRequest(new Headers({ authorization: 'Bearer wrong' })));
    expect(res.status).toBe(401);
    expect(fn).not.toHaveBeenCalled();
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('returns 200 with handler result on success; no alert sent', async () => {
    const fn = vi.fn(async () => ({ ok: true, items: 5 }));
    const sendAlert = vi.fn(async () => undefined);
    const handler = wrapCronHandler({ name: 'test', fn }, makeDeps({ sendAlert }));
    const res = await handler(makeRequest(validHeaders('s3cret')));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, items: 5 });
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('returns 500 + sends alert when handler throws', async () => {
    const fn = vi.fn(async () => { throw new Error('boom'); });
    const sendAlert = vi.fn(async () => undefined);
    const handler = wrapCronHandler({ name: 'test', fn }, makeDeps({ sendAlert }));
    const res = await handler(makeRequest(validHeaders('s3cret')));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('boom');
    expect(sendAlert).toHaveBeenCalledOnce();
    const alertArgs = (sendAlert.mock.calls as unknown as [Parameters<CronHandlerDeps['sendAlert']>])[0][0];
    expect(alertArgs.subject).toMatch(/foodie alert/i);
    expect(alertArgs.subject).toMatch(/test/);
    expect(alertArgs.body).toContain('boom');
  });

  it('alert-send failure does not mask original handler error', async () => {
    const fn = vi.fn(async () => { throw new Error('original error'); });
    const sendAlert = vi.fn(async () => { throw new Error('mailer down'); });
    const handler = wrapCronHandler({ name: 'test', fn }, makeDeps({ sendAlert }));
    const res = await handler(makeRequest(validHeaders('s3cret')));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('original error');
  });
});
