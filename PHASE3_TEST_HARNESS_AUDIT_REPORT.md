# Phase 3 Test Harness: Schema & Architecture Audit Report

**Date**: 2026-09-05  
**Status**: PRE-EXECUTION AUDIT (Do NOT run tests yet)

## EXECUTIVE SUMMARY

### Key Findings

1. **RPC Signatures**: ✅ All 4 critical RPC signatures verified against staging migrations
   - reserve_autonomous_task_pc(UUID, INTEGER) → autonomous_task_runs ✓
   - extend_autonomous_reservation(UUID, INTEGER, TEXT, UUID) → TABLE ✓
   - settle_autonomous_task_run_pc(UUID, INTEGER) → UUID ✓
   - add_ticket_balance(UUID, NUMERIC, TEXT) → UUID ✓
   - **No changes needed to test file**

2. **Schema Verified**: ✅ All required tables found and documented
   - organization_task_credits (PC-based wallet)
   - autonomous_task_runs (execution record)
   - autonomous_reservation_requests (idempotency tracking)
   - organization_billing_events (billing ledger with amount_pc)

3. **Tier Compute**: ❌ **Separate Tier Compute pool NOT found in schema**
   - organizations.tier = subscription level (static)
   - organization_task_credits = autonomous Work PC (dynamic)
   - organization_task_allowance = monthly task COUNT (not PC)
   - **Action**: Mark "Tier Compute isolation" test BLOCKED

4. **Test Deficiencies**: 13 PARTIAL + 1 SUPERFICIAL (unchanged from adversarial audit)
   - Billing event assertions missing (8 settlement tests)
   - Multi-user authorization test missing
   - Concurrency testing superficial (sequential, not real overlapping calls)
   - Conservation invariant uses hard-coded values
   - Idempotency table checks missing

### Recommended Actions (in priority order)

| Priority | Action | Effort | Blocker? |
|----------|--------|--------|----------|
| IMMEDIATE | Add multi-user authorization test | 1h | No |
| HIGH | Add billing event assertions (8 tests) | 2h | No |
| HIGH | Fix conservation invariant (read from DB) | 0.5h | No |
| MEDIUM | Add settlement for failed/cancelled/abandoned runs | 1h | No |
| MEDIUM | Add genuine concurrency test (if possible) | 1h | Yes, if DB doesn't support |
| LOW | Add insufficient reservation test | 0.5h | No |
| BLOCKED | Tier Compute isolation test | 0h | YES - pending clarification |

### Go/No-Go for Execution

**Current Status**: NOT READY to execute

**Must-Have Fixes Before Execution**:
1. ✅ RPC signature verification → DONE
2. ❌ Add multi-user authorization test → REQUIRED
3. ❌ Add billing event assertions → REQUIRED
4. ❌ Fix conservation invariant (hard-coded values) → REQUIRED

**Timeline**:
- Estimated effort: 4-5 hours for must-have fixes
- Target: Ready for user approval by end of day

---

## PHASE 1: ARCHITECTURE/SCHEMA INSPECTION FINDINGS

### 1. Actual Schema Structure

#### 1a. Autonomous Work PC Accounting Tables

**organization_task_credits**
- Columns: organization_id, balance_pc (INTEGER), balance_reserved (INTEGER), balance_usd (legacy), updated_at
- Semantics: PC-based prepaid wallet for autonomous Work PC only
- Isolation: Distinct from user_task_credits (user-level accounts have separate wallets)

**autonomous_task_runs**
- Columns: id, organization_id, user_id, status, reserved_pc, settled_at, settled_pc, + execution identity (execution_executor_instance_id, execution_claimed_by, etc.)
- Status values: queued, running, waiting_for_permission, waiting_for_topup, blocked, completed, failed, cancelled, abandoned
- Semantics: One row per autonomous workflow invocation, immutable execution record
- RLS: Row-level security via is_org_member() check

**autonomous_reservation_requests**
- Columns: id, run_id, request_id (UUID), request_type (initial/extension), requested_pc, success (BOOLEAN), new_reserved_pc, available_remaining, error_message
- Constraint: UNIQUE(run_id, request_id) — enforces idempotency
- Semantics: Immutable request ledger for idempotency tracking
- Used by: Both reserve_autonomous_task_pc() and extend_autonomous_reservation() for deduplication

**organization_billing_events**
- Columns: id, run_id, organization_id, user_id, started_at, completed_at, duration_seconds, status, amount_usd, amount_pc (NEW, added by 20260904000000_fix_billing_events_amount_pc.sql), created_at
- Semantics: Immutable billing ledger; created by settle_autonomous_task_run_pc()
- Conservation: Records actual PC consumed (amount_pc), NOT reserved PC

#### 1b. Organization Tier (NOT "Tier Compute")

**organizations**
- Columns: id, slug, name, tier, owner_user_id, created_at
- Tier values: 'team', 'enterprise'
- Semantics: Subscription tier, used for access control / feature entitlement
- **CRITICAL FINDING**: No separate "Tier Compute" balance table found
  - organizations.tier is static subscription level
  - organization_task_credits is dynamic PC-based wallet
  - Monthly included allowance tracked in organization_task_allowance (task COUNT, not PC)

**organization_task_allowance**
- Columns: organization_id, period_month, included_allowance, used_count
- Semantics: Monthly task COUNT allowance (e.g., "10 tasks included per month")
- **NOT** Paw Compute; different dimension from PC accounting

#### 1c. Tier Compute: APPEARS NOT YET IMPLEMENTED

**Finding**: No migration defines a separate "Tier Compute" pool distinct from Autonomous Work PC.

**Implication**: The test requirement to "verify Tier Compute isolation" cannot be met against current staging because Tier Compute as a separate pool does not exist in the deployed schema.

**Option A**: Tier Compute is a theoretical future requirement (not yet built). Skip Tier Compute assertion, mark test BLOCKED.

**Option B**: "Tier Compute" refers to subscription tier level (organizations.tier) — verify that autonomous PC operations don't change org tier. Trivial but valid.

**Recommendation**: Implement Option A (mark BLOCKED) with explanation: "Tier Compute pool not found in deployed schema; separate balance table required to test isolation."

---

### 2. RPC Function Signatures (Actual, From Migrations)

#### reserve_autonomous_task_pc (CURRENT — 20260903000000)
```sql
FUNCTION reserve_autonomous_task_pc(
  p_run_id UUID,
  p_pc_to_reserve INTEGER
) RETURNS autonomous_task_runs
```
**Test Match**: ✓ Matches test calls (e.g., line 197-200, TEST 1)  
**Behavior**:
- Locks run FOR UPDATE
- Checks idempotency: if already reserved, returns existing run (no double-reservation)
- Checks wallet balance for organization or user
- Raises exception if insufficient balance
- Updates: wallet (balance_pc, balance_reserved), run (reserved_pc)
- Returns updated autonomous_task_runs row

**Important**: This returns the RUN row, not a result table. Test file uses this correctly.

#### extend_autonomous_reservation (CURRENT — 20260904000002 fixes a bug from 20260902000001)
```sql
FUNCTION extend_autonomous_reservation(
  p_run_id UUID,
  p_additional_pc INTEGER,
  p_extension_request_id TEXT,
  p_executor_instance_id UUID
) RETURNS TABLE(
  success BOOLEAN,
  new_reserved_total INTEGER,
  available_remaining INTEGER,
  error_message TEXT
)
```
**Test Match**: ✓ Matches test calls (e.g., line 372-380, TEST 3)  
**Key Features**:
- Verifies executor instance matches run.execution_executor_instance_id (authorization)
- Checks idempotency table autonomous_reservation_requests for previous result
- p_extension_request_id is TEXT (handles UUID from test via string conversion)
- Returns result table with success flag, allowing graceful error reporting

#### settle_autonomous_task_run_pc (CURRENT — 20260904000001)
```sql
FUNCTION settle_autonomous_task_run_pc(
  p_run_id UUID,
  p_actual_pc INTEGER
) RETURNS UUID  -- billing_event_id
```
**Test Match**: ✓ Matches test calls (e.g., line 554-560, TEST 5)  
**Critical Behavior**:
- Requires auth.uid() to be set (SECURITY DEFINER enforces authorization)
- Only accepts terminal states: completed, failed, cancelled, abandoned
- Rejects running, waiting_for_permission, blocked, waiting_for_topup
- Idempotent: returns existing billing_event_id if already settled
- Returns billing_event_id UUID, not a result set

#### add_ticket_balance (CURRENT — 20260903000000)
```sql
FUNCTION add_ticket_balance(
  p_organization_id UUID,
  p_amount_usd NUMERIC,
  p_payment_reference TEXT
) RETURNS UUID  -- topup_id
```
**Test Match**: ✓ Matches test calls (line 977-981, TEST 10)  
**Behavior**:
- Validates: $30 minimum, $20,000 maximum
- Converts USD to PC: v_amount_pc = (p_amount_usd * 100)::INTEGER
- Records topup in ticket_balance_topups table
- Updates wallet: BOTH balance_usd (legacy) AND balance_pc (new)
- Atomically updates both columns on organization_task_credits (or user_task_credits if no org)
- Returns topup_id (UUID)

**Test Validation**: TEST 10 verifies $30 topup = 3000 PC ✓ Correct

---

### 3. Authorization & auth.uid() Context

**Architecture**: ALL protected RPCs use SECURITY DEFINER + auth.uid()

**Execution Flow**:
1. Renderer signs in with authenticatedClient.auth.signInWithPassword()
2. Session stored in Supabase client's internal state
3. RPC called via authenticatedClient.rpc(...)
4. Supabase JS SDK sends JWT bearer token
5. Server receives request with auth context
6. RPC executes with auth.uid() = requesting user's UUID

**Key Functions Used in RPCs**:
- `is_org_member(org_id, auth.uid())` — checks organization_members table
- `auth.uid()` — current authenticated user UUID
- `auth.uid() IS NULL` — detects unauthenticated requests

**Test Dependency**: Session must be properly maintained across all RPC calls

---

### 4. Organization Membership Model & RLS

**organization_members** table:
- Columns: user_id, organization_id, role, status
- Roles: owner, organizationOwner, organizationAdministrator, workspaceAdministrator, member
- Status: active, invited, inactive

**is_org_member(org_id, user_id) Function**:
- Returns BOOLEAN
- Checks if user_id has active membership in org_id OR is owner

**autonomous_task_runs RLS**:
```sql
CREATE POLICY autonomous_task_runs_select_own_org
  FOR SELECT USING (
    is_org_member(organization_id, auth.uid())
    OR organization_id IN (SELECT id FROM organizations WHERE owner_user_id = auth.uid())
  );
```
**Implication**: Only org members + org owner can see runs

**Test Implications**:
- Single test user in TEST fixture is owner of testOrgId
- All runs created for testOrgId
- Authenticated client will see those runs (authorization passes)
- Multi-user auth test requires creating User B + separate organization

---

### 5. Billing Event Creation & Settlement Semantics

**settle_autonomous_task_run_pc() Behavior** (20260904000001):

```
PRE-CONDITIONS:
- Run status MUST be: completed, failed, cancelled, abandoned
- Run.settled_at MUST be NULL (not already settled)
- p_actual_pc MUST be <= run.reserved_pc

OPERATIONS (atomic transaction):
1. Calculate unused_pc = reserved_pc - actual_pc
2. IF unused_pc < 0 RAISE EXCEPTION (data integrity error)
3. Release unused: wallet.balance_pc += unused_pc
4. Clear reservation: wallet.balance_reserved -= reserved_pc
5. Mark run: settled_at = NOW(), settled_pc = actual_pc
6. INSERT billing_event with:
   - amount_pc = actual_pc (ACTUAL consumed, not reserved)
   - status = run.status (terminal state preserved)
   - completed_at = NOW()
7. RETURN billing_event_id (UUID)

IDEMPOTENCY:
IF run.settled_at IS NOT NULL:
  - SELECT existing billing_event
  - RETURN existing billing_event_id (no mutation)

CONSERVATION INVARIANT (maintained by settlement):
  balance_pc + balance_reserved + sum(settled_pc) = opening_pc + topups_pc
```

**Test Implications**:
- After settlement, check organization_billing_events table for amount_pc (not amount_usd)
- amount_pc is the ground truth for actual consumption
- Idempotency verified by checking settled_pc (immutable once set)

---

### 6. Session Persistence in Node.js Test Environment

**Issue Identified**: Test uses WebSocket transport for Realtime (correct for Node.js), but session persistence not explicitly verified.

**Supabase JS SDK Behavior**:
- `signInWithPassword()` sets session in client's internal state
- Session persists for that client instance across subsequent calls
- BUT: No localStorage in Node.js (browser storage mechanism unavailable)
- SDK should use in-memory storage in Node.js

**Test Gap**: No explicit verification that session.user.id === testUserId across RPC calls

**Mitigation**: Add explicit session verification before and after each test

---

## PHASE 2: TEST HARNESS UPGRADE STRATEGY

### Tests Requiring Fixes

#### BLOCKER #1: Verify Session Persistence
**File**: Phase3-Staging-Integration.test.ts, beforeAll (lines 77-83)
**Issue**: Session created but never verified to persist
**Fix**: After sign-in, call `getSession()` and assert session exists

```typescript
// ADD after line 83:
const { data: sessionCheck } = await authenticatedClient.auth.getSession();
if (!sessionCheck.session?.user?.id || sessionCheck.session.user.id !== testUserId) {
  throw new Error(`Session verification failed: expected ${testUserId}, got ${sessionCheck.session?.user?.id}`);
}
```

#### BLOCKER #2: Multi-User Authorization Test (MISSING)
**File**: Phase3-Staging-Integration.test.ts
**Issue**: No test with User A creating run, User B attempting operation
**Fix**: ADD new test after TEST 13

```typescript
// TEST 14 REPLACEMENT: Authorization Boundary Test
// Creates User A + Org A, User B + separate identity
// User A creates run in Org A
// User B attempts extend (must be rejected)
// Assert auth error + zero wallet mutation
```

#### BLOCKER #3: RPC Signature Verification ✅ RESOLVED
**Finding**: RPC signatures verified against migrations.
- reserve_autonomous_task_pc(p_run_id, p_pc_to_reserve) ✓ CORRECT
- extend_autonomous_reservation(p_run_id, p_additional_pc, p_extension_request_id, p_executor_instance_id) ✓ CORRECT
- settle_autonomous_task_run_pc(p_run_id, p_actual_pc) ✓ CORRECT
- add_ticket_balance(p_organization_id, p_amount_usd, p_payment_reference) ✓ CORRECT
**No changes needed to test file**.

#### BLOCKER #4: Billing Event Verification (PARTIAL TESTS)
**Files**: TEST 5, 11, 12, 13
**Issue**: Settlement tests don't check organization_billing_events
**Fix**: After each settlement, query billing_events and assert:
- Exactly one row created
- amount_pc matches actual_pc parameter
- status matches run.status
- settled_at is recent

#### BLOCKER #5: Idempotency Table Checks (PARTIAL TESTS)
**Files**: TEST 2, TEST 8
**Issue**: Don't verify autonomous_reservation_requests uniqueness
**Fix**: Query autonomous_reservation_requests and assert exactly one row per request_id

#### BLOCKER #6: Tier Compute Isolation (MISSING)
**Issue**: Tier Compute pool not found in deployed schema
**Fix**: Mark test BLOCKED with explanation, remove from 14-test count

#### BLOCKER #7: Concurrency Test (SUPERFICIAL)
**File**: TEST 8 (Extension Idempotency)
**Issue**: Sequential execution, not true concurrency
**Fix**: Replace with genuine test using Promise.all() and overlapping RPC calls (if possible) OR mark BLOCKED if staging doesn't support true DB-level row contention simulation

#### BLOCKER #8: Conservation Invariant (SUPERFICIAL)
**File**: TEST 14
**Issue**: Uses hard-coded settled_pc constant instead of reading from billing_events
**Fix**: Query organization_billing_events and read actual amount_pc as source of truth

---

### New Tests Required

#### NEW TEST A: Insufficient Initial Reservation
**Scenario**: Wallet has 500 PC, attempt to reserve 1000 PC
**Expected**: Rejection, zero wallet mutation

#### NEW TEST B: Failed Run Settlement
**Scenario**: Run with status='failed', settle with actual=300
**Expected**: Charge 300 PC, release unused, create billing event with status='failed'

#### NEW TEST C: Cancelled Run Settlement
**Scenario**: Run with status='cancelled', settle with actual=0
**Expected**: Full refund, charge 0, create billing event with status='cancelled'

#### NEW TEST D: Abandoned Run Settlement
**Scenario**: Run with status='abandoned', settle with actual=0
**Expected**: Full refund, charge 0, create billing event with status='abandoned'

#### NEW TEST E: Genuine Concurrency (if possible)
**Scenario**: Two independent sessions attempt to extend same wallet
**Expected**: Only one succeeds, wallet mutated exactly once

---

### Tests That Must Be Removed/Marked BLOCKED

#### TEST 14: Conservation Invariant (Currently SUPERFICIAL)
**Action**: Replace with proper test using actual billing_events data, OR split into two:
- Conservation Test A: Hard-coded scenario with known ledger entries
- Conservation Test B: Read actual DB records post-transaction

#### Tier Compute Isolation
**Action**: Mark BLOCKED until Tier Compute pool schema is deployed OR clarify that "Tier Compute" = organizations.tier (static subscription level)

---

## Summary Table: Fixes by Test

| Test | Issue | Fix | Status |
|------|-------|-----|--------|
| 1 | No auth verification | Add getSession() check | TODO |
| 2 | Idempotency not checked in DB | Query autonomous_reservation_requests | TODO |
| 3 | Executor validation opaque | Verify run.execution_executor_instance_id | TODO |
| 4 | Wrong executor behavior opaque | Add RLS error assertion | TODO |
| 5 | No billing event check | Query organization_billing_events | TODO |
| 6 | RLS error not verified | Verify error code/message | TODO |
| 7 | RLS error not verified | Verify error code/message | TODO |
| 8 | Idempotency not checked in DB | Query autonomous_reservation_requests | TODO |
| 9 | Insufficient extension not verified | Verify RLS rejection reason | TODO |
| 10 | Conversion rate hard-coded | Document or read from config | TODO |
| 11 | No billing event check | Query organization_billing_events | TODO |
| 12 | No billing event check | Query organization_billing_events | TODO |
| 13 | No billing event check | Query organization_billing_events | TODO |
| 14 | Uses hard-coded settled_pc | Read actual amount_pc from billing_events | TODO |
| N/A | Insufficient initial reservation | NEW TEST | TODO |
| N/A | Failed run settlement | NEW TEST | TODO |
| N/A | Cancelled run settlement | NEW TEST | TODO |
| N/A | Abandoned run settlement | NEW TEST | TODO |
| N/A | Multi-user authorization | NEW TEST | TODO |
| N/A | Concurrency (if possible) | NEW TEST | BLOCKED/TODO |
| N/A | Tier Compute isolation | MARK BLOCKED | BLOCKED |

---

## Resolved Questions

1. ✅ **reserve_autonomous_task_pc() RPC**: 
   - Signature: (p_run_id UUID, p_pc_to_reserve INTEGER) → autonomous_task_runs
   - Source: 20260903000000_autonomous_option_b_settlement.sql
   - Test usage CORRECT

2. ✅ **add_ticket_balance() RPC**:
   - Signature: (p_organization_id UUID, p_amount_usd NUMERIC, p_payment_reference TEXT) → UUID
   - Source: 20260903000000_autonomous_option_b_settlement.sql (lines 20-71)
   - Test usage CORRECT

## Remaining Unresolved Questions

3. **Tier Compute**: What is the authoritative definition?
   - Is it a separate balance pool (not found in schema)?
   - Is it organizations.tier (subscription level)?
   - Is it a future feature?
   - Resolution: Clarify with user or product requirements
   - **RECOMMENDATION**: Mark "Tier Compute isolation" test BLOCKED until clarified

4. **Session Persistence in Node.js**: How does Supabase JS SDK maintain sessions without localStorage?
   - Does in-memory storage work across calls?
   - Do we need explicit session passing?
   - Resolution: Test explicitly and document pattern

5. **Concurrency**: Can staging DB lock rows reliably for testing?
   - Can two simultaneous RPC calls trigger row contention?
   - Or is it acceptable to mark concurrency BLOCKED?
   - Resolution: Attempt genuine concurrency test, mark BLOCKED if unreliable

---

## Recommendation

**DO NOT RUN tests yet**. Fix order:

1. **Immediate** (unblocks all): Verify RPC signatures against staging
2. **High-priority** (weeks validation): Add billing event assertions to 8 settlement tests
3. **High-priority**: Add multi-user authorization test
4. **Medium-priority**: Replace hard-coded values in TEST 14 with DB reads
5. **Medium-priority**: Add NEW TESTS for failed/cancelled/abandoned settlement
6. **Low-priority**: Attempt genuine concurrency test; mark BLOCKED if unreliable
7. **Clarification**: Resolve Tier Compute definition with product

**Estimated effort**: 4-6 hours to fix and verify all changes

**Exit criteria before execution**:
- ✅ RPC signatures verified
- ✅ All 14 test scenarios implemented
- ✅ No hard-coded values used as source of truth
- ✅ Multi-user authorization test present
- ✅ Billing event assertions complete
- ✅ Session persistence explicitly verified
- ✅ Non-implementable tests marked BLOCKED with reason
- ✅ TypeScript compilation succeeds
- ✅ User approves final report before execution
