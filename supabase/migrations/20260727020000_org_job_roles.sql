-- Organization Roles — a third, independent per-member attribute (job
-- title, e.g. "Frontend Engineer") alongside Seat Type (billing) and
-- Permission Role (RBAC). Never affects billing or capabilities; see
-- src/shared/organization/OrgJobRoles.ts for the built-in catalog and ref
-- format. Follows the exact is_org_member()/has_capability()/
-- log_audit_event() pattern established in 20260721000500/000600.
--
-- Built-in roles are fixed TypeScript constants, not rows here — this
-- table only holds an organization's own CUSTOM roles. A member's
-- assigned role is a single opaque ref string (`builtin:<key>` or
-- `custom:<uuid>`) stored on organization_members, resolved client-side —
-- deliberately not a foreign key, since it must resolve against either
-- source without a join, and so future capabilities (role templates,
-- SCIM-synced roles) never require a schema change to this column.

alter table organization_members
  add column if not exists job_role_ref text;

create table if not exists org_job_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  department text,
  archived boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_org_job_roles_org on org_job_roles(organization_id);

alter table org_job_roles enable row level security;

create policy org_job_roles_select_own_org on org_job_roles
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

-- Catalog management (create/rename/archive) is an admin activity, not
-- user-generated content — gated purely by capability, matching how
-- role_capabilities itself is governed (Phase 0's roles.manage pattern),
-- not the "creator or capability holder" pattern used for CRM/workspace
-- content.
create policy org_job_roles_manage_own_org on org_job_roles
  for all using (has_capability(organization_id, 'org_roles.manage'))
  with check (has_capability(organization_id, 'org_roles.manage'));

drop trigger if exists trg_audit_org_job_roles on org_job_roles;
create trigger trg_audit_org_job_roles
  after insert or update or delete on org_job_roles
  for each row execute function log_audit_event();

-- =========================================================================
-- Seed the org_roles.manage capability for every existing organization,
-- and extend seeding so new orgs get it automatically. Mirrors the same
-- role span as members.manage (owner/workspaceAdministrator/
-- organizationOwner/organizationAdministrator) since assigning a
-- teammate's job title is a member-management-adjacent activity.
-- =========================================================================
create or replace function seed_org_job_roles_capability(p_organization_id uuid)
returns void
language plpgsql
as $$
begin
  insert into role_capabilities (organization_id, role, capability, allowed)
  values
    (p_organization_id, 'owner', 'org_roles.manage', true),
    (p_organization_id, 'workspaceAdministrator', 'org_roles.manage', true),
    (p_organization_id, 'organizationOwner', 'org_roles.manage', true),
    (p_organization_id, 'organizationAdministrator', 'org_roles.manage', true)
  on conflict (organization_id, role, capability) do nothing;
end;
$$;

do $$
declare
  v_org record;
begin
  for v_org in select id from organizations loop
    perform seed_org_job_roles_capability(v_org.id);
  end loop;
end;
$$;

create or replace function trg_seed_org_job_roles_capability_fn()
returns trigger
language plpgsql
as $$
begin
  perform seed_org_job_roles_capability(new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_org_job_roles_capability on organizations;
create trigger trg_seed_org_job_roles_capability
  after insert on organizations
  for each row execute function trg_seed_org_job_roles_capability_fn();

grant execute on function seed_org_job_roles_capability to authenticated;
