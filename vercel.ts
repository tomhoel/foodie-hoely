import { type VercelConfig } from '@vercel/config/v1';

// See spec §4 (Vercel platform status) and §9.1 (cron schedule).
// Cron schedules expand in Plans B/C/D/E as new endpoints land.
// Currently includes only the health endpoint and a stub no-op cron
// to confirm the cron mechanism works.

export const config: VercelConfig = {
  framework: 'nextjs',
  // Region: fra1 (Frankfurt) for EU residency + lowest Supabase EU latency.
  regions: ['fra1'],
  functions: {
    'app/api/**/*.ts': {
      maxDuration: 300, // default; Plan E raises planner worker to 600s
    },
  },
  crons: [
    // Health-check ping every hour — proves cron mechanism works,
    // also catches any deploy regressions early.
    { path: '/api/health', schedule: '0 * * * *' },
  ],
};
