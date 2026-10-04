-- Assertions for 20261004040000_web_code_changes.sql on a LOCAL SCRATCH database (run_local.sh).

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
  ('00000000-0000-0000-0000-0000000000f1', 'weekly@example.com'),
  ('00000000-0000-0000-0000-0000000000f2', 'changes@example.com'),
  ('00000000-0000-0000-0000-0000000000f3', 'other@example.com');

begin;
set local role service_role;
set local request.jwt.claim.role = 'service_role';

-- ── A weekly cap counts the last 7 days, and comes back as the week rolls ──────────────────────
do $$
declare r jsonb; i int;
begin
  for i in 1..3 loop
    r := public.web_chat_begin_request('00000000-0000-0000-0000-0000000000f1', 'week-req-000' || i, null, 3, 150, 7);
    perform pg_temp.check(r->>'status' = 'claimed', 'weekly: claim ' || i);
    perform public.web_chat_append_exchange('00000000-0000-0000-0000-0000000000f1', null, 'q' || i, 'a' || i, 3, 'week-req-000' || i, false, null, 7);
  end loop;
  begin
    perform public.web_chat_begin_request('00000000-0000-0000-0000-0000000000f1', 'week-req-0004', null, 3, 150, 7);
    raise exception 'FAIL: fourth weekly claim accepted';
  exception when others then
    perform pg_temp.check(sqlerrm = 'message_limit_reached', 'weekly: the cap is enforced over the window');
  end;
  -- Age the answered requests past the window (as the database clock would).
  perform set_config('pawos.web_chat_writer', 'on', true);
  update public.web_chat_requests set updated_at = now() - interval '8 days' where user_id = '00000000-0000-0000-0000-0000000000f1';
  perform set_config('pawos.web_chat_writer', '', true);
  r := public.web_chat_begin_request('00000000-0000-0000-0000-0000000000f1', 'week-req-0005', null, 3, 150, 7);
  perform pg_temp.check(r->>'status' = 'claimed', 'weekly: messages come back after 7 days');
  perform pg_temp.check(public.pawos_web_chat_messages_used('00000000-0000-0000-0000-0000000000f1') = 3, 'weekly: the lifetime count still includes them');
end;
$$;

-- ── The ledger can't be deleted to reset a cap ──────────────────────────────────────────────────
do $$
begin
  begin
    delete from public.web_chat_requests where user_id = '00000000-0000-0000-0000-0000000000f1';
    raise exception 'FAIL: ledger deleted';
  exception when others then
    perform pg_temp.check(sqlerrm = 'web_chat_direct_write_forbidden', 'ledger: rows cannot be deleted while the account exists');
  end;
end;
$$;

-- ── Code changes: one atomic fix claim at a time, never past the limit ─────────────────────────
insert into public.web_code_changes (id, user_id, request_id, repository, scope, state, commit_sha)
values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000f2', 'change-req-01', 'acme/shop', 'full', 'pushed', 'abc');

do $$
begin
  perform pg_temp.check(public.web_code_change_claim_fix('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000f2', 2, 180), 'fix: the first claim succeeds');
  perform pg_temp.check(not public.web_code_change_claim_fix('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000f2', 2, 180), 'fix: a second claim while the first holds is refused');
  perform pg_temp.check(not public.web_code_change_claim_fix('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000f3', 2, 180), 'fix: another account cannot claim it');
  update public.web_code_changes set fix_lease_until = now() - interval '1 second', state = 'pushed' where id = '00000000-0000-0000-0000-00000000c001';
  perform pg_temp.check(public.web_code_change_claim_fix('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000f2', 2, 180), 'fix: the second attempt after the first finished');
  update public.web_code_changes set fix_lease_until = null, state = 'pushed' where id = '00000000-0000-0000-0000-00000000c001';
  perform pg_temp.check(not public.web_code_change_claim_fix('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000f2', 2, 180), 'fix: never more than the limit');
  begin
    insert into public.web_code_changes (user_id, request_id, repository, scope, preview_url) values ('00000000-0000-0000-0000-0000000000f2', 'bad-preview-1', 'acme/shop', 'full', 'javascript:alert(1)');
    raise exception 'FAIL: non-https preview stored';
  exception when others then
    perform pg_temp.check(sqlerrm not like 'FAIL%', 'changes: only https preview URLs are stored');
  end;
end;
$$;
commit;

begin;
select pg_temp.check(
  pg_temp.err_as('authenticated', '00000000-0000-0000-0000-0000000000f2',
    $q$ select public.web_code_change_claim_fix('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000f2', 9, 180) $q$) like 'permission denied%',
  'changes: users cannot claim fixes themselves');
select pg_temp.check(
  pg_temp.err_as('authenticated', '00000000-0000-0000-0000-0000000000f2',
    $q$ insert into public.web_code_changes (user_id, request_id, repository, scope) values ('00000000-0000-0000-0000-0000000000f2', 'forged-chg-01', 'acme/shop', 'full') $q$) is not null,
  'changes: users cannot write them');
select pg_temp.check(
  pg_temp.err_as('authenticated', '00000000-0000-0000-0000-0000000000f3',
    $q$ do $d$ begin if exists (select 1 from public.web_code_changes) then raise exception 'saw another account''s change'; end if; end $d$ $q$) is null,
  'changes: each account reads only its own');
commit;

-- ── Deleting an account still removes its ledger, counter and changes ──────────────────────────
delete from auth.users where id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2');
select pg_temp.check(
  not exists (select 1 from public.web_chat_requests where user_id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2'))
  and not exists (select 1 from public.web_code_changes where user_id = '00000000-0000-0000-0000-0000000000f2'),
  'account deletion: the guarded ledger and the changes go with the account');
