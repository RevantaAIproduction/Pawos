# Autonomous Work Day 3–4 Test Matrix

**Coding Checkpoint**: `9c3a7071eddaa1c200ba8f36ede1d466002bf7f6`

**Testing Start Date**: 2026-09-06

**Environment**: Staging (PAWOS_STAGING_URL + PAWOS_STAGING_ANON_KEY)

---

## 1. ENVIRONMENT & PRECONDITIONS

### Setup Requirements

- Electron app built and running against staging Supabase
- Staging database accessible and populated with test organization
- Test user with autonomousTaskBilling entitlement enabled
- GitHub/Jira connector available (or test with GitHub source)
- Autonomous Work wallet pre-funded ($50 minimum recommended)
- Tier Compute subscription active on same account

### Database Access

Use Supabase Studio (read-only) for all DB evidence collection. Do NOT mutate via SQL.

### Logging

Capture browser console logs during all tests. Save to file for audit trail.

### Screenshots

Screenshot key UI states: wallet before/after, run status, settlement confirmation.

---

## 2. AUTONOMOUS TASK CREATION

### TEST 02-001: UI Flow — Create Task from Dashboard

**Purpose**: Verify "Start New Autonomous Task" button flows through to run creation

**Preconditions**:
- Electron app running
- Logged in as test user
- Dashboard visible
- Autonomous Work wallet has available PC (≥ cost of next ticket)

**Exact Action**:
1. Navigate to Dashboard
2. Find "Autonomous Ticket System" card
3. Click "Start New Autonomous Task" button
4. Modal appears
5. Select ticket source: GitHub Issues
6. Enter ticket ID: `cli/100` (or any valid test issue)
7. Click "Create" button
8. Observe loading state
9. Wait for confirmation message

**Expected Result**:
- Modal closes
- Success message: "Created autonomous task cli/100"
- Dashboard reloads automatically
- New run appears in pending/active runs list

**Where to Observe**:
- Browser console: [AUTONOMOUS_RUN_START] log line
- Autonomous Task Billing Card: new run row
- Supabase autonomous_task_runs table: new row created

**DB Evidence Required**:
```sql
SELECT 
  id, 
  ticket_source, 
  ticket_id, 
  status, 
  reserved_pc, 
  settled_at,
  created_at
FROM autonomous_task_runs
WHERE ticket_id = 'cli/100'
ORDER BY created_at DESC
LIMIT 1;
```

Expected:
- `ticket_source` = 'github'
- `ticket_id` = 'cli/100'
- `status` = 'queued' OR 'running'
- `reserved_pc` = numeric value (≥ 200)
- `settled_at` = NULL

**Log Evidence Required**:
- [AUTONOMOUS_RUN_START] runId=<uuid>
- [TIER_COMPUTE_ISOLATION] message confirming Ticket Balance use
- No [AUTONOMOUS_RUN_USAGE_RECORD_FAILED] errors

**PASS Criteria**:
- ✅ Button visible and clickable
- ✅ Modal opens with correct controls
- ✅ Selection and input work
- ✅ Create button disabled until ticket ID entered
- ✅ run created in autonomous_task_runs table
- ✅ status is queued or running (not error state)
- ✅ reserved_pc is positive number
- ✅ settled_at is NULL

**FAIL Criteria**:
- ❌ Button missing or disabled when wallet has PC
- ❌ Modal fails to open
- ❌ Create fails with error message
- ❌ No run row created in database
- ❌ Run created with status='failed' or 'error'
- ❌ settled_at already set (should not settle before execution)

---

### TEST 02-002: Entitlement Check — Go/Pro User Cannot Create

**Purpose**: Verify autonomousTaskBilling entitlement gate prevents lower tiers from creating runs

**Preconditions**:
- Second test user account with Pro tier (NOT Pro Max)
- Autonomous Work wallet funded
- Logged in as Pro user

**Exact Action**:
1. Navigate to Dashboard
2. Find "Autonomous Ticket System" card
3. Attempt to click "Start New Autonomous Task" button
4. Observe state

**Expected Result**:
- Button is disabled or message appears: "Autonomous Work requires Paw Pro Max or higher"
- No modal opens
- No run created

**Where to Observe**:
- Dashboard UI: button disabled/error message
- Supabase logs: no new autonomous_task_runs row

**DB Evidence Required**:
```sql
SELECT COUNT(*) as new_runs
FROM autonomous_task_runs
WHERE ticket_id = 'test-pro-attempt'
AND created_at > NOW() - INTERVAL '5 minutes';
```

Expected: COUNT = 0

**PASS Criteria**:
- ✅ Button disabled or shows tier requirement message
- ✅ No run created
- ✅ Entitlement check enforced by main process (not just UI)

**FAIL Criteria**:
- ❌ Button enabled for non-Pro-Max user
- ❌ Modal opens for Pro user
- ❌ Run created for Pro user

---

### TEST 02-003: Connector Check — GitHub Not Connected

**Purpose**: Verify connector availability check blocks creation if GitHub not connected

**Preconditions**:
- GitHub connector disabled or disconnected in Settings → Connections
- Test user has Pro Max entitlement

**Exact Action**:
1. Navigate to Dashboard
2. Click "Start New Autonomous Task"
3. Modal opens
4. Select "GitHub Issues"
5. Enter ticket ID
6. Click "Create"

**Expected Result**:
- Error message: "BLOCKED — GitHub is not connected. Connect it from Settings → Connections..."
- No run created

**Where to Observe**:
- Modal error message
- Supabase: no new row

**DB Evidence Required**:
```sql
SELECT COUNT(*) FROM autonomous_task_runs 
WHERE created_at > NOW() - INTERVAL '5 minutes';
```

Expected: COUNT unchanged

**PASS Criteria**:
- ✅ Connector check enforced
- ✅ Clear actionable error message
- ✅ No run created

**FAIL Criteria**:
- ❌ Run created without connector check
- ❌ Vague or missing error

---

### TEST 02-004: Insufficient Wallet — Balance Less Than Next Ticket Cost

**Purpose**: Verify insufficient balance prevents run creation

**Preconditions**:
- Autonomous Work wallet balance < next ticket cost
- (E.g., balance = $2 but next ticket costs $2.50)

**Exact Action**:
1. Navigate to Dashboard
2. Click "Start New Autonomous Task"
3. Observe button state

**Expected Result**:
- Button is disabled or shows: "add funds" prompt
- No modal opens

**Where to Observe**:
- Dashboard UI: button state or message
- AutonomousTaskBillingCard: "Add funds" link present

**DB Evidence Required**:
- Wallet balance confirmed < next ticket price

**PASS Criteria**:
- ✅ Create button disabled when balance insufficient
- ✅ User directed to top-up
- ✅ No run created

**FAIL Criteria**:
- ❌ Button enabled despite insufficient balance
- ❌ Run created despite low balance

---

## 3. PERMISSION & APPROVAL

### TEST 03-001: User Authorization Modal

**Purpose**: Verify authorization modal blocks creation without explicit approval

**Preconditions**:
- Everything prepared for valid creation
- Authorization modal is mounted in Dashboard

**Exact Action**:
1. Open "Start New Autonomous Task" modal
2. Fill in GitHub ticket ID
3. Click "Create"
4. Authorization modal appears (separate from create modal)
5. Read details: ticket, cost, current balance
6. Click "Deny" or close

**Expected Result**:
- Run does NOT get created
- Message: "Autonomous Work authorization cancelled"
- Wallet unchanged

**Where to Observe**:
- Authorization modal content
- Database: no new run
- Console: no [AUTONOMOUS_RUN_START]

**DB Evidence Required**:
```sql
SELECT COUNT(*) FROM autonomous_task_runs
WHERE created_at > NOW() - INTERVAL '5 minutes';
```

Expected: COUNT = 0

**PASS Criteria**:
- ✅ Modal shows correct ticket details
- ✅ Modal shows cost
- ✅ Modal shows current balance
- ✅ Deny button prevents creation
- ✅ No run created

**FAIL Criteria**:
- ❌ Modal doesn't appear
- ❌ Run created despite Deny
- ❌ Wrong cost/balance displayed

---

### TEST 03-002: Approval Path — Allow Run Creation

**Purpose**: Verify clicking "Allow" creates run successfully

**Preconditions**:
- Same as 03-001
- Authorization modal ready

**Exact Action**:
1. Open "Start New Autonomous Task"
2. Enter ticket ID: `test-approved-task`
3. Click "Create"
4. Authorization modal appears
5. Review details
6. Click "Allow"

**Expected Result**:
- Modal closes
- Run created with status queued/running
- Wallet balance decreases by reserved amount
- Success message shown

**Where to Observe**:
- AutonomousTaskBillingCard: new run appears
- Supabase autonomous_task_runs: new row
- Supabase user_task_credits: balance_pc decreased

**DB Evidence Required**:
```sql
-- Capture before authorization
SELECT balance_pc, balance_reserved FROM user_task_credits
WHERE user_id = '<test_user_id>';

-- After creation, capture:
SELECT 
  id,
  status,
  reserved_pc,
  created_at
FROM autonomous_task_runs
WHERE ticket_id = 'test-approved-task'
ORDER BY created_at DESC LIMIT 1;

SELECT balance_pc, balance_reserved FROM user_task_credits
WHERE user_id = '<test_user_id>';
```

Expected:
- Run status = queued or running
- reserved_pc = positive number
- balance_pc decreased by reserved_pc
- balance_reserved increased by reserved_pc

**PASS Criteria**:
- ✅ Allow button creates run
- ✅ Wallet reserved balance increased
- ✅ Wallet available balance decreased
- ✅ Run status correct
- ✅ No settlement yet (settled_at = NULL)

**FAIL Criteria**:
- ❌ Run not created despite Allow
- ❌ Wallet not updated
- ❌ Wrong status

---

## 4. RESERVATION

### TEST 04-001: Initial Reservation

**Purpose**: Verify reservation is claimed before any work starts

**Preconditions**:
- Test user with sufficient wallet
- No prior autonomous runs

**Setup**:
1. Query wallet before creation:
```sql
SELECT balance_pc, balance_reserved FROM user_task_credits
WHERE user_id = '<test_user_id>';
```

**Exact Action**:
1. Create autonomous task via UI (TEST 03-002)
2. Wait for run to reach 'running' state (do NOT wait for completion)
3. Immediately query wallet again

**Expected Result**:
- Wallet available (balance_pc) decreased
- Wallet reserved (balance_reserved) increased
- Reservation amount matches run.reserved_pc

**Where to Observe**:
- Supabase user_task_credits table
- Supabase autonomous_task_runs.reserved_pc field

**DB Evidence Required**:
```sql
SELECT 
  ur.id,
  ur.reserved_pc,
  utc.balance_pc,
  utc.balance_reserved,
  (utc.balance_pc + utc.balance_reserved) as total_allocated
FROM autonomous_task_runs ur
JOIN user_task_credits utc ON utc.user_id = ur.user_id
WHERE ur.ticket_id = 'test-approved-task';
```

**Math Check**:
- Before: balance_pc + balance_reserved = opening
- After: (balance_pc - reserved) + (balance_reserved + reserved) = opening (unchanged total)

**PASS Criteria**:
- ✅ Reservation claimed before execution
- ✅ balance_pc decreased
- ✅ balance_reserved increased
- ✅ Total account balance unchanged (conservation law)

**FAIL Criteria**:
- ❌ Reservation not claimed
- ❌ Wallet shows negative available PC
- ❌ Total balance changed

---

### TEST 04-002: Extension (During Execution)

**Purpose**: Verify reservation can be extended mid-run if work requires more PC

**Preconditions**:
- Autonomous run in progress
- Current reservation nearly exhausted
- Wallet has additional available PC

**Setup**:
1. Start run (TEST 04-001)
2. Allow run to consume ~70% of reservation
3. Query wallet state

**Exact Action**:
1. Request extension via appropriate channel (if UI available, or via logs)
2. Verify extension request succeeds
3. Query wallet state again

**Expected Result**:
- New reservation added
- Wallet available decreased further
- Wallet reserved increased

**Where to Observe**:
- Supabase autonomous_reservation_requests table
- Supabase user_task_credits

**DB Evidence Required**:
```sql
SELECT 
  request_type,
  extension_pc,
  created_at
FROM autonomous_reservation_requests
WHERE run_id = '<run_id>'
ORDER BY created_at DESC;

SELECT balance_pc, balance_reserved 
FROM user_task_credits
WHERE user_id = '<test_user_id>';
```

**PASS Criteria**:
- ✅ Extension request created
- ✅ Wallet updated with additional reservation
- ✅ No duplicate extension for same request
- ✅ No overallocation (reserved > total)

**FAIL Criteria**:
- ❌ Extension request fails
- ❌ Wallet not updated
- ❌ Duplicate extension requests

---

### TEST 04-003: Insufficient Balance for Extension

**Purpose**: Verify extension fails if wallet cannot cover request

**Preconditions**:
- Autonomous run in progress
- Wallet fully allocated (available ≈ 0)
- Extension request attempted

**Exact Action**:
1. Run uses most of reservation
2. System attempts extension
3. Observe response

**Expected Result**:
- Extension rejected
- Wallet unchanged
- Run enters waiting_for_topup state OR continues with current reservation

**Where to Observe**:
- Run status field
- Console logs: any extension error

**DB Evidence Required**:
```sql
SELECT status FROM autonomous_task_runs WHERE id = '<run_id>';
SELECT balance_pc FROM user_task_credits WHERE user_id = '<test_user_id>';
```

**PASS Criteria**:
- ✅ Extension rejected gracefully
- ✅ Run doesn't crash
- ✅ Wallet unchanged

**FAIL Criteria**:
- ❌ Extension succeeds despite low balance
- ❌ Wallet becomes negative
- ❌ Run enters error state

---

## 5. AUTONOMOUS EXECUTION

### TEST 05-001: Real Autonomous Run to Completion

**Purpose**: Verify genuine autonomous execution with real usage collection

**Preconditions**:
- All setup complete
- Run created and ready
- Usage event store empty for this run

**Exact Action**:
1. Allow autonomous task to execute to completion
2. Monitor logs for usage events
3. Wait for settlement
4. Let system reach final state

**Expected Result**:
- Run executes with real work
- Usage events recorded in log
- Run reaches terminal state (completed, failed, or cancelled)
- settled_at is set
- Billing event created

**Where to Observe**:
- Browser console: [AUTONOMOUS_RUN_USAGE_RECORD*] logs
- Supabase autonomous_task_runs: status, settled_at, settled_pc
- Supabase organization_billing_events: new event for this run
- Main process UsageEventStore (local file system evidence)

**DB Evidence Required**:
```sql
SELECT 
  id,
  status,
  settled_at,
  settled_pc,
  reserved_pc
FROM autonomous_task_runs
WHERE ticket_id = 'test-approved-task'
ORDER BY created_at DESC LIMIT 1;

SELECT 
  id,
  run_id,
  amount_pc,
  amount_usd,
  created_at
FROM organization_billing_events
WHERE run_id = '<run_id>';
```

Expected:
- Run status = completed (or failed/cancelled)
- settled_at = timestamp (not NULL)
- settled_pc = integer (actual usage)
- billing event created with amount_pc and amount_usd

**Log Evidence Required**:
- [AUTONOMOUS_RUN_START]
- [AUTONOMOUS_RUN_USAGE_RECORD_START] and [AUTONOMOUS_RUN_USAGE_RECORDED]
- [BILLING_SAFETY_VERIFICATION]

**PASS Criteria**:
- ✅ Run completes with real work
- ✅ Usage recorded (not 0)
- ✅ settled_pc set to actual usage
- ✅ Billing event created
- ✅ Terminal state reached

**FAIL Criteria**:
- ❌ Run hangs or crashes
- ❌ No usage events recorded
- ❌ settled_pc = 0 when work was done
- ❌ No billing event

---

## 6. ACTUAL PC ACCOUNTING

### TEST 06-001: Normalized Compute Calculation

**Purpose**: Verify actual_pc matches real work performed (not placeholder)

**Preconditions**:
- Test 05-001 completed
- Run settled with real work

**Exact Action**:
1. After run completion, inspect:
   - settled_pc value in autonomous_task_runs
   - amount_pc in billing_event
   - amount_usd calculation

**Expected Result**:
- settled_pc is integer > 0 (genuine work)
- amount_usd = ROUND(settled_pc / 100, 2)
- Examples:
  - 500 PC → $5.00
  - 1200 PC → $12.00
  - 2350 PC → $23.50

**Where to Observe**:
- Supabase organization_billing_events.amount_pc
- Supabase organization_billing_events.amount_usd
- Calculate: amount_usd should equal amount_pc / 100 (exactly)

**DB Evidence Required**:
```sql
SELECT 
  amount_pc,
  amount_usd,
  (amount_pc::NUMERIC / 100) as calculated_usd,
  (amount_usd = ROUND(amount_pc::NUMERIC / 100, 2)) as correct_math
FROM organization_billing_events
WHERE run_id = '<run_id>';
```

Expected:
- correct_math = true
- No rounding errors

**PASS Criteria**:
- ✅ amount_pc reflects real usage
- ✅ amount_usd = amount_pc / 100 (exact conversion)
- ✅ No hardcoded placeholder values
- ✅ Not fixed per-ticket pricing

**FAIL Criteria**:
- ❌ amount_pc is 0 when work was done
- ❌ amount_usd doesn't match PC conversion
- ❌ Fixed $X price instead of PC-based

---

### TEST 06-002: Zero Work Does Not Incur Charge

**Purpose**: Verify cancellation before any work doesn't create charge

**Preconditions**:
- Create task (TEST 02-001)
- Capture wallet state
- Immediately cancel before work starts

**Exact Action**:
1. Create autonomous task
2. Let it reach running state
3. Immediately cancel/deny further work
4. Wait for run to terminate
5. Capture final state

**Expected Result**:
- Run reaches cancelled terminal state
- settled_pc = 0
- amount_usd = $0.00
- No financial deduction beyond returned reservation

**Where to Observe**:
- Supabase autonomous_task_runs.status
- Supabase organization_billing_events

**DB Evidence Required**:
```sql
SELECT status, settled_pc FROM autonomous_task_runs WHERE id = '<run_id>';
SELECT amount_pc, amount_usd FROM organization_billing_events WHERE run_id = '<run_id>';
```

Expected:
- status = cancelled
- settled_pc = 0 OR NULL
- amount_usd = 0.00

**PASS Criteria**:
- ✅ Cancellation before work = $0 charge
- ✅ Reservation returned
- ✅ No phantom billing event

**FAIL Criteria**:
- ❌ Charge incurred for zero-work cancellation
- ❌ Reservation not returned

---

## 7. SETTLEMENT

### TEST 07-001: Completed Run Settlement

**Purpose**: Verify completed autonomous work settles with correct PC and releases reservation

**Preconditions**:
- Autonomous run executed to completion (TEST 05-001)
- Real work measured

**Setup**:
```sql
SELECT 
  reserved_pc,
  settled_pc,
  status
FROM autonomous_task_runs
WHERE ticket_id = 'test-approved-task';

SELECT balance_pc, balance_reserved
FROM user_task_credits
WHERE user_id = '<test_user_id>';
```

**Exact Action**:
1. Run completes
2. Settlement triggers automatically
3. Wait for settled_at to be set
4. Query wallet

**Expected Result**:
- settled_at = timestamp
- settled_pc = actual work measured
- Wallet:
  - available (balance_pc) increased by (reserved_pc - settled_pc)
  - reserved decreased by reserved_pc
- Example:
  - Reserved: 2000 PC
  - Actual: 1200 PC
  - Returned: 800 PC
  - Final: available +800, reserved -2000

**Where to Observe**:
- Supabase autonomous_task_runs
- Supabase user_task_credits
- Supabase organization_billing_events

**DB Evidence Required**:
```sql
-- Before
SELECT balance_pc as before_available, balance_reserved as before_reserved
FROM user_task_credits WHERE user_id = '<test_user_id>';

-- After settlement
SELECT 
  ur.reserved_pc,
  ur.settled_pc,
  utc.balance_pc,
  utc.balance_reserved
FROM autonomous_task_runs ur
JOIN user_task_credits utc ON utc.user_id = ur.user_id
WHERE ur.id = '<run_id>';

-- Wallet math
SELECT 
  (balance_pc - (before_balance_pc - reserved_pc + settled_pc)) as should_be_zero
FROM user_task_credits;
```

**Math Check**:
- before_available - reserved + settled = after_available
- before_reserved + reserved - reserved = after_reserved

**PASS Criteria**:
- ✅ settled_at populated
- ✅ settled_pc = actual work
- ✅ Billing event created with correct amount_usd
- ✅ Reservation released correctly
- ✅ Wallet conservation: (before_available - reserved + settled) == after_available

**FAIL Criteria**:
- ❌ settled_at not set
- ❌ settled_pc is placeholder
- ❌ Wallet not updated correctly
- ❌ Billing event missing or wrong amount

---

### TEST 07-002: Failed Run Settlement

**Purpose**: Verify failed run still charges for work performed before failure

**Preconditions**:
- Create autonomous run
- Force a failure mid-execution (e.g., invalid code, missing dependency)
- Some work is done before failure

**Exact Action**:
1. Create task
2. Allow execution to reach failure
3. Wait for settlement
4. Query final state

**Expected Result**:
- Run status = failed
- settled_pc = work completed before failure (> 0)
- Billing event created with actual consumed PC
- Reservation released

**Where to Observe**:
- Supabase autonomous_task_runs.status = failed
- Supabase organization_billing_events.amount_usd > 0.00

**DB Evidence Required**:
```sql
SELECT 
  status,
  settled_pc,
  settled_at
FROM autonomous_task_runs
WHERE id = '<run_id>';

SELECT amount_pc, amount_usd
FROM organization_billing_events
WHERE run_id = '<run_id>';
```

**PASS Criteria**:
- ✅ Failed status set
- ✅ Partial work charged
- ✅ No refund of consumed PC just because run failed
- ✅ Billing event records actual usage

**FAIL Criteria**:
- ❌ No settlement for failed run
- ❌ No billing despite work
- ❌ Zero charge despite effort spent

---

## 8. SETTLEMENT IDEMPOTENCY

### TEST 08-001: First Settlement Observability

**Purpose**: Verify first settlement is logged as distinct from retry

**Preconditions**:
- Completed autonomous run (TEST 07-001)
- Capture logs before and after settlement

**Exact Action**:
1. Run completes and settlement occurs
2. Monitor console logs
3. Capture exact log lines

**Expected Result**:
- Log line: `[SETTLEMENT_IDEMPOTENCY_GUARD] FIRST_SETTLEMENT ...`
- Log line: `[SETTLEMENT_IDEMPOTENCY_FIRST_SETTLEMENT] ...`
- Billing event created exactly once
- settled_at populated exactly once

**Where to Observe**:
- Browser console logs
- Supabase organization_billing_events (one row per run)

**Log Evidence Required**:
```
[SETTLEMENT_IDEMPOTENCY_GUARD] FIRST_SETTLEMENT runId=<uuid> actualPc=<num>
[SETTLEMENT_IDEMPOTENCY_FIRST_SETTLEMENT] runId=<uuid> billingEventId=<uuid> actualPc=<num>
```

**PASS Criteria**:
- ✅ "FIRST_SETTLEMENT" string appears in guard log
- ✅ "FIRST_SETTLEMENT" string appears in success log
- ✅ One and only one billing event per run

**FAIL Criteria**:
- ❌ No settlement distinction logged
- ❌ Multiple billing events for same run
- ❌ Logs are identical for first vs retry

---

### TEST 08-002: Idempotent Retry Settlement

**Purpose**: Verify retry settlement returns same event ID without mutation

**Preconditions**:
- Completed and settled autonomous run (from TEST 08-001)
- Billing event already created
- settled_at already set

**Setup**:
```sql
SELECT id, settled_at, settled_pc
FROM autonomous_task_runs
WHERE id = '<run_id_from_test_08_001>';

SELECT id as event_id, amount_usd, amount_pc
FROM organization_billing_events
WHERE run_id = '<run_id_from_test_08_001>';
```

**Exact Action**:
1. Manually trigger settlement RPC again for same run
2. Capture response and logs
3. Query final state

**Expected Result**:
- Settlement succeeds (does not error)
- Returns the SAME billing event ID (UUID match)
- Wallet unchanged (no second deduction)
- Log shows: `[SETTLEMENT_IDEMPOTENCY_GUARD] IDEMPOTENT_RETRY ...`
- Log shows: `[SETTLEMENT_IDEMPOTENCY_IDEMPOTENT_RETRY] ... billingEventId=<same-uuid> ...`

**Where to Observe**:
- Browser console logs
- Supabase organization_billing_events (should have only one row for this run)
- Supabase user_task_credits (balance unchanged)

**Log Evidence Required**:
```
[SETTLEMENT_IDEMPOTENCY_GUARD] IDEMPOTENT_RETRY runId=<uuid> actualPc=<num>
[SETTLEMENT_IDEMPOTENCY_IDEMPOTENT_RETRY] runId=<uuid> billingEventId=<SAME-UUID> actualPc=<num>
```

**DB Evidence Required**:
```sql
SELECT COUNT(*) as event_count FROM organization_billing_events
WHERE run_id = '<run_id>';
-- Expected: 1

SELECT id as returned_event_id FROM organization_billing_events
WHERE run_id = '<run_id>';
-- Compare with first settlement response
```

**PASS Criteria**:
- ✅ Retry returns same event ID
- ✅ "IDEMPOTENT_RETRY" logged
- ✅ Zero additional billing events
- ✅ Wallet unchanged
- ✅ SQL idempotency enforced (only one event per run)

**FAIL Criteria**:
- ❌ Different event ID returned on retry
- ❌ Multiple events for same run
- ❌ Wallet mutated on retry
- ❌ No distinction logged between first and retry

---

## 9. BILLING FAILURE SAFETY

### TEST 09-001: Usage Recording Callback Failure Blocks Completion

**Purpose**: Verify that if usage recording fails, the run cannot falsely complete

**Preconditions**:
- Staging setup with controlled failure injection
- Ability to mock IPC bridge failure

**Exact Action**:
1. Create autonomous task
2. Inject failure into billing:recordAutonomousTurnUsage handler
   - Simulate bridge unavailability or RPC error
3. Observe run behavior

**Expected Result**:
- Run encounters usage recording failure
- onTurnUsage callback throws (does NOT silently catch)
- ConversationRuntime does not report successful completion
- Run does NOT enter 'completed' status
- Run enters 'failed' or 'blocked' status instead
- No billing event created
- No wallet deduction

**Where to Observe**:
- Browser console: [AUTONOMOUS_RUN_USAGE_RECORD_FAILED] error
- Supabase autonomous_task_runs: status != completed
- Supabase organization_billing_events: no event for this run

**Log Evidence Required**:
```
[AUTONOMOUS_RUN_USAGE_RECORD_FAILED] runId=<uuid> error: <failure reason>
[BILLING_SAFETY_VERIFICATION] MUST NOT appear (run did not complete)
```

**DB Evidence Required**:
```sql
SELECT status FROM autonomous_task_runs WHERE id = '<run_id>';
-- Expected: failed, blocked, or cancelled (NOT completed)

SELECT COUNT(*) FROM organization_billing_events
WHERE run_id = '<run_id>';
-- Expected: 0 (no event due to failure)
```

**Wallet Evidence Required**:
```sql
SELECT balance_pc, balance_reserved
FROM user_task_credits
WHERE user_id = '<test_user_id>';
-- Reservation should remain until run is terminal, not deducted
```

**PASS Criteria**:
- ✅ Run does NOT complete successfully
- ✅ Usage failure is non-recoverable (callback rejection not silently caught)
- ✅ No billing event created
- ✅ Wallet not mutated (reservation not released prematurely)
- ✅ [AUTONOMOUS_RUN_USAGE_RECORD_FAILED] error logged

**FAIL Criteria**:
- ❌ Run marked as completed despite usage recording failure
- ❌ Billing event created for failed run
- ❌ Wallet deducted
- ❌ Error is silently caught and ignored

---

### TEST 09-002: Missing Usage Data Does Not Create Phantom Settlement

**Purpose**: Verify that if billing fails and usage data is unavailable, settlement cannot silently create a zero-cost event

**Preconditions**:
- Test 09-001 setup: run failed due to usage recording failure
- Usage events are missing/unavailable
- Settlement is attempted anyway

**Exact Action**:
1. After usage recording failure (from TEST 09-001)
2. Verify usage_events are empty for this run
3. Attempt settlement (manually trigger if needed)
4. Observe response

**Expected Result**:
- Settlement RPC detects no usage events
- May return 0 PC or error (implementation choice)
- Wallet is NOT deducted
- Billing event is NOT created (or created with 0, if that's the implementation)
- Run remains in failed state

**Important Distinction**:
- Legitimate zero-work cancellation: wallet gets refunded reservation
- Missing data due to failure: wallet NOT debited, system stays safe but run cannot be settled normally

**Where to Observe**:
- Settlement RPC response
- Supabase organization_billing_events (no event OR event with 0 amount)
- Supabase user_task_credits (unchanged)

**DB Evidence Required**:
```sql
SELECT COUNT(*) as usage_event_count
FROM usage_events
WHERE run_id = '<run_id>';
-- Expected: 0 (events never recorded due to failure)

SELECT COUNT(*) as billing_event_count
FROM organization_billing_events
WHERE run_id = '<run_id>';
-- Expected: 0 (no event created if data unavailable)

SELECT balance_pc FROM user_task_credits
WHERE user_id = '<test_user_id>';
-- Should match pre-run state (reservation never released)
```

**PASS Criteria**:
- ✅ No usage events recorded (due to callback failure)
- ✅ Settlement does NOT auto-complete as zero cost
- ✅ Wallet unchanged (reservation not blindly returned)
- ✅ System stays in recoverable state

**FAIL Criteria**:
- ❌ Phantom $0.00 billing event created
- ❌ Reservation silently released despite missing data
- ❌ Zero charge treated as legitimate completion

---

## 10. TIER COMPUTE ISOLATION

### TEST 10-001: Autonomous Work Does NOT Consume Tier Compute

**Purpose**: Verify autonomous work uses Ticket Balance only, not subscription allowance

**Preconditions**:
- Test user with:
  - Pro Max tier (100 Tier Compute/month)
  - Autonomous Work wallet funded ($20)
- Capture both balances before test

**Setup**:
```sql
SELECT COALESCE(balance_credit, 0) as tier_compute_pc
FROM subscription_credits
WHERE account_id = '<test_account_id>';

SELECT balance_pc as autonomous_wallet_pc
FROM user_task_credits
WHERE user_id = '<test_user_id>';
```

**Exact Action**:
1. Record Tier Compute balance
2. Record Autonomous Work wallet balance
3. Execute autonomous task (TEST 05-001) to completion
4. Record both balances again

**Expected Result**:
- Tier Compute balance unchanged
- Autonomous Work wallet decreased by settled_pc

**Where to Observe**:
- Supabase subscription_credits table (read-only)
- Supabase user_task_credits table

**DB Evidence Required**:
```sql
-- Before
SELECT 
  'before' as phase,
  (SELECT COALESCE(balance_credit, 0) FROM subscription_credits 
   WHERE account_id = '<test_account_id>') as tier_compute,
  (SELECT balance_pc FROM user_task_credits 
   WHERE user_id = '<test_user_id>') as autonomous_wallet;

-- After
SELECT 
  'after' as phase,
  (SELECT COALESCE(balance_credit, 0) FROM subscription_credits 
   WHERE account_id = '<test_account_id>') as tier_compute,
  (SELECT balance_pc FROM user_task_credits 
   WHERE user_id = '<test_user_id>') as autonomous_wallet;
```

**Math Check**:
- before_tier_compute == after_tier_compute (unchanged)
- after_autonomous_wallet == before_autonomous_wallet - settled_pc

**PASS Criteria**:
- ✅ Tier Compute balance exactly unchanged
- ✅ Autonomous wallet decreased by exact settled PC
- ✅ No consumption fallback between pools
- ✅ Logging shows [TIER_COMPUTE_ISOLATION] message

**FAIL Criteria**:
- ❌ Tier Compute decreased
- ❌ Autonomous wallet unchanged
- ❌ Fallback/blending between pools detected

---

### TEST 10-002: Normal Conversation Still Uses Tier Compute

**Purpose**: Verify normal Tier Compute accounting still works (no regression)

**Preconditions**:
- Capture Tier Compute balance after TEST 10-001

**Exact Action**:
1. Record Tier Compute balance
2. Start normal conversation (NOT autonomous)
3. Perform some work (ask Claude a question, get response)
4. Record balance

**Expected Result**:
- Tier Compute balance decreased
- Autonomous wallet unchanged

**Where to Observe**:
- Supabase subscription_credits table
- Supabase user_task_credits (should not change)

**DB Evidence Required**:
```sql
SELECT 
  'tier_compute_before' as metric,
  (SELECT COALESCE(balance_credit, 0) FROM subscription_credits 
   WHERE account_id = '<test_account_id>') as value
UNION ALL
SELECT 
  'autonomous_wallet_before',
  (SELECT balance_pc FROM user_task_credits 
   WHERE user_id = '<test_user_id>')
-- Repeat after normal conversation
```

**PASS Criteria**:
- ✅ Tier Compute decreased
- ✅ Autonomous wallet unchanged
- ✅ Normal billing path works

**FAIL Criteria**:
- ❌ Tier Compute unchanged (normal billing broken)
- ❌ Autonomous wallet affected by normal conversation

---

## 11. AUTHORIZATION & SECURITY

### TEST 11-001: Cross-User Access Denied

**Purpose**: Verify User A's run cannot be accessed/modified by User B

**Preconditions**:
- Two test users (UserA, UserB)
- Both in same organization
- UserA creates autonomous run
- UserB attempts access

**Exact Action**:
1. UserA creates autonomous task (captures run_id)
2. Switch to UserB browser session
3. Attempt to view/settle/modify run via Supabase direct RPC
4. Observe response

**Expected Result**:
- UserB gets RPC error: "Unauthorized" or similar
- Run unchanged
- Wallet unchanged
- No settlement occurs

**Where to Observe**:
- Supabase RPC response (error)
- Network inspector: error status code

**DB Evidence Required**:
```sql
SELECT 
  user_id,
  status,
  settled_at
FROM autonomous_task_runs
WHERE id = '<run_id_from_user_a>';
-- user_id should match UserA, not UserB
-- Should show no change after UserB attempt
```

**PASS Criteria**:
- ✅ RPC rejects UserB access
- ✅ Authorization checked server-side (not just UI)
- ✅ No run data leaked to UserB

**FAIL Criteria**:
- ❌ UserB can view UserA's run
- ❌ UserB can settle UserA's run
- ❌ No authorization check

---

### TEST 11-002: Unauthorized Settlement Blocked

**Purpose**: Verify settlement requires user auth, not just runId

**Preconditions**:
- Completed autonomous run from UserA
- UserB attempts to call settle RPC

**Exact Action**:
1. UserB obtains runId (from TEST 11-001)
2. UserB calls settle_autonomous_task_run_pc RPC directly
3. Observe response

**Expected Result**:
- RPC fails with authorization error
- No settlement occurs
- Wallet unchanged
- No billing event created

**Where to Observe**:
- Supabase RPC error response
- Supabase organization_billing_events (no new event)

**PASS Criteria**:
- ✅ Settlement RPC validates user ownership
- ✅ No settlement for unauthorized user
- ✅ Wallet protected

**FAIL Criteria**:
- ❌ Settlement succeeds for unauthorized user
- ❌ Billing event created
- ❌ Wallet mutated

---

## 12. TOP-UP & WAITING FOR TOP-UP

### TEST 12-001: Waiting for Top-up State

**Purpose**: Verify run transitions to waiting_for_topup when wallet exhausted

**Preconditions**:
- Autonomous task running
- Wallet nearly exhausted
- Extension would fail

**Exact Action**:
1. Start autonomous run with limited reservation
2. Allow work to consume most of it
3. Observe when more PC needed but unavailable
4. Query run status

**Expected Result**:
- Run status = waiting_for_topup (if applicable)
- No further work attempted
- Reservation held (not released)

**Where to Observe**:
- Supabase autonomous_task_runs.status
- Console logs: any waiting state indication

**DB Evidence Required**:
```sql
SELECT status FROM autonomous_task_runs WHERE id = '<run_id>';
-- Expected: waiting_for_topup or similar
```

**PASS Criteria**:
- ✅ Run pauses appropriately when funds exhausted
- ✅ Reservation maintained
- ✅ No false completion

**FAIL Criteria**:
- ❌ Run crashes
- ❌ Work proceeds without funds
- ❌ Reservation released prematurely

---

### TEST 12-002: Resume After Top-up

**Purpose**: Verify run can resume execution after wallet is topped up

**Preconditions**:
- Run in waiting_for_topup state (from TEST 12-001)
- Wallet topped up via UI

**Exact Action**:
1. Run is paused in waiting_for_topup
2. User performs top-up via Dashboard
3. System attempts to resume reservation/execution
4. Observe run continues

**Expected Result**:
- Run resumes execution
- No duplicate usage recording
- Same runId continues (not a new run)
- New reservation extended if needed
- Final settlement uses total actual PC

**Where to Observe**:
- Supabase autonomous_task_runs.status transitions
- Usage_events accumulate correctly

**DB Evidence Required**:
```sql
SELECT 
  status,
  reserved_pc,
  created_at,
  updated_at
FROM autonomous_task_runs
WHERE id = '<run_id>';
-- Should show single row with transitions but same ID
```

**PASS Criteria**:
- ✅ Resume uses same run ID
- ✅ No duplicate work
- ✅ Execution continues
- ✅ Final PC is cumulative

**FAIL Criteria**:
- ❌ New run created instead of resuming
- ❌ Work duplicated
- ❌ Run doesn't resume

---

## 13. CANCELLATION

### TEST 13-001: Cancel Before Work — Zero Charge

**Purpose**: Verify early cancellation results in zero charge and full reservation return

**Preconditions**:
- Created autonomous task (status=queued or just started)
- Minimal work done (< 10% of reservation)

**Setup**:
```sql
SELECT reserved_pc FROM autonomous_task_runs WHERE id = '<run_id>';
SELECT balance_pc, balance_reserved FROM user_task_credits WHERE user_id = '<test_user_id>';
```

**Exact Action**:
1. Create task
2. Immediately cancel before significant work
3. Query final state

**Expected Result**:
- Run status = cancelled
- settled_pc = 0 (or minimal)
- Billing event with amount_usd = 0.00
- Wallet reservation returned fully

**Where to Observe**:
- Supabase autonomous_task_runs.status
- Supabase organization_billing_events.amount_usd

**DB Evidence Required**:
```sql
SELECT status, settled_pc FROM autonomous_task_runs WHERE id = '<run_id>';
SELECT amount_pc, amount_usd FROM organization_billing_events WHERE run_id = '<run_id>';
SELECT balance_pc, balance_reserved FROM user_task_credits WHERE user_id = '<test_user_id>';
```

**PASS Criteria**:
- ✅ Cancelled status set
- ✅ Zero or minimal charge
- ✅ Reservation fully returned
- ✅ Billing event amount = $0.00

**FAIL Criteria**:
- ❌ Charge incurred for cancellation
- ❌ Reservation not returned

---

### TEST 13-002: Cancel During Work — Charge for Work Done

**Purpose**: Verify cancellation mid-work still charges for completed work

**Preconditions**:
- Autonomous task running
- ~50% of work completed

**Exact Action**:
1. Allow run to reach ~50% completion
2. Cancel run
3. Query final state

**Expected Result**:
- Run status = cancelled
- settled_pc = work completed (~50% of reservation)
- Billing event with amount_usd = settled_pc / 100
- Unused reservation (other 50%) returned

**Where to Observe**:
- Supabase autonomous_task_runs
- Supabase organization_billing_events

**DB Evidence Required**:
```sql
SELECT reserved_pc, settled_pc, status FROM autonomous_task_runs WHERE id = '<run_id>';
SELECT amount_pc, amount_usd FROM organization_billing_events WHERE run_id = '<run_id>';
```

**Math Check**:
- amount_usd = settled_pc / 100
- unused = reserved_pc - settled_pc

**PASS Criteria**:
- ✅ Charge for work done
- ✅ No refund of consumed work
- ✅ Unused reservation returned

**FAIL Criteria**:
- ❌ No charge for mid-run cancellation
- ❌ Refund of consumed work
- ❌ Full reservation returned

---

## 14. FAILED RUNS

### TEST 14-001: Legitimate Failure — Charge for Partial Work

**Purpose**: Verify failed run still charges for work before failure

**Preconditions**:
- Force execution failure (e.g., runtime error after some work)

**Exact Action**:
1. Create task
2. Allow to reach ~40% before forced failure
3. Query final state

**Expected Result**:
- Run status = failed
- settled_pc = actual work before failure
- Billing event created with charge
- No refund

**Where to Observe**:
- Supabase autonomous_task_runs.status = failed
- Supabase organization_billing_events.amount_usd > 0

**PASS Criteria**:
- ✅ Failed status
- ✅ Partial work charged
- ✅ No refund
- ✅ Billing event records actual usage

**FAIL Criteria**:
- ❌ Zero charge for failed run
- ❌ Refund of used PC

---

## 15. RECOVERY

### TEST 15-001: Recovery Workflow Documentation Validation

**Purpose**: Verify documented recovery process matches actual behavior

**Preconditions**:
- Review RECOVERY_WORKFLOW.md
- Simulate a recovery scenario (e.g., abandoned run)

**Exact Action**:
1. Follow documented recovery steps
2. Verify each checkpoint
3. Confirm system state after recovery

**Expected Result**:
- Abandoned run safely reconciled
- Wallet conserved
- Reserved PC released
- System returns to consistent state

**Where to Observe**:
- Run status after recovery
- Wallet balances
- Billing events

**PASS Criteria**:
- ✅ Recovery process works as documented
- ✅ No data loss
- ✅ Wallet conserved
- ✅ System consistent

**FAIL Criteria**:
- ❌ Recovery process incomplete or incorrect
- ❌ Wallet inconsistent after recovery
- ❌ Data lost

---

## 16. UI / UX

### TEST 16-001: Create Button Disabled/Enabled States

**Purpose**: Verify button shows correct state based on conditions

**Test Cases**:

| Condition | Expected State |
|-----------|---|
| Tier = Pro Max, Balance sufficient | Enabled |
| Tier = Pro, Balance sufficient | Disabled (tier message) |
| Tier = Pro Max, Balance < price | Disabled (add funds message) |
| GitHub not connected | Enabled (error on create) |

**Expected Result**:
- Button behavior matches conditions
- Error messages clear and actionable
- No false enablement

**PASS Criteria**:
- ✅ All conditions handled correctly
- ✅ Messages are specific, not generic

---

### TEST 16-002: Modal Validation

**Purpose**: Verify modal input validation

**Test Cases**:
- Empty ticket ID: Create button disabled
- Ticket ID with special chars: Accepted if valid
- Source selector: All three options appear (GitHub, Jira, Linear)

**Expected Result**:
- Form validation prevents invalid submission
- User feedback is immediate

**PASS Criteria**:
- ✅ Validation prevents errors
- ✅ User can't submit invalid data

---

### TEST 16-003: Status Display

**Purpose**: Verify run status and wallet balance displayed accurately

**Test Cases**:
- Completed run: Status = "completed", amount charged shown
- Failed run: Status = "failed", amount charged shown
- Pending approval: Status shown, approve/deny buttons visible
- Running: Status = "running", no completion shown yet

**Expected Result**:
- All statuses displayed correctly
- Amounts match DB values
- Buttons appropriate to status

**PASS Criteria**:
- ✅ Accurate status display
- ✅ Wallet balance matches DB
- ✅ Correct buttons for state

---

## 17. REGRESSION

### TEST 17-001: Automated Test Suite Still Passes

**Purpose**: Verify no regression in existing functionality

**Exact Action**:
1. Run `npm test` after all runtime tests complete
2. Run `npm run typecheck`
3. Run `npm run build`

**Expected Result**:
- All exit codes = 0
- No new failures
- Pre-existing failures unchanged

**PASS Criteria**:
- ✅ npm test: exit 0
- ✅ npm run typecheck: exit 0
- ✅ npm run build: exit 0

---

## 18. FINAL ACCOUNTING CONSERVATION

### TEST 18-001: Total Wallet Balance Conservation

**Purpose**: Verify balance + reserved + settled never exceeds opening + topups

**Setup**:
```
Opening balance (balance_pc + balance_reserved)
+ Topups
- Settled (from billing events)
= Closing balance (balance_pc + balance_reserved)
```

**Exact Action**:
1. Query all wallet transactions for test user
2. Calculate totals from start to end
3. Verify conservation law

**Expected Result**:
- Equation balances exactly
- No phantom PC created
- No PC destroyed (except for legitimate charges)

**Where to Observe**:
- Supabase user_task_credits
- Supabase organization_billing_events (sum of amount_pc)

**DB Evidence Required**:
```sql
SELECT
  (SELECT COALESCE(SUM(amount_pc), 0) FROM organization_billing_events 
   WHERE user_id = '<test_user_id>') as total_settled_pc,
  (SELECT balance_pc + balance_reserved FROM user_task_credits 
   WHERE user_id = '<test_user_id>') as current_allocated,
  (opening_balance + topup_total - total_settled_pc) as should_equal_current;
```

**PASS Criteria**:
- ✅ Equation balances
- ✅ No PC missing or extra
- ✅ Accounting is sound

**FAIL Criteria**:
- ❌ Imbalance detected
- ❌ PC created or destroyed unexpectedly

---

## EXECUTION ORDER

**First Wave** (Foundation):
1. TEST 02-001: UI Flow creation
2. TEST 04-001: Initial reservation
3. TEST 05-001: Real autonomous execution
4. TEST 06-001: Actual PC calculation

**Second Wave** (Core Billing):
5. TEST 07-001: Settlement
6. TEST 08-001: First settlement logging
7. TEST 08-002: Idempotent retry

**Third Wave** (Safety & Isolation):
8. TEST 10-001: Autonomous doesn't consume Tier Compute
9. TEST 10-002: Normal conversation still works
10. TEST 09-001: Usage failure blocks completion
11. TEST 09-002: Missing data doesn't phantom-settle

**Fourth Wave** (Edge Cases):
12. TEST 13-001 & 13-002: Cancellation
13. TEST 14-001: Failure handling
14. TEST 12-001 & 12-002: Top-up workflow
15. TEST 15-001: Recovery

**Fifth Wave** (Security & Regression):
16. TEST 11-001 & 11-002: Authorization
17. TEST 16-001 & 16-002 & 16-003: UI
18. TEST 17-001: Regression suite
19. TEST 18-001: Final conservation

---

## EVIDENCE COLLECTION TEMPLATE

For each test, save:

```
TEST_ID: [id]
RESULT: PASS / FAIL / BLOCKED / UNVERIFIED

EXPECTED:
[description]

OBSERVED:
[actual behavior]

LOGS:
[relevant console/server logs, redacted]

DATABASE:
[SQL query results, formatted]

SCREENSHOTS:
[file paths if UI involved]

NOTES:
[any additional context]
```

---

## END OF TEST MATRIX

This matrix is the authoritative testing specification for Day 3–4.

Do NOT deviate from the test structure without documented reason.

Each test result is a data point, not a guess.

