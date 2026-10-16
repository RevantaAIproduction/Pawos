-- Tests for 20261016000000_image_generation_recovery.sql. Run by run.mjs in this folder after
-- scenarios.sql (whose helpers t.img_begin / t.img_ok / t.img_fail it uses), on a throwaway local
-- cluster only. "Time passing" is simulated by moving a generation's created_at (and a hold's
-- expires_at) into the past; the functions read the database clock.
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'rec-pro@test'),
  ('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', 'rec-ent@test'),
  ('a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3', 'rec-go@test'),
  ('a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4', 'rec-text@test'),
  ('a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a5a5', 'rec-race@test'),
  ('a6a6a6a6-a6a6-4a6a-8a6a-a6a6a6a6a6a6', 'rec-ent-2@test');
insert into public.pawos_subscriptions (id, user_id, tier, pro_max_variant, status, current_period_start, current_period_end, source, billing_frequency) values
  ('sub_rec_pro', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'pro', null, 'active', now() - interval '1 day', now() + interval '29 days', 'test', 'monthly'),
  ('sub_rec_text', 'a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4', 'pro', null, 'active', now() - interval '1 day', now() + interval '29 days', 'test', 'monthly'),
  ('sub_rec_race', 'a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a5a5', 'pro', null, 'active', now() - interval '1 day', now() + interval '29 days', 'test', 'monthly');
insert into public.organizations (id, tier) values ('e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2', 'enterprise');
insert into public.organization_members (organization_id, user_id, seat_tier, status) values
  ('e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2', 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', null, 'active'),
  ('e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2', 'a6a6a6a6-a6a6-4a6a-8a6a-a6a6a6a6a6a6', null, 'active');

-- Moves a generation (and its hold) into the past.
create function t.age(p_res jsonb, p_ago interval, p_hold_expired boolean default false) returns uuid language plpgsql as $$
declare v_id uuid := (p_res->'image'->>'id')::uuid;
begin
  update public.generated_images set created_at = now() - p_ago where id = v_id;
  if p_hold_expired then
    update public.usage_bucket_reservations set expires_at = now() - interval '1 second'
    where id = (select reservation_id from public.generated_images where id = v_id);
  end if;
  return v_id;
end $$;
create function t.plan(p_uid uuid) returns public.usage_buckets language sql as $$
  select * from public.usage_buckets where user_id = p_uid and source_type = 'monthly_plan' $$;
create function t.gen(p_id uuid) returns public.generated_images language sql as $$
  select * from public.generated_images where id = p_id $$;
create function t.hold_state(p_id uuid) returns text language sql as $$
  select r.state from public.usage_bucket_reservations r join public.generated_images g on g.reservation_id = r.id where g.id = p_id $$;
create function t.org_used() returns integer language sql as $$
  select coalesce((select used_amount from public.organization_usage_counters
                   where organization_id = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2' and capability = 'aiReasoning'
                     and period_start = date_trunc('month', now())::date), 0) $$;

-- ═══ R1: the lease ══════════════════════════════════════════════════════════════════════════════
do $$
begin
  perform t.check('R1: the lease is 5 minutes — under half the 10-minute reservation timeout',
    public.pawos_image_lease() = interval '5 minutes' and (select reservation_timeout from public.pawos_engine_settings()) = interval '10 minutes');
end $$;

-- ═══ R2: a generation abandoned mid-call (Pro) is released, not charged ═════════════════════════
do $$
declare
  v_uid uuid := 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
  v jsonb;
  v_id uuid;
  b public.usage_buckets;
begin
  v := t.img_begin(v_uid, 'r2', 'buckets');
  v_id := t.age(v, interval '6 minutes');
  b := t.plan(v_uid);
  perform t.check('R2: before recovery the hold is still held', b.reserved_micro_usd = 48500 and t.hold_state(v_id) = 'held');
  perform public.pawos_bucket_housekeeping(v_uid);
  b := t.plan(v_uid);
  perform t.check('R2: housekeeping fails it as abandoned', (t.gen(v_id)).status = 'failed' and (t.gen(v_id)).error_code = 'abandoned');
  perform t.check('R2: the hold is released — nothing reserved, nothing consumed', b.reserved_micro_usd = 0 and b.consumed_micro_usd = 0 and t.hold_state(v_id) = 'released', row_to_json(b)::text);
  perform t.check('R2: no ledger charge for it', not exists (select 1 from public.usage_bucket_events where reservation_id = (t.gen(v_id)).reservation_id));
  perform t.check('R2: the customer charge on the record is 0', (t.gen(v_id)).charged_pc_tenths = 0);
end $$;

-- ═══ R3: a hold that already ran out of time is released, never charged by the timeout rule ════
do $$
declare
  v_uid uuid := 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
  v jsonb;
  v_id uuid;
  b public.usage_buckets;
begin
  v := t.img_begin(v_uid, 'r3', 'buckets');
  v_id := t.age(v, interval '11 minutes', true);
  perform public.pawos_bucket_housekeeping(v_uid);
  b := t.plan(v_uid);
  perform t.check('R3: released, not expired_settled', t.hold_state(v_id) = 'released' and (t.gen(v_id)).status = 'failed');
  perform t.check('R3: nothing consumed and no timeout ledger row', b.consumed_micro_usd = 0 and b.reserved_micro_usd = 0
    and not exists (select 1 from public.usage_bucket_events where settlement = 'timeout' and user_id = v_uid));
end $$;

-- ═══ R4: retrying the same request key ══════════════════════════════════════════════════════════
do $$
declare
  v_uid uuid := 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
  v jsonb;
  v2 jsonb;
  v_id uuid;
begin
  -- Inside the lease: still being made — nothing changes.
  v := t.img_begin(v_uid, 'r4-live', 'buckets');
  v2 := t.img_begin(v_uid, 'r4-live', 'buckets');
  perform t.check('R4: inside the lease a retry is the same pending generation, hold untouched',
    (v2->>'repeat')::boolean and v2->'image'->>'status' = 'pending' and t.hold_state((v->'image'->>'id')::uuid) = 'held');
  perform t.img_ok(v_uid, v); -- (finish it, so later checks start clean)

  -- Past the lease: the retry closes it — failed, released, the client told to start a new one.
  v := t.img_begin(v_uid, 'r4-dead', 'buckets');
  v_id := t.age(v, interval '6 minutes');
  v2 := t.img_begin(v_uid, 'r4-dead', 'buckets');
  perform t.check('R4: past the lease a retry finds it failed — never pending forever',
    (v2->>'repeat')::boolean and v2->'image'->>'status' = 'failed' and v2->'image'->>'errorCode' = 'abandoned', v2::text);
  perform t.check('R4: and its hold released', t.hold_state(v_id) = 'released');
  v2 := t.img_begin(v_uid, 'r4-dead', 'buckets');
  perform t.check('R4: a further retry changes nothing and holds nothing new',
    v2->'image'->>'status' = 'failed' and (select count(*) = 1 from public.usage_bucket_reservations where request_key = 'image:r4-dead'));
end $$;

-- ═══ R5: a late server (completing after its lease) charges nothing ═════════════════════════════
do $$
declare
  v_uid uuid := 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
  v jsonb;
  c jsonb;
  v_id uuid;
  v_before bigint;
begin
  v_before := (t.plan(v_uid)).consumed_micro_usd;
  v := t.img_begin(v_uid, 'r5', 'buckets');
  v_id := t.age(v, interval '6 minutes');
  c := t.img_ok(v_uid, v);
  perform t.check('R5: complete after the lease is refused with reason lease_expired',
    not (c->>'ok')::boolean and c->>'reason' = 'lease_expired' and c->'image'->>'status' = 'failed', c::text);
  perform t.check('R5: released, nothing consumed', t.hold_state(v_id) = 'released' and (t.plan(v_uid)).consumed_micro_usd = v_before);
  c := t.img_ok(v_uid, v);
  perform t.check('R5: completing again changes nothing', not (c->>'ok')::boolean and (t.plan(v_uid)).consumed_micro_usd = v_before);
  c := t.img_fail(v_uid, v);
  perform t.check('R5: failing it again changes nothing', not (c->>'ok')::boolean and (t.plan(v_uid)).reserved_micro_usd = 0);
end $$;

-- ═══ R6: inside the lease, recovery leaves a running generation alone ══════════════════════════
do $$
declare
  v_uid uuid := 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
  v jsonb;
  c jsonb;
  v_id uuid;
  v_before bigint;
begin
  v_before := (t.plan(v_uid)).consumed_micro_usd;
  v := t.img_begin(v_uid, 'r6', 'buckets');
  v_id := t.age(v, interval '4 minutes');
  perform t.check('R6: 4 minutes in, recovery says running', public.pawos_recover_image_generation(v_id) = 'running');
  perform public.pawos_bucket_housekeeping(v_uid);
  perform t.check('R6: housekeeping leaves it pending and held', (t.gen(v_id)).status = 'pending' and t.hold_state(v_id) = 'held');
  c := t.img_ok(v_uid, v);
  perform t.check('R6: the server completes it normally — charged exactly once', (c->>'ok')::boolean and (t.plan(v_uid)).consumed_micro_usd = v_before + 48500);
  perform t.check('R6: recovery afterwards: settled, nothing more', public.pawos_recover_image_generation(v_id) = 'settled' and (t.plan(v_uid)).consumed_micro_usd = v_before + 48500);
end $$;

-- ═══ R7: one settlement only ════════════════════════════════════════════════════════════════════
do $$
declare
  v_uid uuid := 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
  v jsonb;
  c jsonb;
  v_before bigint;
begin
  v_before := (t.plan(v_uid)).consumed_micro_usd;
  v := t.img_begin(v_uid, 'r7-a', 'buckets');
  perform t.img_fail(v_uid, v);
  c := t.img_ok(v_uid, v);
  perform t.check('R7: failed then completed: stays failed, nothing charged', not (c->>'ok')::boolean and (t.plan(v_uid)).consumed_micro_usd = v_before);
  v := t.img_begin(v_uid, 'r7-b', 'buckets');
  perform t.img_ok(v_uid, v);
  c := t.img_fail(v_uid, v);
  perform t.check('R7: completed then failed: stays succeeded, charged once',
    not (c->>'ok')::boolean and c->'image'->>'status' = 'succeeded' and (t.plan(v_uid)).consumed_micro_usd = v_before + 48500);
  perform t.age(v, interval '1 hour', true);
  perform public.pawos_bucket_housekeeping(v_uid);
  perform t.check('R7: and old housekeeping later charges nothing more', (t.plan(v_uid)).consumed_micro_usd = v_before + 48500);
end $$;

-- ═══ R8: Enterprise pool units ══════════════════════════════════════════════════════════════════
do $$
declare
  v_uid uuid := 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2';
  v_org uuid := 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2';
  v jsonb;
  v_id uuid;
  v_swept integer;
begin
  v := t.img_begin(v_uid, 'r8-a', 'organization', v_org);
  perform t.check('R8: a generation takes one unit', t.org_used() = 1);
  v_id := t.age(v, interval '6 minutes');
  v := t.img_begin(v_uid, 'r8-b', 'organization', v_org);
  perform t.check('R8: the next request gives the abandoned unit back first (1 back, 1 taken)', t.org_used() = 1 and (t.gen(v_id)).status = 'failed', t.org_used()::text);
  perform t.check('R8: recovering it again gives nothing back twice', public.pawos_recover_image_generation(v_id) = 'settled' and t.org_used() = 1);
  perform t.img_fail(v_uid, v);
  perform t.check('R8: a failed one gives its unit back once', t.org_used() = 0);

  -- The sweep, for an account that never comes back.
  v := t.img_begin(v_uid, 'r8-c', 'organization', v_org);
  v_id := t.age(v, interval '6 minutes');
  perform t.as_service();
  select count(*) into v_swept from public.recover_stale_image_generations(100) s where s.generation_id = v_id and s.user_id = v_uid;
  perform t.check('R8: the sweep settles it and reports it', v_swept = 1 and t.org_used() = 0 and (t.gen(v_id)).status = 'failed');
  select count(*) into v_swept from public.recover_stale_image_generations(100);
  perform t.check('R8: a second sweep finds nothing and gives nothing back', v_swept = 0 and t.org_used() = 0);

  -- A member who never comes back: the next image request from anyone in the organization returns the unit.
  v := t.img_begin('a6a6a6a6-a6a6-4a6a-8a6a-a6a6a6a6a6a6', 'r8-d', 'organization', v_org);
  v_id := t.age(v, interval '6 minutes');
  perform t.check('R8: another member''s abandoned generation holds a unit', t.org_used() = 1);
  v := t.img_begin(v_uid, 'r8-e', 'organization', v_org);
  perform t.check('R8: a colleague''s next request gives it back before the pool is checked (1 back, 1 taken)',
    t.org_used() = 1 and (t.gen(v_id)).status = 'failed' and (v->>'ok')::boolean, t.org_used()::text);
  perform t.img_fail(v_uid, v);
  perform t.check('R8: and the pool ends where it started', t.org_used() = 0);
end $$;

-- ═══ R9: a free Paw Go image ════════════════════════════════════════════════════════════════════
do $$
declare
  v_uid uuid := 'a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3';
  v jsonb;
  v_id uuid;
begin
  v := t.img_begin(v_uid, 'r9', 'free_then_credits');
  perform t.check('R9: a free image in progress counts', public.pawos_free_images_left(v_uid) = 2 and v->'image'->>'funding' = 'free');
  v_id := t.age(v, interval '6 minutes');
  perform public.pawos_recover_image_generations(v_uid);
  perform t.check('R9: abandoned, it no longer counts — three free images left', (t.gen(v_id)).status = 'failed' and public.pawos_free_images_left(v_uid) = 3);
end $$;

-- ═══ R10: text usage keeps the timeout rule ═════════════════════════════════════════════════════
do $$
declare
  v_uid uuid := 'a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4';
  v_res jsonb;
  v_held bigint;
begin
  perform t.as_user(v_uid);
  v_res := public.reserve_usage('rec-text-expired', 'gemini-flash-latest', 2000, false, 8000, 'chat', 'standard');
  select reserved_micro_usd into v_held from public.usage_bucket_reservations where id = (v_res->>'reservationId')::uuid;
  perform t.as_service();
  update public.usage_bucket_reservations set expires_at = now() - interval '1 second' where id = (v_res->>'reservationId')::uuid;
  perform public.pawos_bucket_housekeeping(v_uid);
  perform t.check('R10: a text call that never reported is still charged its hold by the timeout rule (unchanged)',
    v_held > 0 and (select count(*) = 1 from public.usage_bucket_events where usage_event_id = 'timeout:' || (v_res->>'reservationId') and settlement = 'timeout' and charged_micro_usd = v_held),
    coalesce(v_res::text, 'null'));
end $$;

-- ═══ R11: only the backend can reach recovery ═══════════════════════════════════════════════════
select t.as_user('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1');
set role authenticated;
do $$
declare
  c record;
begin
  for c in select * from (values
    ('run the sweep', $q$select * from public.recover_stale_image_generations(1)$q$),
    ('recover a generation', $q$select public.pawos_recover_image_generation(gen_random_uuid())$q$),
    ('recover an account', $q$select public.pawos_recover_image_generations('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1')$q$),
    ('fail a generation directly', $q$select public.pawos_fail_image_generation(gen_random_uuid(), 'x', null, null)$q$),
    ('run housekeeping directly', $q$select public.pawos_bucket_housekeeping('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1')$q$)
  ) as v(name, sql) loop
    begin
      execute c.sql;
      insert into t.results (name, ok) values ('R11: a signed-in client cannot ' || c.name, false);
    exception when insufficient_privilege then
      insert into t.results (name, ok) values ('R11: a signed-in client cannot ' || c.name, true);
    when others then
      insert into t.results (name, ok, detail) values ('R11: a signed-in client cannot ' || c.name, sqlerrm like 'unauthorized%' or sqlerrm like 'permission denied%', sqlerrm);
    end;
  end loop;
end $$;
reset role;

-- ═══ R13: a retry recovering a stored-but-unrecorded image (no token counts) ════════════════════
do $$
declare
  v_uid uuid := 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
  v jsonb;
  c jsonb;
  v_id uuid;
  v_before bigint;
begin
  v_before := (t.plan(v_uid)).consumed_micro_usd;
  v := t.img_begin(v_uid, 'r13', 'buckets');
  v_id := t.age(v, interval '3 minutes');
  perform t.as_service();
  c := public.complete_image_generation(v_uid, v_id, 'image/png', 1500000, v_uid::text || '/' || v_id::text || '.png', null, null);
  perform t.check('R13: inside the lease it is recorded and charged exactly the hold, once', (c->>'ok')::boolean and (t.plan(v_uid)).consumed_micro_usd = v_before + 48500, c::text);
  perform t.check('R13: provider cost unknown is recorded as unknown, not zero', (t.gen(v_id)).provider_cost_micro_usd is null and (t.gen(v_id)).charged_pc_tenths = 97);
  c := public.complete_image_generation(v_uid, v_id, 'image/png', 1500000, v_uid::text || '/' || v_id::text || '.png', null, null);
  perform t.check('R13: the original request completing too changes nothing', (c->>'ok')::boolean and (t.plan(v_uid)).consumed_micro_usd = v_before + 48500
    and (select count(*) = 1 from public.usage_bucket_events where usage_event_id = 'image:' || v_id::text));
end $$;

do $$
begin
  perform t.check('R12: bucket invariants hold after every recovery scenario', t.invariants_hold());
end $$;
