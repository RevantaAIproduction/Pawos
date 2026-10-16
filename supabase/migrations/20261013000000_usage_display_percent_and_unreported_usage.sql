-- Migration: 20261013000000_usage_display_percent_and_unreported_usage
--
-- Two corrections to the usage buckets (20261001000000_usage_buckets.sql). No table, column, grant,
-- product, price or allowance changes; no data is rewritten.
--
-- 1. The usage bar. A bucket's percentUsed was a straight conversion of provider cost used. The
--    agreed display reaches 100% a little before the allowance is gone:
--
--      share of the allowance used   shown
--      up to 90%                     the same percentage
--      95%                           97%
--      98% and above                 100%
--
--    and moves evenly between those points. The PC and amount shown as used follow the same share
--    of the bucket's customer value (Pro at 97% shows 1,940 of 2,000 PC — $19.40 of $20), so the
--    bar and the amount always agree. This is what is SHOWN. What may be spent is unchanged:
--    reserve_usage() still funds calls from the allowance that is really left, and a bucket is
--    exhausted only when it cannot fund the smallest call. The weekly pacing percentage is a pacing
--    control and stays a straight conversion. creditsPcRemaining stays what can really still be
--    spent from credits: clients use it to decide whether credits can fund a request.
--
-- 2. Usage that was never reported. settle_usage() priced whatever token counts it was given, so a
--    settlement with no usage metadata (all zeros) closed a real, completed call at no cost. A
--    completed call always has prompt tokens; a settlement without them is now closed the way a
--    call that never reported is closed — the full hold is charged (settlement 'timeout'), under a
--    ledger key of 'unreported:<event id>' so it can be told from a reservation that ran out of time.
--    Usage that turns up after a reservation is closed cannot be applied to it (that was already so).
--
-- Safe to run more than once. Run after 20261001000000_usage_buckets.sql.

-- ── 1. Displayed percentage ────────────────────────────────────────────────────────────────────
-- Integer arithmetic on micro-USD; no floating point. Thresholds are in ten-thousandths of the
-- allowance (9000 = 90%).
-- The share of a bucket shown as used, in ten-thousandths (9700 = 97.00%).
create or replace function public.pawos_usage_display_share(p_used_micro_usd bigint, p_allowance_micro_usd bigint)
returns integer language sql immutable as $$
  select case
    when p_allowance_micro_usd is null or p_allowance_micro_usd <= 0 then 10000
    when coalesce(p_used_micro_usd, 0) <= 0 then 0
    else (
      select case
        when share >= 9800 then 10000
        when share >= 9500 then 9700 + floor(share - 9500)::integer                  -- 95% → 97%, 98% → 100%
        when share >= 9000 then 9000 + floor((share - 9000) * 7 / 5)::integer        -- 90% → 90%, 95% → 97%
        else floor(share)::integer                                                    -- unchanged below 90%
      end
      from (select (p_used_micro_usd::numeric * 10000 / p_allowance_micro_usd) as share) s
    )
  end;
$$;

-- The same, as the whole percentage on the bar. Below 90% it rounds to the nearest whole percent, as
-- it always has; from 90% it only moves up when the share reaches the next whole percent, so 100%
-- is shown at the agreed point and not a moment before.
create or replace function public.pawos_usage_display_percent(p_used_micro_usd bigint, p_allowance_micro_usd bigint)
returns integer language sql immutable as $$
  select case
    when s.share >= 9000 then floor(s.share / 100.0)::integer
    else least(90, round(s.share / 100.0)::integer)
  end
  from (select public.pawos_usage_display_share(p_used_micro_usd, p_allowance_micro_usd) as share) s;
$$;

revoke all on function public.pawos_usage_display_share(bigint, bigint) from public, anon, authenticated;
revoke all on function public.pawos_usage_display_percent(bigint, bigint) from public, anon, authenticated;

-- ── 2. The summary uses it (the function is otherwise exactly as it was) ────────────────────────
create or replace function public.pawos_usage_summary(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare
  v_min bigint := public.pawos_min_viable_micro_usd();
  v_now timestamptz := now();
  b record;
  v_buckets jsonb := '[]'::jsonb;
  v_room bigint;
  v_week integer;
  v_week_used bigint;
  v_week_room bigint;
  v_pc_remaining integer;
  v_pc_shown_used integer;
  v_status text;
  v_plan_product text;
  v_plan_label text;
  v_label text;
  v_pacing jsonb := null;
  v_plan_fundable boolean := false;
  v_plan_paced boolean := false;
  v_plan_paced_reset timestamptz := null;
  v_had_plan boolean := false;
  v_other_fundable boolean := false;
  v_credits_pc integer := 0;
  v_reason text := null;
begin
  for b in
    select * from public.usage_buckets ub
    where ub.user_id = p_user_id
      and (ub.status in ('active', 'exhausted') or ub.updated_at > v_now - interval '35 days')
    order by public.pawos_bucket_priority(ub.source_type), ub.period_start, ub.created_at, ub.id
  loop
    v_room := b.private_allowance_micro_usd - b.consumed_micro_usd - b.reserved_micro_usd;
    v_status := case
      when b.status in ('expired', 'revoked') then b.status
      when b.expires_at is not null and b.expires_at <= v_now then 'expired'
      when b.status = 'exhausted' or v_room < v_min then 'exhausted'
      else 'active' end;
    -- What can really still be spent, in customer PC (a straight conversion). Used only for the
    -- credits total below, which clients use to decide whether credits can fund a request.
    v_pc_remaining := case when v_status = 'active' then floor(b.customer_pc::numeric * v_room / b.private_allowance_micro_usd)::integer else 0 end;
    -- What is SHOWN as used: the displayed share of the bucket's customer value. A presentation
    -- value — not a record of money spent, and never used to decide what may be spent.
    v_pc_shown_used := case when v_status = 'active'
      then floor(b.customer_pc::numeric * public.pawos_usage_display_share(b.consumed_micro_usd + b.reserved_micro_usd, b.private_allowance_micro_usd) / 10000)::integer
      else b.customer_pc end;

    select p.label into v_label from public.usage_bucket_products p where p.product_key = b.product_key;

    if b.source_type = 'monthly_plan' and v_status = 'active' then
      v_had_plan := true;
      if v_plan_product is null then v_plan_product := b.product_key; v_plan_label := v_label; end if;
      if b.weekly_pacing_micro_usd is null then
        v_plan_fundable := true; -- this product has no weekly pacing
      else
        v_week := public.pawos_week_index(b.period_start, v_now);
        v_week_used := public.pawos_bucket_week_used(b.id, v_week);
        v_week_room := b.weekly_pacing_micro_usd - v_week_used;
        if v_week_room >= v_min then
          v_plan_fundable := true;
        else
          v_plan_paced := true;
          v_plan_paced_reset := least(coalesce(v_plan_paced_reset, 'infinity'::timestamptz),
                                      least(b.period_start + (v_week + 1) * interval '7 days', b.expires_at));
        end if;
        if v_pacing is null then
          v_pacing := jsonb_build_object(
            'percentUsed', least(100, round(100.0 * v_week_used / b.weekly_pacing_micro_usd))::integer,
            'reached', v_week_room < v_min,
            'resetsAt', least(b.period_start + (v_week + 1) * interval '7 days', b.expires_at),
            'pcLimit', floor(b.customer_pc::numeric * b.weekly_pacing_micro_usd / b.private_allowance_micro_usd)::integer
          );
        end if;
      end if;
    elsif b.source_type = 'monthly_plan' then
      v_had_plan := v_had_plan or v_status = 'exhausted';
      if v_plan_product is null and v_status = 'exhausted' then v_plan_product := b.product_key; v_plan_label := v_label; end if;
    elsif v_status = 'active' then
      v_other_fundable := true;
    end if;

    if b.source_type = 'purchased_credits' and v_status = 'active' then
      v_credits_pc := v_credits_pc + v_pc_remaining;
    end if;

    v_buckets := v_buckets || jsonb_build_array(jsonb_build_object(
      'id', b.id,
      'type', b.source_type,
      'label', v_label,
      'productKey', b.product_key,
      'amountPaidCents', b.customer_value_cents,
      'pcTotal', b.customer_pc,
      'pcUsed', v_pc_shown_used,
      'amountUsedCents', floor(b.customer_value_cents::numeric * v_pc_shown_used / b.customer_pc)::integer,
      'pcRemaining', b.customer_pc - v_pc_shown_used,
      'percentUsed', case when v_status = 'active' then public.pawos_usage_display_percent(b.consumed_micro_usd + b.reserved_micro_usd, b.private_allowance_micro_usd) else 100 end,
      'status', v_status,
      'startsAt', b.period_start,
      'expiresAt', b.expires_at,
      'resetsAt', case when b.source_type = 'monthly_plan' then b.expires_at end,
      'createdAt', b.created_at
    ));
  end loop;

  if v_plan_fundable then
    v_reason := null;
  elsif v_plan_paced then
    v_reason := 'plan_weekly_paced';
  elsif v_other_fundable then
    v_reason := null;
  elsif v_had_plan then
    v_reason := 'plan_exhausted';
  else
    v_reason := 'no_allowance';
  end if;

  return jsonb_build_object(
    'plan', case when v_plan_product is null then null else jsonb_build_object('productKey', v_plan_product, 'label', v_plan_label) end,
    -- True while a current plan bucket funds this account's usage (the desktop's only signal for
    -- "reserve every call against buckets" — no tier names involved).
    'bucketFunded', v_plan_product is not null,
    'buckets', v_buckets,
    'weeklyPacing', v_pacing,
    'creditsPcRemaining', v_credits_pc,
    'limitReached', v_reason is not null,
    'limitReason', v_reason,
    'limitResetsAt', case when v_reason = 'plan_weekly_paced' then v_plan_paced_reset end,
    'serverNow', v_now
  );
end;
$$;

-- ── 3. A settlement with no usage is not a free call ───────────────────────────────────────────
create or replace function public.settle_usage(
  p_reservation_id uuid,
  p_usage_event_id text,
  p_prompt_tokens integer,
  p_candidates_tokens integer,
  p_cached_tokens integer,
  p_thoughts_tokens integer
) returns jsonb
language plpgsql volatile security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  r public.usage_bucket_reservations;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce(btrim(p_usage_event_id), '') = '' or length(p_usage_event_id) > 120 then
    raise exception 'invalid_usage_event_id' using errcode = '22023';
  end if;
  if least(coalesce(p_prompt_tokens, 0), coalesce(p_candidates_tokens, 0), coalesce(p_cached_tokens, 0), coalesce(p_thoughts_tokens, 0)) < 0
     or greatest(coalesce(p_prompt_tokens, 0), coalesce(p_candidates_tokens, 0), coalesce(p_cached_tokens, 0), coalesce(p_thoughts_tokens, 0)) > 4000000 then
    raise exception 'invalid_token_counts' using errcode = '22023';
  end if;

  select * into r from public.usage_bucket_reservations where id = p_reservation_id and user_id = v_uid;
  if r.id is null then
    raise exception 'reservation_not_found' using errcode = '22023';
  end if;
  if r.state = 'held' then
    -- A completed call always has a prompt: a settlement that reports no prompt tokens carries no
    -- usage at all (the provider's usage metadata was missing). Its cost is unknown, not zero, so it
    -- is closed the way a call that never reported is: the full hold is charged. The ledger row is
    -- keyed 'unreported:<event id>', which tells it from a reservation that simply ran out of time
    -- ('timeout:<reservation id>', written by housekeeping) — both have settlement 'timeout'.
    if coalesce(p_prompt_tokens, 0) <= 0 then
      perform public.pawos_close_reservation(r.id, left('unreported:' || p_usage_event_id, 200), 0, 0, 0, 0, 'timeout');
    else
      perform public.pawos_close_reservation(r.id, p_usage_event_id,
        coalesce(p_prompt_tokens, 0), coalesce(p_candidates_tokens, 0), coalesce(p_cached_tokens, 0), coalesce(p_thoughts_tokens, 0),
        'reported');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'summary', public.pawos_usage_summary(v_uid));
end;
$$;
