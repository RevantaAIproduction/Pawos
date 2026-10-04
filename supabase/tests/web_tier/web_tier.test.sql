-- Assertions for 20261004020000_web_tier_architecture.sql on a LOCAL SCRATCH database (run_local.sh).
-- Every check raises on failure; psql runs with ON_ERROR_STOP.

create or replace function pg_temp.check(p_ok boolean, p_name text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_name; end if;
  raise notice 'PASS  %', p_name;
end;
$$;

-- Runs p_sql as p_role (and user p_sub) and returns the error message, or null if it succeeded.
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
  ('00000000-0000-0000-0000-000000000001', 'go@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'other@example.com'),
  ('00000000-0000-0000-0000-000000000003', 'claims@example.com'),
  ('00000000-0000-0000-0000-000000000004', 'deleted@example.com');

-- ── Backfill ────────────────────────────────────────────────────────────────────────────────────
select pg_temp.check(
  (select messages_sent from public.web_chat_usage where user_id = '00000000-0000-0000-0000-00000000000a') = 3,
  'backfill: the counter starts at the messages already stored');
select pg_temp.check(
  (select count(*) from public.web_chat_messages where surface = 'web') = (select count(*) from public.web_chat_messages),
  'existing messages are labelled surface = web');

begin;
set local role service_role;
set local request.jwt.claim.role = 'service_role';

-- ── Paw Go: exactly four, across chats ──────────────────────────────────────────────────────────
do $$
declare r jsonb; v_chat uuid; i int;
begin
  for i in 1..4 loop
    r := public.web_chat_begin_request('00000000-0000-0000-0000-000000000001', 'go-req-000' || i, null, 4);
    perform pg_temp.check(r->>'status' = 'claimed', 'go: claim ' || i);
    r := public.web_chat_append_exchange('00000000-0000-0000-0000-000000000001', null, 'question ' || i, 'answer ' || i, 4, 'go-req-000' || i);
    perform pg_temp.check((r->>'messagesUsed')::int = i, 'go: message ' || i || ' stored in its own chat');
  end loop;
  begin
    perform public.web_chat_begin_request('00000000-0000-0000-0000-000000000001', 'go-req-0005', null, 4);
    raise exception 'FAIL: fifth claim accepted';
  exception when others then
    perform pg_temp.check(sqlerrm = 'message_limit_reached', 'go: the fifth claim is refused before any model call');
  end;
  begin
    perform public.web_chat_append_exchange('00000000-0000-0000-0000-000000000001', null, 'q5', 'a5', 4, 'go-req-0006');
    raise exception 'FAIL: fifth exchange stored';
  exception when others then
    perform pg_temp.check(sqlerrm = 'message_limit_reached', 'go: the fifth exchange is refused even without a claim');
  end;
  -- Retrying a request id that was already answered returns the stored reply and stores nothing.
  r := public.web_chat_begin_request('00000000-0000-0000-0000-000000000001', 'go-req-0002', null, 4);
  perform pg_temp.check(r->>'status' = 'completed' and r->>'reply' = 'answer 2', 'retry of an answered request returns the stored reply');
  r := public.web_chat_append_exchange('00000000-0000-0000-0000-000000000001', null, 'question 2', 'other answer', 4, 'go-req-0002');
  perform pg_temp.check((r->>'duplicate')::boolean and r->>'reply' = 'answer 2', 'append with an answered request id is a duplicate');
  perform pg_temp.check((select count(*) from public.web_chat_messages where user_id = '00000000-0000-0000-0000-000000000001' and role = 'user') = 4, 'go: four user messages stored');
end;
$$;

-- ── Claims: in flight, failure, takeover ────────────────────────────────────────────────────────
do $$
declare r jsonb;
begin
  r := public.web_chat_begin_request('00000000-0000-0000-0000-000000000003', 'claim-req-01', null, 1);
  perform pg_temp.check(r->>'status' = 'claimed', 'claims: first attempt claims');
  r := public.web_chat_begin_request('00000000-0000-0000-0000-000000000003', 'claim-req-01', null, 1);
  perform pg_temp.check(r->>'status' = 'processing', 'claims: a retry while it runs is told "processing"');
  begin
    perform public.web_chat_begin_request('00000000-0000-0000-0000-000000000003', 'claim-req-02', null, 1);
    raise exception 'FAIL: parallel claim over the limit accepted';
  exception when others then
    perform pg_temp.check(sqlerrm = 'message_limit_reached', 'claims: an in-flight claim fills the last Go message');
  end;
  perform public.web_chat_fail_request('00000000-0000-0000-0000-000000000003', 'claim-req-01', 'model_unavailable');
  perform pg_temp.check(public.pawos_web_chat_messages_used('00000000-0000-0000-0000-000000000003') = 0, 'claims: a failed attempt consumes nothing');
  r := public.web_chat_begin_request('00000000-0000-0000-0000-000000000003', 'claim-req-02', null, 1);
  perform pg_temp.check(r->>'status' = 'claimed', 'claims: the released message can be used');
  r := public.web_chat_begin_request('00000000-0000-0000-0000-000000000003', 'claim-req-01', null, null);
  perform pg_temp.check(r->>'status' = 'claimed', 'claims: a failed request id may be retried (paid tier: no cap)');
  begin
    perform public.web_chat_begin_request('00000000-0000-0000-0000-000000000003', 'bad id!', null, null);
    raise exception 'FAIL: invalid request id accepted';
  exception when others then
    perform pg_temp.check(sqlerrm = 'invalid_request_id', 'claims: request ids are validated');
  end;
end;
$$;

-- ── Ownership ───────────────────────────────────────────────────────────────────────────────────
do $$
declare v_chat uuid;
begin
  select id into v_chat from public.web_chats where user_id = '00000000-0000-0000-0000-000000000001' limit 1;
  begin
    perform public.web_chat_begin_request('00000000-0000-0000-0000-000000000002', 'own-req-001', v_chat, null);
    raise exception 'FAIL: claimed into another account''s chat';
  exception when others then
    perform pg_temp.check(sqlerrm = 'chat_not_found', 'ownership: cannot claim into another account''s chat');
  end;
  begin
    perform public.web_chat_append_exchange('00000000-0000-0000-0000-000000000002', v_chat, 'x', 'y', null, 'own-req-002');
    raise exception 'FAIL: appended to another account''s chat';
  exception when others then
    perform pg_temp.check(sqlerrm = 'chat_not_found', 'ownership: cannot append to another account''s chat');
  end;
end;
$$;

-- ── Attachments ─────────────────────────────────────────────────────────────────────────────────
do $$
declare v_att uuid := gen_random_uuid(); r jsonb;
begin
  perform pg_temp.check((select public from storage.buckets where id = 'web-chat-uploads') = false, 'attachments: the bucket is private');
  insert into public.web_chat_attachments (id, user_id, client_upload_id, kind, mime_type, file_name, size_bytes, storage_path)
  values (v_att, '00000000-0000-0000-0000-000000000002', 'upload-0001', 'image', 'image/jpeg', 'photo.jpg', 1000, '00000000-0000-0000-0000-000000000002/' || v_att);
  begin
    perform public.web_chat_append_exchange('00000000-0000-0000-0000-000000000003', null, 'look', 'ok', null, 'att-req-0001', false, v_att);
    raise exception 'FAIL: used another account''s attachment';
  exception when others then
    perform pg_temp.check(sqlerrm = 'attachment_not_found', 'attachments: another account''s photo cannot be attached');
  end;
  r := public.web_chat_append_exchange('00000000-0000-0000-0000-000000000002', null, 'look', 'Needs PawOS Desktop.', null, 'att-req-0002', true, v_att);
  perform pg_temp.check((select message_id is not null from public.web_chat_attachments where id = v_att), 'attachments: linked to the stored message');
  perform pg_temp.check((select requires_desktop from public.web_chat_messages where request_id = 'att-req-0002' and role = 'assistant'), 'requires_desktop is stored on the reply');
  begin
    perform public.web_chat_append_exchange('00000000-0000-0000-0000-000000000002', null, 'again', 'ok', null, 'att-req-0003', false, v_att);
    raise exception 'FAIL: attachment reused';
  exception when others then
    perform pg_temp.check(sqlerrm = 'attachment_not_found', 'attachments: a photo is attached to one message only');
  end;
end;
$$;

-- ── Writer guards: direct writes are refused, even for the service role ─────────────────────────
do $$
declare v_chat uuid;
begin
  select id into v_chat from public.web_chats where user_id = '00000000-0000-0000-0000-000000000001' limit 1;
  begin
    insert into public.web_chat_messages (chat_id, user_id, role, content) values (v_chat, '00000000-0000-0000-0000-000000000001', 'user', 'sneaky fifth');
    raise exception 'FAIL: direct insert accepted';
  exception when others then
    perform pg_temp.check(sqlerrm = 'web_chat_direct_write_forbidden', 'guard: a direct message insert is refused');
  end;
  begin
    update public.web_chat_messages set content = 'edited' where user_id = '00000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: message update accepted';
  exception when others then
    perform pg_temp.check(sqlerrm = 'web_chat_direct_write_forbidden', 'guard: stored messages cannot be edited');
  end;
  begin
    update public.web_chat_usage set messages_sent = 0 where user_id = '00000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: counter reset accepted';
  exception when others then
    perform pg_temp.check(sqlerrm = 'web_chat_direct_write_forbidden', 'guard: the counter cannot be reset');
  end;
  begin
    delete from public.web_chat_usage where user_id = '00000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: counter delete accepted';
  exception when others then
    perform pg_temp.check(sqlerrm = 'web_chat_direct_write_forbidden', 'guard: the counter cannot be deleted while the account exists');
  end;
  begin
    insert into public.web_chat_requests (user_id, request_id, state, lease_expires_at) values ('00000000-0000-0000-0000-000000000001', 'forged-req-1', 'completed', now());
    raise exception 'FAIL: forged ledger row accepted';
  exception when others then
    perform pg_temp.check(sqlerrm = 'web_chat_direct_write_forbidden', 'guard: the request ledger cannot be written directly');
  end;
  -- Deleting chats (and their messages) does not hand Go messages back.
  delete from public.web_chats where user_id = '00000000-0000-0000-0000-000000000001';
  perform pg_temp.check(public.pawos_web_chat_messages_used('00000000-0000-0000-0000-000000000001') = 4, 'guard: deleting chats keeps the lifetime count');
  begin
    perform public.web_chat_begin_request('00000000-0000-0000-0000-000000000001', 'go-req-0007', null, 4);
    raise exception 'FAIL: limit reset by deleting chats';
  exception when others then
    perform pg_temp.check(sqlerrm = 'message_limit_reached', 'guard: still no fifth message after deleting chats');
  end;
end;
$$;
commit;

-- ── Signed-in users: read their own rows, call nothing, write nothing ──────────────────────────
begin;
select pg_temp.check(
  pg_temp.err_as('authenticated', '00000000-0000-0000-0000-000000000002',
    $q$ select public.web_chat_begin_request('00000000-0000-0000-0000-000000000002', 'user-req-0001', null, null) $q$) like 'permission denied%',
  'users cannot claim requests themselves');
select pg_temp.check(
  pg_temp.err_as('authenticated', '00000000-0000-0000-0000-000000000002',
    $q$ select public.web_chat_append_exchange('00000000-0000-0000-0000-000000000002', null, 'x', 'y', null, 'user-req-0002', false, null) $q$) like 'permission denied%',
  'users cannot store exchanges themselves');
select pg_temp.check(
  pg_temp.err_as('authenticated', '00000000-0000-0000-0000-000000000002',
    $q$ select public.web_chat_fail_request('00000000-0000-0000-0000-000000000002', 'att-req-0002', 'x') $q$) like 'permission denied%',
  'users cannot release claims themselves');
select pg_temp.check(
  pg_temp.err_as('authenticated', '00000000-0000-0000-0000-000000000002',
    $q$ insert into public.web_chat_messages (chat_id, user_id, role, content) select chat_id, user_id, 'user', 'x' from public.web_chat_attachments limit 1 $q$) is not null,
  'users cannot insert messages');
select pg_temp.check(
  pg_temp.err_as('authenticated', '00000000-0000-0000-0000-000000000002',
    $q$ do $d$ begin
      if (select count(*) from public.web_chat_messages) <> 2 then raise exception 'saw % messages', (select count(*) from public.web_chat_messages); end if;
      if (select count(*) from public.web_chat_attachments) <> 1 then raise exception 'saw other attachments'; end if;
      if exists (select 1 from public.web_chat_requests where user_id <> auth.uid()) then raise exception 'saw other requests'; end if;
      if exists (select 1 from public.web_chat_usage where user_id <> auth.uid()) then raise exception 'saw other counters'; end if;
    end $d$ $q$) is null,
  'users read only their own messages, attachments, requests and counter');
commit;

-- ── Account deletion still cascades ─────────────────────────────────────────────────────────────
begin;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
select public.web_chat_append_exchange('00000000-0000-0000-0000-000000000004', null, 'bye', 'ok', null, 'del-req-0001');
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-000000000004';
select pg_temp.check(not exists (select 1 from public.web_chat_usage where user_id = '00000000-0000-0000-0000-000000000004'), 'deleting the account removes its counter');
commit;
