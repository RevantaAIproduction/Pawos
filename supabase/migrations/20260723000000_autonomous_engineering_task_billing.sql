-- PawOS Team & Enterprise Collaboration Platform — Autonomous Engineering
-- Task billing. Apply via the Supabase dashboard SQL editor or
-- `supabase db push`, after 20260722000000_phase6_enterprise_hardening.sql.
--
-- Implements the commercial model from PAWOS_PRICING_AUDIT.md exactly:
-- the billable unit is named "Autonomous Engineering Task" (not "Autonomous
-- Ticket Resolution" — the workflow is tracker-agnostic: it may originate
-- from Jira/GitHub Issues/Linear/Azure DevOps, or from no tracker at all,
-- so the schema never assumes a ticket exists). Billing is success-gated:
-- a run is billable only once it reaches this migration's own COMPLETED
-- state, and per the pricing audit's loophole-closing recommendation,
-- "completed" is defined at PR-ready-and-ticket-updated — never contingent
-- on whether Paw itself performs the optional subsequent deploy step, since
-- deploy is human-approved and orthogonal to whether the engineering work
-- itself succeeded.

-- =========================================================================
-- autonomous_task_runs — one row per attempted autonomous workflow
-- invocation, from the moment the workflow starts to its terminal state.
-- Mirrors workspace_tasks' org-scoping pattern (Phase 2) but is a distinct
-- table since a task run has a fundamentally different lifecycle (a
-- single, bounded, machine-driven execution instead of a human-assignable
-- work item) and must never be deletable/editable by a member the way a
-- workspace_task is — this table is an append-only execution record.
-- =========================================================================
create table if not exists autonomous_task_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid references organization_workspaces(id) on delete set null,
  user_id uuid not null references auth.users(id),
  -- Tracker-agnostic by design — null ticket_source/ticket_id means the
  -- workflow was started directly (a chat request, an internally-discovered
  -- issue), which is exactly as billable as a tracker-originated one.
  ticket_source text check (ticket_source in ('jira', 'github', 'linear', 'azureDevOps', null)),
  ticket_id text,
  repository text,
  runtime_version text not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'cancelled', 'retry_limit_reached')),
  -- Success-criteria checklist, per the pricing audit's redefined boundary —
  -- deploy_completed is tracked for visibility only and never gates billability.
  pr_created boolean not null default false,
  pr_url text,
  ticket_updated boolean not null default false,
  client_reply_sent boolean not null default false,
  deploy_completed boolean not null default false,
  -- billable is set true only by mark_autonomous_task_completed() below,
  -- never directly — this is the one column the pricing model's entire
  -- "only bill on success" guarantee rests on.
  billable boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_autonomous_task_runs_org on autonomous_task_runs(organization_id, created_at desc);
create index if not exists idx_autonomous_task_runs_billable on autonomous_task_runs(organization_id, billable) where billable = true;

alter table autonomous_task_runs enable row level security;

create policy autonomous_task_runs_select_own_org on autonomous_task_runs
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

-- Any org member can start a run for themselves — the same "trusted client,
-- capability-gated at the point that matters" model this project uses
-- everywhere else (e.g. control_grants). Updates (status transitions) are
-- restricted to the run's own owner, so one member can never mark another
-- member's run completed.
create policy autonomous_task_runs_insert_own on autonomous_task_runs
  for insert with check (
    user_id = auth.uid()
    and (is_org_member(organization_id, auth.uid()) or organization_id in (select id from organizations where owner_user_id = auth.uid()))
  );

create policy autonomous_task_runs_update_own on autonomous_task_runs
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists trg_audit_autonomous_task_runs on autonomous_task_runs;
create trigger trg_audit_autonomous_task_runs
  after insert or update or delete on autonomous_task_runs
  for each row execute function log_audit_event();

-- =========================================================================
-- organization_task_allowance — the monthly included-allowance counter the
-- pricing audit requires (§3/§6: "everything included" must mean a real,
-- nonzero number, not zero-from-unit-one). One row per org per calendar
-- month, reset by simply inserting a new month's row — no cron sweeper
-- needed since a new month is a new row, not a value that needs expiring.
-- =========================================================================
create table if not exists organization_task_allowance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  period_month date not null, -- always the 1st of the month, e.g. 2026-08-01
  included_allowance integer not null default 0,
  used_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (organization_id, period_month)
);

alter table organization_task_allowance enable row level security;

create policy organization_task_allowance_select_own_org on organization_task_allowance
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

create policy organization_task_allowance_manage_own_org on organization_task_allowance
  for all using (has_capability(organization_id, 'billing.manage'))
  with check (has_capability(organization_id, 'billing.manage'));

-- =========================================================================
-- organization_billing_events — the billing history record, with exactly
-- the fields specified: Resolution ID, Ticket ID, Workspace, Organization,
-- User, Runtime Version, Start Time, End Time, Duration, Status, Billing
-- Event, Amount, Invoice Reference.
-- =========================================================================
create table if not exists organization_billing_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references autonomous_task_runs(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid references organization_workspaces(id) on delete set null,
  user_id uuid not null references auth.users(id),
  ticket_id text,
  runtime_version text not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  duration_seconds integer not null,
  status text not null,
  event_type text not null default 'autonomous_engineering_task' check (event_type in ('autonomous_engineering_task')),
  amount_usd numeric(10, 2) not null,
  invoice_reference text,
  created_at timestamptz not null default now()
);

create index if not exists idx_organization_billing_events_org on organization_billing_events(organization_id, created_at desc);

alter table organization_billing_events enable row level security;

create policy organization_billing_events_select_own_org on organization_billing_events
  for select using (
    is_org_member(organization_id, auth.uid())
    or organization_id in (select id from organizations where owner_user_id = auth.uid())
  );

-- Inserts only ever happen via mark_autonomous_task_completed() below
-- (security definer) — no direct insert policy is granted to authenticated,
-- exactly like audit_log's own "only the trigger writes here" discipline.

drop trigger if exists trg_audit_organization_billing_events on organization_billing_events;
create trigger trg_audit_organization_billing_events
  after insert on organization_billing_events
  for each row execute function log_audit_event();

-- =========================================================================
-- mark_autonomous_task_completed() — the one and only path that can ever
-- mark a run billable and create a billing event. Called by the app the
-- instant its own execution engine reaches its internal COMPLETED state
-- (never earlier, never on cancel/fail/retry-limit-reached — those call
-- mark_autonomous_task_terminal() below instead, with billable staying
-- false). Per the pricing audit, completion requires pr_created AND
-- ticket_updated — deploy_completed is recorded for visibility only and
-- never required, closing the deploy-boundary loophole identified in the
-- audit's §9.
-- =========================================================================
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
  v_allowance organization_task_allowance%rowtype;
  v_period date := date_trunc('month', now())::date;
  v_charge numeric := p_amount_usd;
begin
  select * into v_run from autonomous_task_runs where id = p_run_id and user_id = auth.uid();
  if v_run.id is null then
    raise exception 'No autonomous_task_runs row % owned by the calling user was found', p_run_id;
  end if;
  if v_run.status <> 'running' then
    raise exception 'Run % is already in a terminal state (%) — cannot complete it twice', p_run_id, v_run.status;
  end if;

  update autonomous_task_runs
  set status = 'completed',
      pr_created = true,
      pr_url = p_pr_url,
      ticket_updated = true,
      client_reply_sent = p_client_reply_sent,
      deploy_completed = p_deploy_completed,
      billable = true,
      completed_at = now()
  where id = p_run_id;

  -- Consume the included monthly allowance first; only charge for units
  -- beyond it, per the pricing audit's §3/§10 requirement.
  select * into v_allowance from organization_task_allowance where organization_id = v_run.organization_id and period_month = v_period;
  if v_allowance.id is null then
    insert into organization_task_allowance (organization_id, period_month, included_allowance, used_count)
    values (v_run.organization_id, v_period, 0, 0)
    returning * into v_allowance;
  end if;

  update organization_task_allowance
  set used_count = used_count + 1, updated_at = now()
  where id = v_allowance.id;

  if v_allowance.used_count < v_allowance.included_allowance then
    v_charge := 0;
  end if;

  insert into organization_billing_events (
    run_id, organization_id, workspace_id, user_id, ticket_id, runtime_version,
    started_at, completed_at, duration_seconds, status, amount_usd, invoice_reference
  ) values (
    p_run_id, v_run.organization_id, v_run.workspace_id, v_run.user_id, v_run.ticket_id, v_run.runtime_version,
    v_run.started_at, now(), extract(epoch from (now() - v_run.started_at))::integer, 'completed', v_charge, p_invoice_reference
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

grant execute on function mark_autonomous_task_completed to authenticated;

-- =========================================================================
-- mark_autonomous_task_terminal() — the non-billable exit paths: failed,
-- cancelled, retry-limit-reached. Deliberately a separate function from
-- the completed path (rather than one function with a "billable" boolean
-- argument the client could set incorrectly) so there is no code path in
-- which a client call can mark a run both terminal-and-billable in the
-- same statement — the billable flag only ever gets set true inside
-- mark_autonomous_task_completed() above.
-- =========================================================================
create or replace function mark_autonomous_task_terminal(p_run_id uuid, p_status text)
returns void
language plpgsql
security definer
as $$
begin
  if p_status not in ('failed', 'cancelled', 'retry_limit_reached') then
    raise exception 'mark_autonomous_task_terminal() only accepts failed/cancelled/retry_limit_reached — use mark_autonomous_task_completed() for success';
  end if;
  update autonomous_task_runs
  set status = p_status, completed_at = now()
  where id = p_run_id and user_id = auth.uid() and status = 'running';
end;
$$;

grant execute on function mark_autonomous_task_terminal to authenticated;

-- =========================================================================
-- New capability + seed: billing.manage already exists nowhere in this
-- codebase as a capability id (billing.manage in OrgPermissions.ts today is
-- a hardcoded, non-capability-table check) — seeding it here for the first
-- time as a real role_capabilities entry, additive, owner/organizationOwner/
-- billingAdministrator only, matching billing's existing trust level.
-- =========================================================================
create or replace function seed_billing_task_allowance_capabilities(p_organization_id uuid)
returns void
language plpgsql
as $$
begin
  insert into role_capabilities (organization_id, role, capability, allowed)
  values
    (p_organization_id, 'owner', 'billing.manage', true),
    (p_organization_id, 'billingAdministrator', 'billing.manage', true),
    (p_organization_id, 'organizationOwner', 'billing.manage', true)
  on conflict (organization_id, role, capability) do nothing;
end;
$$;

do $$
declare
  v_org record;
begin
  for v_org in select id from organizations loop
    perform seed_billing_task_allowance_capabilities(v_org.id);
  end loop;
end;
$$;

create or replace function trg_seed_role_capabilities_fn()
returns trigger
language plpgsql
as $$
begin
  perform seed_default_role_capabilities(new.id);
  perform seed_phase6_role_capabilities(new.id);
  perform seed_billing_task_allowance_capabilities(new.id);
  return new;
end;
$$;

grant execute on function seed_billing_task_allowance_capabilities to authenticated;
