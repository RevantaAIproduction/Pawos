-- PawOS Web chat — the small, signed-in chat workspace on pawos-web (/app) that lets someone use
-- PawOS from a browser or phone. It is a conversation only: nothing here touches files, a terminal
-- or connected services; that is the desktop app.
--
-- Two tables, both owner-readable through RLS and written ONLY by pawos-web's server (the service
-- role) through web_chat_append_exchange() below. That function is where two guarantees live:
--
--  1. The Paw Go message limit. The caller (pawos-web, after resolving the account's tier on the
--     server) passes the limit that applies, and the count + insert happen under one per-user lock,
--     so parallel requests cannot slip past it. There is deliberately no delete policy: the limit
--     counts messages ever sent, and deleting a chat must not hand them back.
--
--  2. Idempotency. Every send carries a client-generated request id. If the browser retries a send
--     whose response it never received (a phone changing networks, a suspended tab), the stored
--     exchange is returned instead of a second copy being inserted — and it is not counted twice.
--
-- This is not a second usage system. Paid tiers pass no limit; their usage is charged through the
-- existing usage buckets (reserve_usage / settle_usage) by the API route, exactly as the desktop
-- app's calls are. Web activity is told apart from desktop activity by the reservation's category
-- ('web-chat'), not by a separate balance.

create table if not exists web_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_web_chats_user on web_chats (user_id, updated_at desc);

alter table web_chats enable row level security;

drop policy if exists web_chats_select_own on web_chats;
create policy web_chats_select_own on web_chats
  for select using (user_id = auth.uid());

create table if not exists web_chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references web_chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- The client's id for the send that produced this exchange. Set on both rows of the exchange.
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_web_chat_messages_chat on web_chat_messages (chat_id, created_at);
create index if not exists idx_web_chat_messages_user_sent on web_chat_messages (user_id) where role = 'user';
-- One user message per (account, request id): the database-level guard behind idempotent sends.
create unique index if not exists idx_web_chat_messages_request
  on web_chat_messages (user_id, request_id) where role = 'user' and request_id is not null;

alter table web_chat_messages enable row level security;

drop policy if exists web_chat_messages_select_own on web_chat_messages;
create policy web_chat_messages_select_own on web_chat_messages
  for select using (user_id = auth.uid());

-- Stores one exchange (the user's message and the assistant's reply), creating the chat when
-- p_chat_id is null. p_message_limit is the total number of messages this account may ever send on
-- the web, or null for no message cap. p_request_id makes the call idempotent: a second call with
-- the same id returns the stored exchange ("duplicate": true) and inserts nothing.
-- Raises 'message_limit_reached' when the account is at the cap and 'chat_not_found' when the chat
-- is not the account's own.
create or replace function public.web_chat_append_exchange(
  p_user_id uuid,
  p_chat_id uuid,
  p_user_content text,
  p_assistant_content text,
  p_message_limit integer,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_chat_id uuid := p_chat_id;
  v_existing public.web_chat_messages;
  v_reply text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'unauthorized: backend-only operation' using errcode = '42501';
  end if;
  if coalesce(btrim(p_user_content), '') = '' or coalesce(btrim(p_assistant_content), '') = '' then
    raise exception 'empty_message' using errcode = '22023';
  end if;

  -- One exchange at a time per account, so neither the count nor the request-id check can be raced.
  perform pg_advisory_xact_lock(hashtext('web_chat:' || p_user_id::text));

  select count(*) into v_used from public.web_chat_messages where user_id = p_user_id and role = 'user';

  if p_request_id is not null then
    select * into v_existing
    from public.web_chat_messages
    where user_id = p_user_id and role = 'user' and request_id = p_request_id;
    if found then
      select content into v_reply
      from public.web_chat_messages
      where chat_id = v_existing.chat_id and role = 'assistant' and request_id = p_request_id
      limit 1;
      return jsonb_build_object('chatId', v_existing.chat_id, 'messagesUsed', v_used, 'reply', v_reply, 'duplicate', true);
    end if;
  end if;

  if p_message_limit is not null and v_used >= p_message_limit then
    raise exception 'message_limit_reached' using errcode = 'P0001';
  end if;

  if v_chat_id is null then
    insert into public.web_chats (user_id, title)
    values (p_user_id, left(regexp_replace(btrim(p_user_content), '\s+', ' ', 'g'), 60))
    returning id into v_chat_id;
  else
    update public.web_chats set updated_at = now() where id = v_chat_id and user_id = p_user_id;
    if not found then
      raise exception 'chat_not_found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.web_chat_messages (chat_id, user_id, role, content, request_id, created_at)
  values
    (v_chat_id, p_user_id, 'user', p_user_content, p_request_id, clock_timestamp()),
    (v_chat_id, p_user_id, 'assistant', p_assistant_content, p_request_id, clock_timestamp() + interval '1 millisecond');

  return jsonb_build_object('chatId', v_chat_id, 'messagesUsed', v_used + 1, 'reply', p_assistant_content, 'duplicate', false);
end;
$$;

revoke all on function public.web_chat_append_exchange(uuid, uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.web_chat_append_exchange(uuid, uuid, text, text, integer, text) to service_role;
