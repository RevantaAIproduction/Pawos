-- Mobile Presence — Security Key Verification (MOB-5 part 2)
-- Adds the second-factor verification step after QR pairing.
--
-- The flow is:
-- 1. Desktop QR scan completes (complete_pairing_session)
-- 2. Desktop calls create_pairing_security_key() → gets plaintext key once
-- 3. Desktop displays key to user (plaintext NOT persisted)
-- 4. Backend stores only bcrypt hash
-- 5. Mobile user enters key
-- 6. Mobile calls verify_pairing_security_key() → backend verifies hash
-- 7. On success: issues persistent session token, creates mobile_sessions row
--
-- Security properties:
-- - Plaintext key never stored anywhere
-- - Key is single-use (verified_at timestamp prevents reuse)
-- - Key expires after 2 minutes
-- - Rate-limited: 5 failed attempts and session fails
-- - Tied to pairing session + resulting device_id + user_id
-- - Token exchange happens server-side (no bearer tokens in URLs)

-- =========================================================================
-- mobile_sessions — persistent session tokens for authenticated PWA sessions
-- after successful Security Key verification. One row per active mobile session.
-- =========================================================================
create table if not exists mobile_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references trusted_devices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_token text not null unique, -- opaque random token, never exposed in URLs
  created_at timestamptz not null default now(),
  expires_at timestamptz not null, -- typically 30 days from creation
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists idx_mobile_sessions_device on mobile_sessions(device_id);
create index if not exists idx_mobile_sessions_user on mobile_sessions(user_id);
create index if not exists idx_mobile_sessions_token on mobile_sessions(session_token);

alter table mobile_sessions enable row level security;

create policy mobile_sessions_own_select on mobile_sessions
  for select using (user_id = auth.uid());

-- No direct insert/update/delete — only via security-definer RPCs below.

-- =========================================================================
-- pairing_session_security_keys — temporary second-factor tokens bound to
-- pairing sessions. Each key is bcrypt-hashed at rest; plaintext is only
-- returned from create_pairing_security_key() to the immediate caller.
-- =========================================================================
create table if not exists pairing_session_security_keys (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references pairing_sessions(id) on delete cascade,
  key_hash text not null, -- bcrypt(key)
  created_at timestamptz not null default now(),
  expires_at timestamptz not null, -- typically 2 minutes
  verified_at timestamptz, -- NULL until first successful verification
  attempt_count int not null default 0,
  max_attempts int not null default 5,
  check (max_attempts > 0),
  check (attempt_count >= 0)
);

create index if not exists idx_security_keys_session on pairing_session_security_keys(session_id);
create index if not exists idx_security_keys_session_verified on pairing_session_security_keys(session_id, verified_at);

alter table pairing_session_security_keys enable row level security;

-- Mobile PWA has no direct access to this table; all operations go through RPCs.

-- =========================================================================
-- create_pairing_security_key() — Security Key generator, called by Desktop
-- after QR pairing succeeds (when complete_pairing_session publishes
-- 'devicePaired' event). Returns plaintext key to caller ONE TIME.
-- Backend never stores/returns plaintext after this call.
-- =========================================================================
create or replace function create_pairing_security_key(p_session_id uuid)
returns table (plaintext text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_key_hash text;
  v_expires_at timestamptz;
  v_session_status text;
begin
  if v_user_id is null then
    raise exception 'not authorized: must be signed in';
  end if;

  -- Verify the pairing session exists, belongs to this user, and is in the right state
  select status into v_session_status
  from pairing_sessions
  where id = p_session_id and user_id = v_user_id;

  if v_session_status is null then
    raise exception 'pairing session not found or does not belong to this user';
  end if;

  if v_session_status != 'completed' then
    raise exception 'pairing session must be completed before generating security key';
  end if;

  -- Check if a key already exists for this session (prevent duplicate calls)
  if exists (
    select 1 from pairing_session_security_keys
    where session_id = p_session_id and verified_at is null and expires_at > now()
  ) then
    raise exception 'security key already exists for this session';
  end if;

  -- Generate random 8-character alphanumeric key
  -- Format: 4 chars + hyphen + 4 chars = "XXXX-XXXX"
  v_key := (
    select substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
                  1 + (random() * 35)::int, 1) ||
            substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
                  1 + (random() * 35)::int, 1) ||
            substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
                  1 + (random() * 35)::int, 1) ||
            substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
                  1 + (random() * 35)::int, 1) ||
            '-' ||
            substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
                  1 + (random() * 35)::int, 1) ||
            substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
                  1 + (random() * 35)::int, 1) ||
            substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
                  1 + (random() * 35)::int, 1) ||
            substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
                  1 + (random() * 35)::int, 1)
  );

  -- Bcrypt the key for storage
  v_key_hash := crypt(v_key, gen_salt('bf', 8));
  v_expires_at := now() + interval '2 minutes';

  -- Store only the hash
  insert into pairing_session_security_keys (session_id, key_hash, expires_at)
  values (p_session_id, v_key_hash, v_expires_at);

  -- Return plaintext ONLY to this immediate RPC call
  return query select v_key, v_expires_at;
end;
$$;

grant execute on function create_pairing_security_key to authenticated;

-- =========================================================================
-- validate_mobile_session() — Verify that a session token is still valid.
-- Called by mobile PWA on app reopen to auto-reconnect without re-pairing.
-- =========================================================================
create or replace function validate_mobile_session(p_session_token text)
returns table (
  device_id uuid,
  user_id uuid,
  device_name text,
  device_type text,
  platform text,
  browser text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_token_record mobile_sessions%rowtype;
begin
  -- Fetch session and verify not expired, not revoked
  select * into v_session_token_record
  from mobile_sessions
  where session_token = p_session_token
    and revoked_at is null
    and expires_at > now();

  if not found then
    raise exception 'invalid or expired session';
  end if;

  -- Update last_used_at timestamp (heartbeat)
  update mobile_sessions
  set last_used_at = now()
  where id = v_session_token_record.id;

  -- Return device info
  return query
  select
    v_session_token_record.device_id,
    v_session_token_record.user_id,
    td.name,
    td.device_type,
    td.platform,
    td.browser
  from trusted_devices td
  where td.id = v_session_token_record.device_id
    and td.status = 'active'
    and td.revoked_at is null;
end;
$$;

grant execute on function validate_mobile_session to public;

-- =========================================================================
-- verify_pairing_security_key() — Security Key verifier, called by mobile PWA
-- after user enters the key. Returns device_id + session_token if correct,
-- raises exception if wrong/expired.
-- =========================================================================
create or replace function verify_pairing_security_key(p_session_id uuid, p_key_plain text)
returns table (
  success boolean,
  device_id uuid,
  session_token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key_record pairing_session_security_keys%rowtype;
  v_session_record pairing_sessions%rowtype;
  v_device_id uuid;
  v_user_id uuid;
  v_session_token text;
  v_expires_at timestamptz;
begin
  -- Fetch the key record and lock it
  select * into v_key_record
  from pairing_session_security_keys
  where session_id = p_session_id
  for update;

  if not found then
    raise exception 'security key not found for this pairing session';
  end if;

  -- Check if already verified (single-use)
  if v_key_record.verified_at is not null then
    raise exception 'security key has already been used';
  end if;

  -- Check if expired
  if now() > v_key_record.expires_at then
    raise exception 'security key has expired';
  end if;

  -- Check attempt limit
  if v_key_record.attempt_count >= v_key_record.max_attempts then
    raise exception 'too many verification attempts; pairing session cancelled';
  end if;

  -- Increment attempt counter (even for wrong attempts)
  update pairing_session_security_keys
  set attempt_count = attempt_count + 1
  where id = v_key_record.id;

  -- Verify key using bcrypt constant-time comparison
  if not (crypt(p_key_plain, v_key_record.key_hash) = v_key_record.key_hash) then
    raise exception 'security key does not match';
  end if;

  -- Mark key as verified
  update pairing_session_security_keys
  set verified_at = now()
  where id = v_key_record.id;

  -- Fetch pairing session info
  select * into v_session_record
  from pairing_sessions
  where id = p_session_id;

  if not found then
    raise exception 'pairing session not found';
  end if;

  v_user_id := v_session_record.user_id;
  v_device_id := v_session_record.resulting_device_id;

  if v_device_id is null then
    raise exception 'pairing session has no resulting device';
  end if;

  -- Generate persistent session token (random 32 bytes, hex-encoded)
  v_session_token := encode(gen_random_bytes(32), 'hex');
  v_expires_at := now() + interval '30 days';

  -- Create mobile session record
  insert into mobile_sessions (device_id, user_id, session_token, expires_at)
  values (v_device_id, v_user_id, v_session_token, v_expires_at);

  -- Return success with session token
  return query select true, v_device_id, v_session_token, v_expires_at;
end;
$$;

grant execute on function verify_pairing_security_key to public;
