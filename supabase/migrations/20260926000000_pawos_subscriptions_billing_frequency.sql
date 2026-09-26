-- Migration: 20260926000000_pawos_subscriptions_billing_frequency
--
-- Pro can be billed monthly or yearly (a separate Razorpay plan). Records which one each
-- subscription is, so the app can show "Pro · Monthly" / "Pro · Yearly". The paid-through date
-- still comes from Razorpay's own current_end (≈30 or ≈365 days) — this column is for display and
-- support only; it never extends access. Pro Max is monthly only. Additive: existing rows default
-- to 'monthly'.

alter table public.pawos_subscriptions
  add column if not exists billing_frequency text not null default 'monthly'
  check (billing_frequency in ('monthly', 'yearly'));

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
    'billingFrequency', v_row.billing_frequency,
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
