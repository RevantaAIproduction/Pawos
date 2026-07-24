-- PawOS — Fix infinite recursion in organization_members RLS policies
-- Apply via the Supabase dashboard SQL editor or `supabase db push`,
-- after 20260720000000_help_center_phase1.sql.
--
-- org_select_own / org_members_select_own_org / org_members_manage_own_org
-- all queried organization_members from within a policy ON organization_members
-- itself — Postgres detects that self-reference as infinite recursion
-- ("infinite recursion detected in policy for relation organization_members").
-- The fix is the standard one: move the membership check into a
-- `security definer` function, which runs with the privileges of its owner
-- and so bypasses RLS on the inner query instead of re-triggering it.

create or replace function is_org_member(check_org_id uuid, check_user_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from organization_members
    where organization_id = check_org_id
      and user_id = check_user_id
      and status = 'active'
  );
$$;

create or replace function is_org_manager(check_org_id uuid, check_user_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from organization_members
    where organization_id = check_org_id
      and user_id = check_user_id
      and status = 'active'
      and role in ('owner', 'organizationOwner', 'organizationAdministrator', 'workspaceAdministrator')
  );
$$;

drop policy if exists org_select_own on organizations;
create policy org_select_own on organizations
  for select using (
    is_org_member(id, auth.uid())
    or owner_user_id = auth.uid()
  );

drop policy if exists org_members_select_own_org on organization_members;
create policy org_members_select_own_org on organization_members
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

drop policy if exists org_members_manage_own_org on organization_members;
create policy org_members_manage_own_org on organization_members
  for all using (
    is_org_manager(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );
