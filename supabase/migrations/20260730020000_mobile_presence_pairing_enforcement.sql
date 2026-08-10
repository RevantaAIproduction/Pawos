-- Mobile Presence — Pairing Runtime enforcement + real-time notification
-- (MOB-5). Extends 20260730000000_mobile_presence_phase1.sql.
--
-- ENTITLEMENT ENFORCEMENT — honest scope note: subscription tier for
-- individual (non-org) accounts has never had a server-side record before
-- this migration (pawos-web/src/app/api/billing/webhook/route.ts's own
-- comment: "no persistent account database configured yet, not persisted"
-- — a pre-existing, already-disclosed gap, not something this migration
-- claims to fully solve). user_entitlements below is a real Supabase table
-- the pairing RPC actually checks — a client that skips or fakes a UI
-- disabled-state can no longer complete pairing, since Postgres itself
-- re-checks this table and defaults an unknown/never-synced user to 'go'
-- (blocked). What this does NOT yet close: a determined attacker could
-- still call sync_my_entitlement_tier() with a fabricated tier value, since
-- there is no payment-verified write path yet — that requires the same
-- missing real webhook-to-database billing pipeline flagged above, which
-- is a pre-existing gap across the whole billing system, not specific to
-- pairing. This migration anchors trust at exactly one, single RPC rather
-- than leaving it scattered, so the day a real webhook exists, only this
-- one function's body needs to change.
create table if not exists user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'go',
  updated_at timestamptz not null default now()
);

alter table user_entitlements enable row level security;

create policy user_entitlements_own_select on user_entitlements
  for select using (user_id = auth.uid());

-- No direct insert/update policy — only via sync_my_entitlement_tier() below.

create or replace function sync_my_entitlement_tier(p_tier text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authorized';
  end if;
  if p_tier not in ('go', 'pro', 'proMax', 'team', 'enterprise') then
    raise exception 'invalid tier: %', p_tier;
  end if;

  insert into user_entitlements (user_id, tier, updated_at)
  values (v_user_id, p_tier, now())
  on conflict (user_id) do update set tier = excluded.tier, updated_at = now();
end;
$$;

grant execute on function sync_my_entitlement_tier to authenticated;

-- =========================================================================
-- begin_pairing_session() — re-defined to add the real entitlement check.
-- Same signature/token-issuance logic as the original; the only change is
-- the tier lookup up front. coalesce(..., 'go') means a user who has never
-- synced an entitlement (or whose sync was skipped by a modified client)
-- fails CLOSED, not open.
-- =========================================================================
create or replace function begin_pairing_session(p_expiry_seconds int default 300)
returns table (session_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tier text;
  v_token text;
  v_session_id uuid;
  v_expires_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'not authorized: must be signed in to begin pairing';
  end if;

  select tier into v_tier from user_entitlements where user_id = v_user_id;
  if coalesce(v_tier, 'go') = 'go' then
    raise exception 'Mobile pairing requires Paw Pro or higher.';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_expires_at := now() + make_interval(secs => p_expiry_seconds);

  insert into pairing_sessions (user_id, token_hash, expires_at)
  values (v_user_id, encode(digest(v_token, 'sha256'), 'hex'), v_expires_at)
  returning id into v_session_id;

  return query select v_session_id, v_token, v_expires_at;
end;
$$;

-- =========================================================================
-- complete_pairing_session() — re-defined to publish a real 'devicePaired'
-- cross_device_event on success, which is what lets the desktop's Realtime
-- subscription (Cross Device Runtime) show pairing success immediately,
-- with no polling.
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

  insert into cross_device_events (user_id, event_type, source_runtime, payload)
  values (v_user_id, 'devicePaired', 'pairingRuntime', jsonb_build_object(
    'sessionId', v_session.id,
    'deviceId', v_device_id,
    'deviceName', p_device_name
  ));

  return v_device_id;
end;
$$;

-- =========================================================================
-- cancel_pairing_session() — real cancellation, distinct from letting a
-- session simply expire (so the desktop UI's "Cancel" button has a real
-- effect: the token is immediately unusable, not just abandoned).
-- =========================================================================
create or replace function cancel_pairing_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  update pairing_sessions
  set status = 'cancelled'
  where id = p_session_id and user_id = v_user_id and status = 'pending';

  if not found then
    raise exception 'session not found, not owned by the current user, or no longer pending';
  end if;
end;
$$;

grant execute on function cancel_pairing_session to authenticated;

-- =========================================================================
-- revoke_trusted_device() — re-defined to also publish a real
-- 'deviceRevoked' cross_device_event (the security/audit-log value: this
-- is a permanent, queryable record of every revocation, and lets an
-- actively-connected revoked device learn it's been kicked out).
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

  insert into cross_device_events (user_id, event_type, source_runtime, payload)
  values (v_user_id, 'deviceRevoked', 'trustedDeviceRuntime', jsonb_build_object('deviceId', p_device_id));
end;
$$;
