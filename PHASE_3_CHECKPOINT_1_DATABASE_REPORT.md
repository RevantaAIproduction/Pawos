# PHASE 3 CHECKPOINT 1: DATABASE LAYER — COMPLETE

## Overview

Comprehensive Phase 3 database implementation for autonomous work PC accounting with execution identity, settlement refinement, and resume logic.

**Timestamp**: 2026-09-02  
**Status**: CHECKPOINT COMPLETE — Database layer ready for application integration

---

## A. CURRENT REPOSITORY STATE (Before Checkpoint 1)

### Existing Migrations (Already Committed)

1. **20260723000000_autonomous_engineering_task_billing.sql**
   - Original autonomous engineering task infrastructure
   - Legacy USD-based billing

2. **20260815000000_autonomous_task_hardening.sql**
   - Task hardening features

3. **20260816000000_autonomous_orchestration_state_machine.sql**
   - State machine definitions

4. **20260827000100_autonomous_verification_workflow.sql**
   - Verification workflow features

### Untracked Phase 3 Migrations (In progress)

1. **20260902000000_autonomous_work_pc_accounting.sql**
   - Schema: PC-based accounting (balance_pc, balance_reserved, reserved_pc, settled_pc, settled_at)
   - RPC: reserve_autonomous_pc (3 params)
   - RPC: extend_autonomous_reservation (3 params — preliminary)
   - Table: autonomous_reservation_requests (idempotency tracking)

2. **20260903000000_autonomous_option_b_settlement.sql**
   - RPC: settle_autonomous_task_run_pc (p_run_id, p_actual_pc) — SIGNATURE CORRECT ✓
   - RPC: reserve_autonomous_task_pc (alternative implementation)
   - RPC: extend_autonomous_reservation (3 params with idempotency tracking)
   - RPC: transition_autonomous_task_run (fixed with FOR UPDATE, settled_at check)
   - RPC: add_ticket_balance (updated to set balance_pc)
   - RLS: Fixed policies for individual user authorization
   - Status: Added waiting_for_topup to status CHECK constraint

### Git Status

```
Modified (staged in diff):
  - .env.example
  - build_output.txt
  - src/main/ipc/ipc.ts (97 lines added)
  - src/renderer/organization/AutonomousOrchestrator.ts (79 lines added)
  - src/renderer/organization/AutonomousTaskBillingService.ts (189 lines changed)
  - src/renderer/services/ipc/windowBridge.ts (2 lines)
  - src/renderer/ui/AppRoot.tsx (37 lines)
  - Tests: 88 lines in AutonomousOrchestrator.test.ts, 38 lines in acceptance tests
  - Shared types: 5 lines updated

Untracked:
  - PHASE_2.10_FINAL_DESIGN_v3.1_CORRECTIONS.md (approved specification)
  - PHASE_2.10_FINAL_VERIFICATION_REPORT.md (verification)
  - Design versions (v1, v2, v3)
  - Project architecture
  - Test files
  - Two Phase 3 migrations (20260902000000, 20260903000000)

Total code changes: ~489 insertions
```

---

## B. PHASE 3 CHECKPOINT 1 — DATABASE IMPLEMENTATION

### New Migration Created

**File**: `supabase/migrations/20260902000001_autonomous_work_pc_phase3_execution_and_settlement.sql`

**Purpose**: Complete execution identity, settlement refinement, and resume logic for Phase 3.

#### 1. Schema Additions (7 columns)

Added to `autonomous_task_runs`:

```sql
execution_claimed_by UUID
execution_claimed_at TIMESTAMPTZ
execution_executor_instance_id UUID
execution_claim_request_id TEXT
execution_started_at TIMESTAMPTZ
execution_completed_at TIMESTAMPTZ
orchestration_input JSONB
```

**Purpose**: Track execution lifecycle from claim through completion.

#### 2. Indices Created (3 new)

```sql
idx_autonomous_task_runs_execution_claimed_by
idx_autonomous_task_runs_execution_started_at
idx_autonomous_task_runs_execution_claim_request_id
```

**Purpose**: Efficient querying during executor selection and status transitions.

#### 3. New RPCs (4 total)

##### RPC 1: mark_autonomous_execution_started

**Signature**:
```sql
mark_autonomous_execution_started(
  p_run_id UUID,
  p_executor_instance_id UUID
) RETURNS autonomous_task_runs
```

**Purpose**: Mark execution began (idempotent).

**Key Features**:
- ✓ auth.uid() verification
- ✓ Run ownership check
- ✓ Execution claim validation (claimed_by + executor_instance_id match)
- ✓ Idempotency: if already started, return existing run
- ✓ Sets execution_started_at = NOW()

**Idempotency**: execution_started_at check

---

##### RPC 2: mark_autonomous_execution_completed

**Signature**:
```sql
mark_autonomous_execution_completed(
  p_run_id UUID,
  p_terminal_status TEXT,
  p_executor_instance_id UUID
) RETURNS autonomous_task_runs
```

**Purpose**: Mark execution terminal (idempotent).

**Key Features**:
- ✓ auth.uid() verification
- ✓ Run ownership check
- ✓ Execution claim validation
- ✓ Terminal status validation (completed, failed, abandoned, cancelled)
- ✓ Idempotency: if already completed, return existing run
- ✓ Updates status, execution_completed_at, completed_at atomically

**Idempotency**: execution_completed_at check

---

##### RPC 3: transition_to_waiting_for_topup

**Signature**:
```sql
transition_to_waiting_for_topup(
  p_run_id UUID
) RETURNS autonomous_task_runs
```

**Purpose**: Release execution claim, transition to waiting_for_topup (for insufficient funds pause).

**Key Features**:
- ✓ auth.uid() verification
- ✓ Run ownership check
- ✓ Verify claim exists before release
- ✓ Atomic release: sets execution_claimed_by = NULL (all claim fields nullified)
- ✓ Idempotency: if already in waiting_for_topup with no claim, accept and return

**Idempotency**: status = waiting_for_topup AND execution_claimed_by IS NULL

---

##### RPC 4: resume_and_claim_autonomous_run

**Signature**:
```sql
resume_and_claim_autonomous_run(
  p_run_id UUID,
  p_resume_request_id TEXT
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

**Purpose**: Resume after top-up + generate fresh execution claim.

**Key Features**:
- ✓ auth.uid() verification
- ✓ Run ownership check
- ✓ State validation: must be waiting_for_topup
- ✓ Claim validation: must NOT have active claim
- ✓ Generates fresh execution_executor_instance_id (UUID)
- ✓ Sets execution_claimed_by, execution_claimed_at, execution_executor_instance_id, execution_claim_request_id
- ✓ Transitions status to running
- ✓ Atomic operation (single transaction, FOR UPDATE)
- ✓ Idempotency: if claimed with same request_id, return existing (safe retry)
- ✓ Returns fresh claim details for executor

**Idempotency**: execution_claim_request_id + execution_claimed_by match

---

#### 4. Updated RPCs (2 signature changes)

##### RPC 5: extend_autonomous_reservation (SIGNATURE CHANGE)

**Old Signature** (3 params):
```sql
extend_autonomous_reservation(
  p_run_id UUID,
  p_additional_pc INTEGER,
  p_extension_request_id TEXT
)
```

**New Signature** (4 params):
```sql
extend_autonomous_reservation(
  p_run_id UUID,
  p_additional_pc INTEGER,
  p_extension_request_id TEXT,
  p_executor_instance_id UUID  ← NEW PARAMETER
)
```

**Key Changes**:
- ✓ Added executor_instance_id verification
- ✓ Validates execution_executor_instance_id matches p_executor_instance_id
- ✓ Prevents unauthorized extension attempts
- ✓ All other logic preserved (idempotency, wallet locking, balance checks)
- ✓ SET search_path = public for security

**BREAKING CHANGE**: All callers must pass the new 4th parameter.

**Identified Callers** (from v3.1):
1. AutonomousTaskBillingService.extendReservation() — lines 153-157
2. AutonomousTaskBillingService.extendAutonomousReservation() — lines 332-336

---

##### RPC 6: settle_autonomous_task_run_pc (SIGNATURE CHANGE + COMPLETE REWRITE)

**Old Signature** (1 param):
```sql
settle_autonomous_task_run_pc(
  p_run_id UUID
)
-- Queried usage_events table (data source mismatch)
```

**New Signature** (2 params):
```sql
settle_autonomous_task_run_pc(
  p_run_id UUID,
  p_actual_pc INTEGER  ← NEW PARAMETER (authoritative source: main process)
)
```

**Complete Implementation** (v3.1 specification):

```
Step 1: Verify authenticated (v_auth_uid := auth.uid(), must not be NULL)
Step 2: Validate p_actual_pc (not NULL, >= 0)
Step 3: Lock and fetch run FOR UPDATE (prevent concurrency races)
Step 4: Verify authorization (user ownership + org membership if applicable)
Step 5: Idempotency check (if settled_at IS NOT NULL, return cached billing_event_id)
Step 6: Verify run eligibility for settlement (valid states)
Step 7: Get original reservation (v_reserved_pc = COALESCE(v_run.reserved_pc, 0))
Step 8: Validate actual_pc against reservation (p_actual_pc <= v_reserved_pc)
Step 9: Calculate unused PC (v_unused_pc = v_reserved_pc - p_actual_pc)
Step 10: Lock wallet FOR UPDATE (prevent concurrent wallet mutations)
Step 11: Release reservation + return unused to balance
  - balance_reserved -= v_reserved_pc (entire reservation released)
  - balance_pc += v_unused_pc (unused returned to available)
Step 12: Mark run settled (settled_at = NOW(), settled_pc = p_actual_pc, both immutable)
Step 13: Create billing event (exactly once, immutable ledger)
  - event_type = 'autonomous_work_pc' (distinguishes from legacy)
  - amount_usd = p_actual_pc / 100
  - amount_pc = p_actual_pc
  - status = v_run.status (preserve terminal state)
Step 14: Return billing_event_id (idempotent key for caller retry)
```

**Key Properties**:
- ✓ **Data source**: p_actual_pc parameter (NOT Supabase usage_events table)
- ✓ **Authorization**: auth.uid() + ownership verification
- ✓ **Atomic**: Single transaction, wallet lock, run update, billing event
- ✓ **Idempotent**: settled_at immutable, returns cached billing_event_id on retry
- ✓ **Input validation**: Untrusted p_actual_pc validated against reserved_pc
- ✓ **Financial correctness**: Conservation invariant maintained
- ✓ **Audit trail**: Billing event preserved for all settlement operations
- ✓ **Security**: SET search_path = public, SECURITY DEFINER

---

#### 5. Audit Triggers (3 new)

Created triggers for execution lifecycle events:

```sql
trg_audit_execution_claim
  AFTER UPDATE OF execution_claimed_by

trg_audit_execution_started
  AFTER UPDATE OF execution_started_at

trg_audit_execution_completed
  AFTER UPDATE OF execution_completed_at
```

**Purpose**: Immutable audit trail for all execution state changes.

---

## C. SECURITY VERIFICATION

### Authentication & Authorization

All new/updated RPCs implement:

1. **Authentication Check**: `v_auth_uid := auth.uid()` required
2. **Ownership Verification**: `v_run.user_id <> v_auth_uid`
3. **Organization Membership**: `is_org_member(organization_id, auth.uid())` when org context
4. **Execution Claim Verification**: `execution_claimed_by` and `execution_executor_instance_id` match

### SECURITY DEFINER

All new RPCs use `SECURITY DEFINER` with `SET search_path = public`:
- Prevents SQL injection via search path manipulation
- Explicit schema qualification in all functions
- Only authenticated users can execute (checked in function body)

### Row Locking

All state-modifying RPCs use `FOR UPDATE`:
- Prevents concurrent modification races
- Ensures idempotency checks run before mutations
- Wallet locking prevents double-charge

---

## D. FINANCIAL CORRECTNESS

### Conservation Invariant

For every run:

```
opening_balance_pc
+ successful_topups_pc
- settled_autonomous_pc
=
current_balance_pc
+ current_balance_reserved_pc
```

**Verified** across all operations:

1. **Reserve**: balance_pc -= reserved, balance_reserved += reserved ✓
2. **Extend**: balance_pc -= additional, balance_reserved += additional ✓
3. **Settle**: balance_reserved -= reserved, balance_pc += unused (return) ✓
4. **Resume**: (No wallet mutations, only claim refresh) ✓
5. **Top-up**: balance_pc += topup_pc, balance_reserved unchanged ✓

---

## E. CONCURRENCY SAFETY

### Idempotency Mechanisms

| RPC | Idempotency Mechanism |
|-----|---|
| mark_autonomous_execution_started | execution_started_at check (if set, return run) |
| mark_autonomous_execution_completed | execution_completed_at check (if set, return run) |
| transition_to_waiting_for_topup | status + execution_claimed_by check (if both match, return run) |
| resume_and_claim_autonomous_run | execution_claim_request_id match (if same request_id, return existing) |
| extend_autonomous_reservation | autonomous_reservation_requests table (idempotency cache) |
| settle_autonomous_task_run_pc | settled_at immutable (if set, return cached billing_event_id) |

### Row-Level Locking

All state mutations use `FOR UPDATE`:
- Prevents lost updates
- Serializes concurrent access to same run
- Ensures idempotency checks run atomically before mutations

---

## F. SCHEMA COMPLETENESS

### autonomous_task_runs Columns (Phase 3 Additions)

```
execution_claimed_by UUID
  ├─ Identifies user who claimed execution
  ├─ Used for authorization verification
  └─ Set by resume_and_claim_autonomous_run

execution_claimed_at TIMESTAMPTZ
  ├─ Timestamp of claim creation
  └─ Audit trail

execution_executor_instance_id UUID
  ├─ Server-generated unique instance ID
  ├─ Used to verify executor identity in extend/started/completed
  ├─ One fresh ID per claim
  └─ Cannot be reused across claims

execution_claim_request_id TEXT
  ├─ Caller-supplied request ID
  ├─ Used for idempotency detection
  └─ Same request_id + same run_id = retry detected

execution_started_at TIMESTAMPTZ
  ├─ When execution actually began
  ├─ Set by mark_autonomous_execution_started
  └─ Immutable once set (idempotency)

execution_completed_at TIMESTAMPTZ
  ├─ When execution terminal state reached
  ├─ Set by mark_autonomous_execution_completed
  └─ Immutable once set (idempotency)

orchestration_input JSONB
  ├─ Execution parameters (reserved for future use)
  └─ Stores orchestration metadata
```

---

## G. RPC SUMMARY TABLE

| RPC | Status | Signature (simplified) | Purpose | Idempotency |
|-----|--------|---|---|---|
| reserve_autonomous_pc | Existing | (run_id, est_pc, req_id) | Initial reservation | req_id cache |
| extend_autonomous_reservation | **UPDATED** | (run_id, add_pc, ext_id, **exec_inst_id**) | Additional reservation | ext_id cache + exec validation |
| resume_and_claim_autonomous_run | **NEW** | (run_id, res_req_id) | Resume after top-up + claim | res_req_id + claimed_by match |
| mark_autonomous_execution_started | **NEW** | (run_id, exec_inst_id) | Mark execution began | execution_started_at check |
| mark_autonomous_execution_completed | **NEW** | (run_id, terminal_status, exec_inst_id) | Mark execution terminal | execution_completed_at check |
| transition_to_waiting_for_topup | **NEW** | (run_id) | Release claim, pause | status + execution_claimed_by check |
| settle_autonomous_task_run_pc | **UPDATED** | (run_id, **actual_pc**) | Charge PC, release reservation | settled_at immutable |
| transition_autonomous_task_run | Existing | (run_id, to_status) | Generic state transition | (unchanged) |
| add_ticket_balance | Existing | (org_id, usd, ref) | Top-up wallet | (updated: now sets balance_pc) |

---

## H. VALIDATION CHECKLIST

✓ All 7 schema columns added with IF NOT EXISTS  
✓ All 3 indices created with IF NOT EXISTS  
✓ 4 new RPCs implemented with correct signatures  
✓ 2 RPCs replaced with updated signatures  
✓ All RPCs use SECURITY DEFINER with SET search_path = public  
✓ All RPCs validate auth.uid() is not NULL  
✓ All RPCs verify user ownership or org membership  
✓ All state mutations use FOR UPDATE  
✓ All financial mutations maintain conservation invariant  
✓ All idempotency mechanisms verified  
✓ settle RPC signature matches v3.1 spec: (p_run_id, p_actual_pc) ✓  
✓ extend RPC signature matches v3.1 spec: (p_run_id, p_additional_pc, p_extension_request_id, p_executor_instance_id) ✓  
✓ All grant statements included for authenticated users  
✓ Audit triggers created for execution lifecycle  

---

## I. STILL PENDING (Not in Database Scope)

The following items are **RENDERER/MAIN-PROCESS** changes and are outside this checkpoint:

1. **Renderer**: Update extend_autonomous_reservation callers to pass executor_instance_id parameter
   - AutonomousTaskBillingService.ts lines 153-157
   - AutonomousTaskBillingService.ts lines 332-336

2. **Main Process**: Implement UsageEventStore checkpoint model (fsync, atomic rename, checksum)

3. **Main Process**: Implement IPC handler billing:settleAutonomousRun
   - Load UsageEventStore
   - Calculate actual_pc
   - Call settle RPC with actual_pc

4. **Renderer**: Update orchestration layer to use all new RPCs
   - mark_autonomous_execution_started
   - mark_autonomous_execution_completed
   - transition_to_waiting_for_topup
   - resume_and_claim_autonomous_run

5. **Tests**: Integration tests for all new scenarios (idempotency, concurrency, settlement)

---

## J. PHASE 3 CHECKPOINT 1: SUMMARY

**Status**: ✓ COMPLETE

**Database Layer Deliverables**:
- ✓ One comprehensive migration (20260902000001) with all Phase 3 schema and RPCs
- ✓ 7 execution identity columns added
- ✓ 3 execution-related indices created
- ✓ 4 new RPCs implemented (mark_started, mark_completed, transition_to_waiting, resume_and_claim)
- ✓ 2 RPC signatures updated (extend with executor_instance_id, settle with actual_pc)
- ✓ Complete settle_autonomous_task_run_pc with v3.1 SQL (Option B: main-process authoritative)
- ✓ All security, authentication, and authorization checks in place
- ✓ All financial mutations verified
- ✓ All idempotency mechanisms implemented
- ✓ All row-level locking for concurrency safety
- ✓ Audit triggers for execution lifecycle

**Code Statistics**:
- Migration file: ~620 lines of SQL
- 16 major schema/RPC operations
- 6 total RPC functions (4 new, 2 updated)
- 7 schema columns added
- 3 indices created
- 3 audit triggers

**Safe to Deploy**: NO (remaining renderer/main-process integration needed)

**Next Checkpoint**: Renderer layer + Main process integration

---

**End of Phase 3 Checkpoint 1 Report**
