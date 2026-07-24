-- PawOS Team & Enterprise Collaboration Platform — Phase 2: Activity,
-- Work Assignment & Temporary Permissions. Apply via the Supabase
-- dashboard SQL editor or `supabase db push`, after
-- 20260721000700_phase1_fix_owner_insert_policies.sql.
--
-- Builds: task lifecycle (workspace_tasks), project-level member
-- assignment (workspace_project_members), and time-bound temporary
-- permission grants (organization_temporary_permissions) that has_capability()
-- now also honors. Activity Dashboard and reporting are NOT new tables —
-- they are a read-side aggregation (in the renderer) over audit_log +
-- workspace_tasks + workspace_projects + credit usage, all of which
-- already exist; adding a parallel event-log table here would duplicate
-- data audit_log already captures.
--
-- Temporary-permission expiration note: there is no evidence pg_cron (or
-- any scheduled-job extension) is enabled on this Supabase project, and
-- adding a dependency on one would be a bigger architectural commitment
-- than this phase calls for. Expiration is instead enforced exactly like
-- JWT expiry already is elsewhere in this app: has_capability() compares
-- expires_at against now() on every check, so an expired grant is
-- treated as gone on the very next permission check — "automatic" from
-- the caller's perspective, without a background job. Rows are not
-- physically deleted on expiry (so the audit trail retains the grant's
-- history); `revoked_at` is for an explicit early revoke distinct from
-- natural expiry.

-- =========================================================================
-- workspace_tasks — the task-lifecycle entity. Org-wide visible (matches
-- the workspace_projects visibility precedent); any active member can
-- create their own task, the creator/assignee/a tasks.manage holder can
-- update it, matching Phase 1's "user-generated content" write pattern.
-- =========================================================================
create table if not exists workspace_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references organization_workspaces(id) on delete cascade,
  project_id uuid references workspace_projects(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  progress_percent int not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  assigned_to uuid references auth.users(id),
  due_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_tasks_workspace on workspace_tasks(workspace_id);
create index if not exists idx_workspace_tasks_project on workspace_tasks(project_id);
create index if not exists idx_workspace_tasks_org on workspace_tasks(organization_id);
create index if not exists idx_workspace_tasks_assigned on workspace_tasks(assigned_to);

alter table workspace_tasks enable row level security;

create policy workspace_tasks_select_own_org on workspace_tasks
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

create policy workspace_tasks_insert_own_org on workspace_tasks
  for insert with check (
    (is_org_member(organization_id, auth.uid()) or organization_id in (select id from organizations where owner_user_id = auth.uid()))
    and created_by = auth.uid()
  );

create policy workspace_tasks_manage_own_org on workspace_tasks
  for update using (
    created_by = auth.uid() or assigned_to = auth.uid() or has_capability(organization_id, 'tasks.manage')
  ) with check (
    created_by = auth.uid() or assigned_to = auth.uid() or has_capability(organization_id, 'tasks.manage')
  );

create policy workspace_tasks_delete_own_org on workspace_tasks
  for delete using (created_by = auth.uid() or has_capability(organization_id, 'tasks.manage'));

drop trigger if exists trg_audit_workspace_tasks on workspace_tasks;
create trigger trg_audit_workspace_tasks
  after insert or update or delete on workspace_tasks
  for each row execute function log_audit_event();

-- =========================================================================
-- workspace_project_members — project-level assignment (distinct from
-- workspace-level membership in Phase 1's organization_workspace_members).
-- A project's own owner/creator can assign members to their project
-- without needing org-wide projects.manage, mirroring how a task's
-- assignee/creator can update it without tasks.manage.
-- =========================================================================
create table if not exists workspace_project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references workspace_projects(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  added_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create index if not exists idx_workspace_project_members_project on workspace_project_members(project_id);
create index if not exists idx_workspace_project_members_org on workspace_project_members(organization_id);

alter table workspace_project_members enable row level security;

create policy workspace_project_members_select_own_org on workspace_project_members
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

create policy workspace_project_members_manage_own_org on workspace_project_members
  for all using (
    has_capability(organization_id, 'projects.manage')
    or project_id in (select id from workspace_projects where owner_user_id = auth.uid() or created_by = auth.uid())
  ) with check (
    has_capability(organization_id, 'projects.manage')
    or project_id in (select id from workspace_projects where owner_user_id = auth.uid() or created_by = auth.uid())
  );

drop trigger if exists trg_audit_workspace_project_members on workspace_project_members;
create trigger trg_audit_workspace_project_members
  after insert or update or delete on workspace_project_members
  for each row execute function log_audit_event();

-- =========================================================================
-- organization_temporary_permissions — time-bound elevation of a single
-- capability for a single user. Granting/revoking is held to the same
-- bar as roles.manage (permissions.grant, seeded narrowly below).
-- =========================================================================
create table if not exists organization_temporary_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  reason text
);

create index if not exists idx_org_temp_permissions_org on organization_temporary_permissions(organization_id);
create index if not exists idx_org_temp_permissions_user on organization_temporary_permissions(user_id);

alter table organization_temporary_permissions enable row level security;

create policy org_temp_permissions_select_own_org on organization_temporary_permissions
  for select using (
    user_id = auth.uid()
    or has_capability(organization_id, 'permissions.grant')
  );

create policy org_temp_permissions_manage_own_org on organization_temporary_permissions
  for all using (has_capability(organization_id, 'permissions.grant'))
  with check (has_capability(organization_id, 'permissions.grant'));

drop trigger if exists trg_audit_org_temp_permissions on organization_temporary_permissions;
create trigger trg_audit_org_temp_permissions
  after insert or update or delete on organization_temporary_permissions
  for each row execute function log_audit_event();

-- =========================================================================
-- has_capability() — extended (additive, backward compatible) to also
-- honor a live temporary grant when the role-based check would otherwise
-- return false. Every existing caller keeps working exactly as before;
-- this only adds a new way to return true.
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
  v_has_temp_grant boolean;
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

  if v_role is not null and exists (
    select 1 from role_capabilities
    where organization_id = p_organization_id
      and role = v_role
      and capability = p_capability
      and allowed = true
  ) then
    return true;
  end if;

  select exists (
    select 1 from organization_temporary_permissions
    where organization_id = p_organization_id
      and user_id = auth.uid()
      and capability = p_capability
      and expires_at > now()
      and revoked_at is null
  ) into v_has_temp_grant;

  return coalesce(v_has_temp_grant, false);
end;
$$;

grant execute on function has_capability to authenticated;

-- =========================================================================
-- Seed the two new Phase 2 capabilities. tasks.manage mirrors
-- projects.manage's seed set; permissions.grant is held as narrowly as
-- roles.manage (owner/organizationOwner only) since it can grant any
-- other capability, temporarily, to anyone.
-- =========================================================================
create or replace function seed_phase2_role_capabilities(p_organization_id uuid)
returns void
language plpgsql
as $$
begin
  insert into role_capabilities (organization_id, role, capability, allowed)
  values
    -- tasks.manage
    (p_organization_id, 'owner', 'tasks.manage', true),
    (p_organization_id, 'workspaceAdministrator', 'tasks.manage', true),
    (p_organization_id, 'organizationOwner', 'tasks.manage', true),
    (p_organization_id, 'organizationAdministrator', 'tasks.manage', true),
    (p_organization_id, 'departmentManager', 'tasks.manage', true),
    -- permissions.grant
    (p_organization_id, 'owner', 'permissions.grant', true),
    (p_organization_id, 'organizationOwner', 'permissions.grant', true)
  on conflict (organization_id, role, capability) do nothing;
end;
$$;

do $$
declare
  v_org record;
begin
  for v_org in select id from organizations loop
    perform seed_phase2_role_capabilities(v_org.id);
  end loop;
end;
$$;

create or replace function trg_seed_phase2_fn()
returns trigger
language plpgsql
as $$
begin
  perform seed_phase2_role_capabilities(new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_phase2 on organizations;
create trigger trg_seed_phase2
  after insert on organizations
  for each row execute function trg_seed_phase2_fn();

grant execute on function seed_phase2_role_capabilities to authenticated;
