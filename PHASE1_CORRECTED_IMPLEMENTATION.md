# PHASE 1 CORRECTED IMPLEMENTATION — TERMINAL-STATE SETTLEMENT ARCHITECTURE

**Date:** 2026-09-07  
**Status:** Implementation Complete — Awaiting Final Validation  

## CANONICAL ARCHITECTURE IMPLEMENTED

### State Machine
```
EXECUTION
├─ running (active)
├─ waiting_for_permission (resumable, non-terminal, NO settlement)
└─ waiting_for_topup (resumable, non-terminal, NO settlement)

TERMINAL TRANSITION (done BEFORE settlement)
├─ completeRun() → status='completed' [success only]
├─ markTerminal('failed') → status='failed' [failure after work]
├─ markTerminal('cancelled') → status='cancelled' [user cancellation]
└─ transitionRun('blocked') → status='blocked' [pre-execution failure]

SETTLEMENT (ONLY after terminal status)
├─ Get actual PC from UsageEventStore (main process authoritative)
├─ Call settle_autonomous_task_run_pc(runId, actualPc) RPC
├─ RPC validates terminal status (throws if not terminal)
├─ RPC releases unused reservation to wallet
├─ RPC sets settled_at + settled_pc (idempotent by settled_at)
├─ RPC creates immutable billing event
└─ Return billingEventId
```

### Execution Paths (Implemented)

**PATH 1: Success**
```
execution completes → completeRun() [status='completed']
→ getActualPc() from UsageEventStore
→ settleWithActualPc(actualPc) RPC
→ transitionRun('waiting_for_permission') [verification workflow]
→ billingEventId returned
```

**PATH 2: Failure after provider work**
```
execution fails → markTerminal('failed') [status='failed']
→ getActualPc() from UsageEventStore
→ settleWithActualPc(actualPc) RPC
→ release unused reservation
→ create billing event with actual usage
→ billingEventId returned
```

**PATH 3: No provider work (before execution fails)**
```
execution fails before any Gemini calls → markTerminal('failed')
→ getActualPc() returns 0
→ settleWithActualPc(0) RPC
→ return full reservation to wallet
→ create billing event (0 PC)
→ billingEventId returned
```

**PATH 4: Waiting states (NOT settled)**
```
execution waits → transitionRun('waiting_for_permission'|'waiting_for_topup')
→ NO settlement call
→ Reservation remains locked
→ Return billingEventId=null
→ Run resumable later
```

## SETTLEMENT FAILURE RECOVERY

**Scenario:** Terminal transition succeeds, then `settleWithActualPc()` throws

**System behavior:**
- Run status: terminal ('failed'|'completed')
- settled_at: NULL (marks settlement not yet occurred)
- settled_pc: NULL  
- Reservation: LOCKED (not released)
- Billing event: NOT created
- Next attempt: RPC idempotent by settled_at check, safe to retry

**Recovery mechanism:** Implicit in SQL design
- settled_at NULL = settlement outstanding
- Retry with same runId + actualPc = idempotent return of existing billingEventId
- No double-charge possible (RPC is atomic)
- Conservation holds: reserved PC remains locked until settled

## ZERO USAGE VERIFICATION

SQL contract (settle_autonomous_task_run_pc):
```sql
-- Line 261-262: p_actual_pc >= 0
IF p_actual_pc < 0 THEN
  RAISE EXCEPTION 'Data integrity error: actual_pc cannot be negative';
END IF;
```

**p_actual_pc = 0 is VALID:**
- Passed to RPC
- v_unused_pc = reserved_pc - 0 = full reservation
- Wallet updated: balance_pc += full_unused
- Billing event created with 0 PC
- **Result: Full reservation released correctly**

## CONSERVATION INVARIANT

**Formula:** `opening_balance + topups - settled_autonomous_pc = current_balance + current_reserved`

**Verified across all paths:**

1. **Success after usage (e.g., 275 PC)**
   - Open: 3000 balance, 0 reserved
   - Topup: +500
   - Reserve: -300
   - Work: 275 actual
   - Settle: deduct 275, release 25
   - Result: 3000 + 500 - 275 = 3225 (3225 balance + 0 reserved) ✓

2. **Failure after usage (e.g., 150 PC consumed)**
   - Open: 1000 balance, 0 reserved
   - Reserve: -300
   - Work: 150 actual (then fails)
   - Settle: deduct 150, release 150
   - Result: 1000 - 300 + 150 = 850 (850 balance + 0 reserved) ✓

3. **Zero usage (no provider calls)**
   - Open: 2000 balance, 0 reserved
   - Reserve: -300
   - No work (fails before Gemini)
   - Settle: actualPc=0, release 300
   - Result: 2000 - 300 + 300 = 2000 (2000 balance + 0 reserved) ✓

## FILES CHANGED

**Modified:**
- `src/renderer/organization/AutonomousOrchestrator.ts` (finishAutonomousRun reordered)

**Created:**
- `PHASE1_CORRECTED_IMPLEMENTATION.md` (this document)

## REMAINING WORK

1. **Cancellation path verification** — requires tracing ConversationRuntime → HeadlessTurnRunner termination
2. **Abandoned run behavior** — verify reconciliation path settles any outstanding usage
3. **Comprehensive test suite** — 12 test scenarios covering all paths (partially created in .settlement.test.ts)
4. **Full build validation** — npm run build:main

## BUILD & TEST RESULTS

**TypeScript:** ✅ PASS (Exit Code 0)
**Cancellation path:** ⏳ Requires investigation
**Tests:** ⏳ Need full suite
**Build:** ⏳ Need validation

---

**Next Action:** Trace cancellation path, complete test suite, validate full build. Then report final Phase 1 status.
