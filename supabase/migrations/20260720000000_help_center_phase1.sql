-- PawOS Help Center Phase 1 — Organizations + Diagnostics + Platform Admins
-- Apply via the Supabase dashboard SQL editor or `supabase db push`.
-- Uses gen_random_uuid() (pgcrypto), enabled by default on Supabase projects.

-- =========================================================================
-- Platform admins — the allowlist backing "is this user a PawOS platform
-- administrator" RLS checks below. A table, not a hardcoded check, so a
-- second admin is a row insert, not a code change.
-- =========================================================================
create table if not exists platform_admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  added_at timestamptz not null default now()
);

insert into platform_admins (email)
values ('founder@revantaai.com')
on conflict (email) do nothing;

create or replace function is_platform_admin(check_email text)
returns boolean
language sql
stable
as $$
  select exists (select 1 from platform_admins where email = check_email);
$$;

-- =========================================================================
-- Organizations — real Team/Enterprise organization + membership data.
-- Lives in Supabase (not local JSON) because a teammate's own device must
-- be able to see an org someone else created.
-- =========================================================================
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  tier text not null check (tier in ('team', 'enterprise')),
  owner_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create sequence if not exists organizations_slug_seq;

create or replace function generate_org_slug(org_name text)
returns text
language plpgsql
as $$
declare
  prefix text;
  next_val bigint;
begin
  prefix := upper(regexp_replace(coalesce(nullif(org_name, ''), 'ORG'), '[^A-Za-z]', '', 'g'));
  prefix := left(prefix || 'XXX', 3);
  next_val := nextval('organizations_slug_seq');
  return 'ORG-' || prefix || '-' || lpad(next_val::text, 3, '0');
end;
$$;

create table if not exists organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id),
  email text not null,
  display_name text,
  role text not null,
  status text not null default 'invited' check (status in ('invited', 'active', 'removed')),
  invited_at timestamptz not null default now(),
  joined_at timestamptz
);

create index if not exists idx_org_members_org_id on organization_members(organization_id);
create index if not exists idx_org_members_user_id on organization_members(user_id);

alter table organizations enable row level security;
alter table organization_members enable row level security;

-- Members can see organizations they belong to.
create policy org_select_own on organizations
  for select using (
    id in (
      select organization_id from organization_members
      where user_id = auth.uid() and status = 'active'
    )
    or owner_user_id = auth.uid()
  );

-- Only the owner can modify or delete the organization row itself.
create policy org_update_owner on organizations
  for update using (owner_user_id = auth.uid());

create policy org_delete_owner on organizations
  for delete using (owner_user_id = auth.uid());

-- Any authenticated user can create an organization (tier gating happens in the app).
create policy org_insert_authenticated on organizations
  for insert with check (owner_user_id = auth.uid());

-- Members can see other members of their own organization.
create policy org_members_select_own_org on organization_members
  for select using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and status = 'active'
    )
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

-- Only owner/admin-equivalent roles can insert/update/delete membership rows.
create policy org_members_manage_own_org on organization_members
  for all using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and status = 'active'
      and role in ('owner', 'organizationOwner', 'organizationAdministrator', 'workspaceAdministrator')
    )
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

-- =========================================================================
-- Diagnostics — the shared reporting pipe for bug/feature reports now, and
-- crashes/exceptions/failures/support ratings in later phases. Designed so
-- Phase 2-4 producers never require a migration to slice by report_source,
-- component, or lifecycle status.
-- =========================================================================
create table if not exists diagnostic_issues (
  id uuid primary key default gen_random_uuid(),
  human_id text not null unique,
  fingerprint text not null,
  type text not null,
  report_source text not null check (report_source in ('desktop', 'website', 'mobile', 'api', 'runtime', 'companion')),
  component text not null check (component in (
    'development', 'communication', 'research', 'office', 'cloud',
    'companion', 'billing', 'authentication', 'electron', 'backend'
  )),
  summary text not null,
  affected_user_count integer not null default 1,
  affected_versions text[] not null default '{}',
  status text not null default 'new' check (status in (
    'new', 'investigating', 'aiFixing', 'waitingPermission', 'resolved', 'closed'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_diagnostic_issues_open_fingerprint
  on diagnostic_issues(fingerprint)
  where status not in ('resolved', 'closed');

create sequence if not exists diagnostic_issues_human_id_seq;

create table if not exists diagnostic_reports (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references diagnostic_issues(id) on delete cascade,
  user_id uuid references auth.users(id),
  email text,
  type text not null,
  report_source text not null,
  component text not null,
  severity text,
  summary text not null,
  details jsonb not null default '{}',
  app_version text,
  os text,
  created_at timestamptz not null default now(),
  status text not null default 'new'
);

create index if not exists idx_diagnostic_reports_issue_id on diagnostic_reports(issue_id);
create index if not exists idx_diagnostic_reports_user_id on diagnostic_reports(user_id);

alter table diagnostic_issues enable row level security;
alter table diagnostic_reports enable row level security;

-- Platform admins read everything; a regular user can only read their own
-- reports. Uses auth.jwt() ->> 'email' (the standard safe pattern), not a
-- direct select against auth.users — that table isn't grant-readable by
-- the authenticated role.
create policy diagnostic_issues_admin_read on diagnostic_issues
  for select using (
    is_platform_admin(auth.jwt() ->> 'email')
  );

create policy diagnostic_reports_admin_read on diagnostic_reports
  for select using (
    is_platform_admin(auth.jwt() ->> 'email')
  );

create policy diagnostic_reports_own_read on diagnostic_reports
  for select using (user_id = auth.uid());

create policy diagnostic_reports_own_insert on diagnostic_reports
  for insert with check (user_id = auth.uid() or user_id is null);

-- Issues themselves are only ever written via upsert_diagnostic_issue() (security definer below).

-- Merges repeat occurrences of the same problem into one issue with an
-- affected-user count, instead of one row per occurrence (so 500 users
-- hitting the same crash become one issue, not 500 rows).
create or replace function upsert_diagnostic_issue(
  p_fingerprint text,
  p_type text,
  p_report_source text,
  p_component text,
  p_summary text,
  p_app_version text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_issue_id uuid;
  v_next_human bigint;
begin
  select id into v_issue_id
  from diagnostic_issues
  where fingerprint = p_fingerprint and status not in ('resolved', 'closed')
  limit 1;

  if v_issue_id is not null then
    update diagnostic_issues
    set affected_user_count = affected_user_count + 1,
        affected_versions = case
          when p_app_version is not null and not (p_app_version = any(affected_versions))
          then array_append(affected_versions, p_app_version)
          else affected_versions
        end,
        updated_at = now()
    where id = v_issue_id;
    return v_issue_id;
  end if;

  v_next_human := nextval('diagnostic_issues_human_id_seq');
  insert into diagnostic_issues (
    human_id, fingerprint, type, report_source, component, summary, affected_versions
  ) values (
    'ISSUE-' || v_next_human,
    p_fingerprint,
    p_type,
    p_report_source,
    p_component,
    p_summary,
    case when p_app_version is not null then array[p_app_version] else '{}' end
  )
  returning id into v_issue_id;

  return v_issue_id;
end;
$$;

grant execute on function upsert_diagnostic_issue to authenticated, anon;
grant execute on function generate_org_slug to authenticated;
