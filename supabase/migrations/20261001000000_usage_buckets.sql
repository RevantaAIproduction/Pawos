-- Migration: 20261001000000_usage_buckets
--
-- Server-authoritative usage buckets for normal (non-autonomous) Gemini usage.
--
-- Every source of paid usage is its own bucket — a monthly plan period, a mid-month purchase, or a
-- credit purchase — never merged into one balance. Each bucket has a CUSTOMER value ($1 = 100 PC,
-- the only thing a customer ever sees) and a PRIVATE provider-cost allowance in micro-USD (never
-- returned to a customer). Every Gemini call is funded by exactly ONE bucket:
--
--   reserve_usage()  — before the call: picks the bucket (monthly_plan → mid_month_purchase →
--                      purchased_credits), prices the worst case (exact input tokens + the granted
--                      maxOutputTokens; thinking is inside maxOutputTokens) and holds it atomically.
--   settle_usage()   — after the call: prices the real usageMetadata with the same price version,
--                      charges min(actual, reserved) to that one bucket and releases the rest.
--
-- Invariants enforced by the database itself (CHECK constraints), so no code path can break them:
--   consumed >= 0, reserved >= 0, consumed + reserved <= private allowance — a bucket never goes
--   negative and there is no overage balance. A real cost above its reservation is recorded in
--   usage_accounting_discrepancies (internal only) and trips the per-model circuit breaker.
--
-- Autonomous billing (Ticket Balance, autonomous reservations/runs) and Team/Enterprise pooled usage
-- are NOT touched by this migration.
--
-- Legacy purchased credits (user_usage_credits): deduct_usage_credits() is frozen here, new credit
-- purchases (add_usage_credits_service) now create a purchased_credits bucket, and existing balances
-- move to buckets only through migrate_legacy_usage_credits() — dry run by default, run separately.

-- ── 0. Subscription period start (lets plan buckets follow Razorpay's real cycle) ──────────────
alter table public.pawos_subscriptions add column if not exists current_period_start timestamptz;

-- ── 1. Private, versioned model prices ─────────────────────────────────────────────────────────
-- Prices are USD per 1,000,000 tokens — which is exactly micro-USD per token, so
-- cost_micro_usd = tokens × price. Long-context prices apply when the prompt exceeds
-- long_context_threshold_tokens (Gemini Pro: > 200K tokens). A row with effective_until set stops
-- pricing at that moment — reservations for the model then fail closed until a new row exists.
create table if not exists public.model_prices (
  id bigserial primary key,
  provider text not null default 'gemini' check (provider = 'gemini'),
  model text not null,
  version integer not null check (version > 0),
  input_usd_per_mtok numeric(12, 6) not null check (input_usd_per_mtok > 0),
  cached_input_usd_per_mtok numeric(12, 6) not null check (cached_input_usd_per_mtok >= 0),
  output_usd_per_mtok numeric(12, 6) not null check (output_usd_per_mtok > 0),
  long_context_threshold_tokens integer check (long_context_threshold_tokens > 0),
  long_input_usd_per_mtok numeric(12, 6),
  long_cached_input_usd_per_mtok numeric(12, 6),
  long_output_usd_per_mtok numeric(12, 6),
  effective_from timestamptz not null,
  effective_until timestamptz,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  unique (provider, model, version),
  check (
    long_context_threshold_tokens is null
    or (long_input_usd_per_mtok > 0 and long_cached_input_usd_per_mtok >= 0 and long_output_usd_per_mtok > 0)
  ),
  check (effective_until is null or effective_until > effective_from)
);

-- Seeded from the app's existing sourced price table (src/main/billing/PawComputeConfigStore.ts,
-- Google's published pricing checked 2026-08-18). Flash / Flash-Lite prices are published as current
-- through 2026-12-31, so those rows end there: add version-2 rows before 2027-01-01 or reservations
-- for those models stop (fail closed) rather than under-price.
insert into public.model_prices
  (model, version, input_usd_per_mtok, cached_input_usd_per_mtok, output_usd_per_mtok,
   long_context_threshold_tokens, long_input_usd_per_mtok, long_cached_input_usd_per_mtok, long_output_usd_per_mtok,
   effective_from, effective_until, note)
values
  ('gemini-3.5-flash-lite',    1, 0.30, 0.03,  2.50, null, null, null, null, '2026-01-01', '2027-01-01', 'Flash-Lite; published through 2026-12-31'),
  ('gemini-flash-lite-latest', 1, 0.30, 0.03,  2.50, null, null, null, null, '2026-01-01', '2027-01-01', 'Flash-Lite alias; published through 2026-12-31'),
  ('gemini-flash-latest',      1, 0.75, 0.075, 3.75, null, null, null, null, '2026-01-01', '2027-01-01', 'Flash alias; published through 2026-12-31'),
  ('gemini-3.6-flash',         1, 1.50, 0.15,  7.50, null, null, null, null, '2026-01-01', '2027-01-01', 'Flash; published through 2026-12-31'),
  ('gemini-3.1-pro-preview',   1, 2.00, 0.20, 12.00, 200000, 4.00, 0.40, 18.00, '2026-01-01', null, 'Pro; >200K-token prompts use the long-context rates'),
  ('gemini-pro-latest',        1, 2.00, 0.20, 12.00, 200000, 4.00, 0.40, 18.00, '2026-01-01', null, 'Pro alias; >200K-token prompts use the long-context rates')
on conflict (provider, model, version) do nothing;

-- ── 2. Products (private economics, server-only) — the ONLY source of product economics ─────────
-- Every amount below is configuration. The engine reads products by key and never by tier name, so
-- a new plan, extra-usage pack or credits product is a new row here — no code or schema change.
--
--   subscription_plan_key    monthly_plan: the subscription it funds — the subscription's tier, plus
--                            ':' and its variant when it has one (e.g. 'pro', 'proMax:5x').
--   extra_usage_product_key  monthly_plan: the mid_month_purchase product sold on top of it.
--   expiry_policy            'period' (the plan's paid period), 'parent_period' (ends with the plan
--                            bucket it extends), 'never'.
--   bucket_interval_months   monthly_plan: one bucket per this many months of the paid period (a
--                            yearly subscription gets a fresh bucket each interval).
--   rank                     ordering between products (which plan an extra-usage offer extends).
--   customer_value_cents     customer-facing value; customer PC = cents ($1 = 100 PC).
--   private_allowance_micro_usd / weekly_pacing_micro_usd / allowance_ratio — PRIVATE, never shown.
create table if not exists public.usage_bucket_products (
  product_key text primary key,
  source_type text not null check (source_type in ('monthly_plan', 'mid_month_purchase', 'purchased_credits')),
  subscription_plan_key text unique,
  extra_usage_product_key text references public.usage_bucket_products(product_key),
  expiry_policy text not null check (expiry_policy in ('period', 'parent_period', 'never')),
  bucket_interval_months integer check (bucket_interval_months > 0),
  rank integer not null default 0,
  customer_value_cents integer check (customer_value_cents > 0),
  private_allowance_micro_usd bigint check (private_allowance_micro_usd > 0),
  weekly_pacing_micro_usd bigint check (weekly_pacing_micro_usd > 0),
  allowance_ratio numeric(6, 4) check (allowance_ratio > 0 and allowance_ratio <= 1),
  label text not null,
  active boolean not null default true,
  check (
    (source_type = 'purchased_credits' and allowance_ratio is not null and customer_value_cents is null and private_allowance_micro_usd is null
       and weekly_pacing_micro_usd is null and subscription_plan_key is null and extra_usage_product_key is null)
    or (source_type = 'monthly_plan' and subscription_plan_key is not null and bucket_interval_months is not null and expiry_policy = 'period'
       and customer_value_cents is not null and private_allowance_micro_usd is not null)
    or (source_type = 'mid_month_purchase' and customer_value_cents is not null and private_allowance_micro_usd is not null
       and weekly_pacing_micro_usd is null and subscription_plan_key is null and extra_usage_product_key is null)
  )
);

-- Current product records (2026-10-01). Extra-usage products first (plans reference them).
insert into public.usage_bucket_products
  (product_key, source_type, subscription_plan_key, extra_usage_product_key, expiry_policy, bucket_interval_months, rank,
   customer_value_cents, private_allowance_micro_usd, weekly_pacing_micro_usd, allowance_ratio, label)
values
  ('pro_mid_month',         'mid_month_purchase', null,         null,                    'parent_period', null, 10, 1500,  9000000,   null,     null, 'Pro extra usage'),
  ('pro_max_5x_mid_month',  'mid_month_purchase', null,         null,                    'parent_period', null, 20, 5000,  30000000,  null,     null, 'Pro Max 5x extra usage'),
  ('pro_max_20x_mid_month', 'mid_month_purchase', null,         null,                    'parent_period', null, 30, 17500, 105000000, null,     null, 'Pro Max 20x extra usage'),
  ('pro_monthly',           'monthly_plan',       'pro',        'pro_mid_month',         'period',        1,    10, 2000,  10000000,  5000000,  null, 'Pro plan'),
  ('pro_max_5x_monthly',    'monthly_plan',       'proMax:5x',  'pro_max_5x_mid_month',  'period',        1,    20, 10000, 50000000,  25000000, null, 'Pro Max 5x plan'),
  ('pro_max_20x_monthly',   'monthly_plan',       'proMax:20x', 'pro_max_20x_mid_month', 'period',        1,    30, 25000, 125000000, 62500000, null, 'Pro Max 20x plan'),
  ('credits',               'purchased_credits',  null,         null,                    'never',         null, 0,  null,  null,      null,     0.70, 'Credits')
on conflict (product_key) do nothing;

-- Engine safety settings (not pricing; never shown to customers). Exactly one row.
create table if not exists public.usage_engine_settings (
  id boolean primary key default true check (id),
  min_output_tokens integer not null check (min_output_tokens > 0),
  max_output_tokens integer not null,
  reservation_timeout interval not null check (reservation_timeout > interval '0'),
  breaker_single_discrepancy_micro_usd bigint not null check (breaker_single_discrepancy_micro_usd >= 0),
  breaker_aggregate_discrepancy_ratio numeric(8, 6) not null check (breaker_aggregate_discrepancy_ratio >= 0),
  check (max_output_tokens >= min_output_tokens)
);
-- Approved values: 1,024 / 8,000 output tokens, 10-minute reservations, breaker at a single
-- discrepancy over $0.001 or aggregate discrepancy over 0.5% of reserved.
insert into public.usage_engine_settings values (true, 1024, 8000, interval '10 minutes', 1000, 0.005)
on conflict (id) do nothing;

-- Subscriptions may carry any tier / variant the product configuration knows about.
do $$
declare
  v_name text;
begin
  for v_name in
    select con.conname from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and rel.relname = 'pawos_subscriptions' and con.contype = 'c'
      and (pg_get_constraintdef(con.oid) ~* '\mtier\M' or pg_get_constraintdef(con.oid) ~* 'pro_max_variant')
  loop
    execute format('alter table public.pawos_subscriptions drop constraint %I', v_name);
  end loop;
end
$$;

-- ── 3. Buckets ─────────────────────────────────────────────────────────────────────────────────
create table if not exists public.usage_buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid,                                  -- reserved; personal buckets only today
  source_type text not null check (source_type in ('monthly_plan', 'mid_month_purchase', 'purchased_credits')),
  product_key text not null references public.usage_bucket_products(product_key),
  purchase_ref text not null unique,                     -- idempotency key of what created it
  subscription_id text,                                  -- monthly_plan: the Razorpay subscription
  parent_plan_bucket_id uuid references public.usage_buckets(id),
  customer_value_cents integer not null check (customer_value_cents > 0),
  customer_pc integer not null check (customer_pc > 0),
  private_allowance_micro_usd bigint not null check (private_allowance_micro_usd > 0),
  consumed_micro_usd bigint not null default 0,
  reserved_micro_usd bigint not null default 0,
  weekly_pacing_micro_usd bigint check (weekly_pacing_micro_usd > 0),
  period_start timestamptz not null,
  period_end timestamptz,
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'exhausted', 'expired', 'revoked')),
  revoked_at timestamptz,
  revoke_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usage_buckets_consumed_nonnegative check (consumed_micro_usd >= 0),
  constraint usage_buckets_reserved_nonnegative check (reserved_micro_usd >= 0),
  constraint usage_buckets_no_overdraw check (consumed_micro_usd + reserved_micro_usd <= private_allowance_micro_usd),
  constraint usage_buckets_pc_is_customer_value check (customer_pc = customer_value_cents), -- $1 = 100 PC
  constraint usage_buckets_shape check (
    (source_type = 'monthly_plan' and expires_at is not null and subscription_id is not null and parent_plan_bucket_id is null)
    or (source_type = 'mid_month_purchase' and parent_plan_bucket_id is not null and weekly_pacing_micro_usd is null)
    or (source_type = 'purchased_credits' and weekly_pacing_micro_usd is null and parent_plan_bucket_id is null)
  )
);
create index if not exists usage_buckets_user_idx on public.usage_buckets (user_id, status, source_type, created_at);
create index if not exists usage_buckets_subscription_idx on public.usage_buckets (subscription_id, period_start);

create table if not exists public.usage_bucket_reservations (
  id uuid primary key default gen_random_uuid(),
  bucket_id uuid not null references public.usage_buckets(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_key text not null,
  model text not null,
  price_id bigint not null references public.model_prices(id),
  category text not null,
  input_tokens integer not null check (input_tokens >= 0),
  input_is_upper_bound boolean not null,
  long_context boolean not null,
  granted_max_output_tokens integer not null check (granted_max_output_tokens > 0),
  reserved_micro_usd bigint not null check (reserved_micro_usd > 0),
  week_index integer,
  state text not null default 'held' check (state in ('held', 'settled', 'released', 'expired_settled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  unique (user_id, request_key)
);
create index if not exists usage_bucket_reservations_held_idx on public.usage_bucket_reservations (bucket_id, state, week_index);
create index if not exists usage_bucket_reservations_expiry_idx on public.usage_bucket_reservations (state, expires_at);

create table if not exists public.usage_bucket_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_event_id text not null,
  bucket_id uuid not null references public.usage_buckets(id),
  reservation_id uuid not null unique references public.usage_bucket_reservations(id),
  model text not null,
  price_id bigint not null references public.model_prices(id),
  prompt_tokens integer not null default 0,
  candidates_tokens integer not null default 0,
  cached_tokens integer not null default 0,
  thoughts_tokens integer not null default 0,
  actual_cost_micro_usd bigint not null check (actual_cost_micro_usd >= 0),
  charged_micro_usd bigint not null check (charged_micro_usd >= 0),
  week_index integer,
  category text not null,
  settlement text not null check (settlement in ('reported', 'timeout')),
  created_at timestamptz not null default now(),
  primary key (user_id, usage_event_id)
);
create index if not exists usage_bucket_events_week_idx on public.usage_bucket_events (bucket_id, week_index);
create index if not exists usage_bucket_events_user_time_idx on public.usage_bucket_events (user_id, created_at desc);

create table if not exists public.usage_accounting_discrepancies (
  id bigserial primary key,
  reservation_id uuid not null references public.usage_bucket_reservations(id),
  bucket_id uuid not null references public.usage_buckets(id),
  model text not null,
  price_id bigint not null references public.model_prices(id),
  reserved_micro_usd bigint not null,
  actual_cost_micro_usd bigint not null,
  charged_micro_usd bigint not null,
  delta_micro_usd bigint not null check (delta_micro_usd > 0),
  created_at timestamptz not null default now()
);

-- Per-model circuit breaker: running totals since the last reset. Trips when one discrepancy is
-- above $0.001 (1,000 micro-USD) or total discrepancy exceeds 0.5% of total reserved.
create table if not exists public.usage_model_circuit_breakers (
  model text primary key,
  tripped boolean not null default false,
  trip_reason text,
  tripped_at timestamptz,
  total_reserved_micro_usd bigint not null default 0,
  total_discrepancy_micro_usd bigint not null default 0,
  reset_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_bucket_revocations (
  id bigserial primary key,
  bucket_id uuid not null references public.usage_buckets(id),
  reason text not null,
  payment_ref text,
  unused_micro_usd bigint not null,
  created_at timestamptz not null default now()
);

-- Legacy wallet migration audit (one row per migrated user_usage_credits wallet).
alter table public.user_usage_credits add column if not exists migrated_at timestamptz;
alter table public.user_usage_credits add column if not exists migrated_bucket_id uuid;
alter table public.user_usage_credits add column if not exists legacy_balance_usd_at_migration numeric(14, 6);

create table if not exists public.legacy_usage_credit_migrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  legacy_balance_usd numeric(14, 6) not null,
  bucket_id uuid not null references public.usage_buckets(id),
  customer_value_cents integer not null,
  private_allowance_micro_usd bigint not null,
  migrated_at timestamptz not null default now()
);

-- Nobody reads or writes any of this directly — only the SECURITY DEFINER functions below.
alter table public.model_prices enable row level security;
alter table public.usage_bucket_products enable row level security;
alter table public.usage_buckets enable row level security;
alter table public.usage_bucket_reservations enable row level security;
alter table public.usage_bucket_events enable row level security;
alter table public.usage_accounting_discrepancies enable row level security;
alter table public.usage_model_circuit_breakers enable row level security;
alter table public.usage_bucket_revocations enable row level security;
alter table public.legacy_usage_credit_migrations enable row level security;
alter table public.usage_engine_settings enable row level security;
revoke all on public.usage_engine_settings from anon, authenticated;
revoke all on public.model_prices, public.usage_bucket_products, public.usage_buckets, public.usage_bucket_reservations,
  public.usage_bucket_events, public.usage_accounting_discrepancies, public.usage_model_circuit_breakers,
  public.usage_bucket_revocations, public.legacy_usage_credit_migrations from anon, authenticated;

-- ── 4. Internal helpers (not callable by clients) ──────────────────────────────────────────────
create or replace function public.pawos_bucket_priority(p_source_type text)
returns integer language sql immutable as $$
  select case p_source_type when 'monthly_plan' then 1 when 'mid_month_purchase' then 2 else 3 end;
$$;

create or replace function public.pawos_week_index(p_period_start timestamptz, p_at timestamptz)
returns integer language sql immutable as $$
  select greatest(0, floor(extract(epoch from (p_at - p_period_start)) / 604800))::integer;
$$;

create or replace function public.pawos_engine_settings()
returns public.usage_engine_settings language sql stable security definer set search_path = public as $$
  select * from public.usage_engine_settings where id;
$$;

-- The configuration key a subscription maps to: its tier, plus ':' and its variant when it has one.
create or replace function public.pawos_subscription_plan_key(p_tier text, p_variant text)
returns text language sql immutable as $$
  select p_tier || coalesce(':' || nullif(p_variant, ''), '');
$$;

-- When a bucket expires, from its product's expiry policy.
create or replace function public.pawos_bucket_expiry(p_policy text, p_period_end timestamptz, p_parent_expires timestamptz)
returns timestamptz language sql immutable as $$
  select case p_policy when 'period' then p_period_end when 'parent_period' then p_parent_expires else null end;
$$;

create or replace function public.pawos_model_price(p_model text, p_at timestamptz)
returns public.model_prices
language sql stable security definer set search_path = public as $$
  select * from public.model_prices p
  where p.provider = 'gemini' and p.model = p_model and p.active
    and p.effective_from <= p_at and (p.effective_until is null or p.effective_until > p_at)
  order by p.version desc
  limit 1;
$$;

-- Cost of a call in micro-USD, rounded UP to the next micro-USD.
create or replace function public.pawos_price_tokens(
  p_price public.model_prices, p_fresh_input bigint, p_cached_input bigint, p_output bigint, p_long boolean
) returns bigint language sql immutable as $$
  select ceil(
    greatest(p_fresh_input, 0) * (case when p_long then p_price.long_input_usd_per_mtok else p_price.input_usd_per_mtok end)
    + greatest(p_cached_input, 0) * (case when p_long then p_price.long_cached_input_usd_per_mtok else p_price.cached_input_usd_per_mtok end)
    + greatest(p_output, 0) * (case when p_long then p_price.long_output_usd_per_mtok else p_price.output_usd_per_mtok end)
  )::bigint;
$$;

-- Smallest useful call at the cheapest current price: 1,024 output tokens. A bucket whose remaining
-- allowance is below this can never fund anything again and is marked exhausted.
create or replace function public.pawos_min_viable_micro_usd()
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(ceil((select min_output_tokens from public.usage_engine_settings where id) * min(p.output_usd_per_mtok))::bigint, 1)
  from public.model_prices p
  where p.active and p.effective_from <= now() and (p.effective_until is null or p.effective_until > now());
$$;

-- What a plan bucket has used in one pacing week (settled charges + calls still in flight).
create or replace function public.pawos_bucket_week_used(p_bucket_id uuid, p_week integer)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select sum(e.charged_micro_usd) from public.usage_bucket_events e where e.bucket_id = p_bucket_id and e.week_index = p_week), 0)
       + coalesce((select sum(r.reserved_micro_usd) from public.usage_bucket_reservations r where r.bucket_id = p_bucket_id and r.state = 'held' and r.week_index = p_week), 0);
$$;

-- Creates the current period's plan bucket for each of the user's paid subscriptions (idempotent).
-- Monthly plans: one bucket per Razorpay cycle. Pro yearly: one Pro-monthly bucket per month of the
-- paid year. Never creates a second bucket for a subscription while one already covers `now`, and a
-- new bucket never starts before the previous one for that subscription ends.
create or replace function public.pawos_ensure_plan_buckets(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_now timestamptz := now();
  s record;
  v_product public.usage_bucket_products;
  v_cycle_start timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_months integer;
  v_slices integer;
  v_last_end timestamptz;
begin
  for s in
    select * from public.pawos_subscriptions ps
    where ps.user_id = p_user_id
      and ps.status in ('active', 'authenticated', 'pending', 'cancelled', 'completed')
      and ps.current_period_end > v_now
  loop
    -- Which product funds this subscription comes only from configuration.
    select * into v_product from public.usage_bucket_products p
    where p.source_type = 'monthly_plan' and p.active
      and p.subscription_plan_key = public.pawos_subscription_plan_key(s.tier, s.pro_max_variant);
    if v_product.product_key is null then continue; end if;

    if exists (
      select 1 from public.usage_buckets b
      where b.subscription_id = s.id and b.source_type = 'monthly_plan'
        and b.period_start <= v_now and b.expires_at > v_now
    ) then
      continue;
    end if;

    -- The paid cycle, cut into buckets of bucket_interval_months (a yearly subscription with a
    -- 1-month product gets one bucket per month; a monthly one gets one per cycle).
    v_cycle_start := coalesce(s.current_period_start,
                              s.current_period_end - case when s.billing_frequency = 'yearly' then interval '1 year' else interval '1 month' end);
    v_months := (extract(year from age(v_now, v_cycle_start)) * 12 + extract(month from age(v_now, v_cycle_start)))::integer;
    v_slices := greatest(v_months, 0) / v_product.bucket_interval_months;
    v_start := v_cycle_start + make_interval(months => v_slices * v_product.bucket_interval_months);
    v_end := least(v_start + make_interval(months => v_product.bucket_interval_months), s.current_period_end);

    select max(b.expires_at) into v_last_end from public.usage_buckets b
    where b.subscription_id = s.id and b.source_type = 'monthly_plan';
    if v_last_end is not null and v_last_end > v_start then v_start := v_last_end; end if;
    if v_start > v_now or v_end <= v_now or v_end <= v_start then continue; end if;

    insert into public.usage_buckets (
      user_id, source_type, product_key, purchase_ref, subscription_id,
      customer_value_cents, customer_pc, private_allowance_micro_usd, weekly_pacing_micro_usd,
      period_start, period_end, expires_at, metadata
    ) values (
      p_user_id, 'monthly_plan', v_product.product_key,
      'sub:' || s.id || ':' || floor(extract(epoch from v_start))::bigint::text,
      s.id, v_product.customer_value_cents, v_product.customer_value_cents, v_product.private_allowance_micro_usd,
      v_product.weekly_pacing_micro_usd, v_start, v_end, public.pawos_bucket_expiry(v_product.expiry_policy, v_end, null),
      jsonb_build_object('billing_frequency', s.billing_frequency)
    ) on conflict (purchase_ref) do nothing;
  end loop;
end;
$$;

-- Settles one held reservation. p_usage NULL = the call made no billable usage (release).
-- Charges min(actual, reserved) to the reservation's own bucket, never another bucket.
create or replace function public.pawos_close_reservation(
  p_reservation_id uuid, p_usage_event_id text,
  p_prompt bigint, p_candidates bigint, p_cached bigint, p_thoughts bigint,
  p_mode text  -- 'reported' | 'release' | 'timeout'
) returns void language plpgsql security definer set search_path = public, auth as $$
declare
  r public.usage_bucket_reservations;
  v_price public.model_prices;
  v_long boolean;
  v_actual bigint;
  v_charged bigint;
  v_delta bigint;
  v_breaker public.usage_model_circuit_breakers;
  v_settings public.usage_engine_settings := public.pawos_engine_settings();
begin
  select * into r from public.usage_bucket_reservations where id = p_reservation_id for update;
  if r.id is null or r.state <> 'held' then return; end if;

  if p_mode = 'release' then
    update public.usage_buckets set reserved_micro_usd = reserved_micro_usd - r.reserved_micro_usd, updated_at = now()
    where id = r.bucket_id;
    update public.usage_bucket_reservations set state = 'released', closed_at = now() where id = r.id;
    return;
  end if;

  if p_mode = 'timeout' then
    -- No usage ever arrived: charge the full worst-case hold (skipping settlement never saves money).
    v_actual := r.reserved_micro_usd;
  else
    select * into v_price from public.model_prices where id = r.price_id;
    v_long := v_price.long_context_threshold_tokens is not null and p_prompt > v_price.long_context_threshold_tokens;
    v_actual := public.pawos_price_tokens(v_price, greatest(p_prompt - p_cached, 0), least(p_cached, p_prompt), p_candidates + p_thoughts, v_long);
  end if;

  v_charged := least(v_actual, r.reserved_micro_usd);

  update public.usage_buckets
  set consumed_micro_usd = consumed_micro_usd + v_charged,
      reserved_micro_usd = reserved_micro_usd - r.reserved_micro_usd,
      updated_at = now()
  where id = r.bucket_id;

  insert into public.usage_bucket_events (
    user_id, usage_event_id, bucket_id, reservation_id, model, price_id,
    prompt_tokens, candidates_tokens, cached_tokens, thoughts_tokens,
    actual_cost_micro_usd, charged_micro_usd, week_index, category, settlement
  ) values (
    r.user_id, p_usage_event_id, r.bucket_id, r.id, r.model, r.price_id,
    coalesce(p_prompt, 0), coalesce(p_candidates, 0), coalesce(p_cached, 0), coalesce(p_thoughts, 0),
    v_actual, v_charged, r.week_index, r.category, case when p_mode = 'timeout' then 'timeout' else 'reported' end
  );

  update public.usage_bucket_reservations
  set state = case when p_mode = 'timeout' then 'expired_settled' else 'settled' end, closed_at = now()
  where id = r.id;

  -- Circuit breaker running totals for this model.
  v_delta := greatest(v_actual - r.reserved_micro_usd, 0);
  insert into public.usage_model_circuit_breakers (model) values (r.model) on conflict (model) do nothing;
  update public.usage_model_circuit_breakers
  set total_reserved_micro_usd = total_reserved_micro_usd + r.reserved_micro_usd,
      total_discrepancy_micro_usd = total_discrepancy_micro_usd + v_delta,
      updated_at = now()
  where model = r.model
  returning * into v_breaker;

  if v_delta > 0 then
    insert into public.usage_accounting_discrepancies (reservation_id, bucket_id, model, price_id, reserved_micro_usd, actual_cost_micro_usd, charged_micro_usd, delta_micro_usd)
    values (r.id, r.bucket_id, r.model, r.price_id, r.reserved_micro_usd, v_actual, v_charged, v_delta);
  end if;

  if not v_breaker.tripped and (
    v_delta > v_settings.breaker_single_discrepancy_micro_usd
    or (v_breaker.total_reserved_micro_usd > 0
        and v_breaker.total_discrepancy_micro_usd > v_breaker.total_reserved_micro_usd * v_settings.breaker_aggregate_discrepancy_ratio)
  ) then
    update public.usage_model_circuit_breakers
    set tripped = true, tripped_at = now(),
        trip_reason = case when v_delta > v_settings.breaker_single_discrepancy_micro_usd then 'single_discrepancy_over_limit' else 'aggregate_discrepancy_over_limit' end
    where model = r.model;
  end if;

  -- A bucket that can no longer fund even the smallest call is exhausted.
  update public.usage_buckets
  set status = 'exhausted', updated_at = now()
  where id = r.bucket_id and status = 'active'
    and private_allowance_micro_usd - consumed_micro_usd < public.pawos_min_viable_micro_usd();
end;
$$;

-- Expires finished buckets and settles timed-out reservations for one user.
create or replace function public.pawos_bucket_housekeeping(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.usage_bucket_reservations
    where user_id = p_user_id and state = 'held' and expires_at <= now()
    order by created_at
  loop
    perform public.pawos_close_reservation(v_id, 'timeout:' || v_id::text, null, null, null, null, 'timeout');
  end loop;

  update public.usage_buckets
  set status = 'expired', updated_at = now()
  where user_id = p_user_id and status in ('active', 'exhausted') and expires_at is not null and expires_at <= now();
end;
$$;

-- The customer-safe view of a user's buckets. Only customer value / PC / percentages / dates.
create or replace function public.pawos_usage_summary(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare
  v_min bigint := public.pawos_min_viable_micro_usd();
  v_now timestamptz := now();
  b record;
  v_buckets jsonb := '[]'::jsonb;
  v_room bigint;
  v_week integer;
  v_week_used bigint;
  v_week_room bigint;
  v_pc_remaining integer;
  v_status text;
  v_plan_product text;
  v_plan_label text;
  v_label text;
  v_pacing jsonb := null;
  v_plan_fundable boolean := false;
  v_plan_paced boolean := false;
  v_plan_paced_reset timestamptz := null;
  v_had_plan boolean := false;
  v_other_fundable boolean := false;
  v_credits_pc integer := 0;
  v_reason text := null;
begin
  for b in
    select * from public.usage_buckets ub
    where ub.user_id = p_user_id
      and (ub.status in ('active', 'exhausted') or ub.updated_at > v_now - interval '35 days')
    order by public.pawos_bucket_priority(ub.source_type), ub.period_start, ub.created_at, ub.id
  loop
    v_room := b.private_allowance_micro_usd - b.consumed_micro_usd - b.reserved_micro_usd;
    v_status := case
      when b.status in ('expired', 'revoked') then b.status
      when b.expires_at is not null and b.expires_at <= v_now then 'expired'
      when b.status = 'exhausted' or v_room < v_min then 'exhausted'
      else 'active' end;
    v_pc_remaining := case when v_status = 'active' then floor(b.customer_pc::numeric * v_room / b.private_allowance_micro_usd)::integer else 0 end;

    select p.label into v_label from public.usage_bucket_products p where p.product_key = b.product_key;

    if b.source_type = 'monthly_plan' and v_status = 'active' then
      v_had_plan := true;
      if v_plan_product is null then v_plan_product := b.product_key; v_plan_label := v_label; end if;
      if b.weekly_pacing_micro_usd is null then
        v_plan_fundable := true; -- this product has no weekly pacing
      else
        v_week := public.pawos_week_index(b.period_start, v_now);
        v_week_used := public.pawos_bucket_week_used(b.id, v_week);
        v_week_room := b.weekly_pacing_micro_usd - v_week_used;
        if v_week_room >= v_min then
          v_plan_fundable := true;
        else
          v_plan_paced := true;
          v_plan_paced_reset := least(coalesce(v_plan_paced_reset, 'infinity'::timestamptz),
                                      least(b.period_start + (v_week + 1) * interval '7 days', b.expires_at));
        end if;
        if v_pacing is null then
          v_pacing := jsonb_build_object(
            'percentUsed', least(100, round(100.0 * v_week_used / b.weekly_pacing_micro_usd))::integer,
            'reached', v_week_room < v_min,
            'resetsAt', least(b.period_start + (v_week + 1) * interval '7 days', b.expires_at),
            'pcLimit', floor(b.customer_pc::numeric * b.weekly_pacing_micro_usd / b.private_allowance_micro_usd)::integer
          );
        end if;
      end if;
    elsif b.source_type = 'monthly_plan' then
      v_had_plan := v_had_plan or v_status = 'exhausted';
      if v_plan_product is null and v_status = 'exhausted' then v_plan_product := b.product_key; v_plan_label := v_label; end if;
    elsif v_status = 'active' then
      v_other_fundable := true;
    end if;

    if b.source_type = 'purchased_credits' and v_status = 'active' then
      v_credits_pc := v_credits_pc + v_pc_remaining;
    end if;

    v_buckets := v_buckets || jsonb_build_array(jsonb_build_object(
      'id', b.id,
      'type', b.source_type,
      'label', v_label,
      'productKey', b.product_key,
      'amountPaidCents', b.customer_value_cents,
      'pcTotal', b.customer_pc,
      'pcUsed', b.customer_pc - v_pc_remaining,
      'pcRemaining', v_pc_remaining,
      'percentUsed', case when v_status = 'active' then least(100, round(100.0 * (b.consumed_micro_usd + b.reserved_micro_usd) / b.private_allowance_micro_usd))::integer else 100 end,
      'status', v_status,
      'startsAt', b.period_start,
      'expiresAt', b.expires_at,
      'resetsAt', case when b.source_type = 'monthly_plan' then b.expires_at end,
      'createdAt', b.created_at
    ));
  end loop;

  if v_plan_fundable then
    v_reason := null;
  elsif v_plan_paced then
    v_reason := 'plan_weekly_paced';
  elsif v_other_fundable then
    v_reason := null;
  elsif v_had_plan then
    v_reason := 'plan_exhausted';
  else
    v_reason := 'no_allowance';
  end if;

  return jsonb_build_object(
    'plan', case when v_plan_product is null then null else jsonb_build_object('productKey', v_plan_product, 'label', v_plan_label) end,
    -- True while a current plan bucket funds this account's usage (the desktop's only signal for
    -- "reserve every call against buckets" — no tier names involved).
    'bucketFunded', v_plan_product is not null,
    'buckets', v_buckets,
    'weeklyPacing', v_pacing,
    'creditsPcRemaining', v_credits_pc,
    'limitReached', v_reason is not null,
    'limitReason', v_reason,
    'limitResetsAt', case when v_reason = 'plan_weekly_paced' then v_plan_paced_reset end,
    'serverNow', v_now
  );
end;
$$;

-- ── 5. Client RPCs (authenticated user, their own buckets only) ────────────────────────────────

-- p_scope: 'standard' (plan → mid-month → credits) or 'credits_only' (Paw Fable; Go/Build after their
-- free allowance). p_input_tokens: countTokens on the exact request, or a UTF-8 byte upper bound when
-- countTokens failed (p_input_is_upper_bound). Returns only what the caller needs to make the call.
create or replace function public.reserve_usage(
  p_request_key text,
  p_model text,
  p_input_tokens integer,
  p_input_is_upper_bound boolean,
  p_max_output_tokens integer,
  p_category text,
  p_scope text default 'standard'
) returns jsonb
language plpgsql volatile security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_existing public.usage_bucket_reservations;
  v_price public.model_prices;
  v_long boolean;
  v_in_price numeric;
  v_out_price numeric;
  v_input_cost bigint;
  v_requested integer;
  b public.usage_buckets;
  v_monthly_room bigint;
  v_week integer;
  v_week_room bigint;
  v_room bigint;
  v_granted integer;
  v_amount bigint;
  v_min_request bigint;
  v_paced boolean := false;
  v_reservation_id uuid;
  v_tripped boolean;
  v_settings public.usage_engine_settings := public.pawos_engine_settings();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce(btrim(p_request_key), '') = '' or length(p_request_key) > 120 then
    raise exception 'invalid_request_key' using errcode = '22023';
  end if;
  if p_input_tokens is null or p_input_tokens < 0 or p_input_tokens > 4000000 then
    raise exception 'invalid_input_tokens' using errcode = '22023';
  end if;
  if p_scope not in ('standard', 'credits_only') then
    raise exception 'invalid_scope' using errcode = '22023';
  end if;
  v_requested := least(greatest(coalesce(p_max_output_tokens, v_settings.max_output_tokens), 1), v_settings.max_output_tokens);

  -- Same request key again (a retry of the same call): return the existing hold, never a second one.
  select * into v_existing from public.usage_bucket_reservations where user_id = v_uid and request_key = p_request_key;
  if v_existing.id is not null then
    if v_existing.state = 'held' then
      return jsonb_build_object('ok', true, 'reservationId', v_existing.id, 'maxOutputTokens', v_existing.granted_max_output_tokens,
                                'summary', public.pawos_usage_summary(v_uid));
    end if;
    raise exception 'request_key_already_used' using errcode = '22023';
  end if;

  perform public.pawos_ensure_plan_buckets(v_uid);
  perform public.pawos_bucket_housekeeping(v_uid);

  select coalesce((select c.tripped from public.usage_model_circuit_breakers c where c.model = p_model), false) into v_tripped;
  v_price := public.pawos_model_price(p_model, v_now);
  if v_tripped or v_price.id is null then
    return jsonb_build_object('ok', false, 'reason', 'service_unavailable', 'summary', public.pawos_usage_summary(v_uid));
  end if;

  v_long := v_price.long_context_threshold_tokens is not null and p_input_tokens > v_price.long_context_threshold_tokens;
  v_in_price := case when v_long then v_price.long_input_usd_per_mtok else v_price.input_usd_per_mtok end;
  v_out_price := case when v_long then v_price.long_output_usd_per_mtok else v_price.output_usd_per_mtok end;
  -- Input is always priced at the full (uncached) rate: the worst case.
  v_input_cost := ceil(p_input_tokens * v_in_price)::bigint;
  v_min_request := v_input_cost + ceil(v_settings.min_output_tokens * v_out_price)::bigint;

  for b in
    select * from public.usage_buckets ub
    where ub.user_id = v_uid and ub.status = 'active'
      and ub.period_start <= v_now and (ub.expires_at is null or ub.expires_at > v_now)
      and (p_scope = 'standard' or ub.source_type = 'purchased_credits')
    order by public.pawos_bucket_priority(ub.source_type), ub.period_start, ub.created_at, ub.id
    for update
  loop
    -- A plan that is only weekly-paced blocks everything after it: never fall through to purchases.
    if v_paced and b.source_type <> 'monthly_plan' then
      exit;
    end if;

    v_monthly_room := b.private_allowance_micro_usd - b.consumed_micro_usd - b.reserved_micro_usd;
    v_week := null;
    if b.source_type = 'monthly_plan' and b.weekly_pacing_micro_usd is not null then
      v_week := public.pawos_week_index(b.period_start, v_now);
      v_week_room := b.weekly_pacing_micro_usd - public.pawos_bucket_week_used(b.id, v_week);
      v_room := least(v_monthly_room, v_week_room);
    else
      v_room := v_monthly_room;
    end if;

    if v_room >= v_min_request then
      v_granted := least(v_requested, floor((v_room - v_input_cost) / v_out_price)::integer);
      v_amount := v_input_cost + ceil(v_granted * v_out_price)::bigint;
      while v_amount > v_room and v_granted >= v_settings.min_output_tokens loop
        v_granted := v_granted - 1;
        v_amount := v_input_cost + ceil(v_granted * v_out_price)::bigint;
      end loop;
      if v_granted >= v_settings.min_output_tokens and v_amount <= v_room then
        insert into public.usage_bucket_reservations (
          bucket_id, user_id, request_key, model, price_id, category, input_tokens, input_is_upper_bound,
          long_context, granted_max_output_tokens, reserved_micro_usd, week_index, expires_at
        ) values (
          b.id, v_uid, p_request_key, p_model, v_price.id, left(coalesce(nullif(btrim(p_category), ''), 'chat'), 40),
          p_input_tokens, coalesce(p_input_is_upper_bound, false), v_long, v_granted, v_amount, v_week,
          v_now + v_settings.reservation_timeout
        ) returning id into v_reservation_id;

        update public.usage_buckets set reserved_micro_usd = reserved_micro_usd + v_amount, updated_at = v_now
        where id = b.id;

        return jsonb_build_object('ok', true, 'reservationId', v_reservation_id, 'maxOutputTokens', v_granted,
                                  'summary', public.pawos_usage_summary(v_uid));
      end if;
    end if;

    -- This bucket cannot fund this request. If the plan still has monthly room for it but its
    -- weekly pace is used up, the user waits for the weekly reset.
    if b.source_type = 'monthly_plan' and b.weekly_pacing_micro_usd is not null and v_monthly_room >= v_min_request then
      v_paced := true;
    end if;
  end loop;

  return jsonb_build_object('ok', false,
    'reason', case when v_paced then 'plan_weekly_paced' else 'no_allowance' end,
    'summary', public.pawos_usage_summary(v_uid));
end;
$$;

-- Settles a reservation with the provider-reported usageMetadata. Idempotent: settling the same
-- reservation again with the same usage event id changes nothing.
create or replace function public.settle_usage(
  p_reservation_id uuid,
  p_usage_event_id text,
  p_prompt_tokens integer,
  p_candidates_tokens integer,
  p_cached_tokens integer,
  p_thoughts_tokens integer
) returns jsonb
language plpgsql volatile security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  r public.usage_bucket_reservations;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce(btrim(p_usage_event_id), '') = '' or length(p_usage_event_id) > 120 then
    raise exception 'invalid_usage_event_id' using errcode = '22023';
  end if;
  if least(coalesce(p_prompt_tokens, 0), coalesce(p_candidates_tokens, 0), coalesce(p_cached_tokens, 0), coalesce(p_thoughts_tokens, 0)) < 0
     or greatest(coalesce(p_prompt_tokens, 0), coalesce(p_candidates_tokens, 0), coalesce(p_cached_tokens, 0), coalesce(p_thoughts_tokens, 0)) > 4000000 then
    raise exception 'invalid_token_counts' using errcode = '22023';
  end if;

  select * into r from public.usage_bucket_reservations where id = p_reservation_id and user_id = v_uid;
  if r.id is null then
    raise exception 'reservation_not_found' using errcode = '22023';
  end if;
  if r.state = 'held' then
    perform public.pawos_close_reservation(r.id, p_usage_event_id,
      coalesce(p_prompt_tokens, 0), coalesce(p_candidates_tokens, 0), coalesce(p_cached_tokens, 0), coalesce(p_thoughts_tokens, 0),
      'reported');
  end if;
  return jsonb_build_object('ok', true, 'summary', public.pawos_usage_summary(v_uid));
end;
$$;

-- Releases a reservation whose call never produced billable usage (the request failed before
-- Gemini reported any usage).
create or replace function public.release_usage_reservation(p_reservation_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  r public.usage_bucket_reservations;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into r from public.usage_bucket_reservations where id = p_reservation_id and user_id = v_uid;
  if r.id is null then
    raise exception 'reservation_not_found' using errcode = '22023';
  end if;
  perform public.pawos_close_reservation(r.id, null, null, null, null, null, 'release');
  return jsonb_build_object('ok', true, 'summary', public.pawos_usage_summary(v_uid));
end;
$$;

create or replace function public.get_my_usage_summary()
returns jsonb
language plpgsql volatile security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform public.pawos_ensure_plan_buckets(v_uid);
  perform public.pawos_bucket_housekeeping(v_uid);
  return public.pawos_usage_summary(v_uid);
end;
$$;

-- Customer-facing history: when, what kind of work, which bucket type, how much PC. Nothing else.
create or replace function public.get_my_usage_history(p_limit integer default 100)
returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'at', e.created_at,
      'category', e.category,
      'bucketType', b.source_type,
      'pc', round(b.customer_pc::numeric * e.charged_micro_usd / b.private_allowance_micro_usd, 1)
    ) order by e.created_at desc)
    from (
      select * from public.usage_bucket_events ev
      where ev.user_id = v_uid
      order by ev.created_at desc
      limit least(greatest(coalesce(p_limit, 100), 1), 500)
    ) e
    join public.usage_buckets b on b.id = e.bucket_id
  ), '[]'::jsonb);
end;
$$;

-- ── 6. Service-only RPCs (pawos-web with the service-role key) ─────────────────────────────────

create or replace function public.pawos_require_service_role()
returns void language plpgsql stable as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'unauthorized: backend-only operation' using errcode = '42501';
  end if;
end;
$$;

-- Credit purchases now create a purchased_credits bucket (customer value = amount paid, private
-- allowance = amount × 0.70). Same signature as before so every existing caller keeps working;
-- idempotent on the Razorpay payment id. Organization purchases are rejected as before.
create or replace function public.add_usage_credits_service(
  p_user_id uuid,
  p_organization_id uuid,
  p_amount_usd numeric,
  p_razorpay_payment_id text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_product public.usage_bucket_products;
  v_cents integer;
  v_bucket_id uuid;
begin
  perform public.pawos_require_service_role();
  if p_user_id is null then
    raise exception 'invalid user';
  end if;
  if p_amount_usd is null or p_amount_usd <= 0 then
    raise exception 'invalid amount';
  end if;
  if coalesce(btrim(p_razorpay_payment_id), '') = '' then
    raise exception 'missing payment id';
  end if;

  v_cents := round(p_amount_usd * 100)::integer;
  if v_cents <= 0 or v_cents::numeric <> p_amount_usd * 100 then
    raise exception 'invalid amount';
  end if;
  select * into v_product from public.usage_bucket_products where product_key = 'credits';

  -- Purchase history (unchanged table), then the bucket.
  insert into public.usage_credit_payments (payment_id, user_id, amount_usd)
  values (p_razorpay_payment_id, p_user_id, p_amount_usd)
  on conflict (payment_id) do nothing;

  insert into public.usage_buckets (
    user_id, source_type, product_key, purchase_ref, customer_value_cents, customer_pc,
    private_allowance_micro_usd, period_start, expires_at, metadata
  ) values (
    p_user_id, 'purchased_credits', v_product.product_key, 'pay:' || p_razorpay_payment_id, v_cents, v_cents,
    floor(v_cents::numeric * 10000 * v_product.allowance_ratio)::bigint, now(),
    public.pawos_bucket_expiry(v_product.expiry_policy, null, null),
    jsonb_build_object('razorpay_payment_id', p_razorpay_payment_id)
  ) on conflict (purchase_ref) do nothing;

  select id into v_bucket_id from public.usage_buckets where purchase_ref = 'pay:' || p_razorpay_payment_id;
  return v_bucket_id;
end;
$$;

-- What a mid-month purchase would be right now for this user (price + expiry), or null when the
-- user has no active plan. pawos-web uses this to build the checkout and to show the expiry date.
create or replace function public.pawos_mid_month_offer(p_user_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public, auth as $$
declare
  v_plan public.usage_buckets;
  v_product public.usage_bucket_products;
begin
  perform public.pawos_require_service_role();
  perform public.pawos_ensure_plan_buckets(p_user_id);
  perform public.pawos_bucket_housekeeping(p_user_id);
  -- The current plan bucket whose product sells extra usage — highest configured rank first.
  select b.* into v_plan from public.usage_buckets b
  join public.usage_bucket_products pp on pp.product_key = b.product_key
  where b.user_id = p_user_id and b.source_type = 'monthly_plan' and b.status in ('active', 'exhausted')
    and b.period_start <= now() and b.expires_at > now() and pp.extra_usage_product_key is not null
  order by pp.rank desc, b.expires_at desc
  limit 1;
  if v_plan.id is null then
    return null;
  end if;
  select x.* into v_product from public.usage_bucket_products pp
  join public.usage_bucket_products x on x.product_key = pp.extra_usage_product_key
  where pp.product_key = v_plan.product_key and x.active and x.source_type = 'mid_month_purchase';
  if v_product.product_key is null then
    return null;
  end if;
  return jsonb_build_object(
    'productKey', v_product.product_key,
    'planBucketId', v_plan.id,
    'priceCents', v_product.customer_value_cents,
    'pc', v_product.customer_value_cents,
    'label', v_product.label,
    'expiresAt', public.pawos_bucket_expiry(v_product.expiry_policy, null, v_plan.expires_at)
  );
end;
$$;

-- Grants a verified mid-month purchase. The product and the parent plan come from the order's
-- server-recorded notes; the amount must equal that product's price. Idempotent on the payment id.
-- Expires with its parent plan period.
create or replace function public.grant_mid_month_bucket_service(
  p_user_id uuid,
  p_razorpay_payment_id text,
  p_product_key text,
  p_plan_bucket_id uuid,
  p_amount_cents integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_product public.usage_bucket_products;
  v_plan public.usage_buckets;
  v_plan_product public.usage_bucket_products;
  v_existing public.usage_buckets;
begin
  perform public.pawos_require_service_role();
  if p_user_id is null or coalesce(btrim(p_razorpay_payment_id), '') = '' then
    raise exception 'invalid grant';
  end if;

  select * into v_existing from public.usage_buckets where purchase_ref = 'pay:' || p_razorpay_payment_id;
  if v_existing.id is not null then
    return jsonb_build_object('bucketId', v_existing.id, 'expiresAt', v_existing.expires_at, 'alreadyGranted', true);
  end if;

  select * into v_product from public.usage_bucket_products where product_key = p_product_key and source_type = 'mid_month_purchase';
  if v_product.product_key is null then
    raise exception 'unknown mid-month product';
  end if;
  if p_amount_cents is distinct from v_product.customer_value_cents then
    raise exception 'amount does not match the mid-month product price';
  end if;

  select * into v_plan from public.usage_buckets where id = p_plan_bucket_id and user_id = p_user_id and source_type = 'monthly_plan';
  select * into v_plan_product from public.usage_bucket_products where product_key = v_plan.product_key;
  if v_plan.id is null or v_plan_product.extra_usage_product_key is distinct from v_product.product_key then
    raise exception 'plan does not match the mid-month product';
  end if;
  if v_plan.status = 'revoked' or v_plan.expires_at <= now() then
    raise exception 'plan period has ended';
  end if;

  insert into public.usage_buckets (
    user_id, source_type, product_key, purchase_ref, parent_plan_bucket_id,
    customer_value_cents, customer_pc, private_allowance_micro_usd, period_start, period_end, expires_at, metadata
  ) values (
    p_user_id, 'mid_month_purchase', v_product.product_key, 'pay:' || p_razorpay_payment_id, v_plan.id,
    v_product.customer_value_cents, v_product.customer_value_cents, v_product.private_allowance_micro_usd, now(),
    v_plan.expires_at, public.pawos_bucket_expiry(v_product.expiry_policy, null, v_plan.expires_at),
    jsonb_build_object('razorpay_payment_id', p_razorpay_payment_id)
  ) on conflict (purchase_ref) do nothing
  returning * into v_existing;

  if v_existing.id is null then
    select * into v_existing from public.usage_buckets where purchase_ref = 'pay:' || p_razorpay_payment_id;
  end if;
  return jsonb_build_object('bucketId', v_existing.id, 'expiresAt', v_existing.expires_at, 'alreadyGranted', false);
end;
$$;

-- Refund / chargeback: the bucket stops funding anything new; calls already in flight still
-- settle; already-consumed cost is never clawed back. The unused allowance is recorded.
-- p_payment_id revokes the bucket bought by that payment (credits, mid-month); p_subscription_id
-- revokes that subscription's current plan bucket.
create or replace function public.revoke_usage_bucket_service(p_payment_id text, p_subscription_id text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  b public.usage_buckets;
  v_count integer := 0;
begin
  perform public.pawos_require_service_role();
  for b in
    select * from public.usage_buckets ub
    where ub.status <> 'revoked'
      and (
        (p_payment_id is not null and ub.purchase_ref = 'pay:' || p_payment_id)
        or (p_subscription_id is not null and ub.subscription_id = p_subscription_id and ub.source_type = 'monthly_plan'
            and ub.period_start <= now() and ub.expires_at > now())
      )
    for update
  loop
    update public.usage_buckets
    set status = 'revoked', revoked_at = now(), revoke_reason = coalesce(p_reason, 'refund'), updated_at = now()
    where id = b.id;
    insert into public.usage_bucket_revocations (bucket_id, reason, payment_ref, unused_micro_usd)
    values (b.id, coalesce(p_reason, 'refund'), coalesce(p_payment_id, p_subscription_id),
            greatest(b.private_allowance_micro_usd - b.consumed_micro_usd - b.reserved_micro_usd, 0));
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('revoked', v_count);
end;
$$;

-- Settles timed-out reservations and expires finished buckets for every user (for a scheduled job).
create or replace function public.pawos_usage_bucket_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid;
  v_users integer := 0;
begin
  perform public.pawos_require_service_role();
  for v_user in
    select distinct user_id from public.usage_bucket_reservations where state = 'held' and expires_at <= now()
    union
    select distinct user_id from public.usage_buckets where status in ('active', 'exhausted') and expires_at <= now()
  loop
    perform public.pawos_bucket_housekeeping(v_user);
    v_users := v_users + 1;
  end loop;
  return jsonb_build_object('usersProcessed', v_users);
end;
$$;

-- Clears a tripped circuit breaker after investigation (service role only).
create or replace function public.reset_usage_circuit_breaker_service(p_model text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.pawos_require_service_role();
  update public.usage_model_circuit_breakers
  set tripped = false, trip_reason = null, tripped_at = null, total_reserved_micro_usd = 0,
      total_discrepancy_micro_usd = 0, reset_at = now(), updated_at = now()
  where model = p_model;
end;
$$;

-- ── 7. Legacy purchased credits ────────────────────────────────────────────────────────────────

-- FROZEN: the old desktop deduction path. Purchased usage is now settled per call against buckets.
create or replace function public.deduct_usage_credits(p_amount_usd numeric, p_usage_event_id text)
returns numeric
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  raise exception 'legacy_usage_credits_retired: purchased usage is now charged per call from usage buckets'
    using errcode = 'P0001';
end;
$$;

-- Moves each unmigrated legacy wallet with a positive balance into one purchased_credits bucket that
-- keeps the customer's full value ($X → X × 100 PC, never reduced) with a private allowance of
-- X × 0.70. DRY RUN by default: returns what would happen and changes nothing. Idempotent: the bucket
-- key is fixed per wallet ('legacy:user_usage_credits:<user>') and a migrated wallet is skipped.
-- The legacy row keeps its history (original balance recorded) and its balance is set to 0 so the
-- old wallet can never be spent again.
create or replace function public.migrate_legacy_usage_credits(p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  w record;
  v_product public.usage_bucket_products;
  v_cents integer;
  v_allowance bigint;
  v_ref text;
  v_bucket_id uuid;
  v_rows jsonb := '[]'::jsonb;
begin
  perform public.pawos_require_service_role();
  select * into v_product from public.usage_bucket_products where product_key = 'credits';

  for w in
    select * from public.user_usage_credits u
    where u.balance_usd > 0 or u.migrated_at is not null
    order by u.user_id
    for update
  loop
    v_ref := 'legacy:user_usage_credits:' || w.user_id::text;
    if w.migrated_at is not null then
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('userId', w.user_id, 'action', 'already_migrated',
        'legacyBalanceUsd', w.legacy_balance_usd_at_migration, 'bucketId', w.migrated_bucket_id));
      continue;
    end if;

    v_cents := floor(w.balance_usd * 100)::integer;
    v_allowance := floor(w.balance_usd * 1000000 * v_product.allowance_ratio)::bigint;
    if v_cents <= 0 or v_allowance <= 0 then
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('userId', w.user_id, 'action', 'skipped_below_one_cent',
        'legacyBalanceUsd', w.balance_usd));
      continue;
    end if;

    if p_dry_run then
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('userId', w.user_id, 'action', 'would_migrate',
        'legacyBalanceUsd', w.balance_usd, 'customerValueCents', v_cents, 'customerPc', v_cents,
        'privateAllowanceMicroUsd', v_allowance, 'purchaseRef', v_ref));
      continue;
    end if;

    insert into public.usage_buckets (
      user_id, source_type, product_key, purchase_ref, customer_value_cents, customer_pc,
      private_allowance_micro_usd, period_start, expires_at, metadata
    ) values (
      w.user_id, 'purchased_credits', v_product.product_key, v_ref, v_cents, v_cents, v_allowance, now(),
      public.pawos_bucket_expiry(v_product.expiry_policy, null, null),
      jsonb_build_object('migrated_from', 'user_usage_credits', 'legacy_balance_usd', w.balance_usd)
    ) on conflict (purchase_ref) do nothing;
    select id into v_bucket_id from public.usage_buckets where purchase_ref = v_ref;

    insert into public.legacy_usage_credit_migrations (user_id, legacy_balance_usd, bucket_id, customer_value_cents, private_allowance_micro_usd)
    values (w.user_id, w.balance_usd, v_bucket_id, v_cents, v_allowance)
    on conflict (user_id) do nothing;

    update public.user_usage_credits
    set legacy_balance_usd_at_migration = w.balance_usd, balance_usd = 0, migrated_at = now(),
        migrated_bucket_id = v_bucket_id, updated_at = now()
    where user_id = w.user_id;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object('userId', w.user_id, 'action', 'migrated',
      'legacyBalanceUsd', w.balance_usd, 'customerValueCents', v_cents, 'customerPc', v_cents,
      'privateAllowanceMicroUsd', v_allowance, 'bucketId', v_bucket_id));
  end loop;

  return jsonb_build_object('dryRun', p_dry_run, 'wallets', v_rows);
end;
$$;

-- ── 8. Grants ──────────────────────────────────────────────────────────────────────────────────
revoke all on function public.pawos_bucket_priority(text) from public, anon, authenticated;
revoke all on function public.pawos_engine_settings() from public, anon, authenticated;
revoke all on function public.pawos_subscription_plan_key(text, text) from public, anon, authenticated;
revoke all on function public.pawos_bucket_expiry(text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.pawos_week_index(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.pawos_model_price(text, timestamptz) from public, anon, authenticated;
revoke all on function public.pawos_price_tokens(public.model_prices, bigint, bigint, bigint, boolean) from public, anon, authenticated;
revoke all on function public.pawos_min_viable_micro_usd() from public, anon, authenticated;
revoke all on function public.pawos_bucket_week_used(uuid, integer) from public, anon, authenticated;
revoke all on function public.pawos_ensure_plan_buckets(uuid) from public, anon, authenticated;
revoke all on function public.pawos_close_reservation(uuid, text, bigint, bigint, bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.pawos_bucket_housekeeping(uuid) from public, anon, authenticated;
revoke all on function public.pawos_usage_summary(uuid) from public, anon, authenticated;
revoke all on function public.pawos_require_service_role() from public, anon, authenticated;

revoke all on function public.reserve_usage(text, text, integer, boolean, integer, text, text) from public, anon;
revoke all on function public.settle_usage(uuid, text, integer, integer, integer, integer) from public, anon;
revoke all on function public.release_usage_reservation(uuid) from public, anon;
revoke all on function public.get_my_usage_summary() from public, anon;
revoke all on function public.get_my_usage_history(integer) from public, anon;
grant execute on function public.reserve_usage(text, text, integer, boolean, integer, text, text) to authenticated;
grant execute on function public.settle_usage(uuid, text, integer, integer, integer, integer) to authenticated;
grant execute on function public.release_usage_reservation(uuid) to authenticated;
grant execute on function public.get_my_usage_summary() to authenticated;
grant execute on function public.get_my_usage_history(integer) to authenticated;

revoke all on function public.add_usage_credits_service(uuid, uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.pawos_mid_month_offer(uuid) from public, anon, authenticated;
revoke all on function public.grant_mid_month_bucket_service(uuid, text, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.revoke_usage_bucket_service(text, text, text) from public, anon, authenticated;
revoke all on function public.pawos_usage_bucket_maintenance() from public, anon, authenticated;
revoke all on function public.reset_usage_circuit_breaker_service(text) from public, anon, authenticated;
revoke all on function public.migrate_legacy_usage_credits(boolean) from public, anon, authenticated;
grant execute on function public.add_usage_credits_service(uuid, uuid, numeric, text) to service_role;
grant execute on function public.pawos_mid_month_offer(uuid) to service_role;
grant execute on function public.grant_mid_month_bucket_service(uuid, text, text, uuid, integer) to service_role;
grant execute on function public.revoke_usage_bucket_service(text, text, text) to service_role;
grant execute on function public.pawos_usage_bucket_maintenance() to service_role;
grant execute on function public.reset_usage_circuit_breaker_service(text) to service_role;
grant execute on function public.migrate_legacy_usage_credits(boolean) to service_role;

-- The frozen legacy function keeps its grant so old desktop builds get a clear error, not a 404.
grant execute on function public.deduct_usage_credits(numeric, text) to authenticated;
