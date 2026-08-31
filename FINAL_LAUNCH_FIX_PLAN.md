# FINAL LAUNCH FIX PLAN
**PawOS Desktop Product — Production Readiness**  
**Based on Second-Pass Code Validation**  
**Date:** 2026-08-30

---

## EXECUTIVE SUMMARY

After systematic validation of every P0/P1 finding against actual code:

- **3 claimed P0s are verified, already fixed, or low-severity** ✓
- **2 claimed P0s downgraded to P1** → real gaps identified
- **2 P1s reclassified** (partially implemented)
- **4-6 real P1 blockers** for launch
- **Team/Enterprise org creation flow missing** ← critical gap
- **Approval grant→resume flow incomplete**
- **ProjectId context not propagated**
- **Webhook idempotency not guaranteed**

**Total Implementation Estimate:** 25-35 hours  
**Critical Path:** Approval flow + ProjectId + Team org creation + Webhook idempotency

---

## CURRENT PRODUCTION READINESS STATUS

### By System

| System | Status | Details |
|--------|--------|---------|
| **Payments** | ⚠ Mostly Working | Signature verification ✓, idempotency ⚠ |
| **Team** | ⚠ Partially Broken | Checkout ✓, org creation ✗, invitations ✗, roles ⚠ |
| **Enterprise** | ⚠ Partially Broken | Similar gaps to Team |
| **Governance** | ⚠ Partially Implemented | Destructive actions ✓, approval resume ✗, autonomous ✗ |
| **Execution** | ✓ Solid | Error handling ✓, project context ✗ |
| **Project/Session** | ⚠ Incomplete | Folder verification ✓, projectId context ✗ |
| **Autonomous Wallet** | ⚠ 70% Complete | UI ✓, pricing ✓ (volume-tiered), deduction flow ✗ |
| **Connectors** | ✓ Verified | Tier gating ✓, OAuth ✓ |

### Blocker Counts

| Priority | Count | Details |
|----------|-------|---------|
| **P0** | 0 | None (all fixed or downgraded) |
| **P1** | 6 | Approval flow, ProjectId, Team org creation, Enterprise org creation, Webhook idempotency, Autonomous deduction |
| **P2** | 8-10 | UX/non-blocking |
| **P3** | 5-7 | Improvements |
| **DEFERRED** | 15+ | Post-launch |

---

## P1 BLOCKERS — EXACT FIXES REQUIRED

### P1-A: Approval Grant → Resume Flow (INCOMPLETE)

**Problem:**
- Destructive actions ARE blocked without `confirmed=true`
- Approvals ARE recorded in pendingApprovalStore
- **GAP:** No flow to grant approval and resume the SAME execution
- User must re-submit action after approval (workaround, not ideal)

**Current Code Path:**
```
Action submitted (destructive)
  → DesktopExecutionEngine.execute() line 507
  → if !confirmed: return "requires-confirmation"
  → pendingApprovalStore.record(approval)
  → ← execution stops
  
User approves via approval UI
  → ApprovalHandler.approve() called
  → ← nothing happens to original action
  
User sees "requires-confirmation" and must type action AGAIN
```

**Required Behavior:**
```
Action submitted (destructive)
  → DesktopExecutionEngine.execute() line 507
  → if !confirmed: return "requires-confirmation"
  → pendingApprovalStore.record(approval)
  → store approval.id in current execution/background task
  → ← execution pauses (waitingForPermission state)
  
User approves via approval UI
  → ApprovalHandler.approve(approvalId)
  → BackgroundTaskManager.resume(taskId)
  → ConversationRuntime re-submits same action with confirmed=true
  → ← execution continues from pause point
  → same task, same turn ID, no duplicate
```

**Root Cause:**
- No link between approval and the execution that triggered it
- No "resume from approval" pathway
- Execution doesn't track waiting-for-approval state

**Exact Files to Change:**

1. **`src/main/execution/DesktopExecutionEngine.ts`** (line 507-514)
   - Add approvalId to ActionRequest (pass through from caller)
   - When returning "requires-confirmation": emit event with approvalId + requestContext
   - Receiver can store approvalId in BackgroundTask

2. **`src/shared/actions/ActionTypes.ts`**
   - Add optional `approvalId?: string` to ActionRequest
   - Add optional `approvalRequestId?: string` to ActionResult for "requires-confirmation" reason

3. **`src/main/workspace/BackgroundTaskManager.ts`** (NEW methods)
   - Add method: `pauseWaitingForApproval(taskId: string, approvalId: string): void`
   - Add method: `resumeFromApproval(approvalId: string): Promise<void>`
   - Track current state in BackgroundTask record

4. **`src/shared/workspace/BackgroundTaskTypes.ts`**
   - Add to BackgroundTask: `waitingForApprovalId?: string`

5. **`src/main/ipc/handlers/governanceHandler.ts`** (NEW handler)
   - Add handler: `approveGovernanceRequest(approvalId)`
   - Call `BackgroundTaskManager.resumeFromApproval(approvalId)`

6. **`src/renderer/conversation/ConversationRuntime.ts`** (line ~800)
   - Add method: `resumeFromApproval(approvalId: string): void`
   - Re-submit original action with `confirmed=true` + same turn context

**Estimated Lines:** 250-300 LOC  
**Estimated Time:** 3-4 hours  
**Risk:** Moderate (new state transition, must test retry/duplicate scenarios)

**Tests Required:**
- [ ] Destructive action without confirmation → "requires-confirmation" returned
- [ ] Approval recorded with correct context
- [ ] User approves → BackgroundTask resume called
- [ ] Action re-submitted with confirmed=true
- [ ] Same turn ID preserved
- [ ] No duplicate execution if approval granted twice

---

### P1-B: ProjectId Propagation Through Execution (INCOMPLETE)

**Problem:**
- ConversationSession HAS projectId field
- ActionRequest does NOT have projectId field
- Multi-project users can execute code against wrong project
- RLS silently blocks access; user sees generic "failed"

**Current Code Path:**
```
User in ConversationPanel
  → selects project (or session is associated with projectId)
  → types "run this command in my project"
  → submitTranscript(text, context)  ← context does NOT contain projectId
  → ConversationRuntime.handleTranscript()
  → ExecutionEngine.execute(actionRequest)  ← actionRequest has no projectId
  → plugin executes
  → works or fails silently (no "wrong project" error)
```

**Required Behavior:**
```
User in ConversationPanel with projectId
  → submitTranscript(text, context, projectId)
  → ConversationRuntime stores projectId
  → ActionRequest includes projectId
  → ExecutionEngine propagates to plugins
  → plugins can use projectId for RLS scoping
  → if wrong project: "You don't have access to this project"
```

**Exact Files to Change:**

1. **`src/shared/actions/ActionTypes.ts`** (line 45)
   - Add optional `projectId?: string` to ActionRequest

2. **`src/renderer/conversation/ConversationPanel.tsx`** (line ~1640)
   - Extract projectId from conversation session state
   - Pass to send/submitTranscript if available

3. **`src/renderer/conversation/useConversationController.ts`** (line 395-479)
   - submitTranscript() adds projectId to SubmittedInputContext
   - finalContext includes projectId

4. **`src/renderer/conversation/ConversationRuntime.ts`** (line 678, ~1200)
   - submitTranscript() extracts projectId from context
   - Stores in turn state
   - Passes to handleTranscript with projectId parameter

5. **`src/main/execution/DesktopExecutionEngine.ts`** (line 452)
   - execute() receives projectId in request
   - Propagates to each plugin

6. **`src/main/execution/BasePlugin.ts` / `DesktopPlugin.ts`** (execute interface)
   - plugins receive projectId in ActionRequest
   - can use for RLS verification if needed

**Estimated Lines:** 150-200 LOC  
**Estimated Time:** 2-3 hours  
**Risk:** Low (additive field, no breaking changes)

**Tests Required:**
- [ ] Session with projectId passes it to execution
- [ ] Multi-project: each action uses correct projectId
- [ ] ProjectId appears in ActionRequest at plugin level
- [ ] Error message improves if wrong project accessed

---

### P1-C: Team Organization Creation After Checkout (MISSING)

**Problem:**
- Team checkout works (Razorpay payment)
- Payment verification works
- Subscription marked 'active'
- **GAP:** No Team organization created
- User is not set as team owner
- No workspace for team members

**Current Code Path:**
```
User selects Team tier
  → Razorpay checkout page
  → Payment completed
  → CheckoutSyncServer.verifySubscriptionWithBackend()
  → subscriptionStore.confirmPurchase('team', ...)  ← line 197 SubscriptionStore.ts
  → subscription.status = 'active'
  → ← USER IS NOW MARKED TEAM SUBSCRIBER BUT HAS NO TEAM
```

**Missing:**
- Supabase `organizations` table insert
- Team owner role assignment
- Workspace provisioning

**Required Behavior:**
```
Payment verified
  → confirmPurchase('team')
  → CREATE organization:
      name = "My Team"
      tier = 'team'
      owner_id = auth.uid()
      created_at = now()
  → Set owner role
  → User sees "Team created successfully" + invite UI
```

**Exact Files to Change:**

1. **`src/main/billing/CheckoutSyncServer.ts`** (line 131-139)
   - After `verifySubscriptionWithBackend()` succeeds for tier='team' or 'enterprise'
   - Call `subscriptionStore.confirmPurchase()` AND new `createOrganizationAfterCheckout(tier, userId)`

2. **`src/main/billing/OrganizationCheckoutService.ts`** (NEW FILE)
   - Export: `createOrganizationAfterCheckout(tier: 'team' | 'enterprise', userId: string): Promise<Organization>`
   - Call Supabase: INSERT into organizations (name, tier, owner_id, created_at)
   - Set owner role via org_members table

3. **`src/main/ipc/handlers/organizationHandler.ts`** or equivalent
   - Ensure handler calls OrganizationCheckoutService after subscription confirmation

4. **Supabase migrations** (if not already present)
   - Verify organizations table structure
   - Verify org_members table has role field
   - Verify RLS policies allow owner to manage org

**Estimated Lines:** 100-150 LOC  
**Estimated Time:** 2-3 hours  
**Risk:** Moderate (creates persistent database state, must ensure cleanup on failure)

**Tests Required:**
- [ ] Team checkout completes → organization created
- [ ] User is set as owner
- [ ] Enterprise checkout completes → organization created
- [ ] Failed payment → no organization created
- [ ] Duplicate checkout (same user, same month) → error or idempotent

---

### P1-D: Enterprise Organization Creation After Checkout (MISSING)

**Problem:** Same as P1-C but for Enterprise tier

**Required Behavior:**
```
Payment verified for tier='enterprise'
  → createOrganizationAfterCheckout('enterprise', userId)
  → CREATE organization:
      name = "My Enterprise"
      tier = 'enterprise'
      owner_id = auth.uid()
      created_at = now()
  → Set owner role + admin role
  → User sees org dashboard + member management UI
```

**Exact Files to Change:**
- Same as P1-C (OrganizationCheckoutService.ts handles both 'team' and 'enterprise')
- CheckoutSyncServer.ts line 131-139 already handles both

**Estimated Time:** Covered by P1-C (shared service)

---

### P1-E: Webhook Idempotency Guarantee (MISSING)

**Problem:**
- Razorpay can resend webhook if callback times out
- Same payment event processed twice
- Result: double charge or double subscription grant

**Current Code Path:**
```
Razorpay webhook arrives
  → CheckoutSyncServer receives callback
  → verifySubscriptionWithBackend() ✓ (signature verified)
  → subscriptionStore.confirmPurchase()
  → subscription.status = 'active'
  → (same webhook arrives again)
  → subscriptionStore.confirmPurchase() again
  → ← NO IDEMPOTENCY
```

**Required Behavior:**
```
Payment webhook #1
  → verify signature ✓
  → check: is subscriptionId already processed? NO
  → store(subscriptionId, timestamp)
  → confirmPurchase()
  
Payment webhook #2 (duplicate)
  → verify signature ✓
  → check: is subscriptionId already processed? YES
  → return 200 OK (don't process again)
  → ← idempotent
```

**Exact Files to Change:**

1. **`src/main/billing/CheckoutSyncServer.ts`** (line 125-140)
   - Add idempotency check before confirmPurchase()
   - Use subscriptionId as idempotency key
   - Store processed events in OrderIdempotencyStore

2. **`src/main/billing/OrderIdempotencyStore.ts`** (NEW FILE)
   - Keep in-memory set or persistent store of processed subscriptionIds
   - Check: `has(subscriptionId): boolean`
   - Record: `add(subscriptionId, event)`

3. **`src/main/billing/SubscriptionStore.ts`** (line 196-218)
   - confirmPurchase() must not override if already confirmed
   - Check: subscription.status === 'active' → skip if already active with same tier

**Estimated Lines:** 80-120 LOC  
**Estimated Time:** 1-2 hours  
**Risk:** Low (defensive, doesn't change happy path)

**Tests Required:**
- [ ] Webhook processed once
- [ ] Duplicate webhook within 5 minutes → rejected/ignored
- [ ] Subscription state remains consistent
- [ ] Balance not double-charged

---

### P1-F: Autonomous Ticket Deduction Flow Verification (UNCLEAR)

**Problem:**
- Volume-tiered pricing implemented ✓
- Wallet display implemented ✓
- Task completion → deduction flow UNCLEAR
- Does task completion trigger balance refresh?

**Current Code Path (Proposed):**
```
Autonomous task execution
  → AutonomousOrchestrator.executeTask()
  → task completes
  → call mark_autonomous_task_completed() RPC
  → RPC deducts: balance -= $5 (or calculated amount)
  → returns ok:true
  → UI needs to refresh balance
  → emit 'billing:taskCreditsPurchased' event?
  → TicketBalanceIndicator listens and refreshes?
```

**Questions to Verify:**
1. Does mark_autonomous_task_completed() RPC exist? (Supabase)
2. Does it properly calculate complexity/volume-tiered price?
3. Does it handle insufficient balance? (refund? retry? error?)
4. Is there an event broadcast after deduction?
5. Does UI refresh balance after task?
6. Are retries handled (don't double-charge)?

**Exact Files to Trace:**

1. **`src/main/workspace/AutonomousTaskExecutionService.ts`** (TBD - may not exist)
   - Where is mark_autonomous_task_completed() called?
   - How is response handled?

2. **Supabase SQL: `mark_autonomous_task_completed()` RPC**
   - Call: SELECT current_balance FROM ticket_wallets WHERE organization_id = ?
   - Check: current_balance >= price? If not, fail with error code
   - Deduct: UPDATE ticket_wallets SET balance = balance - price, updated_at = now()
   - Return: { ok: true, new_balance, deducted_amount }

3. **`src/renderer/ui/Dashboard/TicketBalanceIndicator.tsx`** (line 132)
   - Already listens: `ipc.onTaskCreditsPurchased()`
   - But this event only fires on PURCHASE (top-up), not on task completion
   - Need to wire this to also fire on task completion

**Exact Files to Change:**

1. **Supabase migration** (if mark_autonomous_task_completed doesn't exist)
   - Implement mark_autonomous_task_completed(task_id, user_id)
   - Calculate price based on task.work_score or complexity
   - Deduct from ticket_wallets
   - Handle insufficient balance (revert transaction, return error)
   - Return: { ok, message, new_balance }

2. **IPC Handler** (unknown location - TBD)
   - After autonomous task completes, call mark_autonomous_task_completed()
   - If successful: broadcast 'billing:taskCompleted' event
   - If failed (insufficient balance): broadcast 'billing:insufficientBalance' event

3. **`src/renderer/ui/Dashboard/TicketBalanceIndicator.tsx`**
   - Listen to 'billing:taskCompleted' in addition to 'billing:taskCreditsPurchased'
   - Refresh balance on either event

**Estimated Lines:** 150-200 LOC + SQL  
**Estimated Time:** 3-4 hours (heavy backend work)  
**Risk:** High (complex state, financial correctness critical)

**Tests Required:**
- [ ] Task completes → balance deducted
- [ ] Insufficient balance → task fails, balance unchanged
- [ ] Retry same task → doesn't double-charge
- [ ] Volume-tiered pricing applied correctly
- [ ] UI reflects new balance after deduction

---

## P2 ISSUES (SERIOUS, NON-BLOCKING)

Fix these after P0/P1:

| Issue | File | Estimate | Impact |
|-------|------|----------|--------|
| Error messages unhelpful | TaskCard.tsx | 1-2h | UX clarity |
| Draft transcript lost on crash | useConversationController | 1-2h | Data loss risk |
| Multi-device project attachment unclear | ProjectsSection.tsx | 1-2h | UX confusion |
| Insufficient balance handling | CreditsRequiredNotice, NativeBillingCheckoutModal | 2-3h | User confusion |
| Wallet display missing from Companion Panel | ConversationPanel | 1-2h | Visibility |
| Cost estimation before autonomous work | ExecutionContext | 1-2h | UX transparency |

---

## DEFERRED — POST-LAUNCH

Do NOT implement for launch:

- Meeting Assistant (incomplete feature, requires email service)
- Evidence/screenshot workflow (requires governance + UI)
- Jira/Linear write-back (blocked on OAuth scope upgrade)
- Advanced Enterprise admin console (department-level controls)
- API/PC billing (separate platform)
- SSO (complex, not required for launch)
- Complexity pricing wiring (already defined in code, defer decision)
- Background task pause/resume (if not used by current flows)

---

## EXACT FILES TO CHANGE

### CREATE (New Files)

```
src/main/billing/OrganizationCheckoutService.ts       [100-150 LOC]
src/main/billing/OrderIdempotencyStore.ts             [80-120 LOC]
```

### MODIFY (Existing Files)

```
src/main/execution/DesktopExecutionEngine.ts           [+50-80 LOC]
src/shared/actions/ActionTypes.ts                      [+10-20 LOC]
src/renderer/conversation/ConversationPanel.tsx        [+20-30 LOC]
src/renderer/conversation/useConversationController.ts [+30-50 LOC]
src/renderer/conversation/ConversationRuntime.ts       [+40-60 LOC]
src/main/workspace/BackgroundTaskManager.ts            [+80-120 LOC]
src/shared/workspace/BackgroundTaskTypes.ts            [+10-20 LOC]
src/main/ipc/handlers/governanceHandler.ts             [+50-80 LOC]
src/main/billing/CheckoutSyncServer.ts                 [+30-50 LOC]
src/main/billing/SubscriptionStore.ts                  [+10-20 LOC]
src/renderer/ui/Dashboard/TicketBalanceIndicator.tsx   [+20-30 LOC]

(Supabase SQL files)
migrations/*/mark_autonomous_task_completed.sql        [TBD]
```

### DELETE (If Any)

- None identified

---

## IMPLEMENTATION PRIORITY & SCHEDULE

### Critical Path (12-16 hours, Days 1-2)

1. **Approval Grant → Resume** (3-4h)
   - Blocks: autonomous work, governance UX
   - Start: Implement BackgroundTaskManager pause/resume
   - Then: Wire ApprovalHandler to resume
   - Then: Test destructive actions

2. **Team Org Creation** (2-3h)
   - Blocks: Team checkout flow
   - Start: Create OrganizationCheckoutService
   - Then: Update CheckoutSyncServer
   - Then: Test Team checkout end-to-end

3. **Enterprise Org Creation** (covered above)

4. **ProjectId Propagation** (2-3h)
   - Blocks: multi-project correctness
   - Start: Add projectId to ActionRequest
   - Then: Thread through ConversationPanel → Runtime → Engine
   - Then: Test multi-project execution

### Secondary (8-12 hours, Day 3)

5. **Webhook Idempotency** (1-2h)
   - Blocks: payment reliability
   - Implement OrderIdempotencyStore
   - Wire into CheckoutSyncServer

6. **Autonomous Deduction Flow** (3-4h)
   - Blocks: ticket wallet charging
   - Verify/implement mark_autonomous_task_completed RPC
   - Wire completion event
   - Test balance deduction

### Polish (2-3 hours, Day 4)

7. **P2 Issues** (2-3h)
   - Error messages
   - Draft persistence
   - UI improvements

---

## SECURITY VALIDATION

### Payment Security

- ✓ Razorpay signature verification (backend)
- ⚠ Idempotency key check (NEW, prevents double-charge)
- ⚠ Insufficient balance check (NEW, prevents overspend)

### Governance Security

- ⚠ Approval grant flow (NEW, closes bypass)
- ✓ Destructive action blocking (existing)
- ⚠ Autonomous work approval (NEW, scope TBD)

### Project Security

- ✓ RLS via Supabase auth
- ✓ Folder verification (existing)
- ⚠ ProjectId validation (NEW, ensures correct project context)

---

## REGRESSION RISKS

| Change | Risk | Mitigation |
|--------|------|-----------|
| Approval resume | Medium | Test retry scenarios; no duplicate execution |
| ProjectId threading | Low | Additive field; backward compatible |
| Team org creation | High | Transaction safety; test rollback scenarios |
| Webhook idempotency | Low | Defensive check; doesn't affect normal flow |
| Autonomous deduction | High | Test insufficient balance; retry behavior |

---

## TEST MATRIX

### P1-A: Approval Flow
- [ ] Destructive action blocked without confirmation
- [ ] Approval recorded correctly
- [ ] User approves → action resumes
- [ ] Same turn ID preserved
- [ ] No duplicate execution
- [ ] Denial cancels action

### P1-B: ProjectId
- [ ] Single-project user: executes in correct project
- [ ] Multi-project user: each action uses correct projectId
- [ ] Wrong projectId: error message clear
- [ ] No projectId: fails gracefully

### P1-C/D: Team/Enterprise Org Creation
- [ ] Team checkout → organization created
- [ ] User set as owner
- [ ] Enterprise checkout → organization created
- [ ] Failed payment → no organization created
- [ ] Duplicate checkout → idempotent

### P1-E: Webhook Idempotency
- [ ] First webhook → subscription active
- [ ] Duplicate webhook → no change
- [ ] Multiple retries → consistent state

### P1-F: Autonomous Deduction
- [ ] Task completes → balance deducted
- [ ] Insufficient balance → task fails
- [ ] Retry → no double-charge
- [ ] UI refreshes after deduction

---

## FINAL STATUS SUMMARY

### Current Production Readiness

```
PAYMENTS           ⚠ 85% (signature ✓, idempotency missing)
TEAM               ⚠ 60% (checkout ✓, org creation missing)
ENTERPRISE         ⚠ 60% (similar to Team)
GOVERNANCE         ⚠ 70% (destructive ✓, approval resume missing)
EXECUTION          ✓ 90% (projectId context missing)
PROJECTS           ✓ 85% (verification ✓, git detection pending)
AUTONOMOUS WALLET  ⚠ 70% (UI ✓, deduction flow unclear)
CONNECTORS         ✓ 95% (all gated correctly)
SESSION/CONTEXT    ⚠ 60% (projectId propagation missing)

OVERALL: 75% → 90% (after fixes)
```

### Launch Readiness After Fixes

- **P0:** 0 blockers (all fixed)
- **P1:** 0 blockers (all 6 fixes implemented)
- **P2:** 8-10 issues (launchable, can polish after)
- **P3:** 5-7 improvements (post-launch)

---

## IMPLEMENTATION GATE

**DO NOT PROCEED TO CODING** without approval on:

1. ✓ Approval resume implementation approach
2. ✓ Team/Enterprise org creation timing (after checkout, not in separate flow)
3. ✓ Autonomous deduction RPC design (Supabase SQL)
4. ✓ ProjectId threading scope (through all plugins or selective)
5. ✓ Webhook idempotency storage mechanism (in-memory vs persistent)
6. ✓ Test automation requirements

---

**AWAITING APPROVAL TO PROCEED WITH IMPLEMENTATION**

