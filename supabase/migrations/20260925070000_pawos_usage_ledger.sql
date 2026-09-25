-- Migration: 20260925070000_pawos_usage_ledger
--
-- Server copy of the desktop app's usage ledgers, so deleting or editing the local usage files
-- (billing/usage-events.json, billing/usage/<account>.json) no longer resets anyone's limits:
--   * DEVICE ledger  — free Paw Go usage, shared by every free account on one PC. Keyed by a SHA-256
--                      fingerprint of the machine's OS install id (never the raw id).
--   * ACCOUNT ledger — paid tiers and PawOS Build, keyed by the caller's own auth.uid() (the client
--                      never names an account), so it also follows the account across devices.
--
-- sync_usage_ledger() is the only entry point: the app uploads its new usage events and its cycle
-- anchors, and gets back the authoritative anchors plus every event from the last 40 days, which it
-- merges into its local ledger. Events are idempotent by id. Anchors can't be rewound:
--   * weekly_cycle_start_at, go_file_anchor_at — first value wins, never replaced;
--   * go_cycle_start_at (14 days), active_window_start_at (5 hours) — replaced only once the stored
--     cycle/window has actually ended, and only by a later start.

create table if not exists public.pawos_usage_ledger_events (
  ledger text not null,                 -- 'device:<sha256>' | 'account:<uuid>'
  id text not null,                     -- the app's event id (usageEventId / file-change id)
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('compute', 'file')),
  normalized_compute numeric not null default 0 check (normalized_compute >= 0 and normalized_compute <= 1000000),
  active_ms bigint not null default 0 check (active_ms >= 0 and active_ms <= 21600000),
  file_kind text check (file_kind in ('create', 'edit')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (ledger, id)
);
create index if not exists pawos_usage_ledger_events_recent_idx on public.pawos_usage_ledger_events (ledger, occurred_at desc);

create table if not exists public.pawos_usage_ledger_anchors (
  ledger text primary key,
  weekly_cycle_start_at timestamptz,
  active_window_start_at timestamptz,
  go_cycle_start_at timestamptz,
  go_file_anchor_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.pawos_usage_ledger_events enable row level security;
alter table public.pawos_usage_ledger_anchors enable row level security;
revoke all on public.pawos_usage_ledger_events from anon, authenticated;
revoke all on public.pawos_usage_ledger_anchors from anon, authenticated;

create or replace function public.pawos_ms_to_ts(p jsonb)
returns timestamptz
language sql
immutable
as $$
  select case when jsonb_typeof(p) = 'number' then to_timestamp((p::text)::numeric / 1000.0) else null end;
$$;

create or replace function public.pawos_ts_to_ms(p timestamptz)
returns jsonb
language sql
immutable
as $$
  select case when p is null then 'null'::jsonb else to_jsonb(round(extract(epoch from p) * 1000)::bigint) end;
$$;

-- p_scope: 'device' (with p_device = 64-hex fingerprint) or 'account' (the caller's own ledger).
-- p_anchors: { weeklyCycleStartAt, activeWindowStartAt, goCycleStartAt, goFileAnchorAt } — epoch ms.
-- p_events:  [{ id, kind: 'compute'|'file', normalizedCompute, activeMs, fileKind, at (epoch ms) }] ≤ 500.
create or replace function public.sync_usage_ledger(p_scope text, p_device text, p_anchors jsonb, p_events jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_ledger text;
  v_now timestamptz := now();
  v_a public.pawos_usage_ledger_anchors;
  v_in_weekly timestamptz := public.pawos_ms_to_ts(p_anchors -> 'weeklyCycleStartAt');
  v_in_window timestamptz := public.pawos_ms_to_ts(p_anchors -> 'activeWindowStartAt');
  v_in_go timestamptz := public.pawos_ms_to_ts(p_anchors -> 'goCycleStartAt');
  v_in_file timestamptz := public.pawos_ms_to_ts(p_anchors -> 'goFileAnchorAt');
  v_events jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_scope = 'account' then
    v_ledger := 'account:' || v_uid::text;
  elsif p_scope = 'device' and coalesce(p_device, '') ~ '^[0-9a-f]{64}$' then
    v_ledger := 'device:' || p_device;
  else
    raise exception 'invalid_scope' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_events, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_events, '[]'::jsonb)) > 500 then
    raise exception 'too_many_events' using errcode = '22023';
  end if;

  -- Anchors from the future are ignored (a clock set ahead can't pre-start cycles).
  if v_in_weekly > v_now + interval '10 minutes' then v_in_weekly := null; end if;
  if v_in_window > v_now + interval '10 minutes' then v_in_window := null; end if;
  if v_in_go > v_now + interval '10 minutes' then v_in_go := null; end if;
  if v_in_file > v_now + interval '10 minutes' then v_in_file := null; end if;

  insert into public.pawos_usage_ledger_anchors (ledger) values (v_ledger) on conflict (ledger) do nothing;
  select * into v_a from public.pawos_usage_ledger_anchors where ledger = v_ledger for update;

  update public.pawos_usage_ledger_anchors set
    weekly_cycle_start_at = coalesce(v_a.weekly_cycle_start_at, v_in_weekly),
    go_file_anchor_at = coalesce(v_a.go_file_anchor_at, v_in_file),
    go_cycle_start_at = case
      when v_a.go_cycle_start_at is null then v_in_go
      when v_in_go is not null and v_a.go_cycle_start_at + interval '14 days' <= v_now and v_in_go > v_a.go_cycle_start_at then v_in_go
      else v_a.go_cycle_start_at end,
    active_window_start_at = case
      when v_a.active_window_start_at is null then v_in_window
      when v_in_window is not null and v_a.active_window_start_at + interval '5 hours' <= v_now and v_in_window > v_a.active_window_start_at then v_in_window
      else v_a.active_window_start_at end,
    updated_at = v_now
  where ledger = v_ledger
  returning * into v_a;

  insert into public.pawos_usage_ledger_events (ledger, id, user_id, kind, normalized_compute, active_ms, file_kind, occurred_at)
  select
    v_ledger,
    left(e ->> 'id', 120),
    v_uid,
    e ->> 'kind',
    least(greatest(coalesce((e ->> 'normalizedCompute')::numeric, 0), 0), 1000000),
    least(greatest(coalesce((e ->> 'activeMs')::bigint, 0), 0), 21600000),
    case when e ->> 'kind' = 'file' and e ->> 'fileKind' in ('create', 'edit') then e ->> 'fileKind' else null end,
    public.pawos_ms_to_ts(e -> 'at')
  from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) as t(e)
  where coalesce(e ->> 'id', '') <> ''
    and e ->> 'kind' in ('compute', 'file')
    and jsonb_typeof(e -> 'at') = 'number'
    and public.pawos_ms_to_ts(e -> 'at') between v_now - interval '40 days' and v_now + interval '10 minutes'
  on conflict (ledger, id) do nothing;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'kind', x.kind, 'normalizedCompute', x.normalized_compute, 'activeMs', x.active_ms,
           'fileKind', x.file_kind, 'at', public.pawos_ts_to_ms(x.occurred_at)) order by x.occurred_at), '[]'::jsonb)
    into v_events
  from (
    select * from public.pawos_usage_ledger_events ev
    where ev.ledger = v_ledger and ev.occurred_at > v_now - interval '40 days'
    order by ev.occurred_at desc
    limit 5000
  ) x;

  return jsonb_build_object(
    'anchors', jsonb_build_object(
      'weeklyCycleStartAt', public.pawos_ts_to_ms(v_a.weekly_cycle_start_at),
      'activeWindowStartAt', public.pawos_ts_to_ms(v_a.active_window_start_at),
      'goCycleStartAt', public.pawos_ts_to_ms(v_a.go_cycle_start_at),
      'goFileAnchorAt', public.pawos_ts_to_ms(v_a.go_file_anchor_at)),
    'events', v_events,
    'serverNow', public.pawos_ts_to_ms(v_now)
  );
end;
$$;

revoke all on function public.pawos_ms_to_ts(jsonb) from public, anon, authenticated;
revoke all on function public.pawos_ts_to_ms(timestamptz) from public, anon, authenticated;
revoke all on function public.sync_usage_ledger(text, text, jsonb, jsonb) from public, anon;
grant execute on function public.sync_usage_ledger(text, text, jsonb, jsonb) to authenticated;
