-- PawOS Team & Enterprise Collaboration Platform — Phase 3: Git &
-- Deployment Collaboration. Apply via the Supabase dashboard SQL editor or
-- `supabase db push`, after 20260721000800_phase2_activity_assignment_temp_permissions.sql.
--
-- Builds: organization-visible repository links (organization_repositories),
-- advisory branch ownership (branch_ownership), and recorded PR reviews
-- (pull_request_reviews) — plus an additive extension of Phase 2's
-- workspace_tasks so a task can represent a code-review or deployment
-- work assignment, matching the roadmap's Work Assignment "type" concept.
--
-- Architecture note (disclosed): Infrastructure Runtime's actual connectors
-- (GitHub/GitLab/hosting) remain the single-tenant, env-var-token model
-- built in earlier runtimes — this phase does not introduce an org-scoped
-- credential vault (that is a larger, not-yet-scheduled commitment). What
-- this phase adds is the org-shared collaboration layer on top: which
-- repos a workspace project uses, who owns which branch, what a PR review
-- said, and an assignable/trackable task for "this needs a deploy" —
-- reusing workspace_tasks exactly as Phase 2 built it. Actually executing
-- a deploy still goes through the existing local, confirmation-gated
-- deployProject action; a deployment-type task is a shared record of
-- intent/assignment/status, not a remote trigger for another member's
-- machine.

-- =========================================================================
-- organization_repositories — links a GitHub/GitLab repo to a workspace
-- (and optionally a specific project). Org-wide visible like
-- workspace_projects; managed by repositories.manage (seeded below) or
-- the org owner, mirroring projects.manage's write pattern.
-- =========================================================================
create table if not exists organization_repositories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references organization_workspaces(id) on delete cascade,
  project_id uuid references workspace_projects(id) on delete set null,
  provider text not null check (provider in ('github', 'gitlab')),
  full_name text not null,
  default_branch text not null default 'main',
  connected_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, provider, full_name)
);

create index if not exists idx_organization_repositories_workspace on organization_repositories(workspace_id);
create index if not exists idx_organization_repositories_project on organization_repositories(project_id);
create index if not exists idx_organization_repositories_org on organization_repositories(organization_id);

alter table organization_repositories enable row level security;

create policy organization_repositories_select_own_org on organization_repositories
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

create policy organization_repositories_manage_own_org on organization_repositories
  for all using (
    has_capability(organization_id, 'repositories.manage')
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  ) with check (
    has_capability(organization_id, 'repositories.manage')
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

drop trigger if exists trg_audit_organization_repositories on organization_repositories;
create trigger trg_audit_organization_repositories
  after insert or update or delete on organization_repositories
  for each row execute function log_audit_event();

-- =========================================================================
-- branch_ownership — advisory only (not enforced by git itself), same
-- write pattern as Phase 1/2's user-generated content: any active member
-- can claim/update their own row; repositories.manage or the org owner
-- can manage any row.
-- =========================================================================
create table if not exists branch_ownership (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  repository_id uuid not null references organization_repositories(id) on delete cascade,
  branch_name text not null,
  owner_user_id uuid not null references auth.users(id),
  linked_task_id uuid references workspace_tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (repository_id, branch_name)
);

create index if not exists idx_branch_ownership_repository on branch_ownership(repository_id);
create index if not exists idx_branch_ownership_org on branch_ownership(organization_id);
create index if not exists idx_branch_ownership_owner on branch_ownership(owner_user_id);

alter table branch_ownership enable row level security;

create policy branch_ownership_select_own_org on branch_ownership
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

create policy branch_ownership_insert_own_org on branch_ownership
  for insert with check (
    (is_org_member(organization_id, auth.uid()) or organization_id in (select id from organizations where owner_user_id = auth.uid()))
    and (owner_user_id = auth.uid() or has_capability(organization_id, 'repositories.manage'))
  );

create policy branch_ownership_manage_own_org on branch_ownership
  for update using (
    owner_user_id = auth.uid() or has_capability(organization_id, 'repositories.manage')
  ) with check (
    owner_user_id = auth.uid() or has_capability(organization_id, 'repositories.manage')
  );

create policy branch_ownership_delete_own_org on branch_ownership
  for delete using (owner_user_id = auth.uid() or has_capability(organization_id, 'repositories.manage'));

drop trigger if exists trg_audit_branch_ownership on branch_ownership;
create trigger trg_audit_branch_ownership
  after insert or update or delete on branch_ownership
  for each row execute function log_audit_event();

-- =========================================================================
-- pull_request_reviews — a recorded review (AI-generated or human),
-- optionally linked to a workspace_tasks code-review assignment. Any
-- active member can record a review (e.g. after running the AI review
-- plugin locally and choosing to save it to the organization); update
-- restricted to the creator or repositories.manage, matching the
-- creator/*.manage pattern used everywhere else in Phase 1/2.
-- =========================================================================
create table if not exists pull_request_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  repository_id uuid not null references organization_repositories(id) on delete cascade,
  pr_number int not null,
  task_id uuid references workspace_tasks(id) on delete set null,
  reviewer_kind text not null check (reviewer_kind in ('ai', 'human')),
  reviewer_user_id uuid references auth.users(id),
  summary text not null,
  verdict text not null check (verdict in ('approve', 'request_changes', 'comment')),
  posted_to_provider boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_pull_request_reviews_repository on pull_request_reviews(repository_id);
create index if not exists idx_pull_request_reviews_org on pull_request_reviews(organization_id);
create index if not exists idx_pull_request_reviews_task on pull_request_reviews(task_id);

alter table pull_request_reviews enable row level security;

create policy pull_request_reviews_select_own_org on pull_request_reviews
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

create policy pull_request_reviews_insert_own_org on pull_request_reviews
  for insert with check (
    (is_org_member(organization_id, auth.uid()) or organization_id in (select id from organizations where owner_user_id = auth.uid()))
    and created_by = auth.uid()
  );

create policy pull_request_reviews_manage_own_org on pull_request_reviews
  for update using (created_by = auth.uid() or has_capability(organization_id, 'repositories.manage'))
  with check (created_by = auth.uid() or has_capability(organization_id, 'repositories.manage'));

create policy pull_request_reviews_delete_own_org on pull_request_reviews
  for delete using (created_by = auth.uid() or has_capability(organization_id, 'repositories.manage'));

drop trigger if exists trg_audit_pull_request_reviews on pull_request_reviews;
create trigger trg_audit_pull_request_reviews
  after insert or update or delete on pull_request_reviews
  for each row execute function log_audit_event();

-- =========================================================================
-- workspace_tasks — additive extension (Phase 2's table, unchanged for
-- existing rows: task_type defaults to 'general', repository_id/pr_number
-- default to null). Lets a task represent a code-review or deployment
-- work assignment per the roadmap's Section 8/11 "type" concept, without
-- creating a parallel assignment table.
-- =========================================================================
alter table workspace_tasks
  add column if not exists task_type text not null default 'general'
    check (task_type in ('general', 'code_review', 'deployment')),
  add column if not exists repository_id uuid references organization_repositories(id) on delete set null,
  add column if not exists pr_number int;

create index if not exists idx_workspace_tasks_repository on workspace_tasks(repository_id);

-- =========================================================================
-- Seed the one new Phase 3 capability. repositories.manage mirrors
-- projects.manage's seed set — connecting/managing org repos and branch
-- ownership/review records is a project-management-adjacent action, not
-- a higher-trust one.
-- =========================================================================
create or replace function seed_phase3_role_capabilities(p_organization_id uuid)
returns void
language plpgsql
as $$
begin
  insert into role_capabilities (organization_id, role, capability, allowed)
  values
    (p_organization_id, 'owner', 'repositories.manage', true),
    (p_organization_id, 'workspaceAdministrator', 'repositories.manage', true),
    (p_organization_id, 'organizationOwner', 'repositories.manage', true),
    (p_organization_id, 'organizationAdministrator', 'repositories.manage', true),
    (p_organization_id, 'departmentManager', 'repositories.manage', true)
  on conflict (organization_id, role, capability) do nothing;
end;
$$;

do $$
declare
  v_org record;
begin
  for v_org in select id from organizations loop
    perform seed_phase3_role_capabilities(v_org.id);
  end loop;
end;
$$;

create or replace function trg_seed_phase3_fn()
returns trigger
language plpgsql
as $$
begin
  perform seed_phase3_role_capabilities(new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_phase3 on organizations;
create trigger trg_seed_phase3
  after insert on organizations
  for each row execute function trg_seed_phase3_fn();

grant execute on function seed_phase3_role_capabilities to authenticated;
