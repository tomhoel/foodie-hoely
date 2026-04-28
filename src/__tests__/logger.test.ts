import { describe, it, expect } from 'vitest';
import { formatLogLine } from '../api/logger';

describe('formatLogLine', () => {
  it('produces a single-line JSON string with event, timestamp, and rest of fields', () => {
    const out = formatLogLine({ event: 'cron.success', name: 'sync', durationMs: 1234 });
    expect(out).not.toContain('\n');
    const parsed = JSON.parse(out);
    expect(parsed.event).toBe('cron.success');
    expect(parsed.name).toBe('sync');
    expect(parsed.durationMs).toBe(1234);
    expect(typeof parsed.timestamp).toBe('string');
    expect(new Date(parsed.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('includes nested objects untouched', () => {
    const out = formatLogLine({ event: 'cron.failure', name: 'plan-week', error: { message: 'boom', code: 'E_BOOM' } });
    const parsed = JSON.parse(out);
    expect(parsed.error).toEqual({ message: 'boom', code: 'E_BOOM' });
  });
});
