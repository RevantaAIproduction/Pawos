-- Fix Phase 3: Correct settle_autonomous_task_run_pc to include runtime_version
--
-- Root cause: The settlement RPC (migration 20260903) tries to INSERT without
-- including runtime_version, which is a NOT NULL column in organization_billing_events.
--
-- The RPC has access to v_run.runtime_version from the autonomous_task_runs row,
-- so this migration provides the corrected function.

DROP FUNCTION IF EXISTS settle_autonomous_task_run_pc(UUID, INTEGER);

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

  -- 3. Validate terminal states only
  IF v_run.status NOT IN ('completed', 'failed', 'cancelled', 'abandoned') THEN
    RAISE EXCEPTION 'Cannot settle non-terminal run (status: %)', v_run.status;
  END IF;

  -- 4. Validate actual_pc <= reserved_pc
  IF p_actual_pc > v_run.reserved_pc THEN
    RAISE EXCEPTION 'actual_pc % exceeds reserved_pc %', p_actual_pc, v_run.reserved_pc;
  END IF;

  -- 5. Idempotency check — if already settled, return existing event
  IF v_run.settled_at IS NOT NULL THEN
    SELECT id INTO v_billing_event_id
    FROM organization_billing_events
    WHERE run_id = p_run_id;

    IF v_billing_event_id IS NOT NULL THEN
      RETURN v_billing_event_id;
    END IF;
  END IF;

  -- 6. Calculate refund and prepare wallet updates
  v_original_reserved_pc := v_run.reserved_pc;
  v_unused_pc := v_original_reserved_pc - p_actual_pc;

  v_organization_id := v_run.organization_id;
  v_user_id := v_run.user_id;

  -- 7. Debit charged amount, credit unused amount
  UPDATE organization_task_credits
  SET balance_pc = balance_pc + v_unused_pc,
      balance_reserved = balance_reserved - v_original_reserved_pc
  WHERE organization_id = v_organization_id;

  -- 8. Mark run as settled
  UPDATE autonomous_task_runs
  SET settled_at = NOW(),
      settled_pc = p_actual_pc
  WHERE id = p_run_id;

  -- 9. Create billing event: immutable ledger with actual terminal status
  -- FIXED: Include runtime_version (required) and amount_pc (new Phase 3 column)
  INSERT INTO organization_billing_events (
    id, run_id, organization_id, workspace_id, user_id, ticket_id,
    runtime_version, started_at, completed_at, duration_seconds, status,
    amount_usd, amount_pc, created_at
  ) VALUES (
    gen_random_uuid(),
    p_run_id,
    v_organization_id,
    v_run.workspace_id,
    v_user_id,
    v_run.ticket_id,
    v_run.runtime_version,  -- FIXED: Was missing, required for table
    v_run.started_at,
    NOW(),
    EXTRACT(EPOCH FROM (NOW() - v_run.started_at))::INT,
    v_run.status,
    ROUND(p_actual_pc::NUMERIC / 100, 2),  -- Convert PC to USD ($1 = 100 PC)
    p_actual_pc,  -- Store actual PC charged for audit trail
    NOW()
  ) RETURNING id INTO v_billing_event_id;

  RETURN v_billing_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant explicit 2-parameter signature
GRANT EXECUTE ON FUNCTION settle_autonomous_task_run_pc(UUID, INTEGER) TO authenticated;
