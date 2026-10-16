-- Tests for 20261013000000_usage_display_percent_and_unreported_usage.sql, and for the agreed
-- allowances as the database holds them. Run by run.mjs after tests.sql (never against production).
\set ON_ERROR_STOP 1

-- ═══ U: the agreed allowances, read from the product records ════════════════════════════════════
do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('pro_monthly',           2000,   10000000::bigint),
      ('pro_max_5x_monthly',   10000,   50000000::bigint),
      ('pro_max_20x_monthly',  25000,  125000000::bigint),
      ('pro_mid_month',         1500,    9000000::bigint),
      ('pro_max_5x_mid_month',  5000,   30000000::bigint),
      ('pro_max_20x_mid_month',17500,  105000000::bigint)
    ) as v(product_key, cents, micro)
  loop
    perform t.check(format('U: %s is $%s for a private allowance of $%s', p.product_key, p.cents / 100, p.micro / 1000000),
      (select customer_value_cents = p.cents and private_allowance_micro_usd = p.micro from public.usage_bucket_products where product_key = p.product_key));
  end loop;
  perform t.check('U: each plan''s private allowance is exactly half its price',
    (select bool_and(private_allowance_micro_usd = customer_value_cents::bigint * 10000 / 2) from public.usage_bucket_products where source_type = 'monthly_plan' and product_key not like 'future%'));
  perform t.check('U: each mid-month purchase''s private allowance is exactly 60% of its price',
    (select bool_and(private_allowance_micro_usd = customer_value_cents::bigint * 10000 * 6 / 10) from public.usage_bucket_products where source_type = 'mid_month_purchase' and product_key not like 'future%'));
  perform t.check('U: purchased credits keep 70% of the payment as private allowance',
    (select allowance_ratio = 0.70 from public.usage_bucket_products where product_key = 'credits'));
  perform t.check('U: there is no product for Go or for Enterprise — neither gets a plan allowance here',
    not exists (select 1 from public.usage_bucket_products where subscription_plan_key in ('go', 'free', 'enterprise') or product_key ilike '%enterprise%' or product_key ilike 'go%'));
end $$;

-- ═══ V: the displayed percentage ════════════════════════════════════════════════════════════════
do $$
declare
  c record;
begin
  for c in
    select * from (values
      -- Pro, $10
      ('Pro $0.00',            0::bigint,  10000000::bigint,   0),
      ('Pro $5.00',      5000000,          10000000,          50),
      ('Pro $9.00',      9000000,          10000000,          90),
      ('Pro $9.50',      9500000,          10000000,          97),
      ('Pro $9.80',      9800000,          10000000,         100),
      ('Pro $10.00',    10000000,          10000000,         100),
      -- Pro Max 5x, $50
      ('5x $45.00',     45000000,          50000000,          90),
      ('5x $47.50',     47500000,          50000000,          97),
      ('5x $49.00',     49000000,          50000000,         100),
      -- Pro Max 20x, $125
      ('20x $112.50',  112500000,         125000000,          90),
      ('20x $118.75',  118750000,         125000000,          97),
      ('20x $122.50',  122500000,         125000000,         100),
      -- between the points, and the edges
      ('Pro $2.50',      2500000,          10000000,          25),
      ('Pro $8.99',      8990000,          10000000,          90),
      ('Pro $9.25',      9250000,          10000000,          93),
      ('Pro $9.49',      9490000,          10000000,          96),
      ('Pro $9.65',      9650000,          10000000,          98),
      ('Pro $9.79',      9790000,          10000000,          99),
      ('one micro-USD',        1,          10000000,           0),
      ('over the allowance', 10000001,     10000000,         100)
    ) as v(name, used, allowance, shown)
  loop
    perform t.check(format('V: %s shows %s%%', c.name, c.shown),
      public.pawos_usage_display_percent(c.used, c.allowance) = c.shown, public.pawos_usage_display_percent(c.used, c.allowance)::text);
  end loop;
  perform t.check('V: the displayed percentage never goes down as more is used',
    not exists (
      select 1 from generate_series(0, 10000000, 2500) g
      where public.pawos_usage_display_percent(g, 10000000) > public.pawos_usage_display_percent(g + 2500, 10000000)));
  perform t.check('V: it is always between 0 and 100',
    not exists (select 1 from generate_series(0, 10100000, 5000) g where public.pawos_usage_display_percent(g, 10000000) not between 0 and 100));
  perform t.check('V: a bucket with no allowance reads as used up, not as an error', public.pawos_usage_display_percent(0, 0) = 100);
end $$;

-- ═══ W: the summary shows it; what may be spent is unchanged ════════════════════════════════════
insert into auth.users (id, email) values
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'display@test'),
  ('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', 'display-5x@test'),
  ('a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3', 'unreported@test');
insert into public.pawos_subscriptions (id, user_id, tier, pro_max_variant, status, current_period_start, current_period_end, source, billing_frequency) values
  ('sub_display', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'pro', null, 'active', now() - interval '1 day', now() + interval '29 days', 'test', 'monthly'),
  ('sub_display_5x', 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', 'proMax', '5x', 'active', now() - interval '1 day', now() + interval '29 days', 'test', 'monthly'),
  ('sub_unreported', 'a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3', 'pro', null, 'active', now() - interval '1 day', now() + interval '29 days', 'test', 'monthly');

do $$
declare
  v_uid uuid := 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
  v_sum jsonb;
  v_res jsonb;
  v_bucket uuid;
  c record;
begin
  perform t.as_user(v_uid);
  v_sum := public.get_my_usage_summary();
  select id into v_bucket from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';
  perform t.check('W: a fresh Pro plan shows 0%', (v_sum->'buckets'->0->>'percentUsed')::int = 0);

  -- The ledger is set directly (as the table owner) to each agreed amount; the summary is what a client reads.
  for c in select * from (values (5000000::bigint, 50), (9000000, 90), (9500000, 97), (9800000, 100)) as v(used, shown) loop
    perform t.as_service();
    update public.usage_buckets set consumed_micro_usd = c.used where id = v_bucket;
    perform t.as_user(v_uid);
    v_sum := public.get_my_usage_summary();
    perform t.check(format('W: Pro with $%s used shows %s%% in the summary', (c.used / 1000000.0)::numeric(6, 2), c.shown),
      (v_sum->'buckets'->0->>'percentUsed')::int = c.shown, v_sum->'buckets'->0->>'percentUsed');
    perform t.check(format('W: … and $%s of $20 (%s of 2,000 PC), the same share as the bar', (c.shown * 20 / 100.0)::numeric(6, 2), c.shown * 20),
      (v_sum->'buckets'->0->>'amountUsedCents')::int = c.shown * 20 and (v_sum->'buckets'->0->>'pcUsed')::int = c.shown * 20
      and (v_sum->'buckets'->0->>'pcRemaining')::int = 2000 - c.shown * 20, (v_sum->'buckets'->0)::text);
  end loop;

  -- At $9.80 the bar reads 100% and the amount reads $20 of $20, but $0.20 is really left and is still spendable.
  perform t.check('W: at 100% shown the plan is not reported as exhausted while allowance remains',
    v_sum->'buckets'->0->>'status' = 'active' and (v_sum->>'limitReason') is distinct from 'plan_exhausted', (v_sum->'buckets'->0)::text);
  perform t.check('W: at 100% shown, the amount shown agrees with the bar: 2,000 of 2,000 PC, $20.00 of $20',
    (v_sum->'buckets'->0->>'pcUsed')::int = 2000 and (v_sum->'buckets'->0->>'pcRemaining')::int = 0
    and (v_sum->'buckets'->0->>'amountUsedCents')::int = 2000 and (v_sum->'buckets'->0->>'amountPaidCents')::int = 2000, (v_sum->'buckets'->0)::text);
  perform t.check('W: the ledger itself is untouched by what is shown ($9.80 consumed of $10)',
    (select consumed_micro_usd = 9800000 and private_allowance_micro_usd = 10000000 and status = 'active' from public.usage_buckets where id = v_bucket));
  perform t.check('W: the summary still carries no provider cost',
    v_sum::text !~* 'micro|private|allowance|usd|cost', v_sum::text);
  -- Pacing is counted from this week's charges (none here — the ledger total was set directly), and
  -- is not run through the display thresholds.
  perform t.check('W: the weekly pacing percentage is its own straight conversion, untouched by the display thresholds',
    (v_sum->'weeklyPacing'->>'percentUsed')::int = 0 and (v_sum->'weeklyPacing'->>'pcLimit')::int = 1000, (v_sum->'weeklyPacing')::text);

  -- Spending is decided by the real remainder. Move the bucket into its second week so pacing allows it.
  perform t.as_service();
  update public.usage_buckets set period_start = now() - interval '8 days' where id = v_bucket;
  perform t.as_user(v_uid);
  v_res := public.reserve_usage('display-spend-1', 'gemini-flash-lite-latest', 1000, false, 8000, 'chat', 'standard');
  perform t.check('W: with 100% shown and $0.20 really left, a call that fits is still funded', (v_res->>'ok')::boolean, v_res::text);
  perform public.release_usage_reservation((v_res->>'reservationId')::uuid);
  v_res := public.reserve_usage('display-spend-2', 'gemini-3.1-pro-preview', 100000, false, 8000, 'chat', 'standard');
  perform t.check('W: a call that needs more than is really left is refused', not (v_res->>'ok')::boolean, v_res::text);
  perform t.check('W: every bucket invariant still holds', t.invariants_hold());
end $$;

do $$
declare
  v_uid uuid := 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2';
  v_sum jsonb;
  v_bucket uuid;
  c record;
begin
  perform t.as_user(v_uid);
  v_sum := public.get_my_usage_summary();
  select id into v_bucket from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';
  perform t.check('W: Pro Max 5x has a $50 private allowance for its $100 price',
    (select private_allowance_micro_usd = 50000000 and customer_value_cents = 10000 from public.usage_buckets where id = v_bucket));
  for c in select * from (values (45000000::bigint, 90), (47500000, 97), (49000000, 100)) as v(used, shown) loop
    perform t.as_service();
    update public.usage_buckets set consumed_micro_usd = c.used where id = v_bucket;
    perform t.as_user(v_uid);
    v_sum := public.get_my_usage_summary();
    perform t.check(format('W: Pro Max 5x with $%s used shows %s%% and $%s of $100', (c.used / 1000000.0)::numeric(6, 2), c.shown, c.shown),
      (v_sum->'buckets'->0->>'percentUsed')::int = c.shown and (v_sum->'buckets'->0->>'amountUsedCents')::int = c.shown * 100
      and (v_sum->'buckets'->0->>'pcUsed')::int = c.shown * 100 and (v_sum->'buckets'->0->>'amountPaidCents')::int = 10000, (v_sum->'buckets'->0)::text);
  end loop;
end $$;

-- ═══ W2: the same rule on every other paid bucket ══════════════════════════════════════════════
insert into auth.users (id, email) values
  ('a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4', 'display-20x@test'),
  ('a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a5a5', 'display-purchases@test');
insert into public.pawos_subscriptions (id, user_id, tier, pro_max_variant, status, current_period_start, current_period_end, source, billing_frequency) values
  ('sub_display_20x', 'a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4', 'proMax', '20x', 'active', now() - interval '1 day', now() + interval '29 days', 'test', 'monthly'),
  ('sub_display_purchases', 'a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a5a5', 'pro', null, 'active', now() - interval '1 day', now() + interval '29 days', 'test', 'monthly');

-- Sets one bucket's ledger to an amount and reads back what the account is shown for it.
create function t.shown(p_uid uuid, p_bucket uuid, p_used bigint) returns jsonb language plpgsql as $$
declare
  v_sum jsonb;
begin
  perform t.as_service();
  update public.usage_buckets set consumed_micro_usd = p_used where id = p_bucket;
  perform t.as_user(p_uid);
  v_sum := public.get_my_usage_summary();
  return (select b from jsonb_array_elements(v_sum->'buckets') b where b->>'id' = p_bucket::text);
end $$;

do $$
declare
  v_uid uuid := 'a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4';
  v_bucket uuid;
  v_shown jsonb;
  c record;
begin
  perform t.as_user(v_uid);
  perform public.get_my_usage_summary();
  select id into v_bucket from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';
  for c in select * from (values (112500000::bigint, 90, 22500), (118750000, 97, 24250), (122500000, 100, 25000), (125000000, 100, 25000)) as v(used, pct, cents) loop
    v_shown := t.shown(v_uid, v_bucket, c.used);
    perform t.check(format('W2: Pro Max 20x with $%s used shows %s%% and $%s of $250', (c.used / 1000000.0)::numeric(7, 2), c.pct, (c.cents / 100.0)::numeric(7, 2)),
      (v_shown->>'percentUsed')::int = c.pct and (v_shown->>'amountUsedCents')::int = c.cents and (v_shown->>'pcUsed')::int = c.cents
      and (v_shown->>'amountPaidCents')::int = 25000 and (v_shown->>'pcTotal')::int = 25000, v_shown::text);
  end loop;
end $$;

do $$
declare
  v_uid uuid := 'a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a5a5';
  v_plan uuid;
  v_mid uuid;
  v_credits uuid;
  v_shown jsonb;
  v_sum jsonb;
  v_res jsonb;
  c record;
begin
  perform t.as_user(v_uid);
  perform public.get_my_usage_summary();
  select id into v_plan from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';
  perform t.as_service();
  perform public.grant_mid_month_bucket_service(v_uid, 'pay_display_mid', 'pro_mid_month', v_plan, 1500);
  perform public.add_usage_credits_service(v_uid, null, 10, 'pay_display_credits');
  select id into v_mid from public.usage_buckets where user_id = v_uid and source_type = 'mid_month_purchase';
  select id into v_credits from public.usage_buckets where user_id = v_uid and source_type = 'purchased_credits';
  perform t.check('W2: the purchases exist as their own buckets ($15 → $9, $10 → $7)',
    (select private_allowance_micro_usd = 9000000 and customer_value_cents = 1500 from public.usage_buckets where id = v_mid)
    and (select private_allowance_micro_usd = 7000000 and customer_value_cents = 1000 from public.usage_buckets where id = v_credits));

  -- Mid-month purchase: $15 for a private $9.
  for c in select * from (values (8100000::bigint, 90, 1350), (8550000, 97, 1455), (8820000, 100, 1500)) as v(used, pct, cents) loop
    v_shown := t.shown(v_uid, v_mid, c.used);
    perform t.check(format('W2: a $15 mid-month purchase with $%s used shows %s%% and $%s of $15', (c.used / 1000000.0)::numeric(6, 2), c.pct, (c.cents / 100.0)::numeric(6, 2)),
      (v_shown->>'percentUsed')::int = c.pct and (v_shown->>'amountUsedCents')::int = c.cents and (v_shown->>'pcUsed')::int = c.cents and (v_shown->>'amountPaidCents')::int = 1500, v_shown::text);
  end loop;

  -- Purchased credits: $10 for a private $7.
  for c in select * from (values (6300000::bigint, 90, 900), (6650000, 97, 970), (6860000, 100, 1000)) as v(used, pct, cents) loop
    v_shown := t.shown(v_uid, v_credits, c.used);
    perform t.check(format('W2: $10 of credits with $%s used shows %s%% and $%s of $10', (c.used / 1000000.0)::numeric(6, 2), c.pct, (c.cents / 100.0)::numeric(6, 2)),
      (v_shown->>'percentUsed')::int = c.pct and (v_shown->>'amountUsedCents')::int = c.cents and (v_shown->>'pcUsed')::int = c.cents and (v_shown->>'amountPaidCents')::int = 1000, v_shown::text);
  end loop;

  -- The credits total clients use to decide whether credits can fund a request is what is REALLY
  -- left ($0.14 of $7 = 20 PC), not the shown remainder (0).
  perform t.as_user(v_uid);
  v_sum := public.get_my_usage_summary();
  perform t.check('W2: with credits shown as 100% used, the spendable credits total is still the real remainder (20 PC)',
    (v_sum->>'creditsPcRemaining')::int = 20, v_sum->>'creditsPcRemaining');

  -- One bucket's display never moves another's, and nothing shown is private.
  v_shown := t.shown(v_uid, v_plan, 5000000);
  perform t.check('W2: each bucket is shown from its own ledger only (the plan at 50% while both purchases read 100%)',
    (v_shown->>'percentUsed')::int = 50 and (v_shown->>'amountUsedCents')::int = 1000, v_shown::text);
  perform t.as_user(v_uid);
  v_sum := public.get_my_usage_summary();
  perform t.check('W2: no bucket shows more used than its customer value, or a negative remainder',
    not exists (select 1 from jsonb_array_elements(v_sum->'buckets') b
                where (b->>'pcUsed')::int > (b->>'pcTotal')::int or (b->>'pcRemaining')::int < 0 or (b->>'amountUsedCents')::int > (b->>'amountPaidCents')::int));
  perform t.check('W2: the private allowances ($10, $9, $7) and provider cost appear nowhere in what the account is sent',
    v_sum::text !~* 'micro|private|allowance|usd|cost' and v_sum::text !~ '(10000000|9000000|7000000|8820000|6860000|5000000)', v_sum::text);

  -- Spending is still decided by the real ledger: the plan (50% used, second week) funds a call.
  perform t.as_service();
  update public.usage_buckets set period_start = now() - interval '8 days' where id = v_plan;
  perform t.as_user(v_uid);
  v_res := public.reserve_usage('display-purchases-1', 'gemini-flash-latest', 2000, false, 8000, 'chat', 'standard');
  perform t.check('W2: a call is funded from the real remainder whatever the purchases display', (v_res->>'ok')::boolean, v_res::text);
  perform public.release_usage_reservation((v_res->>'reservationId')::uuid);
  perform t.check('W2: every bucket invariant still holds', t.invariants_hold());
end $$;

-- The shown amount never runs ahead of, or behind, the bar; and never goes down as more is used.
do $$
begin
  perform t.check('W2: the shown share and the bar agree at every point (the bar is the share, in whole percent)',
    not exists (
      select 1 from generate_series(0, 10000000, 1250) g
      where abs(public.pawos_usage_display_share(g, 10000000) / 100.0 - public.pawos_usage_display_percent(g, 10000000)) >= 1));
  perform t.check('W2: the shown share never goes down as more is used',
    not exists (select 1 from generate_series(0, 10000000, 1250) g where public.pawos_usage_display_share(g, 10000000) > public.pawos_usage_display_share(g + 1250, 10000000)));
  -- The larger mid-month purchases, by the same rule: shown amount = customer value × shown share.
  -- ($50 for a private $30; $175 for a private $105 — the product records above.)
  perform t.check('W2: a $50 mid-month purchase shows $45.00 at 90%, $48.50 at 97% and $50.00 at 100%',
    floor(5000 * public.pawos_usage_display_share(27000000, 30000000) / 10000.0) = 4500
    and floor(5000 * public.pawos_usage_display_share(28500000, 30000000) / 10000.0) = 4850
    and floor(5000 * public.pawos_usage_display_share(29400000, 30000000) / 10000.0) = 5000);
  perform t.check('W2: a $175 mid-month purchase shows $157.50 at 90%, $169.75 at 97% and $175.00 at 100%',
    floor(17500 * public.pawos_usage_display_share(94500000, 105000000) / 10000.0) = 15750
    and floor(17500 * public.pawos_usage_display_share(99750000, 105000000) / 10000.0) = 16975
    and floor(17500 * public.pawos_usage_display_share(102900000, 105000000) / 10000.0) = 17500);
  perform t.check('W2: the shown amount is never worked out from the private allowance: the same share of a $20 and a $10 customer value differ, for one ledger',
    floor(2000 * public.pawos_usage_display_share(9500000, 10000000) / 10000.0) = 1940
    and floor(1000 * public.pawos_usage_display_share(9500000, 10000000) / 10000.0) = 970);
  perform t.check('W2: below 90% the shown amount is the straight conversion it always was ($5.03 of $10 → 1,006 of 2,000 PC)',
    floor(2000 * public.pawos_usage_display_share(5030000, 10000000) / 10000.0) = 1006);
end $$;

-- ═══ X: usage that was never reported is not free ═══════════════════════════════════════════════
do $$
declare
  v_uid uuid := 'a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3';
  v_res jsonb;
  v_held bigint;
  b public.usage_buckets;
  e public.usage_bucket_events;
begin
  perform t.as_user(v_uid);

  -- A normal settlement: priced from the provider's counts, the rest of the hold released.
  -- gemini-flash-latest: $0.75 in, $0.075 cached, $3.75 out per million tokens.
  v_res := public.reserve_usage('unrep-normal', 'gemini-flash-latest', 2000, false, 8000, 'chat', 'standard');
  perform public.settle_usage((v_res->>'reservationId')::uuid, 'unrep-normal-event', 2000, 300, 800, 500);
  select * into e from public.usage_bucket_events where usage_event_id = 'unrep-normal-event';
  -- 1,200 fresh × 0.75 + 800 cached × 0.075 + (300 + 500 reasoning) × 3.75 = 900 + 60 + 3,000 = 3,960
  perform t.check('X: a reported call is priced from input, cached, output and reasoning tokens (3,960 micro-USD)',
    e.actual_cost_micro_usd = 3960 and e.charged_micro_usd = 3960 and e.settlement = 'reported' and e.thoughts_tokens = 500, row_to_json(e)::text);
  select * into b from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';
  perform t.check('X: the unused part of its hold was released', b.reserved_micro_usd = 0 and b.consumed_micro_usd = 3960, b.consumed_micro_usd::text);

  -- A settlement with no usage metadata.
  v_res := public.reserve_usage('unrep-missing', 'gemini-flash-latest', 2000, false, 8000, 'chat', 'standard');
  select reserved_micro_usd into v_held from public.usage_bucket_reservations where id = (v_res->>'reservationId')::uuid;
  perform public.settle_usage((v_res->>'reservationId')::uuid, 'unrep-missing-event', 0, 0, 0, 0);
  select * into e from public.usage_bucket_events where usage_event_id = 'unreported:unrep-missing-event';
  perform t.check('X: a settlement with no usage is charged the full hold, not zero',
    v_held > 0 and e.charged_micro_usd = v_held and e.actual_cost_micro_usd = v_held, format('held %s charged %s', v_held, e.charged_micro_usd));
  perform t.check('X: and it is recorded as unreported, not as a priced call', e.settlement = 'timeout' and e.prompt_tokens = 0);

  -- The same with nulls, and with output but no prompt (which no completed call has).
  v_res := public.reserve_usage('unrep-null', 'gemini-flash-latest', 2000, false, 8000, 'chat', 'standard');
  select reserved_micro_usd into v_held from public.usage_bucket_reservations where id = (v_res->>'reservationId')::uuid;
  perform public.settle_usage((v_res->>'reservationId')::uuid, 'unrep-null-event', null, null, null, null);
  perform t.check('X: null counts are unknown too — the full hold is charged',
    (select charged_micro_usd = v_held from public.usage_bucket_events where usage_event_id = 'unreported:unrep-null-event'));
  v_res := public.reserve_usage('unrep-partial', 'gemini-flash-latest', 2000, false, 8000, 'chat', 'standard');
  select reserved_micro_usd into v_held from public.usage_bucket_reservations where id = (v_res->>'reservationId')::uuid;
  perform public.settle_usage((v_res->>'reservationId')::uuid, 'unrep-partial-event', 0, 400, 0, 0);
  perform t.check('X: output without a prompt is not a usable report either',
    (select charged_micro_usd = v_held and settlement = 'timeout' from public.usage_bucket_events where usage_event_id = 'unreported:unrep-partial-event'));

  -- Settling twice never charges twice.
  select * into b from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';
  perform public.settle_usage((v_res->>'reservationId')::uuid, 'unrep-partial-event-again', 5000, 5000, 0, 0);
  perform t.check('X: a second settlement of the same reservation charges nothing more',
    (select consumed_micro_usd = b.consumed_micro_usd from public.usage_buckets where id = b.id)
    and not exists (select 1 from public.usage_bucket_events where usage_event_id = 'unrep-partial-event-again'));

  -- The ledger tells an unreported call from one that ran out of time, with no new status.
  v_res := public.reserve_usage('unrep-expired', 'gemini-flash-latest', 2000, false, 8000, 'chat', 'standard');
  select reserved_micro_usd into v_held from public.usage_bucket_reservations where id = (v_res->>'reservationId')::uuid;
  perform t.as_service();
  update public.usage_bucket_reservations set expires_at = now() - interval '1 second' where id = (v_res->>'reservationId')::uuid;
  perform public.pawos_bucket_housekeeping(v_uid);
  perform t.as_user(v_uid);
  perform t.check('X: a reservation that ran out of time is keyed timeout:<reservation>, an unreported call unreported:<event>',
    (select count(*) = 1 from public.usage_bucket_events where usage_event_id = 'timeout:' || (v_res->>'reservationId') and settlement = 'timeout' and charged_micro_usd = v_held)
    and (select count(*) = 3 from public.usage_bucket_events where user_id = v_uid and usage_event_id like 'unreported:%' and settlement = 'timeout'));
  -- Usage that arrives after the reservation was closed cannot be applied: it is neither charged again
  -- nor refunded. (The full hold stands — the engine's rule that skipping settlement never saves money.)
  select * into b from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';
  perform public.settle_usage((v_res->>'reservationId')::uuid, 'unrep-expired-late', 2000, 300, 0, 0);
  perform t.check('X: usage reported after a reservation was closed is not charged a second time, and adds no ledger row',
    (select consumed_micro_usd = b.consumed_micro_usd and reserved_micro_usd = 0 from public.usage_buckets where id = b.id)
    and not exists (select 1 from public.usage_bucket_events where usage_event_id in ('unrep-expired-late', 'unreported:unrep-expired-late')));

  -- Released, then settled: nothing is charged. Settled, then released: nothing is given back.
  v_res := public.reserve_usage('unrep-rel-then-settle', 'gemini-flash-latest', 2000, false, 8000, 'chat', 'standard');
  perform public.release_usage_reservation((v_res->>'reservationId')::uuid);
  perform public.settle_usage((v_res->>'reservationId')::uuid, 'unrep-rel-then-settle-event', 0, 0, 0, 0);
  perform public.settle_usage((v_res->>'reservationId')::uuid, 'unrep-rel-then-settle-event-2', 2000, 8000, 0, 0);
  perform t.check('X: a released reservation cannot be charged afterwards, reported or not',
    (select consumed_micro_usd = b.consumed_micro_usd and reserved_micro_usd = 0 from public.usage_buckets where id = b.id)
    and not exists (select 1 from public.usage_bucket_events where usage_event_id like '%unrep-rel-then-settle-event%'));
  v_res := public.reserve_usage('unrep-settle-then-rel', 'gemini-flash-latest', 2000, false, 8000, 'chat', 'standard');
  perform public.settle_usage((v_res->>'reservationId')::uuid, 'unrep-settle-then-rel-event', 2000, 300, 0, 0);
  perform public.release_usage_reservation((v_res->>'reservationId')::uuid);
  -- 2,000 × 0.75 + 300 × 3.75 = 2,625
  perform t.check('X: a settled reservation cannot be released to undo its charge',
    (select consumed_micro_usd = b.consumed_micro_usd + 2625 and reserved_micro_usd = 0 from public.usage_buckets where id = b.id));
  -- The same request key reserves once: a retried request cannot hold (or be charged) twice.
  v_res := public.reserve_usage('unrep-same-key', 'gemini-flash-latest', 2000, false, 8000, 'chat', 'standard');
  perform t.check('X: reserving again with the same request key returns the same reservation, not a second hold',
    (public.reserve_usage('unrep-same-key', 'gemini-flash-latest', 2000, false, 8000, 'chat', 'standard')->>'reservationId') = v_res->>'reservationId'
    and (select count(*) = 1 from public.usage_bucket_reservations where user_id = v_uid and state = 'held'));
  perform public.release_usage_reservation((v_res->>'reservationId')::uuid);
  -- A full-hold charge never exceeds the reservation, so it can never overspend the bucket.
  perform t.check('X: no ledger row for this account charges more than was reserved for it',
    not exists (select 1 from public.usage_bucket_events e2 join public.usage_bucket_reservations r2 on r2.id = e2.reservation_id where e2.user_id = v_uid and e2.charged_micro_usd > r2.reserved_micro_usd));
  select * into b from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';

  -- A call that failed before any usage is still released for nothing.
  v_res := public.reserve_usage('unrep-release', 'gemini-flash-latest', 2000, false, 8000, 'chat', 'standard');
  perform public.release_usage_reservation((v_res->>'reservationId')::uuid);
  perform t.check('X: a released reservation still costs nothing',
    (select consumed_micro_usd = b.consumed_micro_usd and reserved_micro_usd = 0 from public.usage_buckets where id = b.id));

  -- A price change does not rewrite history: the earlier event keeps the price it was charged at.
  perform t.as_service();
  update public.model_prices set effective_until = now() where model = 'gemini-flash-latest' and version = 1;
  insert into public.model_prices (model, version, input_usd_per_mtok, cached_input_usd_per_mtok, output_usd_per_mtok, effective_from, note)
    values ('gemini-flash-latest', 2, 1.50, 0.15, 7.50, now(), 'test: doubled');
  perform t.as_user(v_uid);
  v_res := public.reserve_usage('unrep-v2', 'gemini-flash-latest', 2000, false, 8000, 'chat', 'standard');
  perform public.settle_usage((v_res->>'reservationId')::uuid, 'unrep-v2-event', 2000, 300, 800, 500);
  perform t.check('X: after a price change a new call is priced at the new version (7,920 micro-USD)',
    (select actual_cost_micro_usd = 7920 from public.usage_bucket_events where usage_event_id = 'unrep-v2-event'));
  perform t.check('X: and the earlier call keeps its own price version and cost',
    (select e1.actual_cost_micro_usd = 3960 and e1.price_id <> e2.price_id
     from public.usage_bucket_events e1, public.usage_bucket_events e2
     where e1.usage_event_id = 'unrep-normal-event' and e2.usage_event_id = 'unrep-v2-event'));
  perform t.as_service();
  update public.model_prices set active = false where model = 'gemini-flash-latest' and version = 2;
  update public.model_prices set effective_until = '2027-01-01' where model = 'gemini-flash-latest' and version = 1;

  perform t.check('X: every bucket invariant still holds', t.invariants_hold());
end $$;

-- Another account cannot settle someone else's reservation, reported or not.
do $$
declare
  v_res jsonb;
begin
  perform t.as_user('a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3');
  v_res := public.reserve_usage('unrep-other', 'gemini-flash-latest', 2000, false, 8000, 'chat', 'standard');
  perform t.as_user('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1');
  begin
    perform public.settle_usage((v_res->>'reservationId')::uuid, 'unrep-other-event', 0, 0, 0, 0);
    perform t.check('X: another account cannot close someone else''s reservation', false);
  exception when others then
    perform t.check('X: another account cannot close someone else''s reservation', sqlerrm like 'reservation_not_found%', sqlerrm);
  end;
  perform t.as_user('a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3');
  perform public.release_usage_reservation((v_res->>'reservationId')::uuid);
end $$;

-- The display helper is internal: a client cannot call it with numbers of its own.
set role authenticated;
do $$
begin
  begin
    perform public.pawos_usage_display_percent(1, 2);
    insert into t.results (name, ok) values ('Security: clients cannot call the display helper directly', false);
  exception when insufficient_privilege then
    insert into t.results (name, ok) values ('Security: clients cannot call the display helper directly', true);
  end;
  begin
    perform public.pawos_usage_display_share(1, 2);
    insert into t.results (name, ok) values ('Security: clients cannot call the display-share helper directly', false);
  exception when insufficient_privilege then
    insert into t.results (name, ok) values ('Security: clients cannot call the display-share helper directly', true);
  end;
end $$;
reset role;

-- ═══ Y: Team seats — one allowance per member, from the seat's own price ════════════════════════
-- Stand-ins for the two organization tables the seat migration reads (their own migrations are not
-- under test here), then the real 20261004070000_team_seat_usage.sql, applied by run.mjs before this file.
insert into auth.users (id, email) values
  ('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', 'team-standard@test'),
  ('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', 'team-premium@test'),
  ('b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3', 'team-standard-2@test'),
  ('b4b4b4b4-b4b4-4b4b-8b4b-b4b4b4b4b4b4', 'enterprise-member@test');
insert into public.organizations (id, tier) values
  ('c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'team'),
  ('c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', 'enterprise');
insert into public.organization_members (organization_id, user_id, seat_tier, status) values
  ('c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', 'standard', 'active'),
  ('c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', 'premium', 'active'),
  ('c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3', 'standard', 'active'),
  ('c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', 'b4b4b4b4-b4b4-4b4b-8b4b-b4b4b4b4b4b4', 'standard', 'active');

do $$
declare
  v_sum jsonb;
  v_res jsonb;
begin
  perform t.as_user('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1');
  v_sum := public.get_my_usage_summary();
  perform t.check('Y: a Team Standard seat ($20) gets its own $10 allowance',
    (select count(*) = 1 and min(private_allowance_micro_usd) = 10000000 and min(customer_value_cents) = 2000 and min(product_key) = 'team_standard_monthly'
     from public.usage_buckets where user_id = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'));
  perform t.as_user('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2');
  perform public.get_my_usage_summary();
  perform t.check('Y: a Team Premium seat ($100) gets its own $50 allowance',
    (select count(*) = 1 and min(private_allowance_micro_usd) = 50000000 and min(customer_value_cents) = 10000 and min(product_key) = 'team_premium_monthly'
     from public.usage_buckets where user_id = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2'));
  perform t.as_user('b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3');
  perform public.get_my_usage_summary();

  -- One member's spending is theirs alone: it is not the organization's budget.
  v_res := t.spend_one('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', 'gemini-flash-latest', 5000);
  perform t.check('Y: a member''s call is funded by their own seat', (v_res->>'ok')::boolean, v_res::text);
  perform t.check('Y: one member''s usage does not touch another member''s seat',
    (select consumed_micro_usd > 0 from public.usage_buckets where user_id = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1')
    and (select consumed_micro_usd = 0 and reserved_micro_usd = 0 from public.usage_buckets where user_id = 'b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3')
    and (select consumed_micro_usd = 0 from public.usage_buckets where user_id = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2'));
  perform t.check('Y: three seats are three allowances ($10 + $50 + $10), never one seat''s price for the organization',
    (select sum(private_allowance_micro_usd) = 70000000 from public.usage_buckets where subscription_id like 'org:c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1:%'));
  perform t.as_user('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1');
  perform public.get_my_usage_summary();
  perform t.check('Y: asking again never creates a second seat allowance in the same month',
    (select count(*) = 1 from public.usage_buckets where user_id = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'));

  -- A seat is shown by the same rule as the plan it matches.
  perform t.check('Y: a Team Standard seat at $9.50 used shows 97% and $19.40 of $20',
    (select (s->>'percentUsed')::int = 97 and (s->>'amountUsedCents')::int = 1940 and (s->>'amountPaidCents')::int = 2000
     from t.shown('b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3', (select id from public.usage_buckets where user_id = 'b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3'), 9500000) s));
  perform t.check('Y: a Team Premium seat at $49 used shows 100% and $100 of $100',
    (select (s->>'percentUsed')::int = 100 and (s->>'amountUsedCents')::int = 10000 and (s->>'amountPaidCents')::int = 10000
     from t.shown('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', (select id from public.usage_buckets where user_id = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2'), 49000000) s));

  -- Enterprise is a contract, not a seat product: no allowance is invented for it here.
  perform t.as_user('b4b4b4b4-b4b4-4b4b-8b4b-b4b4b4b4b4b4');
  v_sum := public.get_my_usage_summary();
  perform t.check('Y: an Enterprise member gets no plan allowance from the seat products',
    not exists (select 1 from public.usage_buckets where user_id = 'b4b4b4b4-b4b4-4b4b-8b4b-b4b4b4b4b4b4') and (v_sum->>'bucketFunded')::boolean = false, v_sum::text);
end $$;

-- ═══ Z: buckets stay separate, in the agreed order ══════════════════════════════════════════════
insert into auth.users (id, email) values ('d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'order@test');
insert into public.pawos_subscriptions (id, user_id, tier, status, current_period_start, current_period_end, source, billing_frequency)
values ('sub_order', 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'pro', 'active', now() - interval '8 days', now() + interval '22 days', 'test', 'monthly');
do $$
declare
  v_uid uuid := 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1';
  v_res jsonb;
  v_plan uuid;
  v_credits uuid;
begin
  perform t.as_user(v_uid);
  perform public.get_my_usage_summary();
  perform t.as_service();
  perform public.add_usage_credits_service(v_uid, null, 15, 'pay_order_credits');
  select id into v_plan from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';
  select id into v_credits from public.usage_buckets where user_id = v_uid and source_type = 'purchased_credits';
  perform t.check('Z: a $15 credit purchase is a separate bucket worth $10.50 of private allowance',
    (select private_allowance_micro_usd = 10500000 and customer_pc = 1500 from public.usage_buckets where id = v_credits));

  v_res := t.spend_one(v_uid, 'gemini-flash-latest', 5000);
  perform t.check('Z: the plan is used first', (v_res->>'bucketId')::uuid = v_plan, v_res::text);

  -- The plan is spent; the credits take over, and only what they hold can be used.
  update public.usage_buckets set consumed_micro_usd = private_allowance_micro_usd, status = 'exhausted' where id = v_plan;
  v_res := t.spend_one(v_uid, 'gemini-flash-latest', 5000);
  perform t.check('Z: when the plan is used up, the credits fund the call', (v_res->>'bucketId')::uuid = v_credits, v_res::text);
  perform t.check('Z: the plan bucket did not grow because credits were bought',
    (select private_allowance_micro_usd = 10000000 and consumed_micro_usd = 10000000 from public.usage_buckets where id = v_plan));
  v_res := t.spend_until_denied(v_uid, 'gemini-3.1-pro-preview', 100000);
  perform t.check('Z: spending stops when the credits are gone — never past what was bought',
    (select consumed_micro_usd <= private_allowance_micro_usd from public.usage_buckets where id = v_credits)
    and v_res->>'reason' in ('plan_exhausted', 'no_allowance'), v_res::text);
  perform t.check('Z: every bucket invariant still holds', t.invariants_hold());
end $$;
