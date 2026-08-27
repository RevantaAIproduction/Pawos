-- Add verification workflow to autonomous task execution.
-- Existing states: queued, running, waiting_for_permission, blocked, completed, failed, cancelled, retry_limit_reached
-- New states: implementation_complete, awaiting_verification, verified
--
-- Verification flow:
-- running → implementation_complete (work done, request human review)
-- implementation_complete → awaiting_verification (mark for verification)
-- awaiting_verification → verified (approved by human)
-- awaiting_verification → failed (rejected by human)
-- verified → completed (via mark_autonomous_task_completed() RPC only)

-- 1. Widen status CHECK to include new verification states
alter table autonomous_task_runs drop constraint if exists autonomous_task_runs_status_check;
alter table autonomous_task_runs add constraint autonomous_task_runs_status_check
  check (status in (
    'queued', 'running', 'waiting_for_permission', 'blocked',
    'implementation_complete', 'awaiting_verification', 'verified',
    'completed', 'failed', 'cancelled', 'retry_limit_reached', 'abandoned'
  ));

-- 2. Add verification-related columns to track the human review workflow
alter table autonomous_task_runs
  add column if not exists implementation_complete_at timestamptz,
  add column if not exists verification_requested_by uuid references auth.users(id),
  add column if not exists verification_requested_at timestamptz,
  add column if not exists verified_by uuid references auth.users(id),
  add column if not exists verified_at timestamptz,
  add column if not exists verification_notes text;

-- 3. Update transition_autonomous_task_run() to support verification states
create or replace function transition_autonomous_task_run(
  p_run_id uuid,
  p_to_status text,
  p_reason text default null
)
returns autonomous_task_runs
language plpgsql
security definer
as $$
declare
  v_run autonomous_task_runs%rowtype;
  v_allowed boolean;
begin
  select * into v_run from autonomous_task_runs where id = p_run_id and user_id = auth.uid();
  if v_run.id is null then
    raise exception 'No autonomous_task_runs row % owned by the calling user was found', p_run_id;
  end if;

  if p_to_status = 'completed' then
    raise exception 'transition_autonomous_task_run() cannot set completed — use mark_autonomous_task_completed()';
  end if;

  if p_to_status not in ('running', 'implementation_complete', 'awaiting_verification', 'verified', 'waiting_for_permission', 'blocked', 'failed', 'cancelled') then
    raise exception 'transition_autonomous_task_run() does not accept target status %', p_to_status;
  end if;

  -- Allowed transitions include both standard workflow and new verification states
  v_allowed := (v_run.status, p_to_status) in (
    -- Original transitions
    ('queued', 'running'),
    ('queued', 'cancelled'),
    ('running', 'waiting_for_permission'),
    ('running', 'blocked'),
    ('running', 'failed'),
    ('running', 'cancelled'),
    ('waiting_for_permission', 'running'),
    ('waiting_for_permission', 'cancelled'),
    ('waiting_for_permission', 'blocked'),
    ('blocked', 'failed'),
    ('blocked', 'cancelled'),

    -- New verification workflow transitions
    ('running', 'implementation_complete'),
    ('implementation_complete', 'awaiting_verification'),
    ('awaiting_verification', 'verified'),
    ('awaiting_verification', 'failed'),
    ('verified', 'running'), -- Allow return to running if more work needed
    ('verified', 'failed')    -- Allow transition to failed even when verified
  );

  if not v_allowed then
    raise exception 'Illegal autonomous run transition: % -> % (run %)', v_run.status, p_to_status, p_run_id;
  end if;

  -- Update status and set verification-related timestamps
  update autonomous_task_runs
  set status = p_to_status,
      implementation_complete_at = case when p_to_status = 'implementation_complete' then now() else implementation_complete_at end,
      verification_requested_at = case when p_to_status = 'awaiting_verification' then now() else verification_requested_at end,
      verification_requested_by = case when p_to_status = 'awaiting_verification' then auth.uid() else verification_requested_by end,
      verified_at = case when p_to_status = 'verified' then now() else verified_at end,
      verified_by = case when p_to_status = 'verified' then auth.uid() else verified_by end,
      completed_at = case when p_to_status in ('failed', 'cancelled') then now() else completed_at end
  where id = p_run_id;

  insert into autonomous_task_run_transitions (run_id, from_status, to_status, reason)
  values (p_run_id, v_run.status, p_to_status, p_reason);

  select * into v_run from autonomous_task_runs where id = p_run_id;
  return v_run;
end;
$$;

grant execute on function transition_autonomous_task_run to authenticated;
