-- Referral Credits — a new, separate reward balance, introduced to fix a real bug: the referral
-- engine (20260724010000_referral_engine.sql) previously granted its milestone reward directly
-- into user_task_credits, the same balance the Autonomous Ticket System deducts from. Per the
-- product requirement, referral rewards must never be fungible with ticket billing or
-- subscriptions — Referral Credits are usable only for Coding Runtime / AI Runtime / Companion
-- Runtime / future runtime-based usage, and can never be spent on the Autonomous Ticket System,
-- ticket investigations, subscriptions, plan upgrades, cash withdrawal, transfers, or any external
-- payout. This migration adds the new, genuinely separate tables and repoints
-- report_referral_conversion() at them; it does not touch user_task_credits/
-- organization_task_credits at all going forward.
--
-- The reward itself also changes from the old "5 referrals = $70 (14 x $5 task credits)" shape to
-- the real, finalized rule: every 5 subscribed referrals grants the referrer a flat $100 in
-- Referral Credits (not tied to any per-unit price, since Referral Credits have no per-unit
-- consumption yet — see ReferralCreditTypes.ts's own comment on why).

create table if not exists referral_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_usd numeric(10, 2) not null default 0,
  updated_at timestamptz not null default now()
);
alter table referral_credits enable row level security;
create policy referral_credits_own_select on referral_credits
  for select using (user_id = auth.uid());
-- No insert/update policy for authenticated — mutated only by grant_referral_credits() below.

create table if not exists referral_credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_usd numeric(10, 2) not null check (amount_usd > 0),
  source text not null check (source in ('referral_milestone')),
  source_ref text,
  granted_at timestamptz not null default now()
);
create index if not exists idx_referral_credit_grants_user on referral_credit_grants(user_id);
alter table referral_credit_grants enable row level security;
create policy referral_credit_grants_own_select on referral_credit_grants
  for select using (user_id = auth.uid());
-- No insert policy for authenticated — created only by grant_referral_credits() below.

-- Internal helper (not exposed to authenticated directly) — adds a Referral Credit grant for a
-- user and logs it. Called only from report_referral_conversion() today; kept as its own function
-- so a future non-referral Referral Credit source (e.g. a promo grant) has a single real place to
-- plug into rather than duplicating the balance-upsert + ledger-insert pattern.
create or replace function grant_referral_credits(p_user_id uuid, p_amount_usd numeric, p_source text, p_source_ref text)
returns void
language plpgsql
security definer
as $$
begin
  insert into referral_credits (user_id, balance_usd) values (p_user_id, p_amount_usd)
  on conflict (user_id) do update set balance_usd = referral_credits.balance_usd + p_amount_usd, updated_at = now();

  insert into referral_credit_grants (user_id, amount_usd, source, source_ref)
  values (p_user_id, p_amount_usd, p_source, p_source_ref);
end;
$$;

-- Redefines report_referral_conversion() to grant Referral Credits ($100/milestone) instead of
-- task credits — same signature as the original (p_tier text), so this replaces it in place rather
-- than creating a duplicate overload. referral_rewards.credits_granted is now unused/legacy (always
-- 0 going forward) since Referral Credits have no per-unit price to express a credit count against;
-- the column is left in place rather than dropped, per this codebase's additive-migration
-- convention (see organization_task_allowance).
create or replace function report_referral_conversion(p_tier text)
returns void
language plpgsql
security definer
as $$
declare
  v_referral referrals%rowtype;
  v_subscribed_count int;
  v_already_granted int;
  v_earned_milestones int;
  v_next_milestone int;
  v_amount_per_milestone constant numeric := 100;
begin
  if p_tier not in ('pro', 'proMax') then
    return;
  end if;

  select * into v_referral from referrals where referred_user_id = auth.uid() and status = 'signed_up';
  if v_referral.id is null then
    return;
  end if;

  update referrals
  set status = 'subscribed', subscribed_tier = p_tier, subscribed_at = now()
  where id = v_referral.id;

  select count(*) into v_subscribed_count from referrals
  where referrer_user_id = v_referral.referrer_user_id and status = 'subscribed';
  select count(*) into v_already_granted from referral_rewards
  where referrer_user_id = v_referral.referrer_user_id;

  v_earned_milestones := v_subscribed_count / 5;
  v_next_milestone := v_already_granted + 1;

  while v_next_milestone <= v_earned_milestones loop
    insert into referral_rewards (referrer_user_id, milestone_index, credits_granted, amount_usd)
    values (v_referral.referrer_user_id, v_next_milestone, 0, v_amount_per_milestone)
    on conflict (referrer_user_id, milestone_index) do nothing;

    if found then
      perform grant_referral_credits(v_referral.referrer_user_id, v_amount_per_milestone, 'referral_milestone', 'milestone_' || v_next_milestone);
    end if;

    v_next_milestone := v_next_milestone + 1;
  end loop;
end;
$$;
grant execute on function report_referral_conversion to authenticated;
