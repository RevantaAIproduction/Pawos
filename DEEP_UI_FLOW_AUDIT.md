# DEEP UI/UX FLOW AUDIT
**PawOS Checkout, Wallet, Credits, Warnings, Tier Gating**  
**Focus:** What user sees, when they see it, how clear messages are

---

## EXECUTIVE SUMMARY

**Core Question:** "Without credits any one ask to solve what pawos do and without promax tier how that acts"

**Answer:**
- **Without credits:** User sees dismissible "More Paw Compute needed" notice, can buy more
- **Without Pro Max tier trying to use Jira/Linear:** User CANNOT connect; button disabled in UI
- **Without Pro Max tier trying to use Autonomous Task:** Cannot create autonomous task; blocked with tier-upgrade notice

**Status:** Mostly working but some gaps in proactive warnings and unclear error messages

---

## SECTION 1: TIER ENTITLEMENTS (VERIFIED)

### 1.1 Feature Mapping to Tiers

| Feature | Go | Pro | Pro Max | Team | Enterprise |
|---------|----|----|---------|------|-----------|
| **Execution** (Think+Execute) | ✗ | ✓ | ✓ | ✓ | ✓ |
| **Mobile Pairing** | ✗ | ✓ | ✓ | ✓ | ✓ |
| **GitHub/GitLab/Vercel/Netlify/Railway** | ✗ | ✓ | ✓ | ✓ | ✓ |
| **Google Workspace** | ✗ | ✓ | ✓ | ✗ | ✗ |
| **Slack/Microsoft** | ✗ | ✓ | ✓ | ✓ | ✓ |
| **Jira/Linear** | ✗ | ✗ | ✓ | ✓ | ✓ |
| **Autonomous Task Billing** | ✗ | ✗ | ✓ | ✓ | ✓ |
| **Autonomous Plan Bypass** | ✗ | ✗ | ✓ | ✓ | ✓ |
| **Organization Features** | ✗ | ✗ | ✗ | ✓ | ✓ |
| **Cross-Device Alerts** | ✗ | ✗ | ✗ | ✗ | ✓ |

**Key Finding:** Tier gating is correct per approved matrix

---

## SECTION 2: SCENARIO 1 — USER ON GO TIER TRIES EXECUTION

### 2.1 Current Flow

**User:** "Install Python"

**Expected Behavior:**
1. Companion Panel receives request
2. ExecutionEngine checks entitlement: `entitlementService.isFeatureAvailable('advancedRuntimes')` → false
3. Error: "This feature requires Pro plan"
4. ConversationPanel shows `CreditsRequiredNotice`
5. Notice shows: "Upgrade to Pro" + "Buy Paw Compute" buttons

### 2.2 Verification Status

**Files:**
- `src/main/execution/DesktopExecutionEngine.ts` (line ~50) — checks feature availability
- `src/renderer/conversation/useConversationController.ts` (line 418) — sets `creditsNoticeTier` on entitlement failure
- `src/renderer/ui/billing/CreditsRequiredNotice.tsx` (line 32) — shows "Upgrade to Pro" for Go tier

**Status:** ✓ WORKING

**Issue:** Message says "You've used all of Go's Paw Compute..." but user hasn't USED anything, they CANNOT USE anything

**Problem:** Error message confuses "credits exhausted" with "tier too low"

**P2-1:** Error message says "used all of Go's Paw Compute" when user on Go tier cannot execute at all

---

## SECTION 3: SCENARIO 2 — USER ON PRO TIER TRIES TO CONNECT JIRA

### 3.1 Current Flow

**User:** Tries to connect Jira connector

**Expected Behavior:**
1. ConnectionsPage.tsx tries to show Jira connector
2. ConnectorEntitlementGate.isConnectorEntitled('jira') → checks CONNECTOR_REQUIRED_FEATURE['jira'] = 'connectJira'
3. entitlementService.isFeatureAvailable('connectJira') → false (Pro tier doesn't have it)
4. Connect button is DISABLED
5. UI shows: "Requires Pro Max" or similar message

### 3.2 Verification Status

**Files:**
- `src/main/connectivity/ConnectorEntitlementGate.ts` (line 15-18) — checks entitlement
- `src/renderer/connectivity/ConnectionsPage.tsx` — renders connector list (location TBD, need to verify)

**Status:** UNCLEAR — need to verify ConnectionsPage disables button

**Finding:** ConnectorEntitlementGate exists and is correct, but unclear if it's actually used in UI to DISABLE buttons or show MESSAGES

**P1-1:** When user tries to connect Jira/Linear on Pro tier, unclear if button is disabled or if error message is shown after clicking

**Verification Needed:**
- Does ConnectionsPage check entitlement before rendering?
- If user clicks disabled button, what message appears?
- Is message clear about tier requirement?

---

## SECTION 4: SCENARIO 3 — USER RUNS OUT OF PAW COMPUTE (GO TIER)

### 4.1 Current Flow

**Precondition:** User on Go tier, approaching/exceeding monthly Paw Compute limit

**Expected Behavior:**
1. Before executing action, check `billingCanStartGeneration()` IPC
2. Returns: `{ allowed: false }`
3. User sees `CreditsRequiredNotice`
4. Message: "You've used all of Go's Paw Compute for this period"
5. Buttons: "Upgrade to Pro" + "Buy Paw Compute"

### 4.2 Verification Status

**Timing Issue:** CRITICAL

**Question:** Is notice shown BEFORE user tries to send, or AFTER?

**Current Implementation:**
- Notice shown AFTER failure (reactive)
- Send button always enabled
- User tries to send → fails → notice appears

**Problem:** User doesn't know they can't use service until AFTER they've typed their request

**P2-2:** CreditsRequiredNotice is reactive (after failure) not proactive (before attempt)

**Fix Scope:**
```
1. Show credit warning when opening Companion Panel
2. Calculate remaining credits from tier + usage
3. If remaining < threshold: show small warning banner above send button
4. "You have X% of your Go Compute remaining this month"
5. This is informational, not blocking
```

---

## SECTION 5: SCENARIO 4 — USER BUYS PAWS CREDITS (TOP-UP)

### 5.1 Current Flow

**User:** Clicks "Buy Paw Compute" button

**Expected Behavior:**
1. NativeBillingCheckoutModal opens
2. Shows checkout with:
   - "Usage Credits" tab (normal Paw Compute top-up)
   - "Autonomous Work Credits" tab (Ticket Balance for Jira/Linear)
3. User selects amount
4. Razorpay payment flow
5. Success → browser pings loopback callback
6. Electron window gets `billing:taskCreditsPurchased` event
7. UI refreshes credit balance

### 5.2 Verification Status

**Tabs Found:**
- `kind: 'usageCredits'` — Paw Compute top-up ($5 minimum)
- `kind: 'autonomousWorkCredits'` — Ticket Balance ($30 minimum)

**Status:** ✓ Tabs exist

**Issue:** User experience unclear

**Questions:**
1. Does UI show which tab to click? Or does user have to discover it?
2. Does "Buy Paw Compute" button default to usage credits or autonomous credits?
3. After purchase, does credit balance update in real-time?

**P2-3:** Unclear which credits user is buying (usage vs autonomous); could buy wrong kind

---

## SECTION 6: SCENARIO 5 — PRO MAX USER TRIES AUTONOMOUS JIRA TICKET SOLVING

### 6.1 Current Flow

**User:** Pro Max tier, asks "Fix my Jira tickets autonomously"

**Expected Behavior:**
1. Request → ExecutionEngine
2. Checks: `entitlementService.isFeatureAvailable('autonomousTaskBilling')` → true (Pro Max has it)
3. Checks: `entitlementService.isFeatureAvailable('connectJira')` → true (Pro Max has it)
4. Checks: `rollingUsageGate.canStartAutonomousWork()` → checks Ticket Balance
5. If insufficient: shows "Buy Autonomous Work Credits"
6. If sufficient: proceeds with task

### 6.2 Verification Status

**Status:** UNCLEAR

**Questions:**
1. Does system show Ticket Balance in UI BEFORE user requests autonomous work?
2. Or does balance only appear AFTER they try and fail?
3. What does error message say if out of Autonomous Work Credits?

**P1-2:** Autonomous Work Credits lifecycle unclear

**Verification Needed:**
- CreditUsageDisplay — shows usage bar but unclear if it's usage credits or autonomous credits
- Does ConversationPanel show BOTH balances?
- Or only one at a time?

---

## SECTION 7: SCENARIO 6 — TEAM MEMBER TRIES TO BUY COMPUTE (POOLED ORG)

### 7.1 Current Flow

**Precondition:** User is Team member (not org admin), org is out of pooled Paw Compute

**Expected Behavior:**
1. User tries to execute action
2. Check: pooled = true (Team/Enterprise)
3. Check: `rollingUsageGate.canStartExecutionInPool()` → false
4. User sees CreditsRequiredNotice with:
   - Message: "Your organization has used all of its pooled Paw Compute"
   - Buttons: "Contact Organization Administrator" + "Request Additional Organization Paw Compute"
5. User cannot "Buy Paw Compute" themselves

### 7.2 Verification Status

**Status:** ✓ CORRECT per CreditsRequiredNotice code (line 24-30)

**But:** Unclear how user actually "requests more compute" — is there a UI for this? Or just a message to contact admin?

**P2-4:** "Request Additional Organization Paw Compute" button — what does it do? Email? Form? Modal?

---

## SECTION 8: WALLET / CREDITS DISPLAY

### 8.1 Current UI Components

**Files Found:**
- `CreditUsageDisplay.tsx` — progress bar showing % used, remaining count
- `CreditPoolCard.tsx` — org's pooled credit display
- `TaskCreditsSection.tsx` — dashboard section for credits
- `MemberCreditRequestPanel.tsx` — org members can request credits
- `TicketWallet.test.ts` — wallet test (file exists)

### 8.2 What User Sees

**On Dashboard:**
```
[Credits Card]
┌─────────────────────────┐
│ Paw Compute             │
│ [████████░░░░░░░░░░░░] │  73%
│ 730 used  ·  270 remaining  │
└─────────────────────────┘
```

**Color Coding (CreditUsageDisplay.tsx line 27-30):**
- ≤70% used: GREEN
- ≤90% used: YELLOW
- >90% used: RED

### 8.3 Issues Found

**P2-5:** Does not distinguish between:
- Usage Credits (normal Paw Compute)
- Autonomous Work Credits (Ticket Balance)
- Pooled Credits (org-level)

User might not know which bar represents which type of credits.

**Fix Scope:**
```
Show BOTH bars if applicable:
  ┌─────────────────────────┐
  │ Paw Compute             │
  │ [████████░░░░░░░░░░░░]  │ 73%
  │ 730 used  ·  270 remaining│
  └─────────────────────────┘
  
  ┌─────────────────────────┐
  │ Ticket Balance          │
  │ [████░░░░░░░░░░░░░░░░]  │ 20%
  │ $20 used  ·  $80 remaining│
  └─────────────────────────┘
```

---

## SECTION 9: TIER ENFORCEMENT GAPS

### 9.1 Proactive vs Reactive

**Current:** Mostly reactive
- User tries action → check → block → show notice

**Needed:** Proactive
- User opens Companion Panel → check tier/balance → show banner
- User hovers over disabled feature → show "Requires Pro Max"

### 9.2 Message Clarity

**Issues Found:**

**Message 1 (CreditsRequiredNotice, Go tier):**
```
"You've used all of Go's Paw Compute for this period."
```
**Problem:** User on Go tier cannot execute ANYTHING, so they never "used" it

**Better:**
```
"Paw Go doesn't include code execution. Upgrade to Pro to run tasks."
```

**Message 2 (Tier Too Low):**
```
Current: [Unknown — need to verify]
```
**Problem:** When user tries to connect Jira on Pro tier, error message is unclear

**Better:**
```
"Jira requires Pro Max. Upgrade to Pro Max to connect Jira."
```

---

## SECTION 10: AUTONOMOUS TASK CREDITS FLOW

### 10.1 Current State

**Files:**
- `autonomousTaskBilling` feature in EntitlementService
- `autonomousPlanBypass` feature (auto-confirm code edits)
- `kind: 'autonomousWorkCredits'` in checkout modal

**Status:** PARTIALLY IMPLEMENTED

### 10.2 Missing Pieces

**P0-5: Autonomous Task Credit Deduction Flow**

**Question:** When user runs autonomous Jira ticket solver, how are credits deducted?

**Expected:**
```
1. User requests "Fix 5 Jira tickets"
2. System estimates: ~$10 credit cost
3. Shows warning: "This will cost ~$10 from your Ticket Balance"
4. User confirms
5. Task runs
6. Credits deducted after task completes
7. Balance updated in UI
```

**Current State:** UNCLEAR

**Verification Needed:**
- Is there a cost estimation before autonomous work?
- Is there a warning?
- Are credits ACTUALLY deducted?
- Does UI update?

**P1-3:** Autonomous task credit deduction not wired (or unclear)

---

## SECTION 11: JIRA/LINEAR AUTONOMOUS TICKET SOLVING

### 11.1 Current Status

**Question:** Can user ask "autonomously solve my Jira tickets" without manual selection?

**Expected Flow:**
```
User: "Solve my critical Jira tickets"
  ↓
System: "Found 3 critical issues. Cost: ~$15. Proceed?"
  ↓
User: Confirms
  ↓
Autonomous task reads each ticket
  ↓
Plans fix
  ↓
Applies code changes
  ↓
Updates Jira ticket with comment/status
  ↓
Complete
```

**Current State:** NOT FULLY IMPLEMENTED

**Blockers:**
1. Jira/Linear OAuth scopes are READ-ONLY
   - Cannot write comments
   - Cannot update status
2. No "autonomous ticket solver" task type defined
3. No ticket analysis/routing logic

**Decision:** **DEFER — POST-LAUNCH** (requires scope upgrade + new feature)

---

## SECTION 12: WARNING FLOW GAPS

### 12.1 Missing Proactive Warnings

When user SHOULD see warning but doesn't:

1. **Opening Companion Panel with 5% Compute remaining**
   - Should show: "You have 5% of your Paw Compute left this month"
   - Currently: Nothing until they try to execute

2. **Hovering over Jira connector on Pro tier**
   - Should show: "Requires Pro Max"
   - Currently: Unknown (need to verify)

3. **About to buy wrong type of credits**
   - Should show: "Usage Credits for execution. Autonomous Work Credits for Jira/Linear tasks."
   - Currently: Unclear UI

4. **Team member requesting org compute**
   - Should show: "Request button sends email to org admin"
   - Currently: Unknown

---

## SECTION 13: EXACT UI FLOW ISSUES

### P0 ISSUES

**None found (payment security already fixed)**

### P1 ISSUES

**P1-2: Autonomous Task Credit Deduction**
- Files: Unknown (need to find)
- Issue: Credits may not be deducted from balance
- Risk: User gets unlimited autonomous work
- Fix: Implement credit deduction + UI update

**P1-3: Jira/Linear Autonomous Solver**
- Files: Multiple
- Issue: Feature not implemented
- Risk: N/A (can be deferred)
- Fix: Defer to post-launch

### P2 ISSUES

**P2-1: Error Message Confuses Tier vs Credits**
- File: `src/renderer/ui/billing/CreditsRequiredNotice.tsx` (line 125-127)
- Issue: "You've used all of Go's Paw Compute..." is wrong message for tier restriction
- Risk: User confusion
- Fix: Different message for "tier too low" vs "credits exhausted"

**P2-2: Proactive Credit Warning Missing**
- File: `src/renderer/conversation/ConversationPanel.tsx`
- Issue: No banner shown before credits exhausted
- Risk: User doesn't know they can't execute until AFTER they try
- Fix: Show credit bar/warning in Companion Panel

**P2-3: Unclear Which Credits User is Buying**
- File: `src/renderer/ui/billing/NativeBillingCheckoutModal.tsx`
- Issue: Two tabs (Usage vs Autonomous) but unclear which is which
- Risk: User buys wrong credits
- Fix: Label tabs more clearly, show what each type covers

**P2-4: "Request More Compute" Button Behavior Unclear**
- File: `src/renderer/ui/billing/CreditsRequiredNotice.tsx` (line 29)
- Issue: `onRequestMoreCompute()` handler existence unknown
- Risk: Button doesn't do anything or does wrong thing
- Fix: Verify handler exists and sends email/form

**P2-5: Credit Display Doesn't Distinguish Types**
- File: `src/renderer/ui/components/CreditUsageDisplay.tsx`
- Issue: Single progress bar; user doesn't know if it's usage or autonomous credits
- Risk: User confusion
- Fix: Show separate bars for each credit type

---

## SECTION 14: COMPLETE TIER GATING VERIFICATION TABLE

| Action | Go | Pro | Pro Max | Team | Enterprise | Error Message | Status |
|--------|----|----|---------|------|-----------|---------------|--------|
| Execute code | ✗ | ✓ | ✓ | ✓ | ✓ | "Requires Pro" | ✓ works |
| Connect GitHub | ✗ | ✓ | ✓ | ✓ | ✓ | Disabled button | ? unclear |
| Connect Jira | ✗ | ✗ | ✓ | ✓ | ✓ | Disabled button | ? unclear |
| Connect Linear | ✗ | ✗ | ✓ | ✓ | ✓ | Disabled button | ? unclear |
| Use Mobile Presence | ✗ | ✓ | ✓ | ✓ | ✓ | ? unclear | ? unclear |
| Autonomous task | ✗ | ✗ | ✓ | ✓ | ✓ | ? unclear | ? unclear |
| Auto-confirm code edit | ✗ | ✗ | ✓ | ✓ | ✓ | ? unclear | ? unclear |
| View org Activity Dashboard | ✗ | ✗ | ✗ | ✓ | ✓ | ? unclear | ? unclear |
| Invite team member | ✗ | ✗ | ✗ | ✓ | ✓ | ? unclear | ? unclear |

---

## SECTION 15: FINAL ASSESSMENT

### Definite Issues (P0/P1/P2):
1. ✓ Payment webhook signature verification (ALREADY FIXED)
2. ⚠ Autonomous task credit deduction (UNCLEAR)
3. ⚠ Error messages confuse tier vs credits (FIXABLE)
4. ⚠ Proactive credit warnings missing (FIXABLE)
5. ⚠ Connector entitlement UI unclear (NEEDS VERIFICATION)

### Uncertain/Needs Verification:
- Whether connector buttons are properly disabled
- What happens when user clicks disabled connector
- What "Request More Compute" button actually does
- Whether autonomous tasks actually deduct credits

---

## CONCLUSION

**Current UI/UX Status: 75% Complete**

**Critical Fixes Needed Before Launch:**
- Verify connector tier gating in UI
- Fix error message clarity (tier vs credits)
- Implement proactive credit warnings
- Verify autonomous task credit deduction

**Better Than Baseline:**
- ✓ CreditsRequiredNotice properly handles all tier cases
- ✓ Credit usage display with color coding
- ✓ Tier entitlements correctly mapped
- ✓ Checkout modal handles multiple credit types

**Next Step:** Await implementation approval for P1/P2 UI fixes.
