-- PawOS — Phase 0: Enterprise RLS Foundation
-- Apply via the Supabase dashboard SQL editor or `supabase db push`,
-- after 20260721000300_fix_organization_members_rls_recursion.sql.
--
-- This migration clarifies and extends the authorization model:
-- - is_org_manager() is renamed to is_org_admin() for clarity
--   (it controls "can manage organizational members?" not "can do anything?")
-- - workspaceAdministrator is removed (workspace hierarchies will be added in Phase 2)
-- - is_org_manager() kept as an alias for backward compatibility
-- - can_manage_billing_data() added for billing-specific RLS (used by Phase 2 spending limits)
--
-- No new capabilities are added — they will be added when the resources they protect exist.

-- =========================================================================
-- is_org_admin() — renamed from is_org_manager() for clarity.
-- Gates the ability to manage organization member records.
-- Does NOT include workspaceAdministrator (workspace hierarchies in Phase 2).
-- =========================================================================
create or replace function is_org_admin(check_org_id uuid, check_user_id uuid)
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
      and role in ('owner', 'organizationOwner', 'organizationAdministrator')
  );
$$;

-- =========================================================================
-- is_org_manager() — backward-compatibility alias to is_org_admin().
-- All existing code that calls is_org_manager() continues to work unchanged.
-- =========================================================================
create or replace function is_org_manager(check_org_id uuid, check_user_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select is_org_admin(check_org_id, check_user_id);
$$;

-- =========================================================================
-- can_manage_billing_data() — gates billing-specific data access.
-- Used by Phase 2 (spending limits) to allow billingAdministrator to update
-- spending_limit_per_user_cents on organization_members without allowing
-- general member management (role changes, invitations, etc.).
-- =========================================================================
create or replace function can_manage_billing_data(check_org_id uuid, check_user_id uuid)
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
      and role in ('owner', 'organizationOwner', 'organizationAdministrator', 'billingAdministrator')
  );
$$;

-- =========================================================================
-- Update org_members_manage_own_org to use is_org_admin() explicitly.
-- (Functionally identical to current behavior since is_org_manager was already
--  restricted to these roles, but now the name clarifies intent.)
-- =========================================================================
drop policy if exists org_members_manage_own_org on organization_members;
create policy org_members_manage_own_org on organization_members
  for all using (
    is_org_admin(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

-- =========================================================================
-- Grant execute on new functions to authenticated users.
-- =========================================================================
grant execute on function can_manage_billing_data to authenticated;
