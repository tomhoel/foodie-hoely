// src/__tests__/cron-auth.test.ts
import { describe, it, expect } from 'vitest';
import { verifyCronAuth } from '../api/cron-auth';

describe('verifyCronAuth', () => {
  it('accepts a matching Bearer token', () => {
    const out = verifyCronAuth({ authorizationHeader: 'Bearer s3cret', expectedSecret: 's3cret' });
    expect(out.ok).toBe(true);
  });

  it('rejects a missing Authorization header', () => {
    const out = verifyCronAuth({ authorizationHeader: null, expectedSecret: 's3cret' });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(401);
      expect(out.message).toMatch(/missing/i);
    }
  });

  it('rejects a wrong-secret Bearer token', () => {
    const out = verifyCronAuth({ authorizationHeader: 'Bearer wrong', expectedSecret: 's3cret' });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(401);
      expect(out.message).toMatch(/invalid|unauthorized/i);
    }
  });

  it('rejects when the expected secret is empty (server misconfigured)', () => {
    const out = verifyCronAuth({ authorizationHeader: 'Bearer s3cret', expectedSecret: '' });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(500);
      expect(out.message).toMatch(/CRON_SECRET/i);
    }
  });
});
