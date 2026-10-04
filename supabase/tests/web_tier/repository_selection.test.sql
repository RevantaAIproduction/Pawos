-- Assertions for 20261004030000_web_repository_selection.sql on a LOCAL SCRATCH database (run_local.sh).

create or replace function pg_temp.check(p_ok boolean, p_name text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_name; end if;
  raise notice 'PASS  %', p_name;
end;
$$;

create or replace function pg_temp.err_as(p_role text, p_sub uuid, p_sql text) returns text language plpgsql as $$
declare v_msg text;
begin
  perform set_config('request.jwt.claim.role', p_role, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub::text, ''), true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_msg = message_text;
  end;
  execute 'reset role';
  return v_msg;
end;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'repo-a@example.com'),
  ('00000000-0000-0000-0000-0000000000e2', 'repo-b@example.com');

begin;
set local role service_role;
insert into public.web_repository_selection (user_id, full_name, default_branch) values ('00000000-0000-0000-0000-0000000000e1', 'acme/shop', 'main');
insert into public.web_repository_selection (user_id, full_name, default_branch) values ('00000000-0000-0000-0000-0000000000e2', 'other/app', 'main');
commit;

begin;
select pg_temp.check(
  pg_temp.err_as('authenticated', '00000000-0000-0000-0000-0000000000e1',
    $q$ insert into public.web_repository_selection (user_id, full_name, default_branch) values ('00000000-0000-0000-0000-0000000000e1', 'evil/repo', 'main') $q$) is not null,
  'selection: a signed-in user cannot write it directly');
select pg_temp.check(
  pg_temp.err_as('authenticated', '00000000-0000-0000-0000-0000000000e1',
    $q$ do $d$ begin
      update public.web_repository_selection set full_name = 'evil/repo';
      if exists (select 1 from public.web_repository_selection where full_name = 'evil/repo') then raise exception 'updated'; end if;
    end $d$ $q$) is null,
  'selection: a signed-in user cannot change it');
select pg_temp.check(
  pg_temp.err_as('authenticated', '00000000-0000-0000-0000-0000000000e1',
    $q$ do $d$ begin
      if (select count(*) from public.web_repository_selection) <> 1 then raise exception 'saw others'; end if;
      if (select full_name from public.web_repository_selection) <> 'acme/shop' then raise exception 'wrong row'; end if;
    end $d$ $q$) is null,
  'selection: each account reads only its own');
commit;

do $$
begin
  begin
    insert into public.web_repository_selection (user_id, full_name, default_branch) values ('00000000-0000-0000-0000-0000000000e1', '../etc', 'main');
    raise exception 'FAIL: bad name accepted';
  exception when others then
    perform pg_temp.check(sqlerrm not like 'FAIL%', 'selection: only owner/name repository names are stored');
  end;
end;
$$;

delete from auth.users where id = '00000000-0000-0000-0000-0000000000e2';
select pg_temp.check(not exists (select 1 from public.web_repository_selection where user_id = '00000000-0000-0000-0000-0000000000e2'), 'selection: removed with the account');
