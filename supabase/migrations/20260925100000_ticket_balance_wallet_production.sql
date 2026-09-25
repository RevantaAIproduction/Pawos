-- Migration: 20260925100000_ticket_balance_wallet_production
--
-- Deploys the Autonomous Work Ticket Balance wallet to production. The repo's earlier wallet
-- migrations (20260724…, 20260726…, 20260727…, 20260814…, 20260818…, 20260902…, 20260903…) were
-- never applied here: production has only autonomous_task_runs / _transitions /
-- organization_billing_events, and add_ticket_balance_service() pointed at tables that did not exist
-- (a paid top-up could not be credited). Rather than replaying those files — they conflict with one
-- another and with production — this builds the final state directly against the live schema.
-- Additive only: no existing table or row is dropped or rewritten (production has 0 runs, 0 wallets).
--
-- PRICING (product decision, 2026-09-25):
--   * a COMPLETED ticket is charged its flat tier price once: tickets 1–500 $5.00, 501–2,000 $4.50,
--     2,001–10,000 $4.00, 10,001–25,000 $3.50, 25,001+ $3.00 (per account/organization);
--   * a CANCELLED run is charged $2.50 (or whatever balance remains, if less);
--   * a FAILED / retry-limit / abandoned run costs nothing (the app retries failures automatically);
--   * actual compute used is recorded on the run for reporting only — never charged.
-- The next ticket's price is HELD when a run starts (reserve) so a run never starts unfunded; the
-- hold is charged on completion, partly charged ($2.50) on cancellation, released otherwise.
--
-- MONEY is kept in dollars (numeric(12,2)). The app's Paw Compute figures are derived columns
-- ($1 = 100 PC): balance_pc = balance_usd × 100, balance_reserved = reserved_usd × 100.
--
-- SECURITY: users can only READ their own wallet / their organization's wallet (RLS). Nobody can
-- write a wallet directly — only these SECURITY DEFINER functions, which check the caller.
-- Top-ups are credited only by pawos-web with the service-role key after verifying the Razorpay
-- payment (idempotent per Razorpay payment id). Task runs can no longer be edited directly either.
--
-- TOP-UP SWITCH: pawos_billing_switch('ticket_topups') lets pawos-web refuse new Ticket Balance
-- checkouts (maintenance). It starts OFF here and is turned on only after verification.

-- ── 0. Billing switches ─────────────────────────────────────────────────────────────────────────
create table if not exists public.pawos_billing_switches (
  key text primary key,
  enabled boolean not null,
  note text,
  updated_at timestamptz not null default now()
);
alter table public.pawos_billing_switches enable row level security;
revoke all on public.pawos_billing_switches from anon, authenticated;
insert into public.pawos_billing_switches (key, enabled, note)
values ('ticket_topups', false, 'Paused while the Ticket Balance wallet is deployed and verified.')
on conflict (key) do update set enabled = false, note = excluded.note, updated_at = now();

create or replace function public.pawos_billing_switch(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select s.enabled from public.pawos_billing_switches s where s.key = p_key), false);
$$;
revoke all on function public.pawos_billing_switch(text) from public;
grant execute on function public.pawos_billing_switch(text) to anon, authenticated, service_role;

-- ── 1. Wallets ──────────────────────────────────────────────────────────────────────────────────
create table if not exists public.user_task_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_usd numeric(12, 2) not null default 0 check (balance_usd >= 0),
  reserved_usd numeric(12, 2) not null default 0 check (reserved_usd >= 0),
  tickets_used_count integer not null default 0 check (tickets_used_count >= 0),
  balance_pc numeric generated always as (balance_usd * 100) stored,
  balance_reserved numeric generated always as (reserved_usd * 100) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_task_credits_reserve_covered check (reserved_usd <= balance_usd)
);

create table if not exists public.organization_task_credits (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  balance_usd numeric(12, 2) not null default 0 check (balance_usd >= 0),
  reserved_usd numeric(12, 2) not null default 0 check (reserved_usd >= 0),
  tickets_used_count integer not null default 0 check (tickets_used_count >= 0),
  balance_pc numeric generated always as (balance_usd * 100) stored,
  balance_reserved numeric generated always as (reserved_usd * 100) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_task_credits_reserve_covered check (reserved_usd <= balance_usd)
);

create table if not exists public.ticket_balance_topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  amount_usd numeric(12, 2) not null check (amount_usd > 0),
  payment_reference text,
  razorpay_payment_id text not null,
  topped_up_at timestamptz not null default now(),
  constraint ticket_balance_topups_one_owner check ((user_id is null) <> (organization_id is null))
);
create unique index if not exists idx_ticket_balance_topups_payment_id on public.ticket_balance_topups (razorpay_payment_id);
create index if not exists idx_ticket_balance_topups_user on public.ticket_balance_topups (user_id, topped_up_at desc);
create index if not exists idx_ticket_balance_topups_org on public.ticket_balance_topups (organization_id, topped_up_at desc);

alter table public.user_task_credits enable row level security;
alter table public.organization_task_credits enable row level security;
alter table public.ticket_balance_topups enable row level security;
revoke all on public.user_task_credits from anon, authenticated;
revoke all on public.organization_task_credits from anon, authenticated;
revoke all on public.ticket_balance_topups from anon, authenticated;
grant select on public.user_task_credits to authenticated;
grant select on public.organization_task_credits to authenticated;
grant select on public.ticket_balance_topups to authenticated;

drop policy if exists user_task_credits_own_select on public.user_task_credits;
create policy user_task_credits_own_select on public.user_task_credits
  for select to authenticated using (user_id = auth.uid());
drop policy if exists organization_task_credits_member_select on public.organization_task_credits;
create policy organization_task_credits_member_select on public.organization_task_credits
  for select to authenticated using (public.is_org_member(organization_id, auth.uid()));
drop policy if exists ticket_balance_topups_select_own on public.ticket_balance_topups;
create policy ticket_balance_topups_select_own on public.ticket_balance_topups
  for select to authenticated using (
    user_id = auth.uid() or (organization_id is not null and public.is_org_member(organization_id, auth.uid()))
  );

-- ── 2. Run / billing-event columns ──────────────────────────────────────────────────────────────
-- Personal (non-organization) Autonomous Work: production still required an organization on every
-- run and billing event, so a Pro Max user's own ticket could not even start. Loosening only.
alter table public.autonomous_task_runs alter column organization_id drop not null;
alter table public.organization_billing_events alter column organization_id drop not null;
-- The existing audit trigger on runs/billing events writes audit_log rows carrying the run's
-- organization; a personal run has none, which audit_log also refused.
alter table public.audit_log alter column organization_id drop not null;

-- log_audit_event() read NEW.organization_id directly, but autonomous_task_run_transitions has no
-- such column — so every run status change failed in production. Read it defensively from the row's
-- JSON instead (identical result for every table that has the column), and take a transition's
-- organization from its run.
create or replace function public.log_audit_event()
returns trigger
language plpgsql
security definer
as $$
declare
  v_row jsonb;
  v_org_id uuid;
  v_action text;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_org_id := nullif(v_row ->> 'organization_id', '')::uuid;
  if v_org_id is null and tg_table_name = 'autonomous_task_run_transitions' then
    select r.organization_id into v_org_id from public.autonomous_task_runs r where r.id = nullif(v_row ->> 'run_id', '')::uuid;
  end if;

  if tg_op = 'INSERT' then
    v_action := 'created';
  elsif tg_op = 'UPDATE' then
    v_action := 'updated';
  elsif tg_op = 'DELETE' then
    v_action := 'deleted';
  end if;

  insert into audit_log (organization_id, actor_user_id, action, entity_type, entity_id, before_value, after_value)
  values (
    v_org_id,
    auth.uid(),
    v_action,
    tg_table_name,
    nullif(v_row ->> 'id', '')::uuid,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

alter table public.autonomous_task_runs add column if not exists pr_verified boolean not null default false;
alter table public.autonomous_task_runs add column if not exists ticket_verified boolean not null default false;
alter table public.autonomous_task_runs add column if not exists completion_source text;
alter table public.autonomous_task_runs add column if not exists reserved_usd numeric(12, 2) not null default 0;
alter table public.autonomous_task_runs add column if not exists charged_usd numeric(12, 2) not null default 0;
alter table public.autonomous_task_runs add column if not exists settled_at timestamptz;
alter table public.autonomous_task_runs add column if not exists settled_pc numeric;

alter table public.autonomous_task_runs drop constraint if exists autonomous_task_runs_status_check;
alter table public.autonomous_task_runs add constraint autonomous_task_runs_status_check check (status in (
  'queued', 'running', 'waiting_for_permission', 'waiting_for_topup', 'blocked',
  'implementation_complete', 'awaiting_verification', 'verified',
  'completed', 'failed', 'cancelled', 'retry_limit_reached', 'abandoned'
));

alter table public.organization_billing_events add column if not exists completion_source text;
alter table public.organization_billing_events add column if not exists amount_pc numeric;
alter table public.organization_billing_events add column if not exists charge_type text;

-- Runs, transitions and billing events change only through the functions below.
revoke insert, update, delete, truncate on public.autonomous_task_runs from anon, authenticated;
revoke insert, update, delete, truncate on public.autonomous_task_run_transitions from anon, authenticated;
revoke insert, update, delete, truncate on public.organization_billing_events from anon, authenticated;
drop policy if exists autonomous_task_runs_update_own on public.autonomous_task_runs;
drop policy if exists autonomous_task_runs_insert_own on public.autonomous_task_runs;

-- Reading: the existing policies only exposed ORGANIZATION rows, so a user could not see their own
-- personal runs, transitions or charges (and the app's settlement step, which reads the run, failed).
drop policy if exists autonomous_task_runs_select_own_org on public.autonomous_task_runs;
create policy autonomous_task_runs_select_own_org on public.autonomous_task_runs
  for select to authenticated using (
    user_id = auth.uid() or (organization_id is not null and public.is_org_member(organization_id, auth.uid()))
  );
drop policy if exists organization_billing_events_select_own_org on public.organization_billing_events;
create policy organization_billing_events_select_own_org on public.organization_billing_events
  for select to authenticated using (
    user_id = auth.uid() or (organization_id is not null and public.is_org_member(organization_id, auth.uid()))
  );
drop policy if exists autonomous_task_run_transitions_select_own on public.autonomous_task_run_transitions;
create policy autonomous_task_run_transitions_select_own on public.autonomous_task_run_transitions
  for select to authenticated using (
    exists (
      select 1 from public.autonomous_task_runs r
      where r.id = run_id
        and (r.user_id = auth.uid() or (r.organization_id is not null and public.is_org_member(r.organization_id, auth.uid())))
    )
  );
grant select on public.autonomous_task_runs to authenticated;
grant select on public.autonomous_task_run_transitions to authenticated;
grant select on public.organization_billing_events to authenticated;

-- ── 3. Pricing ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.get_ticket_unit_price(p_ticket_number integer)
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
  end::numeric;
$$;

create or replace function public.pawos_ticket_cancellation_fee()
returns numeric
language sql
immutable
as $$ select 2.50::numeric; $$;

grant execute on function public.get_ticket_unit_price(integer) to authenticated;

-- ── 4. Top-up crediting (pawos-web, service role only) ──────────────────────────────────────────
create or replace function public.add_ticket_balance_service(
  p_user_id uuid,
  p_organization_id uuid,
  p_amount_usd numeric,
  p_razorpay_payment_id text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_topup_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'unauthorized: add_ticket_balance_service is a backend-only operation' using errcode = '42501';
  end if;
  if (p_user_id is null) = (p_organization_id is null) then
    raise exception 'exactly one of user or organization is required';
  end if;
  if p_amount_usd is null or p_amount_usd < 30 then
    raise exception 'Minimum top-up is $30';
  end if;
  if p_amount_usd > 20000 then
    raise exception 'Maximum top-up is $20,000';
  end if;
  if coalesce(btrim(p_razorpay_payment_id), '') = '' then
    raise exception 'missing payment id';
  end if;

  insert into public.ticket_balance_topups (user_id, organization_id, amount_usd, payment_reference, razorpay_payment_id)
  values (p_user_id, p_organization_id, round(p_amount_usd, 2), p_razorpay_payment_id, p_razorpay_payment_id)
  on conflict (razorpay_payment_id) do nothing
  returning id into v_topup_id;

  -- Same Razorpay payment seen again (browser callback + webhook, retries): never credit twice.
  if v_topup_id is null then
    select id into v_topup_id from public.ticket_balance_topups where razorpay_payment_id = p_razorpay_payment_id;
    return v_topup_id;
  end if;

  if p_organization_id is not null then
    insert into public.organization_task_credits (organization_id, balance_usd) values (p_organization_id, round(p_amount_usd, 2))
    on conflict (organization_id) do update set balance_usd = organization_task_credits.balance_usd + round(p_amount_usd, 2), updated_at = now();
  else
    insert into public.user_task_credits (user_id, balance_usd) values (p_user_id, round(p_amount_usd, 2))
    on conflict (user_id) do update set balance_usd = user_task_credits.balance_usd + round(p_amount_usd, 2), updated_at = now();
  end if;

  return v_topup_id;
end;
$$;
revoke all on function public.add_ticket_balance_service(uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.add_ticket_balance_service(uuid, uuid, numeric, text) to service_role;

-- ── 5. Wallet helpers (internal) ────────────────────────────────────────────────────────────────
-- Locks (creating if missing) the wallet a run bills against; returns (balance, reserved, tickets).
create or replace function public.pawos_lock_run_wallet(p_run public.autonomous_task_runs, out o_balance numeric, out o_reserved numeric, out o_tickets integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_run.organization_id is not null then
    insert into public.organization_task_credits (organization_id) values (p_run.organization_id) on conflict (organization_id) do nothing;
    select balance_usd, reserved_usd, tickets_used_count into o_balance, o_reserved, o_tickets
    from public.organization_task_credits where organization_id = p_run.organization_id for update;
  else
    insert into public.user_task_credits (user_id) values (p_run.user_id) on conflict (user_id) do nothing;
    select balance_usd, reserved_usd, tickets_used_count into o_balance, o_reserved, o_tickets
    from public.user_task_credits where user_id = p_run.user_id for update;
  end if;
end;
$$;

create or replace function public.pawos_apply_run_wallet(p_run public.autonomous_task_runs, p_balance_delta numeric, p_reserved_delta numeric, p_ticket_delta integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_run.organization_id is not null then
    update public.organization_task_credits
    set balance_usd = balance_usd + p_balance_delta, reserved_usd = reserved_usd + p_reserved_delta,
        tickets_used_count = tickets_used_count + p_ticket_delta, updated_at = now()
    where organization_id = p_run.organization_id;
  else
    update public.user_task_credits
    set balance_usd = balance_usd + p_balance_delta, reserved_usd = reserved_usd + p_reserved_delta,
        tickets_used_count = tickets_used_count + p_ticket_delta, updated_at = now()
    where user_id = p_run.user_id;
  end if;
end;
$$;
revoke all on function public.pawos_lock_run_wallet(public.autonomous_task_runs) from public, anon, authenticated;
revoke all on function public.pawos_apply_run_wallet(public.autonomous_task_runs, numeric, numeric, integer) from public, anon, authenticated;

-- Whether the caller may act on this run: its owner, or an active member of its organization.
create or replace function public.pawos_can_act_on_run(p_run public.autonomous_task_runs)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    p_run.user_id = auth.uid()
    or (p_run.organization_id is not null and public.is_org_member(p_run.organization_id, auth.uid()))
  );
$$;
revoke all on function public.pawos_can_act_on_run(public.autonomous_task_runs) from public, anon, authenticated;

-- ── 6. Terminal-status billing (one place, whichever function ends the run) ────────────────────
-- failed / retry_limit_reached / abandoned → hold released, $0.
-- cancelled → hold released, $2.50 (or the remaining balance, if less) charged + billing event.
-- completed is charged by mark_autonomous_task_completed() itself (it clears the hold first).
create or replace function public.pawos_autonomous_run_billing_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_reserved numeric;
  v_tickets integer;
  v_fee numeric;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status not in ('failed', 'cancelled', 'retry_limit_reached', 'abandoned') then
    return new;
  end if;
  if old.status in ('completed', 'failed', 'cancelled', 'retry_limit_reached', 'abandoned') then
    return new;
  end if;

  select o_balance, o_reserved, o_tickets into v_balance, v_reserved, v_tickets from public.pawos_lock_run_wallet(old);

  if coalesce(old.reserved_usd, 0) > 0 then
    perform public.pawos_apply_run_wallet(old, 0, -least(old.reserved_usd, v_reserved), 0);
    v_reserved := v_reserved - least(old.reserved_usd, v_reserved);
  end if;
  new.reserved_usd := 0;

  if new.status = 'cancelled' and coalesce(old.charged_usd, 0) = 0 then
    v_fee := least(public.pawos_ticket_cancellation_fee(), greatest(v_balance - v_reserved, 0));
    if v_fee > 0 then
      perform public.pawos_apply_run_wallet(old, -v_fee, 0, 0);
    end if;
    new.charged_usd := v_fee;
    insert into public.organization_billing_events (
      run_id, organization_id, workspace_id, user_id, ticket_id, runtime_version,
      started_at, completed_at, duration_seconds, status, amount_usd, amount_pc, charge_type
    ) values (
      old.id, old.organization_id, old.workspace_id, old.user_id, old.ticket_id, old.runtime_version,
      old.started_at, now(), greatest(extract(epoch from (now() - old.started_at))::int, 0), 'cancelled', v_fee, v_fee * 100, 'cancellation'
    );
  end if;

  return new;
end;
$$;
revoke all on function public.pawos_autonomous_run_billing_trg() from public, anon, authenticated;

drop trigger if exists trg_autonomous_run_billing on public.autonomous_task_runs;
create trigger trg_autonomous_run_billing
  before update of status on public.autonomous_task_runs
  for each row execute function public.pawos_autonomous_run_billing_trg();

-- ── 7. Reserve / extend (called by the app before and during a run) ────────────────────────────
-- Holds the next ticket's price. Idempotent per run: a run that already holds it just reports it.
create or replace function public.reserve_autonomous_pc(p_run_id uuid, p_estimated_pc numeric, p_request_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.autonomous_task_runs;
  v_balance numeric;
  v_reserved numeric;
  v_tickets integer;
  v_price numeric;
  v_available numeric;
begin
  select * into v_run from public.autonomous_task_runs where id = p_run_id for update;
  if v_run.id is null or not public.pawos_can_act_on_run(v_run) then
    raise exception 'Run % not found or no permission', p_run_id using errcode = '42501';
  end if;
  if v_run.status not in ('queued', 'running', 'waiting_for_permission', 'waiting_for_topup', 'blocked') then
    raise exception 'Run % has already ended (%)', p_run_id, v_run.status;
  end if;

  select o_balance, o_reserved, o_tickets into v_balance, v_reserved, v_tickets from public.pawos_lock_run_wallet(v_run);
  v_available := v_balance - v_reserved;

  if coalesce(v_run.reserved_usd, 0) > 0 then
    return jsonb_build_object('success', true, 'reserved_pc', v_run.reserved_usd * 100, 'available_remaining', v_available * 100, 'error_message', null);
  end if;

  v_price := public.get_ticket_unit_price(v_tickets + 1);
  if v_available < v_price then
    return jsonb_build_object(
      'success', false, 'reserved_pc', null, 'available_remaining', v_available * 100,
      'error_message', format('Ticket Balance too low: $%s available, the next ticket costs $%s.', to_char(v_available, 'FM999999990.00'), to_char(v_price, 'FM999999990.00')));
  end if;

  perform public.pawos_apply_run_wallet(v_run, 0, v_price, 0);
  update public.autonomous_task_runs set reserved_usd = v_price where id = p_run_id;
  return jsonb_build_object('success', true, 'reserved_pc', v_price * 100, 'available_remaining', (v_available - v_price) * 100, 'error_message', null);
end;
$$;

-- A flat-priced ticket never needs more than its one hold; this re-establishes the hold for a run
-- that is resuming after a top-up (waiting_for_topup) and otherwise just reports it.
create or replace function public.extend_autonomous_reservation(p_run_id uuid, p_additional_pc numeric, p_extension_request_id text, p_executor_instance_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  v_result := public.reserve_autonomous_pc(p_run_id, p_additional_pc, p_extension_request_id);
  return jsonb_build_object(
    'success', (v_result ->> 'success')::boolean,
    'new_reserved_total', v_result -> 'reserved_pc',
    'available_remaining', v_result -> 'available_remaining',
    'error_message', v_result ->> 'error_message');
end;
$$;

-- ── 8. Completion (charges the flat ticket price once) ──────────────────────────────────────────
drop function if exists public.mark_autonomous_task_completed(uuid, text, boolean, boolean, numeric, text);
create or replace function public.mark_autonomous_task_completed(
  p_run_id uuid,
  p_pr_url text,
  p_client_reply_sent boolean,
  p_deploy_completed boolean,
  p_invoice_reference text,
  p_pr_verified boolean default false,
  p_ticket_verified boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.autonomous_task_runs;
  v_event_id uuid;
  v_balance numeric;
  v_reserved numeric;
  v_tickets integer;
  v_price numeric;
  v_hold numeric;
  v_source text;
begin
  select * into v_run from public.autonomous_task_runs where id = p_run_id for update;
  if v_run.id is null or not public.pawos_can_act_on_run(v_run) then
    raise exception 'No autonomous_task_runs row % the caller may complete was found', p_run_id using errcode = '42501';
  end if;

  if v_run.status = 'completed' then
    select id into v_event_id from public.organization_billing_events where run_id = p_run_id and charge_type = 'ticket' order by created_at desc limit 1;
    return v_event_id;
  end if;
  if v_run.status not in ('running', 'waiting_for_permission', 'implementation_complete', 'awaiting_verification', 'verified') then
    raise exception 'Run % cannot be completed from status %', p_run_id, v_run.status;
  end if;

  select o_balance, o_reserved, o_tickets into v_balance, v_reserved, v_tickets from public.pawos_lock_run_wallet(v_run);
  v_price := public.get_ticket_unit_price(v_tickets + 1);
  v_hold := least(coalesce(v_run.reserved_usd, 0), v_reserved);
  if v_balance - (v_reserved - v_hold) < v_price then
    raise exception 'Insufficient Ticket Balance: the ticket costs $% — add funds and complete again.', v_price;
  end if;

  perform public.pawos_apply_run_wallet(v_run, -v_price, -v_hold, 1);
  v_source := case when p_pr_verified and p_ticket_verified then 'connector_verified' else 'self_reported' end;

  update public.autonomous_task_runs
  set reserved_usd = 0, charged_usd = v_price
  where id = p_run_id;
  update public.autonomous_task_runs
  set status = 'completed', pr_created = (p_pr_url is not null), pr_url = p_pr_url,
      ticket_updated = true, client_reply_sent = coalesce(p_client_reply_sent, false),
      deploy_completed = coalesce(p_deploy_completed, false), billable = true, completed_at = now(),
      pr_verified = coalesce(p_pr_verified, false), ticket_verified = coalesce(p_ticket_verified, false),
      completion_source = v_source
  where id = p_run_id;

  insert into public.autonomous_task_run_transitions (run_id, from_status, to_status, reason)
  values (p_run_id, v_run.status, 'completed', 'mark_autonomous_task_completed');

  insert into public.organization_billing_events (
    run_id, organization_id, workspace_id, user_id, ticket_id, runtime_version,
    started_at, completed_at, duration_seconds, status, amount_usd, amount_pc, invoice_reference, completion_source, charge_type
  ) values (
    p_run_id, v_run.organization_id, v_run.workspace_id, v_run.user_id, v_run.ticket_id, v_run.runtime_version,
    v_run.started_at, now(), greatest(extract(epoch from (now() - v_run.started_at))::int, 0), 'completed',
    v_price, v_price * 100, p_invoice_reference, v_source, 'ticket'
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

-- ── 9. Terminal / transitions / start / reconcile (live versions + waiting_for_topup) ──────────
create or replace function public.mark_autonomous_task_terminal(p_run_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.autonomous_task_runs;
begin
  if p_status not in ('failed', 'cancelled', 'retry_limit_reached') then
    raise exception 'mark_autonomous_task_terminal() only accepts failed/cancelled/retry_limit_reached — use mark_autonomous_task_completed() for success';
  end if;
  select * into v_run from public.autonomous_task_runs where id = p_run_id for update;
  if v_run.id is null or not public.pawos_can_act_on_run(v_run) then
    return;
  end if;
  if v_run.status not in ('queued', 'running', 'waiting_for_permission', 'waiting_for_topup', 'blocked', 'implementation_complete', 'awaiting_verification', 'verified') then
    return;
  end if;

  update public.autonomous_task_runs set status = p_status, completed_at = now() where id = p_run_id;
  insert into public.autonomous_task_run_transitions (run_id, from_status, to_status, reason)
  values (p_run_id, v_run.status, p_status, 'mark_autonomous_task_terminal');
end;
$$;

create or replace function public.transition_autonomous_task_run(p_run_id uuid, p_to_status text, p_reason text default null)
returns public.autonomous_task_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.autonomous_task_runs;
  v_allowed boolean;
begin
  select * into v_run from public.autonomous_task_runs where id = p_run_id for update;
  if v_run.id is null or not public.pawos_can_act_on_run(v_run) then
    raise exception 'No autonomous_task_runs row % the caller may change was found', p_run_id using errcode = '42501';
  end if;
  if p_to_status = 'completed' then
    raise exception 'transition_autonomous_task_run() cannot set completed — use mark_autonomous_task_completed()';
  end if;
  if p_to_status not in ('running', 'implementation_complete', 'awaiting_verification', 'verified', 'waiting_for_permission', 'waiting_for_topup', 'blocked', 'failed', 'cancelled') then
    raise exception 'transition_autonomous_task_run() does not accept target status %', p_to_status;
  end if;

  v_allowed := (v_run.status, p_to_status) in (
    ('queued', 'running'), ('queued', 'cancelled'), ('queued', 'waiting_for_topup'), ('queued', 'blocked'), ('queued', 'failed'),
    ('running', 'waiting_for_permission'), ('running', 'waiting_for_topup'), ('running', 'blocked'), ('running', 'failed'), ('running', 'cancelled'),
    ('waiting_for_permission', 'running'), ('waiting_for_permission', 'cancelled'), ('waiting_for_permission', 'blocked'), ('waiting_for_permission', 'failed'),
    ('waiting_for_topup', 'running'), ('waiting_for_topup', 'cancelled'), ('waiting_for_topup', 'blocked'), ('waiting_for_topup', 'failed'),
    ('blocked', 'failed'), ('blocked', 'cancelled'),
    ('running', 'implementation_complete'), ('implementation_complete', 'awaiting_verification'),
    ('awaiting_verification', 'verified'), ('awaiting_verification', 'failed'),
    ('verified', 'running'), ('verified', 'failed')
  );
  if not v_allowed then
    raise exception 'Illegal autonomous run transition: % -> % (run %)', v_run.status, p_to_status, p_run_id;
  end if;

  update public.autonomous_task_runs
  set status = p_to_status,
      implementation_complete_at = case when p_to_status = 'implementation_complete' then now() else implementation_complete_at end,
      verification_requested_at = case when p_to_status = 'awaiting_verification' then now() else verification_requested_at end,
      verification_requested_by = case when p_to_status = 'awaiting_verification' then auth.uid() else verification_requested_by end,
      verified_at = case when p_to_status = 'verified' then now() else verified_at end,
      verified_by = case when p_to_status = 'verified' then auth.uid() else verified_by end,
      completed_at = case when p_to_status in ('failed', 'cancelled') then now() else completed_at end
  where id = p_run_id;

  insert into public.autonomous_task_run_transitions (run_id, from_status, to_status, reason)
  values (p_run_id, v_run.status, p_to_status, p_reason);

  select * into v_run from public.autonomous_task_runs where id = p_run_id;
  return v_run;
end;
$$;

create or replace function public.start_or_get_active_autonomous_task_run(p_organization_id uuid, p_workspace_id uuid, p_ticket_source text, p_ticket_id text, p_repository text, p_runtime_version text)
returns table(run_row public.autonomous_task_runs, already_active boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.autonomous_task_runs;
  v_new public.autonomous_task_runs;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_organization_id is not null and not public.is_org_member(p_organization_id, auth.uid()) then
    raise exception 'Not an active member of that organization' using errcode = '42501';
  end if;
  if p_ticket_id is not null then
    select * into v_existing
    from public.autonomous_task_runs
    where status in ('queued', 'running', 'waiting_for_permission', 'waiting_for_topup', 'blocked')
      and ticket_id = p_ticket_id
      and coalesce(organization_id::text, user_id::text) = coalesce(p_organization_id::text, auth.uid()::text)
    limit 1;
    if v_existing.id is not null then
      run_row := v_existing;
      already_active := true;
      return next;
      return;
    end if;
  end if;

  insert into public.autonomous_task_runs (organization_id, workspace_id, user_id, ticket_source, ticket_id, repository, runtime_version, status)
  values (p_organization_id, p_workspace_id, auth.uid(), p_ticket_source, p_ticket_id, p_repository, p_runtime_version, 'queued')
  returning * into v_new;
  insert into public.autonomous_task_run_transitions (run_id, from_status, to_status, reason)
  values (v_new.id, 'created', 'queued', 'Autonomous run created');

  run_row := v_new;
  already_active := false;
  return next;
end;
$$;

create or replace function public.reconcile_stale_autonomous_task_runs(p_stale_after_hours integer default 24)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    return 0;
  end if;
  with candidates as (
    select id, status as old_status
    from public.autonomous_task_runs
    where user_id = auth.uid()
      and status in ('queued', 'running', 'waiting_for_permission', 'waiting_for_topup', 'blocked')
      and started_at < now() - make_interval(hours => p_stale_after_hours)
  ),
  updated as (
    update public.autonomous_task_runs t
    set status = 'abandoned', completed_at = now()
    from candidates c
    where t.id = c.id
    returning t.id
  )
  insert into public.autonomous_task_run_transitions (run_id, from_status, to_status, reason)
  select c.id, c.old_status, 'abandoned', 'reconcile_stale_autonomous_task_runs'
  from candidates c join updated u on u.id = c.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ── 10. Settlement (records actual usage; never charges) ────────────────────────────────────────
create or replace function public.settle_autonomous_task_run_pc(p_run_id uuid, p_actual_pc numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.autonomous_task_runs;
  v_event_id uuid;
begin
  select * into v_run from public.autonomous_task_runs where id = p_run_id for update;
  if v_run.id is null or not public.pawos_can_act_on_run(v_run) then
    raise exception 'Run % not found or no permission', p_run_id using errcode = '42501';
  end if;
  if v_run.status not in ('completed', 'failed', 'cancelled', 'retry_limit_reached', 'abandoned') then
    raise exception 'Run % is not in a terminal execution state (cannot settle from status %)', p_run_id, v_run.status;
  end if;
  if p_actual_pc is null or p_actual_pc < 0 then
    raise exception 'actual_pc cannot be negative: %', p_actual_pc;
  end if;

  if v_run.settled_at is null then
    update public.autonomous_task_runs set settled_at = now(), settled_pc = p_actual_pc where id = p_run_id;
  end if;

  select id into v_event_id from public.organization_billing_events where run_id = p_run_id order by created_at desc limit 1;
  return v_event_id;
end;
$$;

-- ── 11. Privileges ──────────────────────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.reserve_autonomous_pc(uuid, numeric, text)',
    'public.extend_autonomous_reservation(uuid, numeric, text, text)',
    'public.mark_autonomous_task_completed(uuid, text, boolean, boolean, text, boolean, boolean)',
    'public.mark_autonomous_task_terminal(uuid, text)',
    'public.transition_autonomous_task_run(uuid, text, text)',
    'public.start_or_get_active_autonomous_task_run(uuid, uuid, text, text, text, text)',
    'public.reconcile_stale_autonomous_task_runs(integer)',
    'public.settle_autonomous_task_run_pc(uuid, numeric)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
