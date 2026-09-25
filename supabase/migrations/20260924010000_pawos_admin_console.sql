-- Migration: 20260924010000_pawos_admin_console
--
-- Server side of the desktop Admin console (src/renderer/ui/Dashboard/sections/AdminSection.tsx).
-- Every function below is SECURITY DEFINER and starts with pawos_require_build_admin(), which
-- raises 'forbidden' unless the caller's auth.users email is in public.pawos_admins
-- (see 20260924000000_pawos_build_access.sql). The desktop app's own email list only decides what
-- UI to show; this is the enforcement.
--
-- Robust to schema drift: several tables were applied to this project by hand and differ from their
-- migration files, so rows are returned whole as JSON (to_jsonb) and filtered only on columns that
-- were verified live (user_id, created_at, status, …). Sections that read optional tables are
-- wrapped so a missing table/column yields an empty list plus a note, never a failed call.
-- Credentials are never returned: pawos_admin_redact() strips token/secret/key/hash/password fields.
--
-- Also merges the two admin lists: platform_admins (help center) and pawos_admins (Build) now hold
-- the same emails, and admin_add_admin/admin_remove_admin keep them in sync.

-- ── Admin action audit ──────────────────────────────────────────────────────────────────────────
create table if not exists public.pawos_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text not null,
  action text not null,
  target text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists pawos_admin_audit_created_idx on public.pawos_admin_audit (created_at desc);
alter table public.pawos_admin_audit enable row level security;
revoke all on public.pawos_admin_audit from anon, authenticated;

-- ── One admin list ──────────────────────────────────────────────────────────────────────────────
insert into public.pawos_admins (email)
select lower(btrim(pa.email)) from public.platform_admins pa where coalesce(btrim(pa.email), '') <> ''
on conflict (email) do nothing;

insert into public.platform_admins (email)
select a.email from public.pawos_admins a
on conflict (email) do nothing;

-- ── Helpers ─────────────────────────────────────────────────────────────────────────────────────
create or replace function public.pawos_admin_redact(p jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  from jsonb_each(coalesce(p, '{}'::jsonb)) as e(key, value)
  where e.key !~* '(token|secret|password|passwd|key|hash|signature|otp|credential|cookie)';
$$;

create or replace function public.pawos_admin_limit(p_limit int, p_default int)
returns int
language sql
immutable
as $$
  select least(greatest(coalesce(p_limit, p_default), 1), 200);
$$;

create or replace function public.pawos_admin_log(p_action text, p_target text, p_detail jsonb default '{}'::jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
begin
  insert into public.pawos_admin_audit (actor_id, actor_email, action, target, detail)
  values (auth.uid(), coalesce(public.pawos_caller_email(), 'unknown'), p_action, p_target, coalesce(p_detail, '{}'::jsonb));
end;
$$;

-- ── Overview ────────────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v jsonb;
  v_notes text[] := '{}';
  v_orgs bigint;
  v_runs jsonb;
  v_pay jsonb;
  v_issues jsonb;
  v_waitlist bigint;
begin
  perform public.pawos_require_build_admin();

  v := jsonb_build_object(
    'users', (select count(*) from auth.users),
    'newUsers7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'newUsers30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'activeUsers7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'buildActive', (select count(*) from public.pawos_build_grants g where public.pawos_build_status(g, now()) = 'active'),
    'buildTotal', (select count(*) from public.pawos_build_grants),
    'admins', (select count(*) from public.pawos_admins)
  );

  begin
    select count(*) into v_orgs from public.organizations;
    v := v || jsonb_build_object('organizations', v_orgs);
  exception when undefined_table or undefined_column then v_notes := v_notes || 'organizations unavailable';
  end;

  begin
    select jsonb_build_object(
      'active', count(*) filter (where status in ('queued', 'running', 'waiting_for_permission', 'waiting_for_topup', 'blocked')),
      'staleOver24h', count(*) filter (where status in ('queued', 'running', 'waiting_for_permission', 'waiting_for_topup', 'blocked') and created_at < now() - interval '24 hours'),
      'last7d', count(*) filter (where created_at > now() - interval '7 days')
    ) into v_runs from public.autonomous_task_runs;
    v := v || jsonb_build_object('autonomousRuns', v_runs);
  exception when undefined_table or undefined_column then v_notes := v_notes || 'autonomous_task_runs unavailable';
  end;

  begin
    select jsonb_build_object(
      'count30d', count(*),
      'amountUsd30d', coalesce(round(sum(amount_usd)::numeric, 2), 0)
    ) into v_pay from public.usage_credit_payments where created_at > now() - interval '30 days';
    v := v || jsonb_build_object('usageCreditPayments', v_pay);
  exception when undefined_table or undefined_column then v_notes := v_notes || 'usage_credit_payments unavailable';
  end;

  begin
    select coalesce(jsonb_object_agg(coalesce(status, 'unknown'), n), '{}'::jsonb) into v_issues
    from (select status, count(*) as n from public.diagnostic_issues group by status) s;
    v := v || jsonb_build_object('diagnosticIssuesByStatus', v_issues);
  exception when undefined_table or undefined_column then v_notes := v_notes || 'diagnostic_issues unavailable';
  end;

  begin
    select count(*) into v_waitlist from public.desktop_waitlist;
    v := v || jsonb_build_object('waitlist', v_waitlist);
  exception when undefined_table or undefined_column then v_notes := v_notes || 'desktop_waitlist unavailable';
  end;

  return v || jsonb_build_object('notes', to_jsonb(v_notes), 'generatedAt', now());
end;
$$;

-- ── Users ───────────────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_search_users(p_query text default null, p_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
  v jsonb;
begin
  perform public.pawos_require_build_admin();
  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb) into v
  from (
    select
      u.created_at,
      jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'createdAt', u.created_at,
        'lastSignInAt', u.last_sign_in_at,
        'emailConfirmed', u.email_confirmed_at is not null,
        'provider', u.raw_app_meta_data ->> 'provider',
        'buildStatus', (
          select public.pawos_build_status(g, now()) from public.pawos_build_grants g
          where g.user_id = u.id or g.email = lower(u.email) limit 1
        ),
        'isAdmin', exists (select 1 from public.pawos_admins a where a.email = lower(u.email))
      ) as row_json
    from auth.users u
    where v_q is null
       or u.email ilike '%' || replace(replace(v_q, '%', '\%'), '_', '\_') || '%'
       or u.id::text = v_q
    order by u.created_at desc
    limit public.pawos_admin_limit(p_limit, 50)
  ) s;
  return v;
end;
$$;

create or replace function public.admin_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_user auth.users;
  v jsonb;
  v_notes text[] := '{}';
  v_part jsonb;
begin
  perform public.pawos_require_build_admin();
  select * into v_user from auth.users u where u.id = p_user_id;
  if v_user.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  v := jsonb_build_object(
    'user', jsonb_build_object(
      'id', v_user.id,
      'email', v_user.email,
      'createdAt', v_user.created_at,
      'lastSignInAt', v_user.last_sign_in_at,
      'emailConfirmedAt', v_user.email_confirmed_at,
      'provider', v_user.raw_app_meta_data ->> 'provider',
      'providers', v_user.raw_app_meta_data -> 'providers',
      'name', coalesce(v_user.raw_user_meta_data ->> 'full_name', v_user.raw_user_meta_data ->> 'name')
    ),
    'isAdmin', exists (select 1 from public.pawos_admins a where a.email = lower(v_user.email)),
    'build', (
      select public.pawos_build_grant_json(g, now()) from public.pawos_build_grants g
      where g.user_id = v_user.id or g.email = lower(v_user.email) limit 1
    )
  );

  begin
    select public.pawos_admin_redact(to_jsonb(c)) into v_part from public.user_usage_credits c where c.user_id = p_user_id limit 1;
    v := v || jsonb_build_object('usageCredits', v_part);
  exception when undefined_table or undefined_column then v_notes := v_notes || 'user_usage_credits unavailable';
  end;

  begin
    select coalesce(jsonb_agg(public.pawos_admin_redact(to_jsonb(m)) || jsonb_build_object('organization', public.pawos_admin_redact(to_jsonb(o)))), '[]'::jsonb)
      into v_part
    from public.organization_members m
    left join public.organizations o on o.id = m.organization_id
    where m.user_id = p_user_id;
    v := v || jsonb_build_object('organizations', v_part);
  exception when undefined_table or undefined_column then v_notes := v_notes || 'organization_members unavailable';
  end;

  begin
    select coalesce(jsonb_agg(public.pawos_admin_redact(to_jsonb(d)) order by d.created_at desc), '[]'::jsonb) into v_part
    from (select * from public.device_sessions where user_id = p_user_id order by created_at desc limit 20) d;
    v := v || jsonb_build_object('deviceSessions', v_part);
  exception when undefined_table or undefined_column then v_notes := v_notes || 'device_sessions unavailable';
  end;

  begin
    select coalesce(jsonb_agg(public.pawos_admin_redact(to_jsonb(p)) order by p.created_at desc), '[]'::jsonb) into v_part
    from (select * from public.usage_credit_payments where user_id = p_user_id order by created_at desc limit 20) p;
    v := v || jsonb_build_object('usageCreditPayments', v_part);
  exception when undefined_table or undefined_column then v_notes := v_notes || 'usage_credit_payments unavailable';
  end;

  begin
    select coalesce(jsonb_agg(public.pawos_admin_redact(to_jsonb(dd)) order by dd.created_at desc), '[]'::jsonb) into v_part
    from (select * from public.usage_credit_deductions where user_id = p_user_id order by created_at desc limit 20) dd;
    v := v || jsonb_build_object('usageCreditDeductions', v_part);
  exception when undefined_table or undefined_column then v_notes := v_notes || 'usage_credit_deductions unavailable';
  end;

  begin
    select coalesce(jsonb_agg(public.pawos_admin_redact(to_jsonb(r)) order by r.created_at desc), '[]'::jsonb) into v_part
    from (select * from public.autonomous_task_runs where user_id = p_user_id order by created_at desc limit 20) r;
    v := v || jsonb_build_object('autonomousRuns', v_part);
  exception when undefined_table or undefined_column then v_notes := v_notes || 'autonomous_task_runs unavailable';
  end;

  begin
    select coalesce(jsonb_agg(public.pawos_admin_redact(to_jsonb(dr)) order by dr.created_at desc), '[]'::jsonb) into v_part
    from (select * from public.diagnostic_reports where user_id = p_user_id order by created_at desc limit 20) dr;
    v := v || jsonb_build_object('diagnosticReports', v_part);
  exception when undefined_table or undefined_column then v_notes := v_notes || 'diagnostic_reports unavailable';
  end;

  return v || jsonb_build_object('notes', to_jsonb(v_notes));
end;
$$;

-- ── Payments ────────────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_list_payments(p_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v jsonb := '{}'::jsonb;
  v_notes text[] := '{}';
  v_part jsonb;
  v_n int := public.pawos_admin_limit(p_limit, 50);
begin
  perform public.pawos_require_build_admin();

  begin
    select coalesce(jsonb_agg(public.pawos_admin_redact(to_jsonb(p)) || jsonb_build_object('email', u.email) order by p.created_at desc), '[]'::jsonb)
      into v_part
    from (select * from public.usage_credit_payments order by created_at desc limit v_n) p
    left join auth.users u on u.id = p.user_id;
    v := v || jsonb_build_object('usageCreditPayments', v_part);
  exception when undefined_table or undefined_column then v_notes := v_notes || 'usage_credit_payments unavailable';
  end;

  begin
    select coalesce(jsonb_agg(public.pawos_admin_redact(to_jsonb(b)) || jsonb_build_object('email', u.email) order by b.created_at desc), '[]'::jsonb)
      into v_part
    from (select * from public.organization_billing_events order by created_at desc limit v_n) b
    left join auth.users u on u.id = b.user_id;
    v := v || jsonb_build_object('organizationBillingEvents', v_part);
  exception when undefined_table or undefined_column then v_notes := v_notes || 'organization_billing_events unavailable';
  end;

  return v || jsonb_build_object('notes', to_jsonb(v_notes));
end;
$$;

-- ── Autonomous runs ─────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_list_autonomous_runs(p_active_only boolean default true, p_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_part jsonb;
begin
  perform public.pawos_require_build_admin();
  begin
    select coalesce(jsonb_agg(
             public.pawos_admin_redact(to_jsonb(r))
             || jsonb_build_object('email', u.email, 'ageHours', round((extract(epoch from (now() - r.created_at)) / 3600)::numeric, 1))
             order by r.created_at desc), '[]'::jsonb)
      into v_part
    from (
      select * from public.autonomous_task_runs
      where not coalesce(p_active_only, true) or status in ('queued', 'running', 'waiting_for_permission', 'waiting_for_topup', 'blocked')
      order by created_at desc
      limit public.pawos_admin_limit(p_limit, 50)
    ) r
    left join auth.users u on u.id = r.user_id;
    return jsonb_build_object('runs', v_part, 'notes', '[]'::jsonb);
  exception when undefined_table or undefined_column then
    return jsonb_build_object('runs', '[]'::jsonb, 'notes', jsonb_build_array('autonomous_task_runs unavailable'));
  end;
end;
$$;

-- ── Diagnostics ─────────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_list_diagnostics(p_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v jsonb := '{}'::jsonb;
  v_notes text[] := '{}';
  v_part jsonb;
  v_n int := public.pawos_admin_limit(p_limit, 50);
begin
  perform public.pawos_require_build_admin();

  begin
    select coalesce(jsonb_agg(public.pawos_admin_redact(to_jsonb(i)) order by i.created_at desc), '[]'::jsonb) into v_part
    from (select * from public.diagnostic_issues order by created_at desc limit v_n) i;
    v := v || jsonb_build_object('issues', v_part);
  exception when undefined_table or undefined_column then v_notes := v_notes || 'diagnostic_issues unavailable';
  end;

  begin
    select coalesce(jsonb_agg(public.pawos_admin_redact(to_jsonb(r)) || jsonb_build_object('email', u.email) order by r.created_at desc), '[]'::jsonb)
      into v_part
    from (select * from public.diagnostic_reports order by created_at desc limit v_n) r
    left join auth.users u on u.id = r.user_id;
    v := v || jsonb_build_object('reports', v_part);
  exception when undefined_table or undefined_column then v_notes := v_notes || 'diagnostic_reports unavailable';
  end;

  return v || jsonb_build_object('notes', to_jsonb(v_notes));
end;
$$;

-- ── Audit ───────────────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_list_audit(p_limit int default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_n int := public.pawos_admin_limit(p_limit, 100);
  v_entries jsonb := '[]'::jsonb;
  v_part jsonb;
  v_notes text[] := '{}';
begin
  perform public.pawos_require_build_admin();

  select coalesce(jsonb_agg(jsonb_build_object(
           'source', 'admin', 'at', a.created_at, 'actor', a.actor_email, 'action', a.action, 'target', a.target, 'detail', a.detail)), '[]'::jsonb)
    into v_part
  from (select * from public.pawos_admin_audit order by created_at desc limit v_n) a;
  v_entries := v_entries || v_part;

  select coalesce(jsonb_agg(jsonb_build_object(
           'source', 'build', 'at', b.created_at, 'actor', b.actor_email, 'action', 'build.' || b.action, 'target', b.email,
           'detail', jsonb_build_object('startsAt', b.starts_at, 'endsAt', b.ends_at))), '[]'::jsonb)
    into v_part
  from (select * from public.pawos_build_grant_audit order by created_at desc limit v_n) b;
  v_entries := v_entries || v_part;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'source', 'testTier', 'at', t.created_at, 'actor', t.administrator_email, 'action', 'testTier.' || t.action,
             'target', u.email, 'detail', jsonb_build_object('previousTier', t.previous_tier, 'newTier', t.new_tier))), '[]'::jsonb)
      into v_part
    from (select * from public.admin_test_tier_audit order by created_at desc limit v_n) t
    left join auth.users u on u.id = t.user_id;
    v_entries := v_entries || v_part;
  exception when undefined_table or undefined_column then v_notes := v_notes || 'admin_test_tier_audit unavailable';
  end;

  return jsonb_build_object(
    'entries', (
      select coalesce(jsonb_agg(s.entry order by (s.entry ->> 'at') desc), '[]'::jsonb)
      from (select t.entry from jsonb_array_elements(v_entries) as t(entry) order by (t.entry ->> 'at') desc limit v_n) s
    ),
    'notes', to_jsonb(v_notes)
  );
end;
$$;

-- ── Admin management ────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_list_admins()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  perform public.pawos_require_build_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'email', a.email,
             'addedAt', a.created_at,
             'hasAccount', exists (select 1 from auth.users u where lower(u.email) = a.email),
             'isYou', a.email = public.pawos_caller_email())
           order by a.created_at, a.email)
    from public.pawos_admins a
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_add_admin(p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  perform public.pawos_require_build_admin();
  v_email := public.pawos_normalize_build_email(p_email);
  if exists (select 1 from public.pawos_admins where email = v_email) then
    return jsonb_build_object('result', 'already_admin', 'email', v_email);
  end if;
  insert into public.pawos_admins (email) values (v_email);
  insert into public.platform_admins (email) values (v_email) on conflict (email) do nothing;
  perform public.pawos_admin_log('admin.add', v_email);
  return jsonb_build_object('result', 'added', 'email', v_email);
end;
$$;

create or replace function public.admin_remove_admin(p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_self text;
begin
  v_self := public.pawos_require_build_admin();
  v_email := public.pawos_normalize_build_email(p_email);
  if v_email = v_self then
    raise exception 'cannot_remove_self' using errcode = '22023';
  end if;
  if not exists (select 1 from public.pawos_admins where email = v_email) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.pawos_admins) <= 1 then
    raise exception 'last_admin' using errcode = '22023';
  end if;
  delete from public.pawos_admins where email = v_email;
  delete from public.platform_admins where lower(email) = v_email;
  perform public.pawos_admin_log('admin.remove', v_email);
  return jsonb_build_object('result', 'removed', 'email', v_email);
end;
$$;

-- ── Privileges ──────────────────────────────────────────────────────────────────────────────────
revoke all on function public.pawos_admin_redact(jsonb) from public, anon, authenticated;
revoke all on function public.pawos_admin_limit(int, int) from public, anon, authenticated;
revoke all on function public.pawos_admin_log(text, text, jsonb) from public, anon, authenticated;

revoke all on function public.admin_overview() from public, anon;
revoke all on function public.admin_search_users(text, int) from public, anon;
revoke all on function public.admin_user_detail(uuid) from public, anon;
revoke all on function public.admin_list_payments(int) from public, anon;
revoke all on function public.admin_list_autonomous_runs(boolean, int) from public, anon;
revoke all on function public.admin_list_diagnostics(int) from public, anon;
revoke all on function public.admin_list_audit(int) from public, anon;
revoke all on function public.admin_list_admins() from public, anon;
revoke all on function public.admin_add_admin(text) from public, anon;
revoke all on function public.admin_remove_admin(text) from public, anon;

grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_search_users(text, int) to authenticated;
grant execute on function public.admin_user_detail(uuid) to authenticated;
grant execute on function public.admin_list_payments(int) to authenticated;
grant execute on function public.admin_list_autonomous_runs(boolean, int) to authenticated;
grant execute on function public.admin_list_diagnostics(int) to authenticated;
grant execute on function public.admin_list_audit(int) to authenticated;
grant execute on function public.admin_list_admins() to authenticated;
grant execute on function public.admin_add_admin(text) to authenticated;
grant execute on function public.admin_remove_admin(text) to authenticated;
