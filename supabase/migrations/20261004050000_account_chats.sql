-- One chat history per PawOS account — the same chats in PawOS Desktop, on PawOS Web and on a
-- phone. web_chats / web_chat_messages become the account's chat store; every chat and message
-- carries the surface it was written on ('web' | 'desktop'), which the apps show so a user knows
-- where a conversation ran (Web and mobile: chat and code changes; Desktop: full capabilities).
--
-- Desktop writes its finished turns here through account_chat_sync_desktop_turn(), as the signed-in
-- user (auth.uid()). Desktop turns are NOT Web usage: they never count toward a Web message cap
-- (Paw Go's four messages, a weekly cap) — those count surface = 'web' only — and their model calls
-- were already charged by the desktop app. Nothing here creates usage; these functions only store
-- and read conversation text.
--
-- What Desktop syncs is the conversation text (what the user said, what Paw answered). Tool output,
-- local file contents, screenshots and evidence stay on the user's computer.
--
-- Run AFTER 20261004040000_web_code_changes.sql.

-- ── 1. Desktop sessions in the account store ────────────────────────────────────────────────────
alter table public.web_chats add column if not exists desktop_session_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'web_chats_desktop_session_id_check') then
    alter table public.web_chats add constraint web_chats_desktop_session_id_check
      check (desktop_session_id is null or desktop_session_id ~ '^[A-Za-z0-9_-]{1,80}$');
  end if;
end;
$$;

create unique index if not exists idx_web_chats_desktop_session on public.web_chats (user_id, desktop_session_id) where desktop_session_id is not null;

-- ── 2. Web caps count Web messages only ─────────────────────────────────────────────────────────
create or replace function public.pawos_web_chat_messages_used(p_user_id uuid, p_window_days integer default null)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_window_days is null then greatest(
      coalesce((select messages_sent from public.web_chat_usage where user_id = p_user_id), 0),
      (select count(*)::integer from public.web_chat_messages where user_id = p_user_id and role = 'user' and surface = 'web')
    )
    else (
      select count(*)::integer from public.web_chat_requests
      where user_id = p_user_id and state = 'completed' and surface = 'web'
        and updated_at > now() - make_interval(days => greatest(1, p_window_days))
    )
  end;
$$;

revoke all on function public.pawos_web_chat_messages_used(uuid, integer) from public, anon, authenticated;
grant execute on function public.pawos_web_chat_messages_used(uuid, integer) to service_role;

-- ── 3. Desktop → account ────────────────────────────────────────────────────────────────────────
-- Stores one finished Desktop turn. The chat is found by the desktop session id, or — when the
-- session continues a chat that started on the web — by p_chat_id (which must be the caller's own).
-- Idempotent per turn: syncing the same turn again stores nothing. Returns { chatId, stored }.
create or replace function public.account_chat_sync_desktop_turn(
  p_session_id text,
  p_title text,
  p_turn_id text,
  p_user_text text,
  p_assistant_text text,
  p_chat_id uuid default null,
  p_started_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_chat_id uuid;
  v_request_id text;
  v_at timestamptz := coalesce(least(p_started_at, now()), now());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_session_id is null or p_session_id !~ '^[A-Za-z0-9_-]{1,80}$' then
    raise exception 'invalid_session_id' using errcode = '22023';
  end if;
  if p_turn_id is null or p_turn_id !~ '^[A-Za-z0-9_-]{1,80}$' then
    raise exception 'invalid_turn_id' using errcode = '22023';
  end if;
  if coalesce(btrim(p_user_text), '') = '' and coalesce(btrim(p_assistant_text), '') = '' then
    raise exception 'empty_turn' using errcode = '22023';
  end if;
  if length(coalesce(p_user_text, '')) > 100000 or length(coalesce(p_assistant_text, '')) > 100000 then
    raise exception 'turn_too_large' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('web_chat:' || v_uid::text));

  if p_chat_id is not null then
    select id into v_chat_id from public.web_chats where id = p_chat_id and user_id = v_uid;
    if v_chat_id is null then
      raise exception 'chat_not_found' using errcode = 'P0002';
    end if;
  else
    select id into v_chat_id from public.web_chats where user_id = v_uid and desktop_session_id = p_session_id;
  end if;

  if v_chat_id is null then
    insert into public.web_chats (user_id, title, surface, desktop_session_id, created_at, updated_at)
    values (v_uid, left(coalesce(nullif(btrim(p_title), ''), left(btrim(p_user_text), 60), 'Desktop chat'), 120), 'desktop', p_session_id, v_at, v_at)
    returning id into v_chat_id;
  else
    update public.web_chats
       set updated_at = greatest(updated_at, v_at),
           desktop_session_id = coalesce(desktop_session_id, p_session_id)
     where id = v_chat_id;
  end if;

  v_request_id := left('desktop-' || p_turn_id, 64);
  if exists (select 1 from public.web_chat_messages where user_id = v_uid and role = 'user' and request_id = v_request_id) then
    return jsonb_build_object('chatId', v_chat_id, 'stored', false);
  end if;

  perform set_config('pawos.web_chat_writer', 'on', true);
  insert into public.web_chat_messages (chat_id, user_id, role, content, request_id, surface, created_at)
  values (v_chat_id, v_uid, 'user', coalesce(nullif(btrim(p_user_text), ''), '(voice turn)'), v_request_id, 'desktop', v_at);
  if coalesce(btrim(p_assistant_text), '') <> '' then
    insert into public.web_chat_messages (chat_id, user_id, role, content, request_id, surface, created_at)
    values (v_chat_id, v_uid, 'assistant', p_assistant_text, v_request_id, 'desktop', v_at + interval '1 millisecond');
  end if;
  perform set_config('pawos.web_chat_writer', '', true);

  return jsonb_build_object('chatId', v_chat_id, 'stored', true);
end;
$$;

revoke all on function public.account_chat_sync_desktop_turn(text, text, text, text, text, uuid, timestamptz) from public, anon;
grant execute on function public.account_chat_sync_desktop_turn(text, text, text, text, text, uuid, timestamptz) to authenticated;

-- Renames one of the caller's chats (any surface — it is one chat, wherever it is renamed).
create or replace function public.account_chat_rename(p_chat_id uuid, p_title text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'empty_title' using errcode = '22023';
  end if;
  update public.web_chats set title = left(btrim(p_title), 120), updated_at = now() where id = p_chat_id and user_id = v_uid;
  return found;
end;
$$;

revoke all on function public.account_chat_rename(uuid, text) from public, anon;
grant execute on function public.account_chat_rename(uuid, text) to authenticated;

-- Deletes one of the caller's chats everywhere. Web message caps are unaffected: they are counted
-- from records that deleting a chat does not remove (web_chat_usage, web_chat_requests).
create or replace function public.account_chat_delete(p_chat_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from public.web_chats where id = p_chat_id and user_id = v_uid;
  return found;
end;
$$;

revoke all on function public.account_chat_delete(uuid) from public, anon;
grant execute on function public.account_chat_delete(uuid) to authenticated;

-- ── 4. Account → Desktop ────────────────────────────────────────────────────────────────────────
-- The caller's chats, newest first: id, title, the surface it started on, when it was last used,
-- and the desktop session it maps to (if any).
create or replace function public.get_my_account_chats(p_limit integer default 100)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'title', c.title, 'surface', c.surface, 'desktopSessionId', c.desktop_session_id,
    'createdAt', c.created_at, 'updatedAt', c.updated_at
  ) order by c.updated_at desc), '[]'::jsonb)
  from (
    select * from public.web_chats where user_id = auth.uid()
    order by updated_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 200)
  ) c;
$$;

revoke all on function public.get_my_account_chats(integer) from public, anon;
grant execute on function public.get_my_account_chats(integer) to authenticated;

-- One of the caller's chats with its messages (text only), or null.
create or replace function public.get_my_account_chat(p_chat_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when c.id is null then null else jsonb_build_object(
    'id', c.id, 'title', c.title, 'surface', c.surface, 'desktopSessionId', c.desktop_session_id,
    'createdAt', c.created_at, 'updatedAt', c.updated_at,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('role', m.role, 'content', m.content, 'surface', m.surface, 'createdAt', m.created_at, 'requestId', m.request_id) order by m.created_at)
      from (select * from public.web_chat_messages where chat_id = c.id and user_id = auth.uid() order by created_at limit 400) m
    ), '[]'::jsonb)
  ) end
  from (select * from public.web_chats where id = p_chat_id and user_id = auth.uid()) c
  right join (select 1) one on true;
$$;

revoke all on function public.get_my_account_chat(uuid) from public, anon;
grant execute on function public.get_my_account_chat(uuid) to authenticated;
