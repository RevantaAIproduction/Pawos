-- Usage bucket scenario tests. Run by run.mjs against a throwaway local cluster (never production).
-- Every check writes a row to t.results; run.mjs prints them and fails on any false.
\set ON_ERROR_STOP 1

create schema t;
create table t.results (seq serial, name text, ok boolean, detail text);
create function t.check(p_name text, p_ok boolean, p_detail text default '') returns void language plpgsql as $$
begin
  insert into t.results (name, ok, detail) values (p_name, coalesce(p_ok, false), coalesce(p_detail, ''));
end $$;
grant usage on schema t to authenticated;
grant insert on t.results to authenticated;
grant usage on sequence t.results_seq_seq to authenticated;

-- Act as a signed-in user / as pawos-web's service role.
create function t.as_user(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, false), set_config('request.jwt.claim.role', 'authenticated', false);
$$;
create function t.as_service() returns void language sql as $$
  select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'service_role', false);
$$;

-- Reserves one call and settles it at exactly the reserved worst case (input tokens + the full
-- granted output). Returns the reserve result (with the bucket it used) or the denial.
create function t.spend_one(p_uid uuid, p_model text, p_input integer) returns jsonb language plpgsql as $$
declare
  v_res jsonb;
  v_bucket uuid;
begin
  perform t.as_user(p_uid);
  v_res := public.reserve_usage(gen_random_uuid()::text, p_model, p_input, false, 8000, 'chat', 'standard');
  if (v_res->>'ok')::boolean then
    select bucket_id into v_bucket from public.usage_bucket_reservations where id = (v_res->>'reservationId')::uuid;
    perform public.settle_usage((v_res->>'reservationId')::uuid, gen_random_uuid()::text, p_input, (v_res->>'maxOutputTokens')::integer, 0, 0);
    v_res := v_res || jsonb_build_object('bucketId', v_bucket);
  end if;
  return v_res;
end $$;

-- Spends calls until one is denied; returns the denial.
create function t.spend_until_denied(p_uid uuid, p_model text, p_input integer) returns jsonb language plpgsql as $$
declare
  v_res jsonb;
  i integer := 0;
begin
  loop
    i := i + 1;
    if i > 2000 then raise exception 'spend_until_denied: no denial after 2000 calls'; end if;
    v_res := t.spend_one(p_uid, p_model, p_input);
    if not (v_res->>'ok')::boolean then return v_res; end if;
  end loop;
end $$;

-- Every bucket's invariants hold.
create function t.invariants_hold() returns boolean language sql as $$
  select not exists (
    select 1 from public.usage_buckets
    where consumed_micro_usd < 0 or reserved_micro_usd < 0 or consumed_micro_usd + reserved_micro_usd > private_allowance_micro_usd
  );
$$;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'pro@test'),
  ('22222222-2222-2222-2222-222222222222', 'legacy@test'),
  ('33333333-3333-3333-3333-333333333333', 'credits@test'),
  ('44444444-4444-4444-4444-444444444444', 'yearly@test'),
  ('55555555-5555-5555-5555-555555555555', 'upgrade@test'),
  ('66666666-6666-6666-6666-666666666666', 'renewal@test'),
  ('77777777-7777-7777-7777-777777777777', 'other@test'),
  ('88888888-8888-8888-8888-888888888888', 'concurrency@test'),
  ('12121212-1212-1212-1212-121212121212', 'future@test'),
  ('13131313-1313-1313-1313-131313131313', 'novariant@test');

-- ═══ A–G: Pro plan, weekly pacing, mid-month, credits ═══════════════════════════════════════════
insert into public.pawos_subscriptions (id, user_id, tier, status, current_period_start, current_period_end, source, billing_frequency)
values ('sub_pro', '11111111-1111-1111-1111-111111111111', 'pro', 'active', now() - interval '3 days', now() + interval '27 days', 'test', 'monthly');

do $$
declare
  v_uid uuid := '11111111-1111-1111-1111-111111111111';
  v_sum jsonb;
  b public.usage_buckets;
begin
  perform t.as_user(v_uid);
  v_sum := public.get_my_usage_summary();
  select * into b from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';
  perform t.check('A: Pro subscription creates exactly one monthly plan bucket',
    (select count(*) from public.usage_buckets where user_id = v_uid) = 1);
  perform t.check('A: Pro bucket private allowance is $10', b.private_allowance_micro_usd = 10000000);
  perform t.check('A: Pro bucket customer value is $20 / 2,000 PC', b.customer_value_cents = 2000 and b.customer_pc = 2000);
  perform t.check('A: Pro bucket expires at the subscription period end',
    b.expires_at = (select current_period_end from public.pawos_subscriptions where id = 'sub_pro'));
  perform t.check('A: summary shows 2,000 PC, nothing used',
    (v_sum->'buckets'->0->>'pcTotal')::int = 2000 and (v_sum->'buckets'->0->>'pcRemaining')::int = 2000);
  perform t.check('B: Pro weekly pacing is $5', b.weekly_pacing_micro_usd = 5000000);
  perform t.check('B: summary weekly pacing limit is 1,000 PC (half the plan)', (v_sum->'weeklyPacing'->>'pcLimit')::int = 1000);
  -- a second summary call never creates a second bucket
  perform public.get_my_usage_summary();
  perform t.check('A: plan bucket creation is idempotent', (select count(*) from public.usage_buckets where user_id = v_uid) = 1);
end $$;

do $$
declare
  v_uid uuid := '11111111-1111-1111-1111-111111111111';
  v_res jsonb;
  b public.usage_buckets;
begin
  v_res := t.spend_until_denied(v_uid, 'gemini-3.1-pro-preview', 100000);
  select * into b from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';
  perform t.check('C: Pro plan stops at the weekly pace with monthly allowance left',
    v_res->>'reason' = 'plan_weekly_paced', v_res::text);
  perform t.check('B: week 1 spend never exceeds the $5 weekly pace', b.consumed_micro_usd <= 5000000, b.consumed_micro_usd::text);
  perform t.check('B: week 1 spend reaches the pace (within one minimum call)', b.consumed_micro_usd > 5000000 - 212288, b.consumed_micro_usd::text);
  perform t.check('C: monthly allowance is not reduced by pacing (about $5 left)',
    b.private_allowance_micro_usd - b.consumed_micro_usd >= 5000000, (b.private_allowance_micro_usd - b.consumed_micro_usd)::text);
  perform t.check('C: summary reports limitReached = plan_weekly_paced with a reset time',
    (v_res->'summary'->>'limitReason') = 'plan_weekly_paced' and (v_res->'summary'->>'limitResetsAt') is not null);
end $$;

-- D: credits purchased while paced are NOT consumed.
do $$
declare
  v_uid uuid := '11111111-1111-1111-1111-111111111111';
  v_res jsonb;
  c public.usage_buckets;
begin
  perform t.as_service();
  perform public.add_usage_credits_service(v_uid, null, 10, 'pay_pro_credits');
  v_res := t.spend_one(v_uid, 'gemini-3.1-pro-preview', 1000);
  select * into c from public.usage_buckets where purchase_ref = 'pay:pay_pro_credits';
  perform t.check('D: still denied as weekly-paced even though credits exist', v_res->>'reason' = 'plan_weekly_paced', v_res::text);
  perform t.check('D: credits untouched while the plan is only paced', c.consumed_micro_usd = 0 and c.reserved_micro_usd = 0);
  perform t.check('D: $10 credits = 1,000 PC with a $7 private allowance',
    c.customer_value_cents = 1000 and c.customer_pc = 1000 and c.private_allowance_micro_usd = 7000000);
end $$;

-- E: mid-month purchase, then the plan's monthly allowance runs out → the mid-month bucket funds the next call.
do $$
declare
  v_uid uuid := '11111111-1111-1111-1111-111111111111';
  v_offer jsonb;
  v_grant jsonb;
  v_res jsonb;
  v_plan public.usage_buckets;
  v_mid public.usage_buckets;
  v_credits public.usage_buckets;
  i integer := 0;
begin
  perform t.as_service();
  v_offer := public.pawos_mid_month_offer(v_uid);
  perform t.check('E: mid-month offer for Pro is $15 / 1,500 PC',
    v_offer->>'productKey' = 'pro_mid_month' and (v_offer->>'priceCents')::int = 1500 and (v_offer->>'pc')::int = 1500, v_offer::text);
  v_grant := public.grant_mid_month_bucket_service(v_uid, 'pay_mid_1', 'pro_mid_month', (v_offer->>'planBucketId')::uuid, 1500);
  select * into v_mid from public.usage_buckets where purchase_ref = 'pay:pay_mid_1';
  select * into v_plan from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';
  perform t.check('E: mid-month bucket has a $9 private allowance and 1,500 PC',
    v_mid.private_allowance_micro_usd = 9000000 and v_mid.customer_pc = 1500);
  perform t.check('F: mid-month bucket expires at the parent plan period end', v_mid.expires_at = v_plan.expires_at);
  perform t.check('E: a wrong mid-month amount is rejected', not exists (select 1 from public.usage_buckets where purchase_ref = 'pay:pay_mid_bad'));
  begin
    perform public.grant_mid_month_bucket_service(v_uid, 'pay_mid_bad', 'pro_mid_month', v_plan.id, 1000);
    perform t.check('E: grant with the wrong amount raises', false);
  exception when others then
    perform t.check('E: grant with the wrong amount raises', true);
  end;
  -- granting the same payment twice is a no-op
  v_grant := public.grant_mid_month_bucket_service(v_uid, 'pay_mid_1', 'pro_mid_month', v_plan.id, 1500);
  perform t.check('E: mid-month grant is idempotent', (v_grant->>'alreadyGranted')::boolean
    and (select count(*) from public.usage_buckets where purchase_ref = 'pay:pay_mid_1') = 1);

  -- Spend the plan to exhaustion, moving to the next pacing week whenever it is paced.
  loop
    i := i + 1;
    if i > 3000 then raise exception 'E: plan never moved to the next bucket'; end if;
    perform t.as_user(v_uid);
    v_res := public.reserve_usage(gen_random_uuid()::text, 'gemini-3.1-pro-preview', 100000, false, 8000, 'chat', 'standard');
    if not (v_res->>'ok')::boolean then
      if v_res->>'reason' = 'plan_weekly_paced' then
        update public.usage_buckets set period_start = period_start - interval '7 days' where id = v_plan.id; -- next week
        continue;
      end if;
      raise exception 'E: unexpected denial %', v_res;
    end if;
    if (select bucket_id from public.usage_bucket_reservations where id = (v_res->>'reservationId')::uuid) <> v_plan.id then
      exit;
    end if;
    perform public.settle_usage((v_res->>'reservationId')::uuid, gen_random_uuid()::text, 100000, (v_res->>'maxOutputTokens')::integer, 0, 0);
  end loop;

  select * into v_plan from public.usage_buckets where id = v_plan.id;
  select * into v_credits from public.usage_buckets where purchase_ref = 'pay:pay_pro_credits';
  perform t.check('E: once the plan cannot fund the call, the mid-month bucket funds it',
    (select bucket_id from public.usage_bucket_reservations where id = (v_res->>'reservationId')::uuid) = v_mid.id);
  perform t.check('E: plan consumed never exceeds its $10 allowance', v_plan.consumed_micro_usd <= 10000000, v_plan.consumed_micro_usd::text);
  perform t.check('E: credits are still untouched (mid-month comes first)', v_credits.consumed_micro_usd = 0 and v_credits.reserved_micro_usd = 0);
  perform public.release_usage_reservation((v_res->>'reservationId')::uuid);
end $$;

-- F + G: the period ends → mid-month expires with it; the next call is funded by credits.
do $$
declare
  v_uid uuid := '11111111-1111-1111-1111-111111111111';
  v_res jsonb;
  v_mid public.usage_buckets;
  v_credits public.usage_buckets;
  v_sum jsonb;
begin
  update public.pawos_subscriptions set current_period_end = now() - interval '1 second', status = 'cancelled' where id = 'sub_pro';
  update public.usage_buckets set expires_at = now() - interval '1 second'
  where user_id = '11111111-1111-1111-1111-111111111111' and source_type in ('monthly_plan', 'mid_month_purchase');
  v_res := t.spend_one(v_uid, 'gemini-3.1-pro-preview', 1000);
  select * into v_mid from public.usage_buckets where purchase_ref = 'pay:pay_mid_1';
  select * into v_credits from public.usage_buckets where purchase_ref = 'pay:pay_pro_credits';
  perform t.check('F: mid-month bucket is expired after the parent period ends', v_mid.status = 'expired', v_mid.status);
  perform t.check('F: monthly plan bucket is expired after its period ends',
    (select status from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan') = 'expired');
  perform t.check('G: with plan and mid-month gone, credits fund the call', (v_res->>'bucketId')::uuid = v_credits.id, v_res::text);
  perform t.check('G: credits consumed > 0 and within allowance',
    v_credits.consumed_micro_usd > 0 and v_credits.consumed_micro_usd <= v_credits.private_allowance_micro_usd);
  perform t.as_user(v_uid);
  v_sum := public.get_my_usage_summary();
  perform t.check('G: summary is not limit-reached while credits remain', not (v_sum->>'limitReached')::boolean, v_sum::text);
  perform t.check('A–G: all bucket invariants hold', t.invariants_hold());
end $$;

-- ═══ H / I: legacy $10 wallet migration ════════════════════════════════════════════════════════
insert into public.user_usage_credits (user_id, balance_usd) values ('22222222-2222-2222-2222-222222222222', 10.000000);

do $$
declare
  v_uid uuid := '22222222-2222-2222-2222-222222222222';
  v_dry jsonb;
  v_run jsonb;
  v_again jsonb;
  w record;
  b public.usage_buckets;
  v_sum jsonb;
begin
  perform t.as_service();
  v_dry := public.migrate_legacy_usage_credits(true);
  perform t.check('H: dry run reports the $10 wallet as would_migrate',
    (select count(*) from jsonb_array_elements(v_dry->'wallets') x where x->>'userId' = v_uid::text and x->>'action' = 'would_migrate') = 1, v_dry::text);
  perform t.check('H: dry run keeps the full customer value ($10 = 1,000 PC) with a $7 private allowance',
    exists (select 1 from jsonb_array_elements(v_dry->'wallets') x
            where x->>'userId' = v_uid::text and (x->>'customerValueCents')::int = 1000 and (x->>'customerPc')::int = 1000
              and (x->>'privateAllowanceMicroUsd')::bigint = 7000000));
  perform t.check('H: dry run changes nothing',
    not exists (select 1 from public.usage_buckets where user_id = v_uid)
    and (select balance_usd from public.user_usage_credits where user_id = v_uid) = 10
    and (select migrated_at from public.user_usage_credits where user_id = v_uid) is null);

  v_run := public.migrate_legacy_usage_credits(false);
  select * into w from public.user_usage_credits where user_id = v_uid;
  select * into b from public.usage_buckets where user_id = v_uid;
  perform t.check('H: migration creates one purchased_credits bucket: $10 value, 1,000 PC, $7 private, no expiry',
    b.source_type = 'purchased_credits' and b.customer_value_cents = 1000 and b.customer_pc = 1000
    and b.private_allowance_micro_usd = 7000000 and b.expires_at is null and b.purchase_ref = 'legacy:user_usage_credits:' || v_uid::text,
    row_to_json(b)::text);
  perform t.check('H: legacy wallet is marked migrated, zeroed, and keeps its original balance for audit',
    w.migrated_at is not null and w.balance_usd = 0 and w.legacy_balance_usd_at_migration = 10 and w.migrated_bucket_id = b.id);
  perform t.check('H: migration audit row recorded',
    exists (select 1 from public.legacy_usage_credit_migrations where user_id = v_uid and legacy_balance_usd = 10 and bucket_id = b.id));

  v_again := public.migrate_legacy_usage_credits(false);
  perform t.check('I: second real run reports already_migrated',
    exists (select 1 from jsonb_array_elements(v_again->'wallets') x where x->>'userId' = v_uid::text and x->>'action' = 'already_migrated'));
  perform t.check('I: migration run twice still leaves exactly one migrated bucket',
    (select count(*) from public.usage_buckets where user_id = v_uid) = 1);
  perform t.check('I: dry run after migration also reports already_migrated',
    exists (select 1 from jsonb_array_elements(public.migrate_legacy_usage_credits(true)->'wallets') x where x->>'userId' = v_uid::text and x->>'action' = 'already_migrated'));

  perform t.as_user(v_uid);
  v_sum := public.get_my_usage_summary();
  perform t.check('H: customer sees $10 credits as 1,000 PC remaining',
    (v_sum->'buckets'->0->>'amountPaidCents')::int = 1000 and (v_sum->'buckets'->0->>'pcRemaining')::int = 1000
    and (v_sum->>'creditsPcRemaining')::int = 1000, v_sum::text);
end $$;

-- ═══ J, K, L, M, N, O, P: reservation mechanics on a credits-only account ═══════════════════════
do $$
declare
  v_uid uuid := '33333333-3333-3333-3333-333333333333';
  c public.usage_buckets;
  v_res jsonb;
  r public.usage_bucket_reservations;
  v_before bigint;
begin
  perform t.as_service();
  perform public.add_usage_credits_service(v_uid, null, 5, 'pay_c5');
  perform public.add_usage_credits_service(v_uid, null, 5, 'pay_c5'); -- duplicate webhook / verify
  perform t.check('Duplicate credit grant for the same payment creates one bucket',
    (select count(*) from public.usage_buckets where user_id = v_uid) = 1);
  select * into c from public.usage_buckets where purchase_ref = 'pay:pay_c5';
  perform t.check('Credits: $5 → 500 PC, $3.50 private', c.customer_pc = 500 and c.private_allowance_micro_usd = 3500000);

  -- J: a call whose worst case is bigger than the whole bucket is denied before Gemini.
  perform t.as_user(v_uid);
  v_res := public.reserve_usage('j-1', 'gemini-3.1-pro-preview', 1000000, false, 8000, 'chat', 'standard');
  select * into c from public.usage_buckets where id = c.id;
  perform t.check('J: reservation larger than the bucket is denied', not (v_res->>'ok')::boolean and v_res->>'reason' = 'no_allowance', v_res::text);
  perform t.check('J: a denied reservation holds nothing', c.reserved_micro_usd = 0);

  -- O: partial grant when the room fits more than 1,024 but fewer than 8,000 output tokens.
  update public.usage_buckets set consumed_micro_usd = private_allowance_micro_usd - 400000 where id = c.id;
  v_res := public.reserve_usage('o-1', 'gemini-3.1-pro-preview', 190000, false, 8000, 'chat', 'standard');
  select * into r from public.usage_bucket_reservations where id = (v_res->>'reservationId')::uuid;
  perform t.check('O: output grant shrinks to fit the room (1,666 tokens)', (v_res->>'maxOutputTokens')::int = 1666, v_res::text);
  perform t.check('O: shrunk reservation still fits the room', r.reserved_micro_usd <= 400000 and r.reserved_micro_usd = 380000 + 19992);
  perform public.release_usage_reservation(r.id);
  update public.usage_buckets set consumed_micro_usd = private_allowance_micro_usd - 390000 where id = c.id;
  v_res := public.reserve_usage('o-2', 'gemini-3.1-pro-preview', 190000, false, 8000, 'chat', 'standard');
  perform t.check('O: below 1,024 grantable output tokens the call is denied', not (v_res->>'ok')::boolean, v_res::text);
  update public.usage_buckets set consumed_micro_usd = 0 where id = c.id;

  -- L: actual cost below the reservation → only the actual is charged, the rest released.
  v_res := public.reserve_usage('l-1', 'gemini-3.1-pro-preview', 1000, false, 8000, 'chat', 'standard');
  select * into r from public.usage_bucket_reservations where id = (v_res->>'reservationId')::uuid;
  perform t.check('L: full grant reserves input + 8,000 output tokens (2,000 + 96,000)', r.reserved_micro_usd = 98000 and r.granted_max_output_tokens = 8000);
  perform t.check('K: reserved amount is held on the bucket', (select reserved_micro_usd from public.usage_buckets where id = c.id) = 98000);
  perform public.settle_usage(r.id, 'evt-l-1', 1000, 100, 0, 50);
  select * into c from public.usage_buckets where id = c.id;
  perform t.check('L: settlement charges the actual cost (2,000 + 150×12 = 3,800)', c.consumed_micro_usd = 3800, c.consumed_micro_usd::text);
  perform t.check('L: unused reservation released', c.reserved_micro_usd = 0);
  perform t.check('L: usage event records bucket and reservation',
    exists (select 1 from public.usage_bucket_events where usage_event_id = 'evt-l-1' and bucket_id = c.id and reservation_id = r.id and charged_micro_usd = 3800));
  -- settling again is a no-op
  perform public.settle_usage(r.id, 'evt-l-1', 1000, 100, 0, 50);
  perform t.check('L: settling twice charges once', (select consumed_micro_usd from public.usage_buckets where id = c.id) = 3800);

  -- Cached input is billed at the cached rate.
  v_res := public.reserve_usage('l-2', 'gemini-3.1-pro-preview', 10000, false, 8000, 'chat', 'standard');
  v_before := (select consumed_micro_usd from public.usage_buckets where id = c.id);
  perform public.settle_usage((v_res->>'reservationId')::uuid, 'evt-l-2', 10000, 0, 8000, 0);
  perform t.check('L: cached tokens priced at the cached rate (2,000×2 + 8,000×0.2 = 5,600)',
    (select consumed_micro_usd from public.usage_buckets where id = c.id) - v_before = 5600);

  -- M: Gemini failed with no usage → reservation released, nothing charged.
  v_before := (select consumed_micro_usd from public.usage_buckets where id = c.id);
  v_res := public.reserve_usage('m-1', 'gemini-3.1-pro-preview', 1000, false, 8000, 'chat', 'standard');
  perform public.release_usage_reservation((v_res->>'reservationId')::uuid);
  select * into c from public.usage_buckets where id = c.id;
  perform t.check('M: failed call releases its reservation', c.reserved_micro_usd = 0 and c.consumed_micro_usd = v_before);
  perform t.check('M: released reservation is closed',
    (select state from public.usage_bucket_reservations where id = (v_res->>'reservationId')::uuid) = 'released');

  -- N: countTokens failed → the UTF-8 byte upper bound is priced as the input.
  v_res := public.reserve_usage('n-1', 'gemini-3.1-pro-preview', 40000, true, 8000, 'chat', 'standard');
  select * into r from public.usage_bucket_reservations where id = (v_res->>'reservationId')::uuid;
  perform t.check('N: upper-bound input is accepted, flagged and priced (80,000 + 96,000)',
    r.input_is_upper_bound and r.reserved_micro_usd = 176000);
  perform public.release_usage_reservation(r.id);

  -- P: thinking + visible output within the grant → no discrepancy.
  v_res := public.reserve_usage('p-1', 'gemini-3.1-pro-preview', 1000, false, 8000, 'chat', 'standard');
  perform public.settle_usage((v_res->>'reservationId')::uuid, 'evt-p-1', 1000, 3000, 0, 5000);
  perform t.check('P: thoughts + output = maxOutputTokens costs exactly the reservation, no discrepancy',
    (select actual_cost_micro_usd from public.usage_bucket_events where usage_event_id = 'evt-p-1') = 98000
    and not exists (select 1 from public.usage_accounting_discrepancies));

  -- P (violation): more than granted → charged capped at the reservation, discrepancy recorded, breaker trips.
  v_before := (select consumed_micro_usd from public.usage_buckets where id = c.id);
  v_res := public.reserve_usage('p-2', 'gemini-3.1-pro-preview', 1000, false, 8000, 'chat', 'standard');
  perform public.settle_usage((v_res->>'reservationId')::uuid, 'evt-p-2', 1000, 3000, 0, 6000);
  perform t.check('P: cost above the reservation is never charged beyond it',
    (select consumed_micro_usd from public.usage_buckets where id = c.id) - v_before = 98000);
  perform t.check('P: the excess is recorded internally as a discrepancy (12,000)',
    exists (select 1 from public.usage_accounting_discrepancies where delta_micro_usd = 12000 and charged_micro_usd = 98000));
  perform t.check('P: a single discrepancy over $0.001 trips the model circuit breaker',
    (select tripped from public.usage_model_circuit_breakers where model = 'gemini-3.1-pro-preview'));
  v_res := public.reserve_usage('p-3', 'gemini-3.1-pro-preview', 1000, false, 8000, 'chat', 'standard');
  perform t.check('P: tripped breaker stops new reservations for that model', not (v_res->>'ok')::boolean and v_res->>'reason' = 'service_unavailable');
  v_res := public.reserve_usage('p-4', 'gemini-3.5-flash-lite', 1000, false, 8000, 'chat', 'standard');
  perform t.check('P: other models are not affected by the breaker', (v_res->>'ok')::boolean);
  perform public.release_usage_reservation((v_res->>'reservationId')::uuid);
  perform t.as_service();
  perform public.reset_usage_circuit_breaker_service('gemini-3.1-pro-preview');
  perform t.as_user(v_uid);
  v_res := public.reserve_usage('p-5', 'gemini-3.1-pro-preview', 1000, false, 8000, 'chat', 'standard');
  perform t.check('P: breaker reset by the service role re-enables the model', (v_res->>'ok')::boolean);

  -- Timeout: a reservation never settled is charged its full hold after 10 minutes.
  v_before := (select consumed_micro_usd from public.usage_buckets where id = c.id);
  update public.usage_bucket_reservations set expires_at = now() - interval '1 second' where id = (v_res->>'reservationId')::uuid;
  perform public.get_my_usage_summary();
  perform t.check('Timeout: unsettled reservation is settled at its full hold',
    (select consumed_micro_usd from public.usage_buckets where id = c.id) - v_before = 98000
    and (select state from public.usage_bucket_reservations where id = (v_res->>'reservationId')::uuid) = 'expired_settled'
    and (select reserved_micro_usd from public.usage_buckets where id = c.id) = 0);

  -- Unknown model / no price → denied, never charged at a guessed price.
  v_res := public.reserve_usage('u-1', 'gemini-unknown-model', 1000, false, 8000, 'chat', 'standard');
  perform t.check('Unpriced model is denied (fail closed)', not (v_res->>'ok')::boolean and v_res->>'reason' = 'service_unavailable');

  -- Refund: unused allowance revoked, no further consumption, consumed is not clawed back.
  v_before := (select consumed_micro_usd from public.usage_buckets where id = c.id);
  perform t.as_service();
  perform public.revoke_usage_bucket_service('pay_c5', null, 'refund');
  select * into c from public.usage_buckets where id = c.id;
  perform t.check('Refund: bucket revoked, consumed unchanged', c.status = 'revoked' and c.consumed_micro_usd = v_before);
  perform t.check('Refund: revocation recorded with the unused allowance',
    exists (select 1 from public.usage_bucket_revocations where bucket_id = c.id and unused_micro_usd = c.private_allowance_micro_usd - c.consumed_micro_usd));
  perform t.as_user(v_uid);
  v_res := public.reserve_usage('r-1', 'gemini-3.5-flash-lite', 1000, false, 8000, 'chat', 'standard');
  perform t.check('Refund: revoked bucket funds nothing', not (v_res->>'ok')::boolean and v_res->>'reason' = 'no_allowance');
  perform t.check('J–P: all bucket invariants hold', t.invariants_hold());
end $$;

-- K: the database itself refuses any overdraw or negative value.
do $$
declare
  v_id uuid := (select id from public.usage_buckets where purchase_ref = 'pay:pay_pro_credits');
begin
  begin
    update public.usage_buckets set consumed_micro_usd = private_allowance_micro_usd + 1 where id = v_id;
    perform t.check('K: consumed above the allowance is rejected by the database', false);
  exception when check_violation then
    perform t.check('K: consumed above the allowance is rejected by the database', true);
  end;
  begin
    update public.usage_buckets set reserved_micro_usd = private_allowance_micro_usd - consumed_micro_usd + 1 where id = v_id;
    perform t.check('K: consumed + reserved above the allowance is rejected', false);
  exception when check_violation then
    perform t.check('K: consumed + reserved above the allowance is rejected', true);
  end;
  begin
    update public.usage_buckets set consumed_micro_usd = -1 where id = v_id;
    perform t.check('K: negative consumed is rejected', false);
  exception when check_violation then
    perform t.check('K: negative consumed is rejected', true);
  end;
  begin
    update public.usage_buckets set reserved_micro_usd = -1 where id = v_id;
    perform t.check('K: negative reserved is rejected', false);
  exception when check_violation then
    perform t.check('K: negative reserved is rejected', true);
  end;
end $$;

-- ═══ Monthly renewal, Pro yearly, upgrade ═══════════════════════════════════════════════════════
insert into public.pawos_subscriptions (id, user_id, tier, status, current_period_start, current_period_end, source, billing_frequency)
values ('sub_renew', '66666666-6666-6666-6666-666666666666', 'pro', 'active', now() - interval '29 days', now() + interval '1 day', 'test', 'monthly');

do $$
declare
  v_uid uuid := '66666666-6666-6666-6666-666666666666';
  v_old public.usage_buckets;
  v_new public.usage_buckets;
begin
  perform t.as_user(v_uid);
  perform public.get_my_usage_summary();
  perform t.spend_one(v_uid, 'gemini-3.1-pro-preview', 1000);
  select * into v_old from public.usage_buckets where user_id = v_uid;
  -- Renewal: Razorpay moves the period forward; the old period has ended.
  update public.usage_buckets set expires_at = now() - interval '1 second', period_end = now() - interval '1 second' where id = v_old.id;
  update public.pawos_subscriptions set current_period_start = now() - interval '1 second', current_period_end = now() + interval '30 days' where id = 'sub_renew';
  perform public.get_my_usage_summary();
  perform public.get_my_usage_summary();
  select * into v_old from public.usage_buckets where id = v_old.id;
  select * into v_new from public.usage_buckets where user_id = v_uid and id <> v_old.id;
  perform t.check('Renewal: previous period bucket is expired', v_old.status = 'expired');
  perform t.check('Renewal: exactly one new period bucket with a fresh $10 allowance',
    (select count(*) from public.usage_buckets where user_id = v_uid) = 2 and v_new.consumed_micro_usd = 0 and v_new.private_allowance_micro_usd = 10000000);
  perform t.check('Renewal: unused allowance is not carried over', v_new.private_allowance_micro_usd = 10000000);
  -- Razorpay adjusting the end date slightly never creates a second bucket for the same period.
  update public.pawos_subscriptions set current_period_end = current_period_end + interval '1 hour' where id = 'sub_renew';
  perform public.get_my_usage_summary();
  perform t.check('Renewal: a shifted period end does not create a duplicate bucket', (select count(*) from public.usage_buckets where user_id = v_uid) = 2);
end $$;

insert into public.pawos_subscriptions (id, user_id, tier, status, current_period_start, current_period_end, source, billing_frequency)
values ('sub_yearly', '44444444-4444-4444-4444-444444444444', 'pro', 'active', now() - interval '40 days', now() + interval '325 days', 'test', 'yearly');

do $$
declare
  v_uid uuid := '44444444-4444-4444-4444-444444444444';
  b public.usage_buckets;
  v_start timestamptz := (select current_period_start from public.pawos_subscriptions where id = 'sub_yearly');
begin
  perform t.as_user(v_uid);
  perform public.get_my_usage_summary();
  select * into b from public.usage_buckets where user_id = v_uid;
  perform t.check('Yearly: Pro yearly gets a Pro monthly bucket for the current month only',
    b.product_key = 'pro_monthly' and b.period_start = v_start + interval '1 month' and b.expires_at = v_start + interval '2 months',
    row_to_json(b)::text);
end $$;

insert into public.pawos_subscriptions (id, user_id, tier, status, current_period_start, current_period_end, source, billing_frequency)
values ('sub_up_pro', '55555555-5555-5555-5555-555555555555', 'pro', 'cancelled', now() - interval '10 days', now() + interval '20 days', 'test', 'monthly');

do $$
declare
  v_uid uuid := '55555555-5555-5555-5555-555555555555';
  v_res jsonb;
  v_pro uuid;
begin
  perform t.as_user(v_uid);
  perform public.get_my_usage_summary();
  select id into v_pro from public.usage_buckets where user_id = v_uid;
  -- Upgrade to Pro Max 5x a moment later: a new subscription.
  insert into public.pawos_subscriptions (id, user_id, tier, pro_max_variant, status, current_period_start, current_period_end, source, billing_frequency)
  values ('sub_up_max', v_uid, 'proMax', '5x', 'active', now(), now() + interval '30 days', 'test', 'monthly');
  v_res := t.spend_one(v_uid, 'gemini-3.1-pro-preview', 1000);
  perform t.check('Upgrade: a new Pro Max 5x plan bucket is created ($50 private, 10,000 PC, $25 pacing)',
    exists (select 1 from public.usage_buckets where user_id = v_uid and product_key = 'pro_max_5x_monthly'
            and private_allowance_micro_usd = 50000000 and customer_pc = 10000 and weekly_pacing_micro_usd = 25000000));
  perform t.check('Upgrade: the previous plan bucket is kept until its own period end',
    (select status from public.usage_buckets where id = v_pro) = 'active');
  perform t.check('Upgrade: plan buckets are used oldest first', (v_res->>'bucketId')::uuid = v_pro);
end $$;

-- Pro Max 20x and its mid-month values.
insert into public.pawos_subscriptions (id, user_id, tier, pro_max_variant, status, current_period_start, current_period_end, source, billing_frequency)
values ('sub_20x', '77777777-7777-7777-7777-777777777777', 'proMax', '20x', 'active', now() - interval '1 day', now() + interval '29 days', 'test', 'monthly');
do $$
declare
  v_uid uuid := '77777777-7777-7777-7777-777777777777';
  v_offer jsonb;
  b public.usage_buckets;
begin
  perform t.as_service();
  v_offer := public.pawos_mid_month_offer(v_uid);
  select * into b from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';
  perform t.check('Pro Max 20x: $250 plan = 25,000 PC, $125 private, $62.50 pacing',
    b.customer_pc = 25000 and b.private_allowance_micro_usd = 125000000 and b.weekly_pacing_micro_usd = 62500000);
  perform t.check('Pro Max 20x: mid-month offer is $175 / 17,500 PC',
    (v_offer->>'priceCents')::int = 17500 and v_offer->>'productKey' = 'pro_max_20x_mid_month');
  perform public.grant_mid_month_bucket_service(v_uid, 'pay_20x_mid', 'pro_max_20x_mid_month', b.id, 17500);
  perform t.check('Pro Max 20x: mid-month bucket has a $105 private allowance',
    (select private_allowance_micro_usd from public.usage_buckets where purchase_ref = 'pay:pay_20x_mid') = 105000000);
end $$;

-- ═══ Q: the customer API never exposes private economics ═══════════════════════════════════════
do $$
declare
  v_sum text;
  v_hist text;
  v_res jsonb;
  v_word text;
  v_leak text := '';
begin
  perform t.as_user('11111111-1111-1111-1111-111111111111');
  v_sum := lower(public.get_my_usage_summary()::text);
  v_hist := lower(public.get_my_usage_history(50)::text);
  foreach v_word in array array['micro', 'allowance', 'cost', 'price', 'token', 'model', 'reserved', 'margin', 'gemini', 'provider', 'usd', 'discrepanc', 'breaker'] loop
    if position(v_word in v_sum) > 0 then v_leak := v_leak || ' summary:' || v_word; end if;
    if position(v_word in v_hist) > 0 then v_leak := v_leak || ' history:' || v_word; end if;
  end loop;
  perform t.check('Q: summary and history contain no private economics', v_leak = '', v_leak);
  perform t.check('Q: history entries carry PC and bucket type', v_hist like '%"pc"%' and v_hist like '%"buckettype"%', v_hist);

  perform t.as_user('33333333-3333-3333-3333-333333333333');
  perform t.as_service();
  perform public.add_usage_credits_service('33333333-3333-3333-3333-333333333333', null, 10, 'pay_q');
  perform t.as_user('33333333-3333-3333-3333-333333333333');
  v_res := public.reserve_usage('q-1', 'gemini-3.5-flash-lite', 100, false, 8000, 'chat', 'standard');
  perform t.check('Q: a reservation returns only ok, reservationId, maxOutputTokens and the customer summary',
    (select array_agg(k order by k) from jsonb_object_keys(v_res) k) = array['maxOutputTokens', 'ok', 'reservationId', 'summary'],
    v_res::text);
  perform public.release_usage_reservation((v_res->>'reservationId')::uuid);
end $$;

-- ═══ Credits-only scope (Paw Fable; Go/Build after free allowance) ══════════════════════════════
insert into public.pawos_subscriptions (id, user_id, tier, status, current_period_start, current_period_end, source, billing_frequency)
values ('sub_scope', '33333333-3333-3333-3333-333333333333', 'pro', 'active', now() - interval '1 day', now() + interval '29 days', 'test', 'monthly');
do $$
declare
  v_res jsonb;
begin
  perform t.as_user('33333333-3333-3333-3333-333333333333');
  v_res := public.reserve_usage('scope-1', 'gemini-3.5-flash-lite', 100, false, 8000, 'chat', 'credits_only');
  perform t.check('Scope: credits_only reservations use credits even when a plan exists',
    (select source_type from public.usage_buckets b join public.usage_bucket_reservations r on r.bucket_id = b.id where r.id = (v_res->>'reservationId')::uuid) = 'purchased_credits');
  perform public.release_usage_reservation((v_res->>'reservationId')::uuid);
  v_res := public.reserve_usage('scope-2', 'gemini-3.5-flash-lite', 100, false, 8000, 'chat', 'standard');
  perform t.check('Scope: standard reservations use the plan first',
    (select source_type from public.usage_buckets b join public.usage_bucket_reservations r on r.bucket_id = b.id where r.id = (v_res->>'reservationId')::uuid) = 'monthly_plan');
  perform public.release_usage_reservation((v_res->>'reservationId')::uuid);
  -- the same request key returns the same hold, never a second one
  v_res := public.reserve_usage('scope-3', 'gemini-3.5-flash-lite', 100, false, 8000, 'chat', 'standard');
  perform t.check('Retry: reserving the same request key twice returns the same reservation',
    (public.reserve_usage('scope-3', 'gemini-3.5-flash-lite', 100, false, 8000, 'chat', 'standard')->>'reservationId') = v_res->>'reservationId'
    and (select count(*) from public.usage_bucket_reservations where request_key = 'scope-3') = 1);
  perform public.release_usage_reservation((v_res->>'reservationId')::uuid);
end $$;

-- Another user can never settle or release someone else's reservation.
do $$
declare
  v_res jsonb;
begin
  perform t.as_user('33333333-3333-3333-3333-333333333333');
  v_res := public.reserve_usage('own-1', 'gemini-3.5-flash-lite', 100, false, 8000, 'chat', 'standard');
  perform t.as_user('77777777-7777-7777-7777-777777777777');
  begin
    perform public.settle_usage((v_res->>'reservationId')::uuid, 'steal', 0, 0, 0, 0);
    perform t.check('Ownership: another user cannot settle a reservation', false);
  exception when others then
    perform t.check('Ownership: another user cannot settle a reservation', sqlerrm like '%reservation_not_found%');
  end;
  perform t.as_user('33333333-3333-3333-3333-333333333333');
  perform public.release_usage_reservation((v_res->>'reservationId')::uuid);
end $$;

-- ═══ Generic configuration: a future product needs only product rows ═════════════════════════
insert into public.usage_bucket_products
  (product_key, source_type, subscription_plan_key, extra_usage_product_key, expiry_policy, bucket_interval_months, rank,
   customer_value_cents, private_allowance_micro_usd, weekly_pacing_micro_usd, allowance_ratio, label)
values
  ('future_extra', 'mid_month_purchase', null, null, 'parent_period', null, 99, 3000, 1234567, null, null, 'Future extra usage'),
  ('future_plan', 'monthly_plan', 'futureTier:big', 'future_extra', 'period', 1, 99, 4000, 2000000, null, null, 'Future plan');
insert into public.pawos_subscriptions (id, user_id, tier, pro_max_variant, status, current_period_start, current_period_end, source, billing_frequency)
values ('sub_future', '12121212-1212-1212-1212-121212121212', 'futureTier', 'big', 'active', now() - interval '2 days', now() + interval '28 days', 'test', 'monthly');

do $$
declare
  v_uid uuid := '12121212-1212-1212-1212-121212121212';
  v_sum jsonb;
  v_res jsonb;
  v_offer jsonb;
  b public.usage_buckets;
  m public.usage_buckets;
begin
  perform t.as_user(v_uid);
  v_sum := public.get_my_usage_summary();
  select * into b from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';
  perform t.check('Config: a new tier/variant maps to its product purely from subscription_plan_key',
    b.product_key = 'future_plan' and b.customer_pc = 4000 and b.private_allowance_micro_usd = 2000000, row_to_json(b)::text);
  perform t.check('Config: summary carries the generic product key and label, and bucketFunded',
    v_sum->'plan'->>'productKey' = 'future_plan' and v_sum->'plan'->>'label' = 'Future plan' and (v_sum->>'bucketFunded')::boolean, v_sum::text);
  perform t.check('Config: a plan product without weekly pacing has no pacing limit', v_sum->'weeklyPacing' = 'null'::jsonb);
  v_res := t.spend_one(v_uid, 'gemini-3.1-pro-preview', 1000);
  perform t.check('Config: the same engine reserves and settles the future product', (v_res->>'ok')::boolean and (v_res->>'bucketId')::uuid = b.id, v_res::text);

  perform t.as_service();
  v_offer := public.pawos_mid_month_offer(v_uid);
  perform t.check('Config: the mid-month offer comes from extra_usage_product_key',
    v_offer->>'productKey' = 'future_extra' and (v_offer->>'priceCents')::int = 3000 and (v_offer->>'expiresAt')::timestamptz = b.expires_at, v_offer::text);
  perform public.grant_mid_month_bucket_service(v_uid, 'pay_future_1', 'future_extra', b.id, 3000);
  select * into m from public.usage_buckets where purchase_ref = 'pay:pay_future_1';
  perform t.check('Config: expiry_policy parent_period ends with the plan bucket', m.expires_at = b.expires_at and m.private_allowance_micro_usd = 1234567);
  begin
    perform public.grant_mid_month_bucket_service(v_uid, 'pay_future_wrong', 'pro_mid_month', b.id, 1500);
    perform t.check('Config: a mid-month product not configured for the plan is rejected', false);
  exception when others then
    perform t.check('Config: a mid-month product not configured for the plan is rejected', sqlerrm like '%plan does not match%');
  end;

  update public.usage_bucket_products set expiry_policy = 'never' where product_key = 'future_extra';
  perform public.grant_mid_month_bucket_service(v_uid, 'pay_future_2', 'future_extra', b.id, 3000);
  perform t.check('Config: changing expiry_policy to never changes expiry with no code change',
    (select expires_at from public.usage_buckets where purchase_ref = 'pay:pay_future_2') is null);
  update public.usage_bucket_products set expiry_policy = 'parent_period' where product_key = 'future_extra';
end $$;

-- A subscription whose tier/variant has no configured product gets no bucket (no silent default).
insert into public.pawos_subscriptions (id, user_id, tier, pro_max_variant, status, current_period_start, current_period_end, source, billing_frequency)
values ('sub_novariant', '13131313-1313-1313-1313-131313131313', 'proMax', null, 'active', now() - interval '1 day', now() + interval '29 days', 'test', 'monthly');
do $$
declare
  v_sum jsonb;
begin
  perform t.as_user('13131313-1313-1313-1313-131313131313');
  v_sum := public.get_my_usage_summary();
  perform t.check('Config: an unconfigured plan key creates no bucket — never a guessed default product',
    not exists (select 1 from public.usage_buckets where user_id = '13131313-1313-1313-1313-131313131313') and not (v_sum->>'bucketFunded')::boolean);
end $$;

-- Engine safety settings come from usage_engine_settings, not code.
do $$
declare
  c uuid;
  v_res jsonb;
begin
  perform t.as_service();
  perform public.add_usage_credits_service('13131313-1313-1313-1313-131313131313', null, 5, 'pay_settings');
  select id into c from public.usage_buckets where purchase_ref = 'pay:pay_settings';
  update public.usage_buckets set consumed_micro_usd = private_allowance_micro_usd - 400000 where id = c;
  perform t.as_user('13131313-1313-1313-1313-131313131313');
  v_res := public.reserve_usage('settings-1', 'gemini-3.1-pro-preview', 190000, false, 8000, 'chat', 'standard');
  perform t.check('Settings: with min_output_tokens 1024 a 1,666-token grant is allowed', (v_res->>'maxOutputTokens')::int = 1666, v_res::text);
  perform public.release_usage_reservation((v_res->>'reservationId')::uuid);
  update public.usage_engine_settings set min_output_tokens = 2048;
  v_res := public.reserve_usage('settings-2', 'gemini-3.1-pro-preview', 190000, false, 8000, 'chat', 'standard');
  perform t.check('Settings: raising min_output_tokens in configuration denies the same call', not (v_res->>'ok')::boolean, v_res::text);
  update public.usage_engine_settings set min_output_tokens = 1024, max_output_tokens = 4000;
  update public.usage_buckets set consumed_micro_usd = 0 where id = c;
  v_res := public.reserve_usage('settings-3', 'gemini-3.1-pro-preview', 1000, false, 8000, 'chat', 'standard');
  perform t.check('Settings: max_output_tokens from configuration caps every grant', (v_res->>'maxOutputTokens')::int = 4000, v_res::text);
  perform t.check('Settings: reservation timeout from configuration (10 minutes)',
    (select expires_at - created_at from public.usage_bucket_reservations where request_key = 'settings-3') = interval '10 minutes');
  perform public.release_usage_reservation((v_res->>'reservationId')::uuid);
  update public.usage_engine_settings set max_output_tokens = 8000;
  perform t.check('Settings: approved values restored', (select (min_output_tokens, max_output_tokens, reservation_timeout, breaker_single_discrepancy_micro_usd, breaker_aggregate_discrepancy_ratio)
    = (1024, 8000, interval '10 minutes', 1000::bigint, 0.005::numeric) from public.usage_engine_settings));
end $$;

-- ═══ Permissions, as the real roles ═══════════════════════════════════════════════════════════
select t.as_user('33333333-3333-3333-3333-333333333333');
set role authenticated;
do $$
begin
  begin
    perform 1 from public.usage_buckets;
    insert into t.results (name, ok) values ('Security: clients cannot read usage_buckets directly', false);
  exception when insufficient_privilege then
    insert into t.results (name, ok) values ('Security: clients cannot read usage_buckets directly', true);
  end;
  begin
    perform 1 from public.model_prices;
    insert into t.results (name, ok) values ('Security: clients cannot read model_prices', false);
  exception when insufficient_privilege then
    insert into t.results (name, ok) values ('Security: clients cannot read model_prices', true);
  end;
  begin
    perform public.add_usage_credits_service('33333333-3333-3333-3333-333333333333', null, 100, 'forged');
    insert into t.results (name, ok) values ('Security: clients cannot mint credits', false);
  exception when insufficient_privilege then
    insert into t.results (name, ok) values ('Security: clients cannot mint credits', true);
  end;
  begin
    perform public.migrate_legacy_usage_credits(false);
    insert into t.results (name, ok) values ('Security: clients cannot run the legacy migration', false);
  exception when insufficient_privilege then
    insert into t.results (name, ok) values ('Security: clients cannot run the legacy migration', true);
  end;
  begin
    perform public.deduct_usage_credits(1, 'old-client');
    insert into t.results (name, ok) values ('Legacy: deduct_usage_credits is frozen', false);
  exception when others then
    insert into t.results (name, ok, detail) values ('Legacy: deduct_usage_credits is frozen', sqlerrm like 'legacy_usage_credits_retired%', sqlerrm);
  end;
  begin
    perform public.get_my_usage_summary();
    insert into t.results (name, ok) values ('Security: clients can read their own customer summary', true);
  exception when others then
    insert into t.results (name, ok, detail) values ('Security: clients can read their own customer summary', false, sqlerrm);
  end;
end $$;
reset role;

-- Concurrency fixture (the race itself runs from run.mjs with two sessions): a $0.50 credit bucket
-- (private $0.35 = 350,000) can fund exactly one 296,000 reservation.
select t.as_service();
select public.add_usage_credits_service('88888888-8888-8888-8888-888888888888', null, 0.50, 'pay_conc');
