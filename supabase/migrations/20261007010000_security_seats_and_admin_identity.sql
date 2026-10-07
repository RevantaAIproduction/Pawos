-- Migration: 20261007010000_security_seats_and_admin_identity
--
-- SECURITY. Two more places where a signed-in user's own request decided something only PawOS
-- billing or an existing administrator may decide.
--
--  1. Team seats. pawos_ensure_plan_buckets() gives every active member of a Team organization a
--     monthly usage allowance, sized by organization_members.seat_tier (Standard = the Pro
--     allowance, Premium = the Pro Max 5x allowance). But the membership policy lets an
--     organization's owner or admin write any membership row, so with a direct API request they
--     could (a) mark members Premium without having bought Premium seats and (b) activate more
--     members than the seats they paid for — each one funded by PawOS. The app also raised
--     organizations.seat_count itself after an "Add member seat" payment.
--
--     Now: what was bought lives on the organization and only the server writes it —
--       seat_count          paid seats in total
--       paid_premium_seats  how many of those are Premium
--     Seats are added by pawos_apply_seat_purchase(), which only pawos-web's service role can
--     call, after it has verified the payment with Razorpay; every payment is recorded once in
--     organization_seat_purchases, so a repeated or replayed verification adds nothing.
--     A trigger on organization_members holds requests made by signed-in users to what was paid:
--     no more active members than seat_count, no more Premium members than paid_premium_seats.
--     The service role and the SQL editor are not restricted.
--     The same trigger closes three ways of moving people and roles around with a direct request:
--     a membership row cannot be pointed at another organization or another account, nobody can be
--     made an active member without accepting an invite themselves, and only an organization's
--     owner can hand out (or take away) the owner role or touch the owner's own membership.
--
--     A Team / Enterprise plan payment is recorded once too (organization_plan_purchases, through
--     pawos_apply_plan_purchase): verifying an old plan payment again can no longer put the seat
--     counts back to what that payment bought, wiping out seats added since.
--
--  2. Administrators were recognised by email (pawos_admins.email matched to auth.users.email). An
--     email address is not an identity: it can be registered by whoever gets there first when an
--     allow-listed address has no account yet. Each admin row is now bound to one account
--     (user_id) and pawos_is_build_admin() — the single check behind every admin_* function and
--     every pawos-web admin route — matches on that id.
--     Binding happens here for the allow-listed addresses that already have a confirmed account,
--     and in admin_add_admin() when an existing administrator adds someone. An allow-listed address
--     with no bound account has NO admin access until an administrator binds it (re-add it with
--     admin_add_admin, or set user_id in the SQL editor).
--     Safety: if not a single administrator could be bound, the migration stops and changes
--     nothing, rather than leave PawOS with no administrator.
--
-- Data: adds nullable / defaulted columns (organizations.seat_count where missing,
-- organizations.paid_premium_seats, pawos_admins.user_id), one new table, and fills
-- pawos_admins.user_id. No organization, membership or seat count is changed, and no admin row is
-- removed. Existing Premium members are not touched; organizations whose Premium members exceed
-- paid_premium_seats (0 until recorded) are listed by the audit queries for manual review.
--
-- Run AFTER 20261007000000_security_org_tier_and_admin_lockdown.sql.

-- ── 1a. What the organization paid for ──────────────────────────────────────────────────────────
-- seat_count is what the payment routes write (verify-tier-payment, the Razorpay webhook) and what
-- the seat limit below reads. Later migrations assumed it; create it where it is missing so a paid
-- Team / Enterprise purchase can be recorded at all.
alter table public.organizations add column if not exists seat_count integer;
alter table public.organizations add column if not exists paid_premium_seats integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_paid_premium_seats_check') then
    alter table public.organizations add constraint organizations_paid_premium_seats_check check (paid_premium_seats >= 0);
  end if;
end;
$$;

-- paid_premium_seats joins the billing columns clients can never set (see 20261007000000).
create or replace function public.pawos_guard_organization_billing_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
  v_column text;
begin
  -- Only statements issued directly by an API client. The service role, the database owner
  -- (migrations, SQL editor) and SECURITY DEFINER functions run as other roles.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if (v_new ->> 'tier') is distinct from 'go' then
      raise exception 'An organization is created on the free plan. Paid plans are applied after payment.' using errcode = '42501';
    end if;
    foreach v_column in array array['paid_premium_seats', 'api_budget_usd', 'api_usage_usd'] loop
      if coalesce((v_new ->> v_column)::numeric, 0) <> 0 then
        raise exception 'Column "%" of an organization is managed by PawOS billing.', v_column using errcode = '42501';
      end if;
    end loop;
    -- seat_count: empty, or the single seat that the column defaults to in schemas that define it
    -- as NOT NULL DEFAULT 1. A free organization's seat count grants nothing; more must be bought.
    if coalesce((v_new ->> 'seat_count')::numeric, 0) not in (0, 1) then
      raise exception 'Column "seat_count" of an organization is managed by PawOS billing.' using errcode = '42501';
    end if;
    return new;
  end if;

  v_old := to_jsonb(old);
  foreach v_column in array array['tier', 'owner_user_id', 'seat_count', 'paid_premium_seats', 'api_budget_usd', 'api_usage_usd'] loop
    if (v_new -> v_column) is distinct from (v_old -> v_column) then
      raise exception 'Column "%" of an organization is managed by PawOS billing.', v_column using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

-- ── 1b. Seat purchases: one row per verified payment ────────────────────────────────────────────
create table if not exists public.organization_seat_purchases (
  payment_id text primary key,                       -- Razorpay payment id: a payment adds seats once
  order_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  buyer_user_id uuid references auth.users(id) on delete set null,
  seat_tier text not null check (seat_tier in ('standard', 'premium')),
  seats integer not null check (seats between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists organization_seat_purchases_org_idx on public.organization_seat_purchases (organization_id, created_at desc);
alter table public.organization_seat_purchases enable row level security;
revoke all on public.organization_seat_purchases from public, anon, authenticated;

-- Adds paid seats to an organization. Backend-only: pawos-web calls it with the service-role key
-- after verifying the Razorpay payment, with the organization, buyer, seat tier and quantity taken
-- from the order it created itself (never from the request that asks for verification).
-- Idempotent per payment. Returns { applied, seatCount, paidPremiumSeats }.
create or replace function public.pawos_apply_seat_purchase(
  p_payment_id text,
  p_order_id text,
  p_organization_id uuid,
  p_buyer_user_id uuid,
  p_seat_tier text,
  p_seats integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org public.organizations;
  v_inserted integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'unauthorized: pawos_apply_seat_purchase is a backend-only operation' using errcode = '42501';
  end if;
  if coalesce(btrim(p_payment_id), '') = '' then
    raise exception 'invalid_payment_id' using errcode = '22023';
  end if;
  if p_seat_tier is null or p_seat_tier not in ('standard', 'premium') then
    raise exception 'invalid_seat_tier' using errcode = '22023';
  end if;
  if p_seats is null or p_seats < 1 or p_seats > 500 then
    raise exception 'invalid_seat_count' using errcode = '22023';
  end if;

  select * into v_org from public.organizations where id = p_organization_id for update;
  if v_org.id is null then
    raise exception 'organization_not_found' using errcode = 'P0002';
  end if;
  if v_org.tier not in ('team', 'enterprise') then
    raise exception 'organization_has_no_paid_plan' using errcode = '22023';
  end if;
  -- The buyer recorded on the order must (still) run this organization.
  if p_buyer_user_id is null or not (
       v_org.owner_user_id = p_buyer_user_id
       or exists (
         select 1 from public.organization_members m
         where m.organization_id = p_organization_id and m.user_id = p_buyer_user_id and m.status = 'active'
           and m.role in ('owner', 'organizationOwner', 'organizationAdministrator', 'billingAdministrator')
       )
     ) then
    raise exception 'buyer_does_not_manage_organization' using errcode = '42501';
  end if;

  insert into public.organization_seat_purchases (payment_id, order_id, organization_id, buyer_user_id, seat_tier, seats)
  values (btrim(p_payment_id), p_order_id, p_organization_id, p_buyer_user_id, p_seat_tier, p_seats)
  on conflict (payment_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    update public.organizations
       set seat_count = coalesce(seat_count, 0) + p_seats,
           paid_premium_seats = paid_premium_seats + case when p_seat_tier = 'premium' then p_seats else 0 end
     where id = p_organization_id
     returning * into v_org;
  end if;

  return jsonb_build_object('applied', v_inserted = 1, 'seatCount', v_org.seat_count, 'paidPremiumSeats', v_org.paid_premium_seats);
end;
$$;

revoke all on function public.pawos_apply_seat_purchase(text, text, uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.pawos_apply_seat_purchase(text, text, uuid, uuid, text, integer) to service_role;

-- ── 1c. Plan purchases: one row per verified payment ────────────────────────────────────────────
create table if not exists public.organization_plan_purchases (
  payment_id text primary key,                       -- Razorpay payment id: a payment is applied once
  order_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  buyer_user_id uuid references auth.users(id) on delete set null,
  tier text not null check (tier in ('team', 'enterprise')),
  seat_tier text check (seat_tier is null or seat_tier in ('standard', 'premium')),
  seats integer not null check (seats between 1 and 100000),
  created_at timestamptz not null default now()
);
create index if not exists organization_plan_purchases_org_idx on public.organization_plan_purchases (organization_id, created_at desc);
alter table public.organization_plan_purchases enable row level security;
revoke all on public.organization_plan_purchases from public, anon, authenticated;

-- Puts an organization on the plan a verified payment bought. Backend-only (service role), called by
-- pawos-web after it has verified the payment with Razorpay; the organization is the buyer's own,
-- chosen by the server. Idempotent per payment: the first call applies the plan, any later call for
-- the same payment changes nothing. Seat counts only ever go up here — a plan payment for N seats
-- guarantees at least N (and, on Premium, at least N Premium), and never removes seats bought since.
-- Returns { applied, tier, seatCount, paidPremiumSeats }.
create or replace function public.pawos_apply_plan_purchase(
  p_payment_id text,
  p_order_id text,
  p_organization_id uuid,
  p_buyer_user_id uuid,
  p_tier text,
  p_seat_tier text,
  p_seats integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org public.organizations;
  v_inserted integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'unauthorized: pawos_apply_plan_purchase is a backend-only operation' using errcode = '42501';
  end if;
  if coalesce(btrim(p_payment_id), '') = '' then
    raise exception 'invalid_payment_id' using errcode = '22023';
  end if;
  if p_tier is null or p_tier not in ('team', 'enterprise') then
    raise exception 'invalid_tier' using errcode = '22023';
  end if;
  if p_seat_tier is not null and p_seat_tier not in ('standard', 'premium') then
    raise exception 'invalid_seat_tier' using errcode = '22023';
  end if;
  if p_seats is null or p_seats < 1 or p_seats > 100000 then
    raise exception 'invalid_seat_count' using errcode = '22023';
  end if;

  select * into v_org from public.organizations where id = p_organization_id for update;
  if v_org.id is null then
    raise exception 'organization_not_found' using errcode = 'P0002';
  end if;
  -- The plan goes to the buyer's own organization, never to somebody else's.
  if p_buyer_user_id is null or v_org.owner_user_id is distinct from p_buyer_user_id then
    raise exception 'buyer_does_not_own_organization' using errcode = '42501';
  end if;

  insert into public.organization_plan_purchases (payment_id, order_id, organization_id, buyer_user_id, tier, seat_tier, seats)
  values (btrim(p_payment_id), p_order_id, p_organization_id, p_buyer_user_id, p_tier, p_seat_tier, p_seats)
  on conflict (payment_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    update public.organizations
       set tier = p_tier,
           seat_count = greatest(coalesce(seat_count, 0), p_seats),
           paid_premium_seats = greatest(paid_premium_seats, case when p_tier = 'team' and p_seat_tier = 'premium' then p_seats else 0 end)
     where id = p_organization_id
     returning * into v_org;
  end if;

  return jsonb_build_object('applied', v_inserted = 1, 'tier', v_org.tier, 'seatCount', v_org.seat_count, 'paidPremiumSeats', v_org.paid_premium_seats);
end;
$$;

revoke all on function public.pawos_apply_plan_purchase(text, text, uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.pawos_apply_plan_purchase(text, text, uuid, uuid, text, text, integer) to service_role;

-- ── 1d. Memberships: paid seats, and who may move people and roles ──────────────────────────────
-- Applies to every request made with a signed-in user's token, including through SECURITY DEFINER
-- functions such as accept_organization_invite() (the JWT role is what is tested, not current_user).
-- Organizations on the free plan fund nothing per seat and are not limited here.
create or replace function public.pawos_guard_organization_member_seats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org jsonb;
  v_seat_count integer;
  v_premium_paid integer;
  v_in_use integer;
  v_becomes_active boolean;
  v_takes_premium boolean;
  v_caller uuid := auth.uid();
  v_owner uuid;
  v_caller_is_owner boolean;
  v_owner_roles constant text[] := array['owner', 'organizationOwner'];
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;

  select to_jsonb(o) into v_org from public.organizations o where o.id = new.organization_id;
  if v_org is null then
    return new; -- the foreign key reports the missing organization
  end if;
  v_owner := (v_org ->> 'owner_user_id')::uuid;

  -- A membership stays in its organization and with its account. The account on a row is set by
  -- that account itself (creating its own organization's first row, or accepting an invite) —
  -- never by somebody else on its behalf.
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id then
      raise exception 'A membership cannot be moved to another organization.' using errcode = '42501';
    end if;
    if old.user_id is not null and new.user_id is distinct from old.user_id then
      raise exception 'A membership cannot be handed to another account.' using errcode = '42501';
    end if;
  end if;
  if new.user_id is not null and new.user_id is distinct from v_caller
     and (tg_op = 'INSERT' or old.user_id is null) then
    raise exception 'An account joins an organization by accepting its own invite.' using errcode = '42501';
  end if;
  if new.status = 'active' and new.user_id is null then
    raise exception 'An active membership needs the account that accepted it.' using errcode = '42501';
  end if;

  -- Owner-level roles, and the owner's own membership, are the owner's to change.
  v_caller_is_owner := v_caller is not null and (
    v_caller = v_owner
    or exists (
      select 1 from public.organization_members m
      where m.organization_id = new.organization_id and m.user_id = v_caller and m.status = 'active' and m.role = any (v_owner_roles)
    )
  );
  if not v_caller_is_owner then
    if new.role = any (v_owner_roles) and (tg_op = 'INSERT' or old.role is distinct from new.role) then
      raise exception 'Only the organization''s owner can grant the owner role.' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (old.role = any (v_owner_roles) or old.user_id = v_owner)
       and (new.role is distinct from old.role or new.status is distinct from old.status) then
      raise exception 'Only the organization''s owner can change an owner''s membership.' using errcode = '42501';
    end if;
  end if;

  -- Seats are only counted for paid organizations.
  if (v_org ->> 'tier') not in ('team', 'enterprise') then
    return new;
  end if;

  v_becomes_active := new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active');
  -- A Premium seat is held by an invited or active member on the Premium rate.
  v_takes_premium := new.seat_tier = 'premium' and new.status in ('invited', 'active')
    and (tg_op = 'INSERT' or old.seat_tier is distinct from 'premium' or old.status not in ('invited', 'active'));

  if not (v_becomes_active or v_takes_premium) then
    return new;
  end if;

  -- One at a time per organization, so two requests cannot both take the last seat.
  perform pg_advisory_xact_lock(hashtext('org_seats:' || new.organization_id::text));

  if v_takes_premium then
    v_premium_paid := coalesce((v_org ->> 'paid_premium_seats')::integer, 0);
    select count(*) into v_in_use
    from public.organization_members m
    where m.organization_id = new.organization_id and m.seat_tier = 'premium' and m.status in ('invited', 'active') and m.id is distinct from new.id;
    if v_in_use >= v_premium_paid then
      raise exception 'This organization has % paid Premium seat(s), all in use.', v_premium_paid using errcode = '42501';
    end if;
  end if;

  -- No more active members than paid seats (when the organization has a seat count on record).
  v_seat_count := (v_org ->> 'seat_count')::integer;
  if v_becomes_active and v_seat_count is not null then
    select count(*) into v_in_use
    from public.organization_members m
    where m.organization_id = new.organization_id and m.status = 'active' and m.id is distinct from new.id;
    if v_in_use >= v_seat_count then
      raise exception 'All % paid seats of this organization are in use.', v_seat_count using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.pawos_guard_organization_member_seats() from public, anon, authenticated;

drop trigger if exists trg_guard_organization_member_seats on public.organization_members;
create trigger trg_guard_organization_member_seats
  before insert or update on public.organization_members
  for each row execute function public.pawos_guard_organization_member_seats();

-- Deleting an owner's membership row is the owner's call as well.
create or replace function public.pawos_guard_organization_member_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_owner uuid;
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return old;
  end if;
  select o.owner_user_id into v_owner from public.organizations o where o.id = old.organization_id;
  if v_owner is null then
    return old; -- the organization itself is being deleted
  end if;
  if (old.role in ('owner', 'organizationOwner') or old.user_id = v_owner)
     and v_caller is distinct from v_owner
     and not exists (
       select 1 from public.organization_members m
       where m.organization_id = old.organization_id and m.user_id = v_caller and m.status = 'active' and m.role in ('owner', 'organizationOwner')
     ) then
    raise exception 'Only the organization''s owner can remove an owner''s membership.' using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke all on function public.pawos_guard_organization_member_delete() from public, anon, authenticated;

drop trigger if exists trg_guard_organization_member_delete on public.organization_members;
create trigger trg_guard_organization_member_delete
  before delete on public.organization_members
  for each row execute function public.pawos_guard_organization_member_delete();

-- ── 2. Administrators are accounts, not email addresses ─────────────────────────────────────────
alter table public.pawos_admins add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists pawos_admins_user_id_key on public.pawos_admins (user_id) where user_id is not null;

-- Bind the allow-listed addresses that already have a confirmed account. Done once, here, by the
-- database owner — never again automatically from an email match.
update public.pawos_admins a
   set user_id = u.id
  from auth.users u
 where a.user_id is null
   and lower(u.email) = a.email
   and u.email_confirmed_at is not null;

-- Never leave PawOS without an administrator: if nobody could be bound, stop here (the whole
-- migration is rolled back) and say why.
do $$
declare
  v_bound integer;
  v_unbound text;
begin
  select count(*) into v_bound from public.pawos_admins where user_id is not null;
  select string_agg(email, ', ' order by email) into v_unbound from public.pawos_admins where user_id is null;
  if v_bound = 0 then
    raise exception 'No administrator account could be bound (allow-listed: %). Each needs a PawOS account with a confirmed email before this migration can run.', coalesce(v_unbound, 'none');
  end if;
  if v_unbound is not null then
    raise notice 'Administrators bound: %. NOT bound (no admin access until re-added with admin_add_admin): %', v_bound, v_unbound;
  end if;
end;
$$;

-- The single administrator check.
create or replace function public.pawos_is_build_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null
     and exists (select 1 from public.pawos_admins a where a.user_id = auth.uid());
$$;

revoke all on function public.pawos_is_build_admin() from public, anon;
grant execute on function public.pawos_is_build_admin() to authenticated;

-- Adding an administrator binds the account that address has right now (an existing administrator
-- is vouching for it). An address with no account yet is listed but has no access until it is
-- added again once the account exists.
create or replace function public.admin_add_admin(p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_user_id uuid;
begin
  perform public.pawos_require_build_admin();
  v_email := public.pawos_normalize_build_email(p_email);
  select u.id into v_user_id from auth.users u where lower(u.email) = v_email and u.email_confirmed_at is not null limit 1;

  if exists (select 1 from public.pawos_admins where email = v_email) then
    if v_user_id is not null and exists (select 1 from public.pawos_admins where email = v_email and user_id is null) then
      update public.pawos_admins set user_id = v_user_id where email = v_email;
      perform public.pawos_admin_log('admin.bind', v_email);
      return jsonb_build_object('result', 'bound', 'email', v_email);
    end if;
    return jsonb_build_object('result', 'already_admin', 'email', v_email);
  end if;

  insert into public.pawos_admins (email, user_id) values (v_email, v_user_id);
  insert into public.platform_admins (email) values (v_email) on conflict (email) do nothing;
  perform public.pawos_admin_log('admin.add', v_email);
  return jsonb_build_object('result', 'added', 'email', v_email, 'bound', v_user_id is not null);
end;
$$;

revoke all on function public.admin_add_admin(text) from public, anon;
grant execute on function public.admin_add_admin(text) to authenticated;
