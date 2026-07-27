-- Marks every Autonomous Ticket completion event with its evidence provenance —
-- 'self_reported' (the only kind possible today, since no createPullRequest/updateTicket connector
-- capability exists — see the audit in 20260727000000_billing_completion_hardening.sql) versus
-- 'connector_verified' (reserved for a future real GitHub/GitLab PR-creation and Jira/Linear/GitHub
-- Issues ticket-write capability that can independently confirm a PR/ticket write actually
-- happened). This does not invent verification the current architecture can't support — it only
-- prepares the existing billing pipeline to consume it later without any redesign: the day such a
-- connector capability ships, its own first-party code calls the exact same
-- mark_autonomous_task_completed() RPC with p_pr_verified/p_ticket_verified set true, and the same
-- tier computation, deduction, idempotency, and ledger already in place just... works.
--
-- p_pr_verified/p_ticket_verified are new TRAILING parameters with defaults, which Postgres allows
-- adding via CREATE OR REPLACE FUNCTION without dropping the existing 5-argument signature first
-- (unlike removing/reordering/retyping a parameter, which does require a drop). Every existing
-- caller (the model-facing AutonomousTaskBillingGate.ts path) is unaffected and, going forward,
-- explicitly passes false/false — self-reported evidence is real evidence of *intent*, just not
-- independently verified, and must never be silently upgraded to 'connector_verified'.

alter table autonomous_task_runs add column if not exists pr_verified boolean not null default false;
alter table autonomous_task_runs add column if not exists ticket_verified boolean not null default false;
alter table autonomous_task_runs add column if not exists completion_source text not null default 'self_reported'
  check (completion_source in ('self_reported', 'connector_verified'));

alter table organization_billing_events add column if not exists completion_source text not null default 'self_reported'
  check (completion_source in ('self_reported', 'connector_verified'));

create or replace function mark_autonomous_task_completed(
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
as $$
declare
  v_run autonomous_task_runs%rowtype;
  v_event_id uuid;
  v_org_balance numeric;
  v_org_count int;
  v_user_balance numeric;
  v_user_count int;
  v_unit_price numeric;
  v_completion_source text;
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

  -- 'connector_verified' requires BOTH pieces of evidence to be independently confirmed — a run
  -- with only one verified leg is still, honestly, only partially evidenced and stays
  -- 'self_reported' rather than overclaiming full verification.
  v_completion_source := case when p_pr_verified and p_ticket_verified then 'connector_verified' else 'self_reported' end;

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
      deploy_completed = p_deploy_completed, billable = true, completed_at = now(),
      pr_verified = p_pr_verified, ticket_verified = p_ticket_verified, completion_source = v_completion_source
  where id = p_run_id;

  insert into organization_billing_events (
    run_id, organization_id, workspace_id, user_id, ticket_id, runtime_version,
    started_at, completed_at, duration_seconds, status, amount_usd, invoice_reference, completion_source
  )
  values (
    p_run_id, v_run.organization_id, v_run.workspace_id, v_run.user_id, v_run.ticket_id, v_run.runtime_version,
    v_run.started_at, now(), extract(epoch from (now() - v_run.started_at))::int, 'completed', v_unit_price, p_invoice_reference, v_completion_source
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;
grant execute on function mark_autonomous_task_completed to authenticated;
