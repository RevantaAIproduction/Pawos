-- Autonomous Work — real orchestration state machine, closing the gap identified in the prior
-- audit: "Autonomous Work" was a billing/entitlement wrapper around whatever a conversation turn
-- happened to do, with no explicit lifecycle states beyond running/completed/failed/cancelled/
-- retry_limit_reached/abandoned and no persisted record of *why* a run moved between states.
--
-- This migration is additive only — it widens the existing status CHECK constraint (never drops a
-- previously-valid value), adds one new append-only audit table, and adds one new RPC. The billing
-- math, mark_autonomous_task_completed()'s own preconditions, and every existing RLS SELECT policy
-- are all left untouched. 'completed' remains reachable ONLY via mark_autonomous_task_completed() —
-- this migration's own new transition RPC explicitly refuses to ever set it, so the billing
-- guarantee ("completed" is a success-gated, single-purpose transition) is unchanged.

-- =========================================================================
-- 1. Widen the status vocabulary: queued (a run has been deduplicated/created but orchestration
--    hasn't started calling the execution engine yet), waiting_for_permission (a destructive action
--    genuinely requires human confirmation and the run is paused, not abandoned), blocked (a required
--    capability — most commonly a disconnected/expired connector — is genuinely unavailable). All
--    three are new, real, reachable states; nothing existing is removed.
-- =========================================================================
alter table autonomous_task_runs drop constraint if exists autonomous_task_runs_status_check;
alter table autonomous_task_runs add constraint autonomous_task_runs_status_check
  check (status in (
    'queued', 'running', 'waiting_for_permission', 'blocked',
    'completed', 'failed', 'cancelled', 'retry_limit_reached', 'abandoned'
  ));

-- =========================================================================
-- 2. autonomous_task_run_transitions — an explicit, persisted audit trail of every state change.
--    Append-only (no update/delete policy, mirroring organization_billing_events' own "only a
--    security definer function ever writes here" convention). This is what "state transitions must
--    be explicit and persisted" actually requires — a queryable history distinct from just the run's
--    own current `status` column, which only ever shows the latest state.
-- =========================================================================
create table if not exists autonomous_task_run_transitions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references autonomous_task_runs(id) on delete cascade,
  from_status text not null,
  to_status text not null,
  reason text,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_autonomous_task_run_transitions_run
  on autonomous_task_run_transitions(run_id, occurred_at);

alter table autonomous_task_run_transitions enable row level security;

create policy autonomous_task_run_transitions_select_own on autonomous_task_run_transitions
  for select using (
    exists (
      select 1 from autonomous_task_runs r
      where r.id = run_id
        and (
          r.user_id = auth.uid()
          or (
            r.organization_id is not null
            and (
              is_org_member(r.organization_id, auth.uid())
              or r.organization_id in (select id from organizations where owner_user_id = auth.uid())
            )
          )
        )
    )
  );

-- No insert/update/delete policy is granted to authenticated — every row is written exclusively by
-- the two security definer functions below, exactly like organization_billing_events' own model.

drop trigger if exists trg_audit_autonomous_task_run_transitions on autonomous_task_run_transitions;
create trigger trg_audit_autonomous_task_run_transitions
  after insert on autonomous_task_run_transitions
  for each row execute function log_audit_event();

-- =========================================================================
-- 3. transition_autonomous_task_run() — the single, explicit place every non-completion state change
--    is validated and recorded. Deliberately, structurally cannot ever set 'completed' (that remains
--    the sole responsibility of mark_autonomous_task_completed(), which independently computes and
--    deducts the billing charge) — this keeps "FAILED/BLOCKED/CANCELLED must never become COMPLETED"
--    true by construction, not by caller discipline. The allowed-transition table below is the
--    complete, explicit state machine; any pair not listed is rejected.
-- =========================================================================
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
  if p_to_status not in ('running', 'waiting_for_permission', 'blocked', 'failed', 'cancelled') then
    raise exception 'transition_autonomous_task_run() does not accept target status %', p_to_status;
  end if;

  v_allowed := (v_run.status, p_to_status) in (
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
    ('blocked', 'cancelled')
  );

  if not v_allowed then
    raise exception 'Illegal autonomous run transition: % -> % (run %)', v_run.status, p_to_status, p_run_id;
  end if;

  update autonomous_task_runs
  set status = p_to_status,
      completed_at = case when p_to_status in ('failed', 'cancelled') then now() else completed_at end
  where id = p_run_id;

  insert into autonomous_task_run_transitions (run_id, from_status, to_status, reason)
  values (p_run_id, v_run.status, p_to_status, p_reason);

  select * into v_run from autonomous_task_runs where id = p_run_id;
  return v_run;
end;
$$;

grant execute on function transition_autonomous_task_run to authenticated;

-- =========================================================================
-- 4. start_or_get_active_autonomous_task_run() — replaced in place (same signature) so a newly
--    created run starts life as 'queued' (orchestration hasn't begun yet) rather than immediately
--    'running', and so the active-run dedup check (and the partial unique index below) treat every
--    non-terminal state as "active" — a run that's momentarily blocked on a disconnected connector,
--    or paused waiting for a human's permission, still deduplicates a second start attempt for the
--    same ticket exactly as a plain 'running' run already did. The initial transition is logged too,
--    so a run's full history (including its creation) is visible from the transitions table alone.
-- =========================================================================
create or replace function start_or_get_active_autonomous_task_run(
  p_organization_id uuid,
  p_workspace_id uuid,
  p_ticket_source text,
  p_ticket_id text,
  p_repository text,
  p_runtime_version text
)
returns table (run_row autonomous_task_runs, already_active boolean)
language plpgsql
security definer
as $$
declare
  v_existing autonomous_task_runs%rowtype;
  v_new autonomous_task_runs%rowtype;
begin
  if p_ticket_id is not null then
    select * into v_existing
    from autonomous_task_runs
    where status in ('queued', 'running', 'waiting_for_permission', 'blocked')
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

  insert into autonomous_task_runs (
    organization_id, workspace_id, user_id, ticket_source, ticket_id, repository, runtime_version, status
  ) values (
    p_organization_id, p_workspace_id, auth.uid(), p_ticket_source, p_ticket_id, p_repository, p_runtime_version, 'queued'
  )
  returning * into v_new;

  insert into autonomous_task_run_transitions (run_id, from_status, to_status, reason)
  values (v_new.id, 'created', 'queued', 'Autonomous run created');

  run_row := v_new;
  already_active := false;
  return next;
end;
$$;

grant execute on function start_or_get_active_autonomous_task_run to authenticated;

-- =========================================================================
-- 5. mark_autonomous_task_terminal() — widened, in place (same signature/accepted p_status values),
--    to allow a terminal (failed/cancelled/retry_limit_reached) exit from ANY non-terminal state, not
--    only 'running' — a queued run that's cancelled before orchestration even starts, or a blocked run
--    that's abandoned by the client, both need this path too. Still fully idempotent-safe: calling it
--    against an already-terminal row matches zero rows and silently no-ops, exactly as before. Now
--    also logs the transition, so every terminal exit — whichever function set it — is visible in the
--    same audit trail as every other state change.
-- =========================================================================
create or replace function mark_autonomous_task_terminal(p_run_id uuid, p_status text)
returns void
language plpgsql
security definer
as $$
declare
  v_from_status text;
begin
  if p_status not in ('failed', 'cancelled', 'retry_limit_reached') then
    raise exception 'mark_autonomous_task_terminal() only accepts failed/cancelled/retry_limit_reached — use mark_autonomous_task_completed() for success';
  end if;

  select status into v_from_status
  from autonomous_task_runs
  where id = p_run_id and user_id = auth.uid()
    and status in ('queued', 'running', 'waiting_for_permission', 'blocked');

  if v_from_status is null then
    return;
  end if;

  update autonomous_task_runs
  set status = p_status, completed_at = now()
  where id = p_run_id and user_id = auth.uid() and status = v_from_status;

  insert into autonomous_task_run_transitions (run_id, from_status, to_status, reason)
  values (p_run_id, v_from_status, p_status, 'mark_autonomous_task_terminal');
end;
$$;

grant execute on function mark_autonomous_task_terminal to authenticated;

-- =========================================================================
-- 6. Duplicate-run protection — widened to match the richer active-state set (queued/running/
--    waiting_for_permission/blocked), so a run that's momentarily paused or blocked still prevents a
--    second concurrent start for the same (owner, ticket_id) pair.
-- =========================================================================
drop index if exists idx_autonomous_task_runs_active_ticket;
create unique index if not exists idx_autonomous_task_runs_active_ticket
  on autonomous_task_runs (coalesce(organization_id::text, user_id::text), ticket_id)
  where status in ('queued', 'running', 'waiting_for_permission', 'blocked') and ticket_id is not null;

-- =========================================================================
-- 7. reconcile_stale_autonomous_task_runs() — widened, in place (same signature/behavior contract:
--    never bills anything, still scoped to the caller's own rows), to sweep every non-terminal state
--    a run can now be stuck in — not just 'running'. A queued run whose orchestration never actually
--    started, or a run left waiting_for_permission/blocked long enough that nobody ever resolved it,
--    is exactly as much "never resolved" as a stale running run always was, and deserves the same
--    honest, unbillable 'abandoned' terminal state instead of sitting invisibly forever. Each swept
--    row's transition is logged.
-- =========================================================================
create or replace function reconcile_stale_autonomous_task_runs(p_stale_after_hours int default 24)
returns int
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  -- candidates snapshots each row's status BEFORE the update (every CTE in one statement sees the
  -- same pre-statement snapshot) — this is what makes it safe to log old_status as the real prior
  -- state; a plain UPDATE ... RETURNING here would instead return the already-abandoned new value.
  with candidates as (
    select id, status as old_status
    from autonomous_task_runs
    where user_id = auth.uid()
      and status in ('queued', 'running', 'waiting_for_permission', 'blocked')
      and started_at < now() - make_interval(hours => p_stale_after_hours)
  ),
  updated as (
    update autonomous_task_runs t
    set status = 'abandoned', completed_at = now()
    from candidates c
    where t.id = c.id
    returning t.id
  )
  insert into autonomous_task_run_transitions (run_id, from_status, to_status, reason)
  select c.id, c.old_status, 'abandoned', 'reconcile_stale_autonomous_task_runs'
  from candidates c
  join updated u on u.id = c.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function reconcile_stale_autonomous_task_runs to authenticated;
