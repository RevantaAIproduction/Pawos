-- Fix Phase 3: Resolve ambiguous "success" column reference in extend_autonomous_reservation
--
-- Root cause: Function RETURNS TABLE with "success" column, and the idempotency check
-- also SELECTs from autonomous_reservation_requests which has a "success" column.
-- PostgreSQL error 42702: Column reference is ambiguous.
--
-- Fix: Use explicit table alias qualification in the SELECT statement.

DROP FUNCTION IF EXISTS extend_autonomous_reservation(UUID, INTEGER, TEXT, UUID);

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
  -- FIXED: Use explicit table alias "arr" to disambiguate "success" column
  SELECT arr.success, arr.new_reserved_pc, arr.available_remaining, arr.error_message
  INTO v_existing_success, v_existing_new_reserved, v_existing_available, v_existing_error
  FROM autonomous_reservation_requests arr
  WHERE arr.run_id = p_run_id AND arr.request_id = p_extension_request_id AND arr.request_type = 'extension'
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

-- Grant explicit 4-parameter signature
GRANT EXECUTE ON FUNCTION extend_autonomous_reservation(UUID, INTEGER, TEXT, UUID) TO authenticated;
