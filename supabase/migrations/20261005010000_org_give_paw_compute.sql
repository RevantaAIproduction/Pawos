-- Migration: 20261005010000_org_give_paw_compute
--
-- Team / Enterprise: an organization admin (owner or billing administrator) buys Paw Compute the
-- usual way, then gives some of it to a member of their organization.
--
--   give_paw_compute(org, member, pc)  moves `pc` Paw Compute out of the admin's own purchased
--                                      credits into a new usage bucket for the member — the same
--                                      reserve_usage → settle_usage engine, so it is spendable on
--                                      PawOS Desktop and PawOS Web alike.
--   get_my_givable_paw_compute()       how much purchased Paw Compute the admin can still give.
--   organization_paw_compute_gifts     who gave how much to whom, and when (no private amounts).
--
-- Only purchased credits move (never plan allowances, and never Paw Compute that was itself a
-- gift). The admin's buckets record the given amount as used; the member's new bucket holds exactly
-- that value, so nothing is created or lost. Additive: one product row, one table, three functions.

-- ── 1. The product the member's bucket uses (label shown in the member's usage) ──────────────────
insert into public.usage_bucket_products
  (product_key, source_type, subscription_plan_key, extra_usage_product_key, expiry_policy, bucket_interval_months, rank,
   customer_value_cents, private_allowance_micro_usd, weekly_pacing_micro_usd, allowance_ratio, label)
select 'org_given_credits', 'purchased_credits', null, null, 'never', null, 0, null, null, null, p.allowance_ratio,
       'Paw Compute from your organization'
from public.usage_bucket_products p where p.product_key = 'credits'
on conflict (product_key) do nothing;

-- ── 2. History ───────────────────────────────────────────────────────────────────────────────────
create table if not exists public.organization_paw_compute_gifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  given_by uuid not null references auth.users(id) on delete cascade,
  given_to uuid not null references auth.users(id) on delete cascade,
  pc integer not null check (pc > 0),
  note text check (note is null or char_length(note) <= 200),
  bucket_id uuid references public.usage_buckets(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists organization_paw_compute_gifts_org_idx on public.organization_paw_compute_gifts (organization_id, created_at desc);
create index if not exists organization_paw_compute_gifts_to_idx on public.organization_paw_compute_gifts (given_to, created_at desc);

alter table public.organization_paw_compute_gifts enable row level security;

-- ── 3. Is this person an organization admin who can buy and give? ────────────────────────────────
create or replace function public.pawos_is_org_billing_admin(p_organization_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1
    from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    where om.organization_id = p_organization_id
      and om.user_id = p_user_id
      and om.status = 'active'
      and o.tier in ('team', 'enterprise')
      and om.role in ('owner', 'billingAdministrator', 'organizationOwner', 'organizationAdministrator')
  ) or exists (
    -- The organization's creator, before their member row exists.
    select 1 from public.organizations o
    where o.id = p_organization_id and o.owner_user_id = p_user_id and o.tier in ('team', 'enterprise')
  );
$$;
revoke all on function public.pawos_is_org_billing_admin(uuid, uuid) from public, anon, authenticated;

-- The same, for the signed-in person only (used by the history's read rule).
create or replace function public.pawos_i_am_org_billing_admin(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select auth.uid() is not null and public.pawos_is_org_billing_admin(p_organization_id, auth.uid());
$$;
revoke all on function public.pawos_i_am_org_billing_admin(uuid) from public, anon;
grant execute on function public.pawos_i_am_org_billing_admin(uuid) to authenticated;

-- The giver, the receiver, and the organization's billing admins can read a gift. Nobody writes
-- directly — only give_paw_compute() does.
drop policy if exists organization_paw_compute_gifts_read on public.organization_paw_compute_gifts;
create policy organization_paw_compute_gifts_read on public.organization_paw_compute_gifts
  for select to authenticated
  using (given_by = auth.uid() or given_to = auth.uid() or public.pawos_i_am_org_billing_admin(organization_id));
revoke insert, update, delete on public.organization_paw_compute_gifts from anon, authenticated;
grant select on public.organization_paw_compute_gifts to authenticated;

-- ── 4. How much the signed-in admin can give ─────────────────────────────────────────────────────
create or replace function public.get_my_givable_paw_compute()
returns integer language plpgsql stable security definer set search_path = public, auth as $$
declare
  v_user uuid := auth.uid();
  v_min bigint := public.pawos_min_viable_micro_usd();
  v_total integer := 0;
  b record;
  v_room bigint;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '42501'; end if;
  for b in
    select * from public.usage_buckets ub
    where ub.user_id = v_user and ub.product_key = 'credits' and ub.status = 'active'
      and (ub.expires_at is null or ub.expires_at > now())
  loop
    v_room := b.private_allowance_micro_usd - b.consumed_micro_usd - b.reserved_micro_usd;
    if v_room >= v_min then
      v_total := v_total + floor(b.customer_pc::numeric * v_room / b.private_allowance_micro_usd)::integer;
    end if;
  end loop;
  return v_total;
end;
$$;
revoke all on function public.get_my_givable_paw_compute() from public, anon;
grant execute on function public.get_my_givable_paw_compute() to authenticated;

-- ── 5. Give Paw Compute to a member ─────────────────────────────────────────────────────────────
create or replace function public.give_paw_compute(
  p_organization_id uuid,
  p_member_user_id uuid,
  p_pc integer,
  p_note text default null
)
returns jsonb language plpgsql volatile security definer set search_path = public, auth as $$
declare
  v_admin uuid := auth.uid();
  v_left integer := p_pc;
  v_moved_micro bigint := 0;
  b record;
  v_room bigint;
  v_avail integer;
  v_take integer;
  v_take_micro bigint;
  v_gift_id uuid := gen_random_uuid();
  v_bucket_id uuid;
begin
  if v_admin is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_pc is null or p_pc <= 0 or p_pc > 10000000 then raise exception 'Enter an amount of Paw Compute to give.'; end if;
  if p_member_user_id is null or p_member_user_id = v_admin then raise exception 'Choose a member of your organization.'; end if;
  if not public.pawos_is_org_billing_admin(p_organization_id, v_admin) then
    raise exception 'Only your organization''s owner or billing administrators can give Paw Compute.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = p_organization_id and om.user_id = p_member_user_id and om.status = 'active'
  ) then
    raise exception 'That person isn''t an active member of your organization.';
  end if;

  -- The admin's purchased credits, oldest first, locked so a concurrent spend or gift can't overdraw.
  for b in
    select * from public.usage_buckets ub
    where ub.user_id = v_admin and ub.product_key = 'credits' and ub.status = 'active'
      and (ub.expires_at is null or ub.expires_at > now())
    order by ub.created_at, ub.id
    for update
  loop
    exit when v_left <= 0;
    v_room := b.private_allowance_micro_usd - b.consumed_micro_usd - b.reserved_micro_usd;
    v_avail := floor(b.customer_pc::numeric * v_room / b.private_allowance_micro_usd)::integer;
    continue when v_avail <= 0;
    v_take := least(v_left, v_avail);
    v_take_micro := least(v_room, ceil(b.private_allowance_micro_usd::numeric * v_take / b.customer_pc)::bigint);
    update public.usage_buckets
      set consumed_micro_usd = consumed_micro_usd + v_take_micro,
          metadata = metadata || jsonb_build_object('given_pc', coalesce((metadata->>'given_pc')::integer, 0) + v_take),
          updated_at = now()
      where id = b.id;
    v_moved_micro := v_moved_micro + v_take_micro;
    v_left := v_left - v_take;
  end loop;

  if v_left > 0 then
    raise exception 'You have % Paw Compute left to give. Buy more Paw Compute first.', p_pc - v_left;
  end if;

  insert into public.usage_buckets (
    user_id, source_type, product_key, purchase_ref, customer_value_cents, customer_pc,
    private_allowance_micro_usd, period_start, expires_at, metadata
  ) values (
    p_member_user_id, 'purchased_credits', 'org_given_credits', 'gift:' || v_gift_id, p_pc, p_pc,
    v_moved_micro, now(), null,
    jsonb_build_object('organization_id', p_organization_id, 'given_by', v_admin, 'gift_id', v_gift_id)
  ) returning id into v_bucket_id;

  insert into public.organization_paw_compute_gifts (id, organization_id, given_by, given_to, pc, note, bucket_id)
  values (v_gift_id, p_organization_id, v_admin, p_member_user_id, p_pc, nullif(btrim(coalesce(p_note, '')), ''), v_bucket_id);

  return jsonb_build_object('gift_id', v_gift_id, 'pc', p_pc, 'givable_left', public.get_my_givable_paw_compute());
end;
$$;
revoke all on function public.give_paw_compute(uuid, uuid, integer, text) from public, anon;
grant execute on function public.give_paw_compute(uuid, uuid, integer, text) to authenticated;
