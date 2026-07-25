-- Connectivity Runtime — Section 17: replaces the deliberately temporary
-- in-memory Maps inside ConnectionManager, CredentialVaultBridge, and
-- DeploymentProfileManager (src/main/connectivity/) with real, durable
-- storage. Apply via the Supabase dashboard SQL editor or `supabase db
-- push`, after 20260724010000_referral_engine.sql.
--
-- Scope model: every row is always owned by an individual user
-- (ConnectivityScope = { userId, organizationId? } — "always owned by a
-- user; additionally org-scoped only when relevant," confirmed by an
-- earlier audit that no universal "workspace" concept exists distinct
-- from Organization). organization_id here is a nullable grouping tag,
-- NOT a sharing mechanism — a connectivity connection/credential/
-- deployment profile is never visible to a user other than the one who
-- created it, even inside an organization. If cross-member sharing is
-- ever wanted, that is new product scope for a later migration, not
-- something this one silently introduces.
--
-- Because organization_id is nullable and Postgres treats NULL <> NULL,
-- plain UNIQUE constraints can't express "unique per (user, org, key)
-- including when org is absent" — every table below instead uses two
-- partial unique indexes (one for organization_id is null, one for
-- organization_id is not null) to get correct uniqueness in both cases.
--
-- audit_log requires a non-null organization_id (Phase 0's schema), so
-- each table below only audits org-scoped rows — solo-user rows were
-- never in audit_log's scope anywhere else in this app either, so this is
-- consistent, not a gap. Postgres forbids a WHEN clause from referencing
-- NEW on a trigger that can fire on DELETE (NEW doesn't exist for a
-- delete), so — unlike Phase 6's tables, which are insert/update-mostly —
-- each table here gets three separate triggers (insert/update/delete)
-- rather than one combined trigger, each WHEN clause referencing only the
-- row values that actually exist for that operation.
--
-- This whole script is safe to re-run from the top: every `create table`/
-- `create index` uses `if not exists`, every `create policy` is preceded
-- by a matching `drop policy if exists`, and every trigger by `drop
-- trigger if exists` — re-pasting the full corrected file after a prior
-- partial failure needs no manual cleanup first.
--
-- OPERATIONAL NOTE: connectivity_credentials reuses the SAME
-- `app.settings.credential_encryption_key` Postgres setting Phase 6's
-- organization_credentials already requires — it is a project-level key,
-- not scoped to one table, so no new operational step is needed if Phase
-- 6 is already applied.

-- =========================================================================
-- connectivity_connections — backs ConnectionManager. `connection_id` is
-- the ConnectorSDK-assigned ConnectorConnection.id string (opaque,
-- connector-defined); `id` is this table's own row identity, kept
-- separate since the two are allowed to differ in shape.
-- =========================================================================
create table if not exists connectivity_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  connector_id text not null,
  connection_id text not null,
  status text not null check (status in ('connected', 'disconnected', 'error', 'needsReauth')),
  granted_permissions jsonb not null default '[]',
  last_sync_at timestamptz,
  last_health_check_at timestamptz,
  health_status text check (health_status in ('healthy', 'degraded', 'down')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_connectivity_connections_unique_solo
  on connectivity_connections (user_id, connector_id) where organization_id is null;
create unique index if not exists idx_connectivity_connections_unique_org
  on connectivity_connections (user_id, organization_id, connector_id) where organization_id is not null;
create index if not exists idx_connectivity_connections_user on connectivity_connections(user_id);

alter table connectivity_connections enable row level security;

drop policy if exists connectivity_connections_own on connectivity_connections;
create policy connectivity_connections_own on connectivity_connections
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists trg_audit_connectivity_connections on connectivity_connections;
drop trigger if exists trg_audit_connectivity_connections_ins on connectivity_connections;
drop trigger if exists trg_audit_connectivity_connections_upd on connectivity_connections;
drop trigger if exists trg_audit_connectivity_connections_del on connectivity_connections;
create trigger trg_audit_connectivity_connections_ins
  after insert on connectivity_connections
  for each row
  when (new.organization_id is not null)
  execute function log_audit_event();
create trigger trg_audit_connectivity_connections_upd
  after update on connectivity_connections
  for each row
  when (coalesce(new.organization_id, old.organization_id) is not null)
  execute function log_audit_event();
create trigger trg_audit_connectivity_connections_del
  after delete on connectivity_connections
  for each row
  when (old.organization_id is not null)
  execute function log_audit_event();

-- =========================================================================
-- connectivity_credentials — backs CredentialVaultBridge. Deliberately
-- additive to, and never touching, organization_credentials /
-- CredentialVaultService.ts / ApplyOrganizationCredentialPlugin.ts — that
-- system keeps working exactly as it does today. `encrypted_secret` is
-- always ciphertext; only store_connectivity_credential() may write a
-- plaintext secret, and only read_connectivity_credential() may return
-- one — the same discipline organization_credentials already uses.
-- =========================================================================
create table if not exists connectivity_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  connector_id text not null,
  auth_method text not null check (auth_method in ('oauth2', 'apiToken', 'sshKey', 'none')),
  encrypted_secret bytea not null,
  encrypted_refresh_token bytea,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_connectivity_credentials_unique_solo
  on connectivity_credentials (user_id, connector_id) where organization_id is null;
create unique index if not exists idx_connectivity_credentials_unique_org
  on connectivity_credentials (user_id, organization_id, connector_id) where organization_id is not null;
create index if not exists idx_connectivity_credentials_user on connectivity_credentials(user_id);

alter table connectivity_credentials enable row level security;

-- Selecting the raw row is fine — it exposes only ciphertext, the same
-- "harmless without the key" property organization_credentials relies on.
drop policy if exists connectivity_credentials_select_own on connectivity_credentials;
create policy connectivity_credentials_select_own on connectivity_credentials
  for select using (user_id = auth.uid());

-- Revoking (deleting) your own row needs no encryption involvement, so it
-- is allowed directly — unlike store/rotate, which must go through the
-- security-definer RPCs below (no insert/update policy is granted here).
drop policy if exists connectivity_credentials_delete_own on connectivity_credentials;
create policy connectivity_credentials_delete_own on connectivity_credentials
  for delete using (user_id = auth.uid());

drop trigger if exists trg_audit_connectivity_credentials on connectivity_credentials;
drop trigger if exists trg_audit_connectivity_credentials_ins on connectivity_credentials;
drop trigger if exists trg_audit_connectivity_credentials_upd on connectivity_credentials;
drop trigger if exists trg_audit_connectivity_credentials_del on connectivity_credentials;
create trigger trg_audit_connectivity_credentials_ins
  after insert on connectivity_credentials
  for each row
  when (new.organization_id is not null)
  execute function log_audit_event();
create trigger trg_audit_connectivity_credentials_upd
  after update on connectivity_credentials
  for each row
  when (coalesce(new.organization_id, old.organization_id) is not null)
  execute function log_audit_event();
create trigger trg_audit_connectivity_credentials_del
  after delete on connectivity_credentials
  for each row
  when (old.organization_id is not null)
  execute function log_audit_event();

-- =========================================================================
-- store_connectivity_credential() — the only path that ever writes a
-- plaintext secret. Always writes under auth.uid() (never a
-- caller-supplied user id) so one user can never write into another
-- user's row regardless of what a client passes.
-- =========================================================================
create or replace function store_connectivity_credential(
  p_connector_id text,
  p_organization_id uuid,
  p_auth_method text,
  p_secret text,
  p_refresh_token text default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_key text;
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if p_organization_id is not null
     and not (is_org_member(p_organization_id, v_user_id) or exists (select 1 from organizations where id = p_organization_id and owner_user_id = v_user_id)) then
    raise exception 'not authorized: not a member of this organization';
  end if;

  v_key := current_setting('app.settings.credential_encryption_key', true);
  if v_key is null or v_key = '' then
    raise exception 'credential_encryption_key is not configured on this Supabase project';
  end if;

  select id into v_id
  from connectivity_credentials
  where user_id = v_user_id
    and connector_id = p_connector_id
    and (organization_id = p_organization_id or (organization_id is null and p_organization_id is null));

  if v_id is not null then
    update connectivity_credentials
    set auth_method = p_auth_method,
        encrypted_secret = pgp_sym_encrypt(p_secret, v_key),
        encrypted_refresh_token = case when p_refresh_token is not null then pgp_sym_encrypt(p_refresh_token, v_key) else null end,
        expires_at = p_expires_at,
        updated_at = now()
    where id = v_id;
  else
    insert into connectivity_credentials (user_id, organization_id, connector_id, auth_method, encrypted_secret, encrypted_refresh_token, expires_at)
    values (
      v_user_id, p_organization_id, p_connector_id, p_auth_method,
      pgp_sym_encrypt(p_secret, v_key),
      case when p_refresh_token is not null then pgp_sym_encrypt(p_refresh_token, v_key) else null end,
      p_expires_at
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function store_connectivity_credential to authenticated;

-- =========================================================================
-- read_connectivity_credential() — the only path that ever returns a
-- decrypted secret. Always reads under auth.uid(); returns null rather
-- than raising when nothing is stored, matching CredentialVaultBridge's
-- own read() semantics (StoredCredential | undefined, never a thrown
-- "not found" error).
-- =========================================================================
create or replace function read_connectivity_credential(
  p_connector_id text,
  p_organization_id uuid
)
returns table (auth_method text, secret text, refresh_token text, expires_at timestamptz)
language plpgsql
security definer
as $$
declare
  v_key text;
  v_user_id uuid := auth.uid();
  v_row connectivity_credentials%rowtype;
begin
  v_key := current_setting('app.settings.credential_encryption_key', true);
  if v_key is null or v_key = '' then
    raise exception 'credential_encryption_key is not configured on this Supabase project';
  end if;

  select * into v_row
  from connectivity_credentials c
  where c.user_id = v_user_id
    and c.connector_id = p_connector_id
    and (c.organization_id = p_organization_id or (c.organization_id is null and p_organization_id is null));

  if not found then
    return;
  end if;

  return query select
    v_row.auth_method,
    pgp_sym_decrypt(v_row.encrypted_secret, v_key),
    case when v_row.encrypted_refresh_token is not null then pgp_sym_decrypt(v_row.encrypted_refresh_token, v_key) else null end,
    v_row.expires_at;
end;
$$;

grant execute on function read_connectivity_credential to authenticated;

-- =========================================================================
-- deployment_profiles — backs DeploymentProfileManager. Pure metadata (a
-- managedPlatform connectorId reference, or SSH host/port/username/
-- credentialRef/deployCommands) — no secret lives in this table itself
-- (an SSH profile's credentialRef points at a connectivity_credentials
-- row instead), so plain direct RLS-gated CRUD is enough; no RPC needed.
-- =========================================================================
create table if not exists deployment_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  config jsonb not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_deployment_profiles_unique_solo
  on deployment_profiles (user_id, name) where organization_id is null;
create unique index if not exists idx_deployment_profiles_unique_org
  on deployment_profiles (user_id, organization_id, name) where organization_id is not null;
create index if not exists idx_deployment_profiles_user on deployment_profiles(user_id);

alter table deployment_profiles enable row level security;

drop policy if exists deployment_profiles_own on deployment_profiles;
create policy deployment_profiles_own on deployment_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists trg_audit_deployment_profiles on deployment_profiles;
drop trigger if exists trg_audit_deployment_profiles_ins on deployment_profiles;
drop trigger if exists trg_audit_deployment_profiles_upd on deployment_profiles;
drop trigger if exists trg_audit_deployment_profiles_del on deployment_profiles;
create trigger trg_audit_deployment_profiles_ins
  after insert on deployment_profiles
  for each row
  when (new.organization_id is not null)
  execute function log_audit_event();
create trigger trg_audit_deployment_profiles_upd
  after update on deployment_profiles
  for each row
  when (coalesce(new.organization_id, old.organization_id) is not null)
  execute function log_audit_event();
create trigger trg_audit_deployment_profiles_del
  after delete on deployment_profiles
  for each row
  when (old.organization_id is not null)
  execute function log_audit_event();
