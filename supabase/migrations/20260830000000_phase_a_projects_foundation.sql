-- PawOS Phase A: Project Foundation
--
-- Introduces portable project identity (UUID) with device-specific local path
-- bindings. Projects belong to an organization (team/enterprise) or are personal
-- (organization_id NULL). Device attachments associate a project with a user's
-- local checkout path on a specific device, enabling the same project to exist
-- on multiple devices with different paths.

create table if not exists org_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists idx_org_projects_org on org_projects(organization_id);
create index if not exists idx_org_projects_created_by on org_projects(created_by);

alter table org_projects enable row level security;

-- SELECT: organization members or personal projects by owner
create policy org_projects_select on org_projects
  for select using (
    organization_id is null and created_by = auth.uid()
    or is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

-- UPDATE/DELETE: org admin or project creator
create policy org_projects_manage on org_projects
  for all using (
    created_by = auth.uid()
    or is_org_admin(organization_id, auth.uid())
  ) with check (
    created_by = auth.uid()
    or is_org_admin(organization_id, auth.uid())
  );

drop trigger if exists trg_audit_org_projects on org_projects;
create trigger trg_audit_org_projects
  after insert or update or delete on org_projects
  for each row execute function log_audit_event();

-- Device-specific local path bindings: one project can exist on multiple devices
-- with different paths. User owns their own attachment; device_id comes from
-- DeviceIdentityStore (never client-supplied).
create table if not exists project_user_device_attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references org_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  local_path text not null,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, user_id, device_id)
);

create index if not exists idx_project_attachments_project on project_user_device_attachments(project_id);
create index if not exists idx_project_attachments_user_device on project_user_device_attachments(user_id, device_id);

alter table project_user_device_attachments enable row level security;

-- SELECT: only the owning user
create policy project_attachments_select on project_user_device_attachments
  for select using (user_id = auth.uid());

-- INSERT/UPDATE/DELETE: only the owning user
create policy project_attachments_manage on project_user_device_attachments
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists trg_audit_project_attachments on project_user_device_attachments;
create trigger trg_audit_project_attachments
  after insert or update or delete on project_user_device_attachments
  for each row execute function log_audit_event();
