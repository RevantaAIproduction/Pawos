-- Phase 2C: Server-Authoritative Executor Claim
--
-- Eliminates client-side crypto.randomUUID() as executor authority.
-- Server generates and persists executor_instance_id, preventing:
--   - Double execution (two clients claiming same run)
--   - Executor spoofing
--   - Idempotency loss on retry
--
-- Key properties:
-- 1. Generates executor_instance_id server-side (gen_random_uuid)
-- 2. Validates run ownership and state
-- 3. Locks run FOR UPDATE (prevents concurrent duplicate claims)
-- 4. Supports idempotent retry via p_claim_request_id
-- 5. Prevents active duplicate executors
-- 6. Handles waiting_for_topup → running transition
--
-- Used by: HeadlessTurnRunner.run() before any authorization

-- =========================================================================
-- claim_autonomous_executor_for_run: Initial claim for autonomous execution
-- =========================================================================
-- Parameters:
--   p_run_id UUID: The autonomous task run
--   p_claim_request_id TEXT: Unique per claim request (idempotency key)
--
-- Returns:
--   run_id UUID: The claimed run
--   execution_executor_instance_id UUID: Server-generated executor ID
--   execution_claim_request_id TEXT: The idempotency key
--   status TEXT: The run status after claim
--   error_message TEXT: If claim failed, the reason
--
-- Behavior:
--   - Validates caller owns/can access the run
--   - Validates run is in claimable state (created, waiting_for_topup, or already claimed by same request)
--   - Generates fresh executor_instance_id if new claim
--   - Returns existing if p_claim_request_id matches (idempotent)
--   - Prevents concurrent duplicate claims at database level (FOR UPDATE lock)
--
-- Idempotency:
--   - Same p_claim_request_id on retry returns same executor_instance_id
--   - Database uniqueness on (run_id, claim_request_id) prevents duplicates
CREATE OR REPLACE FUNCTION claim_autonomous_executor_for_run(
  p_run_id UUID,
  p_claim_request_id TEXT
)
RETURNS TABLE (
  run_id UUID,
  execution_executor_instance_id UUID,
  execution_claim_request_id TEXT,
  status TEXT,
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
  v_existing_executor_id UUID;
  v_existing_request_id TEXT;
BEGIN
  -- 1. Verify authenticated
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RETURN QUERY SELECT
      p_run_id,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      'Not authenticated'::TEXT;
    RETURN;
  END IF;

  -- 2. Lock and fetch run (prevents concurrent claims)
  SELECT * INTO v_run
  FROM autonomous_task_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF v_run IS NULL THEN
    RETURN QUERY SELECT
      p_run_id,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
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
          NULL::TEXT,
          NULL::TEXT,
          'Unauthorized: not run owner or org member'::TEXT;
        RETURN;
      END IF;
    ELSE
      RETURN QUERY SELECT
        p_run_id,
        NULL::UUID,
        NULL::TEXT,
        NULL::TEXT,
        'Unauthorized: not run owner'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 4. Check idempotency: if already claimed with same request_id, return existing
  IF v_run.execution_claimed_by IS NOT NULL AND v_run.execution_claim_request_id = p_claim_request_id THEN
    RETURN QUERY SELECT
      p_run_id,
      v_run.execution_executor_instance_id,
      v_run.execution_claim_request_id,
      v_run.status,
      NULL::TEXT;
    RETURN;
  END IF;

  -- 5. Validate run is in claimable state
  -- Claimable states:
  --   'created': Brand new run, never claimed
  --   'waiting_for_topup': User topped up, resuming after insufficient balance
  --   Already claimed by same user with DIFFERENT request_id: error (duplicate active claim)
  IF v_run.status NOT IN ('created', 'waiting_for_topup', 'running') THEN
    RETURN QUERY SELECT
      p_run_id,
      NULL::UUID,
      NULL::TEXT,
      v_run.status,
      'Run is in terminal state and cannot be claimed: ' || v_run.status::TEXT;
    RETURN;
  END IF;

  -- 6. Prevent concurrent duplicate claims
  -- If already claimed by this user with DIFFERENT request_id, it's an error
  -- (only same request_id is idempotent)
  IF v_run.execution_claimed_by IS NOT NULL AND v_run.execution_claimed_by = v_auth_uid THEN
    IF v_run.execution_claim_request_id <> p_claim_request_id THEN
      RETURN QUERY SELECT
        p_run_id,
        NULL::UUID,
        NULL::TEXT,
        v_run.status,
        'Run already has active claim with different request ID'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 7. Generate fresh executor instance ID (server-side, not client-side)
  v_new_executor_instance_id := gen_random_uuid();

  -- 8. Update run: claim execution + transition to running if needed
  UPDATE autonomous_task_runs
  SET execution_claimed_by = v_auth_uid,
      execution_claimed_at = NOW(),
      execution_executor_instance_id = v_new_executor_instance_id,
      execution_claim_request_id = p_claim_request_id,
      status = CASE
        WHEN status IN ('created', 'waiting_for_topup') THEN 'running'::TEXT
        WHEN status = 'running' THEN 'running'::TEXT
        ELSE status
      END,
      updated_at = NOW()
  WHERE id = p_run_id;

  -- 9. Return success with generated executor instance ID
  RETURN QUERY SELECT
    p_run_id,
    v_new_executor_instance_id,
    p_claim_request_id,
    'running'::TEXT,
    NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_autonomous_executor_for_run TO authenticated;

-- =========================================================================
-- Index for concurrency safety (prevents duplicate active claims)
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_autonomous_task_runs_execution_claim_request_id_run_id
  ON autonomous_task_runs(id, execution_claim_request_id);
