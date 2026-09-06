# PHASE 2.10 FINAL VERIFICATION REPORT

## Repository-Grounded Design Review

Date: 2026-09-02  
Verification Status: **INCOMPLETE DESIGN - CRITICAL GAPS FOUND**

---

## EXECUTIVE SUMMARY

**APPROVED FOR PHASE 3: NO**

During final verification against the actual repository code, the v3 design was found to have **3 critical SQL/signature mismatches** that make it unsuitable for implementation without corrections.

The design is conceptually sound but incomplete in its actual SQL specifications.

---

## A. FINAL VERDICT

# NOT APPROVED FOR PHASE 3

Reason: Critical RPC signature mismatches between v3 design specifications and actual repository code. Incomplete SQL definitions for settle RPC. Design must be corrected before Phase 3 implementation.

---

## B. CRITICAL BLOCKERS FOUND

### Blocker 1: settle_autonomous_task_run_pc Missing actual_pc Parameter

**Location**: v3 section 11 "Financial Mutations" vs actual repo 20260902000000 migration (line 323-378)

**Problem**:
- v3 section 11 explicitly specifies: `settle_autonomous_task_run_pc(run_id, actual_pc)`
- v3 section 10 "Execution Order" requires: actual_pc calculated from UsageEventStore BEFORE settlement
- ACTUAL REPOSITORY CODE: `CREATE OR REPLACE FUNCTION settle_autonomous_task_run_pc(p_run_id UUID)`
- The repo RPC takes ONLY run_id, not actual_pc
- The repo RPC queries from a Supabase `usage_events` table (line 376-378), NOT from main-process UsageEventStore

**Why It Matters**:
- The entire v3 design architecture depends on actual_pc being supplied from the main process (after loading and validating UsageEventStore)
- The actual repo code queries a Supabase usage_events table instead
- This is a fundamental architectural mismatch
- If v3 design is implemented without fixing this, settlement will use the wrong data source

**Correction Required**:
1. v3 must provide COMPLETE corrected SQL for settle_autonomous_task_run_pc that takes p_actual_pc as parameter:
   ```sql
   CREATE OR REPLACE FUNCTION settle_autonomous_task_run_pc(
     p_run_id UUID,
     p_actual_pc INTEGER
   )
   ```
2. RPC must verify: p_actual_pc >= 0 and p_actual_pc <= reserved_pc
3. RPC must NOT query usage_events table
4. Caller (main process IPC handler) is responsible for loading UsageEventStore and passing authoritative actual_pc

---

### Blocker 2: extend_autonomous_reservation Missing executor_instance_id Parameter Specification

**Location**: v3 section 5 SQL vs actual repo code (line 203-318)

**Problem**:
- v3 proposes: `CREATE OR REPLACE FUNCTION extend_autonomous_reservation(p_run_id UUID, p_additional_pc INTEGER, p_extension_request_id UUID, p_executor_instance_id UUID)`
- ACTUAL REPOSITORY CODE: `CREATE OR REPLACE FUNCTION extend_autonomous_reservation(p_run_id UUID, p_additional_pc INTEGER, p_extension_request_id UUID)`
- v3 signature includes executor_instance_id parameter
- Actual repo signature does NOT include this parameter
- Current renderer code (AutonomousTaskBillingService.ts lines 153-157, 332-336) calls without executor_instance_id:
  ```javascript
  supabase.rpc('extend_autonomous_reservation', {
    p_run_id: runId,
    p_additional_pc: additionalPc,
    p_extension_request_id: extensionRequestId,
  })
  ```

**Why It Matters**:
- v3 proposes adding executor_instance_id verification (section 5, steps 4-5)
- This requires the RPC to take executor_instance_id as parameter
- This is a breaking signature change from the actual repo RPC
- Phase 3 implementation WILL need to update all callers to pass this parameter
- v3 design correctly proposes this, but must note it as a BREAKING CHANGE that requires renderer updates

**Correction Required**:
1. v3 SQL for extend_autonomous_reservation (section 5) is CORRECT in proposing the signature change
2. BUT v3 must explicitly state in the design: "Phase 3 MUST update all callers of extend_autonomous_reservation to pass executor_instance_id parameter"
3. Add notes to section 17 "Files for Phase 3" listing specific lines in AutonomousTaskBillingService.ts that must be updated
4. This is not a blocker IF Phase 3 implementation includes renderer updates, BUT must be explicit in the design

---

### Blocker 3: settle_autonomous_task_run_pc SQL Not Provided in v3

**Location**: v3 section 6-7 says "No changes from v2"

**Problem**:
- v3 section 6-7 explicitly states: "**No changes from v2 §5 and §6.** These RPCs are already correct and properly specified."
- This refers to mark_autonomous_execution_started/completed, which is correct
- BUT there is NO v3 SQL specification for settle_autonomous_task_run_pc
- v3 section 11 "Financial Mutations" lists settlement mutations but no actual SQL
- The design requires settle RPC to take p_actual_pc parameter, but v3 provides NO SQL for this
- This is a CRITICAL OMISSION: v3 claims to provide "implementation-ready" SQL but is missing the most critical financial RPC

**Why It Matters**:
- Settlement is the most critical financial operation
- It determines what actually gets charged
- No Phase 3 implementer can proceed without the actual SQL
- The actual repo code's settle RPC is inadequate for the v3 architecture (uses wrong data source)

**Correction Required**:
1. v3 MUST provide COMPLETE, CORRECT SQL for settle_autonomous_task_run_pc that:
   - Takes p_run_id and p_actual_pc as parameters
   - Verifies ownership (auth.uid() checks)
   - Verifies settlement idempotency (settled_at IS NULL)
   - Verifies actual_pc >= 0 and actual_pc <= reserved_pc
   - Locks wallet FOR UPDATE
   - Calculates unused_pc = reserved_pc - actual_pc
   - Updates wallet: balance_reserved -= reserved_pc, balance_pc += unused_pc
   - Updates run: settled_at = NOW(), settled_pc = actual_pc
   - Creates billing_event with status and settled_pc
   - Returns billing_event_id
   - Handles idempotency: if already settled, return cached billing_event_id

---

## C. VERIFIED FIXES (12 Contradictions from v2)

| # | Contradiction | v3 Resolution | Status |
|---|---|---|---|
| 1 | Claim lifecycle release | transition_to_waiting_for_topup() RPC explicitly sets claim fields to NULL | ✓ FIXED |
| 2 | Resume idempotency ordering | Idempotency check moved BEFORE state validation | ✓ FIXED |
| 3 | Extend executor auth | executor_instance_id parameter added to RPC signature | ✓ FIXED (with caveat: breaking change) |
| 4 | Extension vs resume idempotency | Clearly separated: multiple extensions allowed, single concurrent resume | ✓ FIXED |
| 5 | Silent zero elimination | recovery_required flag for missing/corrupt usage on already-started runs | ✓ FIXED |
| 6 | Cancellation lifecycle | Pre-start (0 PC) vs post-start (actual PC) rules explicitly defined | ✓ FIXED |
| 7 | State machine contradictions | Non-terminal/terminal states clearly separated, blocked non-terminal | ✓ FIXED |
| 8 | UsageEventStore durability | Exact file protocol (fsync, atomic rename, checksum) specified | ✓ FIXED |
| 9 | Financial invariant | Every mutation shown explicitly | ✓ FIXED |
| 10 | Security audit | All SECURITY DEFINER RPCs listed with auth checks | ✓ FIXED |
| 11 | Test plan | 18 specific test scenarios provided | ✓ FIXED |
| 12 | Final verdict structure | All 18 verification points addressed | ✓ FIXED |

**Note**: All 12 contradictions from v2 are conceptually resolved in v3. However, v3 has introduced NEW gaps in actual SQL specifications.

---

## D. SECURITY DEFINER RPC MATRIX (VERIFIED)

| RPC | Auth Check | Ownership Check | Exec Instance Check | Wallet Lock | Financial | Gap? |
|-----|---|---|---|---|---|---|
| reserve_autonomous_pc | ✓ auth.uid() line 103 | ✓ org_member / user_id | N/A | ✓ 144-154 | ✓ | NO |
| extend_autonomous_reservation (NEW) | ✓ proposed | ✓ proposed | ✓ proposed (NEW param) | ✓ proposed | ✓ | PARAM CHANGE |
| resume_and_claim_autonomous_run (NEW) | ✓ proposed | ✓ proposed | ✓ verify NULL before claim | ✓ proposed | ✓ | NO |
| mark_autonomous_execution_started (NEW) | ✓ proposed | ✓ proposed | ✓ execution_claimed_by + instance | N/A | N/A | NO |
| mark_autonomous_execution_completed (NEW) | ✓ proposed | ✓ proposed | ✓ execution_claimed_by + instance | N/A | N/A | NO |
| transition_to_waiting_for_topup (NEW) | ✓ proposed | ✓ proposed | ✓ verify claim exists | N/A | N/A | NO |
| settle_autonomous_task_run_pc (CHANGE) | ✓ proposed | ✓ proposed | N/A | ✓ proposed | ✓ MUST TAKE actual_pc | **MISSING SQL** |
| transition_autonomous_task_run | ✓ existing | ✓ existing | N/A | N/A | N/A | NO |
| add_ticket_balance | ✓ existing | ✓ existing | N/A | ✓ existing | ✓ | NO |

---

## E. ACCOUNTING INVARIANT (VERIFIED)

### Invariant Statement
```
opening_balance_pc + successful_topups_pc - settled_autonomous_pc
=
current_balance_pc + current_balance_reserved_pc
```

### Walk-Through Example

**Initial State**:
- User balance_pc: 0, balance_reserved: 0
- opening_balance_pc: 0
- topups_pc: 0
- settled_pc: 0

**After $30 Top-Up** (3000 PC):
- balance_pc: 3000, balance_reserved: 0
- Invariant: 0 + 3000 - 0 = 3000 + 0 ✓

**After reserve_autonomous_pc(5000)** → WAIT, user only has 3000 PC
- Corrected: reserve_autonomous_pc(2500)
- balance_pc: 500, balance_reserved: 2500
- run.reserved_pc: 2500
- Invariant: 0 + 3000 - 0 = 500 + 2500 ✓

**After extend_autonomous_reservation(500)**:
- balance_pc: 0, balance_reserved: 3000
- run.reserved_pc: 3000
- Invariant: 0 + 3000 - 0 = 0 + 3000 ✓

**After execution completes with actual_pc = 500 PC**:
- Usage durable flushed, actual_pc = 500 calculated
- Call settle_autonomous_task_run_pc(run_id, 500) [v3 signature]
- unused_pc = 3000 - 500 = 2500
- balance_pc: 2500, balance_reserved: 0
- run.settled_pc: 500, settled_at: NOW()
- Invariant: 0 + 3000 - 500 = 2500 + 0 ✓

**Invariant Holds**: ✓

---

## F. FINAL PHASE 3 SCOPE (CORRECTED)

Phase 3 implementation must include:

### Database Changes
1. New migration: add execution_* columns, orchestration_input, indices
2. New RPC: transition_to_waiting_for_topup()
3. New RPC: resume_and_claim_autonomous_run()
4. New RPC: mark_autonomous_execution_started()
5. New RPC: mark_autonomous_execution_completed()
6. **CORRECTED RPC: settle_autonomous_task_run_pc(p_run_id, p_actual_pc)** [takes actual_pc parameter]
7. **UPDATED RPC: extend_autonomous_reservation(p_run_id, p_additional_pc, p_extension_request_id, p_executor_instance_id)** [adds executor_instance_id]

### Renderer Changes (MUST UPDATE)
1. AutonomousOrchestrator.ts: 10-step orchestration + resume path
2. AutonomousTaskBillingService.ts:
   - **UPDATE LINE 153-157**: Pass executor_instance_id to extend_autonomous_reservation
   - **UPDATE LINE 332-336**: Pass executor_instance_id to extend_autonomous_reservation
   - Add call to settle: `settle_autonomous_task_run_pc(run_id, actual_pc)` where actual_pc comes from main process
3. AppRoot.tsx: Wire billing event listener

### Main Process Changes
1. UsageEventStore.ts: Checkpoint model upgrade (fsync, checksum, atomic rename)
2. ipc.ts: 
   - billing:settleAutonomousRun(runId) → loads UsageEventStore, calculates actual_pc, calls settle RPC
   - git:validateWorktree(...)

### Scope EXCLUDES
- Razorpay, invoicing, subscription pricing
- Entitlements, seat billing, enterprise
- Tier Compute changes
- Service-role credentials in Electron
- Automatic privileged reconciliation
- Execution termination

---

## G. FINAL STATEMENT

**READY FOR PHASE 3: NO**

### Reason for Rejection

The v3 design resolves all 12 contradictions from v2 **conceptually**, but introduces **3 critical SQL/specification gaps**:

1. **settle_autonomous_task_run_pc is missing its corrected SQL**: v3 requires it to take `actual_pc` parameter, but provides no SQL for this critical RPC
2. **extend_autonomous_reservation signature change not noted as breaking**: v3 changes the RPC signature to include executor_instance_id, but doesn't explicitly list all renderer code that must be updated
3. **settle RPC data source mismatch**: actual repo code queries usage_events Supabase table; v3 requires it use p_actual_pc parameter from main process

### Required Before Phase 3 Approval

v3 must be updated to provide:

1. **Complete SQL for settle_autonomous_task_run_pc** that matches the v3 architecture (takes actual_pc parameter)
2. **Explicit notes** in section 17 listing every caller of extend_autonomous_reservation that must be updated in Phase 3
3. **Verification** that all RPC signatures in the proposed SQL match the architecture requirements

### If These Are Fixed

Once v3 provides complete, correct SQL for all modified RPCs, the design will be ready for Phase 3 implementation.

---

**End of Verification Report**
