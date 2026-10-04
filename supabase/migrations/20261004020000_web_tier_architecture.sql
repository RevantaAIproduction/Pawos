-- PawOS Web tier architecture — hardening of the Web chat tables from 20261004010000_web_chat.sql.
--
-- Still not a second usage system: paid tiers keep being charged through reserve_usage /
-- settle_usage (the desktop app's functions, untouched here). This migration only makes the Web
-- chat's own records safer for unreliable (mobile) connections and harder to tamper with:
--
--  1. A monotonic per-account Web message counter (web_chat_usage). Paw Go's lifetime limit is
--     checked against greatest(counter, stored messages), so deleting messages or chats — even with
--     the service role — never hands messages back.
--  2. A request ledger (web_chat_requests). A send is claimed under the account's lock BEFORE the
--     model is called. A retry of the same request id while the first attempt is still running is
--     told "processing" instead of calling the model a second time, and a reload can ask the server
--     whether a send is still in flight. For Paw Go, in-flight claims count toward the limit, so
--     parallel sends cannot even reach the model once the limit is spoken for. A failed attempt
--     releases its claim: failures never consume a Go message.
--  3. Writer guards. Messages, the counter and the ledger can only be written from inside the
--     functions below (a transaction-local flag they set), never by a direct insert/update — not
--     even by the service role through the REST API. Messages are immutable once stored.
--  4. Execution surface ('web' | 'desktop') on chats and messages — for activity history and
--     analytics only, never an authorization input. Everything written by pawos-web is 'web'.
--  5. requires_desktop on assistant messages: the reply said the request needs PawOS Desktop, so
--     the Web UI offers "Continue in PawOS Desktop" next to it. Display only.
--  6. Photo attachments (web_chat_attachments + the private 'web-chat-uploads' bucket). Written
--     and read only by pawos-web's server with the service role; the owner can list their own rows.
--
-- Run AFTER 20261004010000_web_chat.sql. Deploy this migration BEFORE the pawos-web build that
-- calls web_chat_begin_request (the new build cannot store an exchange without it).

-- ── 1. Surface and requires_desktop ─────────────────────────────────────────────────────────────
alter table public.web_chats add column if not exists surface text not null default 'web';
alter table public.web_chat_messages add column if not exists surface text not null default 'web';
alter table public.web_chat_messages add column if not exists requires_desktop boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'web_chats_surface_check') then
    alter table public.web_chats add constraint web_chats_surface_check check (surface in ('web', 'desktop'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'web_chat_messages_surface_check') then
    alter table public.web_chat_messages add constraint web_chat_messages_surface_check check (surface in ('web', 'desktop'));
  end if;
end;
$$;

-- ── 2. Monotonic Web message counter ────────────────────────────────────────────────────────────
create table if not exists public.web_chat_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Every Web chat message this account has ever had stored, on any tier. Only ever goes up.
  messages_sent integer not null default 0 check (messages_sent >= 0),
  updated_at timestamptz not null default now()
);

alter table public.web_chat_usage enable row level security;

drop policy if exists web_chat_usage_select_own on public.web_chat_usage;
create policy web_chat_usage_select_own on public.web_chat_usage
  for select using (user_id = auth.uid());

-- Backfill from the messages already stored. Sets the writer flag (section 5) so re-running this
-- migration after the guard exists is harmless; the update can only raise a counter.
do $$
begin
  perform set_config('pawos.web_chat_writer', 'on', true);
  insert into public.web_chat_usage (user_id, messages_sent)
  select user_id, count(*)::integer
  from public.web_chat_messages
  where role = 'user'
  group by user_id
  on conflict (user_id) do update
    set messages_sent = greatest(public.web_chat_usage.messages_sent, excluded.messages_sent);
  perform set_config('pawos.web_chat_writer', '', true);
end;
$$;

-- ── 3. Request ledger ───────────────────────────────────────────────────────────────────────────
create table if not exists public.web_chat_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null check (request_id ~ '^[A-Za-z0-9-]{8,64}$'),
  chat_id uuid references public.web_chats(id) on delete set null,
  state text not null check (state in ('processing', 'completed', 'failed')),
  error_code text,
  surface text not null default 'web' check (surface in ('web', 'desktop')),
  -- A 'processing' claim older than this was abandoned (the server instance died); it may be retried.
  lease_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

create index if not exists idx_web_chat_requests_inflight on public.web_chat_requests (user_id, lease_expires_at) where state = 'processing';

alter table public.web_chat_requests enable row level security;

drop policy if exists web_chat_requests_select_own on public.web_chat_requests;
create policy web_chat_requests_select_own on public.web_chat_requests
  for select using (user_id = auth.uid());

-- ── 4. Photo attachments ────────────────────────────────────────────────────────────────────────
create table if not exists public.web_chat_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The browser's id for the upload, so retrying an upload whose response was lost is safe.
  client_upload_id text not null check (client_upload_id ~ '^[A-Za-z0-9-]{8,64}$'),
  kind text not null check (kind in ('image')),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif')),
  file_name text not null check (char_length(file_name) between 1 and 120),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  storage_path text not null unique,
  chat_id uuid references public.web_chats(id) on delete cascade,
  message_id uuid references public.web_chat_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, client_upload_id)
);

create index if not exists idx_web_chat_attachments_user on public.web_chat_attachments (user_id, created_at desc);
create index if not exists idx_web_chat_attachments_message on public.web_chat_attachments (message_id);

alter table public.web_chat_attachments enable row level security;

drop policy if exists web_chat_attachments_select_own on public.web_chat_attachments;
create policy web_chat_attachments_select_own on public.web_chat_attachments
  for select using (user_id = auth.uid());

-- Private bucket. No storage.objects policies: only pawos-web's server (service role) reads or
-- writes it, after checking the session, the plan and ownership. Objects live at <user id>/<attachment id>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('web-chat-uploads', 'web-chat-uploads', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── 5. Writer guards ────────────────────────────────────────────────────────────────────────────
-- The functions in section 6 set pawos.web_chat_writer = 'on' for the duration of their own
-- writes (transaction-local). Anything else — a direct REST insert with the service-role key, a
-- user's own client — is refused.
-- security definer: it reads auth.users, which the writing role may not be able to see.
create or replace function public.pawos_web_chat_writer_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    -- The counter can only disappear together with its account (the auth.users cascade).
    if tg_table_name = 'web_chat_usage' and exists (select 1 from auth.users where id = old.user_id) then
      raise exception 'web_chat_direct_write_forbidden' using errcode = '42501';
    end if;
    return old;
  end if;

  -- The one update allowed from outside: the "on delete set null" cascade when a chat is deleted.
  if tg_table_name = 'web_chat_requests' and tg_op = 'UPDATE' then
    if new.chat_id is null and old.chat_id is not null
       and (to_jsonb(new) - 'chat_id') = (to_jsonb(old) - 'chat_id') then
      return new;
    end if;
  end if;

  if coalesce(current_setting('pawos.web_chat_writer', true), '') <> 'on' then
    raise exception 'web_chat_direct_write_forbidden' using errcode = '42501';
  end if;
  if tg_table_name = 'web_chat_messages' and tg_op = 'UPDATE' then
    raise exception 'web_chat_messages_immutable' using errcode = '42501';
  end if;
  -- Nested, not "and": PL/pgSQL would resolve new.messages_sent on every table.
  if tg_table_name = 'web_chat_usage' and tg_op = 'UPDATE' then
    if new.messages_sent < old.messages_sent then
      raise exception 'web_chat_usage_monotonic' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists web_chat_messages_writer_guard on public.web_chat_messages;
create trigger web_chat_messages_writer_guard
  before insert or update on public.web_chat_messages
  for each row execute function public.pawos_web_chat_writer_guard();

drop trigger if exists web_chat_usage_writer_guard on public.web_chat_usage;
create trigger web_chat_usage_writer_guard
  before insert or update or delete on public.web_chat_usage
  for each row execute function public.pawos_web_chat_writer_guard();

drop trigger if exists web_chat_requests_writer_guard on public.web_chat_requests;
create trigger web_chat_requests_writer_guard
  before insert or update on public.web_chat_requests
  for each row execute function public.pawos_web_chat_writer_guard();

-- ── 6. Functions (service role only) ────────────────────────────────────────────────────────────

-- Messages counted against the account: the counter, or the stored messages if somehow higher.
create or replace function public.pawos_web_chat_messages_used(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    coalesce((select messages_sent from public.web_chat_usage where user_id = p_user_id), 0),
    (select count(*)::integer from public.web_chat_messages where user_id = p_user_id and role = 'user')
  );
$$;

revoke all on function public.pawos_web_chat_messages_used(uuid) from public, anon, authenticated;
grant execute on function public.pawos_web_chat_messages_used(uuid) to service_role;

-- Claims a send before the model is called. Returns one of:
--   {"status":"claimed","messagesUsed":n}          — go ahead and call the model
--   {"status":"processing","chatId":…}             — another attempt with this id is running now
--   {"status":"completed","chatId":…,"reply":…}    — already answered; return the stored reply
-- Raises 'message_limit_reached' (stored + in-flight messages already fill p_message_limit) and
-- 'chat_not_found' (p_chat_id is not the account's own chat).
create or replace function public.web_chat_begin_request(
  p_user_id uuid,
  p_request_id text,
  p_chat_id uuid,
  p_message_limit integer,
  p_lease_seconds integer default 150
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.web_chat_requests;
  v_used integer;
  v_inflight integer;
  v_reply text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'unauthorized: backend-only operation' using errcode = '42501';
  end if;
  if p_request_id is null or p_request_id !~ '^[A-Za-z0-9-]{8,64}$' then
    raise exception 'invalid_request_id' using errcode = '22023';
  end if;

  -- The same per-account lock web_chat_append_exchange takes.
  perform pg_advisory_xact_lock(hashtext('web_chat:' || p_user_id::text));

  select * into v_existing from public.web_chat_requests where user_id = p_user_id and request_id = p_request_id;
  if found then
    if v_existing.state = 'completed' then
      select content into v_reply from public.web_chat_messages
      where user_id = p_user_id and role = 'assistant' and request_id = p_request_id
      limit 1;
      return jsonb_build_object('status', 'completed', 'chatId', v_existing.chat_id, 'reply', v_reply);
    end if;
    if v_existing.state = 'processing' and v_existing.lease_expires_at > now() then
      return jsonb_build_object('status', 'processing', 'chatId', v_existing.chat_id);
    end if;
    -- 'failed', or a claim whose server never came back: this attempt may take it over.
  end if;

  if p_chat_id is not null and not exists (select 1 from public.web_chats where id = p_chat_id and user_id = p_user_id) then
    raise exception 'chat_not_found' using errcode = 'P0002';
  end if;

  v_used := public.pawos_web_chat_messages_used(p_user_id);
  if p_message_limit is not null then
    select count(*)::integer into v_inflight from public.web_chat_requests
    where user_id = p_user_id and state = 'processing' and lease_expires_at > now() and request_id <> p_request_id;
    if v_used + v_inflight >= p_message_limit then
      raise exception 'message_limit_reached' using errcode = 'P0001';
    end if;
  end if;

  perform set_config('pawos.web_chat_writer', 'on', true);
  insert into public.web_chat_requests (user_id, request_id, chat_id, state, error_code, lease_expires_at, updated_at)
  values (p_user_id, p_request_id, p_chat_id, 'processing', null, now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 150), 600))), now())
  on conflict (user_id, request_id) do update
    set state = 'processing', chat_id = excluded.chat_id, error_code = null, lease_expires_at = excluded.lease_expires_at, updated_at = now();
  perform set_config('pawos.web_chat_writer', '', true);

  return jsonb_build_object('status', 'claimed', 'messagesUsed', v_used);
end;
$$;

revoke all on function public.web_chat_begin_request(uuid, text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.web_chat_begin_request(uuid, text, uuid, integer, integer) to service_role;

-- Releases a claim whose attempt produced no stored exchange (model failure, refused usage, …).
-- A released claim no longer counts toward Paw Go's limit, and the same request id may be retried.
create or replace function public.web_chat_fail_request(p_user_id uuid, p_request_id text, p_error_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'unauthorized: backend-only operation' using errcode = '42501';
  end if;
  perform set_config('pawos.web_chat_writer', 'on', true);
  update public.web_chat_requests
     set state = 'failed', error_code = left(coalesce(p_error_code, 'failed'), 40), updated_at = now()
   where user_id = p_user_id and request_id = p_request_id and state = 'processing';
  perform set_config('pawos.web_chat_writer', '', true);
end;
$$;

revoke all on function public.web_chat_fail_request(uuid, text, text) from public, anon, authenticated;
grant execute on function public.web_chat_fail_request(uuid, text, text) to service_role;

-- Stores one exchange — same contract as before, plus: the counter, the ledger, the surface,
-- requires_desktop and an optional photo attachment. Replaces the 6-argument version.
drop function if exists public.web_chat_append_exchange(uuid, uuid, text, text, integer, text);

create or replace function public.web_chat_append_exchange(
  p_user_id uuid,
  p_chat_id uuid,
  p_user_content text,
  p_assistant_content text,
  p_message_limit integer,
  p_request_id text default null,
  p_requires_desktop boolean default false,
  p_attachment_id uuid default null
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
  v_user_message_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'unauthorized: backend-only operation' using errcode = '42501';
  end if;
  if coalesce(btrim(p_user_content), '') = '' or coalesce(btrim(p_assistant_content), '') = '' then
    raise exception 'empty_message' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('web_chat:' || p_user_id::text));

  v_used := public.pawos_web_chat_messages_used(p_user_id);

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
    insert into public.web_chats (user_id, title, surface)
    values (p_user_id, left(regexp_replace(btrim(p_user_content), '\s+', ' ', 'g'), 60), 'web')
    returning id into v_chat_id;
  else
    update public.web_chats set updated_at = now() where id = v_chat_id and user_id = p_user_id;
    if not found then
      raise exception 'chat_not_found' using errcode = 'P0002';
    end if;
  end if;

  perform set_config('pawos.web_chat_writer', 'on', true);

  insert into public.web_chat_messages (chat_id, user_id, role, content, request_id, surface, requires_desktop, created_at)
  values (v_chat_id, p_user_id, 'user', p_user_content, p_request_id, 'web', false, clock_timestamp())
  returning id into v_user_message_id;
  insert into public.web_chat_messages (chat_id, user_id, role, content, request_id, surface, requires_desktop, created_at)
  values (v_chat_id, p_user_id, 'assistant', p_assistant_content, p_request_id, 'web', coalesce(p_requires_desktop, false), clock_timestamp() + interval '1 millisecond');

  if p_attachment_id is not null then
    update public.web_chat_attachments
       set chat_id = v_chat_id, message_id = v_user_message_id
     where id = p_attachment_id and user_id = p_user_id and message_id is null;
    if not found then
      raise exception 'attachment_not_found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.web_chat_usage (user_id, messages_sent, updated_at)
  values (p_user_id, v_used + 1, now())
  on conflict (user_id) do update set messages_sent = greatest(public.web_chat_usage.messages_sent + 1, v_used + 1), updated_at = now();

  if p_request_id is not null then
    insert into public.web_chat_requests (user_id, request_id, chat_id, state, lease_expires_at, updated_at)
    values (p_user_id, p_request_id, v_chat_id, 'completed', now(), now())
    on conflict (user_id, request_id) do update set state = 'completed', chat_id = v_chat_id, error_code = null, updated_at = now();
  end if;

  perform set_config('pawos.web_chat_writer', '', true);

  return jsonb_build_object('chatId', v_chat_id, 'messagesUsed', v_used + 1, 'reply', p_assistant_content, 'duplicate', false);
end;
$$;

revoke all on function public.web_chat_append_exchange(uuid, uuid, text, text, integer, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.web_chat_append_exchange(uuid, uuid, text, text, integer, text, boolean, uuid) to service_role;
