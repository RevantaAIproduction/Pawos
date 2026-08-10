-- Mobile Presence Runtime — Phase 1 schema (MOB-1).
--
-- Replaces the two local-Electron-JSON pairing stores found during audit
-- (src/main/pairing/PlatformPairingStore.ts, src/main/communication/
-- MobilePairingStore.ts) with a real, cross-device source of truth: a
-- phone's browser can never read a file in the desktop's userData folder,
-- so pairing/trust state has to live somewhere both the desktop app and the
-- pawos-web PWA can reach — Supabase, the same backend already used for
-- Organization Runtime, Remote Assistance, and Shared Documents.
--
-- Pairing tokens follow the same discipline as
-- src/main/mail/passwordResetToken.ts (signed/hashed, single-use, short
-- expiry, never stored in plaintext) — but hashed server-side via pgcrypto's
-- digest(), not HMAC-signed with a local secret file, since the token now
-- has to be verified by a Postgres RPC rather than a single local process.
--
-- Encryption note: this migration deliberately does NOT reach for Supabase
-- Vault or pgcrypto's pgp_sym_encrypt() for push-subscription keys — see
-- 20260726010000_connectivity_credentials_vault.sql, which discovered that a
-- custom GUC-based pgcrypto key is rejected on this Supabase Cloud project
-- ("42501: permission denied to set parameter"). Vault is reserved for
-- genuinely high-value secrets (OAuth tokens); a Web Push subscription
-- (endpoint + public keys, standard W3C Push API shape) is not a bearer
-- secret in the same sense and is protected by ordinary RLS instead, which
-- is the normal industry pattern for push subscriptions. Only the pairing
-- token itself (a real single-use bearer credential) is hashed at rest.

-- =========================================================================
-- trusted_devices — every device a user has paired, replacing both legacy
-- local stores. Includes a Device Capability model (jsonb) so future client
-- types (native apps, etc.) can advertise what they support without a
-- schema change — see src/shared/mobilePresence/MobilePresenceTypes.ts.
-- =========================================================================
create table if not exists trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  device_type text not null default 'pwa', -- 'pwa' | 'desktop' | 'native' — open string, not an enum, so a future client type never needs a migration
  platform text,
  browser text,
  capabilities jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'revoked')),
  paired_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists idx_trusted_devices_user on trusted_devices(user_id) where status = 'active';

alter table trusted_devices enable row level security;

create policy trusted_devices_own_select on trusted_devices
  for select using (user_id = auth.uid());

create policy trusted_devices_own_update on trusted_devices
  for update using (user_id = auth.uid());

-- No direct insert policy — rows are only ever created by
-- complete_pairing_session() below (security definer), never by a raw
-- client insert, so a device can't fabricate its own trust record.

-- =========================================================================
-- pairing_sessions — the Pairing Runtime's token lifecycle. token_hash is
-- sha256(token), never the plaintext; begin_pairing_session() is the only
-- place the plaintext token is ever returned, and only to the caller who
-- just generated it.
-- =========================================================================
create table if not exists pairing_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'expired', 'cancelled')),
  resulting_device_id uuid references trusted_devices(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz
);

create index if not exists idx_pairing_sessions_user_pending on pairing_sessions(user_id, status) where status = 'pending';

alter table pairing_sessions enable row level security;

create policy pairing_sessions_own_select on pairing_sessions
  for select using (user_id = auth.uid());

-- Inserts/completion only via the security-definer RPCs below.

-- =========================================================================
-- device_push_subscriptions — one row per (device, browser push endpoint).
-- Plain RLS-protected columns, per the encryption note above.
-- =========================================================================
create table if not exists device_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references trusted_devices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_device_push_subscriptions_endpoint on device_push_subscriptions(endpoint);
create index if not exists idx_device_push_subscriptions_device on device_push_subscriptions(device_id);

alter table device_push_subscriptions enable row level security;

create policy device_push_subscriptions_own_select on device_push_subscriptions
  for select using (user_id = auth.uid());

create policy device_push_subscriptions_own_insert on device_push_subscriptions
  for insert with check (user_id = auth.uid());

create policy device_push_subscriptions_own_delete on device_push_subscriptions
  for delete using (user_id = auth.uid());

-- =========================================================================
-- cross_device_events — the Cross Device Runtime's outbox. Every other
-- runtime (Execution, Planner, Notification, Organization/Governance)
-- publishes here via publish_cross_device_event() rather than inventing its
-- own sync/delivery mechanism. organization_id is set only for org-scoped
-- events (governance/security/deployment alerts); personal events only set
-- user_id. Realtime subscribers (desktop + PWA) listen on this table the
-- same way WorkspacePresenceService/RemoteAssistanceService already do.
-- =========================================================================
create table if not exists cross_device_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  event_type text not null,
  source_runtime text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  constraint cross_device_events_scope check (user_id is not null or organization_id is not null)
);

create index if not exists idx_cross_device_events_user on cross_device_events(user_id, created_at desc);
create index if not exists idx_cross_device_events_org on cross_device_events(organization_id, created_at desc);

alter table cross_device_events enable row level security;

create policy cross_device_events_select on cross_device_events
  for select using (
    user_id = auth.uid()
    or (organization_id is not null and is_org_member(organization_id, auth.uid()))
  );

-- No direct insert/update policy — always via publish_cross_device_event()
-- and mark_cross_device_event_delivered() below, so entitlement/shape
-- validation always runs server-side rather than trusting the client.

-- =========================================================================
-- begin_pairing_session() — real, single-use, expiring token issuance.
-- =========================================================================
create or replace function begin_pairing_session(p_expiry_seconds int default 300)
returns table (session_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text;
  v_session_id uuid;
  v_expires_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'not authorized: must be signed in to begin pairing';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_expires_at := now() + make_interval(secs => p_expiry_seconds);

  insert into pairing_sessions (user_id, token_hash, expires_at)
  values (v_user_id, encode(digest(v_token, 'sha256'), 'hex'), v_expires_at)
  returning id into v_session_id;

  return query select v_session_id, v_token, v_expires_at;
end;
$$;

grant execute on function begin_pairing_session to authenticated;

-- =========================================================================
-- complete_pairing_session() — called from the phone (same authenticated
-- account) once it has scanned the QR / opened the pairing link. Verifies
-- the token hash and expiry, creates the trusted_devices row, links it back
-- to the session so the desktop's Realtime subscription can pick it up.
-- =========================================================================
create or replace function complete_pairing_session(
  p_token text,
  p_device_name text,
  p_device_type text default 'pwa',
  p_platform text default null,
  p_browser text default null,
  p_capabilities jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session pairing_sessions%rowtype;
  v_device_id uuid;
begin
  if v_user_id is null then
    raise exception 'not authorized: must be signed in to complete pairing';
  end if;

  select * into v_session
  from pairing_sessions
  where user_id = v_user_id
    and status = 'pending'
    and token_hash = encode(digest(p_token, 'sha256'), 'hex')
  for update;

  if not found then
    raise exception 'invalid or already-used pairing code';
  end if;

  if now() > v_session.expires_at then
    update pairing_sessions set status = 'expired' where id = v_session.id;
    raise exception 'this pairing code has expired';
  end if;

  insert into trusted_devices (user_id, name, device_type, platform, browser, capabilities)
  values (v_user_id, p_device_name, p_device_type, p_platform, p_browser, p_capabilities)
  returning id into v_device_id;

  update pairing_sessions
  set status = 'completed', completed_at = now(), resulting_device_id = v_device_id
  where id = v_session.id;

  return v_device_id;
end;
$$;

grant execute on function complete_pairing_session to authenticated;

-- =========================================================================
-- revoke_trusted_device() — flips status and, unlike the old local stores,
-- actually has something live to invalidate: it deletes the device's push
-- subscriptions so no further notification can ever reach it again.
-- =========================================================================
create or replace function revoke_trusted_device(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  update trusted_devices
  set status = 'revoked', revoked_at = now()
  where id = p_device_id and user_id = v_user_id;

  if not found then
    raise exception 'device not found or not owned by the current user';
  end if;

  delete from device_push_subscriptions where device_id = p_device_id;
end;
$$;

grant execute on function revoke_trusted_device to authenticated;

-- =========================================================================
-- publish_cross_device_event() — the one write path into the Cross Device
-- Runtime's outbox. p_user_id must be the caller's own id unless publishing
-- an org-scoped event the caller is a member of, so one user can never
-- inject an event into another user's personal feed.
-- =========================================================================
create or replace function publish_cross_device_event(
  p_event_type text,
  p_source_runtime text,
  p_payload jsonb default '{}'::jsonb,
  p_user_id uuid default null,
  p_organization_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_event_id uuid;
begin
  if v_caller is null then
    raise exception 'not authorized';
  end if;

  if p_user_id is not null and p_user_id != v_caller then
    raise exception 'not authorized: cannot publish an event into another user''s personal feed';
  end if;

  if p_organization_id is not null and not is_org_member(p_organization_id, v_caller) then
    raise exception 'not authorized: not a member of this organization';
  end if;

  if p_user_id is null and p_organization_id is null then
    p_user_id := v_caller;
  end if;

  insert into cross_device_events (user_id, organization_id, event_type, source_runtime, payload)
  values (p_user_id, p_organization_id, p_event_type, p_source_runtime, p_payload)
  returning id into v_event_id;

  return v_event_id;
end;
$$;

grant execute on function publish_cross_device_event to authenticated;

create or replace function mark_cross_device_event_delivered(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update cross_device_events
  set delivered_at = now()
  where id = p_event_id
    and (user_id = auth.uid() or (organization_id is not null and is_org_member(organization_id, auth.uid())));
end;
$$;

grant execute on function mark_cross_device_event_delivered to authenticated;
