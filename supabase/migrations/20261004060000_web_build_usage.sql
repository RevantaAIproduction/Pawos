-- Migration: 20261004060000_web_build_usage
--
-- The Paw Compute each PawOS Web message uses on the admin-granted access tier, so its Web
-- messages stay WITHIN that tier's included allowance (the weekly and 5-hour Paw Compute limits
-- PawOS Desktop enforces) instead of adding to it. PawOS Web adds the latest PawOS Desktop usage
-- report (pawos_build_usage_reports) to the rows here and refuses a message once the limit is
-- reached. Rows are written by the pawos-web server (service role) after each model call, priced
-- from public.model_prices; nobody else can read or write them.
--
-- Additive only: no existing table or function changes. Deploy BEFORE the pawos-web build that
-- writes these rows.

create table if not exists public.web_build_usage (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_key text not null check (char_length(request_key) between 1 and 200),
  pc numeric(14, 4) not null check (pc >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  created_at timestamptz not null default now(),
  constraint web_build_usage_request_key unique (user_id, request_key)
);
create index if not exists web_build_usage_user_time on public.web_build_usage (user_id, created_at desc);

alter table public.web_build_usage enable row level security;
revoke all on public.web_build_usage from public, anon, authenticated;
grant select, insert on public.web_build_usage to service_role;
grant usage, select on sequence public.web_build_usage_id_seq to service_role;
