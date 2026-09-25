-- Migration: 20260925000000_pawos_build_61_days
--
-- PawOS Build access now lasts exactly 61 days from the moment an admin grants it (was two calendar
-- months, i.e. 59-62 days depending on the month). Renew extends by 61 days. Build's weekly limits
-- reset every 7 days from the grant start through day 49 (weeks 1–7); week 8 runs days 50–61 (the
-- leftover days fold into it) and has no reset after it — access simply ends at ends_at. The weekly
-- split is enforced in the desktop app (RollingUsageGate.ts); the server only holds the dates.

-- ── Admin: grant / regrant ──────────────────────────────────────────────────────────────────────
-- New email → grant. Expired/revoked email → regrant (a fresh 61 days from now).
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
    values (v_email, v_uid, coalesce(nullif(btrim(p_cohort_id), ''), 'build-2026'), v_now, v_now + interval '61 days', auth.uid(), v_actor_email, nullif(btrim(p_notes), ''))
    returning * into v_grant;
    v_action := 'grant';
  else
    update public.pawos_build_grants g set
      user_id = coalesce(g.user_id, v_uid),
      cohort_id = coalesce(nullif(btrim(p_cohort_id), ''), g.cohort_id),
      starts_at = v_now,
      ends_at = v_now + interval '61 days',
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

-- ── Admin: renew (extend an active grant by 61 days) ─────────────────────────────────────────
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
    ends_at = g.ends_at + interval '61 days',
    updated_at = v_now
  where g.id = v_grant.id
  returning * into v_grant;

  insert into public.pawos_build_grant_audit (grant_id, email, action, actor_id, actor_email, starts_at, ends_at)
  values (v_grant.id, v_grant.email, 'renew', auth.uid(), v_actor_email, v_grant.starts_at, v_grant.ends_at);

  return jsonb_build_object('result', 'renew', 'grant', public.pawos_build_grant_json(v_grant, v_now));
end;
$$;

-- Existing active grants that were never renewed (still exactly two calendar months long) move to
-- the 61-day length, counted from their original start. Renewed, expired and revoked grants are untouched.
update public.pawos_build_grants g set
  ends_at = g.starts_at + interval '61 days',
  updated_at = now()
where g.revoked_at is null
  and g.ends_at > now()
  and g.ends_at = g.starts_at + interval '2 months'
  and g.starts_at + interval '61 days' > now();
