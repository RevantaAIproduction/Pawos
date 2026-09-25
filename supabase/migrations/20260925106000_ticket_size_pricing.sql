-- Migration: 20260925106000_ticket_size_pricing
--
-- PRICING (product decision, 2026-09-25): a COMPLETED Autonomous Work ticket is priced by the size of
-- the change it delivered, replacing the flat $5 / volume tiers.
--   size = max(files changed, ceil(lines changed / 100))   — a huge rewrite of few files counts big
--   1 file, ≤ 10 lines ................ $1.00
--   1 file (> 10 lines) or 2–3 files .. $5.00
--   4–9 files ......................... $7.50
--   10–20 files ....................... $10.00
--   21–30 files ....................... $15.00
--   31–50 files ....................... $20.00 + $0.50 per file above 30   ($20 → $30)
--   more than 50 files ................ $30.00 + $0.50 per file above 50   (no maximum)
-- Unchanged: each automatic retry $3.00 (on start), cancellation $2.50, failure $0.
--
-- The price is only known when the work is done, so a finished ticket is always charged in full, even
-- if that takes the Ticket Balance below zero (owed). A ticket needs at least $5.00 AVAILABLE to start
-- (that amount is held while it runs), so a negative balance blocks new tickets until a top-up clears it.
-- Completions from app builds that don't report the change size are charged $5.00.

-- Balances may now go negative (owed after a larger-than-held completion).
alter table public.user_task_credits drop constraint if exists user_task_credits_balance_usd_check;
alter table public.user_task_credits drop constraint if exists user_task_credits_reserve_covered;
alter table public.organization_task_credits drop constraint if exists organization_task_credits_balance_usd_check;
alter table public.organization_task_credits drop constraint if exists organization_task_credits_reserve_covered;

alter table public.autonomous_task_runs add column if not exists files_changed integer;
alter table public.autonomous_task_runs add column if not exists lines_changed integer;
alter table public.autonomous_task_runs add column if not exists price_basis text;

create or replace function public.pawos_ticket_start_minimum()
returns numeric
language sql
immutable
as $$ select 5.00::numeric; $$;

create or replace function public.pawos_ticket_size_price(p_files integer, p_lines integer)
returns numeric
language plpgsql
immutable
as $$
declare
  v_files integer := greatest(coalesce(p_files, 0), 0);
  v_lines integer := greatest(coalesce(p_lines, 0), 0);
  v_size integer := greatest(v_files, ceil(v_lines / 100.0)::integer);
begin
  if v_files <= 1 and v_lines <= 10 then
    return 1.00;
  elsif v_size <= 3 then
    return 5.00;
  elsif v_size <= 9 then
    return 7.50;
  elsif v_size <= 20 then
    return 10.00;
  elsif v_size <= 30 then
    return 15.00;
  elsif v_size <= 50 then
    return 20.00 + 0.50 * (v_size - 30);
  else
    return 30.00 + 0.50 * (v_size - 50);
  end if;
end;
$$;
grant execute on function public.pawos_ticket_size_price(integer, integer) to authenticated;

-- Start: hold the $5.00 start minimum; refuses when less is available (incl. an owed balance).
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
  v_hold numeric := public.pawos_ticket_start_minimum();
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

  if v_available < v_hold then
    return jsonb_build_object(
      'success', false, 'reserved_pc', null, 'available_remaining', v_available * 100,
      'error_message', case when v_balance < 0
        then format('Your Ticket Balance is -$%s (owed from a previous ticket). Top up to clear it and start this ticket.', to_char(abs(v_balance), 'FM999999990.00'))
        else format('A ticket needs at least $%s available to start; $%s is available. Add funds and it continues.', to_char(v_hold, 'FM990.00'), to_char(greatest(v_available, 0), 'FM999999990.00'))
      end);
  end if;

  perform public.pawos_apply_run_wallet(v_run, 0, v_hold, 0);
  update public.autonomous_task_runs set reserved_usd = v_hold where id = p_run_id;
  return jsonb_build_object('success', true, 'reserved_pc', v_hold * 100, 'available_remaining', (v_available - v_hold) * 100, 'error_message', null);
end;
$$;

-- Completion: charge the size-based price in full (may take the balance below zero).
drop function if exists public.mark_autonomous_task_completed(uuid, text, boolean, boolean, text, boolean, boolean);
create or replace function public.mark_autonomous_task_completed(
  p_run_id uuid,
  p_pr_url text,
  p_client_reply_sent boolean,
  p_deploy_completed boolean,
  p_invoice_reference text,
  p_pr_verified boolean default false,
  p_ticket_verified boolean default false,
  p_files_changed integer default null,
  p_lines_changed integer default null
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
  v_basis text;
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
  if coalesce(p_files_changed, 0) < 0 or coalesce(p_lines_changed, 0) < 0 then
    raise exception 'Change size cannot be negative';
  end if;

  if p_files_changed is null and p_lines_changed is null then
    v_price := public.pawos_ticket_start_minimum();
    v_basis := 'change size not reported — standard price';
  else
    v_price := public.pawos_ticket_size_price(p_files_changed, p_lines_changed);
    v_basis := format('%s file(s), %s line(s) changed', coalesce(p_files_changed, 0), coalesce(p_lines_changed, 0));
  end if;

  select o_balance, o_reserved, o_tickets into v_balance, v_reserved, v_tickets from public.pawos_lock_run_wallet(v_run);
  v_hold := least(coalesce(v_run.reserved_usd, 0), greatest(v_reserved, 0));

  perform public.pawos_apply_run_wallet(v_run, -v_price, -v_hold, 1);
  v_source := case when p_pr_verified and p_ticket_verified then 'connector_verified' else 'self_reported' end;

  update public.autonomous_task_runs
  set reserved_usd = 0, charged_usd = charged_usd + v_price,
      files_changed = p_files_changed, lines_changed = p_lines_changed, price_basis = v_basis
  where id = p_run_id;
  update public.autonomous_task_runs
  set status = 'completed', pr_created = (p_pr_url is not null), pr_url = p_pr_url,
      ticket_updated = true, client_reply_sent = coalesce(p_client_reply_sent, false),
      deploy_completed = coalesce(p_deploy_completed, false), billable = true, completed_at = now(),
      pr_verified = coalesce(p_pr_verified, false), ticket_verified = coalesce(p_ticket_verified, false),
      completion_source = v_source
  where id = p_run_id;

  insert into public.autonomous_task_run_transitions (run_id, from_status, to_status, reason)
  values (p_run_id, v_run.status, 'completed', 'mark_autonomous_task_completed: ' || v_basis);

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

revoke all on function public.mark_autonomous_task_completed(uuid, text, boolean, boolean, text, boolean, boolean, integer, integer) from public, anon;
grant execute on function public.mark_autonomous_task_completed(uuid, text, boolean, boolean, text, boolean, boolean, integer, integer) to authenticated;
revoke all on function public.reserve_autonomous_pc(uuid, numeric, text) from public, anon;
grant execute on function public.reserve_autonomous_pc(uuid, numeric, text) to authenticated;

-- Cancellation fee only for runs that actually started.
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

  -- The cancellation fee applies only to a run that actually started working — cancelling a ticket
  -- that never ran (e.g. it was waiting for a top-up) is free.
  if new.status = 'cancelled'
     and exists (select 1 from public.autonomous_task_run_transitions t where t.run_id = old.id and t.to_status = 'running')
     and not exists (select 1 from public.organization_billing_events e where e.run_id = old.id and e.charge_type = 'cancellation')
  then
    v_fee := least(public.pawos_ticket_cancellation_fee(), greatest(v_balance - v_reserved, 0));
    if v_fee > 0 then
      perform public.pawos_apply_run_wallet(old, -v_fee, 0, 0);
    end if;
    new.charged_usd := coalesce(old.charged_usd, 0) + v_fee;
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
