-- Tests for 20261015000000_image_generation.sql. Run by run.mjs in this folder, on a throwaway local
-- cluster only.
\set ON_ERROR_STOP 1

-- Stand-ins for the Enterprise pool tables (their own migration, 20260730010000_usage_engine.sql, is
-- not under test here). Same columns and keys as the real ones.
create table if not exists public.usage_quota_config (tier text not null, capability text not null, monthly_limit integer, primary key (tier, capability));
create table if not exists public.organization_usage_counters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  capability text not null,
  period_start date not null,
  used_amount integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (organization_id, capability, period_start)
);
insert into public.usage_quota_config values ('enterprise', 'aiReasoning', 3) on conflict do nothing;

insert into auth.users (id, email) values
  ('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'img-pro@test'),
  ('f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2', 'img-5x@test'),
  ('f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3', 'img-go@test'),
  ('f4f4f4f4-f4f4-4f4f-8f4f-f4f4f4f4f4f4', 'img-go-credits@test'),
  ('f5f5f5f5-f5f5-4f5f-8f5f-f5f5f5f5f5f5', 'img-ent@test'),
  ('f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6', 'img-poor@test'),
  ('f7f7f7f7-f7f7-4f7f-8f7f-f7f7f7f7f7f7', 'img-race@test');
insert into public.pawos_subscriptions (id, user_id, tier, pro_max_variant, status, current_period_start, current_period_end, source, billing_frequency) values
  ('sub_img_pro', 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'pro', null, 'active', now() - interval '1 day', now() + interval '29 days', 'test', 'monthly'),
  ('sub_img_5x', 'f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2', 'proMax', '5x', 'active', now() - interval '1 day', now() + interval '29 days', 'test', 'monthly'),
  ('sub_img_poor', 'f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6', 'pro', null, 'active', now() - interval '1 day', now() + interval '29 days', 'test', 'monthly');
insert into public.organizations (id, tier) values ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'enterprise');
insert into public.organization_members (organization_id, user_id, seat_tier, status) values ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'f5f5f5f5-f5f5-4f5f-8f5f-f5f5f5f5f5f5', null, 'active');

-- Calls as pawos-web's service role, after it has checked the session and the plan.
create function t.img_begin(p_uid uuid, p_key text, p_funding text, p_org uuid default null, p_ratio text default '1:1', p_size text default '1K') returns jsonb language plpgsql as $$
begin
  perform t.as_service();
  return public.begin_image_generation(p_uid, p_key, 'gemini-3.1-flash-lite-image', p_ratio, p_size, p_funding, p_org);
end $$;
create function t.img_ok(p_uid uuid, p_res jsonb, p_prompt integer default 20) returns jsonb language plpgsql as $$
begin
  perform t.as_service();
  return public.complete_image_generation(p_uid, (p_res->'image'->>'id')::uuid, 'image/png', 1500000, p_uid::text || '/' || (p_res->'image'->>'id') || '.png', p_prompt, 1120);
end $$;
create function t.img_fail(p_uid uuid, p_res jsonb, p_code text default 'no_image') returns jsonb language plpgsql as $$
begin
  perform t.as_service();
  return public.fail_image_generation(p_uid, (p_res->'image'->>'id')::uuid, p_code, 20, 0);
end $$;
-- Generates one image and completes it.
create function t.img_generate(p_uid uuid, p_key text, p_funding text, p_org uuid default null) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  v := t.img_begin(p_uid, p_key, p_funding, p_org);
  if (v->>'ok')::boolean and not coalesce((v->>'repeat')::boolean, false) then perform t.img_ok(p_uid, v); end if;
  return v;
end $$;

-- ═══ I1: Pro — one image is exactly 9.7 PC of the plan ══════════════════════════════════════════
do $$
declare
  v_uid uuid := 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
  v jsonb;
  b public.usage_buckets;
  e public.usage_bucket_events;
  g public.generated_images;
  v_sum jsonb;
begin
  perform t.as_user(v_uid);
  perform public.get_my_usage_summary();
  v := t.img_begin(v_uid, 'pro-1', 'buckets');
  select * into b from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';
  perform t.check('I1: a Pro image holds 48,500 micro-USD (9.7 PC of a $20 / 2,000 PC plan)', (v->>'ok')::boolean and b.reserved_micro_usd = 48500 and (v->>'chargePcTenths')::int = 97, v::text);
  perform t.check('I1: the hold is recorded as image generation', (select category = 'image_generation' from public.usage_bucket_reservations where id = (select reservation_id from public.generated_images where id = (v->'image'->>'id')::uuid)));
  v := t.img_ok(v_uid, v);
  select * into b from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';
  select * into e from public.usage_bucket_events where usage_event_id like 'image:%' and user_id = v_uid;
  select * into g from public.generated_images where user_id = v_uid and request_key = 'pro-1';
  perform t.check('I1: completing charges exactly the hold — 48,500 — and releases nothing extra', b.consumed_micro_usd = 48500 and b.reserved_micro_usd = 0, row_to_json(b)::text);
  perform t.check('I1: the ledger row is image_generation, charged 48,500', e.category = 'image_generation' and e.charged_micro_usd = 48500 and e.settlement = 'reported');
  -- Provider cost: 20 input × $0.25 + 1,120 output × $30 per 1M = 5 + 33,600 micro-USD.
  perform t.check('I1: the provider cost is recorded privately from the reported usage (33,605 micro-USD)', e.actual_cost_micro_usd = 33605 and g.provider_cost_micro_usd = 33605, coalesce(e.actual_cost_micro_usd, -1)::text);
  perform t.check('I1: the image record says 9.7 PC, succeeded', g.status = 'succeeded' and g.charged_pc_tenths = 97 and g.funding = 'bucket');
  perform t.as_user(v_uid);
  v_sum := public.get_my_usage_summary();
  -- The summary shows whole PC, rounding what is left down: 9.7 PC used reads as 10 of 2,000.
  perform t.check('I1: the customer sees 10 PC used of 2,000 (9.7 PC in the existing whole-PC display)', (v_sum->'buckets'->0->>'pcUsed')::int = 10, (v_sum->'buckets'->0)::text);
  perform t.check('I1: the usage history shows the image as 9.7 PC', exists (select 1 from jsonb_array_elements(public.get_my_usage_history(10)) h where h->>'category' = 'image_generation' and (h->>'pc')::numeric = 9.7));
end $$;

-- ═══ I2: 100 images are exactly 970 PC ══════════════════════════════════════════════════════════
do $$
declare
  v_uid uuid := 'f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2';
  b public.usage_buckets;
  v_sum jsonb;
  i integer;
begin
  perform t.as_user(v_uid);
  perform public.get_my_usage_summary();
  for i in 1..100 loop
    perform t.img_generate(v_uid, 'hundred-' || i, 'buckets');
  end loop;
  select * into b from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';
  perform t.check('I2: 100 Pro Max 5x images consume exactly 4,850,000 micro-USD', b.consumed_micro_usd = 4850000 and b.reserved_micro_usd = 0, b.consumed_micro_usd::text);
  perform t.check('I2: … which is exactly 970 PC of the plan (10,000 PC = $50 private)', b.consumed_micro_usd * b.customer_pc / b.private_allowance_micro_usd = 970
    and (b.consumed_micro_usd * b.customer_pc) % b.private_allowance_micro_usd = 0);
  perform t.check('I2: 100 ledger rows, each exactly 9.7 PC', (select count(*) = 100 and bool_and(charged_micro_usd = 48500) from public.usage_bucket_events where user_id = v_uid and category = 'image_generation'));
  perform t.as_user(v_uid);
  v_sum := public.get_my_usage_summary();
  perform t.check('I2: the customer sees 970 PC used', (v_sum->'buckets'->0->>'pcUsed')::int = 970, (v_sum->'buckets'->0)::text);
  perform t.check('I2: the usage history adds up to 970.0 PC', (select sum((h->>'pc')::numeric) from jsonb_array_elements(public.get_my_usage_history(500)) h where h->>'category' = 'image_generation') = 970.0);
  perform t.check('I2: the conversion is unchanged: 100 PC = $1 of customer value (2,000 PC for $20)', b.customer_pc = b.customer_value_cents);
end $$;

-- ═══ I3: the same 9.7 PC on every kind of bucket ════════════════════════════════════════════════
do $$
begin
  perform t.check('I3: 9.7 PC is 48,500 on a plan or seat (5,000 per PC)', public.pawos_image_charge_micro_usd(10000000, 2000) = 48500 and public.pawos_image_charge_micro_usd(50000000, 10000) = 48500 and public.pawos_image_charge_micro_usd(125000000, 25000) = 48500);
  perform t.check('I3: … 58,200 on a mid-month purchase (6,000 per PC)', public.pawos_image_charge_micro_usd(9000000, 1500) = 58200 and public.pawos_image_charge_micro_usd(105000000, 17500) = 58200);
  perform t.check('I3: … 67,900 on purchased credits (7,000 per PC)', public.pawos_image_charge_micro_usd(7000000, 1000) = 67900 and public.pawos_image_charge_micro_usd(70000000, 10000) = 67900);
  perform t.check('I3: every current product divides exactly: no image is ever rounded',
    not exists (select 1 from public.usage_bucket_products p where p.private_allowance_micro_usd is not null and p.product_key not like 'future%'
                and (97 * p.private_allowance_micro_usd) % (p.customer_value_cents::bigint * 10) <> 0));
end $$;

-- ═══ I4: a retry is the same generation, never a second charge ══════════════════════════════════
do $$
declare
  v_uid uuid := 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
  v1 jsonb;
  v2 jsonb;
  v3 jsonb;
  v_before bigint;
begin
  select consumed_micro_usd into v_before from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';
  v1 := t.img_begin(v_uid, 'retry-1', 'buckets');
  v2 := t.img_begin(v_uid, 'retry-1', 'buckets');
  perform t.check('I4: the same request key returns the same generation, marked as a repeat', (v2->>'repeat')::boolean and v2->'image'->>'id' = v1->'image'->>'id', v2::text);
  perform t.check('I4: … and holds nothing more', (select count(*) = 1 from public.usage_bucket_reservations where user_id = v_uid and request_key = 'image:retry-1'));
  perform t.img_ok(v_uid, v1);
  v3 := t.img_ok(v_uid, v1);
  perform t.check('I4: completing twice charges once', (select consumed_micro_usd = v_before + 48500 from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan')
    and (select count(*) = 1 from public.usage_bucket_events where usage_event_id = 'image:' || (v1->'image'->>'id')));
  v3 := t.img_begin(v_uid, 'retry-1', 'buckets');
  perform t.check('I4: asking again after it succeeded returns the stored image, not a new one', (v3->>'repeat')::boolean and v3->'image'->>'status' = 'succeeded');
  perform t.check('I4: failing a succeeded image changes nothing', not (t.img_fail(v_uid, v1)->>'ok')::boolean
    and (select status = 'succeeded' from public.generated_images where id = (v1->'image'->>'id')::uuid));
end $$;

-- ═══ I5: no image, no charge ════════════════════════════════════════════════════════════════════
do $$
declare
  v_uid uuid := 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
  v jsonb;
  b0 public.usage_buckets;
  b1 public.usage_buckets;
  g public.generated_images;
begin
  select * into b0 from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';
  v := t.img_begin(v_uid, 'safety-1', 'buckets');
  perform t.img_fail(v_uid, v, 'image_safety');
  select * into b1 from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';
  select * into g from public.generated_images where id = (v->'image'->>'id')::uuid;
  perform t.check('I5: a refused or empty generation releases the hold: nothing consumed, nothing held', b1.consumed_micro_usd = b0.consumed_micro_usd and b1.reserved_micro_usd = 0);
  perform t.check('I5: … no ledger charge, and the reason and provider cost are kept privately', g.status = 'failed' and g.error_code = 'image_safety' and g.charged_pc_tenths = 0
    and g.provider_cost_micro_usd = 5 and not exists (select 1 from public.usage_bucket_events where usage_event_id = 'image:' || g.id::text));
  perform t.check('I5: the released hold cannot then be completed', not (t.img_ok(v_uid, v)->>'ok')::boolean
    and (select consumed_micro_usd = b0.consumed_micro_usd from public.usage_buckets where id = b0.id));
end $$;

-- ═══ I6: not enough left: refused before anything is held ═══════════════════════════════════════
do $$
declare
  v_uid uuid := 'f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6';
  v jsonb;
  v_bucket uuid;
begin
  perform t.as_user(v_uid);
  perform public.get_my_usage_summary();
  select id into v_bucket from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';
  perform t.as_service();
  update public.usage_buckets set consumed_micro_usd = private_allowance_micro_usd - 48499, period_start = now() - interval '8 days' where id = v_bucket;
  v := t.img_begin(v_uid, 'poor-1', 'buckets');
  perform t.check('I6: one micro-USD short of an image: refused, nothing held, no record', not (v->>'ok')::boolean and v->>'reason' = 'no_allowance'
    and (select reserved_micro_usd = 0 from public.usage_buckets where id = v_bucket)
    and not exists (select 1 from public.generated_images where user_id = v_uid), v::text);
  update public.usage_buckets set consumed_micro_usd = private_allowance_micro_usd - 48500 where id = v_bucket;
  v := t.img_generate(v_uid, 'poor-2', 'buckets');
  perform t.check('I6: exactly enough left: the image is made and the plan reaches exactly its allowance, never past it',
    (v->>'ok')::boolean and (select consumed_micro_usd = private_allowance_micro_usd and reserved_micro_usd = 0 from public.usage_buckets where id = v_bucket));
  perform t.check('I6: every bucket invariant still holds', t.invariants_hold());
end $$;

-- ═══ I7: weekly pacing applies to images too ════════════════════════════════════════════════════
do $$
declare
  v_uid uuid := 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
  v jsonb;
  v_bucket uuid;
begin
  select id into v_bucket from public.usage_buckets where user_id = v_uid and source_type = 'monthly_plan';
  perform t.as_service();
  -- The week's pace: only 1,000 micro-USD above what this week has already used.
  update public.usage_buckets b set weekly_pacing_micro_usd = public.pawos_bucket_week_used(b.id, public.pawos_week_index(b.period_start, now())) + 1000
  where b.id = v_bucket;
  v := t.img_begin(v_uid, 'paced-1', 'buckets');
  perform t.check('I7: with the week''s pace used up, an image waits for the weekly reset like any other call', not (v->>'ok')::boolean and v->>'reason' = 'plan_weekly_paced', v::text);
end $$;

-- ═══ I8: Paw Go — three free images, then purchased credits ═════════════════════════════════════
do $$
declare
  v_uid uuid := 'f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3';
  v jsonb;
  i integer;
begin
  perform t.as_service();
  perform t.check('I8: a Go account starts with 3 free images', public.get_free_images_left(v_uid) = 3);
  v := t.img_begin(v_uid, 'go-fail', 'free_then_credits');
  perform t.img_fail(v_uid, v, 'image_safety');
  perform t.check('I8: a failed or refused image does not use a free one', public.get_free_images_left(v_uid) = 3);
  for i in 1..3 loop
    v := t.img_generate(v_uid, 'go-' || i, 'free_then_credits');
    perform t.check(format('I8: free image %s of 3 is made, at no charge', i), (v->>'ok')::boolean and v->'image'->>'funding' = 'free', v::text);
  end loop;
  perform t.as_service();
  perform t.check('I8: after three, none are left', public.get_free_images_left(v_uid) = 0);
  v := t.img_begin(v_uid, 'go-4', 'free_then_credits');
  perform t.check('I8: the fourth is refused with no credits, before anything else happens', not (v->>'ok')::boolean and v->>'reason' = 'free_images_used'
    and not exists (select 1 from public.generated_images where user_id = v_uid and request_key = 'go-4'), v::text);
  perform t.check('I8: free images are never charged', (select coalesce(sum(charged_pc_tenths), 0) = 0 from public.generated_images where user_id = v_uid)
    and not exists (select 1 from public.usage_bucket_events where user_id = v_uid));
end $$;

do $$
declare
  v_uid uuid := 'f4f4f4f4-f4f4-4f4f-8f4f-f4f4f4f4f4f4';
  v jsonb;
  c public.usage_buckets;
  i integer;
begin
  for i in 1..3 loop perform t.img_generate(v_uid, 'gc-' || i, 'free_then_credits'); end loop;
  perform t.as_service();
  perform public.add_usage_credits_service(v_uid, null, 10, 'pay_img_credits');
  select * into c from public.usage_buckets where user_id = v_uid and source_type = 'purchased_credits';
  v := t.img_generate(v_uid, 'gc-4', 'free_then_credits');
  select * into c from public.usage_buckets where id = c.id;
  perform t.check('I8: after the free images, purchased credits pay: 9.7 PC = 67,900 micro-USD of a $10 credit', (v->>'ok')::boolean and v->'image'->>'funding' = 'bucket'
    and c.consumed_micro_usd = 67900 and c.reserved_micro_usd = 0, row_to_json(c)::text);
  perform t.as_user(v_uid);
  perform t.check('I8: … shown as 9.7 PC of 1,000', (select (h->>'pc')::numeric = 9.7 from jsonb_array_elements(public.get_my_usage_history(10)) h where h->>'category' = 'image_generation' limit 1));
end $$;

-- ═══ I9: Enterprise — one unit of the organization's pool ═══════════════════════════════════════
do $$
declare
  v_uid uuid := 'f5f5f5f5-f5f5-4f5f-8f5f-f5f5f5f5f5f5';
  v_org uuid := 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
  v jsonb;
  used integer;
begin
  v := t.img_generate(v_uid, 'ent-1', 'organization', v_org);
  select used_amount into used from public.organization_usage_counters where organization_id = v_org and capability = 'aiReasoning';
  perform t.check('I9: an Enterprise image uses one unit of the pool, the same unit as a chat turn', (v->>'ok')::boolean and used = 1 and v->'image'->>'funding' = 'organization', v::text);
  perform t.check('I9: … and nothing from any bucket', not exists (select 1 from public.usage_buckets where user_id = v_uid));
  v := t.img_begin(v_uid, 'ent-2', 'organization', v_org);
  perform t.img_fail(v_uid, v);
  select used_amount into used from public.organization_usage_counters where organization_id = v_org and capability = 'aiReasoning';
  perform t.check('I9: a failed image gives its unit back', used = 1, used::text);
  perform t.img_generate(v_uid, 'ent-3', 'organization', v_org);
  perform t.img_generate(v_uid, 'ent-4', 'organization', v_org);
  v := t.img_begin(v_uid, 'ent-5', 'organization', v_org);
  select used_amount into used from public.organization_usage_counters where organization_id = v_org and capability = 'aiReasoning';
  perform t.check('I9: once the month''s pool is used, the next image is refused and nothing more is counted', not (v->>'ok')::boolean and v->>'reason' = 'organization_limit' and used = 3, v::text);
  begin
    perform t.img_begin('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'not-a-member', 'organization', v_org);
    perform t.check('I9: someone outside the organization cannot use its pool', false);
  exception when others then
    perform t.check('I9: someone outside the organization cannot use its pool', sqlerrm like 'not_an_organization_member%', sqlerrm);
  end;
end $$;

-- ═══ I10: what is checked before anything is held ═══════════════════════════════════════════════
do $$
declare
  v_uid uuid := 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
  c record;
begin
  for c in select * from (values ('9:7', '1K', 'invalid_aspect_ratio'), ('1:1', '2K', 'invalid_image_size'), ('1:1', '1k', 'invalid_image_size'), ('1:1', null, 'invalid_image_size')) as v(ratio, size, err) loop
    begin
      perform t.img_begin(v_uid, 'bad-' || coalesce(c.size, 'null') || c.ratio, 'buckets', null, c.ratio, c.size);
      perform t.check(format('I10: %s / %s is refused', c.ratio, coalesce(c.size, 'no size')), false);
    exception when others then
      perform t.check(format('I10: %s / %s is refused', c.ratio, coalesce(c.size, 'no size')), sqlerrm like c.err || '%', sqlerrm);
    end;
  end loop;
  begin
    perform t.img_begin(v_uid, repeat('k', 101), 'buckets');
    perform t.check('I10: an over-long request key is refused', false);
  exception when others then
    perform t.check('I10: an over-long request key is refused', sqlerrm like 'invalid_request_key%', sqlerrm);
  end;
  begin
    perform t.img_begin(v_uid, 'bad-funding', 'unlimited');
    perform t.check('I10: an unknown way of paying is refused', false);
  exception when others then
    perform t.check('I10: an unknown way of paying is refused', sqlerrm like 'invalid_funding%', sqlerrm);
  end;
  begin
    perform t.as_service();
    perform public.complete_image_generation(v_uid, (select id from public.generated_images where user_id = 'f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3' limit 1), 'image/png', 10, v_uid::text || '/x.png', 1, 1);
    perform t.check('I10: one account cannot complete another account''s generation', false);
  exception when others then
    perform t.check('I10: one account cannot complete another account''s generation', sqlerrm like 'generation_not_found%', sqlerrm);
  end;
end $$;

-- ═══ I11: clients cannot reach any of it ════════════════════════════════════════════════════════
select t.as_user('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1');
set role authenticated;
do $$
declare
  c record;
begin
  for c in select * from (values
    ('begin', $q$select public.begin_image_generation('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'client-1', 'gemini-3.1-flash-lite-image', '1:1', '1K', 'buckets', null)$q$),
    ('complete', $q$select public.complete_image_generation('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', gen_random_uuid(), 'image/png', 10, 'x/y', 1, 1)$q$),
    ('fail', $q$select public.fail_image_generation('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', gen_random_uuid(), 'x', 1, 1)$q$),
    ('read an image record', $q$select public.get_generated_image('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', gen_random_uuid())$q$),
    ('read free images left', $q$select public.get_free_images_left('f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3')$q$),
    ('read the image table', $q$select count(*) from public.generated_images$q$),
    ('write the image table', $q$insert into public.generated_images (user_id, request_key, funding, model, aspect_ratio, image_size) values ('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'forged', 'free', 'm', '1:1', '1K')$q$)
  ) as v(name, sql) loop
    begin
      execute c.sql;
      insert into t.results (name, ok) values ('I11: a signed-in client cannot ' || c.name, false);
    exception when insufficient_privilege then
      insert into t.results (name, ok) values ('I11: a signed-in client cannot ' || c.name, true);
    when others then
      insert into t.results (name, ok, detail) values ('I11: a signed-in client cannot ' || c.name, sqlerrm like 'unauthorized%' or sqlerrm like 'permission denied%', sqlerrm);
    end;
  end loop;
end $$;
reset role;

-- ═══ I12: text usage is untouched ═══════════════════════════════════════════════════════════════
do $$
declare
  v_uid uuid := 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
  v jsonb;
  e public.usage_bucket_events;
begin
  perform t.as_service();
  update public.usage_buckets set period_start = now() - interval '8 days' where user_id = v_uid and source_type = 'monthly_plan';
  perform t.as_user(v_uid);
  v := public.reserve_usage('text-after-images', 'gemini-flash-latest', 2000, false, 8000, 'chat', 'standard');
  perform public.settle_usage((v->>'reservationId')::uuid, 'text-after-images-event', 2000, 300, 0, 0);
  select * into e from public.usage_bucket_events where usage_event_id = 'text-after-images-event';
  perform t.check('I12: a chat call is still priced from its tokens (2,000 × 0.75 + 300 × 3.75 = 2,625)', e.charged_micro_usd = 2625 and e.category = 'chat', row_to_json(e)::text);
  perform t.check('I12: every bucket invariant holds after all of the above', t.invariants_hold());
end $$;
