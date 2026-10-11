-- Pairing codes: the caller no longer chooses how long one lives.
--
-- begin_pairing_session(p_expiry_seconds) took the lifetime from the request with no upper limit,
-- so a signed-in client could mint a pairing code valid for years. A pairing code is shown as a QR
-- code and scanned within moments; its lifetime is now held between 60 seconds and 10 minutes,
-- whatever is asked for. The default (300 seconds, what PawOS Desktop uses) is unchanged.
--
-- Everything else is exactly the function as defined in
-- 20260730020000_mobile_presence_pairing_enforcement.sql: same signature, same entitlement check
-- (fails closed), same token (24 random bytes, stored only as a SHA-256 hash).

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
  v_seconds int := least(greatest(coalesce(p_expiry_seconds, 300), 60), 600);
begin
  if v_user_id is null then
    raise exception 'not authorized: must be signed in to begin pairing';
  end if;

  select tier into v_tier from user_entitlements where user_id = v_user_id;
  if coalesce(v_tier, 'go') = 'go' then
    raise exception 'Mobile pairing requires Paw Pro or higher.';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_expires_at := now() + make_interval(secs => v_seconds);

  insert into pairing_sessions (user_id, token_hash, expires_at)
  values (v_user_id, encode(digest(v_token, 'sha256'), 'hex'), v_expires_at)
  returning id into v_session_id;

  return query select v_session_id, v_token, v_expires_at;
end;
$$;
