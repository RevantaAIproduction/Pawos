-- Phase 3: Execution Identity, Settlement Refinement, and Resume Logic
--
-- Completes the autonomous work PC accounting system with:
-- 1. Execution identity columns (claimed_by, executor_instance_id, claim_request_id)
-- 2. Execution lifecycle tracking (started_at, completed_at)
-- 3. Orchestration input storage
-- 4. Four new RPCs for execution lifecycle management
-- 5. Updated extend_autonomous_reservation with executor_instance_id verification
-- 6. Complete settle_autonomous_task_run_pc with full authentication and validation

-- =========================================================================
-- 1. Add execution identity columns to autonomous_task_runs
-- =========================================================================
ALTER TABLE autonomous_task_runs ADD COLUMN IF NOT EXISTS execution_claimed_by UUID;
ALTER TABLE autonomous_task_runs ADD COLUMN IF NOT EXISTS execution_claimed_at TIMESTAMPTZ;
ALTER TABLE autonomous_task_runs ADD COLUMN IF NOT EXISTS execution_executor_instance_id UUID;
ALTER TABLE autonomous_task_runs ADD COLUMN IF NOT EXISTS execution_claim_request_id TEXT;
ALTER TABLE autonomous_task_runs ADD COLUMN IF NOT EXISTS execution_started_at TIMESTAMPTZ;
ALTER TABLE autonomous_task_runs ADD COLUMN IF NOT EXISTS execution_completed_at TIMESTAMPTZ;
ALTER TABLE autonomous_task_runs ADD COLUMN IF NOT EXISTS orchestration_input JSONB;

-- =========================================================================
-- 2. Create indices for execution columns
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_autonomous_task_runs_execution_claimed_by
  ON autonomous_task_runs(execution_claimed_by);

CREATE INDEX IF NOT EXISTS idx_autonomous_task_runs_execution_started_at
  ON autonomous_task_runs(execution_started_at);

CREATE INDEX IF NOT EXISTS idx_autonomous_task_runs_execution_claim_request_id
  ON autonomous_task_runs(execution_claim_request_id);

-- =========================================================================
-- 3. mark_autonomous_execution_started: Mark execution began (idempotent)
-- =========================================================================
CREATE OR REPLACE FUNCTION mark_autonomous_execution_started(
  p_run_id UUID,
  p_executor_instance_id UUID
)
RETURNS autonomous_task_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run autonomous_task_runs%ROWTYPE;
  v_auth_uid UUID;
BEGIN
  -- 1. Verify authenticated
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Lock and fetch run
  SELECT * INTO v_run
  FROM autonomous_task_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF v_run IS NULL THEN
    RAISE EXCEPTION 'Run % not found', p_run_id;
  END IF;

  -- 3. Verify authorization: user owns run
  IF v_run.user_id <> v_auth_uid THEN
    IF v_run.organization_id IS NOT NULL THEN
      IF NOT is_org_member(v_run.organization_id, v_auth_uid) THEN
        RAISE EXCEPTION 'Unauthorized: not run owner or org member';
      END IF;
    ELSE
      RAISE EXCEPTION 'Unauthorized: not run owner';
    END IF;
  END IF;

  -- 4. Verify claim matches: only claimed executor can mark started
  IF v_run.execution_claimed_by IS NOT NULL THEN
    IF v_run.execution_claimed_by <> v_auth_uid THEN
      RAISE EXCEPTION 'Execution claim owned by different user';
    END IF;
    IF v_run.execution_executor_instance_id <> p_executor_instance_id THEN
      RAISE EXCEPTION 'Executor instance ID does not match claim';
    END IF;
  END IF;

  -- 5. Idempotency: if already started, return existing run
  IF v_run.execution_started_at IS NOT NULL THEN
    RETURN v_run;
  END IF;

  -- 6. Update run: mark execution started
  UPDATE autonomous_task_runs
  SET execution_started_at = NOW(),
      updated_at = NOW()
  WHERE id = p_run_id;

  -- 7. Return updated run
  SELECT * INTO v_run FROM autonomous_task_runs WHERE id = p_run_id;
  RETURN v_run;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_autonomous_execution_started TO authenticated;

-- =========================================================================
-- 4. mark_autonomous_execution_completed: Mark execution terminal (idempotent)
-- =========================================================================
CREATE OR REPLACE FUNCTION mark_autonomous_execution_completed(
  p_run_id UUID,
  p_terminal_status TEXT,
  p_executor_instance_id UUID
)
RETURNS autonomous_task_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run autonomous_task_runs%ROWTYPE;
  v_auth_uid UUID;
BEGIN
  -- 1. Verify authenticated
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Lock and fetch run
  SELECT * INTO v_run
  FROM autonomous_task_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF v_run IS NULL THEN
    RAISE EXCEPTION 'Run % not found', p_run_id;
  END IF;

  -- 3. Verify authorization: user owns run
  IF v_run.user_id <> v_auth_uid THEN
    IF v_run.organization_id IS NOT NULL THEN
      IF NOT is_org_member(v_run.organization_id, v_auth_uid) THEN
        RAISE EXCEPTION 'Unauthorized: not run owner or org member';
      END IF;
    ELSE
      RAISE EXCEPTION 'Unauthorized: not run owner';
    END IF;
  END IF;

  -- 4. Verify claim matches
  IF v_run.execution_claimed_by <> v_auth_uid THEN
    RAISE EXCEPTION 'Execution claim owned by different user';
  END IF;
  IF v_run.execution_executor_instance_id <> p_executor_instance_id THEN
    RAISE EXCEPTION 'Executor instance ID does not match claim';
  END IF;

  -- 5. Idempotency: if already completed, return existing run
  IF v_run.execution_completed_at IS NOT NULL THEN
    RETURN v_run;
  END IF;

  -- 6. Validate target status is terminal
  IF p_terminal_status NOT IN ('completed', 'failed', 'abandoned', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid terminal status: %', p_terminal_status;
  END IF;

  -- 7. Update run: mark execution completed
  UPDATE autonomous_task_runs
  SET execution_completed_at = NOW(),
      status = p_terminal_status,
      completed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_run_id;

  -- 8. Return updated run
  SELECT * INTO v_run FROM autonomous_task_runs WHERE id = p_run_id;
  RETURN v_run;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_autonomous_execution_completed TO authenticated;

-- =========================================================================
-- 5. transition_to_waiting_for_topup: Release claim, pause for funding
-- =========================================================================
CREATE OR REPLACE FUNCTION transition_to_waiting_for_topup(
  p_run_id UUID
)
RETURNS autonomous_task_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run autonomous_task_runs%ROWTYPE;
  v_auth_uid UUID;
BEGIN
  -- 1. Verify authenticated
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Lock and fetch run
  SELECT * INTO v_run
  FROM autonomous_task_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF v_run IS NULL THEN
    RAISE EXCEPTION 'Run % not found', p_run_id;
  END IF;

  -- 3. Verify authorization: user owns run
  IF v_run.user_id <> v_auth_uid THEN
    IF v_run.organization_id IS NOT NULL THEN
      IF NOT is_org_member(v_run.organization_id, v_auth_uid) THEN
        RAISE EXCEPTION 'Unauthorized: not run owner or org member';
      END IF;
    ELSE
      RAISE EXCEPTION 'Unauthorized: not run owner';
    END IF;
  END IF;

  -- 4. Verify claim exists before release
  IF v_run.execution_claimed_by IS NULL THEN
    RAISE EXCEPTION 'Run % has no active claim to release', p_run_id;
  END IF;

  -- 5. Idempotency: if already in waiting_for_topup, accept and return
  IF v_run.status = 'waiting_for_topup' AND v_run.execution_claimed_by IS NULL THEN
    RETURN v_run;
  END IF;

  -- 6. Release claim (set to NULL), transition to waiting_for_topup
  UPDATE autonomous_task_runs
  SET status = 'waiting_for_topup',
      execution_claimed_by = NULL,
      execution_claimed_at = NULL,
      execution_executor_instance_id = NULL,
      execution_claim_request_id = NULL,
      updated_at = NOW()
  WHERE id = p_run_id;

  -- 7. Return updated run
  SELECT * INTO v_run FROM autonomous_task_runs WHERE id = p_run_id;
  RETURN v_run;
END;
$$;

GRANT EXECUTE ON FUNCTION transition_to_waiting_for_topup TO authenticated;

-- =========================================================================
-- 6. resume_and_claim_autonomous_run: Resume after top-up + fresh claim
-- =========================================================================
CREATE OR REPLACE FUNCTION resume_and_claim_autonomous_run(
  p_run_id UUID,
  p_resume_request_id TEXT
)
RETURNS TABLE (
  run_id UUID,
  execution_claimed_by UUID,
  execution_executor_instance_id UUID,
  execution_claim_request_id TEXT,
  status TEXT,
  reserved_pc INTEGER,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run autonomous_task_runs%ROWTYPE;
  v_auth_uid UUID;
  v_new_executor_instance_id UUID;
BEGIN
  -- 1. Verify authenticated
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Lock and fetch run
  SELECT * INTO v_run
  FROM autonomous_task_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF v_run IS NULL THEN
    RETURN QUERY SELECT
      p_run_id,
      NULL::UUID,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      NULL::INTEGER,
      'Run not found'::TEXT;
    RETURN;
  END IF;

  -- 3. Verify authorization: user owns run
  IF v_run.user_id <> v_auth_uid THEN
    IF v_run.organization_id IS NOT NULL THEN
      IF NOT is_org_member(v_run.organization_id, v_auth_uid) THEN
        RETURN QUERY SELECT
          p_run_id,
          NULL::UUID,
          NULL::UUID,
          NULL::TEXT,
          NULL::TEXT,
          NULL::INTEGER,
          'Unauthorized: not run owner or org member'::TEXT;
        RETURN;
      END IF;
    ELSE
      RETURN QUERY SELECT
        p_run_id,
        NULL::UUID,
        NULL::UUID,
        NULL::TEXT,
        NULL::TEXT,
        NULL::INTEGER,
        'Unauthorized: not run owner'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 4. Idempotency check: if already claimed with same request_id, return existing
  IF v_run.execution_claimed_by IS NOT NULL AND v_run.execution_claim_request_id = p_resume_request_id THEN
    RETURN QUERY SELECT
      p_run_id,
      v_run.execution_claimed_by,
      v_run.execution_executor_instance_id,
      v_run.execution_claim_request_id,
      v_run.status,
      v_run.reserved_pc,
      NULL::TEXT;
    RETURN;
  END IF;

  -- 5. Verify run is in waiting_for_topup state
  IF v_run.status <> 'waiting_for_topup' THEN
    RETURN QUERY SELECT
      p_run_id,
      NULL::UUID,
      NULL::UUID,
      NULL::TEXT,
      v_run.status,
      v_run.reserved_pc,
      'Run is not in waiting_for_topup state'::TEXT;
    RETURN;
  END IF;

  -- 6. Verify no active claim exists
  IF v_run.execution_claimed_by IS NOT NULL THEN
    RETURN QUERY SELECT
      p_run_id,
      v_run.execution_claimed_by,
      v_run.execution_executor_instance_id,
      v_run.execution_claim_request_id,
      v_run.status,
      v_run.reserved_pc,
      'Run already has active claim'::TEXT;
    RETURN;
  END IF;

  -- 7. Generate fresh executor instance ID
  v_new_executor_instance_id := gen_random_uuid();

  -- 8. Update run: claim execution + transition to running
  UPDATE autonomous_task_runs
  SET execution_claimed_by = v_auth_uid,
      execution_claimed_at = NOW(),
      execution_executor_instance_id = v_new_executor_instance_id,
      execution_claim_request_id = p_resume_request_id,
      status = 'running',
      updated_at = NOW()
  WHERE id = p_run_id;

  -- 9. Return success with new claim details
  RETURN QUERY SELECT
    p_run_id,
    v_auth_uid,
    v_new_executor_instance_id,
    p_resume_request_id,
    'running'::TEXT,
    v_run.reserved_pc,
    NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION resume_and_claim_autonomous_run TO authenticated;

-- =========================================================================
-- 7. REPLACE extend_autonomous_reservation with executor_instance_id param
-- =========================================================================
-- Drop the 3-parameter version from 20260902000000 (which takes UUID for extension_request_id)
DROP FUNCTION IF EXISTS extend_autonomous_reservation(UUID, INTEGER, UUID);
CREATE OR REPLACE FUNCTION extend_autonomous_reservation(
  p_run_id UUID,
  p_additional_pc INTEGER,
  p_extension_request_id TEXT,
  p_executor_instance_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  new_reserved_total INTEGER,
  available_remaining INTEGER,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run autonomous_task_runs%ROWTYPE;
  v_organization_id UUID;
  v_user_id UUID;
  v_current_balance_pc INTEGER;
  v_current_reserved INTEGER;
  v_existing_success BOOLEAN;
  v_existing_new_reserved INTEGER;
  v_existing_available INTEGER;
  v_existing_error TEXT;
  v_auth_uid UUID;
BEGIN
  -- 1. Verify authenticated
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Lock and fetch run
  SELECT * INTO v_run
  FROM autonomous_task_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF v_run IS NULL THEN
    RETURN QUERY SELECT false, null::INTEGER, null::INTEGER, 'Run not found or no permission'::TEXT;
    RETURN;
  END IF;

  v_organization_id := v_run.organization_id;
  v_user_id := v_run.user_id;
  v_current_reserved := COALESCE(v_run.reserved_pc, 0);

  -- 3. Verify authorization: user owns run
  IF v_run.user_id <> v_auth_uid THEN
    IF v_run.organization_id IS NOT NULL THEN
      IF NOT is_org_member(v_run.organization_id, v_auth_uid) THEN
        RETURN QUERY SELECT false, null::INTEGER, null::INTEGER, 'Unauthorized'::TEXT;
        RETURN;
      END IF;
    ELSE
      RETURN QUERY SELECT false, null::INTEGER, null::INTEGER, 'Unauthorized'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 4. Verify executor instance matches claim
  IF v_run.execution_executor_instance_id <> p_executor_instance_id THEN
    RETURN QUERY SELECT false, v_current_reserved, null::INTEGER, 'Executor instance ID does not match claim'::TEXT;
    RETURN;
  END IF;

  -- 5. Check if this exact extension request was already processed (idempotency)
  SELECT success, new_reserved_pc, available_remaining, error_message
  INTO v_existing_success, v_existing_new_reserved, v_existing_available, v_existing_error
  FROM autonomous_reservation_requests
  WHERE run_id = p_run_id AND request_id = p_extension_request_id AND request_type = 'extension'
  LIMIT 1;

  IF FOUND THEN
    -- Return previous outcome (idempotent)
    RETURN QUERY SELECT v_existing_success, v_existing_new_reserved, v_existing_available, v_existing_error;
    RETURN;
  END IF;

  -- 6. Check wallet balance
  IF v_organization_id IS NOT NULL THEN
    SELECT balance_pc INTO v_current_balance_pc
    FROM organization_task_credits
    WHERE organization_id = v_organization_id
    FOR UPDATE;

    IF v_current_balance_pc IS NULL OR v_current_balance_pc < p_additional_pc THEN
      -- Record failure
      INSERT INTO autonomous_reservation_requests (run_id, request_id, request_type, requested_pc, success, available_remaining, error_message)
      VALUES (p_run_id, p_extension_request_id, 'extension', p_additional_pc, false, COALESCE(v_current_balance_pc, 0), 'Insufficient Autonomous Work PC balance for extension')
      ON CONFLICT (run_id, request_id) DO NOTHING;

      RETURN QUERY SELECT false, v_current_reserved, COALESCE(v_current_balance_pc, 0), 'Insufficient Autonomous Work PC balance for extension'::TEXT;
      RETURN;
    END IF;

    -- Deduct from available balance, add to reserved
    UPDATE organization_task_credits
    SET balance_pc = balance_pc - p_additional_pc,
        balance_reserved = COALESCE(balance_reserved, 0) + p_additional_pc,
        updated_at = NOW()
    WHERE organization_id = v_organization_id;
  ELSE
    SELECT balance_pc INTO v_current_balance_pc
    FROM user_task_credits
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF v_current_balance_pc IS NULL OR v_current_balance_pc < p_additional_pc THEN
      -- Record failure
      INSERT INTO autonomous_reservation_requests (run_id, request_id, request_type, requested_pc, success, available_remaining, error_message)
      VALUES (p_run_id, p_extension_request_id, 'extension', p_additional_pc, false, COALESCE(v_current_balance_pc, 0), 'Insufficient Autonomous Work PC balance for extension')
      ON CONFLICT (run_id, request_id) DO NOTHING;

      RETURN QUERY SELECT false, v_current_reserved, COALESCE(v_current_balance_pc, 0), 'Insufficient Autonomous Work PC balance for extension'::TEXT;
      RETURN;
    END IF;

    UPDATE user_task_credits
    SET balance_pc = balance_pc - p_additional_pc,
        balance_reserved = COALESCE(balance_reserved, 0) + p_additional_pc,
        updated_at = NOW()
    WHERE user_id = v_user_id;
  END IF;

  -- 7. Update run's reserved amount
  UPDATE autonomous_task_runs
  SET reserved_pc = COALESCE(reserved_pc, 0) + p_additional_pc
  WHERE id = p_run_id;

  -- 8. Record success
  INSERT INTO autonomous_reservation_requests (run_id, request_id, request_type, requested_pc, success, new_reserved_pc, available_remaining)
  VALUES (p_run_id, p_extension_request_id, 'extension', p_additional_pc, true, (v_current_reserved + p_additional_pc), (COALESCE(v_current_balance_pc, 0) - p_additional_pc))
  ON CONFLICT (run_id, request_id) DO NOTHING;

  -- 9. Return success with new totals
  RETURN QUERY SELECT
    true,
    (v_current_reserved + p_additional_pc)::INTEGER,
    (COALESCE(v_current_balance_pc, 0) - p_additional_pc)::INTEGER,
    null::TEXT;
END;
$$;

-- Grant explicit 4-parameter signature to avoid ambiguity with removed 3-param overload
GRANT EXECUTE ON FUNCTION extend_autonomous_reservation(UUID, INTEGER, TEXT, UUID) TO authenticated;

-- =========================================================================
-- 8. REPLACE settle_autonomous_task_run_pc with complete v3.1 SQL
-- =========================================================================
-- Drop the 1-parameter version from 20260902000000 (which takes UUID for run_id only)
DROP FUNCTION IF EXISTS settle_autonomous_task_run_pc(UUID);
CREATE OR REPLACE FUNCTION settle_autonomous_task_run_pc(
  p_run_id UUID,
  p_actual_pc INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run autonomous_task_runs%ROWTYPE;
  v_billing_event_id UUID;
  v_organization_id UUID;
  v_user_id UUID;
  v_reserved_pc INTEGER;
  v_unused_pc INTEGER;
  v_auth_uid UUID;
BEGIN
  -- 1. Verify authenticated
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Validate p_actual_pc (untrusted caller input)
  IF p_actual_pc IS NULL THEN
    RAISE EXCEPTION 'actual_pc is required';
  END IF;

  IF p_actual_pc < 0 THEN
    RAISE EXCEPTION 'actual_pc must be non-negative';
  END IF;

  -- 3. Lock and fetch run
  SELECT * INTO v_run
  FROM autonomous_task_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF v_run IS NULL THEN
    RAISE EXCEPTION 'Run % not found', p_run_id;
  END IF;

  -- 4. Verify authorization: user owns run
  IF v_run.user_id <> v_auth_uid THEN
    IF v_run.organization_id IS NOT NULL THEN
      IF NOT is_org_member(v_run.organization_id, v_auth_uid) THEN
        RAISE EXCEPTION 'Unauthorized: not run owner or org member';
      END IF;
    ELSE
      RAISE EXCEPTION 'Unauthorized: not run owner';
    END IF;
  END IF;

  v_organization_id := v_run.organization_id;
  v_user_id := v_run.user_id;

  -- 5. Settlement idempotency: if already settled, return cached billing_event_id
  IF v_run.settled_at IS NOT NULL THEN
    -- Run already settled; return the existing billing event
    SELECT id INTO v_billing_event_id
    FROM organization_billing_events
    WHERE run_id = p_run_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_billing_event_id IS NOT NULL THEN
      RETURN v_billing_event_id;
    ELSE
      RAISE EXCEPTION 'Run % already settled but no billing event found', p_run_id;
    END IF;
  END IF;

  -- 6. Verify run eligibility for settlement
  IF v_run.status NOT IN ('completed', 'failed', 'abandoned', 'blocked', 'running', 'waiting_for_permission', 'waiting_for_topup') THEN
    RAISE EXCEPTION 'Run % is in invalid state % for settlement', p_run_id, v_run.status;
  END IF;

  -- 7. Get original reservation
  v_reserved_pc := COALESCE(v_run.reserved_pc, 0);

  -- 8. Validate actual_pc against reservation (untrusted input verification)
  IF p_actual_pc > v_reserved_pc THEN
    RAISE EXCEPTION 'Data integrity error: run % tried to settle % PC but only % was reserved',
      p_run_id, p_actual_pc, v_reserved_pc;
  END IF;

  -- 9. Calculate unused PC to be released
  v_unused_pc := v_reserved_pc - p_actual_pc;

  -- 10. Lock wallet FOR UPDATE
  IF v_organization_id IS NOT NULL THEN
    -- Organization wallet
    PERFORM 1
    FROM organization_task_credits
    WHERE organization_id = v_organization_id
    FOR UPDATE;

    -- 11. Release entire reservation, return unused to balance_pc
    UPDATE organization_task_credits
    SET balance_pc = balance_pc + v_unused_pc,
        balance_reserved = balance_reserved - v_reserved_pc,
        updated_at = NOW()
    WHERE organization_id = v_organization_id;
  ELSE
    -- User wallet
    PERFORM 1
    FROM user_task_credits
    WHERE user_id = v_user_id
    FOR UPDATE;

    UPDATE user_task_credits
    SET balance_pc = balance_pc + v_unused_pc,
        balance_reserved = balance_reserved - v_reserved_pc,
        updated_at = NOW()
    WHERE user_id = v_user_id;
  END IF;

  -- 12. Update run: mark as financially settled
  UPDATE autonomous_task_runs
  SET settled_at = NOW(),
      settled_pc = p_actual_pc,
      updated_at = NOW()
  WHERE id = p_run_id;

  -- 13. Create immutable billing event (exactly once, never again for this run)
  INSERT INTO organization_billing_events (
    run_id,
    organization_id,
    workspace_id,
    user_id,
    ticket_id,
    runtime_version,
    started_at,
    completed_at,
    duration_seconds,
    status,
    event_type,
    amount_usd,
    amount_pc,
    invoice_reference,
    created_at
  ) VALUES (
    p_run_id,
    v_organization_id,
    v_run.workspace_id,
    v_user_id,
    v_run.ticket_id,
    v_run.runtime_version,
    v_run.started_at,
    NOW(),
    EXTRACT(EPOCH FROM (NOW() - v_run.started_at))::INTEGER,
    v_run.status,  -- PRESERVE actual execution terminal state
    'autonomous_work_pc',  -- event_type distinguishes from legacy autonomous_engineering_task
    ROUND(p_actual_pc::NUMERIC / 100, 2),  -- USD = PC / 100
    p_actual_pc,  -- amount_pc field (new for autonomous PC model)
    NULL,  -- invoice_reference (optional)
    NOW()
  )
  RETURNING id INTO v_billing_event_id;

  -- 14. Return the created billing event ID
  RETURN v_billing_event_id;
END;
$$;

-- Grant explicit 2-parameter signature to avoid ambiguity with the dropped 1-parameter version
GRANT EXECUTE ON FUNCTION settle_autonomous_task_run_pc(UUID, INTEGER) TO authenticated;

-- =========================================================================
-- 9. Audit triggers for execution lifecycle
-- =========================================================================
CREATE TRIGGER trg_audit_execution_claim
  AFTER UPDATE OF execution_claimed_by ON autonomous_task_runs
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

CREATE TRIGGER trg_audit_execution_started
  AFTER UPDATE OF execution_started_at ON autonomous_task_runs
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

CREATE TRIGGER trg_audit_execution_completed
  AFTER UPDATE OF execution_completed_at ON autonomous_task_runs
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();
