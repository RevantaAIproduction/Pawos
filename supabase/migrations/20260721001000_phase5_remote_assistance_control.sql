-- PawOS Team & Enterprise Collaboration Platform — Phase 5: Remote
-- Assistance, Screen Sharing & Remote Control. Apply via the Supabase
-- dashboard SQL editor or `supabase db push`, after
-- 20260721000900_phase3_git_deployment_collaboration.sql (Phase 4 added no
-- migration — presence/cursors/shared editing are pure Realtime, no table).
--
-- Builds the roadmap's Section 5 (Remote Assistance) request→approve state
-- machine and Section 6 (Screen Sharing & Remote Control)'s per-permission
-- control_grants design, exactly as both sections specify: four independent
-- consent gates (view → cursor → keyboard → terminal, plus the additional
-- Section 6 grant kinds clipboard/file_edit/browser_control/infra_control),
-- each its own row with instant-revoke via a live Realtime subscription —
-- "revoking is a single row update broadcast over Realtime" per the
-- roadmap's own verdict box.
--
-- Architecture note (disclosed): unlike every prior phase's org-scoped
-- collaboration tables (which use an owner-bypass RLS pattern for
-- consistency — "the org owner can always see/manage this"), these two
-- tables deliberately do NOT grant the org owner a blanket bypass. Remote
-- control of a member's own machine is a personal consent action, not
-- organizational data ownership — an owner who wants to be eligible to
-- provide assistance gets that through the same `remote_assistance.provide`
-- capability as any other admin role, never through raw ownership. This is
-- the one deliberate RLS-pattern deviation in the whole roadmap, made
-- because Section 5's entire design point is "no state grants control
-- without the member's own affirmative action."

-- =========================================================================
-- organization_remote_assistance_sessions — one row per "member requests
-- help" session (roadmap Section 5's state diagram, coarse-grained: the
-- per-permission escalation detail lives in organization_control_grants
-- below). requester = the member being helped; helper = whoever
-- claims/joins the request.
-- =========================================================================
create table if not exists organization_remote_assistance_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid references organization_workspaces(id) on delete set null,
  requester_user_id uuid not null references auth.users(id),
  helper_user_id uuid references auth.users(id),
  status text not null default 'requested'
    check (status in ('requested', 'notified', 'declined', 'active', 'ended')),
  share_scope text check (share_scope in ('desktop', 'window', 'runtime', 'browser', 'infra')),
  share_source_id text,
  requested_at timestamptz not null default now(),
  joined_at timestamptz,
  ended_at timestamptz
);

create index if not exists idx_remote_assistance_sessions_org on organization_remote_assistance_sessions(organization_id);
create index if not exists idx_remote_assistance_sessions_requester on organization_remote_assistance_sessions(requester_user_id);
create index if not exists idx_remote_assistance_sessions_helper on organization_remote_assistance_sessions(helper_user_id);
create index if not exists idx_remote_assistance_sessions_status on organization_remote_assistance_sessions(status);

alter table organization_remote_assistance_sessions enable row level security;

create policy remote_assistance_sessions_select on organization_remote_assistance_sessions
  for select using (
    requester_user_id = auth.uid()
    or helper_user_id = auth.uid()
    or (helper_user_id is null and has_capability(organization_id, 'remote_assistance.provide'))
  );

create policy remote_assistance_sessions_insert on organization_remote_assistance_sessions
  for insert with check (
    requester_user_id = auth.uid()
    and (is_org_member(organization_id, auth.uid()) or organization_id in (select id from organizations where owner_user_id = auth.uid()))
  );

create policy remote_assistance_sessions_update on organization_remote_assistance_sessions
  for update using (
    requester_user_id = auth.uid()
    or helper_user_id = auth.uid()
    or (helper_user_id is null and has_capability(organization_id, 'remote_assistance.provide'))
  ) with check (
    requester_user_id = auth.uid()
    or helper_user_id = auth.uid()
    or (helper_user_id is null and has_capability(organization_id, 'remote_assistance.provide'))
  );

drop trigger if exists trg_audit_remote_assistance_sessions on organization_remote_assistance_sessions;
create trigger trg_audit_remote_assistance_sessions
  after insert or update or delete on organization_remote_assistance_sessions
  for each row execute function log_audit_event();

-- =========================================================================
-- organization_control_grants — one row per permission tier per session,
-- matching Section 6's "Remote Control — independent permission grants"
-- table exactly (view/cursor/click/keyboard/clipboard/file_edit/terminal/
-- browser_control/infra_control). The helper requests a tier; only the
-- requester (the person being helped, whose machine it is) can grant or
-- deny it. Either party can revoke an already-granted tier.
-- =========================================================================
create table if not exists organization_control_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  session_id uuid not null references organization_remote_assistance_sessions(id) on delete cascade,
  kind text not null check (kind in (
    'view_screen', 'view_runtime', 'move_cursor', 'click_ui', 'keyboard_input',
    'clipboard', 'file_editing', 'terminal', 'browser_control', 'infra_control'
  )),
  status text not null default 'requested'
    check (status in ('requested', 'granted', 'denied', 'revoked')),
  requested_by uuid not null references auth.users(id),
  decided_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  revoked_at timestamptz,
  unique (session_id, kind)
);

create index if not exists idx_control_grants_session on organization_control_grants(session_id);
create index if not exists idx_control_grants_org on organization_control_grants(organization_id);

alter table organization_control_grants enable row level security;

create policy control_grants_select on organization_control_grants
  for select using (
    exists (
      select 1 from organization_remote_assistance_sessions s
      where s.id = session_id and (s.requester_user_id = auth.uid() or s.helper_user_id = auth.uid())
    )
  );

create policy control_grants_insert on organization_control_grants
  for insert with check (
    requested_by = auth.uid()
    and exists (
      select 1 from organization_remote_assistance_sessions s
      where s.id = session_id and s.helper_user_id = auth.uid()
    )
  );

create policy control_grants_update on organization_control_grants
  for update using (
    exists (
      select 1 from organization_remote_assistance_sessions s
      where s.id = session_id and (s.requester_user_id = auth.uid() or s.helper_user_id = auth.uid())
    )
  ) with check (
    exists (
      select 1 from organization_remote_assistance_sessions s
      where s.id = session_id and (s.requester_user_id = auth.uid() or s.helper_user_id = auth.uid())
    )
  );

drop trigger if exists trg_audit_control_grants on organization_control_grants;
create trigger trg_audit_control_grants
  after insert or update or delete on organization_control_grants
  for each row execute function log_audit_event();

-- =========================================================================
-- Seed the one new Phase 5 capability. remote_assistance.provide mirrors
-- the "admin-tier" seed set used by roles.manage/permissions.grant
-- elsewhere in this project — being eligible to answer a colleague's help
-- request is an admin/support-tier action, not a blanket-member one.
-- =========================================================================
create or replace function seed_phase5_role_capabilities(p_organization_id uuid)
returns void
language plpgsql
as $$
begin
  insert into role_capabilities (organization_id, role, capability, allowed)
  values
    (p_organization_id, 'owner', 'remote_assistance.provide', true),
    (p_organization_id, 'workspaceAdministrator', 'remote_assistance.provide', true),
    (p_organization_id, 'organizationOwner', 'remote_assistance.provide', true),
    (p_organization_id, 'organizationAdministrator', 'remote_assistance.provide', true),
    (p_organization_id, 'departmentManager', 'remote_assistance.provide', true)
  on conflict (organization_id, role, capability) do nothing;
end;
$$;

do $$
declare
  v_org record;
begin
  for v_org in select id from organizations loop
    perform seed_phase5_role_capabilities(v_org.id);
  end loop;
end;
$$;

create or replace function trg_seed_phase5_fn()
returns trigger
language plpgsql
as $$
begin
  perform seed_phase5_role_capabilities(new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_phase5 on organizations;
create trigger trg_seed_phase5
  after insert on organizations
  for each row execute function trg_seed_phase5_fn();

grant execute on function seed_phase5_role_capabilities to authenticated;
