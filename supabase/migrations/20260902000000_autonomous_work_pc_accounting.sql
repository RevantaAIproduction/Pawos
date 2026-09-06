-- Autonomous Work PC Accounting Model
-- Converts autonomous ticket wallet from fixed per-ticket USD pricing to actual
-- normalized Paw Compute (PC) consumption model with upfront reservation and
-- idempotent extension.
--
-- Key principles:
-- 1. Reservation: estimated PC reserved before execution
-- 2. Extension: idempotent request-based reservation extension during execution
-- 3. Settlement: actual PC charged from normalized usage events
-- 4. Conservation: opening + topups = balance + reserved + settled (always true)

-- =========================================================================
-- 1. Add PC-based accounting columns to autonomous_task_runs
-- =========================================================================
ALTER TABLE autonomous_task_runs ADD COLUMN IF NOT EXISTS reserved_pc INTEGER;
ALTER TABLE autonomous_task_runs ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;
ALTER TABLE autonomous_task_runs ADD COLUMN IF NOT EXISTS settled_pc INTEGER;

-- Index for settlement lookups
CREATE INDEX IF NOT EXISTS idx_autonomous_task_runs_settled
  ON autonomous_task_runs(settled_at);

-- =========================================================================
-- 2. Add PC-based balance and reserved balance tracking to wallet tables
-- =========================================================================

-- 2a. Add balance_pc (nullable first for safe backfill)
ALTER TABLE user_task_credits ADD COLUMN IF NOT EXISTS balance_pc INTEGER;
ALTER TABLE organization_task_credits ADD COLUMN IF NOT EXISTS balance_pc INTEGER;

-- 2b. Backfill balance_pc from balance_usd (legacy→PC conversion)
-- $1 USD = 100 PC; numeric(10,2) dollars*100 maps exactly to integer PC
-- Only for rows where balance_pc is still NULL (not already migrated)
UPDATE user_task_credits
SET balance_pc = (COALESCE(balance_usd, 0) * 100)::INTEGER
WHERE balance_pc IS NULL;

UPDATE organization_task_credits
SET balance_pc = (COALESCE(balance_usd, 0) * 100)::INTEGER
WHERE balance_pc IS NULL;

-- 2c. Make balance_pc NOT NULL with default 0 for future rows
ALTER TABLE user_task_credits ALTER COLUMN balance_pc SET NOT NULL;
ALTER TABLE user_task_credits ALTER COLUMN balance_pc SET DEFAULT 0;
ALTER TABLE organization_task_credits ALTER COLUMN balance_pc SET NOT NULL;
ALTER TABLE organization_task_credits ALTER COLUMN balance_pc SET DEFAULT 0;

-- 2d. Add reserved balance tracking
ALTER TABLE user_task_credits ADD COLUMN IF NOT EXISTS balance_reserved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organization_task_credits ADD COLUMN IF NOT EXISTS balance_reserved INTEGER NOT NULL DEFAULT 0;

-- =========================================================================
-- 3. Reservation request idempotency table
-- =========================================================================
CREATE TABLE IF NOT EXISTS autonomous_reservation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES autonomous_task_runs(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  request_type VARCHAR(20) NOT NULL CHECK (request_type IN ('initial', 'extension')),
  requested_pc INTEGER NOT NULL,
  success BOOLEAN NOT NULL,
  new_reserved_pc INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(run_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_reservation_requests_run
  ON autonomous_reservation_requests(run_id);

-- =========================================================================
-- 4. Reserve initial autonomous PC
-- =========================================================================
CREATE OR REPLACE FUNCTION reserve_autonomous_pc(
  p_run_id UUID,
  p_estimated_pc INTEGER,
  p_request_id UUID
)
RETURNS TABLE(
  success BOOLEAN,
  reserved_pc INTEGER,
  available_remaining INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_organization_id UUID;
  v_user_id UUID;
  v_available_pc INTEGER;
  v_run_row autonomous_task_runs%ROWTYPE;
BEGIN
  -- 1. Verify run ownership and get wallet location
  SELECT * INTO v_run_row
  FROM autonomous_task_runs
  WHERE id = p_run_id;

  IF v_run_row.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Run not found'::TEXT;
    RETURN;
  END IF;

  -- 2. Verify authorization
  IF v_run_row.user_id <> auth.uid() THEN
    IF v_run_row.organization_id IS NOT NULL THEN
      IF NOT is_org_member(v_run_row.organization_id, auth.uid()) THEN
        RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Unauthorized'::TEXT;
        RETURN;
      END IF;
    ELSE
      RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Unauthorized'::TEXT;
      RETURN;
    END IF;
  END IF;

  v_organization_id := v_run_row.organization_id;
  v_user_id := v_run_row.user_id;

  -- 3. Idempotency check
  DECLARE
    v_existing autonomous_reservation_requests%ROWTYPE;
  BEGIN
    SELECT * INTO v_existing FROM autonomous_reservation_requests
    WHERE run_id = p_run_id AND request_id = p_request_id
    FOR UPDATE;

    IF FOUND THEN
      -- Return cached result
      IF v_organization_id IS NOT NULL THEN
        SELECT balance_pc INTO v_available_pc
        FROM organization_task_credits
        WHERE organization_id = v_organization_id;
      ELSE
        SELECT balance_pc INTO v_available_pc
        FROM user_task_credits
        WHERE user_id = v_user_id;
      END IF;

      RETURN QUERY SELECT v_existing.success, v_existing.new_reserved_pc, v_available_pc, v_existing.error_message;
      RETURN;
    END IF;
  END;

  -- 4. Lock and check wallet
  IF v_organization_id IS NOT NULL THEN
    SELECT balance_pc INTO v_available_pc
    FROM organization_task_credits
    WHERE organization_id = v_organization_id
    FOR UPDATE;
  ELSE
    SELECT balance_pc INTO v_available_pc
    FROM user_task_credits
    WHERE user_id = v_user_id
    FOR UPDATE;
  END IF;

  -- 5. Check sufficiency
  IF COALESCE(v_available_pc, 0) < p_estimated_pc THEN
    INSERT INTO autonomous_reservation_requests(
      run_id, request_id, request_type, requested_pc, success, error_message
    ) VALUES (
      p_run_id, p_request_id, 'initial', p_estimated_pc, FALSE,
      'Insufficient balance: ' || COALESCE(v_available_pc, 0) || ' available, ' || p_estimated_pc || ' requested'
    );
    RETURN QUERY SELECT FALSE, NULL::INTEGER, COALESCE(v_available_pc, 0),
      'Insufficient balance'::TEXT;
    RETURN;
  END IF;

  -- 6. Mutate wallet: deduct from available, add to reserved
  IF v_organization_id IS NOT NULL THEN
    UPDATE organization_task_credits
    SET balance_pc = balance_pc - p_estimated_pc,
        balance_reserved = balance_reserved + p_estimated_pc,
        updated_at = NOW()
    WHERE organization_id = v_organization_id;
  ELSE
    UPDATE user_task_credits
    SET balance_pc = balance_pc - p_estimated_pc,
        balance_reserved = balance_reserved + p_estimated_pc,
        updated_at = NOW()
    WHERE user_id = v_user_id;
  END IF;

  -- 7. Update run
  UPDATE autonomous_task_runs
  SET reserved_pc = p_estimated_pc
  WHERE id = p_run_id;

  -- 8. Record success
  INSERT INTO autonomous_reservation_requests(
    run_id, request_id, request_type, requested_pc, success, new_reserved_pc
  ) VALUES (
    p_run_id, p_request_id, 'initial', p_estimated_pc, TRUE, p_estimated_pc
  );

  RETURN QUERY SELECT TRUE, p_estimated_pc, v_available_pc - p_estimated_pc, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 5. Extend autonomous PC reservation (idempotent by request_id)
-- =========================================================================
CREATE OR REPLACE FUNCTION extend_autonomous_reservation(
  p_run_id UUID,
  p_additional_pc INTEGER,
  p_extension_request_id UUID
)
RETURNS TABLE(
  success BOOLEAN,
  new_reserved_total INTEGER,
  available_remaining INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_organization_id UUID;
  v_user_id UUID;
  v_available_pc INTEGER;
  v_run_row autonomous_task_runs%ROWTYPE;
BEGIN
  -- 1. Get run and wallet location
  SELECT * INTO v_run_row
  FROM autonomous_task_runs
  WHERE id = p_run_id;

  IF v_run_row.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Run not found'::TEXT;
    RETURN;
  END IF;

  v_organization_id := v_run_row.organization_id;
  v_user_id := v_run_row.user_id;

  -- 2. Idempotency check
  DECLARE
    v_existing autonomous_reservation_requests%ROWTYPE;
  BEGIN
    SELECT * INTO v_existing FROM autonomous_reservation_requests
    WHERE run_id = p_run_id AND request_id = p_extension_request_id
    FOR UPDATE;

    IF FOUND THEN
      -- Return cached result
      IF v_organization_id IS NOT NULL THEN
        SELECT balance_pc INTO v_available_pc
        FROM organization_task_credits
        WHERE organization_id = v_organization_id;
      ELSE
        SELECT balance_pc INTO v_available_pc
        FROM user_task_credits
        WHERE user_id = v_user_id;
      END IF;

      RETURN QUERY SELECT v_existing.success, v_existing.new_reserved_pc, v_available_pc, v_existing.error_message;
      RETURN;
    END IF;
  END;

  -- 3. Lock and check wallet
  IF v_organization_id IS NOT NULL THEN
    SELECT balance_pc INTO v_available_pc
    FROM organization_task_credits
    WHERE organization_id = v_organization_id
    FOR UPDATE;
  ELSE
    SELECT balance_pc INTO v_available_pc
    FROM user_task_credits
    WHERE user_id = v_user_id
    FOR UPDATE;
  END IF;

  -- 4. Check sufficiency
  IF COALESCE(v_available_pc, 0) < p_additional_pc THEN
    INSERT INTO autonomous_reservation_requests(
      run_id, request_id, request_type, requested_pc, success, error_message
    ) VALUES (
      p_run_id, p_extension_request_id, 'extension', p_additional_pc, FALSE,
      'Insufficient balance for extension'
    );
    RETURN QUERY SELECT FALSE, NULL::INTEGER, COALESCE(v_available_pc, 0),
      'Insufficient balance'::TEXT;
    RETURN;
  END IF;

  -- 5. Mutate wallet and run
  IF v_organization_id IS NOT NULL THEN
    UPDATE organization_task_credits
    SET balance_pc = balance_pc - p_additional_pc,
        balance_reserved = balance_reserved + p_additional_pc,
        updated_at = NOW()
    WHERE organization_id = v_organization_id;
  ELSE
    UPDATE user_task_credits
    SET balance_pc = balance_pc - p_additional_pc,
        balance_reserved = balance_reserved + p_additional_pc,
        updated_at = NOW()
    WHERE user_id = v_user_id;
  END IF;

  UPDATE autonomous_task_runs
  SET reserved_pc = COALESCE(reserved_pc, 0) + p_additional_pc
  WHERE id = p_run_id;

  -- 6. Record success
  DECLARE
    v_new_reserved INTEGER;
  BEGIN
    SELECT reserved_pc INTO v_new_reserved FROM autonomous_task_runs WHERE id = p_run_id;

    INSERT INTO autonomous_reservation_requests(
      run_id, request_id, request_type, requested_pc, success, new_reserved_pc
    ) VALUES (
      p_run_id, p_extension_request_id, 'extension', p_additional_pc, TRUE, v_new_reserved
    );

    RETURN QUERY SELECT TRUE, v_new_reserved, v_available_pc - p_additional_pc, NULL::TEXT;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 6. Settle autonomous task run (actual PC charge)
-- =========================================================================
CREATE OR REPLACE FUNCTION settle_autonomous_task_run_pc(
  p_run_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_run autonomous_task_runs%ROWTYPE;
  v_billing_event_id UUID;
  v_organization_id UUID;
  v_user_id UUID;
  v_actual_pc_used INTEGER;
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

  -- 4. Verify state: must be in a terminal state or running/waiting
  IF v_run.status NOT IN ('running', 'waiting_for_permission', 'completed', 'failed', 'cancelled', 'abandoned') THEN
    RAISE EXCEPTION 'Run % is in invalid state % for settlement', p_run_id, v_run.status;
  END IF;

  -- 5. Calculate actual PC used from immutable usage events
  SELECT COALESCE(SUM(normalized_compute), 0) INTO v_actual_pc_used
  FROM usage_events
  WHERE run_id = p_run_id;

  -- 6. Get original reservation
  v_original_reserved_pc := COALESCE(v_run.reserved_pc, 0);

  -- 7. Calculate unused reservation
  v_unused_pc := v_original_reserved_pc - v_actual_pc_used;

  IF v_unused_pc < 0 THEN
    RAISE EXCEPTION 'Data integrity error: run % consumed % PC but only % was reserved',
      p_run_id, v_actual_pc_used, v_original_reserved_pc;
  END IF;

  -- 8. Get wallet location
  v_organization_id := v_run.organization_id;
  v_user_id := v_run.user_id;

  -- 9. Settlement transaction: release unused, mark settled
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

  -- 10. Update run: mark as financially settled (preserve execution status)
  UPDATE autonomous_task_runs
  SET settled_at = NOW(),
      settled_pc = v_actual_pc_used
  WHERE id = p_run_id;

  -- 11. Create billing event: immutable ledger with actual terminal status
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
    ROUND(v_actual_pc_used::NUMERIC / 100, 2),
    v_actual_pc_used,
    NOW()
  ) RETURNING id INTO v_billing_event_id;

  RETURN v_billing_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 7. Audit trail
-- =========================================================================
CREATE TRIGGER trg_audit_autonomous_reservation_requests
  AFTER INSERT ON autonomous_reservation_requests
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();
