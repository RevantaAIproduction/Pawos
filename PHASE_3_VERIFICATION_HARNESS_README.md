# PHASE 3 STAGING DATABASE VERIFICATION HARNESS

**Status**: Test scripts ready for execution against Pawos Staging  
**Environment**: Pawos Staging (rmeqxgepbxgcjhyfsvee)  
**Not Yet Executed**: These are template scripts, not results

---

## FILES PROVIDED

### 1. PHASE_3_STAGING_VERIFICATION_HARNESS.sql
- SQL script containing pattern for all 16 integration tests
- Tests 1-2 fully implemented with BEFORE/AFTER reporting
- Tests 3-16 outlined with instructions
- Conservative: Uses only disposable test data
- Safe: No production modifications

### 2. PHASE_3_STAGING_VERIFICATION_GUIDE.md
- Complete execution instructions
- RPC signatures for reference
- Expected output examples
- Conservation invariant query
- Cleanup procedures

---

## TEST MATRIX

| Test | Name | DB-Only | Application-Level | Status |
|------|------|---------|-------------------|--------|
| 1 | Initial 500 PC Reservation | ✓ | | Ready |
| 2 | Reservation Idempotency | ✓ | | Ready |
| 3 | Extension | ✓ | | Outlined |
| 4 | Extension Idempotency | ✓ | | Outlined |
| 5 | Extension Authorization | ✓ | | Outlined |
| 6 | Insufficient Reservation | ✓ | | Outlined |
| 7 | Insufficient Wallet → waiting_for_topup | ✓ | | Outlined |
| 8 | Top-up ($10 → +1000 PC) | ✓ | | Outlined |
| 9 | Same-Run Resume with Fresh Executor | | ✓ | Outlined |
| 10 | Settlement Primitive (1000 reserved, 600 actual) | ✓ | | Outlined |
| 11 | Settlement Idempotency | ✓ | | Outlined |
| 12 | Zero-Work Abandonment | ✓ | | Outlined |
| 13 | Partial-Work Failure (1000 reserved, 350 actual) | ✓ | | Outlined |
| 14 | Completion vs Cancellation Race | ✓ | | Outlined |
| 15 | RLS / Cross-Org Protection | ✓ | | Outlined |
| 16 | Conservation Invariant + Tier Compute Separation | ✓ | ✓ | Outlined |

---

## HOW TO EXECUTE

### Prerequisites

```bash
# 1. Ensure you have Supabase CLI installed
supabase --version

# 2. Navigate to PawOS project directory
cd /path/to/PawOS

# 3. Verify staging project is accessible
supabase projects list
# Output should include: Pawos Staging (ref: rmeqxgepbxgcjhyfsvee)
```

### Step 1: Connect to Staging Database

```bash
# Link to the staging project
supabase link --project-ref rmeqxgepbxgcjhyfsvee

# Connect to the database
supabase db connect --project-ref rmeqxgepbxgcjhyfsvee

# You will be prompted for Supabase credentials
# Use your account email and password
```

### Step 2: Run the Test Harness

Once the database connection is open:

```sql
\i PHASE_3_STAGING_VERIFICATION_HARNESS.sql
```

This will:
- Execute Tests 1-2 with full output
- Provide templates for Tests 3-16
- Print assertion results (PASS/FAIL) for each test

### Step 3: Manually Implement Tests 3-16

Follow the pattern in the SQL harness and implement each test:

1. Create test data in SAVEPOINT
2. Execute the operation (RPC call or SQL)
3. Capture before/after state
4. Print verification with actual numbers
5. Clean up with ROLLBACK

### Step 4: Run Conservation Invariant Query

At the end of all tests, run:

```sql
-- Copy the query from PHASE_3_STAGING_VERIFICATION_GUIDE.md
-- under "CONSERVATION INVARIANT VERIFICATION" section
```

Expected result:
- `left_side` = `right_side`
- Result = "CONSERVATION INVARIANT: PASS"

### Step 5: Verify RLS/Authorization

For Test 15, attempt cross-org/cross-user access and verify it's rejected:

```sql
-- Try to access a run from a different organization
-- Verify the RPC returns authorization error
```

---

## KEY DIFFERENCES: DATABASE-ONLY vs APPLICATION-LEVEL

### Database-Only Tests (14/16)

These tests verify the database accounting logic in isolation:

- **Operation**: Call RPC with explicit parameters
- **Verification**: Check wallet state directly via SQL
- **Example**: Reserve 500 PC, verify balance_pc decreased by 500
- **Can Run**: Pure SQL in the test harness

### Application-Level Tests (2/16)

These tests require integration with the Electron main process:

**Test 9: Same-Run Resume**
- **Database part**: Resume claim is issued by RPC ✓ (testable)
- **Missing part**: Renderer must load orchestration_input, re-enter execution (not testable via SQL alone)
- **How to test**: Watch the actual renderer/main-process execution after a top-up event

**Test 16: Conservation + Tier Compute Separation**
- **Database part**: Verify conservation equation (testable via SQL) ✓
- **Missing part**: Verify PC came from UsageEventStore, not Tier Compute (requires app observation)
- **How to test**: 
  1. Run an autonomous task
  2. Watch UsageEventStore.append() calls in main process
  3. Verify Tier Compute balance unchanged
  4. Verify only autonomous PC was consumed

---

## EVIDENCE REQUIRED FOR "SAFE TO DEPLOY"

**You must provide:**

1. **Test Results** (for Tests 1-15)
   ```
   TEST 1: PASS - Initial reservation successful, balance deducted
   TEST 2: PASS - Idempotency verified, second call returns same state
   TEST 3: PASS - Extension successful
   ...
   ```

2. **Conservation Invariant Output**
   ```
   Opening: 3000 PC
   Topups: 1000 PC
   Settled: 600 PC
   Available: 3200 PC
   Reserved: 200 PC
   
   Equation: 3000 + 1000 - 600 = 3200 + 200
   Result: PASS
   ```

3. **RLS Test Results** (Test 15)
   ```
   Cross-org access: REJECTED (as expected)
   Cross-user access: REJECTED (as expected)
   Authorization checks: PASS
   ```

4. **Application-Level Verification** (Tests 9, 16)
   ```
   Top-up resume: Execution resumed with fresh executor_instance_id
   Tier Compute untouched: Confirmed in Electron debugger/logs
   UsageEventStore source: Verified in main process
   ```

---

## WHAT "SAFE TO DEPLOY" REQUIRES

**ALL of the following must be true:**

- [  ] Tests 1-8 PASS (reservation, extension, waiting_for_topup)
- [  ] Tests 10-15 PASS (settlement, idempotency, race, RLS)
- [  ] Conservation invariant: PASS (left_side = right_side with actual numbers)
- [  ] RLS protection: PASS (cross-org/cross-user access rejected)
- [  ] Settlement idempotency: PASS (no second mutation on replay)
- [  ] Race condition: PASS (exactly one terminal financial outcome)
- [  ] Fresh migration replay: PASS (confirmed in previous step)
- [  ] Tier Compute isolation: PASS (autonomous PC does not fallback to subscription)
- [  ] No silent zero-charge: PASS (missing usage data handled correctly)
- [  ] No unresolved lifecycle issues: PASS (all state transitions verified)

---

## IMPORTANT CONSTRAINTS

1. **Disposable Test Data Only**
   - Uses test organization ID: `11111111-1111-1111-1111-111111111111`
   - Uses test user ID: `22222222-2222-2222-2222-222222222222`
   - No production data touched

2. **No Application Code Modifications**
   - Tests do not modify renderer or main process code
   - Tests do not modify migrations
   - Tests do not modify Razorpay/invoicing

3. **No Production Access**
   - All tests run against Pawos Staging only
   - Never target production database
   - Staging project ref: rmeqxgepbxgcjhyfsvee

4. **Idempotent Cleanup**
   - All test data is automatically cleaned up after each test
   - Uses SAVEPOINT/ROLLBACK for safety
   - Final cleanup query provided for verification

---

## NEXT STEPS

1. **Execute the SQL harness** against Pawos Staging
2. **Implement Tests 3-8, 10-15** following the pattern
3. **Capture all output** showing BEFORE/AFTER values
4. **Run conservation invariant query** and verify equation
5. **Test authorization** for RLS (Test 15)
6. **Report all results** with exact numbers

---

## DO NOT PROCEED TO PRODUCTION UNTIL

- All 16 tests show PASS
- Conservation invariant passes with actual numbers
- RLS authorization passes
- No silent zero-charges
- Fresh database migration replay succeeds
- Tier Compute separation verified

---

**Status**: These are TEST SCRIPTS ONLY. No tests have been executed yet.  
**Next**: Execute against Pawos Staging and report evidence.  
**Declaration**: Will only declare SAFE TO DEPLOY after all evidence is provided.

