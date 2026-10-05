-- Minimal stand-in schema for testing 20261005010000_org_give_paw_compute.sql on a plain local Postgres
-- (psql -f this file, then the migration, then org_give_paw_compute.scenarios.sql). Not for Supabase.
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create table public.organizations (id uuid primary key, name text, tier text, owner_user_id uuid not null references auth.users(id));
create table public.organization_members (id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id), user_id uuid references auth.users(id), email text, role text not null, status text not null default 'invited');
create function public.pawos_min_viable_micro_usd() returns bigint language sql stable as $$ select 1000::bigint $$;
create function public.pawos_bucket_expiry(p_policy text, p_period_end timestamptz, p_parent_expires timestamptz) returns timestamptz language sql immutable as $$ select null::timestamptz $$;
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

insert into public.usage_bucket_products (product_key, source_type, expiry_policy, rank, allowance_ratio, label) values ('credits','purchased_credits','never',0,0.70,'Credits');
insert into public.usage_bucket_products (product_key, source_type, subscription_plan_key, expiry_policy, bucket_interval_months, rank, customer_value_cents, private_allowance_micro_usd, weekly_pacing_micro_usd, label) values ('pro_monthly','monthly_plan','pro','period',1,10,2000,10000000,5000000,'Pro plan');
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
