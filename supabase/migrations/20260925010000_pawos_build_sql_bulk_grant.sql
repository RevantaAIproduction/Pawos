-- Migration: 20260925010000_pawos_build_sql_bulk_grant
--
-- Bulk PawOS Build grants straight from the Supabase SQL editor — paste any number of emails at once:
--
--   select * from public.pawos_sql_grant_build(array[
--     'student1@gmail.com',
--     'student2@gmail.com'
--   ]);
--
-- Same rules as the in-app admin grant (admin_grant_build): each email gets 61 days of Build from the
-- moment this runs. A new email is granted; an expired or revoked email is regranted (a fresh 61 days);
-- an email that is already active is left unchanged ('already_active'). Invalid emails are reported
-- as 'invalid_email' and skipped — one bad row never stops the rest. Every change is written to
-- pawos_build_grant_audit with actor 'supabase-sql-editor'.
--
-- Not callable from the app: execute is revoked from anon/authenticated, so only the database owner
-- (the SQL editor / service role) can run it.

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
      values (v_email, v_uid, 'build-2026', v_now, v_now + interval '61 days', null, 'supabase-sql-editor', nullif(btrim(p_notes), ''))
      returning * into v_grant;
      v_action := 'grant';
    else
      update public.pawos_build_grants g set
        user_id = coalesce(g.user_id, v_uid),
        starts_at = v_now,
        ends_at = v_now + interval '61 days',
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

revoke all on function public.pawos_sql_grant_build(text[], text) from public, anon, authenticated;
