-- Migration: 20260925050000_pawos_build_one_time
--
-- PawOS Build is ONE 56-day program per email, never longer:
--   * renewal is removed (admin_renew_build / pawos_sql_renew_build are dropped);
--   * granting an email that already had Build (expired or revoked) is refused with 'already_used' —
--     no second 56 days;
--   * any grant longer than 56 days is capped at starts_at + 56 days.

drop function if exists public.admin_renew_build(text);
drop function if exists public.pawos_sql_renew_build(text[]);

-- In-app grant (no longer used by the admin panel, kept consistent).
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
begin
  select * into v_grant from public.pawos_build_grants g where g.email = v_email for update;
  if v_grant.id is not null then
    return jsonb_build_object(
      'result', case when public.pawos_build_status(v_grant, v_now) = 'active' then 'already_active' else 'already_used' end,
      'grant', public.pawos_build_grant_json(v_grant, v_now));
  end if;

  select u.id into v_uid from auth.users u where lower(u.email) = v_email order by u.created_at limit 1;
  insert into public.pawos_build_grants (email, user_id, cohort_id, starts_at, ends_at, granted_by, granted_by_email, notes)
  values (v_email, v_uid, coalesce(nullif(btrim(p_cohort_id), ''), 'build-2026'), v_now, v_now + interval '56 days', auth.uid(), v_actor_email, nullif(btrim(p_notes), ''))
  returning * into v_grant;

  insert into public.pawos_build_grant_audit (grant_id, email, action, actor_id, actor_email, starts_at, ends_at)
  values (v_grant.id, v_grant.email, 'grant', auth.uid(), v_actor_email, v_grant.starts_at, v_grant.ends_at);

  return jsonb_build_object('result', 'grant', 'grant', public.pawos_build_grant_json(v_grant, v_now));
end;
$$;

-- SQL editor bulk grant:
--   select * from public.pawos_sql_grant_build(array['a@gmail.com', 'b@gmail.com']);
-- result: 'grant' (56 days from now) | 'already_active' | 'already_used' (had Build before — refused) | 'invalid_email'
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

    select * into v_grant from public.pawos_build_grants g where g.email = v_email for update;
    if v_grant.id is not null then
      email := v_email;
      result := case when public.pawos_build_status(v_grant, v_now) = 'active' then 'already_active' else 'already_used' end;
      starts_at := v_grant.starts_at; ends_at := v_grant.ends_at;
      return next;
      continue;
    end if;

    -- Bind to an existing account now unless another grant already holds it.
    select u.id into v_uid from auth.users u where lower(u.email) = v_email order by u.created_at limit 1;
    if v_uid is not null and exists (select 1 from public.pawos_build_grants g where g.user_id = v_uid) then
      v_uid := null;
    end if;

    insert into public.pawos_build_grants (email, user_id, cohort_id, starts_at, ends_at, granted_by, granted_by_email, notes)
    values (v_email, v_uid, 'build-2026', v_now, v_now + interval '56 days', null, 'supabase-sql-editor', nullif(btrim(p_notes), ''))
    returning * into v_grant;

    insert into public.pawos_build_grant_audit (grant_id, email, action, actor_id, actor_email, starts_at, ends_at)
    values (v_grant.id, v_grant.email, 'grant', null, 'supabase-sql-editor', v_grant.starts_at, v_grant.ends_at);

    email := v_email; result := 'grant'; starts_at := v_grant.starts_at; ends_at := v_grant.ends_at;
    return next;
  end loop;
end;
$$;

revoke all on function public.pawos_sql_grant_build(text[], text) from public, anon, authenticated;

-- Never longer than 56 days.
update public.pawos_build_grants g set
  ends_at = g.starts_at + interval '56 days',
  updated_at = now()
where g.ends_at > g.starts_at + interval '56 days';
