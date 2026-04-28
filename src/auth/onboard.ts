export interface OnboardDeps {
  findMembershipByUser: (userId: string) => Promise<{ household_id: string } | null>;
  countAllMembers: () => Promise<number>;
  findHouseholdByName: (name: string) => Promise<{ id: string; name: string } | null>;
  createHousehold: (args: { name: string }) => Promise<{ id: string; name: string }>;
  insertMember: (args: { householdId: string; userId: string; role: 'owner' | 'member' }) => Promise<void>;
}

export interface OnboardResult {
  householdId: string;
  created: boolean;
}

const DEFAULT_HOUSEHOLD_NAME = 'Default Household';

export async function onboardUser(
  user: { userId: string; email: string },
  deps: OnboardDeps
): Promise<OnboardResult> {
  // 1. Already a member of a household → return it.
  const existing = await deps.findMembershipByUser(user.userId);
  if (existing) {
    return { householdId: existing.household_id, created: false };
  }

  // 2. First-user bootstrap: zero members anywhere AND a Default Household exists → claim it.
  const memberCount = await deps.countAllMembers();
  if (memberCount === 0) {
    const def = await deps.findHouseholdByName(DEFAULT_HOUSEHOLD_NAME);
    if (def) {
      await deps.insertMember({ householdId: def.id, userId: user.userId, role: 'owner' });
      return { householdId: def.id, created: false };
    }
  }

  // 3. Otherwise create a fresh household named after the email local-part.
  const localPart = user.email.split('@')[0] || 'household';
  const fresh = await deps.createHousehold({ name: localPart });
  await deps.insertMember({ householdId: fresh.id, userId: user.userId, role: 'owner' });
  return { householdId: fresh.id, created: true };
}
