-- PawOS Team & Enterprise Collaboration Platform — Phase 0: Foundations
-- Apply via the Supabase dashboard SQL editor or `supabase db push`,
-- after 20260721000400_organization_invite_acceptance.sql.
--
-- Builds the capability engine, organization policies, generic audit log,
-- and organization workspace container — the four pieces every later phase
-- of the collaboration roadmap depends on. Deliberately keyed on the
-- existing OrgRole strings (owner/billingAdministrator/workspaceAdministrator/
-- member for Team; organizationOwner/organizationAdministrator/
-- itAdministrator/securityAdministrator/billingAdministrator/
-- departmentManager/member for Enterprise) rather than the architecture
-- doc's illustrative 8-role example (Owner/Super Admin/.../Guest/External
-- Collaborator) — those aren't real OrgRole values yet, and adding them
-- here with no membership-flow behind them would be fabricating a feature.
-- The capability table/lookup design is otherwise exactly what was
-- approved; only the seeded role set differs from the doc's example.

-- =========================================================================
-- role_capabilities — the data-driven permission engine. One row per
-- (organization, role, capability) that's actually granted; absence of a
-- row means "not granted" (sparse, not a dense true/false matrix).
-- =========================================================================
create table if not exists role_capabilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  role text not null,
  capability text not null,
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, role, capability)
);

create index if not exists idx_role_capabilities_org on role_capabilities(organization_id);

alter table role_capabilities enable row level security;

-- Any active member (or the owner, pre-membership-row) can read the
-- capability matrix — needed just to render the Roles tab and to evaluate
-- has_capability() for oneself.
create policy role_capabilities_select_own_org on role_capabilities
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

-- =========================================================================
-- has_capability() — the reusable permission-check primitive every later
-- phase (workspaces, work assignment, credits, git collaboration, remote
-- control) is expected to call. Security definer so it can read
-- organization_members / role_capabilities regardless of the caller's own
-- RLS visibility, the same pattern list_my_pending_invites() already uses.
-- =========================================================================
create or replace function has_capability(p_organization_id uuid, p_capability text)
returns boolean
language plpgsql
security definer
stable
as $$
declare
  v_role text;
  v_is_owner boolean;
begin
  select (owner_user_id = auth.uid()) into v_is_owner
  from organizations where id = p_organization_id;

  if v_is_owner then
    return true; -- the org owner always has every capability, unconditionally
  end if;

  select role into v_role
  from organization_members
  where organization_id = p_organization_id
    and user_id = auth.uid()
    and status = 'active'
  limit 1;

  if v_role is null then
    return false;
  end if;

  return exists (
    select 1 from role_capabilities
    where organization_id = p_organization_id
      and role = v_role
      and capability = p_capability
      and allowed = true
  );
end;
$$;

grant execute on function has_capability to authenticated;

-- Writes to the capability matrix require the roles.manage capability
-- itself (or being the owner, covered by has_capability's short-circuit).
create policy role_capabilities_manage_own_org on role_capabilities
  for all using (has_capability(organization_id, 'roles.manage'))
  with check (has_capability(organization_id, 'roles.manage'));

-- =========================================================================
-- organization_policies — org-level governance settings (Section 15 of the
-- architecture doc). Key/value so new policy keys never need a migration.
-- =========================================================================
create table if not exists organization_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  policy_key text not null,
  policy_value jsonb not null default '{}',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (organization_id, policy_key)
);

alter table organization_policies enable row level security;

create policy organization_policies_select_own_org on organization_policies
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

create policy organization_policies_manage_own_org on organization_policies
  for all using (has_capability(organization_id, 'policies.manage'))
  with check (has_capability(organization_id, 'policies.manage'));

-- =========================================================================
-- audit_log — generic append-only trail. Every later phase's collaboration
-- timeline (Section 13) extends this same table rather than each feature
-- keeping its own log.
-- =========================================================================
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_org_created on audit_log(organization_id, created_at desc);

alter table audit_log enable row level security;

create policy audit_log_view_own_org on audit_log
  for select using (has_capability(organization_id, 'audit.view'));

-- Inserts only ever happen via the trigger function below (security definer),
-- never directly from the client — no insert policy is granted to authenticated.

-- =========================================================================
-- log_audit_event() — generic trigger function attached to every table
-- whose changes should be audited. Diffs old/new as jsonb.
-- =========================================================================
create or replace function log_audit_event()
returns trigger
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
  v_action text;
begin
  v_org_id := coalesce(new.organization_id, old.organization_id);

  if tg_op = 'INSERT' then
    v_action := 'created';
  elsif tg_op = 'UPDATE' then
    v_action := 'updated';
  elsif tg_op = 'DELETE' then
    v_action := 'deleted';
  end if;

  insert into audit_log (organization_id, actor_user_id, action, entity_type, entity_id, before_value, after_value)
  values (
    v_org_id,
    auth.uid(),
    v_action,
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_role_capabilities on role_capabilities;
create trigger trg_audit_role_capabilities
  after insert or update or delete on role_capabilities
  for each row execute function log_audit_event();

drop trigger if exists trg_audit_organization_policies on organization_policies;
create trigger trg_audit_organization_policies
  after insert or update or delete on organization_policies
  for each row execute function log_audit_event();

drop trigger if exists trg_audit_organization_members on organization_members;
create trigger trg_audit_organization_members
  after insert or update or delete on organization_members
  for each row execute function log_audit_event();

-- =========================================================================
-- organization_workspaces — the workspace container (Section 2). Projects,
-- shared documents, etc. attach to this in later phases; Phase 0 ships the
-- container only, per the approved roadmap.
-- =========================================================================
create table if not exists organization_workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_organization_workspaces_org on organization_workspaces(organization_id);

alter table organization_workspaces enable row level security;

create policy organization_workspaces_select_own_org on organization_workspaces
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

create policy organization_workspaces_manage_own_org on organization_workspaces
  for all using (has_capability(organization_id, 'workspaces.manage'))
  with check (has_capability(organization_id, 'workspaces.manage'));

drop trigger if exists trg_audit_organization_workspaces on organization_workspaces;
create trigger trg_audit_organization_workspaces
  after insert or update or delete on organization_workspaces
  for each row execute function log_audit_event();

-- =========================================================================
-- Seed default capability grants — matches exactly what
-- src/shared/organization/OrgPermissions.ts already enforces in the client
-- today (members.manage ~ canManageMembers, billing.manage ~
-- canManageBilling, workspaces.manage ~ canManageWorkspaces,
-- organization.manage ~ canManageOrganization), plus three new
-- capabilities Phase 0 itself introduces (roles.manage, policies.manage,
-- audit.view). itAdministrator/securityAdministrator get nothing yet —
-- their real capabilities are infrastructure/security-runtime-specific
-- and those runtimes aren't organization-aware until a later phase; an
-- empty grant set for them now is honest, not a bug.
-- =========================================================================
create or replace function seed_default_role_capabilities(p_organization_id uuid)
returns void
language plpgsql
as $$
begin
  insert into role_capabilities (organization_id, role, capability, allowed)
  values
    -- members.manage
    (p_organization_id, 'owner', 'members.manage', true),
    (p_organization_id, 'workspaceAdministrator', 'members.manage', true),
    (p_organization_id, 'organizationOwner', 'members.manage', true),
    (p_organization_id, 'organizationAdministrator', 'members.manage', true),
    -- billing.manage
    (p_organization_id, 'owner', 'billing.manage', true),
    (p_organization_id, 'billingAdministrator', 'billing.manage', true),
    (p_organization_id, 'organizationOwner', 'billing.manage', true),
    (p_organization_id, 'organizationAdministrator', 'billing.manage', true),
    -- workspaces.manage
    (p_organization_id, 'owner', 'workspaces.manage', true),
    (p_organization_id, 'workspaceAdministrator', 'workspaces.manage', true),
    (p_organization_id, 'organizationOwner', 'workspaces.manage', true),
    (p_organization_id, 'organizationAdministrator', 'workspaces.manage', true),
    (p_organization_id, 'departmentManager', 'workspaces.manage', true),
    -- organization.manage
    (p_organization_id, 'owner', 'organization.manage', true),
    (p_organization_id, 'organizationOwner', 'organization.manage', true),
    -- roles.manage (new)
    (p_organization_id, 'owner', 'roles.manage', true),
    (p_organization_id, 'organizationOwner', 'roles.manage', true),
    -- policies.manage (new)
    (p_organization_id, 'owner', 'policies.manage', true),
    (p_organization_id, 'organizationOwner', 'policies.manage', true),
    -- audit.view (new)
    (p_organization_id, 'owner', 'audit.view', true),
    (p_organization_id, 'workspaceAdministrator', 'audit.view', true),
    (p_organization_id, 'organizationOwner', 'audit.view', true),
    (p_organization_id, 'organizationAdministrator', 'audit.view', true)
  on conflict (organization_id, role, capability) do nothing;
end;
$$;

-- Backfill: seed capabilities for every organization that already exists
-- (e.g. Revanta AI, created during live testing before this migration).
do $$
declare
  v_org record;
begin
  for v_org in select id from organizations loop
    perform seed_default_role_capabilities(v_org.id);
  end loop;
end;
$$;

-- Going forward: seed automatically whenever a new organization is created.
create or replace function trg_seed_role_capabilities_fn()
returns trigger
language plpgsql
as $$
begin
  perform seed_default_role_capabilities(new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_role_capabilities on organizations;
create trigger trg_seed_role_capabilities
  after insert on organizations
  for each row execute function trg_seed_role_capabilities_fn();

grant execute on function seed_default_role_capabilities to authenticated;
