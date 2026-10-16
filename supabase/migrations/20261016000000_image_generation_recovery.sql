-- Migration: 20261016000000_image_generation_recovery
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════════════╗
-- ║  NOT APPLIED. Tested only on a throwaway local cluster (supabase/tests/image_generation).      ║
-- ║  Applying it to staging or production needs explicit approval.                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════════════╝
--
-- Settles image generations that were never completed or failed — the server stopped, timed out,
-- or could not record its result — so that no customer is charged for an image they never got, no
-- Enterprise pool unit stays taken, and no request stays 'pending' forever. Run after
-- 20261015000000_image_generation.sql.
--
-- The lease. A generation belongs to the server request that began it for pawos_image_lease()
-- (5 minutes, and never more than half the usage engine's reservation timeout) from its
-- created_at, by the database's own clock:
--   * within the lease only that request settles it (complete or fail), exactly as before;
--   * after the lease, complete_image_generation() refuses it, and recovery fails it: the hold is
--     released, the organization unit is given back, the customer is charged nothing.
-- Both paths take the generation's row lock and act only from 'pending', so each generation is
-- settled once — never charged twice, refunded twice or given back to the pool twice. Recovery
-- never marks anything succeeded and never charges: an image that may exist in storage but was
-- not recorded within the lease is treated as not produced (pawos-web then removes the file).
--
-- Where recovery runs:
--   * begin_image_generation(), for the account, before anything else (covers free and
--     Enterprise generations, and a retry with the same request key), and for an Enterprise
--     request, for every member of its organization before the pool is checked;
--   * pawos_bucket_housekeeping(), which every usage call runs for its account: an image hold is
--     recovered and released, never charged by the timeout rule;
--   * recover_stale_image_generations(), service role only, for every account — for a scheduler
--     (pawos-web exposes it as recoverStaleImageGenerations(); scheduling it is a separate decision).
--
-- Additive: no table or column changes; one partial index. Public function signatures and results
-- are unchanged except complete_image_generation(), which adds 'reason' when it refuses.
-- Safe to run twice.
--
-- Rollback (no data to undo): re-run the definitions of begin_image_generation(),
-- complete_image_generation() and fail_image_generation() from 20261015000000_image_generation.sql
-- and pawos_bucket_housekeeping() from 20261001000000_usage_buckets.sql, then drop the functions
-- added here and generated_images_pending_idx. Generations settled by recovery stay 'failed' with
-- their holds released and units returned — a consistent state under the old functions too.

-- ── 1. The lease ───────────────────────────────────────────────────────────────────────────────
-- pawos-web's own budget (model call ≤ 55 s, upload ≤ 30 s, then one database call) is far inside it.
create or replace function public.pawos_image_lease()
returns interval language sql stable security definer set search_path = public as $$
  select least(interval '5 minutes', s.reservation_timeout / 2) from public.pawos_engine_settings() s
$$;

create index if not exists generated_images_pending_idx on public.generated_images (created_at) where status = 'pending';

-- ── 2. Failing a generation (the body of fail_image_generation(), without the role check) ───────
create or replace function public.pawos_fail_image_generation(
  p_generation_id uuid, p_error_code text, p_prompt_tokens integer, p_output_tokens integer
) returns public.generated_images
language plpgsql volatile security definer set search_path = public, auth as $$
declare
  g public.generated_images;
  v_price public.model_prices;
  v_cost bigint;
begin
  select * into g from public.generated_images where id = p_generation_id for update;
  if g.id is null or g.status <> 'pending' then
    return g;
  end if;

  if g.funding = 'bucket' and g.reservation_id is not null then
    perform public.pawos_close_reservation(g.reservation_id, null, null, null, null, null, 'release');
  elsif g.funding = 'organization' and g.organization_id is not null then
    update public.organization_usage_counters set used_amount = greatest(used_amount - 1, 0), updated_at = now()
    where organization_id = g.organization_id and capability = 'aiReasoning' and period_start = g.organization_period;
  end if;
  -- (A free image that failed is simply not counted: only succeeded and in-progress ones are.)

  select * into v_price from public.model_prices p where p.model = g.model and p.active order by p.version desc limit 1;
  v_cost := case when v_price.id is not null and coalesce(p_prompt_tokens, 0) + coalesce(p_output_tokens, 0) > 0
                 then public.pawos_price_tokens(v_price, greatest(coalesce(p_prompt_tokens, 0), 0), 0, greatest(coalesce(p_output_tokens, 0), 0), false) end;
  update public.generated_images set status = 'failed', error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'failed'), 60),
    provider_cost_micro_usd = v_cost, prompt_tokens = p_prompt_tokens, output_tokens = p_output_tokens, completed_at = now()
  where id = g.id returning * into g;
  return g;
end;
$$;

-- ── 3. Recovery ────────────────────────────────────────────────────────────────────────────────
-- One generation: 'settled' (not pending), 'running' (inside its lease) or 'abandoned' (failed now).
create or replace function public.pawos_recover_image_generation(p_generation_id uuid)
returns text
language plpgsql volatile security definer set search_path = public, auth as $$
declare
  g public.generated_images;
begin
  select * into g from public.generated_images where id = p_generation_id for update;
  if g.id is null or g.status <> 'pending' then
    return 'settled';
  end if;
  if g.created_at > now() - public.pawos_image_lease() then
    return 'running';
  end if;
  perform public.pawos_fail_image_generation(g.id, 'abandoned', g.prompt_tokens, g.output_tokens);
  return 'abandoned';
end;
$$;

-- One account's generations past their lease.
create or replace function public.pawos_recover_image_generations(p_user_id uuid)
returns integer
language plpgsql volatile security definer set search_path = public, auth as $$
declare
  v_id uuid;
  v_n integer := 0;
begin
  for v_id in
    select g.id from public.generated_images g
    where g.user_id = p_user_id and g.status = 'pending' and g.created_at <= now() - public.pawos_image_lease()
    order by g.created_at
  loop
    if public.pawos_recover_image_generation(v_id) = 'abandoned' then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- One organization's generations past their lease (any member's): their pool units come back.
create or replace function public.pawos_recover_organization_image_generations(p_organization_id uuid)
returns integer
language plpgsql volatile security definer set search_path = public, auth as $$
declare
  v_id uuid;
  v_n integer := 0;
begin
  for v_id in
    select g.id from public.generated_images g
    where g.organization_id = p_organization_id and g.funding = 'organization' and g.status = 'pending'
      and g.created_at <= now() - public.pawos_image_lease()
    order by g.created_at
  loop
    if public.pawos_recover_image_generation(v_id) = 'abandoned' then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- Every account (service role): returns what it settled, so pawos-web can remove any stored file.
create or replace function public.recover_stale_image_generations(p_limit integer default 100)
returns table (user_id uuid, generation_id uuid)
language plpgsql volatile security definer set search_path = public, auth as $$
declare
  r record;
begin
  perform public.pawos_require_service_role();
  for r in
    select g.id, g.user_id from public.generated_images g
    where g.status = 'pending' and g.created_at <= now() - public.pawos_image_lease()
    order by g.created_at
    limit greatest(least(coalesce(p_limit, 100), 1000), 1)
  loop
    if public.pawos_recover_image_generation(r.id) = 'abandoned' then
      user_id := r.user_id;
      generation_id := r.id;
      return next;
    end if;
  end loop;
end;
$$;

-- ── 4. Housekeeping: an image hold is never charged by the timeout rule ─────────────────────────
-- Same as 20261001000000_usage_buckets.sql, except for image holds (found through
-- generated_images.reservation_id): a pending generation is recovered first; then a hold whose
-- image succeeded is closed at its price (the hold is exactly the price), any other is released,
-- and one still inside its lease is left alone.
create or replace function public.pawos_bucket_housekeeping(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_id uuid;
  v_generation uuid;
  v_status text;
begin
  perform public.pawos_recover_image_generations(p_user_id);

  for v_id in
    select id from public.usage_bucket_reservations
    where user_id = p_user_id and state = 'held' and expires_at <= now()
    order by created_at
  loop
    v_generation := null;
    select g.id, g.status into v_generation, v_status from public.generated_images g where g.reservation_id = v_id;
    if v_generation is null then
      perform public.pawos_close_reservation(v_id, 'timeout:' || v_id::text, null, null, null, null, 'timeout');
      continue;
    end if;
    if v_status = 'pending' then
      perform public.pawos_recover_image_generation(v_generation);
      select g.status into v_status from public.generated_images g where g.id = v_generation;
    end if;
    if v_status = 'pending' then
      continue;
    elsif v_status = 'succeeded' then
      perform public.pawos_close_reservation(v_id, 'timeout:' || v_id::text, null, null, null, null, 'timeout');
    else
      perform public.pawos_close_reservation(v_id, null, null, null, null, null, 'release');
    end if;
  end loop;

  update public.usage_buckets
  set status = 'expired', updated_at = now()
  where user_id = p_user_id and status in ('active', 'exhausted') and expires_at is not null and expires_at <= now();
end;
$$;

-- ── 5. Begin: as in 20261015000000, plus recovery for the account right after its lock ─────────
create or replace function public.begin_image_generation(
  p_user_id uuid,
  p_request_key text,
  p_model text,
  p_aspect_ratio text,
  p_image_size text,
  p_funding text,
  p_organization_id uuid default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, auth as $$
declare
  v_now timestamptz := now();
  v_existing public.generated_images;
  v_row public.generated_images;
  v_price public.model_prices;
  v_tripped boolean;
  v_period date := date_trunc('month', v_now)::date;
  v_limit integer;
  v_used integer;
  b public.usage_buckets;
  v_amount bigint;
  v_monthly_room bigint;
  v_week integer;
  v_week_room bigint;
  v_room bigint;
  v_paced boolean := false;
  v_reservation_id uuid;
  v_settings public.usage_engine_settings := public.pawos_engine_settings();
  v_scope text;
begin
  perform public.pawos_require_service_role();
  if p_user_id is null then
    raise exception 'invalid_user' using errcode = '22023';
  end if;
  -- (100, not 120: the bucket hold is keyed 'image:' + this key, and keys there are at most 120.)
  if coalesce(btrim(p_request_key), '') = '' or length(p_request_key) > 100 then
    raise exception 'invalid_request_key' using errcode = '22023';
  end if;
  if p_aspect_ratio is null or p_aspect_ratio not in ('1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9') then
    raise exception 'invalid_aspect_ratio' using errcode = '22023';
  end if;
  if p_image_size is distinct from '1K' then
    raise exception 'invalid_image_size' using errcode = '22023';
  end if;
  if p_funding is null or p_funding not in ('buckets', 'free_then_credits', 'organization') then
    raise exception 'invalid_funding' using errcode = '22023';
  end if;

  -- One request at a time per account: two requests cannot share the last free image or the last
  -- room in a bucket, and a repeated request key finds the first one's record.
  perform pg_advisory_xact_lock(hashtext('image_generation:' || p_user_id::text));

  -- (20261016) This account's generations past their lease are settled first — including this
  -- request key's, so a retry of an abandoned request finds it failed instead of 'pending'.
  perform public.pawos_recover_image_generations(p_user_id);

  select * into v_existing from public.generated_images where user_id = p_user_id and request_key = p_request_key;
  if v_existing.id is not null then
    -- The same request again (a retry): never a second generation, never a second charge.
    return jsonb_build_object('ok', true, 'repeat', true, 'image', public.pawos_image_row_json(v_existing));
  end if;

  -- ── Enterprise: one unit of the organization's monthly pool.
  if p_funding = 'organization' then
    if p_organization_id is null or not exists (
      select 1 from public.organization_members m
      where m.organization_id = p_organization_id and m.user_id = p_user_id and m.status = 'active'
    ) then
      raise exception 'not_an_organization_member' using errcode = '42501';
    end if;
    -- (20261016) Units held by the organization's abandoned generations — any member's — come back
    -- before the pool is checked.
    perform public.pawos_recover_organization_image_generations(p_organization_id);
    select monthly_limit into v_limit from public.usage_quota_config where tier = 'enterprise' and capability = 'aiReasoning';
    insert into public.organization_usage_counters (organization_id, capability, period_start, used_amount)
    values (p_organization_id, 'aiReasoning', v_period, 0)
    on conflict (organization_id, capability, period_start) do nothing;
    select used_amount into v_used from public.organization_usage_counters
    where organization_id = p_organization_id and capability = 'aiReasoning' and period_start = v_period
    for update;
    if v_limit is not null and v_used + 1 > v_limit then
      return jsonb_build_object('ok', false, 'reason', 'organization_limit');
    end if;
    update public.organization_usage_counters set used_amount = v_used + 1, updated_at = v_now
    where organization_id = p_organization_id and capability = 'aiReasoning' and period_start = v_period;
    insert into public.generated_images (user_id, request_key, funding, organization_id, organization_period, model, aspect_ratio, image_size)
    values (p_user_id, p_request_key, 'organization', p_organization_id, v_period, p_model, p_aspect_ratio, p_image_size)
    returning * into v_row;
    return jsonb_build_object('ok', true, 'image', public.pawos_image_row_json(v_row));
  end if;

  -- ── Paw Go: a free image while any are left.
  if p_funding = 'free_then_credits' and public.pawos_free_images_left(p_user_id) > 0 then
    insert into public.generated_images (user_id, request_key, funding, model, aspect_ratio, image_size)
    values (p_user_id, p_request_key, 'free', p_model, p_aspect_ratio, p_image_size)
    returning * into v_row;
    return jsonb_build_object('ok', true, 'image', public.pawos_image_row_json(v_row), 'freeImagesLeft', public.pawos_free_images_left(p_user_id));
  end if;

  -- ── A usage bucket: Pro, Pro Max and Team in the usual order; Go after its free images, credits only.
  v_scope := case when p_funding = 'free_then_credits' then 'credits_only' else 'standard' end;
  perform public.pawos_ensure_plan_buckets(p_user_id);
  perform public.pawos_bucket_housekeeping(p_user_id);

  select coalesce((select c.tripped from public.usage_model_circuit_breakers c where c.model = p_model), false) into v_tripped;
  v_price := public.pawos_model_price(p_model, v_now);
  if v_tripped or v_price.id is null then
    return jsonb_build_object('ok', false, 'reason', 'service_unavailable');
  end if;

  for b in
    select * from public.usage_buckets ub
    where ub.user_id = p_user_id and ub.status = 'active'
      and ub.period_start <= v_now and (ub.expires_at is null or ub.expires_at > v_now)
      and (v_scope = 'standard' or ub.source_type = 'purchased_credits')
    order by public.pawos_bucket_priority(ub.source_type), ub.period_start, ub.created_at, ub.id
    for update
  loop
    -- A plan that is only weekly-paced blocks everything after it, as for any other call.
    if v_paced and b.source_type <> 'monthly_plan' then
      exit;
    end if;
    v_amount := public.pawos_image_charge_micro_usd(b.private_allowance_micro_usd, b.customer_pc);
    v_monthly_room := b.private_allowance_micro_usd - b.consumed_micro_usd - b.reserved_micro_usd;
    v_week := null;
    if b.source_type = 'monthly_plan' and b.weekly_pacing_micro_usd is not null then
      v_week := public.pawos_week_index(b.period_start, v_now);
      v_week_room := b.weekly_pacing_micro_usd - public.pawos_bucket_week_used(b.id, v_week);
      v_room := least(v_monthly_room, v_week_room);
    else
      v_room := v_monthly_room;
    end if;

    if v_amount <= v_room then
      insert into public.usage_bucket_reservations (
        bucket_id, user_id, request_key, model, price_id, category, input_tokens, input_is_upper_bound,
        long_context, granted_max_output_tokens, reserved_micro_usd, week_index, expires_at
      ) values (
        b.id, p_user_id, 'image:' || p_request_key, p_model, v_price.id, 'image_generation', 0, false,
        false, 1120, v_amount, v_week, v_now + v_settings.reservation_timeout
      ) returning id into v_reservation_id;
      update public.usage_buckets set reserved_micro_usd = reserved_micro_usd + v_amount, updated_at = v_now where id = b.id;

      insert into public.generated_images (user_id, request_key, funding, reservation_id, model, aspect_ratio, image_size)
      values (p_user_id, p_request_key, 'bucket', v_reservation_id, p_model, p_aspect_ratio, p_image_size)
      returning * into v_row;
      return jsonb_build_object('ok', true, 'image', public.pawos_image_row_json(v_row), 'chargePcTenths', public.pawos_image_charge_pc_tenths());
    end if;

    if b.source_type = 'monthly_plan' and b.weekly_pacing_micro_usd is not null and v_monthly_room >= v_amount then
      v_paced := true;
    end if;
  end loop;

  return jsonb_build_object('ok', false, 'reason',
    case when v_paced then 'plan_weekly_paced'
         when p_funding = 'free_then_credits' then 'free_images_used'
         else 'no_allowance' end);
end;
$$;

-- ── 6. Complete: only within the lease ─────────────────────────────────────────────────────────
-- As in 20261015000000, except: past the lease the generation is failed instead (the hold is
-- released, the unit given back, nothing charged) and the answer says so with reason
-- 'lease_expired' — pawos-web then removes the file it stored.
create or replace function public.complete_image_generation(
  p_user_id uuid,
  p_generation_id uuid,
  p_mime_type text,
  p_size_bytes integer,
  p_storage_path text,
  p_prompt_tokens integer,
  p_output_tokens integer
) returns jsonb
language plpgsql volatile security definer set search_path = public, auth as $$
declare
  g public.generated_images;
  r public.usage_bucket_reservations;
  v_price public.model_prices;
  v_cost bigint;
begin
  perform public.pawos_require_service_role();
  select * into g from public.generated_images where id = p_generation_id and user_id = p_user_id for update;
  if g.id is null then
    raise exception 'generation_not_found' using errcode = '22023';
  end if;
  if g.status <> 'pending' then
    -- Completed (or failed) already: report what it is, change nothing.
    return jsonb_build_object('ok', g.status = 'succeeded', 'image', public.pawos_image_row_json(g));
  end if;
  if g.created_at <= now() - public.pawos_image_lease() then
    g := public.pawos_fail_image_generation(g.id, 'lease_expired', p_prompt_tokens, p_output_tokens);
    return jsonb_build_object('ok', false, 'reason', 'lease_expired', 'image', public.pawos_image_row_json(g));
  end if;
  if p_mime_type is null or p_mime_type not in ('image/png', 'image/jpeg', 'image/webp') or p_size_bytes is null or p_size_bytes <= 0
     or p_size_bytes > 10485760 or coalesce(p_storage_path, '') not like (p_user_id::text || '/%') then
    raise exception 'invalid_image' using errcode = '22023';
  end if;

  -- What the provider charged PawOS, when it reported usage (private).
  select * into v_price from public.model_prices p where p.model = g.model and p.active order by p.version desc limit 1;
  v_cost := case when v_price.id is not null and p_output_tokens is not null and p_output_tokens > 0
                 then public.pawos_price_tokens(v_price, greatest(coalesce(p_prompt_tokens, 0), 0), 0, p_output_tokens, false) end;

  if g.funding = 'bucket' then
    select * into r from public.usage_bucket_reservations where id = g.reservation_id for update;
    if r.id is null or r.state <> 'held' then
      -- The hold is gone. Inside the lease that only happens for a generation begun before this
      -- migration whose hold the old timeout rule charged in full — exactly the image's price.
      update public.generated_images set status = 'succeeded', mime_type = p_mime_type, size_bytes = p_size_bytes, storage_path = p_storage_path,
        charged_pc_tenths = public.pawos_image_charge_pc_tenths(), provider_cost_micro_usd = v_cost, prompt_tokens = p_prompt_tokens,
        output_tokens = p_output_tokens, completed_at = now()
      where id = g.id returning * into g;
      return jsonb_build_object('ok', true, 'image', public.pawos_image_row_json(g));
    end if;
    -- The charge is exactly the hold: the image's fixed price in this bucket's terms.
    update public.usage_buckets
    set consumed_micro_usd = consumed_micro_usd + r.reserved_micro_usd, reserved_micro_usd = reserved_micro_usd - r.reserved_micro_usd, updated_at = now()
    where id = r.bucket_id;
    insert into public.usage_bucket_events (
      user_id, usage_event_id, bucket_id, reservation_id, model, price_id,
      prompt_tokens, candidates_tokens, cached_tokens, thoughts_tokens,
      actual_cost_micro_usd, charged_micro_usd, week_index, category, settlement
    ) values (
      r.user_id, 'image:' || g.id::text, r.bucket_id, r.id, r.model, r.price_id,
      greatest(coalesce(p_prompt_tokens, 0), 0), greatest(coalesce(p_output_tokens, 0), 0), 0, 0,
      coalesce(v_cost, 0), r.reserved_micro_usd, r.week_index, 'image_generation', 'reported'
    );
    update public.usage_bucket_reservations set state = 'settled', closed_at = now() where id = r.id;
    update public.usage_buckets set status = 'exhausted', updated_at = now()
    where id = r.bucket_id and status = 'active' and private_allowance_micro_usd - consumed_micro_usd < public.pawos_min_viable_micro_usd();
  end if;

  update public.generated_images set status = 'succeeded', mime_type = p_mime_type, size_bytes = p_size_bytes, storage_path = p_storage_path,
    charged_pc_tenths = case when g.funding = 'bucket' then public.pawos_image_charge_pc_tenths() else 0 end,
    provider_cost_micro_usd = v_cost, prompt_tokens = p_prompt_tokens, output_tokens = p_output_tokens, completed_at = now()
  where id = g.id returning * into g;
  return jsonb_build_object('ok', true, 'image', public.pawos_image_row_json(g));
end;
$$;

-- ── 7. Fail: the same, through the shared body ─────────────────────────────────────────────────
create or replace function public.fail_image_generation(
  p_user_id uuid,
  p_generation_id uuid,
  p_error_code text,
  p_prompt_tokens integer default null,
  p_output_tokens integer default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, auth as $$
declare
  g public.generated_images;
begin
  perform public.pawos_require_service_role();
  select * into g from public.generated_images where id = p_generation_id and user_id = p_user_id;
  if g.id is null then
    raise exception 'generation_not_found' using errcode = '22023';
  end if;
  if g.status <> 'pending' then
    return jsonb_build_object('ok', false, 'image', public.pawos_image_row_json(g));
  end if;
  g := public.pawos_fail_image_generation(p_generation_id, p_error_code, p_prompt_tokens, p_output_tokens);
  return jsonb_build_object('ok', g.status = 'failed', 'image', public.pawos_image_row_json(g));
end;
$$;

-- ── 8. Grants: internal helpers callable by nobody; the sweep by the backend only ──────────────
revoke all on function public.pawos_image_lease() from public, anon, authenticated;
revoke all on function public.pawos_fail_image_generation(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.pawos_recover_image_generation(uuid) from public, anon, authenticated;
revoke all on function public.pawos_recover_image_generations(uuid) from public, anon, authenticated;
revoke all on function public.pawos_recover_organization_image_generations(uuid) from public, anon, authenticated;
revoke all on function public.recover_stale_image_generations(integer) from public, anon, authenticated;
revoke all on function public.pawos_bucket_housekeeping(uuid) from public, anon, authenticated;
revoke all on function public.begin_image_generation(uuid, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.complete_image_generation(uuid, uuid, text, integer, text, integer, integer) from public, anon, authenticated;
revoke all on function public.fail_image_generation(uuid, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.recover_stale_image_generations(integer) to service_role;
grant execute on function public.begin_image_generation(uuid, text, text, text, text, text, uuid) to service_role;
grant execute on function public.complete_image_generation(uuid, uuid, text, integer, text, integer, integer) to service_role;
grant execute on function public.fail_image_generation(uuid, uuid, text, integer, integer) to service_role;
