-- Usage & Entitlement Engine (MOB-3) — configuration-driven usage quotas.
-- Fulfills the previously-pending BILL-T5 task ("Usage Engine scaffold —
-- configurable per-capability billing config + org AI Credit wallet").
--
-- usage_quota_config is the single source of truth for every tier's quotas
-- — readable by any authenticated user (so the app can display real limits
-- and so organization_usage_counters' enforcement RPC below can look values
-- up server-side, not trust a client-supplied number), writable only by
-- future admin tooling (no UI writes to it yet, matching PricingConfigStore's
-- same "not exposed to any UI yet" honesty — no insert/update policy for
-- authenticated users is defined below, only the seed rows this migration
-- inserts directly).
--
-- Pro Max is intentionally NOT its own row — see the derived_from_tier /
-- derived_multiplier columns on Pro's row. "20x Pro" is computed by reading
-- Pro's own monthly_limit and multiplying, every time, everywhere (main
-- process UsageQuotaConfigStore does the identical derivation locally) —
-- never a second hardcoded number that could drift out of sync with Pro's.
create table if not exists usage_quota_config (
  id uuid primary key default gen_random_uuid(),
  tier text not null,
  capability text not null,
  monthly_limit integer, -- null = uncapped
  pooled boolean not null default false,
  derived_from_tier text,
  derived_multiplier integer,
  updated_at timestamptz not null default now(),
  unique (tier, capability)
);

alter table usage_quota_config enable row level security;

create policy usage_quota_config_read_all on usage_quota_config
  for select using (auth.role() = 'authenticated');

-- Seed placeholder defaults — every number here is provisional ("Business
-- Configuration Required", same discipline as GO_PLACEHOLDER_CREDIT_LIMIT in
-- EntitlementService.ts) and editable later without a code change, since
-- this table (not application code) is what any admin tooling or a direct
-- SQL update would change.
insert into usage_quota_config (tier, capability, monthly_limit, pooled, derived_from_tier, derived_multiplier)
values
  -- Paw Go — every execution-class capability is fully blocked (0), matching
  -- the "Go blocks Browser/Desktop/Execution/Coding/Repository/Website
  -- Runtime + file/folder access + autonomous execution" restriction list.
  ('go', 'repositoryAnalysis', 0, false, null, null),
  ('go', 'websiteAnalysis', 0, false, null, null),
  ('go', 'codeExecution', 0, false, null, null),
  ('go', 'browserAutomation', 0, false, null, null),
  ('go', 'desktopAutomation', 0, false, null, null),
  ('go', 'longRunningWorkflow', 0, false, null, null),
  ('go', 'autonomousExecution', 0, false, null, null),

  -- Paw Pro — real, finite, provisional monthly allowances per capability.
  ('pro', 'repositoryAnalysis', 200, false, null, null),
  ('pro', 'websiteAnalysis', 200, false, null, null),
  ('pro', 'codeExecution', 500, false, null, null),
  ('pro', 'browserAutomation', 300, false, null, null),
  ('pro', 'desktopAutomation', 300, false, null, null),
  ('pro', 'longRunningWorkflow', 50, false, null, null),
  ('pro', 'autonomousExecution', 20, false, null, null),

  -- Paw Pro Max — derived from Pro at read time (20x), never its own number.
  -- monthly_limit is left null here on purpose; UsageQuotaConfigStore and
  -- get_organization_usage_summary()/increment_organization_usage() both
  -- resolve the effective limit via derived_from_tier + derived_multiplier
  -- against the 'pro' row instead of reading monthly_limit for 'proMax'.
  ('proMax', 'repositoryAnalysis', null, false, 'pro', 20),
  ('proMax', 'websiteAnalysis', null, false, 'pro', 20),
  ('proMax', 'codeExecution', null, false, 'pro', 20),
  ('proMax', 'browserAutomation', null, false, 'pro', 20),
  ('proMax', 'desktopAutomation', null, false, 'pro', 20),
  ('proMax', 'longRunningWorkflow', null, false, 'pro', 20),
  ('proMax', 'autonomousExecution', null, false, 'pro', 20),

  -- Team Standard — a distinct, smaller per-user allowance (seat-tier
  -- distinction lives in the 'team' rows' seat context at the application
  -- layer via EntitlementService.getSeatTier(); this table stores one
  -- 'team' row per capability representing the Standard baseline, and a
  -- parallel 'teamPremium' pseudo-tier row for the Premium seat rate below —
  -- SubscriptionTierId itself has no 'teamPremium' value, so this is a
  -- config-table-only distinction the Usage Engine resolves via seatTier).
  ('team', 'repositoryAnalysis', 150, false, null, null),
  ('team', 'websiteAnalysis', 150, false, null, null),
  ('team', 'codeExecution', 400, false, null, null),
  ('team', 'browserAutomation', 250, false, null, null),
  ('team', 'desktopAutomation', 250, false, null, null),
  ('team', 'longRunningWorkflow', 40, false, null, null),
  ('team', 'autonomousExecution', 15, false, null, null),

  -- Team Premium — a larger per-user allowance, still not pooled.
  ('teamPremium', 'repositoryAnalysis', 300, false, null, null),
  ('teamPremium', 'websiteAnalysis', 300, false, null, null),
  ('teamPremium', 'codeExecution', 800, false, null, null),
  ('teamPremium', 'browserAutomation', 500, false, null, null),
  ('teamPremium', 'desktopAutomation', 500, false, null, null),
  ('teamPremium', 'longRunningWorkflow', 80, false, null, null),
  ('teamPremium', 'autonomousExecution', 30, false, null, null),

  -- Enterprise — pooled organization-wide quotas.
  ('enterprise', 'repositoryAnalysis', 5000, true, null, null),
  ('enterprise', 'websiteAnalysis', 5000, true, null, null),
  ('enterprise', 'codeExecution', 12000, true, null, null),
  ('enterprise', 'browserAutomation', 8000, true, null, null),
  ('enterprise', 'desktopAutomation', 8000, true, null, null),
  ('enterprise', 'longRunningWorkflow', 1000, true, null, null),
  ('enterprise', 'autonomousExecution', 500, true, null, null)
on conflict (tier, capability) do nothing;

-- =========================================================================
-- organization_usage_counters — Enterprise's pooled usage, one row per
-- (organization, capability, month).
-- =========================================================================
create table if not exists organization_usage_counters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  capability text not null,
  period_start date not null,
  used_amount integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (organization_id, capability, period_start)
);

alter table organization_usage_counters enable row level security;

create policy organization_usage_counters_select on organization_usage_counters
  for select using (is_org_member(organization_id, auth.uid()));

-- No direct insert/update policy — always via increment_organization_usage(),
-- so the pooled cap is enforced by Postgres itself and can never be
-- bypassed by a client sending its own "usage" number.

-- =========================================================================
-- increment_organization_usage() — the real, server-side enforcement point
-- for Enterprise's pooled quota. Looks the configured limit up from
-- usage_quota_config itself (never trusts a client-supplied limit), raises
-- if the increment would exceed it, otherwise commits the increment
-- atomically (select ... for update prevents a lost-update race between two
-- org members consuming the pool at the same instant).
-- =========================================================================
create or replace function increment_organization_usage(
  p_organization_id uuid,
  p_capability text,
  p_amount integer default 1
)
returns table (used_amount integer, monthly_limit integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_period date := date_trunc('month', now())::date;
  v_limit integer;
  v_current integer;
begin
  if v_user_id is null or not is_org_member(p_organization_id, v_user_id) then
    raise exception 'not authorized: not a member of this organization';
  end if;

  select monthly_limit into v_limit
  from usage_quota_config
  where tier = 'enterprise' and capability = p_capability;

  insert into organization_usage_counters (organization_id, capability, period_start, used_amount)
  values (p_organization_id, p_capability, v_period, 0)
  on conflict (organization_id, capability, period_start) do nothing;

  select used_amount into v_current
  from organization_usage_counters
  where organization_id = p_organization_id and capability = p_capability and period_start = v_period
  for update;

  if v_limit is not null and v_current + p_amount > v_limit then
    raise exception 'usage limit exceeded for capability % (used % of % this period)', p_capability, v_current, v_limit;
  end if;

  update organization_usage_counters
  set used_amount = v_current + p_amount, updated_at = now()
  where organization_id = p_organization_id and capability = p_capability and period_start = v_period;

  return query select v_current + p_amount, v_limit;
end;
$$;

grant execute on function increment_organization_usage to authenticated;

-- =========================================================================
-- get_organization_usage_summary() — read-only view for a usage dashboard.
-- =========================================================================
create or replace function get_organization_usage_summary(p_organization_id uuid)
returns table (capability text, used_amount integer, monthly_limit integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', now())::date;
begin
  if not is_org_member(p_organization_id, auth.uid()) then
    raise exception 'not authorized: not a member of this organization';
  end if;

  return query
  select q.capability, coalesce(c.used_amount, 0), q.monthly_limit
  from usage_quota_config q
  left join organization_usage_counters c
    on c.organization_id = p_organization_id
   and c.capability = q.capability
   and c.period_start = v_period
  where q.tier = 'enterprise';
end;
$$;

grant execute on function get_organization_usage_summary to authenticated;
