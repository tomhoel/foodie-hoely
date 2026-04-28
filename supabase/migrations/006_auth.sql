-- Phase 2 W8 — Auth foundation
-- Adds the FK from household_members.user_id → auth.users so the JWT-claim
-- hook can resolve household_id, and registers the custom-access-token hook
-- function. Service role still bypasses RLS; user-scoped policies land in W9.

-- 1. FK on household_members.user_id (was uuid without FK in 005).
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'household_members_user_id_fkey'
      and table_name = 'household_members'
  ) then
    alter table household_members
      add constraint household_members_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- 2. JWT custom-claim hook. Supabase calls this function on every token issuance.
--    It receives an `event` jsonb with `user_id` and `claims`, and returns the
--    same shape with potentially-modified claims.
create or replace function public.foodie_jwt_hook(event jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  hh_id uuid;
  new_claims jsonb;
begin
  -- Look up the user's primary household (first row by joined_at — Phase 1 has 1 per user).
  select household_id into hh_id
  from public.household_members
  where user_id = (event->>'user_id')::uuid
  order by joined_at asc
  limit 1;

  new_claims := coalesce(event->'claims', '{}'::jsonb);
  if hh_id is not null then
    new_claims := new_claims || jsonb_build_object('household_id', hh_id::text);
  end if;

  return jsonb_build_object('claims', new_claims);
end;
$$;

-- 3. Grant the hook to Supabase's auth admin role.
grant execute on function public.foodie_jwt_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.foodie_jwt_hook(jsonb) from authenticated, anon, public;

-- 4. After migration, manually enable the hook in Supabase Dashboard:
--    Auth → Hooks → "Custom Access Token Hook" → select `public.foodie_jwt_hook`.
