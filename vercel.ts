import { type VercelConfig } from '@vercel/config/v1';

// See spec §9.1 (cron schedule).
// All paths return JSON; cron auth is enforced via Authorization: Bearer ${CRON_SECRET}.
// Vercel injects the bearer header automatically when calling /api/cron/* paths.

export const config: VercelConfig = {
  framework: 'nextjs',
  // Region: fra1 (Frankfurt) for EU residency + lowest Supabase EU latency.
  regions: ['fra1'],
  functions: {
    'app/api/**/*.ts': {
      maxDuration: 300,
    },
    'app/api/cron/plan-week/route.ts': {
      maxDuration: 600, // planner + email can take 1-2 min
    },
    'app/api/cron/sync/route.ts': {
      maxDuration: 300,
    },
  },
  crons: [
    // Daily ingestion refresh — kassalapp updates ~07:00 UTC, etilbudsavis flyer windows roll Sun→Mon.
    { path: '/api/cron/sync', schedule: '0 4 * * *' },
    // Sunday plan + email at 06:00 UTC = 07:00 Oslo (Norway is UTC+1 in winter, +2 summer).
    { path: '/api/cron/plan-week', schedule: '0 6 * * 0' },
    // Monthly pantry audit on the 1st at 09:00 UTC.
    { path: '/api/cron/audit-month', schedule: '0 9 1 * *' },
    // Health-check ping every hour — proves cron mechanism + catches deploy regressions.
    { path: '/api/health', schedule: '0 * * * *' },
  ],
};
