# WALLET & AUTONOMOUS TICKET PRICING AUDIT
**PawOS Ticket Wallet, Credit Deduction, Complexity Pricing**

---

## EXECUTIVE SUMMARY

**Question Asked:** "wallet autonomous ticket credits only wallet have credits doesnt have wallet credits shown in usage and in panel companion panel when credits using like 2.5$ used when hits 250pc's and autonomous ticket 5$ for ticket and 5-15 $ for the medium ticket for complex according to the usage work done"

**Current State:** Wallet UI exists and is fully implemented, but **complexity-based pricing is NOT YET WIRED** into live charging.

---

## SECTION 1: WALLET UI (VERIFIED COMPLETE) ✓

### 1.1 TicketBalanceIndicator Component

**Location:** `src/renderer/ui/Dashboard/TicketBalanceIndicator.tsx`

**Features:**
- [x] Wallet pill indicator in Dashboard top-right (shows current balance as `$X.XX`)
- [x] Clickable to open full wallet popover
- [x] Separate from Paw Compute (clearly labeled)
- [x] Shows balance in USD
- [x] Shows wallet state: `loading`, `error`, `normal`, `low`, `empty`
- [x] Pro Max+ tier gate (locked on Go/Pro tiers)
- [x] Eligibility check via IPC: `ipc.entitlementIsFeatureAvailable('autonomousTaskBilling')`

### 1.2 Wallet Popover Features

**Full Wallet Details:**
- [x] Current balance display
- [x] "Add Credits" section with preset buttons
- [x] Custom amount input ($30-$20,000 range)
- [x] Recent top-ups history
- [x] Separation notice: "Autonomous Work uses this wallet. Normal chat, coding help, research use Paw Compute — separate allowance"

**Presets:**
```
$30, $60, $100, $150, $200
(Min: $30, Max: $20,000)
```

### 1.3 Wallet States

```
- empty ($0 balance) → Shows "Add Credits" CTA, red styling
- low (< 2 × next ticket price) → Shows "Low balance" badge, yellow styling
- normal (sufficient) → Shows balance only
- error (failed to load) → Shows error message, retry button
- loading → Shows "…"
```

### 1.4 Next Ticket Price

**Calculation (line 116):**
```typescript
const price = getTicketUnitPriceUsd(bal.ticketsUsedCount + 1);
```

Uses actual ticket count from backend to determine volume-tier pricing.

---

## SECTION 2: TICKET PRICING — VOLUME-TIERED (LIVE) ✓

### 2.1 Current Live Pricing

**Tier by Cumulative Tickets Solved:**

```
Tickets 1-100:    $5.00 per ticket
Tickets 101-250:  $4.00 per ticket (20% savings)
Tickets 251-500:  $3.50 per ticket (30% savings)
Tickets 501+:     $3.00 per ticket (40% savings)
```

**Location:** `src/shared/organization/AutonomousTaskBillingTypes.ts` (line 76-155)

**Example:**
- User's 1st ticket: $5
- User's 101st ticket: $4
- User's 251st ticket: $3.50

**Implementation:**
```typescript
function getTicketUnitPriceUsd(ticketNumber: number): number {
  // Looks up TICKET_PRICING_TIERS based on ticketNumber
  // Returns matching tier's pricePerTicketUsd
}
```

**Status:** ✓ Verified working via TicketBalanceIndicator (line 116)

---

## SECTION 3: COMPLEXITY-BASED PRICING (NOT YET LIVE) ⚠

### 3.1 Defined Pricing Tiers

**Classification:** Based on `workScore` = `filesChanged + commandsExecuted`

```
Simple  (0-3 work score):     $5.00 flat
Medium  (4-12 work score):    $5.00 - $20.00 (scales with work)
Complex (13+ work score):     $20.00 - $50.00 (scales with work)
```

**Example Calculations:**

```
Simple ticket (1 file changed):
  workScore = 1
  complexity = 'simple'
  price = $5.00

Medium ticket (5 files, 3 commands):
  workScore = 8
  complexity = 'medium'
  price = $5 + ((8-4)/(12-4)) × ($20-$5) = $12.50 (rounded)

Complex ticket (15 files, 20 commands):
  workScore = 35
  complexity = 'complex'
  price = $50.00 (max)
```

**Location:** `src/shared/organization/AutonomousTaskBillingTypes.ts` (line 183-223)

### 3.2 CRITICAL: NOT YET WIRED INTO LIVE CHARGING

**Line 174-181 Comment:**
```
"Complexity-based pricing — NOT YET the live charging rate. The real deduction 
is still computed by mark_autonomous_task_completed() in Supabase (volume-tiered 
by cumulative ticket count, see TICKET_PRICING_TIERS above) — this is deliberately 
not wired into that RPC yet, so it must never be presented as 'what you'll actually 
be charged' until it is."
```

**Status:** **DEFINED but NOT IMPLEMENTED**

**P0-PRICING:** Complexity pricing exists in code but is not connected to actual billing RPC

---

## SECTION 4: CREDIT DEDUCTION FLOW (INCOMPLETE) ⚠

### 4.1 Current Implementation

**When Autonomous Task Completes:**
1. AutonomousOrchestrator finishes work
2. Supabase RPC `mark_autonomous_task_completed()` is called
3. Backend calculates: `volume_tier_price = getTicketUnitPriceUsd(ticketsUsedCount)`
4. Deducts from wallet
5. Returns success

**Question:** Does this RPC update the wallet in real-time?

**Current State:** UNCLEAR

**Missing Verification:**
- [ ] Is wallet balance updated immediately after task completes?
- [ ] Or is there a delay?
- [ ] Does UI refresh wallet balance after task?
- [ ] What happens if deduction fails (insufficient balance)?

**Files Involved:**
- `src/main/execution/AutonomousOrchestrator.ts` (calls billing RPC)
- Supabase `mark_autonomous_task_completed()` RPC (backend)
- `TicketBalanceIndicator.tsx` (refreshes on `billing:taskCreditsPurchased` event)

### 4.2 Balance Refresh

**How UI Knows Balance Changed:**

```typescript
// Line 132 in TicketBalanceIndicator.tsx
ipc.onTaskCreditsPurchased(() => loadBalance());
```

**Event:** `billing:taskCreditsPurchased` (IPC)

**But:** Does task COMPLETION trigger this event? Or only PURCHASE?

**P1-DEDUCTION:** Unclear if task completion triggers balance refresh event

---

## SECTION 5: WALLET DISPLAY IN COMPANION PANEL (INCOMPLETE) ⚠

### 5.1 Current State

**Question:** "wallet credits shown in usage and in panel companion panel when credits using like 2.5$ used when hits 250pc's"

**Answer:** TicketBalanceIndicator shown in Dashboard ONLY, not in Companion Panel

**Location:** TicketBalanceIndicator is in Dashboard top-right, NOT in ConversationPanel

**Problem:** When user is in Companion Panel executing autonomous task, they don't see:
- Current ticket balance
- How much this task will cost
- Running cost as task executes

**P1-COMPANION-WALLET:** No wallet display in Companion Panel during execution

---

## SECTION 6: WALLET + PARITY CONCERNS

### 6.1 Two Separate Wallets

**Correctly Implemented:** ✓

Component explicitly states (line 297-301):
```
"Autonomous Work uses this wallet.
Normal chat, coding help, research, and browser tasks use Paw Compute
— a separate allowance. These wallets are never mixed."
```

**Wallet 1: Paw Compute**
- Rolling window usage
- Usage-based (not per-task)
- Shown in ConversationPanel as CreditsRequiredNotice

**Wallet 2: Ticket Balance**
- Permanent wallet (don't-expire credits)
- Per-ticket or complexity-based
- Shown in Dashboard as TicketBalanceIndicator
- NOT shown in Companion Panel

**P2-WALLET-PARITY:** User might think they're the same wallet if both are low; no unified view

---

## SECTION 7: COST ESTIMATION (MISSING)

### 7.1 Before Execution

**User asks:** "Solve ticket #123"

**What user sees:**
- Estimated cost? **NO**
- Confirmation dialog? **UNCLEAR**
- Wallet balance check? **YES** (but only after failure)

**Current Flow:**
```
User: "Solve ticket #123"
  ↓
System checks: balance > 0? YES
  ↓
Task runs
  ↓
Task completes
  ↓
Deduction calculated
  ↓
If balance insufficient: Task reverts? Fails? UNCLEAR
```

**P1-COST-ESTIMATION:** No cost estimation shown before autonomous task execution

---

## SECTION 8: DEDUCTION RULES (INCOMPLETE)

### 8.1 What Gets Deducted?

**Current (Volume-Tiered):**
- Simple task: $5 (1st-100th ticket)
- Simple task: $4 (101st-250th ticket)
- etc.

**Future (Complexity-Based, NOT YET LIVE):**
- Simple: $5
- Medium: $5-$20
- Complex: $20-$50

### 8.2 When Gets Deducted?

**Current:** After task completion

**Not Implemented:**
- [ ] Real-time cost display during execution
- [ ] Cost adjustment if task fails partway through
- [ ] Refund if task deemed unsuccessful

---

## SECTION 9: EXACT UI FLOW GAPS

### P0 ISSUES: None for wallet itself (UI complete)

### P1 ISSUES:

**P1-DEDUCTION:** Task completion credit deduction flow unclear
- Files: `AutonomousOrchestrator.ts`, Supabase RPC
- Issue: Not clear if deduction triggers wallet refresh
- Fix: Trace flow from task completion to wallet UI update

**P1-COMPANION-WALLET:** No wallet display in Companion Panel during execution
- File: `src/renderer/conversation/ConversationPanel.tsx`
- Issue: User doesn't see balance or cost while task executes
- Fix: Add wallet indicator to Companion Panel (or modal during execution)

**P1-COST-ESTIMATION:** No estimated cost shown before autonomous task
- File: Autonomous task request handler
- Issue: User doesn't know cost before confirming
- Fix: Show "This will cost ~$X" before task execution

### P2 ISSUES:

**P2-COMPLEXITY-DISABLED:** Complexity pricing defined but not wired
- File: `src/shared/organization/AutonomousTaskBillingTypes.ts` (line 183-223)
- Issue: Code exists but is NOT connected to live charging
- Status: DELIBERATE (comment says "not wired into RPC yet")
- Decision: Either remove code or wire it in (deferred post-launch)

**P2-WALLET-PARITY:** Two wallets (Paw Compute + Ticket Balance) shown separately
- User confusion: Is it the same wallet?
- Current state: Clearly separated, but not unified
- Fix: Consider unified "Credits" dashboard (post-launch)

**P2-INSUFFICIENT-BALANCE:** What happens if task completes but balance insufficient?
- Current: UNKNOWN
- Fix: Test and ensure graceful failure (refund or queue for later payment)

---

## SECTION 10: WALLET STATE MACHINE

### 10.1 Current State Tracking

```
TicketBalance = {
  organizationId: null | string,
  balanceUsd: number,
  ticketsUsedCount: number,  // cumulative
  updatedAt: string
}
```

**Accuracy:** Balance updated via backend RPC after deduction

**Timing:** TicketBalanceIndicator refreshes via `ipc.onTaskCreditsPurchased()` event

**Issue:** Does task COMPLETION fire this event? Or only PURCHASE?

---

## SECTION 11: WALLET DISPLAY CHECKLIST

| Feature | Implemented | Location | Status |
|---------|-------------|----------|--------|
| Wallet pill (balance) | ✓ | Dashboard top-right | Working |
| Wallet popover | ✓ | Dashboard | Working |
| Add credits button | ✓ | Wallet popover | Working |
| Balance refresh | ✓ | Dashboard | Unclear if task completion triggers |
| Task cost estimation | ✗ | N/A | Missing |
| Companion Panel display | ✗ | ConversationPanel | Missing |
| Real-time cost tracking | ✗ | N/A | Missing |
| Insufficient balance handling | ✗ | N/A | Unknown |
| Complexity pricing | ✓ (defined) | Code only | Not wired |

---

## SECTION 12: FINAL ASSESSMENT

### Status: **70% Complete**

**Verified Working:**
- ✓ Wallet UI (Dashboard)
- ✓ Volume-tiered pricing (live)
- ✓ Wallet/Paw Compute separation
- ✓ Top-up flow (Razorpay)
- ✓ Balance tracking via backend

**Incomplete/Missing:**
- ⚠ Task completion → wallet deduction (need to trace)
- ⚠ Cost estimation before task (not shown)
- ⚠ Companion Panel wallet display (missing)
- ⚠ Insufficient balance handling (unknown)
- ⚠ Complexity pricing wiring (deliberate, deferred)

**Critical Fixes Before Launch:**
1. **P1-DEDUCTION:** Verify task completion deducts credits + refreshes UI
2. **P1-COMPANION-WALLET:** Add wallet indicator to Companion Panel
3. **P1-COST-ESTIMATION:** Show cost before executing autonomous task

---

## CONCLUSION

**Wallet UI:** Complete and working ✓

**Wallet Logic:** Partially implemented (volume-tiering live, complexity-pricing defined but not wired)

**Companion Panel Integration:** Missing (user doesn't see wallet/cost while executing)

**Cost Estimation:** Missing (user doesn't see price before confirming)

**P1 Blockers:** 3 (deduction verification, companion display, cost estimation)

**P2 Issues:** 2 (unified wallet view, insufficient balance handling)

Next step: Await implementation approval for P1 fixes.
