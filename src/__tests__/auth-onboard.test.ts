import { describe, it, expect, vi } from 'vitest';
import { onboardUser, type OnboardDeps } from '../auth/onboard';

function makeDeps(overrides: Partial<OnboardDeps> = {}): OnboardDeps {
  return {
    findMembershipByUser: vi.fn(async () => null),
    countAllMembers: vi.fn(async () => 0),
    findHouseholdByName: vi.fn(async () => null),
    createHousehold: vi.fn(async ({ name }) => ({ id: `hh-new-${name}`, name })),
    insertMember: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('onboardUser', () => {
  it('returns existing household when user already has a membership', async () => {
    const deps = makeDeps({
      findMembershipByUser: vi.fn(async () => ({ household_id: 'hh-existing' })),
    });
    const out = await onboardUser({ userId: 'u-1', email: 'x@y.z' }, deps);
    expect(out.householdId).toBe('hh-existing');
    expect(out.created).toBe(false);
    expect(deps.createHousehold).not.toHaveBeenCalled();
    expect(deps.insertMember).not.toHaveBeenCalled();
  });

  it('first user (zero memberships) inherits the Default Household', async () => {
    const deps = makeDeps({
      findHouseholdByName: vi.fn(async () => ({ id: 'hh-default', name: 'Default Household' })),
    });
    const out = await onboardUser({ userId: 'u-1', email: 'tom@example.com' }, deps);
    expect(out.householdId).toBe('hh-default');
    expect(out.created).toBe(false);
    expect(deps.createHousehold).not.toHaveBeenCalled();
    expect(deps.insertMember).toHaveBeenCalledWith({ householdId: 'hh-default', userId: 'u-1', role: 'owner' });
  });

  it('first user with no Default Household creates a fresh one named after their email', async () => {
    const deps = makeDeps();
    const out = await onboardUser({ userId: 'u-1', email: 'alice@example.com' }, deps);
    expect(out.householdId).toBe('hh-new-alice');
    expect(out.created).toBe(true);
    expect(deps.createHousehold).toHaveBeenCalledWith({ name: 'alice' });
    expect(deps.insertMember).toHaveBeenCalledWith({ householdId: 'hh-new-alice', userId: 'u-1', role: 'owner' });
  });

  it('subsequent user (members exist) creates a fresh household for them', async () => {
    const deps = makeDeps({
      countAllMembers: vi.fn(async () => 3),
    });
    const out = await onboardUser({ userId: 'u-2', email: 'bob@example.com' }, deps);
    expect(out.householdId).toBe('hh-new-bob');
    expect(out.created).toBe(true);
    expect(deps.findHouseholdByName).not.toHaveBeenCalled();
    expect(deps.insertMember).toHaveBeenCalledWith({ householdId: 'hh-new-bob', userId: 'u-2', role: 'owner' });
  });
});
