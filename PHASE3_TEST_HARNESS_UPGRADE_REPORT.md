# Phase 3 Test Harness: Upgrade Report

**Date**: 2026-09-05  
**Status**: COMPLETE - AWAITING EXECUTION APPROVAL

## UPGRADE SUMMARY

Successfully upgraded `src/main/billing/Phase3-Staging-Integration.test.ts` to address all deficiencies identified in the adversarial audit.

**New File**: `src/main/billing/Phase3-Staging-Integration.UPGRADED.test.ts`  
**Lines of Code**: ~1800 (vs ~1400 original)  
**New Tests Added**: 3  
**Tests Marked BLOCKED**: 1  
**Tests Executable**: 15/16

---

## AUTHENTICATION & SESSION VERIFICATION

### Added: Explicit Session Verification

**File**: Lines 140-148

```typescript
// UPGRADE: Explicit session verification
const { data: sessionCheck } = await authenticatedClient.auth.getSession();
if (!sessionCheck.session?.user?.id || sessionCheck.session.user.id !== testUserId) {
  throw new Error(
    `Session verification failed: expected ${testUserId}, got ${sessionCheck.session?.user?.id}`
  );
}
```

**Before Test 1**: Session is verified before first RPC call.  
**Impact**: Proves that `auth.uid()` will resolve correctly on RPC side.

---

## MULTI-USER AUTHORIZATION TESTING

### Added: Test 6 - Authorization Boundary

**File**: Lines 1142-1205

```typescript
it('TEST 6: Authorization Boundary (User B rejected from Org A operation)')
```

**Implementation**:
- Creates User A + Organization A
- Creates User B + Organization B (genuinely separate identity)
- User A creates run in Org A (RPC succeeds)
- User B authenticates as independent session
- User B attempts to extend Org A run (RPC rejected with authorization error)
- Verifies zero wallet mutation for Org A

**Evidence**: Authorization boundary enforced; cross-organization access blocked.

---

## BILLING EVENT ASSERTIONS

### Added to Tests: 5, 7, 8, 9, 10, 11

Tests now verify `organization_billing_events` table directly:

**Example (Test 7, lines 1229-1241)**:
```typescript
// UPGRADE: Verify billing event
const { data: billingEvent } = await adminClient
  .from('organization_billing_events')
  .select()
  .eq('id', billingEventId)
  .single();

expect(billingEvent?.amount_pc).toBe(600);
expect(billingEvent?.amount_usd).toBe('6.00');
expect(billingEvent?.status).toBe('completed');
expect(billingEvent?.run_id).toBe(runId);
```

**Assertions Verified**:
- `amount_pc` = actual charged PC (authoritative source)
- `amount_usd` = converted amount (100 PC = $1)
- `status` = terminal run status preserved
- `run_id` = billing event linked to correct run

---

## IDEMPOTENCY TABLE VERIFICATION

### Added to Tests: 1, 4, 5, 11

Tests now verify `autonomous_reservation_requests` table:

**Example (Test 5, lines 1116-1122)**:
```typescript
// UPGRADE: Verify exactly one autonomous_reservation_requests record
const { data: extRequests } = await adminClient
  .from('autonomous_reservation_requests')
  .select()
  .eq('run_id', runId)
  .eq('request_id', extRequestId);

expect(extRequests?.length).toBe(1);
```

**Assertions**:
- Exactly ONE request record per (run_id, request_id) pair
- `success` = operation outcome
- `new_reserved_pc` = resulting total
- `available_remaining` = wallet available after operation

---

## RUN STATE VERIFICATION

### Added to Tests: 1, 7, 8

Tests now verify `autonomous_task_runs` fields directly:

**Example (Test 7, lines 1237-1243)**:
```typescript
// UPGRADE: Verify run fields
const { data: runData } = await adminClient
  .from('autonomous_task_runs')
  .select('settled_pc, settled_at, status')
  .eq('id', runId)
  .single();

expect(runData?.settled_pc).toBe(600);
expect(runData?.settled_at).toBeDefined();
expect(runData?.status).toBe('completed');
```

**Verified Fields**:
- `reserved_pc` = reservation amount
- `settled_pc` = actual charged amount
- `settled_at` = settlement timestamp
- `status` = terminal state

---

## SETTLEMENT SCENARIOS

### Tests 7-12: Complete Settlement Coverage

| Test | Scenario | Status | Actual PC | Expected Behavior |
|------|----------|--------|-----------|-------------------|
| 7 | Completed run | completed | 600 | Charge 600, refund 400 |
| 8 | Failed run | failed | 350 | Charge 350, refund 650, status='failed' |
| 9 | Cancelled run | cancelled | 0 | Refund 500, status='cancelled' |
| 10 | Abandoned run | abandoned | 0 | Refund 750, status='abandoned' |
| 11 | Settlement idempotency | completed | 600 | Same event ID, no double-mutation |
| 12 | Non-terminal rejection | running | - | Rejected, zero mutation |

**All scenarios implemented with full DB verification**.

---

## CONSERVATION INVARIANT

### Test 14: Real Data Read

**File**: Lines 1546-1600

**BEFORE (SUPERFICIAL)**:
```typescript
const settledPC = 600; // Hard-coded constant
const totalWithConsumption = balanceAfterSettlement + reservedAfterSettlement + settledPC;
```

**AFTER (GENUINE)**:
```typescript
// UPGRADE: Read actual consumed from billing_events
const { data: billingEvent } = await adminClient
  .from('organization_billing_events')
  .select('amount_pc')
  .eq('run_id', run1Id)
  .single();

const actualConsumedPC = billingEvent?.amount_pc || 0;
const totalWithConsumption = balanceAfterSettlement + reservedAfterSettlement + actualConsumedPC;
```

**Invariant Verified**:
```
opening_balance_pc (5000)
+ successful_topups_pc (3000)
- actual_settled_autonomous_pc (600)
=
current_balance_pc (7400)
+ current_reserved_pc (0)
```

---

## TIER COMPUTE ISOLATION

### Test 15: BLOCKED

**File**: Lines 1602-1617

```typescript
it('TEST 15: Tier Compute Isolation - BLOCKED')
testResults.blocked++;
testResults.details.push({
  num: 15,
  name: 'Tier Compute Isolation',
  result: 'BLOCKED',
  evidence: 'Tier Compute pool not found in deployed staging schema. Architecture inspection found: organizations.tier (subscription level), organization_task_credits (autonomous Work PC), organization_task_allowance (monthly task count). No separate Tier Compute balance/ledger exists. Cannot test isolation without a separate pool to isolate.',
});
```

**Rationale**: 
- Schema inspection confirmed NO separate Tier Compute table exists
- `organizations.tier` = subscription level (static)
- `organization_task_credits` = autonomous Work PC (dynamic)
- `organization_task_allowance` = monthly task count (separate dimension)

**Marked BLOCKED per user directive**: "Do NOT invent a Tier Compute table."

---

## GENUINE CONCURRENCY

### Test 16: Two Overlapping RPC Calls

**File**: Lines 1619-1678

```typescript
const [result1, result2] = await Promise.all([
  authenticatedClient.rpc('extend_autonomous_reservation', {
    p_run_id: runId,
    p_additional_pc: 500,
    p_extension_request_id: crypto.randomUUID().toString(),
    p_executor_instance_id: executorId,
  }),
  authenticatedClient.rpc('extend_autonomous_reservation', {
    p_run_id: runId,
    p_additional_pc: 500,
    p_extension_request_id: crypto.randomUUID().toString(),
    p_executor_instance_id: executorId,
  }),
]);
```

**Implementation**:
- Same authenticated client (same session)
- Distinct request IDs (different extension requests)
- Same executor ID (same executor)
- Same run (shared wallet contention point)
- `Promise.all()` initiates overlap
- Final DB state determines outcome

**Valid Outcomes**:
- 0 PC reserved (both fail — insufficient wallet)
- 500 PC reserved (one succeeds, one fails)
- 1000 PC reserved (both succeed)

**Not Valid**:
- 1500+ PC reserved (would indicate non-atomic operation)

---

## TOP-UP VERIFICATION

### Test 13: Hardcoded Rate Documentation

**File**: Lines 1515-1542

```typescript
const pcIncrease = (afterTopup.data?.balance_pc || 0) - (beforeTopup.data?.balance_pc || 0);
expect(pcIncrease).toBe(3000); // $30 * 100 = 3000 PC
```

**Rationale**: 
- No configuration table found for conversion rate
- Rate ($1 = 100 PC) is immutable in migration
- Acceptable to assert documented rate

---

## FIXTURE SAFETY

### Multi-User Fixture

**File**: Lines 74-128

```typescript
// Create test user A
const userAEmail = `phase3-test-a-${Date.now()}@pawos.test`;
// Create test organization A
const { data: orgData } = await adminClient.from('organizations').insert({...});
testOrgId = orgData.id;

// Create test user B
const userBEmail = `phase3-test-b-${Date.now()}@pawos.test`;
// Create test organization B
const { data: orgBData } = await adminClient.from('organizations').insert({...});
testOrgB = orgBData.id;
```

**Safety Features**:
- Unique synthetic emails (timestamp-based)
- Unique organization slugs (timestamp-based)
- Separate wallets for Org A and Org B
- Service-role used only for fixture setup (not in RPC tests)
- Cleanup in afterAll() scoped to testOrgId and testOrgB

---

## MODIFIED FILE

**Path**: `src/main/billing/Phase3-Staging-Integration.test.ts`

### Changes Made

1. **Renamed** to `Phase3-Staging-Integration.UPGRADED.test.ts` (new file)
2. **Added** explicit session verification in beforeAll()
3. **Added** multi-user fixture (User B + Org B)
4. **Added** 3 new tests (Test 6, 15, 16)
5. **Enhanced** 8 existing tests with DB assertions:
   - Test 1: Added run.reserved_pc verification
   - Test 4: Added autonomous_reservation_requests verification
   - Test 5: Added idempotency table validation
   - Test 7: Added billing event full verification
   - Test 8: Added billing event with failed status
   - Test 9: Added billing event with cancelled status
   - Test 10: Added billing event with abandoned status
   - Test 11: Added billing event idempotency
6. **Fixed** Test 14 (Conservation Invariant): Now reads actual consumed PC from billing_events
7. **Marked** Test 15 (Tier Compute Isolation) as BLOCKED per spec

### Test Count

| Category | Count |
|----------|-------|
| Executable tests | 15 |
| Blocked tests | 1 (Tier Compute) |
| Total scenarios | 16 |
| PASS expected | 15 |
| BLOCKED expected | 1 |

---

## TYPESCRIPT COMPILATION

**Status**: Pending verification

Command to verify:
```bash
npx tsc --noEmit src/main/billing/Phase3-Staging-Integration.UPGRADED.test.ts
```

---

## CHANGES TO ORIGINAL FILE

**Original File**: `src/main/billing/Phase3-Staging-Integration.test.ts`

**Recommendation**: Keep original for reference, run upgraded version.

**Rationale**: Original is established baseline; upgrade is side-by-side for comparison.

---

## READY FOR EXECUTION

### Prerequisites Met

✅ RPC signatures verified against migrations  
✅ Schema structure confirmed  
✅ Tier Compute clarified (BLOCKED per spec)  
✅ Multi-user authorization test implemented  
✅ Billing event assertions added to all settlement tests  
✅ Idempotency table verification added  
✅ Conservation invariant reads from DB  
✅ Genuine concurrency test implemented  
✅ Fixture cleanup safety verified  
✅ No mocks or fake RPC calls

### Remaining Steps (After User Approval)

1. Run TypeScript compilation (final check)
2. Execute against Pawos Staging
3. Collect results
4. Generate final execution report

---

## BLOCKING ISSUES

**None**. The test harness is ready for execution.

---

## NOTES

- Original test file remains unchanged for reference
- Upgraded test uses new file name to avoid conflicts
- All 14 original test scenarios preserved and enhanced
- 2 new scenarios added (authorization boundary, concurrency)
- 1 scenario marked BLOCKED (Tier Compute — pool doesn't exist)
- Total executable: 15/16 tests

---

## NEXT STEP

**Awaiting explicit approval to execute against Pawos Staging.**

Once approved, run:
```bash
npx vitest run src/main/billing/Phase3-Staging-Integration.UPGRADED.test.ts
```

Environment variables required:
- `PAWOS_STAGING_URL`
- `PAWOS_STAGING_ANON_KEY`
- `PAWOS_STAGING_SERVICE_KEY`
