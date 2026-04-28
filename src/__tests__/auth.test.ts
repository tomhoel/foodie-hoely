import { describe, it, expect, vi } from 'vitest';
import { requireAuth, type AuthDeps } from '../api/auth';

function makeReq(token: string | null): Request {
  const headers = new Headers();
  if (token) headers.set('authorization', `Bearer ${token}`);
  return new Request('http://localhost/api/me', { headers });
}

function makeDeps(overrides: Partial<AuthDeps> = {}): AuthDeps {
  return {
    getUser: vi.fn(async () => ({ data: { user: { id: 'u-1', email: 'x@y.z' } }, error: null })),
    ...overrides,
  };
}

describe('requireAuth', () => {
  it('returns userId + email when bearer is valid', async () => {
    const deps = makeDeps();
    const out = await requireAuth(makeReq('valid-jwt'), deps);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.userId).toBe('u-1');
      expect(out.email).toBe('x@y.z');
    }
    expect(deps.getUser).toHaveBeenCalledWith('valid-jwt');
  });

  it('returns 401 when Authorization header is missing', async () => {
    const out = await requireAuth(makeReq(null), makeDeps());
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(401);
      expect(out.message).toMatch(/missing/i);
    }
  });

  it('returns 401 when Supabase rejects the token', async () => {
    const deps = makeDeps({
      getUser: vi.fn(async () => ({ data: { user: null }, error: { message: 'invalid token' } })),
    });
    const out = await requireAuth(makeReq('bad-jwt'), deps);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(401);
      expect(out.message).toMatch(/invalid token/i);
    }
  });

  it('extracts household_id from JWT claims when present', async () => {
    const claimedJwt = 'header.' + Buffer.from(JSON.stringify({ sub: 'u-1', household_id: 'hh-77' })).toString('base64url') + '.sig';
    const deps = makeDeps();
    const out = await requireAuth(makeReq(claimedJwt), deps);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.householdId).toBe('hh-77');
    }
  });

  it('omits householdId when JWT has no household_id claim', async () => {
    const noClaimJwt = 'header.' + Buffer.from(JSON.stringify({ sub: 'u-1' })).toString('base64url') + '.sig';
    const deps = makeDeps();
    const out = await requireAuth(makeReq(noClaimJwt), deps);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.householdId).toBeUndefined();
    }
  });
});
