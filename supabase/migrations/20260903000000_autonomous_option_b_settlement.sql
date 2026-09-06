-- Option B: Main-Process Authoritative Autonomous Work PC Settlement
--
-- This migration refactors autonomous work PC settlement to use the Electron main process
-- as the authoritative source of usage data (UsageEventStore), rather than querying a
-- non-existent Supabase usage_events table.
--
-- Key changes:
-- 1. Settlement RPC now accepts p_actual_pc as parameter (calculated by main process)
-- 2. Add waiting_for_topup status for pause/resume during wallet insufficiency
-- 3. Fix transition_autonomous_task_run() concurrency issues (FOR UPDATE, settled_at check)
-- 4. Update RLS policies for individual user authorization
-- 5. Reject execution transitions after financial settlement

-- =========================================================================
-- 0. Update add_ticket_balance RPC to also update balance_pc
-- =========================================================================
-- Top-ups now increase balance_pc atomically alongside balance_usd
-- $1 = 100 PC

CREATE OR REPLACE FUNCTION add_ticket_balance(
  p_organization_id UUID,
  p_amount_usd NUMERIC,
  p_payment_reference TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_topup_id UUID;
  v_amount_pc INTEGER;
BEGIN
  IF p_amount_usd < 30 THEN
    RAISE EXCEPTION 'Minimum top-up is $30';
  END IF;
  IF p_amount_usd > 20000 THEN
    RAISE EXCEPTION 'Maximum top-up is $20,000';
  END IF;

  -- Convert amount to PC: $1 = 100 PC
  v_amount_pc := (p_amount_usd * 100)::INTEGER;

  -- Record the top-up in audit table
  INSERT INTO ticket_balance_topups (user_id, organization_id, amount_usd, payment_reference)
  VALUES (CASE WHEN p_organization_id IS NULL THEN auth.uid() ELSE NULL END, p_organization_id, p_amount_usd, p_payment_reference)
  RETURNING id INTO v_topup_id;

  -- Update wallet: BOTH balance_usd (legacy) AND balance_pc (new)
  IF p_organization_id IS NULL THEN
    -- Individual user wallet
    INSERT INTO user_task_credits (user_id, balance_usd, balance_pc)
    VALUES (auth.uid(), p_amount_usd, v_amount_pc)
    ON CONFLICT (user_id) DO UPDATE SET
      balance_usd = user_task_credits.balance_usd + p_amount_usd,
      balance_pc = user_task_credits.balance_pc + v_amount_pc,
      updated_at = NOW();
  ELSE
    -- Organization wallet
    INSERT INTO organization_task_credits (organization_id, balance_usd, balance_pc)
    VALUES (p_organization_id, p_amount_usd, v_amount_pc)
    ON CONFLICT (organization_id) DO UPDATE SET
      balance_usd = organization_task_credits.balance_usd + p_amount_usd,
      balance_pc = organization_task_credits.balance_pc + v_amount_pc,
      updated_at = NOW();
  END IF;

  RETURN v_topup_id;
END;
$$;

GRANT EXECUTE ON FUNCTION add_ticket_balance TO authenticated;

-- =========================================================================
-- 1. Add waiting_for_topup to status CHECK constraint
-- =========================================================================
ALTER TABLE autonomous_task_runs DROP CONSTRAINT IF EXISTS autonomous_task_runs_status_check;
ALTER TABLE autonomous_task_runs ADD CONSTRAINT autonomous_task_runs_status_check
  CHECK (status IN (
    'queued', 'running', 'waiting_for_permission', 'blocked', 'waiting_for_topup',
    'implementation_complete', 'awaiting_verification', 'verified',
    'completed', 'failed', 'cancelled', 'retry_limit_reached', 'abandoned'
  ));

-- =========================================================================
-- 2. Fix RLS: Allow individual users to read their own autonomous_task_runs
-- =========================================================================
DROP POLICY IF EXISTS autonomous_task_runs_select_own_org ON autonomous_task_runs;
CREATE POLICY autonomous_task_runs_select_own_org ON autonomous_task_runs
  FOR SELECT USING (
    user_id = auth.uid()  -- NEW: individual can read own runs
    OR (
      organization_id IS NOT NULL
      AND (
        is_org_member(organization_id, auth.uid())
        OR organization_id IN (SELECT id FROM organizations WHERE owner_user_id = auth.uid())
      )
    )
  );

-- =========================================================================
-- 3. Fix RLS: Allow individual users to read their own billing events
-- =========================================================================
DROP POLICY IF EXISTS organization_billing_events_select_own_org ON organization_billing_events;
CREATE POLICY organization_billing_events_select_own_org ON organization_billing_events
  FOR SELECT USING (
    (organization_id IS NULL AND user_id = auth.uid())  -- NEW: individual's own billing events
    OR (
      organization_id IS NOT NULL
      AND (
        is_org_member(organization_id, auth.uid())
        OR organization_id IN (SELECT id FROM organizations WHERE owner_user_id = auth.uid())
      )
    )
  );

-- =========================================================================
-- 4. Fix transition_autonomous_task_run() concurrency issues
-- =========================================================================
DROP FUNCTION IF EXISTS transition_autonomous_task_run(UUID, text, text);
CREATE OR REPLACE FUNCTION transition_autonomous_task_run(
  p_run_id UUID,
  p_to_status text,
  p_reason text DEFAULT NULL
)
RETURNS autonomous_task_runs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_run autonomous_task_runs%ROWTYPE;
  v_allowed boolean;
BEGIN
  -- 1. Lock and fetch run FOR UPDATE to prevent concurrency races
  SELECT * INTO v_run
  FROM autonomous_task_runs
  WHERE id = p_run_id AND user_id = auth.uid()
  FOR UPDATE;

  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'No autonomous_task_runs row % owned by the calling user was found', p_run_id;
  END IF;

  -- 2. Reject transitions for 'completed' (only via mark_autonomous_task_completed)
  IF p_to_status = 'completed' THEN
    RAISE EXCEPTION 'transition_autonomous_task_run() cannot set completed — use mark_autonomous_task_completed()';
  END IF;

  -- 3. Reject if already financially settled
  IF v_run.settled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Run % is already financially settled; cannot transition', p_run_id;
  END IF;

  -- 4. Validate target status
  IF p_to_status NOT IN ('running', 'waiting_for_permission', 'blocked', 'waiting_for_topup', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'transition_autonomous_task_run() does not accept target status %', p_to_status;
  END IF;

  -- 5. Validate transition is allowed
  v_allowed := (v_run.status, p_to_status) IN (
    ('queued', 'running'),
    ('queued', 'cancelled'),
    ('running', 'waiting_for_permission'),
    ('running', 'blocked'),
    ('running', 'waiting_for_topup'),
    ('running', 'failed'),
    ('running', 'cancelled'),
    ('waiting_for_permission', 'running'),
    ('waiting_for_permission', 'waiting_for_topup'),
    ('waiting_for_permission', 'cancelled'),
    ('waiting_for_permission', 'blocked'),
    ('waiting_for_topup', 'running'),
    ('waiting_for_topup', 'failed'),
    ('waiting_for_topup', 'cancelled'),
    ('blocked', 'failed'),
    ('blocked', 'cancelled')
  );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Illegal autonomous run transition: % -> % (run %)', v_run.status, p_to_status, p_run_id;
  END IF;

  -- 6. Update status
  UPDATE autonomous_task_runs
  SET status = p_to_status,
      completed_at = CASE WHEN p_to_status IN ('failed', 'cancelled') THEN NOW() ELSE completed_at END
  WHERE id = p_run_id;

  -- 7. Audit transition
  INSERT INTO autonomous_task_run_transitions (run_id, from_status, to_status, reason)
  VALUES (p_run_id, v_run.status, p_to_status, p_reason);

  -- 8. Return updated run
  SELECT * INTO v_run FROM autonomous_task_runs WHERE id = p_run_id;
  RETURN v_run;
END;
$$;

GRANT EXECUTE ON FUNCTION transition_autonomous_task_run TO authenticated;

-- =========================================================================
-- 5. Refactor settle_autonomous_task_run_pc() to accept p_actual_pc parameter
--    (calculated by main process from authoritative UsageEventStore)
-- =========================================================================
DROP FUNCTION IF EXISTS settle_autonomous_task_run_pc(UUID);
CREATE OR REPLACE FUNCTION settle_autonomous_task_run_pc(
  p_run_id UUID,
  p_actual_pc INTEGER
)
RETURNS UUID AS $$
DECLARE
  v_run autonomous_task_runs%ROWTYPE;
  v_billing_event_id UUID;
  v_organization_id UUID;
  v_user_id UUID;
  v_original_reserved_pc INTEGER;
  v_unused_pc INTEGER;
BEGIN
  -- 1. Lock and fetch run
  SELECT * INTO v_run
  FROM autonomous_task_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF v_run IS NULL THEN
    RAISE EXCEPTION 'Run % not found or no permission', p_run_id;
  END IF;

  -- 2. Verify ownership
  IF v_run.user_id <> auth.uid() THEN
    IF v_run.organization_id IS NOT NULL THEN
      IF NOT is_org_member(v_run.organization_id, auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: user not member of organization';
      END IF;
    ELSE
      RAISE EXCEPTION 'Unauthorized: run not owned by current user';
    END IF;
  END IF;

  -- 3. Idempotency: if already settled, return existing event
  IF v_run.settled_at IS NOT NULL THEN
    SELECT id INTO v_billing_event_id
    FROM organization_billing_events
    WHERE run_id = p_run_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_billing_event_id IS NOT NULL THEN
      RETURN v_billing_event_id;
    END IF;
  END IF;

  -- 4. Verify state: must be in a terminal execution state for settlement
  -- Terminal states only: completed, failed, cancelled, abandoned
  -- Non-terminal states (running, waiting_for_permission, waiting_for_topup) cannot settle
  IF v_run.status NOT IN ('completed', 'failed', 'cancelled', 'abandoned') THEN
    RAISE EXCEPTION 'Run % is not in a terminal execution state (cannot settle from status %)',
      p_run_id, v_run.status;
  END IF;

  -- 5. Validate p_actual_pc (main process is authoritative)
  IF p_actual_pc < 0 THEN
    RAISE EXCEPTION 'Data integrity error: actual_pc cannot be negative: %', p_actual_pc;
  END IF;

  -- 6. Get original reservation
  v_original_reserved_pc := COALESCE(v_run.reserved_pc, 0);

  -- 7. Validate actual_pc <= reserved_pc
  IF p_actual_pc > v_original_reserved_pc THEN
    RAISE EXCEPTION 'Data integrity error: run % consumed % PC but only % was reserved',
      p_run_id, p_actual_pc, v_original_reserved_pc;
  END IF;

  -- 8. Calculate unused reservation
  v_unused_pc := v_original_reserved_pc - p_actual_pc;

  -- 9. Get wallet location
  v_organization_id := v_run.organization_id;
  v_user_id := v_run.user_id;

  -- 10. Settlement transaction: release unused, mark settled
  IF v_organization_id IS NOT NULL THEN
    UPDATE organization_task_credits
    SET balance_pc = balance_pc + v_unused_pc,
        balance_reserved = balance_reserved - v_original_reserved_pc,
        updated_at = NOW()
    WHERE organization_id = v_organization_id;
  ELSE
    UPDATE user_task_credits
    SET balance_pc = balance_pc + v_unused_pc,
        balance_reserved = balance_reserved - v_original_reserved_pc,
        updated_at = NOW()
    WHERE user_id = v_user_id;
  END IF;

  -- 11. Update run: mark as financially settled (preserve execution status)
  UPDATE autonomous_task_runs
  SET settled_at = NOW(),
      settled_pc = p_actual_pc
  WHERE id = p_run_id;

  -- 12. Create billing event: immutable ledger with actual terminal status
  INSERT INTO organization_billing_events (
    id, run_id, organization_id, user_id, workspace_id, ticket_id,
    started_at, completed_at, duration_seconds, status,
    amount_usd, amount_pc, created_at
  ) VALUES (
    gen_random_uuid(),
    p_run_id,
    v_organization_id,
    v_user_id,
    v_run.workspace_id,
    v_run.ticket_id,
    v_run.started_at,
    NOW(),
    EXTRACT(EPOCH FROM (NOW() - v_run.started_at))::INT,
    v_run.status,  -- PRESERVES actual terminal state
    ROUND(p_actual_pc::NUMERIC / 100, 2),
    p_actual_pc,
    NOW()
  ) RETURNING id INTO v_billing_event_id;

  RETURN v_billing_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant explicit 2-parameter signature for clarity and consistency
GRANT EXECUTE ON FUNCTION settle_autonomous_task_run_pc(UUID, INTEGER) TO authenticated;

-- =========================================================================
-- 6. Reserve Autonomous Work PC before execution (idempotent by run_id)
-- =========================================================================
DROP FUNCTION IF EXISTS reserve_autonomous_task_pc(UUID, INTEGER);
CREATE OR REPLACE FUNCTION reserve_autonomous_task_pc(
  p_run_id UUID,
  p_pc_to_reserve INTEGER
)
RETURNS autonomous_task_runs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_run autonomous_task_runs%ROWTYPE;
  v_organization_id UUID;
  v_user_id UUID;
  v_current_balance_pc INTEGER;
  v_current_reserved INTEGER;
BEGIN
  -- 1. Lock and fetch run
  SELECT * INTO v_run
  FROM autonomous_task_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF v_run IS NULL THEN
    RAISE EXCEPTION 'Run % not found or no permission', p_run_id;
  END IF;

  -- 2. Idempotency: if already reserved, return existing run (no double-reservation)
  IF v_run.reserved_pc IS NOT NULL AND v_run.reserved_pc > 0 THEN
    RETURN v_run;
  END IF;

  v_organization_id := v_run.organization_id;
  v_user_id := v_run.user_id;

  -- 3. Check wallet balance and availability
  IF v_organization_id IS NOT NULL THEN
    SELECT balance_pc INTO v_current_balance_pc
    FROM organization_task_credits
    WHERE organization_id = v_organization_id
    FOR UPDATE;

    IF v_current_balance_pc IS NULL OR v_current_balance_pc < p_pc_to_reserve THEN
      RAISE EXCEPTION 'Insufficient wallet balance: have %, need %',
        COALESCE(v_current_balance_pc, 0), p_pc_to_reserve;
    END IF;

    -- 4. Deduct from available balance, add to reserved
    UPDATE organization_task_credits
    SET balance_pc = balance_pc - p_pc_to_reserve,
        balance_reserved = COALESCE(balance_reserved, 0) + p_pc_to_reserve,
        updated_at = NOW()
    WHERE organization_id = v_organization_id;
  ELSE
    SELECT balance_pc INTO v_current_balance_pc
    FROM user_task_credits
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF v_current_balance_pc IS NULL OR v_current_balance_pc < p_pc_to_reserve THEN
      RAISE EXCEPTION 'Insufficient wallet balance: have %, need %',
        COALESCE(v_current_balance_pc, 0), p_pc_to_reserve;
    END IF;

    UPDATE user_task_credits
    SET balance_pc = balance_pc - p_pc_to_reserve,
        balance_reserved = COALESCE(balance_reserved, 0) + p_pc_to_reserve,
        updated_at = NOW()
    WHERE user_id = v_user_id;
  END IF;

  -- 5. Mark run with reservation amount
  UPDATE autonomous_task_runs
  SET reserved_pc = p_pc_to_reserve
  WHERE id = p_run_id;

  -- 6. Return updated run
  SELECT * INTO v_run FROM autonomous_task_runs WHERE id = p_run_id;
  RETURN v_run;
END;
$$;

GRANT EXECUTE ON FUNCTION reserve_autonomous_task_pc TO authenticated;

-- =========================================================================
-- 7. PRESERVE Phase 3's 4-parameter extend_autonomous_reservation
-- =========================================================================
-- CRITICAL: Do NOT drop or replace Phase 3's 4-param version.
-- The 4-param signature (including executor_instance_id) is required for
-- executor ownership enforcement. Phase 3 migration 20260902000001 defines it
-- and this migration must preserve it as-is.
--
-- NOTE: This migration does NOT redefine extend_autonomous_reservation.
-- Phase 3's version (with executor_instance_id parameter and enforcement)
-- is the authoritative, final version.

-- =========================================================================
-- 8. Autonomous Reservation Requests Table (extension idempotency tracking)
-- =========================================================================
DROP TABLE IF EXISTS autonomous_reservation_requests CASCADE;
CREATE TABLE autonomous_reservation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES autonomous_task_runs(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('initial', 'extension')),
  requested_pc INTEGER NOT NULL CHECK (requested_pc > 0),
  success BOOLEAN NOT NULL,
  new_reserved_pc INTEGER,
  available_remaining INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint: same (run_id, request_id) produces one outcome
  UNIQUE (run_id, request_id)
);

CREATE INDEX idx_reservation_requests_run_id ON autonomous_reservation_requests(run_id);

-- RLS: users can see their own and organization runs
ALTER TABLE autonomous_reservation_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS autonomous_reservation_requests_select ON autonomous_reservation_requests;
CREATE POLICY autonomous_reservation_requests_select ON autonomous_reservation_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM autonomous_task_runs
      WHERE id = run_id AND (
        user_id = auth.uid() OR
        (organization_id IS NOT NULL AND (
          is_org_member(organization_id, auth.uid()) OR
          organization_id IN (SELECT id FROM organizations WHERE owner_user_id = auth.uid())
        ))
      )
    )
  );

DROP POLICY IF EXISTS autonomous_reservation_requests_insert ON autonomous_reservation_requests;
CREATE POLICY autonomous_reservation_requests_insert ON autonomous_reservation_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM autonomous_task_runs
      WHERE id = run_id AND (
        user_id = auth.uid() OR
        (organization_id IS NOT NULL AND (
          is_org_member(organization_id, auth.uid()) OR
          organization_id IN (SELECT id FROM organizations WHERE owner_user_id = auth.uid())
        ))
      )
    )
  );

