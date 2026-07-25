-- Connectivity Runtime — Section 17 follow-up. This Supabase Cloud project
-- rejects `ALTER DATABASE postgres SET app.settings.credential_encryption_key
-- = '...'` with `42501: permission denied to set parameter` — a custom
-- project-level GUC isn't settable on this project (confirmed live), so
-- store_connectivity_credential/read_connectivity_credential (in
-- 20260726000000_connectivity_runtime_persistence.sql) can never actually
-- work as written. Supabase Vault (pgsodium-backed, confirmed installed on
-- this project) is the supported secret-at-rest mechanism here instead.
--
-- This migration only replaces that one unsupported secret source. It does
-- not change: the table's RLS policies, its audit triggers, or the two RPC
-- signatures the renderer already calls (ConnectivityCredentialService.ts
-- is untouched — same function names, same params, same return shape).
--
-- connectivity_credentials no longer stores ciphertext directly
-- (encrypted_secret/encrypted_refresh_token bytea, encrypted with a GUC key
-- that never worked) — it stores a reference (secret_id/refresh_token_id)
-- into vault.secrets instead; decrypt-on-read goes through
-- vault.decrypted_secrets, gated by Vault the same way every other secret
-- on this project is. Nothing was ever successfully written under the old
-- bytea columns (every store_connectivity_credential call failed on the
-- missing GUC before this fix), so there is no plaintext-recovery step
-- needed before dropping them.
--
-- The OPERATIONAL NOTE comment in 20260726000000 (about reusing Phase 6's
-- app.settings.credential_encryption_key) is superseded by this file —
-- disregard it; this table no longer uses that GUC at all.

alter table connectivity_credentials
  add column if not exists secret_id uuid,
  add column if not exists refresh_token_id uuid;

alter table connectivity_credentials
  drop column if exists encrypted_secret,
  drop column if exists encrypted_refresh_token;

-- =========================================================================
-- store_connectivity_credential() — unchanged signature/semantics (always
-- writes under auth.uid(), upserts by (user, connector, org) tuple). The
-- only change is where the secret ends up: vault.create_secret() on first
-- write, vault.update_secret() on rotation (preserves the existing
-- secret_id rather than orphaning the old vault row).
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
set search_path = public, vault
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
  v_secret_id uuid;
  v_refresh_token_id uuid;
  v_existing_secret_id uuid;
  v_existing_refresh_token_id uuid;
begin
  if p_organization_id is not null
     and not (is_org_member(p_organization_id, v_user_id) or exists (select 1 from organizations where id = p_organization_id and owner_user_id = v_user_id)) then
    raise exception 'not authorized: not a member of this organization';
  end if;

  select id, secret_id, refresh_token_id into v_id, v_existing_secret_id, v_existing_refresh_token_id
  from connectivity_credentials
  where user_id = v_user_id
    and connector_id = p_connector_id
    and (organization_id = p_organization_id or (organization_id is null and p_organization_id is null));

  if v_existing_secret_id is not null then
    perform vault.update_secret(v_existing_secret_id, p_secret);
    v_secret_id := v_existing_secret_id;
  else
    v_secret_id := vault.create_secret(p_secret, 'connectivity:' || p_connector_id || ':' || v_user_id);
  end if;

  if p_refresh_token is not null then
    if v_existing_refresh_token_id is not null then
      perform vault.update_secret(v_existing_refresh_token_id, p_refresh_token);
      v_refresh_token_id := v_existing_refresh_token_id;
    else
      v_refresh_token_id := vault.create_secret(p_refresh_token, 'connectivity-refresh:' || p_connector_id || ':' || v_user_id);
    end if;
  else
    v_refresh_token_id := v_existing_refresh_token_id;
  end if;

  if v_id is not null then
    update connectivity_credentials
    set auth_method = p_auth_method,
        secret_id = v_secret_id,
        refresh_token_id = v_refresh_token_id,
        expires_at = p_expires_at,
        updated_at = now()
    where id = v_id;
  else
    insert into connectivity_credentials (user_id, organization_id, connector_id, auth_method, secret_id, refresh_token_id, expires_at)
    values (v_user_id, p_organization_id, p_connector_id, p_auth_method, v_secret_id, v_refresh_token_id, p_expires_at)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function store_connectivity_credential to authenticated;

-- =========================================================================
-- read_connectivity_credential() — unchanged signature/semantics (reads
-- under auth.uid(), returns null rather than raising when nothing is
-- stored). Decryption now happens via vault.decrypted_secrets instead of
-- pgp_sym_decrypt() with the unsupported GUC key.
-- =========================================================================
create or replace function read_connectivity_credential(
  p_connector_id text,
  p_organization_id uuid
)
returns table (auth_method text, secret text, refresh_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_user_id uuid := auth.uid();
  v_row connectivity_credentials%rowtype;
begin
  select * into v_row
  from connectivity_credentials c
  where c.user_id = v_user_id
    and c.connector_id = p_connector_id
    and (c.organization_id = p_organization_id or (c.organization_id is null and p_organization_id is null));

  if not found then
    return;
  end if;

  return query
  select
    v_row.auth_method,
    (select decrypted_secret from vault.decrypted_secrets where id = v_row.secret_id),
    case when v_row.refresh_token_id is not null
      then (select decrypted_secret from vault.decrypted_secrets where id = v_row.refresh_token_id)
      else null
    end,
    v_row.expires_at;
end;
$$;

grant execute on function read_connectivity_credential to authenticated;

-- =========================================================================
-- Revoke (ConnectivityCredentialService.revoke()) is a plain RLS-gated
-- DELETE from the client, not an RPC — it never had a place to clean up
-- the corresponding vault.secrets rows. This trigger closes that gap so a
-- revoked credential doesn't leave its secret behind in Vault.
-- =========================================================================
create or replace function cleanup_connectivity_credential_secret()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if old.secret_id is not null then
    perform vault.delete_secret(old.secret_id);
  end if;
  if old.refresh_token_id is not null then
    perform vault.delete_secret(old.refresh_token_id);
  end if;
  return old;
end;
$$;

drop trigger if exists trg_cleanup_connectivity_credential_secret on connectivity_credentials;
create trigger trg_cleanup_connectivity_credential_secret
  before delete on connectivity_credentials
  for each row
  execute function cleanup_connectivity_credential_secret();
