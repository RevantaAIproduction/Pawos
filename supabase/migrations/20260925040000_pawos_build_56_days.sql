-- Migration: 20260925040000_pawos_build_56_days
--
-- PawOS Build access is exactly 8 weeks: 56 days from the moment it is granted (was 61). Weeks 1–7
-- (days 1–49) each reset; week 8 (days 50–56) has no reset — access ends at ends_at. Renew extends
-- by 56 days. The weekly split itself is enforced in the desktop app (RollingUsageGate.ts).
--
-- Redefines every grant path with the new length: admin_grant_build / admin_renew_build (in-app,
-- no longer used by the panel) and the SQL-editor pawos_sql_grant_build / pawos_sql_renew_build.

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
    values (v_email, v_uid, coalesce(nullif(btrim(p_cohort_id), ''), 'build-2026'), v_now, v_now + interval '56 days', auth.uid(), v_actor_email, nullif(btrim(p_notes), ''))
    returning * into v_grant;
    v_action := 'grant';
  else
    update public.pawos_build_grants g set
      user_id = coalesce(g.user_id, v_uid),
      cohort_id = coalesce(nullif(btrim(p_cohort_id), ''), g.cohort_id),
      starts_at = v_now,
      ends_at = v_now + interval '56 days',
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
    ends_at = g.ends_at + interval '56 days',
    updated_at = v_now
  where g.id = v_grant.id
  returning * into v_grant;

  insert into public.pawos_build_grant_audit (grant_id, email, action, actor_id, actor_email, starts_at, ends_at)
  values (v_grant.id, v_grant.email, 'renew', auth.uid(), v_actor_email, v_grant.starts_at, v_grant.ends_at);

  return jsonb_build_object('result', 'renew', 'grant', public.pawos_build_grant_json(v_grant, v_now));
end;
$$;

create or replace function public.pawos_sql_grant_build(p_emails text[], p_notes text default null)
returns table (email text, result text, starts_at timestamptz, ends_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
#variable_conflict use_column
declare
  v_raw text;
  v_email text;
  v_now timestamptz := now();
  v_uid uuid;
  v_grant public.pawos_build_grants;
  v_action text;
  v_seen text[] := '{}';
begin
  foreach v_raw in array coalesce(p_emails, '{}'::text[]) loop
    begin
      v_email := public.pawos_normalize_build_email(v_raw);
    exception when others then
      email := btrim(coalesce(v_raw, '')); result := 'invalid_email'; starts_at := null; ends_at := null;
      return next;
      continue;
    end;

    if v_email = any(v_seen) then continue; end if;  -- duplicate in the list
    v_seen := v_seen || v_email;

    -- Bind to an existing account now (as the app grant does) unless another grant already holds it.
    select u.id into v_uid from auth.users u where lower(u.email) = v_email order by u.created_at limit 1;
    if v_uid is not null and exists (select 1 from public.pawos_build_grants g where g.user_id = v_uid and g.email <> v_email) then
      v_uid := null;
    end if;

    select * into v_grant from public.pawos_build_grants g where g.email = v_email for update;

    if v_grant.id is not null and public.pawos_build_status(v_grant, v_now) = 'active' then
      email := v_email; result := 'already_active'; starts_at := v_grant.starts_at; ends_at := v_grant.ends_at;
      return next;
      continue;
    end if;

    if v_grant.id is null then
      insert into public.pawos_build_grants (email, user_id, cohort_id, starts_at, ends_at, granted_by, granted_by_email, notes)
      values (v_email, v_uid, 'build-2026', v_now, v_now + interval '56 days', null, 'supabase-sql-editor', nullif(btrim(p_notes), ''))
      returning * into v_grant;
      v_action := 'grant';
    else
      update public.pawos_build_grants g set
        user_id = coalesce(g.user_id, v_uid),
        starts_at = v_now,
        ends_at = v_now + interval '56 days',
        revoked_at = null,
        revoked_by = null,
        revoked_by_email = null,
        granted_by = null,
        granted_by_email = 'supabase-sql-editor',
        notes = coalesce(nullif(btrim(p_notes), ''), g.notes),
        updated_at = v_now
      where g.id = v_grant.id
      returning * into v_grant;
      v_action := 'regrant';
    end if;

    insert into public.pawos_build_grant_audit (grant_id, email, action, actor_id, actor_email, starts_at, ends_at)
    values (v_grant.id, v_grant.email, v_action, null, 'supabase-sql-editor', v_grant.starts_at, v_grant.ends_at);

    email := v_email; result := v_action; starts_at := v_grant.starts_at; ends_at := v_grant.ends_at;
    return next;
  end loop;
end;
$$;

create or replace function public.pawos_sql_renew_build(p_emails text[])
returns table (email text, result text, starts_at timestamptz, ends_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
#variable_conflict use_column
declare
  v_raw text;
  v_email text;
  v_grant public.pawos_build_grants;
begin
  foreach v_raw in array coalesce(p_emails, '{}'::text[]) loop
    begin
      v_email := public.pawos_normalize_build_email(v_raw);
    exception when others then
      email := btrim(coalesce(v_raw, '')); result := 'invalid_email'; starts_at := null; ends_at := null;
      return next; continue;
    end;
    select * into v_grant from public.pawos_build_grants g where g.email = v_email for update;
    if v_grant.id is null or public.pawos_build_status(v_grant, now()) <> 'active' then
      email := v_email; result := case when v_grant.id is null then 'not_found' else 'not_active' end;
      starts_at := v_grant.starts_at; ends_at := v_grant.ends_at;
      return next; continue;
    end if;
    update public.pawos_build_grants g set ends_at = g.ends_at + interval '56 days', updated_at = now()
    where g.id = v_grant.id returning * into v_grant;
    insert into public.pawos_build_grant_audit (grant_id, email, action, actor_id, actor_email, starts_at, ends_at)
    values (v_grant.id, v_grant.email, 'renew', null, 'supabase-sql-editor', v_grant.starts_at, v_grant.ends_at);
    email := v_email; result := 'renew'; starts_at := v_grant.starts_at; ends_at := v_grant.ends_at;
    return next;
  end loop;
end;
$$;

-- Active grants that were never renewed (still exactly 61 days long) move to 56 days from their
-- original start. A grant whose new end is already past simply ends now. Renewed, expired and
-- revoked grants are untouched.
update public.pawos_build_grants g set
  ends_at = greatest(g.starts_at + interval '56 days', now()),
  updated_at = now()
where g.revoked_at is null
  and g.ends_at > now()
  and g.ends_at = g.starts_at + interval '61 days';
