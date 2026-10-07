-- Migration: 20261007000000_security_org_tier_and_admin_lockdown
--
-- SECURITY. Closes three ways a signed-in user holding only the public (anon) key could raise their
-- own privileges by writing to the database directly:
--
--  1. organizations — the insert policy only checked owner_user_id = auth.uid() ("tier gating
--     happens in the app"), and the update policy let an owner change any column. A free account
--     could insert a 'team' / 'enterprise' organization, or edit its own organization's tier, seat
--     count, API budget or API usage. PawOS Web (resolveAccountContext) and PawOS Desktop
--     (verifyRealOrganizationTier) both take the plan from that row.
--     Fix: a trigger on organizations. Requests made directly as anon / authenticated may only
--     create a 'go' organization and may never change the billing columns. The trusted writers are
--     unaffected: pawos-web's service-role key (verify-tier-payment, the Razorpay webhook) and
--     SECURITY DEFINER functions (enterprise API usage), which do not run as those roles.
--
--  2. platform_admins — no row level security and no revoke, so with Supabase's default table
--     grants anyone could read it or add their own email, and is_platform_admin() (used by the
--     diagnostics read policies) would then say yes.
--     Fix: RLS with no client policies, all client privileges revoked, and is_platform_admin()
--     answers only about the caller's own verified sign-in email.
--
--  3. sync_my_entitlement_tier(p_tier) — stored whatever tier the client claimed; mobile pairing and
--     mobile feature gates read it back as fact.
--     Fix: same name and signature (older apps keep working), but the argument is ignored and the
--     tier is derived on the server from the account's paid subscription and organization membership.
--
-- Also pins search_path on the membership helper functions that RLS policies call.
--
-- Data: no existing row is changed. organizations and platform_admins rows are untouched, no
-- organization is downgraded, and stored user_entitlements tiers are NOT rewritten: a stored tier
-- that the server cannot account for may be a forged claim or a paying customer whose purchase
-- predates the server's records, and this migration cannot tell which. Those rows are copied to
-- pawos_entitlement_review for a person to reconcile (section 3). From here on, each account's
-- stored tier is replaced by the derived one the next time its app signs in.
-- Before applying, run supabase/audits/20261007_organization_tier_audit.sql (read-only).
--
-- Run AFTER 20261005010000_org_give_paw_compute.sql.

-- ── 1. organizations: clients cannot choose or change billing state ─────────────────────────────
-- Not SECURITY DEFINER on purpose: current_user must be the role that issued the statement.
-- Columns are read through to_jsonb() so the guard works whether or not optional columns
-- (seat_count, api_budget_usd, api_usage_usd) exist in this database.
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
    foreach v_column in array array['seat_count', 'api_budget_usd', 'api_usage_usd'] loop
      if coalesce((v_new ->> v_column)::numeric, 0) <> 0 then
        raise exception 'Column "%" of an organization is managed by PawOS billing.', v_column using errcode = '42501';
      end if;
    end loop;
    return new;
  end if;

  v_old := to_jsonb(old);
  foreach v_column in array array['tier', 'owner_user_id', 'seat_count', 'api_budget_usd', 'api_usage_usd'] loop
    if (v_new -> v_column) is distinct from (v_old -> v_column) then
      raise exception 'Column "%" of an organization is managed by PawOS billing.', v_column using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_guard_organization_billing_columns on public.organizations;
create trigger trg_guard_organization_billing_columns
  before insert or update on public.organizations
  for each row execute function public.pawos_guard_organization_billing_columns();

-- ── 2. platform_admins: server-only ─────────────────────────────────────────────────────────────
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from public, anon, authenticated;

-- SECURITY DEFINER so the diagnostics read policies can still evaluate it once clients have no
-- access to the table. It only ever answers for the caller's own sign-in email, so it cannot be
-- used to test whether somebody else's address is an administrator.
create or replace function public.is_platform_admin(check_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(check_email, '') <> ''
     and lower(check_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     and exists (select 1 from public.platform_admins a where lower(a.email) = lower(check_email));
$$;

-- anon keeps EXECUTE: the diagnostics policies are evaluated for anon requests too, and an anon
-- caller has no email, so the answer is always false.
revoke all on function public.is_platform_admin(text) from public;
grant execute on function public.is_platform_admin(text) to anon, authenticated, service_role;

-- ── 3. Entitlement tier is derived, never declared ──────────────────────────────────────────────
-- The one derivation: an active membership of a Team / Enterprise organization, else a paid
-- personal subscription that has not lapsed (the same rule as get_my_subscription), else 'go'.
create or replace function public.pawos_derive_entitlement_tier(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select o.tier
      from public.organization_members m
      join public.organizations o on o.id = m.organization_id
      where m.user_id = p_user_id and m.status = 'active' and o.tier in ('team', 'enterprise')
      order by case o.tier when 'enterprise' then 2 else 1 end desc
      limit 1
    ),
    (
      select s.tier
      from public.pawos_subscriptions s
      where s.user_id = p_user_id
        and s.status in ('active', 'authenticated', 'pending', 'cancelled', 'completed')
        and s.current_period_end > now()
      order by case when s.tier = 'proMax' then 2 else 1 end desc, s.current_period_end desc
      limit 1
    ),
    'go'
  );
$$;

revoke all on function public.pawos_derive_entitlement_tier(uuid) from public, anon, authenticated;
grant execute on function public.pawos_derive_entitlement_tier(uuid) to service_role;

-- Kept for the apps that already call it. p_tier is ignored.
create or replace function public.sync_my_entitlement_tier(p_tier text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.user_entitlements (user_id, tier, updated_at)
  values (v_user_id, public.pawos_derive_entitlement_tier(v_user_id), now())
  on conflict (user_id) do update set tier = excluded.tier, updated_at = now();
end;
$$;

revoke all on function public.sync_my_entitlement_tier(text) from public, anon;
grant execute on function public.sync_my_entitlement_tier(text) to authenticated;

-- Rows written while the client's word was trusted. Not rewritten here — listed for review.
--   stored_tier   what the account's app claimed
--   derived_tier  what its subscription and organization membership support today
-- To accept the derived tier for one account after checking it:
--   update public.user_entitlements set tier = public.pawos_derive_entitlement_tier(user_id), updated_at = now() where user_id = '<id>';
--   update public.pawos_entitlement_review set resolved_at = now(), resolution = 'derived tier applied' where user_id = '<id>';
create table if not exists public.pawos_entitlement_review (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stored_tier text not null,
  derived_tier text not null,
  flagged_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text
);
alter table public.pawos_entitlement_review enable row level security;
revoke all on public.pawos_entitlement_review from public, anon, authenticated;

insert into public.pawos_entitlement_review (user_id, stored_tier, derived_tier)
select e.user_id, e.tier, public.pawos_derive_entitlement_tier(e.user_id)
from public.user_entitlements e
where e.tier is distinct from public.pawos_derive_entitlement_tier(e.user_id)
on conflict (user_id) do nothing;

-- ── 4. Membership helpers used inside RLS policies: fixed search_path ────────────────────────────
-- They stay executable by API roles: policies run as the querying role.
do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('is_org_member', 'is_org_manager', 'is_org_admin', 'can_manage_billing_data')
  loop
    execute format('alter function %s set search_path = public', v_function);
  end loop;
end;
$$;
