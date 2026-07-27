-- Hardens the Autonomous Ticket System's billing completion path so enforcement never depends on
-- the calling client (including the LLM-driven desktop app) remembering to behave correctly.
--
-- Context: mark_autonomous_task_completed() is already the single, deterministic, server-side
-- function that computes the volume-tiered rate, deducts the Ticket Balance, and records the
-- billing event — confirmed to be the only code path anywhere that can ever write to
-- organization_billing_events (see the RLS comment on that table: "no direct insert policy is
-- granted to authenticated"). What was NOT hardened: (1) calling it twice for the same run — could
-- only ever raise an exception, not silently double-charge, but a stray retry currently surfaces a
-- scary error instead of a safe no-op; (2) a run that starts (`running`) and then is never resolved
-- — because this codebase has no deterministic, independently-verifiable signal for "a pull request
-- was actually opened" or "the ticket was actually updated" (no such connector/plugin capability
-- exists), a run can be left in `running` state forever if the calling client never reports back,
-- with no record of its final fate anywhere in usage history.
--
-- This migration closes both gaps using only the existing schema/columns — no new tables, no
-- change to the billing math, and no attempt to fabricate independent verification of PR/ticket
-- writes that this codebase genuinely doesn't have the capability to check.

-- 'abandoned' is a new, system-only terminal state — never settable via mark_autonomous_task_terminal()
-- (which still only accepts failed/cancelled/retry_limit_reached), only via
-- reconcile_stale_autonomous_task_runs() below. It exists so a run that's simply never resolved is
-- still visible in usage history with a real terminal state, instead of vanishing into permanent
-- 'running' limbo.
alter table autonomous_task_runs drop constraint if exists autonomous_task_runs_status_check;
alter table autonomous_task_runs add constraint autonomous_task_runs_status_check
  check (status in ('running', 'completed', 'failed', 'cancelled', 'retry_limit_reached', 'abandoned'));

-- Idempotent replacement: same 5-argument signature as the version in
-- 20260726020000_ticket_balance_wallet.sql, so this is a true in-place replace, not a new overload.
-- The only behavioral change is the first branch below — a run that's already `completed` now
-- returns the existing billing event id instead of raising, making it safe for this function to be
-- called more than once for the same run (a retried IPC call, a race between a client call and any
-- future automated trigger, etc.) without ever double-charging. A run in any OTHER terminal state
-- (failed/cancelled/retry_limit_reached/abandoned) still raises — completing an already-failed run
-- is a genuine logic error, not a benign retry, and must not be silently accepted.
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

  if v_run.status = 'completed' then
    select id into v_event_id from organization_billing_events where run_id = p_run_id order by created_at desc limit 1;
    return v_event_id;
  end if;
  if v_run.status <> 'running' then
    raise exception 'Run % is already in a non-completable terminal state (%) — it cannot now be marked completed', p_run_id, v_run.status;
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

-- Deterministic, server-side reconciliation for runs that never got resolved — the safety net for
-- "the model started a run and then never called complete/end". Never bills anything (there is no
-- evidence completion genuinely happened, so per this project's own "never claim success without
-- evidence" rule it must never be charged); it only guarantees a stale run's fate is recorded
-- instead of leaving it invisible in 'running' state forever. Scoped to the caller's own runs
-- (user_id = auth.uid()) — the same ownership model mark_autonomous_task_terminal() already uses —
-- so it's safe to call unconditionally on every app startup, for every signed-in account, with no
-- privilege beyond what that account could already do to its own runs.
create or replace function reconcile_stale_autonomous_task_runs(p_stale_after_hours int default 24)
returns int
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  update autonomous_task_runs
  set status = 'abandoned', completed_at = now()
  where user_id = auth.uid()
    and status = 'running'
    and started_at < now() - make_interval(hours => p_stale_after_hours);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function reconcile_stale_autonomous_task_runs to authenticated;
