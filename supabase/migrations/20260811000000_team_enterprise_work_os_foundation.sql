-- PawOS Team/Enterprise Work Operating System Foundation.
--
-- Additive only: extends the existing organization/workspace/task/RBAC
-- foundation. It does not create billing, usage, runtime entitlement, or
-- execution systems. Execution remains DesktopExecutionEngine-bound.

create table if not exists organization_teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  lead_user_id uuid references auth.users(id) on delete set null,
  member_user_ids uuid[] not null default '{}',
  role_refs text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists idx_organization_teams_org on organization_teams(organization_id);
create index if not exists idx_organization_teams_lead on organization_teams(lead_user_id);

alter table organization_teams enable row level security;

create policy organization_teams_select_own_org on organization_teams
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

create policy organization_teams_manage_own_org on organization_teams
  for all using (
    has_capability(organization_id, 'work.plan.manage')
    or has_capability(organization_id, 'work.assign')
  ) with check (
    has_capability(organization_id, 'work.plan.manage')
    or has_capability(organization_id, 'work.assign')
  );

drop trigger if exists trg_audit_organization_teams on organization_teams;
create trigger trg_audit_organization_teams
  after insert or update or delete on organization_teams
  for each row execute function log_audit_event();

alter table workspace_tasks
  add column if not exists team_id uuid references organization_teams(id) on delete set null,
  add column if not exists dependency_task_ids uuid[] not null default '{}',
  add column if not exists required_runtime text,
  add column if not exists allocation_mode text not null default 'manual' check (allocation_mode in ('manual', 'pawos_assisted')),
  add column if not exists assignment_reason text,
  add column if not exists assigned_by uuid references auth.users(id) on delete set null,
  add column if not exists verification_requirements jsonb not null default '[]'::jsonb;

alter table workspace_tasks
  drop constraint if exists workspace_tasks_task_type_check;

alter table workspace_tasks
  add constraint workspace_tasks_task_type_check
  check (task_type in ('general', 'code_review', 'deployment', 'implementation', 'qa', 'bug', 'retest', 'production_verification'));

create index if not exists idx_workspace_tasks_team on workspace_tasks(team_id);
create index if not exists idx_workspace_tasks_required_runtime on workspace_tasks(required_runtime);

create or replace function seed_work_os_role_capabilities(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into role_capabilities (organization_id, role, capability, allowed)
  values
    (p_organization_id, 'owner', 'work.plan.manage', true),
    (p_organization_id, 'owner', 'work.assign', true),
    (p_organization_id, 'owner', 'work.allocate.pawos', true),
    (p_organization_id, 'owner', 'work.activity.view', true),
    (p_organization_id, 'organizationOwner', 'work.plan.manage', true),
    (p_organization_id, 'organizationOwner', 'work.assign', true),
    (p_organization_id, 'organizationOwner', 'work.allocate.pawos', true),
    (p_organization_id, 'organizationOwner', 'work.activity.view', true),
    (p_organization_id, 'organizationAdministrator', 'work.plan.manage', true),
    (p_organization_id, 'organizationAdministrator', 'work.assign', true),
    (p_organization_id, 'organizationAdministrator', 'work.allocate.pawos', true),
    (p_organization_id, 'organizationAdministrator', 'work.activity.view', true),
    (p_organization_id, 'workspaceAdministrator', 'work.plan.manage', true),
    (p_organization_id, 'workspaceAdministrator', 'work.assign', true),
    (p_organization_id, 'workspaceAdministrator', 'work.activity.view', true),
    (p_organization_id, 'departmentManager', 'work.assign', true),
    (p_organization_id, 'departmentManager', 'work.activity.view', true),
    (p_organization_id, 'member', 'work.activity.view', true)
  on conflict (organization_id, role, capability)
  do update set allowed = excluded.allowed;
end;
$$;

do $$
declare
  v_org record;
begin
  for v_org in select id from organizations loop
    perform seed_work_os_role_capabilities(v_org.id);
  end loop;
end;
$$;

create or replace function trg_seed_role_capabilities_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform seed_default_role_capabilities(new.id);
  perform seed_phase1_role_capabilities(new.id);
  perform seed_phase2_role_capabilities(new.id);
  perform seed_phase3_role_capabilities(new.id);
  perform seed_phase5_role_capabilities(new.id);
  perform seed_phase6_role_capabilities(new.id);
  perform seed_billing_task_allowance_capabilities(new.id);
  perform seed_org_job_roles_capability(new.id);
  perform seed_work_os_role_capabilities(new.id);
  return new;
end;
$$;

grant execute on function seed_work_os_role_capabilities to authenticated;
