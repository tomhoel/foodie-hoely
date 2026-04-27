// Smoke test: confirms the Next.js API surface is reachable.
// Used by Vercel health checks and during local dev.
export const runtime = 'nodejs';

export async function GET() {
  return Response.json({
    ok: true,
    service: 'foodie-api',
    timestamp: new Date().toISOString(),
  });
}
