export interface SupabaseUser {
  id: string;
  email?: string;
}

export interface AuthDeps {
  getUser: (jwt: string) => Promise<{ data: { user: SupabaseUser | null }; error: { message: string } | null }>;
}

export type AuthResult =
  | { ok: true; userId: string; email: string | undefined; householdId: string | undefined }
  | { ok: false; status: 401; message: string };

export async function requireAuth(req: Request, deps: AuthDeps): Promise<AuthResult> {
  const header = req.headers.get('authorization');
  if (!header) return { ok: false, status: 401, message: 'missing Authorization header' };
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, status: 401, message: 'malformed Authorization header' };
  const jwt = match[1];

  const { data, error } = await deps.getUser(jwt);
  if (error || !data.user) {
    return { ok: false, status: 401, message: error?.message ?? 'invalid token' };
  }

  return {
    ok: true,
    userId: data.user.id,
    email: data.user.email,
    householdId: extractHouseholdIdFromJwt(jwt),
  };
}

function extractHouseholdIdFromJwt(jwt: string): string | undefined {
  const parts = jwt.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    const hh = payload.household_id;
    return typeof hh === 'string' ? hh : undefined;
  } catch {
    return undefined;
  }
}

export async function buildProductionAuthDeps(): Promise<AuthDeps> {
  const { createClient } = await import('@supabase/supabase-js');
  const { config } = await import('../config');
  const supa = createClient(config.supabase.url, config.supabase.anonKey);
  return {
    getUser: async (jwt: string) => {
      const r = await supa.auth.getUser(jwt);
      return {
        data: { user: r.data.user ? { id: r.data.user.id, email: r.data.user.email ?? undefined } : null },
        error: r.error ? { message: r.error.message } : null,
      };
    },
  };
}

export function authErrorResponse(result: Extract<AuthResult, { ok: false }>): Response {
  return Response.json({ error: result.message }, { status: result.status });
}
