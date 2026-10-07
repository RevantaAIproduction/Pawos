-- LOCAL SCRATCH DATABASE ONLY (see run.mjs). Brings the freshly migrated schema in line with what
-- production has that the three prerequisite migrations alone do not, then adds the test accounts.

-- Production allows the free tier on organizations (the apps create every organization as 'go');
-- the original migration's check only listed team / enterprise.
alter table public.organizations drop constraint if exists organizations_tier_check;
alter table public.organizations add constraint organizations_tier_check check (tier in ('go', 'pro', 'proMax', 'team', 'enterprise'));

-- Columns added by later migrations (20260916000002, seat billing).
alter table public.organizations add column if not exists seat_count integer;
alter table public.organizations add column if not exists api_budget_usd numeric not null default 0.0 check (api_budget_usd >= 0);
alter table public.organizations add column if not exists api_usage_usd numeric not null default 0.0 check (api_usage_usd >= 0);

-- user_entitlements and sync_my_entitlement_tier exactly as 20260730020000 defines them (that
-- migration also needs the mobile pairing tables, which are not under test here).
create table if not exists user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'go',
  updated_at timestamptz not null default now()
);
alter table user_entitlements enable row level security;
create policy user_entitlements_own_select on user_entitlements for select using (user_id = auth.uid());

create or replace function sync_my_entitlement_tier(p_tier text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authorized';
  end if;
  if p_tier not in ('go', 'pro', 'proMax', 'team', 'enterprise') then
    raise exception 'invalid tier: %', p_tier;
  end if;

  insert into user_entitlements (user_id, tier, updated_at)
  values (v_user_id, p_tier, now())
  on conflict (user_id) do update set tier = excluded.tier, updated_at = now();
end;
$$;
grant execute on function sync_my_entitlement_tier to authenticated;

-- Stands in for record_enterprise_api_usage (20260916000003): a SECURITY DEFINER function, called
-- by a signed-in member, that updates a billing column. It must keep working.
create or replace function record_usage_like_definer(p_organization_id uuid, p_cost_usd numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_org_member(p_organization_id, auth.uid()) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  update organizations set api_usage_usd = api_usage_usd + p_cost_usd where id = p_organization_id;
end;
$$;
grant execute on function record_usage_like_definer(uuid, numeric) to authenticated;

-- Accounts.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'free-user@attacker.test'),
  ('22222222-2222-2222-2222-222222222222', 'pro-user@customer.test'),
  ('33333333-3333-3333-3333-333333333333', 'owner@paying-team.test'),
  ('44444444-4444-4444-4444-444444444444', 'member@paying-team.test'),
  ('55555555-5555-5555-5555-555555555555', 'founder@revantaai.com');
update auth.users set email_confirmed_at = now();

-- pawos@revantaai.com is on the admin allow-list (20260924000000) but, in this scenario, never had
-- an account. Somebody registers that address after the fact.
insert into auth.users (id, email, email_confirmed_at) values ('66666666-6666-6666-6666-666666666666', 'pawos@revantaai.com', null);

-- A paying Team organization (created by the server after payment) with an owner and a member.
insert into organizations (id, slug, name, tier, owner_user_id, seat_count, api_budget_usd)
values ('99999999-9999-9999-9999-999999999999', 'paying-team', 'Paying Team', 'team', '33333333-3333-3333-3333-333333333333', 5, 50);
insert into organization_members (organization_id, user_id, email, role, status, joined_at) values
  ('99999999-9999-9999-9999-999999999999', '33333333-3333-3333-3333-333333333333', 'owner@paying-team.test', 'owner', 'active', now()),
  ('99999999-9999-9999-9999-999999999999', '44444444-4444-4444-4444-444444444444', 'member@paying-team.test', 'member', 'active', now());

-- A paid Pro subscription.
insert into pawos_subscriptions (id, user_id, tier, status, current_period_end, source)
values ('sub_test_pro', '22222222-2222-2222-2222-222222222222', 'pro', 'active', now() + interval '20 days', 'test');

-- Somebody else's diagnostic report (only a platform admin should be able to read it).
insert into diagnostic_issues (id, human_id, fingerprint, type, report_source, component, summary)
values ('77777777-7777-7777-7777-777777777777', 'PAW-TEST-1', 'fp-test', 'bug', 'desktop', 'backend', 'Crash with a private path in it');
insert into diagnostic_reports (issue_id, user_id, email, type, report_source, component, summary)
values ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', 'pro-user@customer.test', 'bug', 'desktop', 'backend', 'Crash with a private path in it');

-- Stand-in for autonomous_task_runs (its own migrations need the whole autonomous billing schema):
-- the columns and the own-run rule that 20260907000001's policies on autonomous_external_writes use.
create table if not exists autonomous_task_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  organization_id uuid references organizations(id)
);
alter table autonomous_task_runs enable row level security;
create policy autonomous_task_runs_own on autonomous_task_runs
  for select using (user_id = auth.uid() or (organization_id is not null and is_org_member(organization_id, auth.uid())));

-- Stand-in for organization_billing_events (same reason): only what the old wallet migrations alter.
create table if not exists organization_billing_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  run_id uuid,
  created_at timestamptz not null default now()
);
alter table organization_billing_events enable row level security;

-- Stands in for increment_organization_usage(): a SECURITY DEFINER function, called by a signed-in
-- member, that adds an amount to that organization's monthly counter. The real function
-- (20260730010000) cannot be exercised: as written it fails for every caller with
-- 'column reference "monthly_limit" is ambiguous' (its RETURNS TABLE column and the
-- usage_quota_config column share a name). run.mjs records that separately.
create or replace function counter_add_like_definer(p_organization_id uuid, p_capability text, p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', now())::date;
  v_used integer;
begin
  if not is_org_member(p_organization_id, auth.uid()) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  insert into organization_usage_counters (organization_id, capability, period_start, used_amount)
  values (p_organization_id, p_capability, v_period, 0)
  on conflict (organization_id, capability, period_start) do nothing;
  update organization_usage_counters
     set used_amount = used_amount + p_amount, updated_at = now()
   where organization_id = p_organization_id and capability = p_capability and period_start = v_period
  returning used_amount into v_used;
  return v_used;
end;
$$;
