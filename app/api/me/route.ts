import { requireAuth, buildProductionAuthDeps, authErrorResponse } from '../../../src/api/auth';
import { onboardUser, type OnboardDeps } from '../../../src/auth/onboard';
import { getSupabase } from '../../../src/db/client';

export const runtime = 'nodejs';

let cachedAuthDeps: Awaited<ReturnType<typeof buildProductionAuthDeps>> | null = null;
async function getAuthDeps() {
  if (!cachedAuthDeps) cachedAuthDeps = await buildProductionAuthDeps();
  return cachedAuthDeps;
}

function buildOnboardDeps(): OnboardDeps {
  const supa = getSupabase();
  return {
    findMembershipByUser: async (userId) => {
      const { data } = await supa
        .from('household_members')
        .select('household_id')
        .eq('user_id', userId)
        .maybeSingle();
      return data ? { household_id: data.household_id as string } : null;
    },
    countAllMembers: async () => {
      const { count } = await supa.from('household_members').select('*', { count: 'exact', head: true });
      return count ?? 0;
    },
    findHouseholdByName: async (name) => {
      const { data } = await supa.from('households').select('id, name').eq('name', name).maybeSingle();
      return data ? { id: data.id as string, name: data.name as string } : null;
    },
    createHousehold: async ({ name }) => {
      const { data, error } = await supa
        .from('households')
        .insert({ name, settings: {} })
        .select('id, name')
        .single();
      if (error || !data) throw new Error(`createHousehold: ${error?.message ?? 'no row'}`);
      return { id: data.id as string, name: data.name as string };
    },
    insertMember: async ({ householdId, userId, role }) => {
      const { error } = await supa
        .from('household_members')
        .insert({ household_id: householdId, user_id: userId, role });
      if (error) throw new Error(`insertMember: ${error.message}`);
    },
  };
}

export async function GET(req: Request) {
  const auth = await requireAuth(req, await getAuthDeps());
  if (!auth.ok) return authErrorResponse(auth);

  const result = await onboardUser({ userId: auth.userId, email: auth.email ?? '' }, buildOnboardDeps());
  return Response.json({
    userId: auth.userId,
    email: auth.email,
    householdId: result.householdId,
    onboarded: result.created,
    note: result.created
      ? 'New household created. Sign in again to refresh your JWT with the household_id claim.'
      : auth.householdId
        ? undefined
        : 'JWT does not yet carry household_id; sign in again to refresh.',
  });
}
