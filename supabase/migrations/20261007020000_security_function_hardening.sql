-- Migration: 20261007020000_security_function_hardening
--
-- SECURITY. Privileged (SECURITY DEFINER) functions found in the sweep after 20261007000000.
--
--  1. The autonomous external-write ledger (20260907000001). autonomous_external_writes has row
--     level security limiting each row to the owner of its run (or a member of the run's
--     organization), but the five functions the app uses to read and update it were SECURITY
--     DEFINER with no ownership check of their own and EXECUTE for every signed-in user. They ran
--     as the table's owner, so the policies never applied: any signed-in user who had or guessed a
--     record id could mark someone else's external write completed or failed, and read it by run id.
--     Fix: the functions run as the caller (SECURITY INVOKER), so the table's own policies decide —
--     the same rule the table already states, now actually enforced. Nothing else about them changes.
--
--  2. search_path. SECURITY DEFINER functions without a fixed search_path resolve unqualified names
--     through the caller's search_path. Every such function in the public schema gets one:
--     public, then extensions (where Supabase keeps pgcrypto, used by the organization credential
--     functions). Function bodies are not changed.
--
--  3. A missing column. mark_external_write_completed / _failed / _reconciling (20260907000001)
--     all set autonomous_external_writes.updated_at, but no migration ever added that column, so
--     wherever it is absent those three functions fail for every caller and an autonomous run can
--     never record that its Jira / Linear / GitHub comment was posted. The column is added (existing
--     rows take their completion or creation time); the functions keep writing it.
--
-- Data: adds autonomous_external_writes.updated_at where missing. Nothing else is changed.
--
-- Run AFTER 20261007010000_security_seats_and_admin_identity.sql.

-- ── 0. The timestamp the ledger functions write ─────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.autonomous_external_writes') is null then
    raise notice 'autonomous_external_writes does not exist here; skipping its updated_at column.';
  elsif not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'autonomous_external_writes' and column_name = 'updated_at'
  ) then
    alter table public.autonomous_external_writes add column updated_at timestamptz;
    update public.autonomous_external_writes set updated_at = coalesce(completed_at, created_at);
    alter table public.autonomous_external_writes alter column updated_at set default now();
    alter table public.autonomous_external_writes alter column updated_at set not null;
  end if;
end;
$$;

-- ── 1. External-write ledger functions run as the caller ────────────────────────────────────────
do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'get_or_create_external_write_record',
        'mark_external_write_completed',
        'mark_external_write_failed',
        'mark_external_write_reconciling',
        'get_completed_external_write'
      )
  loop
    execute format('alter function %s security invoker', v_function);
    execute format('alter function %s set search_path = public', v_function);
    execute format('revoke all on function %s from public, anon', v_function);
    execute format('grant execute on function %s to authenticated, service_role', v_function);
  end loop;
end;
$$;

-- ── 2. A fixed search_path for every remaining SECURITY DEFINER function ────────────────────────
do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public, extensions', v_function);
  end loop;
end;
$$;
