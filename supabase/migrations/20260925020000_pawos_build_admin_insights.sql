-- Migration: 20260925020000_pawos_build_admin_insights
--
-- The Admin → Build Program page becomes read-only insight (granting moves to the SQL editor, see
-- 20260925010000_pawos_build_sql_bulk_grant.sql). For every granted email it shows:
--   * usage remaining — the latest usage report the student's desktop app sent (Build limits are
--     enforced on the device; this copy is for visibility only, never enforcement)
--   * the app ratings they submitted
--   * the reports (bugs / feedback / crashes) they filed — public.diagnostic_reports
--   * the Paw Compute they bought — public.usage_credit_payments
--
-- Also adds SQL-editor renew/revoke companions to pawos_sql_grant_build, since the panel no longer
-- has those buttons.

-- ── App ratings (previously only a local file + an email) ───────────────────────────────────────
create table if not exists public.pawos_app_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  rating int not null check (rating between 1 and 5),
  comment text,
  app_version text,
  created_at timestamptz not null default now()
);
create index if not exists pawos_app_ratings_user_idx on public.pawos_app_ratings (user_id, created_at desc);
create index if not exists pawos_app_ratings_email_idx on public.pawos_app_ratings (email, created_at desc);
alter table public.pawos_app_ratings enable row level security;
revoke all on public.pawos_app_ratings from anon, authenticated;

create or replace function public.submit_app_rating(p_rating int, p_comment text default null, p_app_version text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating' using errcode = '22023';
  end if;
  insert into public.pawos_app_ratings (user_id, email, rating, comment, app_version)
  values (auth.uid(), public.pawos_caller_email(), p_rating, left(nullif(btrim(p_comment), ''), 2000), left(nullif(btrim(p_app_version), ''), 40));
end;
$$;

-- ── Build usage reports (latest per student) ────────────────────────────────────────────────────
create table if not exists public.pawos_build_usage_reports (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  report jsonb not null,
  reported_at timestamptz not null default now()
);
alter table public.pawos_build_usage_reports enable row level security;
revoke all on public.pawos_build_usage_reports from anon, authenticated;

-- Accepted only from a caller with ACTIVE Build access; only known numeric fields are kept.
create or replace function public.report_my_build_usage(p_report jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := public.pawos_caller_email();
  v_clean jsonb := '{}'::jsonb;
  v_key text;
begin
  if v_uid is null then
    return false;
  end if;
  if not exists (
    select 1 from public.pawos_build_grants g
    where (g.user_id = v_uid or (g.user_id is null and g.email = v_email))
      and public.pawos_build_status(g, now()) = 'active'
  ) then
    return false;
  end if;

  foreach v_key in array array[
    'weekPcUsed', 'weekPcLimit', 'windowPcUsed', 'windowPcLimit',
    'weekHoursUsed', 'weekHoursLimit', 'windowHoursUsed', 'windowHoursLimit',
    'fileChangesUsed', 'fileChangesCap', 'weekStartsAt', 'weekResetsAt', 'windowResetsAt'
  ] loop
    if jsonb_typeof(p_report -> v_key) = 'number' then
      v_clean := v_clean || jsonb_build_object(v_key, p_report -> v_key);
    end if;
  end loop;
  if jsonb_typeof(p_report -> 'noFurtherReset') = 'boolean' then
    v_clean := v_clean || jsonb_build_object('noFurtherReset', p_report -> 'noFurtherReset');
  end if;
  if jsonb_typeof(p_report -> 'appVersion') = 'string' then
    v_clean := v_clean || jsonb_build_object('appVersion', left(p_report ->> 'appVersion', 40));
  end if;

  insert into public.pawos_build_usage_reports (user_id, email, report, reported_at)
  values (v_uid, v_email, v_clean, now())
  on conflict (user_id) do update set email = excluded.email, report = excluded.report, reported_at = excluded.reported_at;
  return true;
end;
$$;

-- ── Admin: Build users with usage, ratings, reports and purchases ───────────────────────────────
create or replace function public.admin_build_insights()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  g public.pawos_build_grants;
  v_rows jsonb := '[]'::jsonb;
  v_row jsonb;
  v_part jsonb;
  v_notes text[] := '{}';
  v_uid uuid;
begin
  perform public.pawos_require_build_admin();

  for g in select * from public.pawos_build_grants order by created_at desc loop
    v_uid := coalesce(g.user_id, (select u.id from auth.users u where lower(u.email) = g.email order by u.created_at limit 1));
    v_row := public.pawos_build_grant_json(g, now()) - 'revokedByEmail';

    select jsonb_build_object('report', r.report, 'reportedAt', r.reported_at) into v_part
    from public.pawos_build_usage_reports r where r.user_id = v_uid;
    v_row := v_row || jsonb_build_object('usage', v_part);

    select jsonb_build_object(
             'count', count(*),
             'average', round(avg(a.rating)::numeric, 1),
             'items', coalesce(jsonb_agg(jsonb_build_object('rating', a.rating, 'comment', a.comment, 'appVersion', a.app_version, 'createdAt', a.created_at) order by a.created_at desc), '[]'::jsonb))
      into v_part
    from public.pawos_app_ratings a
    where a.user_id = v_uid or lower(a.email) = g.email;
    v_row := v_row || jsonb_build_object('ratings', v_part);

    begin
      select jsonb_build_object(
               'count', count(*),
               'items', coalesce(jsonb_agg(public.pawos_admin_redact(to_jsonb(d)) - 'details' - 'email' - 'user_id' order by d.created_at desc), '[]'::jsonb))
        into v_part
      from (
        select * from public.diagnostic_reports dr
        where dr.user_id = v_uid or lower(dr.email) = g.email
        order by dr.created_at desc limit 50
      ) d;
      v_row := v_row || jsonb_build_object('reports', v_part);
    exception when undefined_table or undefined_column then
      v_row := v_row || jsonb_build_object('reports', null);
      if not ('diagnostic_reports unavailable' = any(v_notes)) then v_notes := v_notes || 'diagnostic_reports unavailable'; end if;
    end;

    begin
      select jsonb_build_object(
               'count', count(*),
               'totalUsd', coalesce(round(sum(p.amount_usd)::numeric, 2), 0),
               'items', coalesce(jsonb_agg(public.pawos_admin_redact(to_jsonb(p)) - 'user_id' order by p.created_at desc), '[]'::jsonb))
        into v_part
      from (select * from public.usage_credit_payments cp where cp.user_id = v_uid order by cp.created_at desc limit 50) p;
      v_row := v_row || jsonb_build_object('purchases', v_part);
    exception when undefined_table or undefined_column then
      v_row := v_row || jsonb_build_object('purchases', null);
      if not ('usage_credit_payments unavailable' = any(v_notes)) then v_notes := v_notes || 'usage_credit_payments unavailable'; end if;
    end;

    v_rows := v_rows || jsonb_build_array(v_row || jsonb_build_object('signedIn', v_uid is not null));
  end loop;

  return jsonb_build_object('users', v_rows, 'notes', to_jsonb(v_notes), 'generatedAt', now());
end;
$$;

-- ── SQL editor: renew / revoke (companions to pawos_sql_grant_build) ────────────────────────────
--   select * from public.pawos_sql_renew_build(array['student@gmail.com']);   -- +61 days on an active grant
--   select * from public.pawos_sql_revoke_build(array['student@gmail.com']);  -- ends access now
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
    update public.pawos_build_grants g set ends_at = g.ends_at + interval '61 days', updated_at = now()
    where g.id = v_grant.id returning * into v_grant;
    insert into public.pawos_build_grant_audit (grant_id, email, action, actor_id, actor_email, starts_at, ends_at)
    values (v_grant.id, v_grant.email, 'renew', null, 'supabase-sql-editor', v_grant.starts_at, v_grant.ends_at);
    email := v_email; result := 'renew'; starts_at := v_grant.starts_at; ends_at := v_grant.ends_at;
    return next;
  end loop;
end;
$$;

create or replace function public.pawos_sql_revoke_build(p_emails text[])
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
    if v_grant.id is null or v_grant.revoked_at is not null then
      email := v_email; result := case when v_grant.id is null then 'not_found' else 'already_revoked' end;
      starts_at := v_grant.starts_at; ends_at := v_grant.ends_at;
      return next; continue;
    end if;
    update public.pawos_build_grants g set revoked_at = now(), revoked_by = null, revoked_by_email = 'supabase-sql-editor', updated_at = now()
    where g.id = v_grant.id returning * into v_grant;
    insert into public.pawos_build_grant_audit (grant_id, email, action, actor_id, actor_email, starts_at, ends_at)
    values (v_grant.id, v_grant.email, 'revoke', null, 'supabase-sql-editor', v_grant.starts_at, v_grant.ends_at);
    email := v_email; result := 'revoke'; starts_at := v_grant.starts_at; ends_at := v_grant.ends_at;
    return next;
  end loop;
end;
$$;

-- ── Privileges ──────────────────────────────────────────────────────────────────────────────────
revoke all on function public.submit_app_rating(int, text, text) from public, anon;
revoke all on function public.report_my_build_usage(jsonb) from public, anon;
revoke all on function public.admin_build_insights() from public, anon;
revoke all on function public.pawos_sql_renew_build(text[]) from public, anon, authenticated;
revoke all on function public.pawos_sql_revoke_build(text[]) from public, anon, authenticated;

grant execute on function public.submit_app_rating(int, text, text) to authenticated;
grant execute on function public.report_my_build_usage(jsonb) to authenticated;
grant execute on function public.admin_build_insights() to authenticated;
