-- Paw Compute usage-limit enforcement — the first real spend path for Referral Credits
-- ("Paw Credits" in customer-facing copy). Per the frozen requirement, Paw Credits must extend
-- available Paw Compute and must never bypass entitlement restrictions — this migration only ever
-- deducts a dollar amount from the existing referral_credits balance and reports how much was
-- redeemed; it grants no feature, model, or tier access of any kind. The conversion from a redeemed
-- dollar amount into bonus Paw Compute units happens entirely client-side (Electron's local
-- CreditStore), since "Paw Compute units" is a purely local, per-device concept
-- (UsageQuotaConfigStore) that Supabase has no notion of — this RPC's only job is the dollar
-- ledger, matching the same clean boundary already used elsewhere (Supabase owns money, the local
-- app owns local usage counters).
--
-- Mirrors grant_referral_credits()'s existing balance-mutation + ledger-insert shape from
-- 20260726030000_referral_credits.sql exactly, just in the opposite direction (debit, not credit).

create table if not exists referral_credit_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_usd numeric(10, 2) not null check (amount_usd > 0),
  redeemed_at timestamptz not null default now()
);
create index if not exists idx_referral_credit_redemptions_user on referral_credit_redemptions(user_id);
alter table referral_credit_redemptions enable row level security;
create policy referral_credit_redemptions_own_select on referral_credit_redemptions
  for select using (user_id = auth.uid());
-- No insert policy for authenticated — created only by redeem_referral_credits_for_compute() below.

-- Deducts p_amount_usd from the caller's own referral_credits balance and logs the redemption.
-- Raises if the balance is insufficient — never allows a negative balance, and never trusts a
-- client-supplied balance figure (reads and locks the row itself via the update's own atomicity).
create or replace function redeem_referral_credits_for_compute(p_amount_usd numeric)
returns table (remaining_balance_usd numeric)
language plpgsql
security definer
as $$
declare
  v_user_id uuid := auth.uid();
  v_current numeric;
begin
  if v_user_id is null then
    raise exception 'not authorized';
  end if;
  if p_amount_usd is null or p_amount_usd <= 0 then
    raise exception 'redemption amount must be positive';
  end if;

  select balance_usd into v_current from referral_credits where user_id = v_user_id for update;

  if v_current is null or v_current < p_amount_usd then
    raise exception 'insufficient Referral Credits balance (have %, need %)', coalesce(v_current, 0), p_amount_usd;
  end if;

  update referral_credits set balance_usd = balance_usd - p_amount_usd, updated_at = now()
  where user_id = v_user_id;

  insert into referral_credit_redemptions (user_id, amount_usd) values (v_user_id, p_amount_usd);

  return query select balance_usd from referral_credits where user_id = v_user_id;
end;
$$;
grant execute on function redeem_referral_credits_for_compute to authenticated;
