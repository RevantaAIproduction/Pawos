-- Rebuilds Autonomous Engineering Task billing as a dollar-denominated wallet, completely
-- independent of subscription pricing (Go/Pro/Pro Max/Team/Enterprise pricing is untouched by
-- this migration). Previously a "credit" was an integer unit always worth a flat $5; now a user
-- tops up any dollar amount (see MIN_TICKET_BALANCE_TOPUP_USD in AutonomousTaskBillingTypes.ts —
-- currently $30) into balance_usd, and every completed ticket deducts the *current* per-ticket
-- rate from that balance. The rate is volume-tiered by this account's cumulative ticket count
-- (tickets_used_count), not by how much was topped up — the same $100 balance buys a different
-- number of tickets depending on how many tickets this account has already run:
--   1-500 tickets:      $5.00/ticket
--   501-2,000:          $4.50/ticket
--   2,001-10,000:       $4.00/ticket
--   10,001-25,000:      $3.50/ticket
--   25,000+:            $3.00/ticket
--
-- The old integer `balance` column and `task_credit_purchases`/`add_task_credits` are left in
-- place, unreferenced by any application code going forward — same additive-migration,
-- leave-old-schema-as-dead convention already used for organization_task_allowance.

alter table user_task_credits add column if not exists balance_usd numeric(10, 2) not null default 0;
alter table user_task_credits add column if not exists tickets_used_count integer not null default 0;

alter table organization_task_credits add column if not exists balance_usd numeric(10, 2) not null default 0;
alter table organization_task_credits add column if not exists tickets_used_count integer not null default 0;

-- Real purchase/top-up ledger for the new wallet model — exactly one of user_id/organization_id is set.
create table if not exists ticket_balance_topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  amount_usd numeric(10, 2) not null check (amount_usd > 0),
  payment_reference text,
  topped_up_at timestamptz not null default now(),
  constraint ticket_balance_topups_one_owner check ((user_id is not null) <> (organization_id is not null))
);
create index if not exists idx_ticket_balance_topups_user on ticket_balance_topups(user_id);
create index if not exists idx_ticket_balance_topups_org on ticket_balance_topups(organization_id);
alter table ticket_balance_topups enable row level security;
create policy ticket_balance_topups_select_own on ticket_balance_topups
  for select using (
    user_id = auth.uid()
    or organization_id in (select organization_id from organization_members where user_id = auth.uid() and status = 'active')
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );
-- No insert policy for authenticated — rows are created only by add_ticket_balance() below.

-- The rate charged for the Nth ticket this account ever completes (1-indexed). Mirrored by hand in
-- TICKET_PRICING_TIERS / getTicketUnitPriceUsd (AutonomousTaskBillingTypes.ts) and again in
-- pawos-web/src/lib/billing/razorpay.ts — keep all three in sync on any pricing change.
create or replace function get_ticket_unit_price(p_ticket_number int)
returns numeric
language sql
immutable
as $$
  select case
    when p_ticket_number <= 500 then 5.00
    when p_ticket_number <= 2000 then 4.50
    when p_ticket_number <= 10000 then 4.00
    when p_ticket_number <= 25000 then 3.50
    else 3.00
  end;
$$;

-- Adds funds to a ticket balance wallet after a real, completed top-up purchase. Same
-- same-machine trust model already accepted for add_task_credits()/SubscriptionStore.confirmPurchase
-- — the real webhook remains the authoritative source once a shared backend exists.
create or replace function add_ticket_balance(
  p_organization_id uuid,
  p_amount_usd numeric,
  p_payment_reference text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_topup_id uuid;
begin
  if p_amount_usd < 30 then
    raise exception 'Minimum top-up is $30';
  end if;

  insert into ticket_balance_topups (user_id, organization_id, amount_usd, payment_reference)
  values (case when p_organization_id is null then auth.uid() else null end, p_organization_id, p_amount_usd, p_payment_reference)
  returning id into v_topup_id;

  if p_organization_id is null then
    insert into user_task_credits (user_id, balance_usd) values (auth.uid(), p_amount_usd)
    on conflict (user_id) do update set balance_usd = user_task_credits.balance_usd + p_amount_usd, updated_at = now();
  else
    insert into organization_task_credits (organization_id, balance_usd) values (p_organization_id, p_amount_usd)
    on conflict (organization_id) do update set balance_usd = organization_task_credits.balance_usd + p_amount_usd, updated_at = now();
  end if;

  return v_topup_id;
end;
$$;
grant execute on function add_ticket_balance to authenticated;

-- Replaces the previous flat-$5-per-credit version: deducts the volume-tiered rate for this
-- account's *next* ticket (tickets_used_count + 1) from balance_usd, raising if insufficient, then
-- increments tickets_used_count so the following ticket is priced correctly. The amount actually
-- charged is now computed here, server-side, from real cumulative usage — never trusted from the
-- caller (the old p_amount_usd parameter is dropped; callers no longer supply or influence price).
-- Postgres treats a different argument list as a distinct overload rather than a replacement, so
-- the old 6-argument version is dropped explicitly first.
drop function if exists mark_autonomous_task_completed(uuid, text, boolean, boolean, numeric, text);

create or replace function mark_autonomous_task_completed(
  p_run_id uuid,
  p_pr_url text,
  p_client_reply_sent boolean,
  p_deploy_completed boolean,
  p_invoice_reference text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_run autonomous_task_runs%rowtype;
  v_event_id uuid;
  v_org_balance numeric;
  v_org_count int;
  v_user_balance numeric;
  v_user_count int;
  v_unit_price numeric;
begin
  select * into v_run from autonomous_task_runs where id = p_run_id and user_id = auth.uid();
  if v_run.id is null then
    raise exception 'No autonomous_task_runs row % owned by the calling user was found', p_run_id;
  end if;
  if v_run.status <> 'running' then
    raise exception 'Run % is already in a terminal state (%) — cannot complete it twice', p_run_id, v_run.status;
  end if;

  if v_run.organization_id is not null then
    select balance_usd, tickets_used_count into v_org_balance, v_org_count from organization_task_credits where organization_id = v_run.organization_id for update;
    v_unit_price := get_ticket_unit_price(coalesce(v_org_count, 0) + 1);
    if coalesce(v_org_balance, 0) < v_unit_price then
      raise exception 'Insufficient ticket balance for this organization (need $% at the current rate) — add funds before completing this task.', v_unit_price;
    end if;
    update organization_task_credits
    set balance_usd = balance_usd - v_unit_price, tickets_used_count = tickets_used_count + 1, updated_at = now()
    where organization_id = v_run.organization_id;
  else
    select balance_usd, tickets_used_count into v_user_balance, v_user_count from user_task_credits where user_id = v_run.user_id for update;
    v_unit_price := get_ticket_unit_price(coalesce(v_user_count, 0) + 1);
    if coalesce(v_user_balance, 0) < v_unit_price then
      raise exception 'Insufficient ticket balance (need $% at the current rate) — add funds before completing this task.', v_unit_price;
    end if;
    update user_task_credits
    set balance_usd = balance_usd - v_unit_price, tickets_used_count = tickets_used_count + 1, updated_at = now()
    where user_id = v_run.user_id;
  end if;

  update autonomous_task_runs
  set status = 'completed', pr_created = true, pr_url = p_pr_url,
      ticket_updated = true, client_reply_sent = p_client_reply_sent,
      deploy_completed = p_deploy_completed, billable = true, completed_at = now()
  where id = p_run_id;

  insert into organization_billing_events (
    run_id, organization_id, workspace_id, user_id, ticket_id, runtime_version,
    started_at, completed_at, duration_seconds, status, amount_usd, invoice_reference
  )
  values (
    p_run_id, v_run.organization_id, v_run.workspace_id, v_run.user_id, v_run.ticket_id, v_run.runtime_version,
    v_run.started_at, now(), extract(epoch from (now() - v_run.started_at))::int, 'completed', v_unit_price, p_invoice_reference
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;
grant execute on function mark_autonomous_task_completed to authenticated;
