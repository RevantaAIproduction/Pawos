-- Migration: 20260925030000_pawos_build_export_log
--
-- Every download of the Build users sheet (Admin → Build Program → Download) is recorded in
-- pawos_admin_audit as 'build.export' (who, when, how many rows), and the panel shows the running
-- total ("Downloaded 3 times"). Emails in the sheet are masked client-side (gh****@gmail.com).

create or replace function public.admin_build_export_count()
returns bigint
language sql
stable
security definer
set search_path = public, auth
as $$
  select case when public.pawos_is_build_admin()
    then (select count(*) from public.pawos_admin_audit where action = 'build.export')
    else null end;
$$;

create or replace function public.admin_log_build_export(p_rows int)
returns bigint
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
begin
  perform public.pawos_require_build_admin();
  perform public.pawos_admin_log('build.export', 'build-users-sheet', jsonb_build_object('rows', greatest(coalesce(p_rows, 0), 0)));
  return (select count(*) from public.pawos_admin_audit where action = 'build.export');
end;
$$;

revoke all on function public.admin_build_export_count() from public, anon;
revoke all on function public.admin_log_build_export(int) from public, anon;
grant execute on function public.admin_build_export_count() to authenticated;
grant execute on function public.admin_log_build_export(int) to authenticated;
