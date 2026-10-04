-- Assertions for 20261004050000_account_chats.sql on a LOCAL SCRATCH database (run_local.sh).
-- The functions run as the signed-in user (role authenticated, auth.uid()) — as the desktop app calls them.

create or replace function pg_temp.check(p_ok boolean, p_name text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_name; end if;
  raise notice 'PASS  %', p_name;
end;
$$;

-- Runs p_sql as p_sub (authenticated) and returns its single text result, or 'ERROR: <message>'.
create or replace function pg_temp.as_user(p_sub uuid, p_sql text) returns text language plpgsql as $$
declare v_out text;
begin
  perform set_config('request.jwt.claim.role', case when p_sub is null then 'anon' else 'authenticated' end, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub::text, ''), true);
  execute format('set local role %I', case when p_sub is null then 'anon' else 'authenticated' end);
  begin
    execute p_sql into v_out;
  exception when others then
    v_out := 'ERROR: ' || sqlerrm;
  end;
  execute 'reset role';
  return v_out;
end;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'desk@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'stranger@example.com');

begin;
do $$
declare v text; v_chat uuid; v_web_chat uuid;
begin
  -- A Desktop turn becomes a chat in the account, labelled desktop.
  v := pg_temp.as_user('00000000-0000-0000-0000-0000000000a1',
    $q$ select public.account_chat_sync_desktop_turn('session-1', 'Fix the login bug', 'turn-1', 'Fix the login bug', 'Fixed it in auth.ts.')::text $q$);
  v_chat := (v::jsonb->>'chatId')::uuid;
  perform pg_temp.check(v_chat is not null and (v::jsonb->>'stored')::boolean, 'desktop: a turn is stored in the account');
  perform pg_temp.check((select surface from public.web_chats where id = v_chat) = 'desktop', 'desktop: the chat is labelled desktop');
  perform pg_temp.check((select count(*) from public.web_chat_messages where chat_id = v_chat and surface = 'desktop') = 2, 'desktop: both sides of the turn, labelled desktop');

  -- Idempotent per turn, and the next turn lands in the same chat.
  v := pg_temp.as_user('00000000-0000-0000-0000-0000000000a1',
    $q$ select public.account_chat_sync_desktop_turn('session-1', 'Fix the login bug', 'turn-1', 'Fix the login bug', 'Fixed it in auth.ts.')::text $q$);
  perform pg_temp.check(not (v::jsonb->>'stored')::boolean, 'desktop: syncing the same turn again stores nothing');
  v := pg_temp.as_user('00000000-0000-0000-0000-0000000000a1',
    $q$ select public.account_chat_sync_desktop_turn('session-1', 'Fix the login bug', 'turn-2', 'Now add a test', 'Added one.')::text $q$);
  perform pg_temp.check((v::jsonb->>'chatId')::uuid = v_chat and (select count(*) from public.web_chat_messages where chat_id = v_chat) = 4, 'desktop: the next turn continues the same chat');

  -- Desktop turns are not Web usage.
  perform pg_temp.check(public.pawos_web_chat_messages_used('00000000-0000-0000-0000-0000000000a1') = 0, 'desktop turns never count toward a Web message cap');

  -- A chat that started on the web, continued on Desktop: same chat, no fork.
  perform set_config('pawos.web_chat_writer', 'on', true);
  insert into public.web_chats (user_id, title, surface) values ('00000000-0000-0000-0000-0000000000a1', 'Plan from my phone', 'web') returning id into v_web_chat;
  perform set_config('pawos.web_chat_writer', '', true);
  v := pg_temp.as_user('00000000-0000-0000-0000-0000000000a1',
    format($q$ select public.account_chat_sync_desktop_turn('%s', 'Plan from my phone', 'turn-3', 'Do it now', 'Done on this computer.', '%s')::text $q$, v_web_chat, v_web_chat));
  perform pg_temp.check((v::jsonb->>'chatId')::uuid = v_web_chat, 'continue: a web chat continued on Desktop stays one chat');
  perform pg_temp.check((select surface from public.web_chats where id = v_web_chat) = 'web', 'continue: the chat keeps the surface it started on');

  -- Nobody else's chat can be written, read, renamed or deleted.
  v := pg_temp.as_user('00000000-0000-0000-0000-0000000000a2',
    format($q$ select public.account_chat_sync_desktop_turn('x-session', 'x', 'x-turn', 'intrude', 'x', '%s')::text $q$, v_chat));
  perform pg_temp.check(v like 'ERROR: chat_not_found%', 'isolation: cannot add to another account''s chat');
  v := pg_temp.as_user('00000000-0000-0000-0000-0000000000a2', format($q$ select public.get_my_account_chat('%s')::text $q$, v_chat));
  perform pg_temp.check(v is null, 'isolation: cannot read another account''s chat');
  v := pg_temp.as_user('00000000-0000-0000-0000-0000000000a2', $q$ select public.get_my_account_chats(50)::text $q$);
  perform pg_temp.check(v = '[]', 'isolation: another account lists none of these chats');
  v := pg_temp.as_user('00000000-0000-0000-0000-0000000000a2', format($q$ select public.account_chat_rename('%s', 'hacked')::text $q$, v_chat));
  perform pg_temp.check(v = 'false', 'isolation: cannot rename another account''s chat');
  v := pg_temp.as_user('00000000-0000-0000-0000-0000000000a2', format($q$ select public.account_chat_delete('%s')::text $q$, v_chat));
  perform pg_temp.check(v = 'false' and exists (select 1 from public.web_chats where id = v_chat), 'isolation: cannot delete another account''s chat');
  v := pg_temp.as_user(null, $q$ select public.get_my_account_chats(50)::text $q$);
  perform pg_temp.check(v like 'ERROR:%', 'signed out: no access');

  -- The owner sees every chat, from both surfaces, and can read, rename and delete them.
  v := pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', $q$ select public.get_my_account_chats(50)::text $q$);
  perform pg_temp.check(jsonb_array_length(v::jsonb) = 2 and v like '%"surface": "desktop"%' and v like '%"surface": "web"%', 'owner: one list with Desktop and Web chats');
  v := pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', format($q$ select public.get_my_account_chat('%s')::text $q$, v_chat));
  perform pg_temp.check(jsonb_array_length(v::jsonb->'messages') = 4, 'owner: reads the whole conversation');
  v := pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', format($q$ select public.account_chat_rename('%s', 'Login fix')::text $q$, v_chat));
  perform pg_temp.check(v = 'true' and (select title from public.web_chats where id = v_chat) = 'Login fix', 'owner: a rename shows everywhere');
  v := pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', format($q$ select public.account_chat_delete('%s')::text $q$, v_chat));
  perform pg_temp.check(v = 'true' and not exists (select 1 from public.web_chats where id = v_chat), 'owner: a delete removes it everywhere');

  -- Input checks.
  v := pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', $q$ select public.account_chat_sync_desktop_turn('../evil', 't', 'turn-9', 'x', 'y')::text $q$);
  perform pg_temp.check(v like 'ERROR: invalid_session_id%', 'checks: session ids are validated');
  v := pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', format($q$ select public.account_chat_sync_desktop_turn('s2', 't', 'turn-10', '%s', 'y')::text $q$, repeat('x', 100001)));
  perform pg_temp.check(v like 'ERROR: turn_too_large%', 'checks: oversized turns are refused');
  v := pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', $q$ insert into public.web_chat_messages (chat_id, user_id, role, content) select id, user_id, 'user', 'x' from public.web_chats limit 1 returning 'inserted' $q$);
  perform pg_temp.check(v like 'ERROR:%', 'checks: messages still cannot be inserted directly');
end;
$$;
commit;
