# PHASE 3 CHECKPOINT 3: RENDERER INTEGRATION — INCOMPLETE

**Timestamp**: 2026-09-02  
**Status**: INCOMPLETE — Critical blockers identified, work in progress

---

## A. REPOSITORY STATE BEFORE CHECKPOINT 3

### From Checkpoints 1 & 2 (Complete)

✓ Checkpoint 1: Database migration 20260902000001 with all RPCs and schema
✓ Checkpoint 2: UsageEventStore crash-safe checkpoints, settlement IPC handler

### Current Renderer State (Partial Implementation)

**AutonomousOrchestrator.ts**:
- ✓ orchestrateAutonomousRun() exists
- ✓ PC reservation before execution (line 433: `await deps.billingService.reservePC()`)
- ✓ Transition to waiting_for_topup on reservation failure (line 436)
- ✓ Basic execution flow present
- ✓ Settlement calls present (lines 528-577)
- ✗ Executor instance ID capture/propagation NOT implemented
- ✗ mark_autonomous_execution_started/completed calls missing
- ✗ Orchestration input persistence missing
- ✗ Resume path incomplete

**AutonomousTaskBillingService.ts**:
- ✓ reservePC() method added (idempotent)
- ✓ extendReservation() method exists
- ✓ Multiple extend_autonomous_reservation RPC calls
- **✗ CRITICAL BLOCKER**: extend_autonomous_reservation calls are 3-parameter (old signature)
  - Line ~153: `rpc('extend_autonomous_reservation', { p_run_id, p_additional_pc, p_extension_request_id })`
  - Line ~332: `rpc('extend_autonomous_reservation', { ... })` (same issue)
  - Missing: `p_executor_instance_id` parameter (NEW in Phase 3)
- ✓ settleAutonomousRun() method exists
- ✓ completeRun() now routes to settleAutonomousRun()
- ✓ resumeWaitingAutonomousRuns() method exists (line 387 area)
- ✗ Resume method does NOT create fresh executor claim
- ✗ Resume method does NOT load persisted orchestration_input

**AppRoot.tsx**:
- ✓ Event listener for billing:taskCreditsPurchased partially added
- ✗ Resume function NOT wired to listener
- ✗ Global listener may not be authoritative

**Tests**:
- ✓ Test files created (AutonomousOrchestrator.test.ts, acceptance tests)
- ✗ Tests NOT covering all Checkpoint 3 scenarios
- ✗ Tests do NOT verify executor instance ID propagation
- ✗ Tests do NOT verify orchestration_input persistence/resume

---

## B. CRITICAL BLOCKERS

### BLOCKER 1: extend_autonomous_reservation Signature Mismatch

**Location**: AutonomousTaskBillingService.ts lines ~153 and ~332

**Issue**:
- Phase 3.1 approved RPC signature: `extend_autonomous_reservation(p_run_id, p_additional_pc, p_extension_request_id, p_executor_instance_id)`
- Current renderer calls: `rpc('extend_autonomous_reservation', { p_run_id, p_additional_pc, p_extension_request_id })`
- **Missing parameter**: `p_executor_instance_id` (UUID)

**Fix Required**:
1. Add `p_executor_instance_id` parameter to extendReservation() method signature
2. Pass executor_instance_id to BOTH extend_autonomous_reservation RPC calls
3. Update all callers of extendReservation() to supply executor_instance_id

**Impact**: Currently, every PC extension attempt will fail at the database layer (RPC signature mismatch).

---

### BLOCKER 2: Executor Instance ID Not Captured

**Location**: AutonomousOrchestrator.ts orchestrateAutonomousRun()

**Issue**:
- Executor instance ID must be captured from the execution claim
- Must be passed to extend_autonomous_reservation for every extension
- Must be passed to mark_autonomous_execution_started/completed
- Currently: NO execution claim operation exists in the code
- Currently: No executor_instance_id variable being tracked

**Fix Required**:
1. Implement execution claim operation (currently missing RPC call)
2. Capture executor_instance_id from claim response
3. Store executor_instance_id for lifetime of execution
4. Pass to extend_autonomous_reservation on every extension
5. Pass to mark_autonomous_execution_started/completed

**Impact**: Execution cannot properly claim identity; extensions cannot verify executor; completion marks are inauthentic.

---

### BLOCKER 3: mark_autonomous_execution_started/completed Not Called

**Location**: AutonomousOrchestrator.ts orchestrateAutonomousRun() and finishAutonomousRun()

**Issue**:
- Three new RPC methods must be called:
  - mark_autonomous_execution_started(run_id, executor_instance_id)
  - mark_autonomous_execution_completed(run_id, terminal_status, executor_instance_id)
  - transition_to_waiting_for_topup(run_id)
- Currently: These calls are MISSING from the code
- Currently: The lifecycle does not signal execution started/completed to database

**Fix Required**:
1. Call mark_autonomous_execution_started BEFORE actual execution begins
2. Call mark_autonomous_execution_completed AFTER execution terminal state reached
3. Call transition_to_waiting_for_topup on extension failure + waiting_for_topup transition
4. Ensure proper sequencing:
   - Started before execution
   - Completed after execution + flush + before settlement

**Impact**: Database execution state never recorded; resume path cannot continue execution from correct point.

---

### BLOCKER 4: Settlement RPC Caller Verification

**Location**: TBD (need to verify settle_autonomous_task_run_pc calls)

**Issue**:
- Per v3.1 and Checkpoint 2, settlement MUST go through main-process IPC
- Renderer must NOT directly call settle_autonomous_task_run_pc RPC
- Renderer must call `billing:settleAutonomousRun(runId)` main-process IPC handler
- Need to verify NO direct RPC calls exist from renderer

**Fix Required**:
1. Search for `settle_autonomous_task_run_pc` in renderer code
2. Ensure all settle calls go through main-process IPC only
3. Main process handles actual_pc calculation

**Impact**: If renderer calls settle RPC directly, it can supply arbitrary actual_pc and bypass authe ntication.

---

### BLOCKER 5: Orchestration Input Persistence

**Location**: AutonomousOrchestrator.ts orchestrateAutonomousRun()

**Issue**:
- orchestration_input JSON must be persisted BEFORE run becomes resumable
- Currently: No orchestration_input persistence in code
- Resume path cannot work without persisted input

**Fix Required**:
1. After successful PC reservation, before execution starts
2. Call database method to store orchestration_input as JSONB
3. Include: ticket info, cwd, worktree path, branch name, all needed for resume
4. Load and use on resume path

**Impact**: Runs cannot be reliably resumed; resume loses critical context.

---

### BLOCKER 6: Resume Path Incomplete

**Location**: AutonomousTaskBillingService.ts resumeWaitingAutonomousRuns()

**Issue**:
- Resume must:
  1. Call resume_and_claim_autonomous_run(run_id, resume_request_id) [NEW RPC]
  2. Get fresh executor_instance_id from claim response
  3. Load persisted orchestration_input
  4. Continue execution with SAME run_id
- Currently: Method exists but does NOT create fresh executor claim
- Currently: Method does NOT load orchestration_input
- Currently: Method calls extendReservation (which is currently broken for other reasons)

**Fix Required**:
1. Implement resume_and_claim_autonomous_run() RPC call
2. Capture fresh executor_instance_id from response
3. Load orchestration_input from database
4. Re-enter execution flow with correct context
5. Ensure SAME run_id used throughout

**Impact**: Top-up resume cannot actually restart execution; system enters dead-end state.

---

### BLOCKER 7: AppRoot Top-Up Listener

**Location**: AppRoot.tsx

**Issue**:
- billing:taskCreditsPurchased event must trigger resumeWaitingAutonomousRuns()
- Currently: Event listener partially added
- Unclear if listener actually calls resume function
- May not be authoritative global listener

**Fix Required**:
1. Verify listener is in AppRoot (correct, global location)
2. Wire listener to call autonomousTaskBillingService.resumeWaitingAutonomousRuns()
3. No duplicate listeners in components
4. Test that top-up events trigger resume

**Impact**: Top-up events don't trigger resume; waiting_for_topup runs stuck.

---

## C. INCOMPLETE ITEMS AFFECTING TESTS

### Missing RPC Method: resume_and_claim_autonomous_run

**Required signature** (from v3.1 Checkpoint 1 spec):
```typescript
resume_and_claim_autonomous_run(
  p_run_id: UUID,
  p_resume_request_id: TEXT
) RETURNS TABLE (
  run_id UUID,
  execution_claimed_by UUID,
  execution_executor_instance_id UUID,
  execution_claim_request_id TEXT,
  status TEXT,
  reserved_pc INTEGER,
  error_message TEXT
)
```

This RPC **already exists** in the database (Checkpoint 1), but renderer code does NOT call it yet.

---

### Missing RPC Method: mark_autonomous_execution_started

**Already in database** (Checkpoint 1), not called from renderer yet.

---

### Missing RPC Method: mark_autonomous_execution_completed

**Already in database** (Checkpoint 1), not called from renderer yet.

---

### Missing RPC Method: transition_to_waiting_for_topup

**Already in database** (Checkpoint 1), not called from renderer yet.

---

## D. VERIFICATION STATUS

### TypeScript Compilation

```
npx tsc --noEmit
→ (NOT RUN YET in this session)
```

**Expected result**: Will show errors related to:
- extend_autonomous_reservation signature mismatch
- Missing RPC method calls
- Type mismatches on executor_instance_id

---

### Tests

**Status**: Created but NOT validated

Files:
- src/renderer/organization/AutonomousOrchestrator.test.ts
- src/renderer/organization/AutonomousTaskBilling.option-b.test.ts
- src/main/billing/AutonomousWorkPC.integration.test.ts

**Issues**:
- Tests do NOT cover Checkpoint 3 scenarios
- Tests do NOT verify executor instance propagation
- Tests do NOT verify orchestration_input persistence
- Tests do NOT verify resume path

---

## E. WORK REMAINING (CHECKPOINT 3)

### MUST COMPLETE:

1. **Fix extend_autonomous_reservation signature**
   - Add p_executor_instance_id parameter
   - Update 2+ RPC call sites
   - Update method signature
   - Propagate executor_instance_id through callers

2. **Implement executor instance lifecycle**
   - Capture executor_instance_id from claim
   - Store for lifetime of execution
   - Pass to extend, started, completed operations
   - Clear on claim release

3. **Implement mark_* RPC calls**
   - mark_autonomous_execution_started before execution
   - mark_autonomous_execution_completed after execution
   - transition_to_waiting_for_topup on extension failure

4. **Implement orchestration_input persistence**
   - Persist after successful reservation
   - Load on resume path
   - Use to reconstruct execution context

5. **Complete resume path**
   - Call resume_and_claim_autonomous_run
   - Get fresh executor_instance_id
   - Load orchestration_input
   - Continue execution with SAME run_id
   - Ensure idempotency by request_id

6. **Verify settlement flow**
   - Ensure all settle calls go through main-process IPC
   - NO direct RPC calls from renderer
   - Renderer passes only runId, not arbitrary PC

7. **Wire AppRoot listener**
   - Verify top-up event triggers resume
   - No duplicate listeners
   - Authoritative global listener

8. **Update/add tests**
   - Executor instance capture & propagation
   - Orchestration input persistence & resume
   - Waiting_for_topup transition
   - Top-up resume flow
   - Extension failures
   - Cancellation scenarios

---

## F. NEXT STEPS

### Immediate (Blockers to fix):

1. Update extend_autonomous_reservation calls (+p_executor_instance_id)
2. Implement executor instance capture and propagation
3. Add mark_autonomous_execution_started/completed calls
4. Implement orchestration_input persistence
5. Complete resume_and_claim_autonomous_run integration
6. Verify settlement flow uses main-process IPC

### Verification:

1. Run `npx tsc --noEmit` — should pass
2. Run renderer tests — should pass
3. Repository-wide search for extend_autonomous_reservation, settle_autonomous_task_run_pc, etc.
4. Verify no remaining 3-parameter extend calls
5. Verify no renderer-side settle RPC calls

---

## G. PHASE 3 CHECKPOINT 3 STATUS

**Current Status**: INCOMPLETE

**Blockers Identified**: 7 (see section B above)

**Critical Path**:
1. Blocker 1 (extend signature) — MUST fix before any extension works
2. Blocker 2 (executor instance) — MUST implement for auth/identity
3. Blocker 3 (mark_* calls) — MUST implement for state tracking
4. Blocker 4 (settlement flow) — MUST verify for billing safety
5. Blockers 5-7 — MUST implement for working resume/top-up

**Safe to Deploy**: NO (multiple critical blockers)

**Remaining Work**: Substantial — all 7 blockers must be resolved before Checkpoint 3 is complete.

---

**End of Phase 3 Checkpoint 3 Status Report**
