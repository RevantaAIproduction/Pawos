-- PawOS Team & Enterprise Collaboration Platform — Phase 6: Enterprise
-- Hardening. Apply via the Supabase dashboard SQL editor or `supabase db
-- push`, after 20260721001000_phase5_remote_assistance_control.sql.
--
-- Builds: an org-scoped, field-level-encrypted infrastructure credential
-- vault (organization_credentials) — the "Shared infrastructure" gap
-- Section 2/3 disclosed and Phase 3's migration explicitly deferred
-- ("a larger, not-yet-scheduled commitment") — and a generalized approval
-- workflow (organization_approval_requests), extending Phase 5's Remote
-- Assistance request/notify/decide state machine (Section 5) to any
-- sensitive capability, per Section 15 ("Approval workflows... generalized
-- to any sensitive action — not just remote assistance"). Three new
-- capabilities are seeded: credentials.manage, approvals.decide,
-- sso.manage. organization_policies, audit_log, and has_capability()
-- already exist from Phase 0 — this migration is additive on top of them,
-- not a redesign.
--
-- OPERATIONAL NOTE (not part of this migration, must be done once per
-- Supabase project by a project owner, never committed to source control):
-- store_organization_credential()/read_organization_credential() below
-- require a symmetric key available to Postgres as the setting
-- `app.settings.credential_encryption_key`. Set it via the Supabase
-- dashboard (Database → Custom Postgres Config) or
-- `alter database postgres set app.settings.credential_encryption_key = '<random-secret>';`
-- run once directly against the project — NOT in this file. Without it,
-- both functions raise a clear exception rather than silently storing
-- plaintext or failing in a confusing way.

create extension if not exists pgcrypto;

-- =========================================================================
-- organization_credentials — org-scoped Infrastructure Runtime connector
-- credentials (Section 2's "Shared infrastructure" row), replacing nothing
-- yet: today's env-var/per-local-install connectors keep working unchanged
-- (Migration Strategy's non-negotiable "additive only" constraint) — this
-- table is a new, optional source a connector can be configured from when
-- an org context is active. `secret` never lands in this table in
-- plaintext; only `store_organization_credential()` may write it, and only
-- as pgcrypto ciphertext.
-- =========================================================================
create table if not exists organization_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  connector_kind text not null check (connector_kind in ('sourceControl', 'projectManagement', 'cicd', 'hosting', 'cloud', 'container', 'infrastructure')),
  connector_id text not null,
  label text not null,
  encrypted_secret bytea not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, connector_kind, connector_id)
);

create index if not exists idx_organization_credentials_org on organization_credentials(organization_id);

alter table organization_credentials enable row level security;

-- Selecting the raw row is fine even for a non-manager: it exposes only
-- ciphertext (encrypted_secret), never the plaintext secret — the same
-- "empty or useless without the key" property the rest of this project
-- already relies on for RLS-hidden rows. Only credentials.manage can write.
create policy organization_credentials_select_own_org on organization_credentials
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

create policy organization_credentials_manage_own_org on organization_credentials
  for all using (has_capability(organization_id, 'credentials.manage'))
  with check (has_capability(organization_id, 'credentials.manage'));

drop trigger if exists trg_audit_organization_credentials on organization_credentials;
create trigger trg_audit_organization_credentials
  after insert or update or delete on organization_credentials
  for each row execute function log_audit_event();

-- =========================================================================
-- store_organization_credential() — the only path that ever writes a
-- plaintext secret; encrypts it server-side with pgcrypto before it
-- touches the table, and requires credentials.manage exactly like the
-- table's own RLS write policy (checked again here since this function is
-- security definer and bypasses RLS internally).
-- =========================================================================
create or replace function store_organization_credential(
  p_organization_id uuid,
  p_connector_kind text,
  p_connector_id text,
  p_label text,
  p_secret text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_key text;
  v_id uuid;
begin
  if not has_capability(p_organization_id, 'credentials.manage') then
    raise exception 'not authorized: requires credentials.manage';
  end if;

  v_key := current_setting('app.settings.credential_encryption_key', true);
  if v_key is null or v_key = '' then
    raise exception 'credential_encryption_key is not configured on this Supabase project';
  end if;

  insert into organization_credentials (organization_id, connector_kind, connector_id, label, encrypted_secret, created_by)
  values (p_organization_id, p_connector_kind, p_connector_id, p_label, pgp_sym_encrypt(p_secret, v_key), auth.uid())
  on conflict (organization_id, connector_kind, connector_id)
  do update set label = excluded.label, encrypted_secret = excluded.encrypted_secret, updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function store_organization_credential to authenticated;

-- =========================================================================
-- read_organization_credential() — the only path that ever returns a
-- decrypted secret. Gated on org membership, not credentials.manage:
-- Section 2's whole point is "usable by every permitted member instead of
-- each person configuring their own," so any active member (or the owner)
-- can pull the shared token down to their own local connector — write
-- access (store/revoke) is what stays restricted to credentials.manage.
-- =========================================================================
create or replace function read_organization_credential(
  p_organization_id uuid,
  p_connector_kind text,
  p_connector_id text
)
returns text
language plpgsql
security definer
as $$
declare
  v_key text;
  v_ciphertext bytea;
begin
  if not (is_org_member(p_organization_id, auth.uid()) or exists (select 1 from organizations where id = p_organization_id and owner_user_id = auth.uid())) then
    raise exception 'not authorized: not a member of this organization';
  end if;

  v_key := current_setting('app.settings.credential_encryption_key', true);
  if v_key is null or v_key = '' then
    raise exception 'credential_encryption_key is not configured on this Supabase project';
  end if;

  select encrypted_secret into v_ciphertext
  from organization_credentials
  where organization_id = p_organization_id
    and connector_kind = p_connector_kind
    and connector_id = p_connector_id;

  if v_ciphertext is null then
    return null;
  end if;

  return pgp_sym_decrypt(v_ciphertext, v_key);
end;
$$;

grant execute on function read_organization_credential to authenticated;

-- =========================================================================
-- organization_approval_requests — Section 15's "approval workflows...
-- generalized to any sensitive action," modeled directly on Section 5's
-- Remote Assistance state machine (requested → decided) rather than a new
-- shape: one row per gated action, created when a governance policy (see
-- organization_policies, policy_key = 'require_approval') names the
-- capability the requester is about to exercise.
-- =========================================================================
create table if not exists organization_approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  capability text not null,
  action_type text not null,
  summary text not null,
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_organization_approval_requests_org on organization_approval_requests(organization_id, status);

alter table organization_approval_requests enable row level security;

-- Any org member can see the queue (mirrors Remote Assistance's open-
-- requests visibility) — requesters need to see their own pending/decided
-- state, approvers need to see everyone's.
create policy organization_approval_requests_select_own_org on organization_approval_requests
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

-- Only the requester can create a request naming themselves.
create policy organization_approval_requests_insert_own on organization_approval_requests
  for insert with check (
    requested_by = auth.uid()
    and (is_org_member(organization_id, auth.uid()) or organization_id in (select id from organizations where owner_user_id = auth.uid()))
  );

-- Only a holder of approvals.decide can update (approve/deny) a request —
-- deliberately not "either party," unlike control_grants' revoke: an
-- approval decision must come from someone other than the requester.
create policy organization_approval_requests_decide_own_org on organization_approval_requests
  for update using (has_capability(organization_id, 'approvals.decide'))
  with check (has_capability(organization_id, 'approvals.decide'));

drop trigger if exists trg_audit_organization_approval_requests on organization_approval_requests;
create trigger trg_audit_organization_approval_requests
  after insert or update or delete on organization_approval_requests
  for each row execute function log_audit_event();

-- =========================================================================
-- requires_approval() — the policy-check primitive Section 15 describes
-- as "checked by the same capability-gate mechanism as everything else."
-- Reads organization_policies' 'require_approval' row (policy_value =
-- {"capabilities": ["infra.deploy", ...]}); absence of the row or the
-- capability in its list means "no approval required," matching
-- organization_policies' own sparse-by-default design.
-- =========================================================================
create or replace function requires_approval(p_organization_id uuid, p_capability text)
returns boolean
language plpgsql
security definer
stable
as $$
declare
  v_value jsonb;
begin
  select policy_value into v_value
  from organization_policies
  where organization_id = p_organization_id
    and policy_key = 'require_approval';

  if v_value is null then
    return false;
  end if;

  return exists (
    select 1 from jsonb_array_elements_text(coalesce(v_value->'capabilities', '[]'::jsonb)) as cap
    where cap = p_capability
  );
end;
$$;

grant execute on function requires_approval to authenticated;

-- =========================================================================
-- Seed the three new Phase 6 capabilities onto every existing org, and
-- extend the going-forward seed function so new orgs get them too — same
-- additive pattern Phase 0 used for its own three new capabilities.
-- credentials.manage follows workspaces.manage's precedent (owner +
-- workspaceAdministrator/organizationAdministrator); approvals.decide is
-- deliberately owner-only-equivalent (owner + organizationOwner), since it
-- is the capability that lets someone approve their own colleague's
-- otherwise-gated action; sso.manage mirrors organization.manage's
-- owner-only precedent, since it is account-wide, not per-workspace.
-- =========================================================================
create or replace function seed_phase6_role_capabilities(p_organization_id uuid)
returns void
language plpgsql
as $$
begin
  insert into role_capabilities (organization_id, role, capability, allowed)
  values
    (p_organization_id, 'owner', 'credentials.manage', true),
    (p_organization_id, 'workspaceAdministrator', 'credentials.manage', true),
    (p_organization_id, 'organizationOwner', 'credentials.manage', true),
    (p_organization_id, 'organizationAdministrator', 'credentials.manage', true),
    (p_organization_id, 'owner', 'approvals.decide', true),
    (p_organization_id, 'organizationOwner', 'approvals.decide', true),
    (p_organization_id, 'owner', 'sso.manage', true),
    (p_organization_id, 'organizationOwner', 'sso.manage', true)
  on conflict (organization_id, role, capability) do nothing;
end;
$$;

do $$
declare
  v_org record;
begin
  for v_org in select id from organizations loop
    perform seed_phase6_role_capabilities(v_org.id);
  end loop;
end;
$$;

create or replace function trg_seed_role_capabilities_fn()
returns trigger
language plpgsql
as $$
begin
  perform seed_default_role_capabilities(new.id);
  perform seed_phase6_role_capabilities(new.id);
  return new;
end;
$$;

grant execute on function seed_phase6_role_capabilities to authenticated;
