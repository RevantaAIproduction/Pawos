-- ===========================================================================
-- PHASE 3 AUTONOMOUS WORK PC STAGING VERIFICATION HARNESS
-- ===========================================================================
--
-- Environment: Pawos Staging (rmeqxgepbxgcjhyfsvee)
-- Purpose: Verify autonomous work PC accounting system (16-step integration tests)
-- Safety: Uses DISPOSABLE test data only. No production modifications.
--
-- IMPORTANT:
-- 1. Run as authenticated user via Supabase CLI
-- 2. Do NOT modify migrations or application code
-- 3. All test data created here is temporary/disposable
-- 4. This harness does NOT test main-process UsageEventStore integration
-- 5. Settlement tests use explicitly-supplied actual_pc only
--
-- To execute:
--   supabase db connect --project-ref rmeqxgepbxgcjhyfsvee
--   \i PHASE_3_STAGING_VERIFICATION_HARNESS.sql
--
-- ===========================================================================

-- Setup: Create test user and organization
-- ===========================================================================

DO $$
DECLARE
  v_test_org_id UUID;
  v_test_user_id UUID;
  v_test_run_id UUID;
BEGIN
  -- Create test organization (if not exists)
  -- NOTE: This assumes auth.users exists and we can reference it
  -- We'll use a deterministic ID for repeatability

  v_test_org_id := '11111111-1111-1111-1111-111111111111'::UUID;
  v_test_user_id := '22222222-2222-2222-2222-222222222222'::UUID;

  -- Store in a temporary table for reference throughout tests
  CREATE TEMP TABLE test_context (
    test_org_id UUID,
    test_user_id UUID,
    test_run_1_id UUID,
    test_wallet_initial_pc INTEGER
  );

  INSERT INTO test_context VALUES (v_test_org_id, v_test_user_id, gen_random_uuid(), 3000);

  RAISE NOTICE 'Test context created. Test org: %, Test user: %', v_test_org_id, v_test_user_id;
END $$;

-- ===========================================================================
-- TEST 1: INITIAL 500 PC RESERVATION
-- ===========================================================================
--
-- Setup:
-- - Test organization with 3000 PC available
-- - Create autonomous task run
-- - Call reserve_autonomous_pc with 500 PC
--
-- Expected Result:
-- - reserved_pc = 500 on run
-- - balance_pc = 2500 (3000 - 500)
-- - balance_reserved = 500
-- - autonomou reservation_requests row created with success=true
--
-- Verification Query:
-- - SELECT balance_pc, balance_reserved FROM organization_task_credits WHERE organization_id = test_org_id
-- - SELECT reserved_pc FROM autonomous_task_runs WHERE id = test_run_id
--
-- ===========================================================================

BEGIN;
SAVEPOINT test_1_begin;

-- Setup wallet
INSERT INTO organization_task_credits (organization_id, balance_pc, balance_reserved)
  VALUES ((SELECT test_org_id FROM test_context), 3000, 0)
  ON CONFLICT (organization_id) DO UPDATE SET balance_pc = 3000, balance_reserved = 0;

-- Create test run
UPDATE test_context SET test_run_1_id = gen_random_uuid();

INSERT INTO autonomous_task_runs (
  id,
  organization_id,
  user_id,
  ticket_source,
  status,
  created_at,
  updated_at
) VALUES (
  (SELECT test_run_1_id FROM test_context),
  (SELECT test_org_id FROM test_context),
  (SELECT test_user_id FROM test_context),
  'github',
  'queued',
  NOW(),
  NOW()
);

-- OPERATION: Reserve 500 PC
-- Result stored in temp table for later verification
CREATE TEMP TABLE test_1_result AS
SELECT * FROM reserve_autonomous_pc(
  (SELECT test_run_1_id FROM test_context),
  500,
  gen_random_uuid()
);

-- VERIFICATION: Print before/after state
DO $$
DECLARE
  v_after_balance_pc INTEGER;
  v_after_balance_reserved INTEGER;
  v_after_reserved_pc INTEGER;
  v_result RECORD;
BEGIN
  SELECT * INTO v_result FROM test_1_result LIMIT 1;

  SELECT balance_pc, balance_reserved INTO v_after_balance_pc, v_after_balance_reserved
  FROM organization_task_credits
  WHERE organization_id = (SELECT test_org_id FROM test_context);

  SELECT reserved_pc INTO v_after_reserved_pc
  FROM autonomous_task_runs
  WHERE id = (SELECT test_run_1_id FROM test_context);

  RAISE NOTICE '
TEST 1: INITIAL RESERVATION
Setup:   available_pc = 3000, reserve_amount = 500
After:   success = %, available_pc = %, reserved = %, run.reserved_pc = %
Expected: success = true, available_pc = 2500, reserved = 500, reserved_pc = 500
Assertion: % (PASS/FAIL)',
    (v_result).success,
    v_after_balance_pc,
    v_after_balance_reserved,
    v_after_reserved_pc,
    CASE
      WHEN (v_result).success AND v_after_balance_pc = 2500 AND v_after_balance_reserved = 500 AND v_after_reserved_pc = 500 THEN 'PASS'
      ELSE 'FAIL'
    END;
END $$;

-- Cleanup: Clear test data for test 1
DELETE FROM autonomous_task_runs WHERE id = (SELECT test_run_1_id FROM test_context);
DELETE FROM organization_task_credits WHERE organization_id = (SELECT test_org_id FROM test_context);

ROLLBACK TO test_1_begin;
COMMIT;

-- ===========================================================================
-- TEST 2: INITIAL RESERVATION IDEMPOTENCY
-- ===========================================================================
--
-- Setup: Same as Test 1
-- Operation: Call reserve_autonomous_pc twice with SAME request_id
-- Expected: Second call returns same result, NO additional deduction
--
-- ===========================================================================

BEGIN;
SAVEPOINT test_2_begin;

INSERT INTO organization_task_credits (organization_id, balance_pc, balance_reserved)
  VALUES ((SELECT test_org_id FROM test_context), 3000, 0)
  ON CONFLICT (organization_id) DO UPDATE SET balance_pc = 3000, balance_reserved = 0;

UPDATE test_context SET test_run_1_id = gen_random_uuid();

INSERT INTO autonomous_task_runs (
  id, organization_id, user_id, ticket_source, status, created_at, updated_at
) VALUES (
  (SELECT test_run_1_id FROM test_context),
  (SELECT test_org_id FROM test_context),
  (SELECT test_user_id FROM test_context),
  'github', 'queued', NOW(), NOW()
);

CREATE TEMP TABLE test_2_request_id AS SELECT gen_random_uuid() AS request_id;

-- First call
CREATE TEMP TABLE test_2_result_1 AS
SELECT * FROM reserve_autonomous_pc(
  (SELECT test_run_1_id FROM test_context),
  500,
  (SELECT request_id FROM test_2_request_id)
);

-- Capture state after first call
CREATE TEMP TABLE test_2_state_1 AS
SELECT
  (SELECT balance_pc FROM organization_task_credits WHERE organization_id = (SELECT test_org_id FROM test_context)) as balance_pc,
  (SELECT balance_reserved FROM organization_task_credits WHERE organization_id = (SELECT test_org_id FROM test_context)) as balance_reserved;

-- Second call with SAME request_id
CREATE TEMP TABLE test_2_result_2 AS
SELECT * FROM reserve_autonomous_pc(
  (SELECT test_run_1_id FROM test_context),
  500,
  (SELECT request_id FROM test_2_request_id)
);

-- Capture state after second call
CREATE TEMP TABLE test_2_state_2 AS
SELECT
  (SELECT balance_pc FROM organization_task_credits WHERE organization_id = (SELECT test_org_id FROM test_context)) as balance_pc,
  (SELECT balance_reserved FROM organization_task_credits WHERE organization_id = (SELECT test_org_id FROM test_context)) as balance_reserved;

-- VERIFICATION
DO $$
DECLARE
  v_result_1 RECORD;
  v_result_2 RECORD;
  v_state_1 RECORD;
  v_state_2 RECORD;
BEGIN
  SELECT * INTO v_result_1 FROM test_2_result_1 LIMIT 1;
  SELECT * INTO v_result_2 FROM test_2_result_2 LIMIT 1;
  SELECT * INTO v_state_1 FROM test_2_state_1 LIMIT 1;
  SELECT * INTO v_state_2 FROM test_2_state_2 LIMIT 1;

  RAISE NOTICE '
TEST 2: INITIAL RESERVATION IDEMPOTENCY
Call 1:  success = %, available = %, reserved = %
Call 2:  success = %, available = %, reserved = %
State 1: balance_pc = %, balance_reserved = %
State 2: balance_pc = %, balance_reserved = %
Expected: Call 1 success, Call 2 success with same values, State 1 = State 2
Assertion: % (PASS/FAIL)',
    v_result_1.success, v_result_1.available_remaining, (SELECT balance_reserved FROM test_2_state_1),
    v_result_2.success, v_result_2.available_remaining, (SELECT balance_reserved FROM test_2_state_2),
    (SELECT balance_pc FROM test_2_state_1),
    (SELECT balance_reserved FROM test_2_state_1),
    (SELECT balance_pc FROM test_2_state_2),
    (SELECT balance_reserved FROM test_2_state_2),
    CASE
      WHEN v_result_1.success AND v_result_2.success AND
           v_state_1.balance_pc = v_state_2.balance_pc AND
           v_state_1.balance_reserved = v_state_2.balance_reserved THEN 'PASS'
      ELSE 'FAIL'
    END;
END $$;

DELETE FROM autonomous_task_runs WHERE id = (SELECT test_run_1_id FROM test_context);
DELETE FROM organization_task_credits WHERE organization_id = (SELECT test_org_id FROM test_context);

ROLLBACK TO test_2_begin;
COMMIT;

-- ===========================================================================
-- TESTS 3-16: ABBREVIATED PLACEHOLDERS
-- ===========================================================================
--
-- The harness above demonstrates the pattern for tests 1-2.
-- Tests 3-16 follow the same structure:
--
-- TEST 3: Extension (extend_autonomous_reservation with executor_instance_id)
-- TEST 4: Extension Idempotency
-- TEST 5: Extension Authorization (wrong executor_instance_id rejected)
-- TEST 6: Insufficient Reservation (extension fails, no work executes)
-- TEST 7: Waiting for Topup (insufficient wallet triggers state transition)
-- TEST 8: Top-up (add_ticket_balance, verify +1000 PC)
-- TEST 9: Same-Run Resume (resume_and_claim_autonomous_run, fresh executor ID)
-- TEST 10: Actual-PC Settlement (1000 reserved, 600 actual, verify 400 returned)
-- TEST 11: Settlement Idempotency (settle twice, no second mutation)
-- TEST 12: Zero-Work Abandonment (0 PC consumed, full reservation returned)
-- TEST 13: Partial-Work Failure (1000 reserved, 350 actual, verify 650 returned)
-- TEST 14: Completion vs Cancellation Race (exactly one terminal outcome)
-- TEST 15: RLS / Cross-Org Protection (unauthorized access rejected)
-- TEST 16: Conservation Invariant (opening + topups = balance + reserved + settled)
--
-- NOTES:
-- - Tests 9 (resume) requires execution_claimed_by to be set; normally done by claim RPC
-- - Tests 10, 12, 13 (settlement) test the database primitive; actual_pc explicitly supplied
-- - Full end-to-end tests (execution, usage tracking) require APPLICATION-LEVEL testing
--   via the Electron main process and UsageEventStore
--
-- ===========================================================================

-- Conservation Invariant Report
-- ===========================================================================
--
-- Final verification query (run at end of all tests):
--
-- SELECT
--   'Opening balance (initial PC in wallet)' as label,
--   SUM(CASE WHEN created_at < NOW() - INTERVAL '1 hour' THEN balance_pc ELSE 0 END) as value
-- UNION ALL
-- SELECT 'Successful topups (add_ticket_balance calls)', SUM(amount_usd * 100)
--   FROM ticket_balance_topups
--   WHERE topped_up_at BETWEEN NOW() - INTERVAL '1 hour' AND NOW()
-- UNION ALL
-- SELECT 'Settled autonomous PC (sum of settled_pc)', SUM(settled_pc)
--   FROM autonomous_task_runs
--   WHERE settled_at IS NOT NULL
--     AND settled_at BETWEEN NOW() - INTERVAL '1 hour' AND NOW()
-- UNION ALL
-- SELECT 'Current available balance (balance_pc)', SUM(balance_pc)
--   FROM organization_task_credits
-- UNION ALL
-- SELECT 'Current reserved balance', SUM(balance_reserved)
--   FROM organization_task_credits;
--
-- Conservation invariant holds if:
-- Opening + Topups = Settled + (CurrentAvailable + CurrentReserved)
--
-- ===========================================================================

RAISE NOTICE '
===========================================================================
PHASE 3 STAGING VERIFICATION HARNESS
===========================================================================
Tests 1-2 demonstrated above.
Tests 3-16 require full implementation of this pattern.

KEY FINDINGS FOR MANUAL EXECUTION:

1. Use the exact RPC signatures from migrations:
   - reserve_autonomous_pc(run_id UUID, estimated_pc INTEGER, request_id UUID)
   - extend_autonomous_reservation(run_id UUID, additional_pc INTEGER, extension_request_id TEXT, executor_instance_id UUID)
   - resume_and_claim_autonomous_run(run_id UUID, resume_request_id TEXT)
   - mark_autonomous_execution_started(run_id UUID, executor_instance_id UUID)
   - mark_autonomous_execution_completed(run_id UUID, terminal_status TEXT, executor_instance_id UUID)
   - settle_autonomous_task_run_pc(run_id UUID, actual_pc INTEGER)

2. Financial tests must show BEFORE/AFTER values:
   - balance_pc, balance_reserved, reserved_pc, settled_pc

3. Conservation invariant must be verified with actual numbers

4. RLS protection must be tested by attempting cross-org/cross-user access

5. Tests requiring UsageEventStore data are APPLICATION-LEVEL only
   (not pure database primitives)

===========================================================================
';

END;
