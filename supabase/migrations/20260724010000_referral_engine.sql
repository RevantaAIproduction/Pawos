-- Referral engine — a real, shareable per-user referral code; a referral
-- converts only once the *referred* user genuinely subscribes to Pro or
-- Pro Max (never at signup alone); and the reward is 5 converted referrals
-- = $70 of bonus prepaid Autonomous Engineering Task credits (14 credits at
-- the real $5/credit rate from 20260724000000_prepaid_task_credits.sql).
--
-- Reward currency deliberately reuses task credits rather than general "AI
-- usage" credits: EntitlementService.ts's own comments confirm every real
-- paid tier's monthlyCreditLimit is null (uncapped, "Business Configuration
-- Required") — there is no enforced general usage cap in this codebase to
-- grant overflow credit against. Task credits are the one real, currently
-- enforced balance a user can run out of (AutonomousTaskBillingGate.ts), so
-- that's what a referral reward honestly plugs into — bonus balance that
-- only ever gets consumed once the account would otherwise be blocked from
-- starting a new task for lack of credit, the same "overage" shape as the
-- user's own Claude analogy.
--
-- Conversion is reported by the *referred* user's own client, from their
-- own Supabase session, immediately after their local subscription
-- purchase is confirmed (CheckoutSyncServer.ts's existing same-machine
-- trust model — see add_task_credits()'s own comment for the identical
-- precedent). There is no signup-time referral capture in this phase: a
-- referral code is applied post-signup, once, from Account settings.

create table if not exists referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);
alter table referral_codes enable row level security;
create policy referral_codes_own_select on referral_codes
  for select using (user_id = auth.uid());
-- No insert policy for authenticated — created only by get_or_create_referral_code() below.

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,
  referral_code text not null,
  status text not null default 'signed_up' check (status in ('signed_up', 'subscribed')),
  subscribed_tier text,
  created_at timestamptz not null default now(),
  subscribed_at timestamptz
);
create index if not exists idx_referrals_referrer on referrals(referrer_user_id);
alter table referrals enable row level security;
create policy referrals_referrer_select on referrals
  for select using (referrer_user_id = auth.uid() or referred_user_id = auth.uid());
-- No insert/update policy for authenticated — mutated only by apply_referral_code()
-- and report_referral_conversion() below.

create table if not exists referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  milestone_index int not null check (milestone_index > 0),
  credits_granted int not null,
  amount_usd numeric(10, 2) not null,
  granted_at timestamptz not null default now(),
  unique (referrer_user_id, milestone_index)
);
alter table referral_rewards enable row level security;
create policy referral_rewards_own_select on referral_rewards
  for select using (referrer_user_id = auth.uid());
-- No insert policy for authenticated — created only by report_referral_conversion() below.

-- Returns the caller's own referral code, generating one on first call.
-- Retries on the (astronomically unlikely) case of a random collision.
create or replace function get_or_create_referral_code()
returns text
language plpgsql
security definer
as $$
declare
  v_code text;
  v_attempt int := 0;
begin
  select code into v_code from referral_codes where user_id = auth.uid();
  if v_code is not null then
    return v_code;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := upper(substr(md5(auth.uid()::text || clock_timestamp()::text || v_attempt::text), 1, 8));
    begin
      insert into referral_codes (user_id, code) values (auth.uid(), v_code);
      return v_code;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise exception 'Could not generate a unique referral code — please try again';
      end if;
    end;
  end loop;
end;
$$;
grant execute on function get_or_create_referral_code to authenticated;

-- Applies a referral code to the calling (newly signed-up) account. One-time
-- only per account — a second call raises rather than silently re-applying,
-- so an account can never be attributed to more than one referrer.
create or replace function apply_referral_code(p_code text)
returns void
language plpgsql
security definer
as $$
declare
  v_referrer uuid;
begin
  select user_id into v_referrer from referral_codes where code = upper(p_code);
  if v_referrer is null then
    raise exception 'That referral code was not found';
  end if;
  if v_referrer = auth.uid() then
    raise exception 'You cannot refer yourself';
  end if;
  if exists (select 1 from referrals where referred_user_id = auth.uid()) then
    raise exception 'A referral code has already been applied to this account';
  end if;

  insert into referrals (referrer_user_id, referred_user_id, referral_code, status)
  values (v_referrer, auth.uid(), upper(p_code), 'signed_up');
end;
$$;
grant execute on function apply_referral_code to authenticated;

-- Reported by the referred user's own client right after their own
-- subscription purchase is confirmed locally. Safe to call unconditionally
-- on every subscription change — it's a no-op unless the caller both has a
-- pending referral and just reached Pro or Pro Max. Every 5th subscribed
-- referral for a given referrer grants that referrer a new reward
-- (idempotent via the referral_rewards unique constraint), crediting their
-- own individual prepaid task-credit balance directly — never the
-- referred user's.
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
  v_credits_per_milestone constant int := 14; -- 14 credits x $5 = $70
  v_amount_per_milestone constant numeric := 70;
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
    values (v_referral.referrer_user_id, v_next_milestone, v_credits_per_milestone, v_amount_per_milestone)
    on conflict (referrer_user_id, milestone_index) do nothing;

    if found then
      insert into user_task_credits (user_id, balance) values (v_referral.referrer_user_id, v_credits_per_milestone)
      on conflict (user_id) do update set balance = user_task_credits.balance + v_credits_per_milestone, updated_at = now();

      insert into task_credit_purchases (user_id, organization_id, credits, amount_usd, payment_reference)
      values (v_referral.referrer_user_id, null, v_credits_per_milestone, 0,
              'referral_reward:milestone_' || v_next_milestone);
    end if;

    v_next_milestone := v_next_milestone + 1;
  end loop;
end;
$$;
grant execute on function report_referral_conversion to authenticated;
