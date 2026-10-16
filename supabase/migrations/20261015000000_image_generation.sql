-- Migration: 20261015000000_image_generation
--
-- Image generation in PawOS Web and Desktop, charged to the account's existing usage.
--
-- One record per generation request (generated_images), and three backend-only functions that
-- pawos-web calls with the service role after it has checked the session and the plan:
--
--   begin_image_generation()    — before the provider is called: decides what pays for the image and
--                                 holds it. Idempotent per (account, request key).
--   complete_image_generation() — a usable image came back and is stored: the hold is charged, once.
--   fail_image_generation()     — no usable image: the hold is given back, once.
--
-- What pays, by plan (the caller passes which applies; it never passes an amount):
--
--   'buckets'            Pro, Pro Max, Team: the usage buckets, in the usual order (plan → mid-month
--                        purchase → purchased credits), weekly pacing respected. An image costs 9.7 PC
--                        of the funding bucket's customer value: 97 × private allowance ÷ (customer PC
--                        × 10) micro-USD, rounded up. For every current product that division is
--                        exact (Pro / Pro Max / Team seats 48,500; mid-month 58,200; credits 67,900),
--                        so 100 images are exactly 970 PC.
--   'free_then_credits'  Paw Go: 3 free images per account, ever; after that, purchased credits only.
--   'organization'       Enterprise: one unit of the organization's monthly pool (the same unit a chat
--                        turn uses), taken before the call and given back if no image is produced.
--
-- A generation that produces no image costs the customer nothing. A hold that is never completed
-- or failed (the server stopped mid-call) is closed by the usage engine's existing timeout rule.
--
-- Also: a private storage bucket for the images (served only through pawos-web, after it checks
-- ownership), and a private price row for the image model, used to record provider cost.
--
-- Additive: no existing table, function, price, product or allowance is changed. Safe to run twice.

-- ── 1. The image model's provider price (private; for cost records, not for the customer charge) ──
-- Google's published price for gemini-3.1-flash-lite-image: $0.25 per 1M input tokens, $30 per 1M
-- image-output tokens; a 1K image is 1,120 output tokens ($0.0336). No cached-input price is
-- published for it, so cached input is recorded at the full input price.
insert into public.model_prices (model, version, input_usd_per_mtok, cached_input_usd_per_mtok, output_usd_per_mtok, effective_from, note)
values ('gemini-3.1-flash-lite-image', 1, 0.25, 0.25, 30.00, '2026-10-01', 'Flash Lite Image; 1K image = 1,120 output tokens ($0.0336)')
on conflict (provider, model, version) do nothing;

-- ── 2. Generation records ──────────────────────────────────────────────────────────────────────
create table if not exists public.generated_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_key text not null check (length(request_key) between 1 and 100),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  funding text not null check (funding in ('free', 'bucket', 'organization')),
  reservation_id uuid references public.usage_bucket_reservations(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  organization_period date,
  model text not null,
  aspect_ratio text not null,
  image_size text not null,
  -- Customer-facing charge, in tenths of PC (97 = 9.7 PC). 0 for a free or organization image.
  charged_pc_tenths integer not null default 0 check (charged_pc_tenths >= 0),
  mime_type text check (mime_type is null or mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes integer check (size_bytes is null or (size_bytes > 0 and size_bytes <= 10485760)),
  storage_path text unique,
  -- Private: what the provider charged PawOS, priced from the usage it reported. Null when unknown.
  provider_cost_micro_usd bigint check (provider_cost_micro_usd is null or provider_cost_micro_usd >= 0),
  prompt_tokens integer,
  output_tokens integer,
  error_code text check (error_code is null or length(error_code) <= 60),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, request_key),
  check (status <> 'succeeded' or (mime_type is not null and size_bytes is not null and storage_path is not null))
);
create index if not exists generated_images_user_idx on public.generated_images (user_id, created_at desc);
alter table public.generated_images enable row level security;
revoke all on public.generated_images from public, anon, authenticated;

-- ── 3. Private image storage ───────────────────────────────────────────────────────────────────
-- No storage.objects policies: only pawos-web's server (service role) reads or writes it, after
-- checking the session and ownership. Objects live at <user id>/<generation id>.<ext>.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('generated-images', 'generated-images', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update
      set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end;
$$;

-- ── 4. Helpers ─────────────────────────────────────────────────────────────────────────────────
-- Free images on Paw Go, per account.
create or replace function public.pawos_free_image_limit()
returns integer language sql immutable as $$ select 3 $$;

-- The customer charge for one standard 1K image, in tenths of PC.
create or replace function public.pawos_image_charge_pc_tenths()
returns integer language sql immutable as $$ select 97 $$;

-- That charge in a bucket's private micro-USD: 9.7 PC of its customer value, rounded up.
create or replace function public.pawos_image_charge_micro_usd(p_private_allowance_micro_usd bigint, p_customer_pc integer)
returns bigint language sql immutable as $$
  select ceil(public.pawos_image_charge_pc_tenths()::numeric * p_private_allowance_micro_usd / (p_customer_pc::numeric * 10))::bigint
$$;

create or replace function public.pawos_image_row_json(r public.generated_images)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', r.id, 'status', r.status, 'funding', r.funding, 'chargedPcTenths', r.charged_pc_tenths,
    'mimeType', r.mime_type, 'sizeBytes', r.size_bytes, 'storagePath', r.storage_path,
    'aspectRatio', r.aspect_ratio, 'imageSize', r.image_size, 'createdAt', r.created_at, 'errorCode', r.error_code
  )
$$;

-- Free images still available to an account: succeeded ones count, and so do ones being generated
-- right now (for 10 minutes), so that parallel requests cannot share the last free image.
create or replace function public.pawos_free_images_left(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select greatest(public.pawos_free_image_limit() - (
    select count(*)::integer from public.generated_images g
    where g.user_id = p_user_id and g.funding = 'free'
      and (g.status = 'succeeded' or (g.status = 'pending' and g.created_at > now() - interval '10 minutes'))
  ), 0)
$$;

-- ── 5. Begin ───────────────────────────────────────────────────────────────────────────────────
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

-- ── 6. Complete: a usable image was produced and stored ─────────────────────────────────────────
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
      -- The hold is gone (closed by the timeout rule while the image was being made): it was charged
      -- in full then, which is exactly the image's price. Nothing more to charge.
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

-- ── 7. Fail: no usable image — the hold is given back ───────────────────────────────────────────
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
  v_price public.model_prices;
  v_cost bigint;
begin
  perform public.pawos_require_service_role();
  select * into g from public.generated_images where id = p_generation_id and user_id = p_user_id for update;
  if g.id is null then
    raise exception 'generation_not_found' using errcode = '22023';
  end if;
  if g.status <> 'pending' then
    return jsonb_build_object('ok', false, 'image', public.pawos_image_row_json(g));
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
  return jsonb_build_object('ok', true, 'image', public.pawos_image_row_json(g));
end;
$$;

-- ── 8. Read: one of the account's own images ────────────────────────────────────────────────────
create or replace function public.get_generated_image(p_user_id uuid, p_generation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g public.generated_images;
begin
  perform public.pawos_require_service_role();
  select * into g from public.generated_images where id = p_generation_id and user_id = p_user_id;
  if g.id is null then
    return null;
  end if;
  return public.pawos_image_row_json(g) || jsonb_build_object('freeImagesLeft', public.pawos_free_images_left(p_user_id));
end;
$$;

-- How many free images an account has left (for the screen; enforcement is begin_image_generation()).
create or replace function public.get_free_images_left(p_user_id uuid)
returns integer language plpgsql stable security definer set search_path = public as $$
begin
  perform public.pawos_require_service_role();
  return public.pawos_free_images_left(p_user_id);
end;
$$;

-- ── 9. Grants: backend only ─────────────────────────────────────────────────────────────────────
revoke all on function public.pawos_free_image_limit() from public, anon, authenticated;
revoke all on function public.pawos_image_charge_pc_tenths() from public, anon, authenticated;
revoke all on function public.pawos_image_charge_micro_usd(bigint, integer) from public, anon, authenticated;
revoke all on function public.pawos_image_row_json(public.generated_images) from public, anon, authenticated;
revoke all on function public.pawos_free_images_left(uuid) from public, anon, authenticated;
revoke all on function public.begin_image_generation(uuid, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.complete_image_generation(uuid, uuid, text, integer, text, integer, integer) from public, anon, authenticated;
revoke all on function public.fail_image_generation(uuid, uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.get_generated_image(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_free_images_left(uuid) from public, anon, authenticated;
grant execute on function public.begin_image_generation(uuid, text, text, text, text, text, uuid) to service_role;
grant execute on function public.complete_image_generation(uuid, uuid, text, integer, text, integer, integer) to service_role;
grant execute on function public.fail_image_generation(uuid, uuid, text, integer, integer) to service_role;
grant execute on function public.get_generated_image(uuid, uuid) to service_role;
grant execute on function public.get_free_images_left(uuid) to service_role;
