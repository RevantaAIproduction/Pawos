create table if not exists public.chronicle_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null check (project_id ~ '^[a-f0-9]{64}$'),
  project_name text not null check (char_length(project_name) between 1 and 120),
  snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  report_data jsonb not null check (jsonb_typeof(report_data) = 'object' and octet_length(report_data::text) <= 1048576),
  created_at timestamptz not null default now(),
  share_token text unique check (share_token is null or share_token ~ '^[a-f0-9]{64}$'),
  shared_at timestamptz,
  check ((share_token is null) = (shared_at is null))
);

create index if not exists chronicle_reports_owner_created_idx
  on public.chronicle_reports (user_id, created_at desc);

alter table public.chronicle_reports enable row level security;

drop policy if exists chronicle_reports_select_own on public.chronicle_reports;
create policy chronicle_reports_select_own on public.chronicle_reports
  for select to authenticated using (user_id = auth.uid());

drop policy if exists chronicle_reports_insert_own on public.chronicle_reports;
create policy chronicle_reports_insert_own on public.chronicle_reports
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists chronicle_reports_delete_own on public.chronicle_reports;
create policy chronicle_reports_delete_own on public.chronicle_reports
  for delete to authenticated using (user_id = auth.uid());

create or replace function public.chronicle_set_report_share(p_report_id uuid, p_share_token text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then return false; end if;
  if p_share_token is not null and p_share_token !~ '^[a-f0-9]{64}$' then return false; end if;
  update public.chronicle_reports
     set share_token = p_share_token,
         shared_at = case when p_share_token is null then null else now() end
   where id = p_report_id and user_id = auth.uid();
  return found;
end;
$$;

revoke all on function public.chronicle_set_report_share(uuid, text) from public;
grant execute on function public.chronicle_set_report_share(uuid, text) to authenticated;

create or replace function public.chronicle_get_shared_report(p_share_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'reportId', r.id,
    'projectName', r.project_name,
    'createdAt', r.created_at,
    'reportData', r.report_data
  )
  from public.chronicle_reports r
  where p_share_token ~ '^[a-f0-9]{64}$'
    and r.share_token = p_share_token and r.shared_at is not null
  limit 1
$$;

revoke all on function public.chronicle_get_shared_report(text) from public;
grant execute on function public.chronicle_get_shared_report(text) to anon, authenticated;
