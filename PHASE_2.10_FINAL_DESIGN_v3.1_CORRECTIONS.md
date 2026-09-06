# PHASE 2.10 FINAL DESIGN (v3.1)

## Corrections to v3 — Final Implementation-Ready Specification

Last updated: 2026-09-02  
Status: **COMPLETE, READY FOR PHASE 3 REVIEW**

---

## A. CORRECTIONS MADE

### Correction 1: settle_autonomous_task_run_pc Complete SQL (Previously Missing)

Added complete, implementation-ready SQL specification for the authoritative settlement RPC.

### Correction 2: extend_autonomous_reservation Breaking Signature Change Documented

Explicitly listed every caller of extend_autonomous_reservation and the required Phase 3 updates.

Signature change: `(p_run_id, p_additional_pc, p_extension_request_id)` → `(p_run_id, p_additional_pc, p_extension_request_id, p_executor_instance_id)`

### Correction 3: Comprehensive RPC Signature Matrix

Created authoritative matrix with every autonomous billing RPC, current/proposed signatures, and Phase 3 caller updates.

---

## B. COMPLETE settle_autonomous_task_run_pc SQL

**Purpose**: Authoritative financial settlement. Charges actual PC, releases reservation, closes run.

**Caller**: IPC handler billing:settleAutonomousRun (main process → Supabase)

**Data Source**: actual_pc calculated by main process from UsageEventStore (NOT Supabase usage_events)

**Idempotency**: settled_at immutable once set; same run_id idempotent

```sql
CREATE OR REPLACE FUNCTION settle_autonomous_task_run_pc(
  p_run_id UUID,
  p_actual_pc INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run autonomous_task_runs%ROWTYPE;
  v_billing_event_id UUID;
  v_organization_id UUID;
  v_user_id UUID;
  v_reserved_pc INTEGER;
  v_unused_pc INTEGER;
  v_auth_uid UUID;
BEGIN
  -- 1. Verify authenticated
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Validate p_actual_pc (untrusted caller input)
  IF p_actual_pc IS NULL THEN
    RAISE EXCEPTION 'actual_pc is required';
  END IF;
  
  IF p_actual_pc < 0 THEN
    RAISE EXCEPTION 'actual_pc must be non-negative';
  END IF;

  -- 3. Lock and fetch run
  SELECT * INTO v_run
  FROM autonomous_task_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF v_run IS NULL THEN
    RAISE EXCEPTION 'Run % not found', p_run_id;
  END IF;

  -- 4. Verify authorization: user owns run
  IF v_run.user_id <> v_auth_uid THEN
    IF v_run.organization_id IS NOT NULL THEN
      IF NOT is_org_member(v_run.organization_id, v_auth_uid) THEN
        RAISE EXCEPTION 'Unauthorized: not run owner or org member';
      END IF;
    ELSE
      RAISE EXCEPTION 'Unauthorized: not run owner';
    END IF;
  END IF;

  v_organization_id := v_run.organization_id;
  v_user_id := v_run.user_id;

  -- 5. Settlement idempotency: if already settled, return cached billing_event_id
  IF v_run.settled_at IS NOT NULL THEN
    -- Run already settled; return the existing billing event
    SELECT id INTO v_billing_event_id
    FROM organization_billing_events
    WHERE run_id = p_run_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_billing_event_id IS NOT NULL THEN
      RETURN v_billing_event_id;
    ELSE
      RAISE EXCEPTION 'Run % already settled but no billing event found', p_run_id;
    END IF;
  END IF;

  -- 6. Verify run eligibility for settlement
  --    (can be in any terminal or near-terminal state)
  IF v_run.status NOT IN ('completed', 'failed', 'abandoned', 'blocked', 'running', 'waiting_for_permission', 'waiting_for_topup') THEN
    RAISE EXCEPTION 'Run % is in invalid state % for settlement', p_run_id, v_run.status;
  END IF;

  -- 7. Get original reservation
  v_reserved_pc := COALESCE(v_run.reserved_pc, 0);

  -- 8. Validate actual_pc against reservation (untrusted input verification)
  IF p_actual_pc > v_reserved_pc THEN
    RAISE EXCEPTION 'Data integrity error: run % tried to settle % PC but only % was reserved',
      p_run_id, p_actual_pc, v_reserved_pc;
  END IF;

  -- 9. Calculate unused PC to be released
  v_unused_pc := v_reserved_pc - p_actual_pc;

  -- 10. Lock wallet FOR UPDATE
  IF v_organization_id IS NOT NULL THEN
    -- Organization wallet
    PERFORM 1
    FROM organization_task_credits
    WHERE organization_id = v_organization_id
    FOR UPDATE;

    -- 11. Release entire reservation, return unused to balance_pc
    UPDATE organization_task_credits
    SET balance_pc = balance_pc + v_unused_pc,
        balance_reserved = balance_reserved - v_reserved_pc,
        updated_at = NOW()
    WHERE organization_id = v_organization_id;
  ELSE
    -- User wallet
    PERFORM 1
    FROM user_task_credits
    WHERE user_id = v_user_id
    FOR UPDATE;

    UPDATE user_task_credits
    SET balance_pc = balance_pc + v_unused_pc,
        balance_reserved = balance_reserved - v_reserved_pc,
        updated_at = NOW()
    WHERE user_id = v_user_id;
  END IF;

  -- 12. Update run: mark as financially settled
  --     (preserve execution status; settled_at and settled_pc immutable once set)
  UPDATE autonomous_task_runs
  SET settled_at = NOW(),
      settled_pc = p_actual_pc,
      updated_at = NOW()
  WHERE id = p_run_id;

  -- 13. Create immutable billing event (exactly once, never again for this run)
  INSERT INTO organization_billing_events (
    run_id,
    organization_id,
    workspace_id,
    user_id,
    ticket_id,
    runtime_version,
    started_at,
    completed_at,
    duration_seconds,
    status,
    event_type,
    amount_usd,
    amount_pc,
    invoice_reference,
    created_at
  ) VALUES (
    p_run_id,
    v_organization_id,
    v_run.workspace_id,
    v_user_id,
    v_run.ticket_id,
    v_run.runtime_version,
    v_run.started_at,
    NOW(),
    EXTRACT(EPOCH FROM (NOW() - v_run.started_at))::INTEGER,
    v_run.status,  -- PRESERVE actual execution terminal state
    'autonomous_work_pc',  -- event_type distinguishes from legacy autonomous_engineering_task
    ROUND(p_actual_pc::NUMERIC / 100, 2),  -- USD = PC / 100
    p_actual_pc,  -- amount_pc field (new for autonomous PC model)
    NULL,  -- invoice_reference (optional)
    NOW()
  )
  RETURNING id INTO v_billing_event_id;

  -- 14. Return the created billing event ID
  RETURN v_billing_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION settle_autonomous_task_run_pc(UUID, INTEGER) TO authenticated;
```

### Key Specifications

1. **Authentication**: `auth.uid()` required
2. **Authorization**: User ownership or org membership verified
3. **Idempotency**: settled_at immutable; second call returns cached billing_event_id
4. **Input validation**: p_actual_pc >= 0, p_actual_pc <= reserved_pc
5. **Atomic**: Single transaction, wallet lock, run update, billing event creation
6. **Data source**: p_actual_pc is authoritative input from main process (NOT queried from any table)
7. **Financial mutation**: 
   - balance_reserved -= reserved_pc (entire reservation released)
   - balance_pc += unused_pc (unused returned to available balance)
   - settled_pc = p_actual_pc (immutable once set)
   - settled_at = NOW() (immutable once set)
8. **Billing event**: Created exactly once, contains terminal status, PC and USD
9. **Return**: billing_event_id (idempotent key for retries)

---

## C. ALL extend_autonomous_reservation CALLERS

**Breaking Signature Change Announcement**:

The signature of extend_autonomous_reservation is CHANGING from 3 parameters to 4 parameters:

```sql
-- OLD (current repo):
extend_autonomous_reservation(p_run_id, p_additional_pc, p_extension_request_id)

-- NEW (Phase 3):
extend_autonomous_reservation(p_run_id, p_additional_pc, p_extension_request_id, p_executor_instance_id)
```

**Every caller of extend_autonomous_reservation MUST be updated in Phase 3.**

### Identified Callers

#### Caller 1: AutonomousTaskBillingService.extendReservation()

**File**: `src/renderer/organization/AutonomousTaskBillingService.ts`

**Method**: `extendReservation()` (line 146)

**Current invocation** (lines 153-157):
```typescript
const { data, error } = await supabase
  .rpc('extend_autonomous_reservation', {
    p_run_id: runId,
    p_additional_pc: additionalPc,
    p_extension_request_id: extensionRequestId,
  })
```

**Required Phase 3 update**:
```typescript
const { data, error } = await supabase
  .rpc('extend_autonomous_reservation', {
    p_run_id: runId,
    p_additional_pc: additionalPc,
    p_extension_request_id: extensionRequestId,
    p_executor_instance_id: executorInstanceId,  // NEW: from execution claim
  })
```

**Source of executor_instance_id**: Run's execution_executor_instance_id field (obtained from database or from claim_and_extend result)

---

#### Caller 2: AutonomousTaskBillingService.extendAutonomousReservation()

**File**: `src/renderer/organization/AutonomousTaskBillingService.ts`

**Method**: `extendAutonomousReservation()` (line 325)

**Current invocation** (lines 332-336):
```typescript
const { data, error } = await supabase
  .rpc('extend_autonomous_reservation', {
    p_run_id: runId,
    p_additional_pc: additionalPc,
    p_extension_request_id: extensionRequestId,
  })
```

**Required Phase 3 update**:
```typescript
const { data, error } = await supabase
  .rpc('extend_autonomous_reservation', {
    p_run_id: runId,
    p_additional_pc: additionalPc,
    p_extension_request_id: extensionRequestId,
    p_executor_instance_id: executorInstanceId,  // NEW: from execution claim
  })
```

**Source of executor_instance_id**: Run's execution_executor_instance_id field (obtained from database or from claim_and_extend result)

---

### Caller Search Scope

Phase 3 implementation MUST:
1. Search repository for all references to "extend_autonomous_reservation"
2. Check for any generated types, mocks, test doubles, or wrapper functions that call this RPC
3. Update EVERY call site with the new 4-parameter signature

Current identified callers: **2 methods in AutonomousTaskBillingService.ts**

No other callers found in:
- src/main (Electron main process)
- src/shared (shared utilities)
- src/renderer/organization (other organization files)
- Tests (no actual RPC calls, only comments)

---

## D. AUTHORITATIVE RPC SIGNATURE MATRIX

### Complete Autonomous Billing RPC Matrix

| RPC | SQL Signature | Purpose | Caller | Auth | Idempotency | Financial | Phase 3 Changes |
|-----|---|---|---|---|---|---|---|
| **reserve_autonomous_pc** | `(p_run_id UUID, p_estimated_pc INTEGER, p_request_id UUID)` | Initial reservation | AutonomousOrchestrator.ts | auth.uid() + ownership | same request_id → cached | balance_pc -= est, balance_reserved += est | NONE (exists, verified safe) |
| **extend_autonomous_reservation** | `(p_run_id UUID, p_additional_pc INTEGER, p_extension_request_id UUID, p_executor_instance_id UUID)` | Additional reservation during execution | 2 methods in AutonomousTaskBillingService.ts | auth.uid() + claimed_by + instance match | same ext_id → cached | balance_pc -= add, balance_reserved += add | **ADD executor_instance_id parameter + update 2 callers** |
| **resume_and_claim_autonomous_run** | `(p_run_id UUID, p_resume_request_id TEXT)` | Resume after top-up + fresh claim | AutonomousTaskBillingService.resumeWaitingAutonomousRuns() | auth.uid() + ownership + verify claim NULL | same res_id → cached | balance_pc -= 5000, balance_reserved += 5000, extend reserved, claim | NEW in Phase 3 |
| **mark_autonomous_execution_started** | `(p_run_id UUID, p_executor_instance_id UUID)` | Mark execution began | AutonomousOrchestrator.ts | auth.uid() + claimed_by + instance match | already_started → success | NONE | NEW in Phase 3 |
| **mark_autonomous_execution_completed** | `(p_run_id UUID, p_terminal_status TEXT, p_executor_instance_id UUID)` | Mark execution terminal | AutonomousOrchestrator.ts | auth.uid() + claimed_by + instance match | already_completed → success | NONE | NEW in Phase 3 |
| **transition_to_waiting_for_topup** | `(p_run_id UUID)` | Release claim, transition to waiting | AutonomousOrchestrator.finishAutonomousRun() | auth.uid() + ownership + claim exists | atomic | NONE (claim release only) | NEW in Phase 3 |
| **settle_autonomous_task_run_pc** | `(p_run_id UUID, p_actual_pc INTEGER)` | Charge actual PC, release reservation | IPC handler billing:settleAutonomousRun | auth.uid() + ownership | settled_at immutable | balance_reserved -= reserved, balance_pc += unused, settled_pc = actual, settled_at = NOW | **CHANGE signature: add p_actual_pc parameter** |
| **transition_autonomous_task_run** | `(p_run_id UUID, p_to_status TEXT)` | Generic state transition | Various (existing) | auth.uid() (user_id match) | idempotent | NONE | NONE (existing, unchanged) |
| **add_ticket_balance** | `(p_organization_id UUID, p_amount_usd NUMERIC, p_payment_reference TEXT)` | Top-up wallet | CheckoutSyncServer (existing) | auth.uid() | idempotent | balance_pc += usd*100, balance_usd += usd | NONE (existing, unchanged) |

### Key Changes for Phase 3

**2 signature changes**:
1. `extend_autonomous_reservation`: ADD `p_executor_instance_id UUID` parameter (affects 2 callers)
2. `settle_autonomous_task_run_pc`: ADD `p_actual_pc INTEGER` parameter (new data flow from main process)

**4 new RPCs**:
- resume_and_claim_autonomous_run
- mark_autonomous_execution_started
- mark_autonomous_execution_completed
- transition_to_waiting_for_topup

**2 unchanged**: transition_autonomous_task_run, add_ticket_balance

---

## E. SETTLEMENT DATA-SOURCE CONFIRMATION

### Architectural Decision: Option B (Approved)

**Old (Supabase-based) approach**:
- settle RPC queries Supabase `usage_events` table
- Settlement calculation: SELECT SUM(normalized_compute) FROM usage_events WHERE run_id = ?

**New (Option B, approved) approach**:
- Electron main process loads UsageEventStore from durable checkpoint file
- Main process calculates actual_pc = SUM(normalized_compute) from persisted usage events
- Main process passes actual_pc to settle RPC via authenticated IPC handler
- settle RPC receives actual_pc as parameter, validates it, and settles with that value

### Explicit Confirmation

**The Supabase usage_events table is NOT used for autonomous work PC settlement.**

Settlement uses:
1. Main-process UsageEventStore (authoritative, durable, local)
2. Passed to Supabase as p_actual_pc parameter
3. Validated against reserved_pc
4. Charged with full validation

### Verification

No section of this design references Supabase usage_events for autonomous settlement. All settlement occurs through the settle RPC with caller-supplied actual_pc.

---

## F. PHASE 3 FILE IMPACT

### Files Impacted by RPC Signature Changes

#### DATABASE

```
supabase/migrations/[TIMESTAMP]_autonomous_work_pc_phase3_v3_1.sql
├─ ADD columns: execution_claimed_by, execution_claimed_at, execution_executor_instance_id, execution_claim_request_id, execution_started_at, execution_completed_at, orchestration_input
├─ CREATE indices (3 new indices)
├─ CREATE RPC: transition_to_waiting_for_topup()
├─ CREATE RPC: resume_and_claim_autonomous_run()
├─ CREATE RPC: mark_autonomous_execution_started()
├─ CREATE RPC: mark_autonomous_execution_completed()
├─ REPLACE RPC: extend_autonomous_reservation(... + p_executor_instance_id) ← SIGNATURE CHANGE
├─ REPLACE RPC: settle_autonomous_task_run_pc(... + p_actual_pc) ← SIGNATURE CHANGE
└─ GRANT all new RPCs to authenticated
```

#### MAIN PROCESS (Electron)

```
src/main/billing/UsageEventStore.ts (UPGRADE)
├─ Implement checkpoint model with version/checksum/fsync/atomic-rename
├─ Methods: flush(), init(), load(), append()
└─ Mark recovery_required on corruption (never assume 0)

src/main/ipc/ipc.ts (NEW HANDLERS)
├─ IPC: billing:settleAutonomousRun(runId)
│  ├─ Load UsageEventStore from disk
│  ├─ Calculate actual_pc = SUM(normalized_compute)
│  ├─ Call settle_autonomous_task_run_pc RPC with actual_pc
│  └─ Return billing_event_id
└─ IPC: git:validateWorktree(sourceRepoPath, worktreePath, expectedBranchName)
   └─ Validate worktree state
```

#### RENDERER (BREAKING CHANGES)

```
src/renderer/organization/AutonomousOrchestrator.ts (MAJOR REFACTOR)
├─ orchestrateAutonomousRun (10-step lifecycle)
├─ orchestrateAutonomousRun_Resume (new, after top-up)
└─ Both must obtain execution_executor_instance_id from claim operation and pass to extend_autonomous_reservation

src/renderer/organization/AutonomousTaskBillingService.ts (SIGNATURE UPDATES REQUIRED)
├─ extendReservation(runId, additionalPc, extensionRequestId)
│  ├─ UPDATE line 153-157
│  └─ ADD executorInstanceId parameter to RPC call
├─ extendAutonomousReservation(runId, additionalPc, extensionRequestId)
│  ├─ UPDATE line 332-336
│  └─ ADD executorInstanceId parameter to RPC call
├─ resumeWaitingAutonomousRuns(organizationId)
│  ├─ NEW: Query waiting_for_topup runs
│  ├─ NEW: Call resume_and_claim_autonomous_run RPC
│  └─ NEW: Fire-and-forget execute resume
└─ settleAutonomousRun(runId, actualPc)
   ├─ UPDATE: Takes actualPc parameter (from IPC handler)
   └─ NEW: Call settle RPC with actual_pc parameter

src/renderer/ui/AppRoot.tsx (WIRE EVENT)
├─ AutonomousRunResumeListener
├─ Listen for 'billing:taskCreditsPurchased'
└─ Call autonomousTaskBillingService.resumeWaitingAutonomousRuns()
```

#### SHARED TYPES

```
src/shared/organization/AutonomousTaskBillingTypes.ts (UPDATE)
├─ execution_executor_instance_id type/interface
├─ extend RPC call parameters (add executor_instance_id)
├─ settle RPC call parameters (add actual_pc)
└─ Any generated types from RPC signatures
```

#### TESTS

```
supabase/migrations/[TIMESTAMP]_autonomous_pc_phase3_test_setup.sql
├─ Test functions for all new scenarios
└─ Edge cases: idempotency, concurrency, races, corruption, settlement

src/renderer/organization/AutonomousOrchestrator.test.ts (EXPAND)
├─ Full orchestration lifecycle (all 10 steps)
├─ Waiting_for_topup → resume with new claim
├─ All state transitions
├─ mark_started / mark_completed atomicity
└─ Cancellation races

src/renderer/organization/AutonomousTaskBillingService.test.ts (EXPAND)
├─ Resume after top-up
├─ Both extendReservation and extendAutonomousReservation with new executor_instance_id param
├─ settle_autonomous_task_run_pc with actual_pc parameter
└─ Conservation invariant

src/main/billing/UsageEventStore.test.ts (NEW)
├─ Crash scenarios
├─ Corruption detection
└─ Checkpoint validation
```

---

## G. FINAL CONSISTENCY CHECK

### All Verified

✓ $1 = 100 PC  
✓ $5 = 500 PC  
✓ $10 = 1,000 PC  
✓ $30 = 3,000 PC  
✓ $50 = 5,000 PC  
✓ Tier Compute completely separate (no fallback, no deduction)  
✓ Reservation conservation invariant remains valid  
✓ Settlement uses actual PC  
✓ Actual PC comes from main-process UsageEventStore  
✓ NO Supabase usage_events dependency for settlement  
✓ Settlement is idempotent (settled_at check)  
✓ Reservation released exactly once (balance_reserved -= reserved_pc)  
✓ balance_reserved decreases by full reservation  
✓ Unused reservation returns to balance_pc  
✓ Billing event created exactly once (settle_at immutable)  
✓ Extend request IDs distinct from resume request IDs  
✓ Same request retry is idempotent  
✓ Executor instance authentication enforced  
✓ No direct financial-column manual mutation  
✓ No service-role secret in Electron  
✓ No changes to Razorpay, invoicing, Enterprise, entitlements, subscription  

---

# READY FOR PHASE 3: YES

All 3 critical gaps resolved:
1. ✓ Complete settle_autonomous_task_run_pc SQL provided
2. ✓ extend_autonomous_reservation breaking signature change fully documented with all 2 callers identified
3. ✓ Authoritative RPC signature matrix provided with every call site

Design is complete, consistent, and implementation-ready.

Phase 3 may proceed.
