# PHASE 3 DATABASE VERIFICATION — EXECUTION GUIDE

**Environment**: Pawos Staging (rmeqxgepbxgcjhyfsvee)  
**Status**: Test scripts ready for execution  
**Safety**: Disposable test data only, no production modifications

---

## QUICK START

### 1. Connect to Staging Database

```bash
cd /path/to/PawOS
supabase projects list  # Verify project ref: rmeqxgepbxgcjhyfsvee

supabase link --project-ref rmeqxgepbxgcjhyfsvee

supabase db connect --project-ref rmeqxgepbxgcjhyfsvee
```

**You will be prompted for credentials. Use:**
- Email: Your Supabase account email
- Password: Your Supabase account password

### 2. Execute the Verification Harness

Once connected to the Pawos Staging database:

```sql
\i PHASE_3_STAGING_VERIFICATION_HARNESS.sql
```

This will:
- Create temporary test organizations and users
- Run Tests 1-2 with full output
- Provide outline for Tests 3-16

### 3. Implement Tests 3-16

Follow the pattern in PHASE_3_STAGING_VERIFICATION_HARNESS.sql and implement each test:
- Create test data in SAVEPOINT
- Execute the operation
- Verify results with before/after queries
- Print the results
- Cleanup with ROLLBACK

---

## TEST BREAKDOWN: WHICH TESTS ARE DATABASE-ONLY vs APPLICATION-LEVEL

### Database-Only Tests (Can run in this harness)

These tests use only SQL and RPC operations:

- **TEST 1**: Initial 500 PC Reservation ✓
- **TEST 2**: Initial Reservation Idempotency ✓
- **TEST 3**: Reservation Extension ✓
- **TEST 4**: Extension Idempotency ✓
- **TEST 5**: Extension Authorization/Executor Identity ✓
- **TEST 6**: Insufficient Reservation → Extension Fails ✓
- **TEST 7**: Insufficient Wallet → waiting_for_topup Transition ✓
- **TEST 8**: Top-up ($10 → +1000 PC) ✓
- **TEST 10**: Actual-PC Settlement Primitive ✓
- **TEST 11**: Settlement Idempotency ✓
- **TEST 12**: Zero-Work Abandonment ✓
- **TEST 13**: Partial-Work Failure ✓
- **TEST 14**: Completion vs Cancellation Race ✓
- **TEST 15**: RLS / Cross-Org Protection ✓

### APPLICATION-LEVEL Tests (Require Electron/Renderer)

These require main-process data that cannot be injected via SQL alone:

- **TEST 9**: Same-Run Resume with Fresh Executor Instance
  - **Issue**: Requires execution_claimed_by to be set by resume_and_claim_autonomous_run RPC
  - **Database part**: Can test RPC call and executor_instance_id generation
  - **Application part**: Renderer must load orchestration_input, reconstruct context, re-enter execution
  - **How to test**: Run via AppRoot listener after top-up event

- **TEST 16**: Conservation Invariant + Tier Compute Separation
  - **Database part**: Run the SQL query provided (see below)
  - **Application part**: Verify that autonomous PC came from UsageEventStore (not Tier Compute)
  - **How to verify**: 
    - Run autonomous task and watch UsageEventStore.append() calls
    - Verify Tier Compute balance unchanged
    - Verify autonomous wallet consumed only actual_pc

---

## DETAILED TEST PATTERNS

### Pattern Template for Each Test

```sql
BEGIN;
SAVEPOINT test_N_begin;

-- Setup: Create test wallet, run, etc.

-- Operation: Call RPC or execute SQL

-- Verification: Capture results
CREATE TEMP TABLE test_N_before AS SELECT ...;
CREATE TEMP TABLE test_N_after AS SELECT ...;

-- Print results with RAISE NOTICE
DO $$
BEGIN
  RAISE NOTICE 'TEST N: DESCRIPTION ... Before: %, After: % ... PASS/FAIL',
    ..., ...;
END $$;

-- Cleanup
DELETE FROM ...;
ROLLBACK TO test_N_begin;
COMMIT;
```

---

## EXPECTED OUTPUT FOR KEY TESTS

### TEST 1 Output Example

```
TEST 1: INITIAL RESERVATION
Setup:   available_pc = 3000, reserve_amount = 500
After:   success = true, available_pc = 2500, reserved = 500, run.reserved_pc = 500
Expected: success = true, available_pc = 2500, reserved = 500, reserved_pc = 500
Assertion: PASS
```

### TEST 10 Output Example (Settlement)

```
TEST 10: ACTUAL-PC SETTLEMENT (1000 reserved, 600 actual)
Setup:   reserved_pc = 1000, available_pc = 2000, balance_reserved = 1000
After:   settled_pc = 600, available_pc = 2400, balance_reserved = 0
Billing: amount_pc = 600, amount_usd = 6.00
Expected: available_pc = 2400, settled_pc = 600, billing_amount_pc = 600
Assertion: PASS
```

### TEST 16 Output Example (Conservation Invariant)

```
TEST 16: CONSERVATION INVARIANT
Opening balance:     3000 PC
Successful topups:   1000 PC (one $10 top-up)
Settled autonomous:   600 PC
Current available:   3200 PC
Current reserved:     200 PC

Equation: 3000 + 1000 - 600 = 3200 + 200
          3400 = 3400
          
Assertion: PASS
```

---

## RPC SIGNATURES (From Migrations)

Use these exact signatures when calling RPCs:

### reserve_autonomous_pc

```sql
SELECT * FROM reserve_autonomous_pc(
  p_run_id UUID,
  p_estimated_pc INTEGER,
  p_request_id UUID
) RETURNS TABLE(success BOOLEAN, reserved_pc INTEGER, available_remaining INTEGER, error_message TEXT);
```

### extend_autonomous_reservation

```sql
SELECT * FROM extend_autonomous_reservation(
  p_run_id UUID,
  p_additional_pc INTEGER,
  p_extension_request_id TEXT,
  p_executor_instance_id UUID
) RETURNS TABLE(success BOOLEAN, new_reserved_pc INTEGER, available_remaining INTEGER, error_message TEXT);
```

### resume_and_claim_autonomous_run

```sql
SELECT * FROM resume_and_claim_autonomous_run(
  p_run_id UUID,
  p_resume_request_id TEXT
) RETURNS TABLE(run_id UUID, execution_claimed_by UUID, execution_executor_instance_id UUID, execution_claim_request_id TEXT, status TEXT, reserved_pc INTEGER, error_message TEXT);
```

### mark_autonomous_execution_started

```sql
SELECT * FROM mark_autonomous_execution_started(
  p_run_id UUID,
  p_executor_instance_id UUID
) RETURNS autonomous_task_runs;
```

### mark_autonomous_execution_completed

```sql
SELECT * FROM mark_autonomous_execution_completed(
  p_run_id UUID,
  p_terminal_status TEXT,
  p_executor_instance_id UUID
) RETURNS autonomous_task_runs;
```

### settle_autonomous_task_run_pc

```sql
SELECT * FROM settle_autonomous_task_run_pc(
  p_run_id UUID,
  p_actual_pc INTEGER
) RETURNS TABLE(success BOOLEAN, settled_pc INTEGER, error_message TEXT);
```

---

## CONSERVATION INVARIANT VERIFICATION

Run this query at the end of all tests to verify financial conservation:

```sql
WITH test_wallet AS (
  SELECT 
    organization_id,
    balance_pc as current_available,
    balance_reserved as current_reserved
  FROM organization_task_credits
  WHERE organization_id = '11111111-1111-1111-1111-111111111111'::UUID
),
topups AS (
  SELECT 
    COALESCE(SUM(amount_usd * 100)::INTEGER, 0) as total_topup_pc
  FROM ticket_balance_topups
  WHERE organization_id = '11111111-1111-1111-1111-111111111111'::UUID
),
settled AS (
  SELECT
    COALESCE(SUM(settled_pc)::INTEGER, 0) as total_settled_pc
  FROM autonomous_task_runs
  WHERE organization_id = '11111111-1111-1111-1111-111111111111'::UUID
    AND settled_at IS NOT NULL
)
SELECT
  3000 as opening_balance_pc,
  (SELECT total_topup_pc FROM topups) as successful_topups_pc,
  (SELECT total_settled_pc FROM settled) as settled_autonomous_pc,
  (SELECT current_available FROM test_wallet) as current_balance_pc,
  (SELECT current_reserved FROM test_wallet) as current_reserved_pc,
  3000 + (SELECT total_topup_pc FROM topups) - (SELECT total_settled_pc FROM settled) as left_side,
  (SELECT current_available FROM test_wallet) + (SELECT current_reserved FROM test_wallet) as right_side,
  CASE
    WHEN 3000 + (SELECT total_topup_pc FROM topups) - (SELECT total_settled_pc FROM settled) =
         (SELECT current_available FROM test_wallet) + (SELECT current_reserved FROM test_wallet)
    THEN 'CONSERVATION INVARIANT: PASS'
    ELSE 'CONSERVATION INVARIANT: FAIL'
  END as result;
```

Expected output format:
```
opening | topups | settled | available | reserved | left_side | right_side | result
--------|--------|---------|-----------|----------|-----------|------------|-----
3000    | 1000   | 600     | 3200      | 200      | 3400      | 3400       | PASS
```

---

## CLEANUP PROCEDURE

After all tests complete, clean up disposable test data:

```sql
-- Delete test runs
DELETE FROM autonomous_task_runs 
WHERE organization_id = '11111111-1111-1111-1111-111111111111'::UUID;

-- Delete test wallet
DELETE FROM organization_task_credits 
WHERE organization_id = '11111111-1111-1111-1111-111111111111'::UUID;

-- Delete test topups
DELETE FROM ticket_balance_topups 
WHERE organization_id = '11111111-1111-1111-1111-111111111111'::UUID;

-- Verify cleanup
SELECT 
  (SELECT COUNT(*) FROM autonomous_task_runs WHERE organization_id = '11111111-1111-1111-1111-111111111111'::UUID) as runs_remaining,
  (SELECT COUNT(*) FROM organization_task_credits WHERE organization_id = '11111111-1111-1111-1111-111111111111'::UUID) as wallets_remaining,
  (SELECT COUNT(*) FROM ticket_balance_topups WHERE organization_id = '11111111-1111-1111-1111-111111111111'::UUID) as topups_remaining;
```

Expected result: All counts = 0

---

## EVIDENCE REQUIRED FOR "SAFE TO DEPLOY"

**Do NOT declare SAFE TO DEPLOY unless ALL of the following are true:**

- [ ] Tests 1-8, 10-15 all show PASS
- [ ] Conservation invariant calculates to PASS (left_side = right_side)
- [ ] RLS tests (Test 15) verify cross-org/cross-user access is rejected
- [ ] Settlement idempotency (Test 11) shows no second mutation
- [ ] Race condition (Test 14) shows exactly one terminal financial outcome
- [ ] Tier Compute balance is untouched by autonomous PC operations
- [ ] No silent zero-PC charge occurs with missing/corrupt usage data
- [ ] Fresh migration replay completes successfully (confirmed in prior step)
- [ ] No unresolved state-machine or lifecycle issues
- [ ] Executor instance ID properly tracked through full execution lifecycle

---

## DEPLOYMENT READINESS CHECKLIST

After running all tests and verifying evidence:

- [ ] Database integration: PASS (all 16 tests)
- [ ] Conservation invariant: PASS
- [ ] RLS/authorization: PASS
- [ ] Migration history: PASS (fresh replay works)
- [ ] Code review: PASS (completed in prior steps)
- [ ] TypeScript: PASS
- [ ] Test coverage: PASS

**Only then:** SAFE TO DEPLOY to production

---

**End of Execution Guide**

Execute the SQL harness against Pawos Staging and report the evidence.
