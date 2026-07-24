-- PawOS Team & Enterprise Collaboration Platform — Phase 1: Organization
-- Shared Data. Apply via the Supabase dashboard SQL editor or
-- `supabase db push`, after 20260721000500_phase0_rbac_workspaces_audit.sql.
--
-- Builds: workspace membership/settings, shared projects, shared
-- documentation metadata, shared research sessions, organization-shared CRM
-- (contacts/companies/meeting summaries/follow-ups), and organization credit
-- pools. Reuses Phase 0's has_capability()/is_org_member()/log_audit_event()
-- primitives throughout — no parallel permission or audit mechanism is
-- introduced.
--
-- Deliberate deviation, flagged per the "stop and explain" rule: the
-- Communication Runtime itself (src/main/communication/*) stays 100%
-- local-first and untouched. There is no "Org Sync Agent" module anywhere
-- in the repo to extend (searched thoroughly — it does not exist yet as
-- code, only as a name in the approved architecture doc). The org-shared
-- CRM tables below are therefore an explicit, opt-in projection: a member
-- chooses to "share" a local contact/company/summary/follow-up into the
-- org, which writes a new row here. Local data is never automatically
-- uploaded, nothing here reads or migrates contacts.db/companies.db/
-- intelligence.db, and local-only usage is completely unaffected. This is
-- the "Org Sync Agent" concept realized as a thin, explicit bridge rather
-- than a background sync daemon — safer for a local-first product and
-- consistent with "extend incrementally, don't rewrite existing runtimes."
--
-- Write-permission pattern note: Phase 0's tables (role_capabilities,
-- organization_policies) are pure RBAC/governance data, so writes there are
-- capability-gated only. The tables below are user-generated collaboration
-- content (a shared contact, a shared project), so the write policy is
-- "any active member can create their own; the creator or a capability
-- holder can edit/delete" — matching how a real team actually contributes
-- CRM/work data, not just how admins configure the org.

-- =========================================================================
-- organization_workspaces: add settings + updated_at (Phase 0 shipped the
-- container only; Phase 1 completes the roadmap's "workspace settings").
-- =========================================================================
alter table organization_workspaces
  add column if not exists settings jsonb not null default '{}',
  add column if not exists updated_at timestamptz not null default now();

-- =========================================================================
-- organization_workspace_members — explicit workspace roster (Section:
-- Organization Workspaces / "workspace members"). Does not restrict
-- workspace *visibility* (Phase 0's org-wide select policy is unchanged);
-- this is who is formally assigned to the workspace, e.g. for work
-- assignment / activity dashboards in later phases.
-- =========================================================================
create table if not exists organization_workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references organization_workspaces(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  added_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index if not exists idx_organization_workspace_members_workspace on organization_workspace_members(workspace_id);
create index if not exists idx_organization_workspace_members_org on organization_workspace_members(organization_id);

alter table organization_workspace_members enable row level security;

create policy organization_workspace_members_select_own_org on organization_workspace_members
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

create policy organization_workspace_members_manage_own_org on organization_workspace_members
  for all using (has_capability(organization_id, 'workspaces.manage'))
  with check (has_capability(organization_id, 'workspaces.manage'));

drop trigger if exists trg_audit_organization_workspace_members on organization_workspace_members;
create trigger trg_audit_organization_workspace_members
  after insert or update or delete on organization_workspace_members
  for each row execute function log_audit_event();

-- =========================================================================
-- workspace_projects — shared project records (metadata only; local source
-- code is never synchronized, per the approved Phase 1 scope).
-- =========================================================================
create table if not exists workspace_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references organization_workspaces(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active',
  owner_user_id uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_projects_workspace on workspace_projects(workspace_id);
create index if not exists idx_workspace_projects_org on workspace_projects(organization_id);

alter table workspace_projects enable row level security;

create policy workspace_projects_select_own_org on workspace_projects
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

create policy workspace_projects_insert_own_org on workspace_projects
  for insert with check (
    is_org_member(organization_id, auth.uid()) and created_by = auth.uid()
  );

create policy workspace_projects_manage_own_org on workspace_projects
  for update using (
    owner_user_id = auth.uid() or created_by = auth.uid() or has_capability(organization_id, 'projects.manage')
  ) with check (
    owner_user_id = auth.uid() or created_by = auth.uid() or has_capability(organization_id, 'projects.manage')
  );

create policy workspace_projects_delete_own_org on workspace_projects
  for delete using (
    owner_user_id = auth.uid() or created_by = auth.uid() or has_capability(organization_id, 'projects.manage')
  );

drop trigger if exists trg_audit_workspace_projects on workspace_projects;
create trigger trg_audit_workspace_projects
  after insert or update or delete on workspace_projects
  for each row execute function log_audit_event();

-- =========================================================================
-- workspace_documents — shared documentation metadata. Real collaborative
-- editing is deferred; `content` is a plain shared-note body or an
-- `external_url` pointer, never a live-edited document.
-- =========================================================================
create table if not exists workspace_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references organization_workspaces(id) on delete cascade,
  title text not null,
  doc_type text not null default 'note',
  external_url text,
  content text,
  owner_user_id uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_documents_workspace on workspace_documents(workspace_id);
create index if not exists idx_workspace_documents_org on workspace_documents(organization_id);

alter table workspace_documents enable row level security;

create policy workspace_documents_select_own_org on workspace_documents
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

create policy workspace_documents_insert_own_org on workspace_documents
  for insert with check (
    is_org_member(organization_id, auth.uid()) and created_by = auth.uid()
  );

create policy workspace_documents_manage_own_org on workspace_documents
  for update using (
    owner_user_id = auth.uid() or created_by = auth.uid() or has_capability(organization_id, 'documents.manage')
  ) with check (
    owner_user_id = auth.uid() or created_by = auth.uid() or has_capability(organization_id, 'documents.manage')
  );

create policy workspace_documents_delete_own_org on workspace_documents
  for delete using (
    owner_user_id = auth.uid() or created_by = auth.uid() or has_capability(organization_id, 'documents.manage')
  );

drop trigger if exists trg_audit_workspace_documents on workspace_documents;
create trigger trg_audit_workspace_documents
  after insert or update or delete on workspace_documents
  for each row execute function log_audit_event();

-- =========================================================================
-- workspace_research_sessions — shared research (sessions, summaries,
-- extracted findings). Live collaboration is deferred; this is a shared
-- record of research already done, mirroring the shape of the existing
-- local `researchTask` memory-graph entity (topic/status/findings/
-- nextSteps/finalReport) so a future "share this research" action has an
-- obvious target shape.
-- =========================================================================
create table if not exists workspace_research_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid references organization_workspaces(id) on delete cascade,
  topic text not null,
  status text not null default 'in_progress',
  findings text[] not null default '{}',
  next_steps text,
  final_report text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_research_workspace on workspace_research_sessions(workspace_id);
create index if not exists idx_workspace_research_org on workspace_research_sessions(organization_id);

alter table workspace_research_sessions enable row level security;

create policy workspace_research_select_own_org on workspace_research_sessions
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

create policy workspace_research_insert_own_org on workspace_research_sessions
  for insert with check (
    is_org_member(organization_id, auth.uid()) and created_by = auth.uid()
  );

create policy workspace_research_manage_own_org on workspace_research_sessions
  for update using (
    created_by = auth.uid() or has_capability(organization_id, 'research.manage')
  ) with check (
    created_by = auth.uid() or has_capability(organization_id, 'research.manage')
  );

create policy workspace_research_delete_own_org on workspace_research_sessions
  for delete using (
    created_by = auth.uid() or has_capability(organization_id, 'research.manage')
  );

drop trigger if exists trg_audit_workspace_research_sessions on workspace_research_sessions;
create trigger trg_audit_workspace_research_sessions
  after insert or update or delete on workspace_research_sessions
  for each row execute function log_audit_event();

-- =========================================================================
-- Organization-shared CRM — org_companies / org_contacts / meeting
-- summaries / follow-ups. These are an explicit, opt-in "share to
-- organization" projection (see header note) — never an automatic mirror
-- of local Communication Runtime storage.
-- =========================================================================
create table if not exists org_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  domain text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_org_companies_org on org_companies(organization_id);

alter table org_companies enable row level security;

create policy org_companies_select_own_org on org_companies
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

create policy org_companies_insert_own_org on org_companies
  for insert with check (
    is_org_member(organization_id, auth.uid()) and created_by = auth.uid()
  );

create policy org_companies_manage_own_org on org_companies
  for update using (created_by = auth.uid() or has_capability(organization_id, 'crm.manage'))
  with check (created_by = auth.uid() or has_capability(organization_id, 'crm.manage'));

create policy org_companies_delete_own_org on org_companies
  for delete using (created_by = auth.uid() or has_capability(organization_id, 'crm.manage'));

drop trigger if exists trg_audit_org_companies on org_companies;
create trigger trg_audit_org_companies
  after insert or update or delete on org_companies
  for each row execute function log_audit_event();

create table if not exists org_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  role text,
  emails text[] not null default '{}',
  company_id uuid references org_companies(id) on delete set null,
  source_participant_ref text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_org_contacts_org on org_contacts(organization_id);
create index if not exists idx_org_contacts_company on org_contacts(company_id);

alter table org_contacts enable row level security;

create policy org_contacts_select_own_org on org_contacts
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

create policy org_contacts_insert_own_org on org_contacts
  for insert with check (
    is_org_member(organization_id, auth.uid()) and created_by = auth.uid()
  );

create policy org_contacts_manage_own_org on org_contacts
  for update using (created_by = auth.uid() or has_capability(organization_id, 'crm.manage'))
  with check (created_by = auth.uid() or has_capability(organization_id, 'crm.manage'));

create policy org_contacts_delete_own_org on org_contacts
  for delete using (created_by = auth.uid() or has_capability(organization_id, 'crm.manage'));

drop trigger if exists trg_audit_org_contacts on org_contacts;
create trigger trg_audit_org_contacts
  after insert or update or delete on org_contacts
  for each row execute function log_audit_event();

create table if not exists org_meeting_summaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  company_id uuid references org_companies(id) on delete set null,
  headline text not null,
  summary text not null,
  key_points text[] not null default '{}',
  occurred_at timestamptz not null default now(),
  source_communication_ref text,
  shared_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_org_meeting_summaries_org on org_meeting_summaries(organization_id);
create index if not exists idx_org_meeting_summaries_company on org_meeting_summaries(company_id);

alter table org_meeting_summaries enable row level security;

create policy org_meeting_summaries_select_own_org on org_meeting_summaries
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

create policy org_meeting_summaries_insert_own_org on org_meeting_summaries
  for insert with check (
    is_org_member(organization_id, auth.uid()) and shared_by = auth.uid()
  );

create policy org_meeting_summaries_manage_own_org on org_meeting_summaries
  for update using (shared_by = auth.uid() or has_capability(organization_id, 'crm.manage'))
  with check (shared_by = auth.uid() or has_capability(organization_id, 'crm.manage'));

create policy org_meeting_summaries_delete_own_org on org_meeting_summaries
  for delete using (shared_by = auth.uid() or has_capability(organization_id, 'crm.manage'));

drop trigger if exists trg_audit_org_meeting_summaries on org_meeting_summaries;
create trigger trg_audit_org_meeting_summaries
  after insert or update or delete on org_meeting_summaries
  for each row execute function log_audit_event();

create table if not exists org_follow_ups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  meeting_summary_id uuid references org_meeting_summaries(id) on delete set null,
  contact_id uuid references org_contacts(id) on delete set null,
  company_id uuid references org_companies(id) on delete set null,
  description text not null,
  suggested_when text,
  status text not null default 'open',
  assigned_to uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_org_follow_ups_org on org_follow_ups(organization_id);
create index if not exists idx_org_follow_ups_contact on org_follow_ups(contact_id);

alter table org_follow_ups enable row level security;

create policy org_follow_ups_select_own_org on org_follow_ups
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

create policy org_follow_ups_insert_own_org on org_follow_ups
  for insert with check (
    is_org_member(organization_id, auth.uid()) and created_by = auth.uid()
  );

create policy org_follow_ups_manage_own_org on org_follow_ups
  for update using (
    created_by = auth.uid() or assigned_to = auth.uid() or has_capability(organization_id, 'crm.manage')
  ) with check (
    created_by = auth.uid() or assigned_to = auth.uid() or has_capability(organization_id, 'crm.manage')
  );

create policy org_follow_ups_delete_own_org on org_follow_ups
  for delete using (created_by = auth.uid() or has_capability(organization_id, 'crm.manage'));

drop trigger if exists trg_audit_org_follow_ups on org_follow_ups;
create trigger trg_audit_org_follow_ups
  after insert or update or delete on org_follow_ups
  for each row execute function log_audit_event();

-- Relationship history / organization CRM visibility is intentionally not a
-- separate table — it's the union of org_meeting_summaries and
-- org_follow_ups filtered by contact_id/company_id, ordered by
-- occurred_at/created_at, exposed via CrmService.getRelationshipHistory()
-- in the renderer. A dedicated table would be a second copy of data
-- that's already fully represented above.

-- =========================================================================
-- Organization credit pools — org-level pool + per-member/department
-- allocations + usage events. Compatible with Individual accounts: an
-- Individual/Guest user has no organization_id and keeps using the
-- existing local CreditStore untouched (see SubscriptionStore.
-- syncFromOrganization precedent — additive, never a replacement).
-- =========================================================================
create table if not exists organization_credit_pools (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  total_credits numeric not null default 0,
  period_resets_at timestamptz not null default (now() + interval '30 days'),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table organization_credit_pools enable row level security;

create policy organization_credit_pools_select_own_org on organization_credit_pools
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

create policy organization_credit_pools_manage_own_org on organization_credit_pools
  for all using (has_capability(organization_id, 'credits.manage'))
  with check (has_capability(organization_id, 'credits.manage'));

drop trigger if exists trg_audit_organization_credit_pools on organization_credit_pools;
create trigger trg_audit_organization_credit_pools
  after insert or update or delete on organization_credit_pools
  for each row execute function log_audit_event();

create table if not exists organization_credit_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  allocation_type text not null check (allocation_type in ('member', 'department')),
  target_user_id uuid references auth.users(id),
  department_name text,
  allocated_credits numeric not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (allocation_type = 'member' and target_user_id is not null and department_name is null)
    or (allocation_type = 'department' and department_name is not null and target_user_id is null)
  )
);

create index if not exists idx_organization_credit_allocations_org on organization_credit_allocations(organization_id);

alter table organization_credit_allocations enable row level security;

create policy organization_credit_allocations_select_own_org on organization_credit_allocations
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

create policy organization_credit_allocations_manage_own_org on organization_credit_allocations
  for all using (has_capability(organization_id, 'credits.manage'))
  with check (has_capability(organization_id, 'credits.manage'));

drop trigger if exists trg_audit_organization_credit_allocations on organization_credit_allocations;
create trigger trg_audit_organization_credit_allocations
  after insert or update or delete on organization_credit_allocations
  for each row execute function log_audit_event();

-- Usage events are high-volume, append-only ledger entries, not governance
-- changes — deliberately NOT wired into audit_log (would spam the audit
-- trail with every credit spend). A member can only insert/read their own
-- events; credits.manage holders can read every event in the org for
-- reporting.
create table if not exists organization_credit_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  amount numeric not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_organization_credit_usage_org_created on organization_credit_usage_events(organization_id, created_at desc);

alter table organization_credit_usage_events enable row level security;

create policy organization_credit_usage_events_select on organization_credit_usage_events
  for select using (
    user_id = auth.uid() or has_capability(organization_id, 'credits.manage')
  );

create policy organization_credit_usage_events_insert on organization_credit_usage_events
  for insert with check (
    is_org_member(organization_id, auth.uid()) and user_id = auth.uid()
  );

-- =========================================================================
-- Seed the five new Phase 1 capabilities for every existing organization,
-- and extend the seed function so new orgs get them automatically. Kept as
-- a second, additive function (rather than editing seed_default_role_
-- capabilities from Phase 0 in place) so this migration reads as a clean,
-- reviewable diff of exactly what Phase 1 adds.
-- =========================================================================
create or replace function seed_phase1_role_capabilities(p_organization_id uuid)
returns void
language plpgsql
as $$
begin
  insert into role_capabilities (organization_id, role, capability, allowed)
  values
    -- crm.manage
    (p_organization_id, 'owner', 'crm.manage', true),
    (p_organization_id, 'workspaceAdministrator', 'crm.manage', true),
    (p_organization_id, 'organizationOwner', 'crm.manage', true),
    (p_organization_id, 'organizationAdministrator', 'crm.manage', true),
    (p_organization_id, 'departmentManager', 'crm.manage', true),
    -- projects.manage
    (p_organization_id, 'owner', 'projects.manage', true),
    (p_organization_id, 'workspaceAdministrator', 'projects.manage', true),
    (p_organization_id, 'organizationOwner', 'projects.manage', true),
    (p_organization_id, 'organizationAdministrator', 'projects.manage', true),
    (p_organization_id, 'departmentManager', 'projects.manage', true),
    -- documents.manage
    (p_organization_id, 'owner', 'documents.manage', true),
    (p_organization_id, 'workspaceAdministrator', 'documents.manage', true),
    (p_organization_id, 'organizationOwner', 'documents.manage', true),
    (p_organization_id, 'organizationAdministrator', 'documents.manage', true),
    (p_organization_id, 'departmentManager', 'documents.manage', true),
    -- research.manage
    (p_organization_id, 'owner', 'research.manage', true),
    (p_organization_id, 'workspaceAdministrator', 'research.manage', true),
    (p_organization_id, 'organizationOwner', 'research.manage', true),
    (p_organization_id, 'organizationAdministrator', 'research.manage', true),
    (p_organization_id, 'departmentManager', 'research.manage', true),
    -- credits.manage
    (p_organization_id, 'owner', 'credits.manage', true),
    (p_organization_id, 'billingAdministrator', 'credits.manage', true),
    (p_organization_id, 'organizationOwner', 'credits.manage', true),
    (p_organization_id, 'organizationAdministrator', 'credits.manage', true)
  on conflict (organization_id, role, capability) do nothing;
end;
$$;

do $$
declare
  v_org record;
begin
  for v_org in select id from organizations loop
    perform seed_phase1_role_capabilities(v_org.id);
    insert into organization_credit_pools (organization_id, total_credits)
    values (v_org.id, 0)
    on conflict (organization_id) do nothing;
  end loop;
end;
$$;

create or replace function trg_seed_phase1_fn()
returns trigger
language plpgsql
as $$
begin
  perform seed_phase1_role_capabilities(new.id);
  insert into organization_credit_pools (organization_id, total_credits)
  values (new.id, 0)
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_seed_phase1 on organizations;
create trigger trg_seed_phase1
  after insert on organizations
  for each row execute function trg_seed_phase1_fn();

grant execute on function seed_phase1_role_capabilities to authenticated;
