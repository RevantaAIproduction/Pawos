-- Prepaid Autonomous Engineering Task credits — replaces the included
-- monthly allowance model completely (organization_task_allowance is left
-- in place, unreferenced, per this codebase's additive-migration
-- convention, but no application code writes to it anymore). Every task
-- must now be paid for with a prepaid credit before it can complete;
-- credits are bought in $5-each bundles (minimum purchase 6 credits / $30)
-- and deducted exactly once, only on genuine success, by
-- mark_autonomous_task_completed() below — never by any other path.
--
-- Individual (non-organization) Pro/Pro Max users can now use Autonomous
-- Engineering Tasks too — autonomous_task_runs.organization_id and
-- organization_billing_events.organization_id become nullable, and a
-- parallel per-user credit balance (user_task_credits) sits alongside the
-- existing per-organization one.

alter table autonomous_task_runs alter column organization_id drop not null;
alter table organization_billing_events alter column organization_id drop not null;

-- Per-user prepaid balance (individual Pro/Pro Max accounts, no organization).
create table if not exists user_task_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table user_task_credits enable row level security;
create policy user_task_credits_own_select on user_task_credits
  for select using (user_id = auth.uid());
-- No insert/update policy for authenticated — mutated only by the
-- security-definer RPCs below (add_task_credits / mark_autonomous_task_completed),
-- same "no direct client write" guarantee as autonomous_task_runs.billable.

-- Per-organization prepaid balance — replaces organization_task_allowance.
create table if not exists organization_task_credits (
  organization_id uuid primary key references organizations(id) on delete cascade,
  balance integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table organization_task_credits enable row level security;
create policy organization_task_credits_select on organization_task_credits
  for select using (
    organization_id in (select organization_id from organization_members where user_id = auth.uid() and status = 'active')
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

-- Real purchase ledger — exactly one of user_id/organization_id is set.
create table if not exists task_credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  credits integer not null check (credits > 0),
  amount_usd numeric(10, 2) not null,
  payment_reference text,
  purchased_at timestamptz not null default now(),
  constraint task_credit_purchases_one_owner check ((user_id is not null) <> (organization_id is not null))
);
create index if not exists idx_task_credit_purchases_user on task_credit_purchases(user_id);
create index if not exists idx_task_credit_purchases_org on task_credit_purchases(organization_id);
alter table task_credit_purchases enable row level security;
create policy task_credit_purchases_select_own on task_credit_purchases
  for select using (
    user_id = auth.uid()
    or organization_id in (select organization_id from organization_members where user_id = auth.uid() and status = 'active')
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );
-- No insert policy for authenticated — rows are created only by add_task_credits() below.

-- Adds prepaid credits after a real, completed purchase. Called by the
-- Electron app's local checkout-callback handler (CheckoutSyncServer.ts)
-- using the purchaser's own Supabase session, immediately after Razorpay's
-- Checkout.js reports success for an order pawos-web's own checkout route
-- created for a fixed, server-computed amount — the same same-machine
-- trust model already accepted for subscription activation
-- (SubscriptionStore.confirmPurchase). The real webhook remains the
-- authoritative source once a shared backend exists; this is the honest
-- mechanism available today, not a claim of stronger verification.
create or replace function add_task_credits(
  p_organization_id uuid,
  p_credits int,
  p_amount_usd numeric,
  p_payment_reference text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_purchase_id uuid;
begin
  if p_credits <= 0 then
    raise exception 'p_credits must be a positive integer';
  end if;

  insert into task_credit_purchases (user_id, organization_id, credits, amount_usd, payment_reference)
  values (case when p_organization_id is null then auth.uid() else null end, p_organization_id, p_credits, p_amount_usd, p_payment_reference)
  returning id into v_purchase_id;

  if p_organization_id is null then
    insert into user_task_credits (user_id, balance) values (auth.uid(), p_credits)
    on conflict (user_id) do update set balance = user_task_credits.balance + p_credits, updated_at = now();
  else
    insert into organization_task_credits (organization_id, balance) values (p_organization_id, p_credits)
    on conflict (organization_id) do update set balance = organization_task_credits.balance + p_credits, updated_at = now();
  end if;

  return v_purchase_id;
end;
$$;
grant execute on function add_task_credits to authenticated;

-- Replaces the previous allowance-aware version: deducts exactly 1 prepaid
-- credit (never the fabricated allowance logic) and raises if the balance
-- is insufficient, so a run can never complete-and-bill without a real,
-- already-paid-for credit backing it. pr_created/ticket_updated stay
-- unconditionally true here, per the original design: "completed" is
-- defined at PR-ready-and-ticket-updated, never contingent on the
-- optional subsequent deploy step.
create or replace function mark_autonomous_task_completed(
  p_run_id uuid,
  p_pr_url text,
  p_client_reply_sent boolean,
  p_deploy_completed boolean,
  p_amount_usd numeric,
  p_invoice_reference text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_run autonomous_task_runs%rowtype;
  v_event_id uuid;
  v_org_balance int;
  v_user_balance int;
begin
  select * into v_run from autonomous_task_runs where id = p_run_id and user_id = auth.uid();
  if v_run.id is null then
    raise exception 'No autonomous_task_runs row % owned by the calling user was found', p_run_id;
  end if;
  if v_run.status <> 'running' then
    raise exception 'Run % is already in a terminal state (%) — cannot complete it twice', p_run_id, v_run.status;
  end if;

  if v_run.organization_id is not null then
    select balance into v_org_balance from organization_task_credits where organization_id = v_run.organization_id for update;
    if coalesce(v_org_balance, 0) < 1 then
      raise exception 'Insufficient task credits for this organization — purchase more before completing this task.';
    end if;
    update organization_task_credits set balance = balance - 1, updated_at = now() where organization_id = v_run.organization_id;
  else
    select balance into v_user_balance from user_task_credits where user_id = v_run.user_id for update;
    if coalesce(v_user_balance, 0) < 1 then
      raise exception 'Insufficient task credits — purchase more before completing this task.';
    end if;
    update user_task_credits set balance = balance - 1, updated_at = now() where user_id = v_run.user_id;
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
    v_run.started_at, now(), extract(epoch from (now() - v_run.started_at))::int, 'completed', p_amount_usd, p_invoice_reference
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;
grant execute on function mark_autonomous_task_completed to authenticated;

-- autonomous_task_runs / organization_billing_events RLS already scopes by
-- user_id = auth.uid() (own runs) or org-membership for the org-select
-- policies (see 20260723000000_autonomous_engineering_task_billing.sql) —
-- a null organization_id row is still selectable by its owning user_id, so
-- no policy changes are needed there for the individual case.
