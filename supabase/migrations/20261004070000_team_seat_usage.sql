-- Migration: 20261004070000_team_seat_usage
--
-- Paw Team no longer shares one organization pool: each Team member gets their own seat's monthly
-- usage, on the same usage buckets (reserve_usage → settle_usage) as Pro and Pro Max, so PawOS
-- Desktop and PawOS Web draw from one allowance per member.
--
--   Standard seat → the Pro allowance:        2,000 PC a month, weekly limit 1,000 PC
--   Premium seat  → the Pro Max 5x allowance: 10,000 PC a month, weekly limit 5,000 PC
--
-- The amounts are COPIED from the existing Pro and Pro Max 5x product rows at migration time (no
-- numbers restated here). Seat periods are calendar months (UTC): a bucket covers the 1st to the
-- 1st, nothing carries over. A member whose seat rate isn't assigned yet gets the Standard seat.
--
-- Paw Enterprise is unchanged: one organization pool (increment_organization_usage), counted per
-- calendar month, refused once used up until the next month.
--
-- Additive: two product rows and a new version of pawos_ensure_plan_buckets() that keeps the
-- subscription logic exactly as it was and adds the Team seat loop after it.

-- ── 1. Seat products ─────────────────────────────────────────────────────────────────────────────
insert into public.usage_bucket_products
  (product_key, source_type, subscription_plan_key, extra_usage_product_key, expiry_policy, bucket_interval_months, rank,
   customer_value_cents, private_allowance_micro_usd, weekly_pacing_micro_usd, allowance_ratio, label)
select 'team_standard_monthly', 'monthly_plan', 'team:standard', null, 'period', 1, p.rank,
       p.customer_value_cents, p.private_allowance_micro_usd, p.weekly_pacing_micro_usd, null, 'Team Standard seat'
from public.usage_bucket_products p where p.product_key = 'pro_monthly'
on conflict (product_key) do nothing;

insert into public.usage_bucket_products
  (product_key, source_type, subscription_plan_key, extra_usage_product_key, expiry_policy, bucket_interval_months, rank,
   customer_value_cents, private_allowance_micro_usd, weekly_pacing_micro_usd, allowance_ratio, label)
select 'team_premium_monthly', 'monthly_plan', 'team:premium', null, 'period', 1, p.rank,
       p.customer_value_cents, p.private_allowance_micro_usd, p.weekly_pacing_micro_usd, null, 'Team Premium seat'
from public.usage_bucket_products p where p.product_key = 'pro_max_5x_monthly'
on conflict (product_key) do nothing;

-- ── 2. Plan buckets: subscriptions (unchanged) + Team seats ─────────────────────────────────────
create or replace function public.pawos_ensure_plan_buckets(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_now timestamptz := now();
  s record;
  m record;
  v_product public.usage_bucket_products;
  v_cycle_start timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_months integer;
  v_slices integer;
  v_last_end timestamptz;
  v_seat_ref text;
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

  -- Team seats: each active member of a Team organization gets their seat's bucket for the current
  -- calendar month (UTC). The member's own buckets — never a shared pool.
  for m in
    select om.organization_id, coalesce(om.seat_tier, 'standard') as seat_tier
    from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    where om.user_id = p_user_id and om.status = 'active' and o.tier = 'team'
  loop
    select * into v_product from public.usage_bucket_products p
    where p.source_type = 'monthly_plan' and p.active and p.subscription_plan_key = 'team:' || m.seat_tier;
    if v_product.product_key is null then continue; end if;

    v_start := date_trunc('month', v_now at time zone 'UTC') at time zone 'UTC';
    v_end := v_start + interval '1 month';
    v_seat_ref := 'org:' || m.organization_id || ':' || m.seat_tier;

    -- One seat bucket per member per month, whatever the seat (a seat change mid-month applies next month).
    if exists (
      select 1 from public.usage_buckets b
      where b.user_id = p_user_id and b.source_type = 'monthly_plan' and b.subscription_id like 'org:' || m.organization_id || ':%'
        and b.period_start <= v_now and b.expires_at > v_now
    ) then
      continue;
    end if;

    insert into public.usage_buckets (
      user_id, source_type, product_key, purchase_ref, subscription_id,
      customer_value_cents, customer_pc, private_allowance_micro_usd, weekly_pacing_micro_usd,
      period_start, period_end, expires_at, metadata
    ) values (
      p_user_id, 'monthly_plan', v_product.product_key,
      'team:' || m.organization_id || ':' || p_user_id || ':' || floor(extract(epoch from v_start))::bigint::text,
      v_seat_ref, v_product.customer_value_cents, v_product.customer_value_cents, v_product.private_allowance_micro_usd,
      v_product.weekly_pacing_micro_usd, v_start, v_end, public.pawos_bucket_expiry(v_product.expiry_policy, v_end, null),
      jsonb_build_object('organization_id', m.organization_id, 'seat_tier', m.seat_tier)
    ) on conflict (purchase_ref) do nothing;
  end loop;
end;
$$;

revoke all on function public.pawos_ensure_plan_buckets(uuid) from public, anon, authenticated;
