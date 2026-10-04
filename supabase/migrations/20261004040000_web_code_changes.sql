-- PawOS Web — code changes pushed from the web, and per-period Web message caps.
--
-- 1. Message caps over a window. web_chat_begin_request / web_chat_append_exchange gain
--    p_limit_window_days: null keeps the lifetime cap (Paw Go: 4 messages ever); a number caps
--    messages in a rolling window of that many days (a weekly cap is 7). The window count reads the
--    request ledger (web_chat_requests, completed rows), which cannot be written or deleted from
--    outside these functions — so deleting chats never gives messages back, for either cap.
-- 2. web_code_changes: one row per code change made from PawOS Web — the repository, the commit
--    pushed, the live task steps the user sees, the preview deployment and checks, and automatic
--    fix attempts. Written only by pawos-web's server (service role); the owner can read their own.
--    Nothing here is a credential.
--
-- Run AFTER 20261004020000_web_tier_architecture.sql and 20261004030000_web_repository_selection.sql.
-- Deploy it BEFORE the pawos-web build that passes p_limit_window_days.

-- ── 1. The ledger is permanent while the account exists ────────────────────────────────────────
create or replace function public.pawos_web_chat_writer_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    -- The counter and the ledger can only disappear together with their account (the auth.users cascade).
    if tg_table_name in ('web_chat_usage', 'web_chat_requests') and exists (select 1 from auth.users where id = old.user_id) then
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

drop trigger if exists web_chat_requests_writer_guard on public.web_chat_requests;
create trigger web_chat_requests_writer_guard
  before insert or update or delete on public.web_chat_requests
  for each row execute function public.pawos_web_chat_writer_guard();

-- ── 2. Messages used, over a lifetime or a window ──────────────────────────────────────────────
drop function if exists public.pawos_web_chat_messages_used(uuid);

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
      (select count(*)::integer from public.web_chat_messages where user_id = p_user_id and role = 'user')
    )
    else (
      select count(*)::integer from public.web_chat_requests
      where user_id = p_user_id and state = 'completed'
        and updated_at > now() - make_interval(days => greatest(1, p_window_days))
    )
  end;
$$;

revoke all on function public.pawos_web_chat_messages_used(uuid, integer) from public, anon, authenticated;
grant execute on function public.pawos_web_chat_messages_used(uuid, integer) to service_role;

-- ── 3. Claim and store, with the window ─────────────────────────────────────────────────────────
drop function if exists public.web_chat_begin_request(uuid, text, uuid, integer, integer);

create or replace function public.web_chat_begin_request(
  p_user_id uuid,
  p_request_id text,
  p_chat_id uuid,
  p_message_limit integer,
  p_lease_seconds integer default 150,
  p_limit_window_days integer default null
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
  end if;

  if p_chat_id is not null and not exists (select 1 from public.web_chats where id = p_chat_id and user_id = p_user_id) then
    raise exception 'chat_not_found' using errcode = 'P0002';
  end if;

  v_used := public.pawos_web_chat_messages_used(p_user_id, p_limit_window_days);
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

revoke all on function public.web_chat_begin_request(uuid, text, uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.web_chat_begin_request(uuid, text, uuid, integer, integer, integer) to service_role;

drop function if exists public.web_chat_append_exchange(uuid, uuid, text, text, integer, text, boolean, uuid);

create or replace function public.web_chat_append_exchange(
  p_user_id uuid,
  p_chat_id uuid,
  p_user_content text,
  p_assistant_content text,
  p_message_limit integer,
  p_request_id text default null,
  p_requires_desktop boolean default false,
  p_attachment_id uuid default null,
  p_limit_window_days integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_lifetime integer;
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

  v_used := public.pawos_web_chat_messages_used(p_user_id, p_limit_window_days);
  v_lifetime := public.pawos_web_chat_messages_used(p_user_id, null);

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
  values (p_user_id, v_lifetime + 1, now())
  on conflict (user_id) do update set messages_sent = greatest(public.web_chat_usage.messages_sent + 1, v_lifetime + 1), updated_at = now();

  if p_request_id is not null then
    insert into public.web_chat_requests (user_id, request_id, chat_id, state, lease_expires_at, updated_at)
    values (p_user_id, p_request_id, v_chat_id, 'completed', now(), now())
    on conflict (user_id, request_id) do update set state = 'completed', chat_id = v_chat_id, error_code = null, updated_at = now();
  end if;

  perform set_config('pawos.web_chat_writer', '', true);

  return jsonb_build_object('chatId', v_chat_id, 'messagesUsed', v_used + 1, 'reply', p_assistant_content, 'duplicate', false);
end;
$$;

revoke all on function public.web_chat_append_exchange(uuid, uuid, text, text, integer, text, boolean, uuid, integer) from public, anon, authenticated;
grant execute on function public.web_chat_append_exchange(uuid, uuid, text, text, integer, text, boolean, uuid, integer) to service_role;

-- ── 4. Code changes made from PawOS Web ─────────────────────────────────────────────────────────
create table if not exists public.web_code_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The chat request that made it (one change per request).
  request_id text not null check (request_id ~ '^[A-Za-z0-9-]{8,64}$'),
  chat_id uuid references public.web_chats(id) on delete set null,
  repository text not null check (repository ~ '^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$'),
  -- 'small' (frontend text/markup tweaks) or 'full' (frontend and backend), from the plan.
  scope text not null check (scope in ('small', 'full')),
  -- The branch the change was pushed to: the default branch, or a fallback branch if GitHub refused that.
  branch text,
  commit_sha text,
  pull_request_url text,
  state text not null default 'running' check (state in ('running', 'pushed', 'fixing', 'done', 'failed')),
  -- The task list the user sees: [{ id, label, status, detail }].
  steps jsonb not null default '[]'::jsonb,
  files jsonb not null default '[]'::jsonb,
  summary text,
  preview_url text check (preview_url is null or preview_url ~ '^https://'),
  checks_state text not null default 'pending' check (checks_state in ('pending', 'success', 'failure', 'none')),
  fix_attempts integer not null default 0 check (fix_attempts >= 0),
  fix_lease_until timestamptz,
  pushed_at timestamptz,
  last_checked_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, request_id)
);

create index if not exists idx_web_code_changes_user on public.web_code_changes (user_id, created_at desc);
create index if not exists idx_web_code_changes_chat on public.web_code_changes (chat_id, created_at desc);

alter table public.web_code_changes enable row level security;

drop policy if exists web_code_changes_select_own on public.web_code_changes;
create policy web_code_changes_select_own on public.web_code_changes
  for select using (user_id = auth.uid());
-- No insert/update/delete policies: only pawos-web's server writes it, with the service role.

-- Claims one automatic fix attempt for a change, atomically: true when this caller may run the fix
-- now. Several open tabs (or a phone and a computer) watching the same change can never start two
-- fixes at once, and a change is never fixed more than p_max_attempts times.
create or replace function public.web_code_change_claim_fix(p_change_id uuid, p_user_id uuid, p_max_attempts integer, p_lease_seconds integer default 180)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'unauthorized: backend-only operation' using errcode = '42501';
  end if;
  update public.web_code_changes
     set fix_attempts = fix_attempts + 1,
         fix_lease_until = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 180), 600))),
         state = 'fixing',
         updated_at = now()
   where id = p_change_id
     and user_id = p_user_id
     and state in ('pushed', 'fixing')
     and fix_attempts < p_max_attempts
     and (fix_lease_until is null or fix_lease_until < now());
  return found;
end;
$$;

revoke all on function public.web_code_change_claim_fix(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.web_code_change_claim_fix(uuid, uuid, integer, integer) to service_role;
