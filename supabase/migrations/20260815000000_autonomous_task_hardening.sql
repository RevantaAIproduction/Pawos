-- Autonomous Work hardening pass — two independent, targeted fixes to the existing
-- autonomous_task_runs schema, found during a full end-to-end audit of the Autonomous Engineering
-- Task system. Neither fix changes the billing math, the pricing model, or any existing RLS SELECT
-- policy — both are minimal corrections to bugs found in the schema as it already exists.

-- =========================================================================
-- Fix 1 — INSERT policy never accounted for organization_id becoming nullable.
--
-- 20260724000000_prepaid_task_credits.sql relaxed autonomous_task_runs.organization_id to allow
-- individual (non-organization) Pro/Pro Max runs, and its own comment claims "no policy changes are
-- needed" for RLS — but that comment only checked the SELECT policy. The INSERT policy
-- (autonomous_task_runs_insert_own, from 20260723000000_autonomous_engineering_task_billing.sql)
-- still requires `is_org_member(organization_id, auth.uid()) or organization_id in (select id from
-- organizations where owner_user_id = auth.uid())`. For organization_id IS NULL:
--   - is_org_member(null, ...) evaluates its internal `organization_id = null` comparison to
--     unknown, so the EXISTS wrapping it returns a real `false` (not null).
--   - `null in (select id from organizations ...)` evaluates to NULL under three-valued logic
--     whenever that subquery returns at least one row (any org exists anywhere in the system).
--   - `false or null` is NULL, and Postgres RLS only ever passes a WITH CHECK clause that evaluates
--     to TRUE — NULL is treated as reject, exactly like FALSE.
-- Net effect: every individual-account startRun() insert is silently rejected by RLS today. This
-- fix adds the missing `organization_id is null` branch, scoped to the row's own user_id exactly
-- like every other individual-account policy in this schema (organization_task_credits,
-- ticket_balance_topups, task_credit_purchases all already do this correctly).
-- =========================================================================
drop policy if exists autonomous_task_runs_insert_own on autonomous_task_runs;
create policy autonomous_task_runs_insert_own on autonomous_task_runs
  for insert with check (
    user_id = auth.uid()
    and (
      organization_id is null
      or is_org_member(organization_id, auth.uid())
      or organization_id in (select id from organizations where owner_user_id = auth.uid())
    )
  );

-- =========================================================================
-- Fix 2 — duplicate autonomous runs for the same ticket were never prevented.
--
-- Nothing in the schema or application code stopped the same ticket_id from having two
-- simultaneously-'running' autonomous_task_runs rows — a retried tool call, two independent
-- requests for the same ticket, or a race between two IPC calls could each pass the (separate,
-- non-atomic) ticket-balance pre-check and each successfully insert its own row, meaning the same
-- ticket could be investigated twice and billed twice. A partial unique index (only enforced while
-- status = 'running', and only when ticket_id is actually set — a ticketless run has nothing to
-- deduplicate against) closes this at the database layer, the same durable-guarantee level every
-- other uniqueness constraint in this schema already gets (e.g.
-- idx_ticket_balance_topups_payment_id from 20260814000000_p0_payment_verification_hardening.sql).
-- Scoped per-owner (organization_id when present, else user_id) so two different accounts working
-- the same external ticket id never collide with each other.
-- =========================================================================
create unique index if not exists idx_autonomous_task_runs_active_ticket
  on autonomous_task_runs (coalesce(organization_id::text, user_id::text), ticket_id)
  where status = 'running' and ticket_id is not null;

-- Wraps the plain insert with a duplicate-aware start: if an active ('running') run already exists
-- for this exact (owner, ticket_id), returns that existing run instead of raising a unique-violation
-- exception the client would otherwise have to catch and interpret itself. This matches the schema's
-- own established "return the existing row rather than error on a benign retry" convention already
-- used by mark_autonomous_task_completed()'s idempotent-double-complete branch
-- (20260727000000_billing_completion_hardening.sql). security definer so it can read across the
-- caller's own rows exactly like every other RPC here; still fully scoped by auth.uid() — this
-- grants no broader access than the INSERT policy above already allows.
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
    where status = 'running'
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
    organization_id, workspace_id, user_id, ticket_source, ticket_id, repository, runtime_version
  ) values (
    p_organization_id, p_workspace_id, auth.uid(), p_ticket_source, p_ticket_id, p_repository, p_runtime_version
  )
  returning * into v_new;

  run_row := v_new;
  already_active := false;
  return next;
end;
$$;

grant execute on function start_or_get_active_autonomous_task_run to authenticated;
