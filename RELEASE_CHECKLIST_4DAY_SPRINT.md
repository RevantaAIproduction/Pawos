# PawOS Release Checklist — 4-Day Sprint
**Date**: 2026-09-06  
**Status**: Pre-Implementation  
**Goal**: Complete, tested, production-ready autonomous billing + full product

---

## ✅ ALREADY COMPLETE (Verified by Code Inspection)

### Autonomous Billing Architecture
- ✅ AutonomousOrchestrator with HeadlessTurnRunner
- ✅ UsageEventStore with recovery safety guard
- ✅ IPC handlers (billing:recordAutonomousTurnUsage, billing:flushUsageEvents, billing:settleAutonomousRun)
- ✅ Supabase RPC for settle_autonomous_task_run_pc
- ✅ AutonomousTaskBillingService (Supabase layer)
- ✅ Phase 3 staging tests (16/16 PASS)
- ✅ Recovery safety unit tests (6/6 PASS)
- ✅ Typecheck passes (no errors)

### Core Infrastructure
- ✅ Tier Compute isolation (code inspection verified)
- ✅ Authorization enforcement (User B rejection tested)
- ✅ Wallet atomicity (RPC + row locking)
- ✅ Idempotency guards (settled_at check)
- ✅ Error propagation (onTurnUsage failure blocks completion)
- ✅ Conservation invariant (staging Test 14 verified)

---

## 🔴 CRITICAL — MUST FINISH (4-Day Sprint)

### CRITICAL-1: Diagnostic Logging for E2E Verification
**Scope**: Add minimal logging to capture run evidence without changing billing behavior  
**Impact**: Required for final Day 4 runtime verification  
**Locations**:
- src/renderer/organization/AutonomousOrchestrator.ts: log run_id, wallet before/after, reservation amounts
- src/main/billing/UsageEventStore.ts: log append events with run_id, normalized_compute
- src/main/ipc/ipc.ts: log settlement calls with actualPc, billing event ID
- src/renderer/conversation/ConversationRuntime.ts: log onTurnUsage callback invocations

**Evidence to Capture**:
```
[AUTONOMOUS_RUN_START] runId=<uuid>, walletBefore=<pc>, reservationAmount=<pc>
[USAGE_EVENT_APPEND] runId=<uuid>, normalizedCompute=<num>, timestamp=<iso>
[SETTLEMENT_START] runId=<uuid>, flushingUsageEvents
[ACTUAL_PC_CALCULATED] runId=<uuid>, actualPc=<num>, isRecoveryRequired=<bool>
[SETTLEMENT_RPC_CALL] runId=<uuid>, settlingAmount=<pc>
[BILLING_EVENT_CREATED] eventId=<uuid>, amountPc=<num>, amountUsd=<decimal>
[SETTLEMENT_COMPLETE] runId=<uuid>, walletAfter=<pc>, reservedAfter=<pc>
```

**Acceptance Criteria**:
- Logs appear in console/dev tools during real execution
- No secrets/tokens logged
- No change to billing behavior, amounts, or calculations
- All logging is console.info/console.error (no spammy debug logs)

---

### CRITICAL-2: Electron App Staging Configuration
**Scope**: Wire staging environment to Electron build (already partially done)  
**Impact**: Day 4 runtime must use staging credentials automatically  

**Verification**:
- ✅ .env.staging exists with PAWOS_STAGING_URL, PAWOS_STAGING_ANON_KEY, PAWOS_STAGING_SERVICE_KEY
- ✅ readEnvFile.ts loads .env from cwd
- ☐ Electron app loads staging credentials when npm run dev is executed
- ☐ getSupabaseClient() uses PAWOS_STAGING_URL for staging execution

**Acceptance Criteria**:
- When running `npm run dev`, Electron connects to staging Supabase
- OrganizationId in staging database is used for all operations
- Auth endpoints are staging auth URLs

---

### CRITICAL-3: UI Entry Point for Autonomous Tasks (if missing)
**Scope**: Ensure AutonomousTaskBillingCard or Dashboard has a "Start Autonomous Task" button  
**Impact**: Without this, cannot trigger autonomous execution in Electron  

**Acceptance Criteria**:
- Dashboard shows "Autonomous Task Billing" card
- Card has visible button to create/run new autonomous task
- Clicking button invokes orchestrateAutonomousRun()
- Task selector shows available tickets/sources (or manual input)

**Status**: VERIFY — AutonomousTaskBillingCard exists but unclear if it has start button visible

---

### CRITICAL-4: Preload/IPC Bridge Verification
**Scope**: Ensure window.__pawos_ipc__ is properly initialized  
**Impact**: Without this, HeadlessTurnRunner cannot call IPC handlers  

**Files**:
- src/main/preload/preload.ts: must expose billingRecordAutonomousTurnUsage, billingFlushUsageEvents, billingSettleAutonomousRun
- src/renderer/services/ipc/ipcBridge.ts: must have getIpcBridge() working

**Acceptance Criteria**:
- getIpcBridge() returns object with all required billing methods
- Methods are callable from HeadlessTurnRunner
- No preload context errors

---

### CRITICAL-5: Build Process Integrity
**Scope**: npm run build succeeds without errors  
**Impact**: Without working build, cannot deploy to staging/production  

**Acceptance Criteria**:
- `npm run build` produces dist/main/main.js and dist/renderer files
- No build errors or warnings (webpack, TypeScript)
- Electron can load dist/main/main.js
- Renderer loads dist/renderer/index.html

---

---

## 🟡 IMPORTANT — SHOULD FINISH (4-Day Sprint)

### IMPORTANT-1: Autonomous Task UI Enhancements
**Scope**: Make autonomous task workflow clear in Dashboard  
**Impact**: Better UX for manual testing on Day 4  

**Items**:
- ☐ "Autonomous Task Billing" card prominence (already exists, verify visibility)
- ☐ Pending permission runs list with Allow/Deny buttons (partially exists in code)
- ☐ Status indicators (running, waiting_for_permission, waiting_for_topup, completed, blocked)
- ☐ Error messages clear and actionable
- ☐ Refresh button to reload run status

**Acceptance Criteria**:
- User can see current balance and reserved amount
- Pending permission runs visible with action buttons
- Run history shows completed autonomous tasks with amounts charged
- Error messages explain failures (not cryptic codes)

---

### IMPORTANT-2: Tier Compute Isolation Runtime Test
**Scope**: Add runtime verification that autonomous tasks don't consume Tier Compute  
**Impact**: Prove isolation works in real execution, not just code inspection  

**Approach**:
- Start one normal conversation, capture Tier Compute balance after
- Run one autonomous task
- Capture Tier Compute balance after
- Normal should decrease, autonomous should not affect it

**Acceptance Criteria**:
- Tier Compute consumed by normal conversation
- Tier Compute unchanged after autonomous task
- Balances logged for verification

---

### IMPORTANT-3: Settlement Idempotency Test
**Scope**: Verify settlement RPC idempotency in real Electron runtime  
**Impact**: Prove the same run_id settling twice returns same billing event  

**Approach**:
- Get first settlement result (billingEventId, amount_pc)
- Call settlement RPC again with same run_id
- Verify same event ID returned, no duplicate charge

**Acceptance Criteria**:
- Same run_id settles idempotently
- No duplicate billing events
- Amount unchanged on retry

---

### IMPORTANT-4: Error Recovery Workflow Documentation
**Scope**: Document what happens if UsageEventStore checkpoint corrupts  
**Impact**: Ops team knows how to recover from rare edge case  

**Document**:
- How recovery flag is triggered
- How to detect (run blocked status, error logs)
- How to recover (checkpoint repair/clear)
- How to retry settlement

**Acceptance Criteria**:
- Recovery workflow documented in RECOVERY_WORKFLOW.md
- Clear steps ops can follow
- Includes how to inspect checkpoint file

---

### IMPORTANT-5: Billing Failure Safety Runtime Test
**Scope**: Verify onTurnUsage recording failure prevents settlement  
**Impact**: Prove usage recording is critical path, not optional  

**Approach** (if feasible without modifying billing logic):
- Inject instrumentation to intentionally fail one usage recording
- Verify execution stops (doesn't continue to completion)
- Verify settlement not attempted
- Verify run marked as failed or blocked (not charged)

**Acceptance Criteria**:
- Failed usage recording = no silent completion
- No billing event created
- Run marked as failed/blocked (audit trail)

---

---

## 🟢 OPTIONAL — IF TIME PERMITS

### OPTIONAL-1: Autonomous Task Creation UI
**Scope**: Let users create new autonomous tasks from Jira/Linear/GitHub  
**Impact**: Full workflow from ticket to completion  
**Status**: DEFER if time constrained (recovery safety already prevents damage)

### OPTIONAL-2: Admin Center Autonomous Execution Section
**Scope**: Ops dashboard for viewing all autonomous runs  
**Status**: DEFER — not needed for sprint release

### OPTIONAL-3: Enhanced Billing History Export
**Scope**: CSV export with more detail  
**Status**: DEFER — basic export already works

### OPTIONAL-4: Autonomous Task Webhooks
**Scope**: Slack notification on completion  
**Status**: DEFER — not required for MVP

### OPTIONAL-5: Performance Optimization
**Scope**: Reduce UsageEventStore checkpoint I/O  
**Status**: DEFER — current model is safe, not slow

---

---

## IMPLEMENTATION ORDER (Days 1-4)

### **DAY 1: Backend/Billing Implementation** (Complete Today)

**Task 1.1**: Diagnostic Logging [CRITICAL-1]
- Add console.info calls to AutonomousOrchestrator, UsageEventStore, IPC handlers
- Capture: run_id, wallet amounts, reservation, usage events, settlement calls
- Verify: no secrets logged, no behavior changes

**Task 1.2**: Verify Staging Environment Configuration [CRITICAL-2]
- Confirm .env.staging is loaded by Electron
- Verify getSupabaseClient() uses staging credentials
- Test: npm run dev connects to staging, not production

**Task 1.3**: Verify Preload/IPC Bridge [CRITICAL-4]
- Confirm window.__pawos_ipc__ includes all billing methods
- Verify getIpcBridge() works in HeadlessTurnRunner
- Test: no "IPC bridge not available" errors

**Task 1.4**: Build Process Verification [CRITICAL-5]
- Run `npm run build` → verify success
- Verify dist/main/main.js and dist/renderer exist
- Check webpack bundle size (should be reasonable)

**Task 1.5**: Error Recovery Documentation [IMPORTANT-4]
- Write RECOVERY_WORKFLOW.md with ops recovery steps
- Document checkpoint inspection
- Include retry instructions

**Done if**: All CRITICAL items pass, build succeeds, typecheck clean

---

### **DAY 2: UI/Frontend Implementation** (Complete Today)

**Task 2.1**: Verify Autonomous Task UI Entry Points [CRITICAL-3]
- Locate "Create Autonomous Task" button in Dashboard
- Verify it calls orchestrateAutonomousRun() correctly
- Check that task selection/ticket input works

**Task 2.2**: UI Enhancement — Status & Visibility [IMPORTANT-1]
- Improve "Autonomous Task Billing" card visibility
- Add status indicators (running, waiting_for_permission, waiting_for_topup, etc.)
- Add refresh button
- Make pending permission list clear with Allow/Deny buttons

**Task 2.3**: Tier Compute Instrumentation [IMPORTANT-2]
- Add logging to CreditStore.consume() calls
- Log Tier Compute balance before/after normal and autonomous tasks
- Ensure logging doesn't change behavior

**Task 2.4**: Settlement Idempotency Instrumentation [IMPORTANT-3]
- Add logging to billing event creation
- Log settling RPC calls with run_id and amount
- Verify idempotency can be tested

**Done if**: UI works, logging visible in dev tools, no build errors

---

### **DAY 3: Testing & Edge Cases** (Complete Today)

**Task 3.1**: Regression Test Run
- Run `npm test` with focus on autonomous billing tests
- Verify all Phase 3 staging tests still pass
- Fix any breakages from Day 1-2 changes
- Ensure recovery safety tests still pass

**Task 3.2**: Build Verification
- `npm run build` → success
- `npm run typecheck` → clean
- No warnings or deprecations

**Task 3.3**: Staging Environment Dry-Run (No Execution Yet)
- Launch `npm run dev`
- Verify Electron starts
- Confirm staging credentials loaded
- Check console for errors
- Don't trigger any autonomous tasks yet

**Task 3.4**: Documentation & Cleanup
- Update AUTONOMOUS_BILLING_RUNTIME_AUDIT.md with current status
- Remove stale audit documents from Day 1
- Create FINAL_TESTING_PLAN.md for Day 4

**Done if**: Tests pass, build clean, Electron launches, documentation current

---

### **DAY 4: FINAL VERIFICATION** (CONSOLIDATED E2E)

**Phase A: Automated Checks (Morning)**
- Full typecheck: `npm run typecheck`
- Full unit/integration tests: `npm test` (Phase 3 staging suite focus)
- Build: `npm run build`
- Result: Zero failures before Electron launch

**Phase B: Real Electron Runtime (Afternoon)**
```
Launch Electron:
  npm run dev
  
TEST A: Real Autonomous Task Execution
  ✓ Wallet balance before (logged)
  ✓ Reserve 5000 PC (logged)
  ✓ Create autonomous task (manual selection)
  ✓ Task executes → usage events recorded
  ✓ Settlement calculates actual PC (logged)
  ✓ Billing event created (logged)
  ✓ Wallet charged correctly (logged)
  ✓ Conservation invariant verified

TEST B: Tier Compute Isolation
  ✓ Run normal conversation → Tier Compute decreases (logged)
  ✓ Run autonomous task → Tier Compute unchanged (logged)

TEST C: Settlement Idempotency
  ✓ Settle same run_id twice
  ✓ Same billing event ID returned
  ✓ No duplicate charge (verified in logs)

TEST D: Permission Gate (if waiting_for_permission triggered)
  ✓ Run blocked at permission check
  ✓ Approve via UI
  ✓ Execution resumes
  ✓ Settles correctly
```

**Phase C: Final Evidence Collection (Late Afternoon)**
- Screenshot: Dashboard with completed task and charge
- Console logs: Full run trace (run_id, usage, settlement, wallet)
- Database query: Verify billing event in organization_billing_events
- Conservation check: balance_pc + balance_reserved + actual_consumed = opening + topups

**Phase D: Production Readiness Declaration (Late Afternoon)**
If ALL tests PASS:
```
REAL_RUNTIME_E2E = VERIFIED ✅
Status: READY FOR PRODUCTION ✅
Final Action: Merge recovery safety fix → deploy to production
```

If ANY test FAILS:
```
REAL_RUNTIME_E2E = FAILED ❌
Issue: [specific test name and failure reason]
Action: Fix the issue, retest
```

---

---

## Success Criteria for Each Day

| Day | Criteria | Status |
|-----|----------|--------|
| **1 (Backend)** | CRITICAL-1/2/4/5 done, typecheck clean, build succeeds | TBD |
| **2 (Frontend)** | UI verified, logging visible, IMPORTANT-1/2/3 done | TBD |
| **3 (Testing)** | All tests pass, staging env dry-run succeeds, docs updated | TBD |
| **4 (E2E)** | All 4 real-runtime tests pass, evidence collected, production ready | TBD |

---

---

## Files Changed Summary (After All 4 Days)

### CRITICAL Changes
- `src/renderer/organization/AutonomousOrchestrator.ts` — diagnostic logging
- `src/main/billing/UsageEventStore.ts` — diagnostic logging (already has recovery safety)
- `src/main/ipc/ipc.ts` — diagnostic logging (already has handlers)
- `.env.staging` — verify it's used (no changes needed if already set up)

### IMPORTANT Changes
- `src/renderer/ui/Dashboard/sections/AutonomousTaskBillingCard.tsx` — UI enhancements
- `src/renderer/conversation/ConversationRuntime.ts` — onTurnUsage logging
- `src/main/billing/CreditStore.ts` — Tier Compute logging (optional)

### OPTIONAL Changes
- Documentation files (recovery workflow, testing plan)

### NO CHANGES
- Billing logic, calculations, RPC, settlement mechanics
- Entitlement matrix, subscription pricing
- Database schema or migrations
- Recovery safety guard (already complete)

---

---

## Deployment Checklist (Day 4, If PASSED)

- [ ] All tests pass (automated)
- [ ] Typecheck clean
- [ ] Build succeeds
- [ ] Real Electron runtime verification completed
- [ ] All 4 test scenarios (A/B/C/D) passed
- [ ] Evidence collected and documented
- [ ] Conservation invariant verified
- [ ] Recovery safety fix merged (if not already)
- [ ] Production database verified as staging (audit before prod)
- [ ] Ops team briefed on recovery workflow
- [ ] Deployment to production approved

---

**Status**: READY TO BEGIN IMPLEMENTATION  
**Start**: Now  
**Target Completion**: 4 days from start  
**Final Verdict Date**: Day 4 afternoon (after E2E verification)
