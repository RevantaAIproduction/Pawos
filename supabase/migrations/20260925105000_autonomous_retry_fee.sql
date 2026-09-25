-- Migration: 20260925105000_autonomous_retry_fee
--
-- PRICING (product decision, 2026-09-25): a failed Autonomous Work run is retried automatically, and
-- EVERY retry costs $3.00 — charged when the retry starts, whatever its outcome. A retry that
-- completes is also charged the normal ticket price ($5.00 at the standard tier), so e.g. one failure
-- then success = $3 + $5. The first attempt's failure itself costs nothing; cancellation stays $2.50.
--
-- Enforced server-side so the app cannot skip it: a new run for a ticket whose most recent run
-- FAILED is a retry (start_or_get_active_autonomous_task_run), and the app's automatic retries go
-- through start_autonomous_retry_run(previous run), which also works for ticketless runs. The fee
-- needs $3.00 of available balance (balance minus holds); otherwise the retry does not start.

alter table public.autonomous_task_runs add column if not exists attempt_number integer not null default 1;
alter table public.autonomous_task_runs add column if not exists retry_of uuid references public.autonomous_task_runs(id) on delete set null;

create or replace function public.pawos_ticket_retry_fee()
returns numeric
language sql
immutable
as $$ select 3.00::numeric; $$;

-- Charges the retry fee for a freshly created retry run (internal). Raises when the wallet can't cover it.
create or replace function public.pawos_charge_retry_fee(p_run public.autonomous_task_runs)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_reserved numeric;
  v_tickets integer;
  v_fee numeric := public.pawos_ticket_retry_fee();
begin
  select o_balance, o_reserved, o_tickets into v_balance, v_reserved, v_tickets from public.pawos_lock_run_wallet(p_run);
  if v_balance - v_reserved < v_fee then
    raise exception 'Ticket Balance too low to retry: a retry costs $%, $% available — add funds and retry.',
      to_char(v_fee, 'FM990.00'), to_char(greatest(v_balance - v_reserved, 0), 'FM999999990.00') using errcode = 'P0001';
  end if;
  perform public.pawos_apply_run_wallet(p_run, -v_fee, 0, 0);
  update public.autonomous_task_runs set charged_usd = charged_usd + v_fee where id = p_run.id;
  insert into public.organization_billing_events (
    run_id, organization_id, workspace_id, user_id, ticket_id, runtime_version,
    started_at, completed_at, duration_seconds, status, amount_usd, amount_pc, charge_type
  ) values (
    p_run.id, p_run.organization_id, p_run.workspace_id, p_run.user_id, p_run.ticket_id, p_run.runtime_version,
    p_run.started_at, now(), 0, 'retry', v_fee, v_fee * 100, 'retry'
  );
end;
$$;
revoke all on function public.pawos_charge_retry_fee(public.autonomous_task_runs) from public, anon, authenticated;

-- The app's automatic retry: a fresh run for the same ticket as a FAILED run, charged $3.00.
create or replace function public.start_autonomous_retry_run(p_previous_run_id uuid)
returns public.autonomous_task_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev public.autonomous_task_runs;
  v_active public.autonomous_task_runs;
  v_new public.autonomous_task_runs;
begin
  select * into v_prev from public.autonomous_task_runs where id = p_previous_run_id for update;
  if v_prev.id is null or not public.pawos_can_act_on_run(v_prev) then
    raise exception 'Run % not found or no permission', p_previous_run_id using errcode = '42501';
  end if;
  if v_prev.status <> 'failed' then
    raise exception 'Only a failed run can be retried (run % is %)', p_previous_run_id, v_prev.status;
  end if;

  -- Idempotent: a retry already started for this run is returned, never charged twice.
  select * into v_active from public.autonomous_task_runs where retry_of = p_previous_run_id order by created_at desc limit 1;
  if v_active.id is not null then
    return v_active;
  end if;

  insert into public.autonomous_task_runs (
    organization_id, workspace_id, user_id, ticket_source, ticket_id, repository, runtime_version, status, attempt_number, retry_of
  ) values (
    v_prev.organization_id, v_prev.workspace_id, auth.uid(), v_prev.ticket_source, v_prev.ticket_id, v_prev.repository,
    v_prev.runtime_version, 'queued', v_prev.attempt_number + 1, v_prev.id
  )
  returning * into v_new;
  insert into public.autonomous_task_run_transitions (run_id, from_status, to_status, reason)
  values (v_new.id, 'created', 'queued', format('Automatic retry %s of run %s', v_new.attempt_number - 1, v_prev.id));

  perform public.pawos_charge_retry_fee(v_new);
  select * into v_new from public.autonomous_task_runs where id = v_new.id;
  return v_new;
end;
$$;
revoke all on function public.start_autonomous_retry_run(uuid) from public, anon;
grant execute on function public.start_autonomous_retry_run(uuid) to authenticated;

-- Starting a ticket again after its last run failed is also a retry ($3.00) — so the fee can't be
-- avoided by starting "fresh" instead of retrying.
create or replace function public.start_or_get_active_autonomous_task_run(p_organization_id uuid, p_workspace_id uuid, p_ticket_source text, p_ticket_id text, p_repository text, p_runtime_version text)
returns table(run_row public.autonomous_task_runs, already_active boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.autonomous_task_runs;
  v_last public.autonomous_task_runs;
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

    select * into v_last
    from public.autonomous_task_runs
    where ticket_id = p_ticket_id
      and coalesce(organization_id::text, user_id::text) = coalesce(p_organization_id::text, auth.uid()::text)
    order by created_at desc
    limit 1;
  end if;

  insert into public.autonomous_task_runs (organization_id, workspace_id, user_id, ticket_source, ticket_id, repository, runtime_version, status, attempt_number, retry_of)
  values (p_organization_id, p_workspace_id, auth.uid(), p_ticket_source, p_ticket_id, p_repository, p_runtime_version, 'queued',
          case when v_last.status = 'failed' then v_last.attempt_number + 1 else 1 end,
          case when v_last.status = 'failed' then v_last.id else null end)
  returning * into v_new;
  insert into public.autonomous_task_run_transitions (run_id, from_status, to_status, reason)
  values (v_new.id, 'created', 'queued', case when v_new.retry_of is null then 'Autonomous run created' else 'Retry of a failed run' end);

  if v_new.retry_of is not null then
    perform public.pawos_charge_retry_fee(v_new);
    select * into v_new from public.autonomous_task_runs where id = v_new.id;
  end if;

  run_row := v_new;
  already_active := false;
  return next;
end;
$$;
revoke all on function public.start_or_get_active_autonomous_task_run(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.start_or_get_active_autonomous_task_run(uuid, uuid, text, text, text, text) to authenticated;

-- A cancelled retry keeps its retry fee: the cancellation fee is added on top, never replaces it.
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

  if new.status = 'cancelled' and not exists (
    select 1 from public.organization_billing_events e where e.run_id = old.id and e.charge_type = 'cancellation'
  ) then
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

-- Completion adds the ticket price to whatever the run was already charged (a retry's $3.00).
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
  set reserved_usd = 0, charged_usd = charged_usd + v_price
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
