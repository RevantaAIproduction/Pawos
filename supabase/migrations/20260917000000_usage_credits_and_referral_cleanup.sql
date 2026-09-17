-- 1. Remove Referral Credit System
drop function if exists redeem_referral_credits_for_compute(numeric);
drop function if exists report_referral_conversion(text);
drop function if exists apply_referral_code(text);
drop function if exists get_or_create_referral_code();
drop function if exists grant_referral_credits(uuid, numeric, text, text);

drop table if exists referral_credit_redemptions cascade;
drop table if exists referral_credit_grants cascade;
drop table if exists referral_credits cascade;
drop table if exists referral_rewards cascade;
drop table if exists referrals cascade;
drop table if exists referral_codes cascade;

-- 2. Create authoritative Purchased Usage Credits system
create table if not exists user_usage_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_usd numeric(10, 2) not null default 0 check (balance_usd >= 0),
  updated_at timestamptz not null default now()
);
alter table user_usage_credits enable row level security;
create policy user_usage_credits_own_select on user_usage_credits
  for select using (user_id = auth.uid());

create table if not exists usage_credit_deductions (
  usage_event_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_usd numeric(10, 2) not null,
  created_at timestamptz not null default now()
);
alter table usage_credit_deductions enable row level security;

-- RPC for the web checkout (Service Role, idempotent crediting)
create table if not exists usage_credit_payments (
  payment_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_usd numeric(10, 2) not null,
  created_at timestamptz not null default now()
);
alter table usage_credit_payments enable row level security;

create or replace function add_usage_credits_service(
  p_user_id uuid,
  p_organization_id uuid,
  p_amount_usd numeric,
  p_razorpay_payment_id text
)
returns uuid
language plpgsql
security definer
as $$
begin
  -- CRITICAL SECURITY FIX: This is a backend-only operation.
  -- Only service_role (which bypasses RLS and sets auth.uid() to null) is allowed to mint money.
  if auth.uid() is not null then
    raise exception 'unauthorized: add_usage_credits_service is a backend-only operation';
  end if;

  if p_user_id is null then
    raise exception 'invalid user';
  end if;

  if p_amount_usd <= 0 then
    raise exception 'invalid amount';
  end if;

  insert into usage_credit_payments (payment_id, user_id, amount_usd)
  values (p_razorpay_payment_id, p_user_id, p_amount_usd)
  on conflict (payment_id) do nothing;

  if found then
    insert into user_usage_credits (user_id, balance_usd) values (p_user_id, p_amount_usd)
    on conflict (user_id) do update set balance_usd = user_usage_credits.balance_usd + p_amount_usd, updated_at = now();
  end if;

  return gen_random_uuid();
end;
$$;
-- Revoke from public to ensure desktop clients cannot call it directly
revoke execute on function add_usage_credits_service from public;
grant execute on function add_usage_credits_service to service_role;

-- RPC for the desktop app to consume (Authenticated, exact deduction, idempotent)
create or replace function deduct_usage_credits(p_amount_usd numeric, p_usage_event_id text)
returns numeric
language plpgsql
security definer
as $$
declare
  v_current numeric;
  v_existing_user uuid;
  v_existing_amount numeric;
begin
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;
  if p_amount_usd <= 0 then
    raise exception 'amount must be positive';
  end if;

  -- Idempotency protection with exact ownership validation
  insert into usage_credit_deductions (usage_event_id, user_id, amount_usd)
  values (p_usage_event_id, auth.uid(), p_amount_usd)
  on conflict (usage_event_id) do nothing;

  if not found then
    select user_id, amount_usd into v_existing_user, v_existing_amount 
    from usage_credit_deductions 
    where usage_event_id = p_usage_event_id;

    if v_existing_user != auth.uid() then
      raise exception 'idempotency key belongs to another user';
    end if;
    if v_existing_amount != p_amount_usd then
      raise exception 'idempotency key amount mismatch';
    end if;

    select balance_usd into v_current from user_usage_credits where user_id = auth.uid();
    return coalesce(v_current, 0);
  end if;

  select balance_usd into v_current from user_usage_credits where user_id = auth.uid() for update;
  
  if v_current is null or v_current < p_amount_usd then
    raise exception 'insufficient Usage Credits balance (have %, need %)', coalesce(v_current, 0), p_amount_usd;
  end if;

  update user_usage_credits set balance_usd = balance_usd - p_amount_usd, updated_at = now()
  where user_id = auth.uid();

  return v_current - p_amount_usd;
end;
$$;
grant execute on function deduct_usage_credits to authenticated;

