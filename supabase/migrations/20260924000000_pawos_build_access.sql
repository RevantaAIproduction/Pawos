-- Migration: 20260924000000_pawos_build_access
--
-- PawOS Build: a PRIVATE, admin-granted student tier. Access lasts exactly two calendar months from
-- the moment an authorized admin grants it. There is no public checkout; the ₹500 program price is
-- collected outside PawOS and is not modelled here.
--
-- Replaces the never-deployed 20260916000000_pawos_build_cohort / 20260916000001_pawos_build_reservations
-- design (500 included PC refilled 72 hours after exhaustion, a purchasable Build balance, and a
-- reserve/settle/release ledger). Build capacity is now the same rolling-window model every
-- individual tier uses (see PawComputeCapacityStore.ts: 1,500 PC/week, 500 PC per 5-hour window,
-- 15 active hours/week, 5 active hours per 5-hour window), so none of those balance objects exist.
--
-- Security model: the grant tables have RLS enabled with NO policies and no table privileges for
-- anon/authenticated. Every read and write goes through the SECURITY DEFINER functions below:
--   * get_my_build_access()   — any signed-in user, returns only their own grant
--   * admin_*_build...()      — refuse unless the caller's auth.users email is in pawos_admins
-- The server is the only source of truth for membership and expiry.

-- Retire the obsolete design if it was ever applied to another environment (it is not live here).
drop function if exists public.purchase_pawos_build_credits(uuid, numeric);
drop function if exists public.consume_pawos_build_pc(numeric, text, text, jsonb);
drop function if exists public.get_pawos_build_state();
drop function if exists public.reserve_pawos_build_pc(text, numeric, text, text);
drop function if exists public.settle_pawos_build_pc(text, numeric);
drop function if exists public.release_pawos_build_pc(text);
drop table if exists public.pawos_build_reservations;
drop table if exists public.pawos_build_usage_events;
drop table if exists public.pawos_build_cohort;
drop function if exists public.update_pawos_build_cohort_updated_at();

-- ── Admin allow-list ────────────────────────────────────────────────────────────────────────────
-- Emails authorized to grant/revoke Build. Managed with SQL (service role) only.
create table if not exists public.pawos_admins (
  email text primary key check (email = lower(btrim(email)) and email <> ''),
  created_at timestamptz not null default now()
);
alter table public.pawos_admins enable row level security;
revoke all on public.pawos_admins from anon, authenticated;

insert into public.pawos_admins (email) values
  ('founder@revantaai.com'),
  ('pawos@revantaai.com'),
  ('tharun@revantaai.com')
on conflict (email) do nothing;

-- ── Grants ──────────────────────────────────────────────────────────────────────────────────────
-- One row per student email. Renewals/regrants update the row in place; history lives in the audit
-- table. user_id stays null until the student signs in (or already had an account at grant time).
create table if not exists public.pawos_build_grants (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(btrim(email)) and email <> ''),
  user_id uuid references auth.users(id) on delete set null,
  cohort_id text not null default 'build-2026',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_by_email text,
  granted_by uuid references auth.users(id) on delete set null,
  granted_by_email text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pawos_build_grants_window check (ends_at > starts_at)
);
create unique index if not exists pawos_build_grants_email_key on public.pawos_build_grants (email);
create unique index if not exists pawos_build_grants_user_id_key on public.pawos_build_grants (user_id) where user_id is not null;

alter table public.pawos_build_grants enable row level security;
revoke all on public.pawos_build_grants from anon, authenticated;

create table if not exists public.pawos_build_grant_audit (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid references public.pawos_build_grants(id) on delete cascade,
  email text not null,
  action text not null check (action in ('grant', 'regrant', 'renew', 'revoke')),
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pawos_build_grant_audit_grant_idx on public.pawos_build_grant_audit (grant_id, created_at desc);

alter table public.pawos_build_grant_audit enable row level security;
revoke all on public.pawos_build_grant_audit from anon, authenticated;

-- ── Helpers ─────────────────────────────────────────────────────────────────────────────────────
create or replace function public.pawos_build_status(p_grant public.pawos_build_grants, p_now timestamptz)
returns text
language sql
immutable
as $$
  select case
    when p_grant.revoked_at is not null then 'revoked'
    when p_now >= p_grant.ends_at then 'expired'
    when p_now < p_grant.starts_at then 'expired'
    else 'active'
  end;
$$;

create or replace function public.pawos_build_grant_json(p_grant public.pawos_build_grants, p_now timestamptz)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', p_grant.id,
    'email', p_grant.email,
    'userId', p_grant.user_id,
    'cohortId', p_grant.cohort_id,
    'status', public.pawos_build_status(p_grant, p_now),
    'startsAt', p_grant.starts_at,
    'endsAt', p_grant.ends_at,
    'revokedAt', p_grant.revoked_at,
    'revokedByEmail', p_grant.revoked_by_email,
    'grantedByEmail', p_grant.granted_by_email,
    'notes', p_grant.notes,
    'createdAt', p_grant.created_at,
    'updatedAt', p_grant.updated_at
  );
$$;

create or replace function public.pawos_is_build_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    join public.pawos_admins a on a.email = lower(u.email)
    where u.id = auth.uid()
  );
$$;

-- Caller's own lower-cased email, or raise if not signed in.
create or replace function public.pawos_caller_email()
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();
  return v_email;
end;
$$;

create or replace function public.pawos_require_build_admin()
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_email text := public.pawos_caller_email();
begin
  if not public.pawos_is_build_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_email;
end;
$$;

create or replace function public.pawos_normalize_build_email(p_email text)
returns text
language plpgsql
immutable
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  return v_email;
end;
$$;

-- ── Student: read own access ────────────────────────────────────────────────────────────────────
-- Returns {status: 'none'|'active'|'expired'|'revoked', ...}. On first sign-in, binds a pending
-- email-keyed grant to the caller's account — only when the caller's email is confirmed and the
-- grant is not already bound to someone else.
create or replace function public.get_my_build_access()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_grant public.pawos_build_grants;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_grant from public.pawos_build_grants g where g.user_id = v_uid;

  if v_grant.id is null then
    select lower(u.email), u.email_confirmed_at into v_email, v_confirmed from auth.users u where u.id = v_uid;
    if v_email is not null and v_confirmed is not null then
      update public.pawos_build_grants g
        set user_id = v_uid, updated_at = now()
        where g.email = v_email and g.user_id is null
        returning * into v_grant;
    end if;
  end if;

  if v_grant.id is null then
    return jsonb_build_object('status', 'none', 'serverNow', now());
  end if;

  return public.pawos_build_grant_json(v_grant, now())
    - 'email' - 'userId' - 'revokedByEmail' - 'grantedByEmail' - 'notes' - 'createdAt' - 'updatedAt' - 'id'
    || jsonb_build_object('serverNow', now());
end;
$$;

-- ── Admin: grant / regrant ──────────────────────────────────────────────────────────────────────
-- New email → grant. Expired/revoked email → regrant (fresh two months from now).
-- Currently active email → no change, result 'already_active' (use admin_renew_build to extend).
create or replace function public.admin_grant_build(p_email text, p_cohort_id text default null, p_notes text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  v_actor_email text := public.pawos_require_build_admin();
  v_email text := public.pawos_normalize_build_email(p_email);
  v_now timestamptz := now();
  v_uid uuid;
  v_grant public.pawos_build_grants;
  v_action text;
begin
  select u.id into v_uid from auth.users u where lower(u.email) = v_email order by u.created_at limit 1;
  select * into v_grant from public.pawos_build_grants g where g.email = v_email for update;

  if v_grant.id is not null and public.pawos_build_status(v_grant, v_now) = 'active' then
    return jsonb_build_object('result', 'already_active', 'grant', public.pawos_build_grant_json(v_grant, v_now));
  end if;

  if v_grant.id is null then
    insert into public.pawos_build_grants (email, user_id, cohort_id, starts_at, ends_at, granted_by, granted_by_email, notes)
    values (v_email, v_uid, coalesce(nullif(btrim(p_cohort_id), ''), 'build-2026'), v_now, v_now + interval '2 months', auth.uid(), v_actor_email, nullif(btrim(p_notes), ''))
    returning * into v_grant;
    v_action := 'grant';
  else
    update public.pawos_build_grants g set
      user_id = coalesce(g.user_id, v_uid),
      cohort_id = coalesce(nullif(btrim(p_cohort_id), ''), g.cohort_id),
      starts_at = v_now,
      ends_at = v_now + interval '2 months',
      revoked_at = null,
      revoked_by = null,
      revoked_by_email = null,
      granted_by = auth.uid(),
      granted_by_email = v_actor_email,
      notes = coalesce(nullif(btrim(p_notes), ''), g.notes),
      updated_at = v_now
    where g.id = v_grant.id
    returning * into v_grant;
    v_action := 'regrant';
  end if;

  insert into public.pawos_build_grant_audit (grant_id, email, action, actor_id, actor_email, starts_at, ends_at)
  values (v_grant.id, v_grant.email, v_action, auth.uid(), v_actor_email, v_grant.starts_at, v_grant.ends_at);

  return jsonb_build_object('result', v_action, 'grant', public.pawos_build_grant_json(v_grant, v_now));
end;
$$;

-- ── Admin: renew (extend an active grant by two months) ─────────────────────────────────────────
create or replace function public.admin_renew_build(p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  v_actor_email text := public.pawos_require_build_admin();
  v_email text := public.pawos_normalize_build_email(p_email);
  v_now timestamptz := now();
  v_grant public.pawos_build_grants;
begin
  select * into v_grant from public.pawos_build_grants g where g.email = v_email for update;
  if v_grant.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if public.pawos_build_status(v_grant, v_now) <> 'active' then
    raise exception 'not_active' using errcode = '22023', hint = 'Use admin_grant_build to regrant an expired or revoked email.';
  end if;

  update public.pawos_build_grants g set
    ends_at = g.ends_at + interval '2 months',
    updated_at = v_now
  where g.id = v_grant.id
  returning * into v_grant;

  insert into public.pawos_build_grant_audit (grant_id, email, action, actor_id, actor_email, starts_at, ends_at)
  values (v_grant.id, v_grant.email, 'renew', auth.uid(), v_actor_email, v_grant.starts_at, v_grant.ends_at);

  return jsonb_build_object('result', 'renew', 'grant', public.pawos_build_grant_json(v_grant, v_now));
end;
$$;

-- ── Admin: revoke ───────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_revoke_build(p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  v_actor_email text := public.pawos_require_build_admin();
  v_email text := public.pawos_normalize_build_email(p_email);
  v_now timestamptz := now();
  v_grant public.pawos_build_grants;
begin
  select * into v_grant from public.pawos_build_grants g where g.email = v_email for update;
  if v_grant.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_grant.revoked_at is not null then
    return jsonb_build_object('result', 'already_revoked', 'grant', public.pawos_build_grant_json(v_grant, v_now));
  end if;

  update public.pawos_build_grants g set
    revoked_at = v_now,
    revoked_by = auth.uid(),
    revoked_by_email = v_actor_email,
    updated_at = v_now
  where g.id = v_grant.id
  returning * into v_grant;

  insert into public.pawos_build_grant_audit (grant_id, email, action, actor_id, actor_email, starts_at, ends_at)
  values (v_grant.id, v_grant.email, 'revoke', auth.uid(), v_actor_email, v_grant.starts_at, v_grant.ends_at);

  return jsonb_build_object('result', 'revoke', 'grant', public.pawos_build_grant_json(v_grant, v_now));
end;
$$;

-- ── Admin: list ─────────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_list_build_grants()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_now timestamptz := now();
begin
  perform public.pawos_require_build_admin();
  return coalesce(
    (select jsonb_agg(public.pawos_build_grant_json(g, v_now) order by g.created_at desc) from public.pawos_build_grants g),
    '[]'::jsonb
  );
end;
$$;

-- ── Privileges ──────────────────────────────────────────────────────────────────────────────────
-- Supabase's default privileges grant EXECUTE on new public functions to anon/authenticated, so
-- revoke explicitly and re-grant only what signed-in callers need. Admin functions still check the
-- allow-list internally; granting EXECUTE only lets a non-admin reach the 'forbidden' error.
revoke all on function public.pawos_build_status(public.pawos_build_grants, timestamptz) from public, anon, authenticated;
revoke all on function public.pawos_build_grant_json(public.pawos_build_grants, timestamptz) from public, anon, authenticated;
revoke all on function public.pawos_caller_email() from public, anon, authenticated;
revoke all on function public.pawos_require_build_admin() from public, anon, authenticated;
revoke all on function public.pawos_normalize_build_email(text) from public, anon, authenticated;
revoke all on function public.pawos_is_build_admin() from public, anon;
revoke all on function public.get_my_build_access() from public, anon;
revoke all on function public.admin_grant_build(text, text, text) from public, anon;
revoke all on function public.admin_renew_build(text) from public, anon;
revoke all on function public.admin_revoke_build(text) from public, anon;
revoke all on function public.admin_list_build_grants() from public, anon;

grant execute on function public.pawos_is_build_admin() to authenticated;
grant execute on function public.get_my_build_access() to authenticated;
grant execute on function public.admin_grant_build(text, text, text) to authenticated;
grant execute on function public.admin_renew_build(text) to authenticated;
grant execute on function public.admin_revoke_build(text) to authenticated;
grant execute on function public.admin_list_build_grants() to authenticated;
