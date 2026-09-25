-- Migration: 20260925060000_pawos_subscriptions
--
-- Server-side record of each account's paid personal plan (Pro / Pro Max), so the plan follows the
-- ACCOUNT, not the device: signing out, using another account, reinstalling or moving to another PC
-- and signing back in restores it — until it expires. Before this, the plan lived only in the
-- desktop app's local subscription.json and was lost on sign-out.
--
-- Written ONLY by pawos-web with the service role, from Razorpay-verified data:
--   * /api/billing/verify-subscription  — right after a payment is verified
--   * /api/billing/webhook              — on every subscription.* event (renewal, cancel, halt…),
--                                          re-fetching the subscription from Razorpay itself
-- One row per Razorpay subscription (an upgrade creates a second subscription; a late event for the
-- old one never overwrites the new plan). Team / Enterprise stay organization-based and are not here.
--
-- Read by the desktop app through get_my_subscription() with the user's own session.

create table if not exists public.pawos_subscriptions (
  id text primary key,                              -- Razorpay subscription id
  user_id uuid not null references auth.users(id) on delete cascade,
  tier text not null check (tier in ('pro', 'proMax')),
  pro_max_variant text check (pro_max_variant in ('5x', '20x')),
  status text not null,                             -- Razorpay subscription status
  current_period_end timestamptz,                   -- paid through (Razorpay current_end)
  source text not null,                             -- 'verify-subscription' | 'webhook:<event>'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pawos_subscriptions_user_idx on public.pawos_subscriptions (user_id, current_period_end desc);

alter table public.pawos_subscriptions enable row level security;
revoke all on public.pawos_subscriptions from anon, authenticated;

-- The caller's best currently-paid plan. A plan counts until its paid period ends — including after
-- a cancellation (they paid for that period) — but never once Razorpay reports it halted, paused or
-- expired. hasHistory tells the app whether the server knows this account at all (so a purchase made
-- before this table existed is not wrongly removed).
create or replace function public.get_my_subscription()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.pawos_subscriptions;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_row
  from public.pawos_subscriptions s
  where s.user_id = v_uid
    and s.status in ('active', 'authenticated', 'pending', 'cancelled', 'completed')
    and s.current_period_end > now()
  order by
    case when s.tier = 'proMax' and s.pro_max_variant = '20x' then 3 when s.tier = 'proMax' then 2 else 1 end desc,
    s.current_period_end desc
  limit 1;

  return jsonb_build_object(
    'userId', v_uid,
    'active', v_row.id is not null,
    'tier', v_row.tier,
    'proMaxVariant', v_row.pro_max_variant,
    'status', v_row.status,
    'expiresAt', v_row.current_period_end,
    'subscriptionId', v_row.id,
    'hasHistory', exists (select 1 from public.pawos_subscriptions s where s.user_id = v_uid),
    'serverNow', now()
  );
end;
$$;

revoke all on function public.get_my_subscription() from public, anon;
grant execute on function public.get_my_subscription() to authenticated;
