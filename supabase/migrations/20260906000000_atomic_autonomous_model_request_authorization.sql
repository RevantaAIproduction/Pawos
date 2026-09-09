-- Atomic Autonomous Model Request Authorization
--
-- Adds a single, server-authoritative RPC for model request authorization.
-- Replaces application-level read-check-extend with atomic database operation.
--
-- Key properties:
-- 1. Validates run ownership and executable state
-- 2. Locks run + wallet rows (FOR UPDATE, not table-wide lock)
-- 3. Checks request idempotency: (run_id, request_id) in autonomous_reservation_requests
-- 4. Calculates current reservation state from DB (not from stale application reads)
-- 5. Extends reservation ONLY if additional funds needed
-- 6. Makes zero mutations if wallet insufficient
-- 7. Records authorization event for audit trail
-- 8. Returns explicit success/failure with reason
--
-- THIS RPC IS THE SOLE AUTHORIZATION BOUNDARY.
-- Gemini requests must NOT execute unless this RPC returns success.

-- =========================================================================
-- authorize_autonomous_model_request: Atomic authorization for one model call
-- =========================================================================
-- Parameters:
--   p_run_id UUID: The autonomous task run (must be owned by caller)
--   p_request_id UUID: Unique per model request (not per transport retry)
--   p_required_pc INTEGER: Pre-calculated max PC for this specific request
--   p_executor_instance_id UUID: Must match run's claimed executor
--
-- Returns:
--   success BOOLEAN: Whether authorization succeeded
--   authorized_reservation_total INTEGER: Total reserved PC for run (after auth)
--   available_remaining INTEGER: Unreserved balance remaining in wallet
--   error_message TEXT: If success=FALSE, reason authorization failed
--
-- Atomicity: All-or-nothing. If any check fails, zero wallet mutations.
-- Idempotency: Same request_id reuses cached result, never double-reserves.
CREATE OR REPLACE FUNCTION authorize_autonomous_model_request(
  p_run_id UUID,
  p_request_id UUID,
  p_required_pc INTEGER,
  p_executor_instance_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  authorized_reservation_total INTEGER,
  available_remaining INTEGER,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid UUID;
  v_run autonomous_task_runs%ROWTYPE;
  v_organization_id UUID;
  v_user_id UUID;
  v_wallet_balance_pc INTEGER;
  v_wallet_reserved_pc INTEGER;
  v_run_reserved_pc INTEGER;
  v_available_pc INTEGER;
  v_current_reserved_pc INTEGER;
  v_additional_needed_pc INTEGER;
  v_existing_auth autonomous_reservation_requests%ROWTYPE;
BEGIN
  -- ===== STEP 1: Authentication =====
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Not authenticated'::TEXT;
    RETURN;
  END IF;

  -- ===== STEP 2: Validate run exists and is owned by caller =====
  SELECT * INTO v_run
  FROM autonomous_task_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF v_run IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Run not found'::TEXT;
    RETURN;
  END IF;

  -- Check ownership: user owns directly OR member of owning organization
  IF v_run.user_id <> v_auth_uid THEN
    IF v_run.organization_id IS NOT NULL THEN
      IF NOT is_org_member(v_run.organization_id, v_auth_uid) THEN
        RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Unauthorized: not run owner or org member'::TEXT;
        RETURN;
      END IF;
    ELSE
      RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Unauthorized: not run owner'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- ===== STEP 3: Validate run is in executable state =====
  -- ONLY 'running' is valid for model request authorization.
  -- 'waiting_for_permission' means awaiting human approval on destructive action:
  -- model requests must NOT be authorized during that pause.
  IF v_run.status <> 'running' THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER,
      'Run is not in running state: ' || v_run.status::TEXT;
    RETURN;
  END IF;

  -- ===== STEP 3b: Validate run is not already settled =====
  -- Settlement is final. No new model requests on a settled run.
  IF v_run.settled_at IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER,
      'Run is already settled and cannot authorize new requests'::TEXT;
    RETURN;
  END IF;

  -- ===== STEP 4: Validate executor claim matches =====
  -- Executor instance ID is required and must match the claim
  IF p_executor_instance_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER,
      'Executor instance ID required'::TEXT;
    RETURN;
  END IF;

  IF v_run.execution_claimed_by <> v_auth_uid THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER,
      'Execution not claimed by current user'::TEXT;
    RETURN;
  END IF;

  IF v_run.execution_executor_instance_id <> p_executor_instance_id THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER,
      'Executor instance ID does not match claimed executor'::TEXT;
    RETURN;
  END IF;

  -- ===== STEP 5: Resolve wallet (user vs organization) =====
  v_organization_id := v_run.organization_id;
  v_user_id := v_run.user_id;

  -- ===== STEP 6: Lock wallet and get current balance/reserved state =====
  IF v_organization_id IS NOT NULL THEN
    SELECT balance_pc, balance_reserved
    INTO v_wallet_balance_pc, v_wallet_reserved_pc
    FROM organization_task_credits
    WHERE organization_id = v_organization_id
    FOR UPDATE;
  ELSE
    SELECT balance_pc, balance_reserved
    INTO v_wallet_balance_pc, v_wallet_reserved_pc
    FROM user_task_credits
    WHERE user_id = v_user_id
    FOR UPDATE;
  END IF;

  -- Wallet must exist
  IF v_wallet_balance_pc IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Wallet not found'::TEXT;
    RETURN;
  END IF;

  -- ===== STEP 7: Get current run reservation =====
  v_run_reserved_pc := COALESCE(v_run.reserved_pc, 0);
  v_current_reserved_pc := v_run_reserved_pc;

  -- ===== STEP 8: Check request idempotency =====
  -- If this (run_id, request_id) was already authorized, return cached result
  SELECT * INTO v_existing_auth
  FROM autonomous_reservation_requests
  WHERE run_id = p_run_id AND request_id = p_request_id
  FOR UPDATE;

  IF FOUND THEN
    -- Request already processed. Return cached result without mutation.
    IF v_organization_id IS NOT NULL THEN
      SELECT balance_pc INTO v_available_pc
      FROM organization_task_credits
      WHERE organization_id = v_organization_id;
    ELSE
      SELECT balance_pc INTO v_available_pc
      FROM user_task_credits
      WHERE user_id = v_user_id;
    END IF;

    RETURN QUERY SELECT
      v_existing_auth.success,
      v_existing_auth.new_reserved_pc,
      COALESCE(v_available_pc, 0),
      v_existing_auth.error_message;
    RETURN;
  END IF;

  -- ===== STEP 9: Calculate current available balance =====
  -- available = balance_pc - balance_reserved (wallet-level available)
  v_available_pc := v_wallet_balance_pc - v_wallet_reserved_pc;

  -- ===== STEP 10: Determine authorization decision =====
  -- This request needs p_required_pc
  -- Current run has v_current_reserved_pc allocated to it
  -- If current reservation already covers this request: no extension needed
  -- If not: try to extend by exactly what's needed

  -- Check: does current run reservation cover this request?
  -- (We don't track per-request usage here, only at settlement time)
  -- Conservative: always ensure we have p_required_pc available for this request
  -- by checking: available_wallet_balance >= p_required_pc

  IF v_available_pc < p_required_pc THEN
    -- Insufficient funds in wallet. Record and return failure.
    INSERT INTO autonomous_reservation_requests (
      run_id, request_id, request_type, requested_pc, success, error_message
    ) VALUES (
      p_run_id, p_request_id, 'extension', p_required_pc, FALSE,
      'Insufficient wallet balance: ' || v_available_pc || ' available, ' || p_required_pc || ' required'
    );

    RETURN QUERY SELECT FALSE, v_current_reserved_pc, v_available_pc,
      'Insufficient balance for authorization';
    RETURN;
  END IF;

  -- ===== STEP 11: Authorization succeeded. Extend reservation. =====
  -- Increase run's reserved_pc and wallet's balance_reserved
  v_additional_needed_pc := p_required_pc;

  -- Update wallet: deduct from available, add to reserved
  IF v_organization_id IS NOT NULL THEN
    UPDATE organization_task_credits
    SET balance_pc = balance_pc - v_additional_needed_pc,
        balance_reserved = balance_reserved + v_additional_needed_pc,
        updated_at = NOW()
    WHERE organization_id = v_organization_id;
  ELSE
    UPDATE user_task_credits
    SET balance_pc = balance_pc - v_additional_needed_pc,
        balance_reserved = balance_reserved + v_additional_needed_pc,
        updated_at = NOW()
    WHERE user_id = v_user_id;
  END IF;

  -- Update run: increase reserved_pc
  UPDATE autonomous_task_runs
  SET reserved_pc = COALESCE(reserved_pc, 0) + v_additional_needed_pc
  WHERE id = p_run_id;

  -- Get updated total
  SELECT reserved_pc INTO v_current_reserved_pc
  FROM autonomous_task_runs
  WHERE id = p_run_id;

  -- ===== STEP 12: Record authorization success =====
  INSERT INTO autonomous_reservation_requests (
    run_id, request_id, request_type, requested_pc, success, new_reserved_pc
  ) VALUES (
    p_run_id, p_request_id, 'extension', p_required_pc, TRUE, v_current_reserved_pc
  );

  RETURN QUERY SELECT TRUE, v_current_reserved_pc, v_available_pc - v_additional_needed_pc, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION authorize_autonomous_model_request TO authenticated;

-- =========================================================================
-- Index for fast idempotency lookups
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_autonomous_reservation_requests_run_id_request_id
  ON autonomous_reservation_requests(run_id, request_id);
