# Complete Limits, Usage, and Purchase Flow Audit

**Audit Date:** 2026-08-28  
**Scope:** Current implementation of limits → enforcement → exhaustion → purchase → new limits

---

## **PART 1: CURRENT LIMIT DEFINITIONS**

### **1.1 Where Limits Are Stored**

**File:** `src/main/billing/UsageQuotaConfigStore.ts`

**Tracked Capabilities:**
```typescript
export type UsageCapability = 
  | 'aiReasoning'              // Monthly AI conversation turns
  | 'repositoryAnalysis'        // Monthly repo analysis  
  | 'websiteAnalysis'           // Monthly website analysis
  | 'codeExecution'             // Monthly command executions
  | 'browserAutomation'         // Monthly browser automation
  | 'desktopAutomation'         // Monthly desktop automation
  | 'longRunningWorkflow'       // Monthly long-running workflows
  | 'autonomousExecution'       // Monthly autonomous task runs
```

**Current Tier Limits:**
```
Go:              0 free for ALL (pay immediately per use)
Pro:             200-500 free/month per capability  
Pro Max (5x):    5× Pro multiplier (1000-2500 free/month) — $100/month
Pro Max (20x):   20× Pro multiplier (4000-10000 free/month) — $250/month
Team:            150-400 free/month per user (pooled)
Enterprise:      null/unlimited (pooled at organization level)
```

**Example - aiReasoning (conversation turns):**
```
Go:         0 free, limit = 0 (Go can't do AI)
Pro:        2000/month, 1000/week capped
Pro Max:    40000/month (20× Pro), 10000/week capped
Team:       1500/month per user (pooled per org)
Enterprise: null (unlimited, pooled)
```

---

### **1.2 Compute Cost Constants**

**File:** `src/shared/execution/ComputeCostConstants.ts`

**Current PC Costs (OUTDATED):**
```
edit:       0.5 PC per line
command:    2 PC per command
file-access: 0.2 PC per file
analysis:   1.5 PC per analysis
generation: 2.5 PC per generation
execution:  2 PC per execution
```

**Action Types Missing:**
- appCloning
- assetUpload
- assetAnalysis  
- pageBuild
- browserOpen (0.30 PC)
- contentAnalysis (0.10 PC)

**Problem:** These don't match new pricing model (edit should be 4 PC, not 0.5 PC, etc.)

---

### **1.3 How Limits Are Enforced**

**Enforcement Flow:**

```
User submits message
    ↓
EntitlementService.getCreditLimit() 
    (fetches from UsageQuotaConfigStore)
    ↓
Check: usedThisPeriod < monthlyLimit
    ↓
YES → Allow action
NO  → BLOCK + Show error (see 1.4 below)
```

**File:** `src/main/billing/EntitlementService.ts` (lines 99-200+)

**Current Limit Check:**
```typescript
const monthlyLimit = getTierQuota(tier, capability);
const used = creditStore.getBalance().usedThisPeriod;

if (used >= monthlyLimit) {
  return { canExecute: false, reason: 'monthly-limit-exceeded' };
}
```

---

## **PART 2: CURRENT USAGE TRACKING**

### **2.1 Where Usage Is Tracked**

**File:** `src/main/billing/CreditStore.ts`

**State Tracking:**
```typescript
type CreditState = {
  usedThisPeriod: number;     // Sum of all PC consumed this month
  bonusThisPeriod: number;    // Extra PC from referral credits (resets monthly)
  periodResetsAt: number;     // Timestamp when month resets
  usedThisWeek: number;       // Weekly counter (independent)
  weekResetsAt: number;       // When week resets
  fableUsedThisPeriod: number; // Fable model usage (separate)
  history: Array<{             // Last 200 transactions
    amount: number;            // PC consumed
    reason: string;            // 'edit', 'command', etc.
    at: timestamp;
    category?: string;
  }>;
};
```

**File:** `src/main/billing/CreditStore.ts` (persist to `credits.json`)

---

### **2.2 How Usage Is Recorded**

**When Action Completes:**

```typescript
// 1. Action executes (e.g., code edit uses 4 PC)
const pcCost = calculateComputeCost('edit', 1); // = 4 PC

// 2. Record consumption
creditStore.consume(
  4,                    // amount
  'edit-line',          // reason
  'code-editing',       // category
  false                 // not Fable
);

// 3. Update local state
// usedThisPeriod += 4
// usedThisWeek += 4
// history.push({amount: 4, reason: 'edit-line', at: now})
```

**Files Involved:**
- `src/renderer/conversation/ConversationRuntime.ts` - records after turn completes
- `src/renderer/conversation/useConversationController.ts` - submits to backend via IPC
- `src/main/billing/CreditStore.ts` - stores locally + persists to JSON

---

### **2.3 Tier-Based Limit Resolution**

**Resolution Logic:**

```typescript
// Get user's current tier
const entitlement = await entitlementService.getSnapshot();
const tier = entitlement.tier; // 'go', 'pro', 'proMax', 'team', 'enterprise'

// Look up monthly limit for this capability
const quotaConfig = usageQuotaConfigStore.getConfig();
const tierQuota = quotaConfig.tiers[tier];
const monthlyLimit = tierQuota.perUserQuotas['aiReasoning'].monthlyLimit;

// Check if used + new action <= limit
const used = creditStore.getBalance().usedThisPeriod;
const remaining = monthlyLimit - used;

if (newActionCost > remaining) {
  → LIMIT EXCEEDED (see Part 3)
}
```

---

## **PART 3: CURRENT "LIMIT REACHED" BEHAVIOR**

### **3.1 When Limit Is Hit**

**Current Error Message:**
```
"Daily limit exceeded. Upgrade plan or buy credits."
```

**File:** `src/renderer/conversation/useConversationController.ts` (line ~200+)

```typescript
if (used >= monthlyLimit) {
  setCreditsNoticeTier(tier); // Triggers exhaustion notice
}
```

**Issues with Current Messaging:**
1. Says "daily limit" but it's actually monthly
2. Doesn't differentiate between "upgrade" vs "buy credits"
3. Go tier: only says "buy credits" (should say "upgrade to Pro")
4. Pro Max: says "upgrade" (should only say "buy credits" - can't upgrade further)

---

### **3.2 Current Error UI Flow**

**When limit hit:**

```
[⚠️ Limit Exceeded]
Daily limit reached.
[ Buy Credits ]  [ Upgrade Plan ]  [ OK ]
```

**Problems:**
- Button labels are wrong
- Go tier shows "upgrade" option but has no credits system
- Pro Max shows "upgrade" option (can't upgrade)
- Messaging is confusing

---

### **3.3 Where Exhaustion Is Handled**

**Files:**
- `src/renderer/conversation/useConversationController.ts` - detects limit exceeded
- Sets: `creditsNoticeTier` state → triggers notice UI
- `src/renderer/ui/billing/NativeBillingCheckoutModal.tsx` - shows checkout dialog

**Current Flow:**
```
1. User submits message
2. Runtime completes, usage recorded
3. Check: used > limit?
4. YES → setCreditsNoticeTier(tier)
5. Notice appears with buttons
6. User clicks button → opens checkout
7. Payment → credits applied via IPC
```

---

## **PART 4: WHAT HAPPENS AFTER BUYING CREDITS**

### **4.1 Credit Purchase Types**

**File:** `src/renderer/ui/billing/NativeBillingCheckoutModal.tsx`

**Three Purchase Options:**

1. **Tier Upgrade** (tierPurchase)
   ```typescript
   {
     kind: 'tierPurchase',
     tier: 'pro' | 'proMax' | 'team' | 'enterprise',
     // Updates SubscriptionStore.tier
     // New limits apply immediately via EntitlementService
   }
   ```

2. **Usage Credits Top-up** (usageCredits)
   ```typescript
   {
     kind: 'usageCredits',
     amountUsd: 5-500,  // $5 minimum, $500 max per transaction
     // Maps USD to PC: $1 = X Paw Computes
     // Calls: creditStore.grantBonus(pcAmount)
   }
   ```

3. **Autonomous Work Credits** (autonomousWorkCredits)
   ```typescript
   {
     kind: 'autonomousWorkCredits',
     amountUsd: 30-1000, // $30 minimum
     // Separate from usage credits, for autonomous tasks only
   }
   ```

---

### **4.2 Payment Processing**

**Payment Provider:** Razorpay (India-based)

**Flow:**
```
1. User selects amount
2. Modal calls Razorpay.createPayment()
3. Payment goes through (card/UPI/etc)
4. Razorpay webhook → backend
5. Backend applies credits:
   - tierPurchase → Update SubscriptionStore.tier
   - usageCredits → creditStore.grantBonus(amount)
6. IPC notifies frontend
7. Frontend refreshes entitlement
```

**Status Updates:**
```
idle → creating → processing → verifying → otp-entry → success
   ↓                                              ↓
 [Initializing]  [Processing]  [Verifying]  [Success]
```

---

### **4.3 Credit Types in System**

**Currently Two Credit Types:**

1. **Referral Credits ("Paw Credits")**
   - Earned: Users get for referrals
   - Stored: Supabase table `paw_credit_balance`
   - Value: Converts $1 credit = X PC
   - File: `src/renderer/organization/ReferralCreditService.ts`

2. **Bonus Compute (from purchases)**
   - Earned: Buy via checkout
   - Stored: `creditStore.bonusThisPeriod`
   - Value: Direct PC amount
   - Resets: Monthly with usedThisPeriod

---

### **4.4 How Credits Are Applied**

**After Payment Success:**

```typescript
// Option 1: Tier Upgrade
await subscriptionStore.setTier('pro');
await entitlementService.refresh(); // New limits take effect

// Option 2: Add Bonus Compute
creditStore.grantBonus(500); // Add 500 PC to bonusThisPeriod
// Now: can execute 500 PC more of actions this month

// Option 3: Redeem Referral Credits
await referralCreditService.redeem(50); // $50 value
const pawComputeAmount = 50 * PAW_COMPUTE_UNITS_PER_CREDIT_USD;
creditStore.grantBonus(pawComputeAmount);
```

---

## **PART 5: WHAT HAPPENS AFTER TIER UPGRADE**

### **5.1 Immediate Changes**

**File:** `src/main/billing/SubscriptionStore.ts`

**Step 1: Update Subscription**
```typescript
subscriptionStore.setTier('proMax');
// Changes: tier = 'proMax', status = 'active'
// Persists to: subscription.json
```

**Step 2: Update Entitlements**
```typescript
const entitlement = await entitlementService.getSnapshot();
// Now returns:
{
  tier: 'proMax',
  features: ['advancedRuntimes', 'connectJira', 'autonomousTaskBilling', ...],
  models: ['paw-flash', 'paw-swift', 'paw-core', 'paw-vision'],
  monthlyLimit: 40000, // Conversation turns
}
```

**Step 3: New Limits Take Effect**

**Pro Max 5x variant ($100/month):**
```
Old (Pro):          2000 aiReasoning/month
New (ProMax 5x):   10000 aiReasoning/month  (5× multiplier)

Old:  50 browserOpens/month
New:  250 browserOpens/month

Old:  100 codeEdits/month
New:  500 codeEdits/month
```

**Pro Max 20x variant ($250/month):**
```
Old (Pro):          2000 aiReasoning/month
New (ProMax 20x):  40000 aiReasoning/month  (20× multiplier)

Old:  50 browserOpens/month
New:  1000 browserOpens/month

Old:  100 codeEdits/month
New:  2000 codeEdits/month
```

---

### **5.2 What Can User Do Now?**

**Tier: Pro → Pro Max (Choose Variant)**

**Pro Max 5x ($100/month):**
- ✅ Connect Jira
- ✅ Connect Linear
- ✅ Autonomous task billing
- ✅ 5× higher monthly limits (2000 → 10000 aiReasoning)
- ✅ 1000/week cap on aiReasoning

**Pro Max 20x ($250/month):**
- ✅ All Pro Max 5x features
- ✅ 20× higher monthly limits (2000 → 40000 aiReasoning)
- ✅ 10,000/week cap on aiReasoning (highest ceiling)

**File:** `src/main/billing/EntitlementService.ts` (PRO_MAX_FEATURES array)

---

### **5.3 Usage Counter Reset Behavior**

**After Upgrade, Current Counters:**
```
usedThisPeriod: NOT RESET
  (still shows 1500/2000 if Pro, but new limit is 40000)
  
monthlyLimit: UPDATED
  (from 2000 to 40000)
  
Effective remaining: 40000 - 1500 = 38500
```

**Problem:** User sees they've used 1500 but the limit display changes from "1500/2000" to "1500/40000"

---

## **PART 6: COMPLETE FLOW DIAGRAM**

```
                    ┌─ User at Pro tier, 1900/2000 aiReasoning used
                    └─ Wants to chat
                         ↓
                    Submit message
                         ↓
              Check: 1900 < 2000? → YES
                         ↓
              Allow action, execute
                         ↓
              Usage: +150 PC consumed
                         ↓
              Check: 2050 < 2000? → NO ❌
                         ↓
         ┌───────────────┴───────────────┐
         ↓                               ↓
    [Show Error]                [Allow Partial]?
    "Limit Reached"          (depends on action)
         ↓
    ┌────┴────┐
    ↓         ↓
  [Buy]   [Upgrade]
  Credits    Plan
    ↓         ↓
    │    Go to Checkout
    │    selectIntent: 'tierPurchase'
    │    tier: 'proMax'
    │         ↓
    │    Choose variant:
    │    ┌─ Pro Max 5x ($50) → 10000/month
    │    └─ Pro Max 20x ($100) → 40000/month
    │         ↓
    │    User pays selected amount
    │         ↓
    │    SubscriptionStore.setTier('proMax', variant: '5x' or '20x')
    │    EntitlementService.refresh()
    │    New limits applied (5× or 20×)
    │         ↓
    └────────→ [Success! Can continue]
            New allowance: limit - 1900 = remaining
```

---

## **PART 7: MISSING IMPLEMENTATIONS FOR NEW PRICING MODEL**

### **7.1 Not Implemented Yet**

1. **Go tier cannot execute**
   - ❌ Go tier CAN still do AI analysis
   - ✅ Should be planning/analysis only

2. **App cloning not in system**
   - ❌ No cloning capability tracked
   - ❌ No complexity-based cost (1200/5000/10000 PC)

3. **Per-line cost deduction**
   - ❌ Currently all-or-nothing per action
   - ❌ Should deduct as-you-go for atomic operations

4. **Mid-action pause/resume**
   - ❌ If cloning hits limit at 50%, can't pause
   - ❌ Should allow resume after top-up

5. **Tier-specific error buttons**
   - ❌ All tiers show same buttons
   - ✅ Should show:
     - Go: [Buy Credits] [Upgrade to Pro]
     - Pro: [Buy Credits] [Upgrade to Pro Max]
     - Pro Max: [Buy Credits] (only)

---

## **PART 8: USAGE AUDIT SNAPSHOT**

### **Real Usage Data Locations**

**Local Storage (per device):**
- `${appData}/billing/credits.json` - Usage history (last 200 entries)
- `${appData}/billing/subscription.json` - Current tier
- `${appData}/billing/usage-quota-config.json` - Synced tier limits

**Server Storage (Supabase):**
- `paw_credit_balance` - Referral credit balance
- `organization_usage_counters` - Team/Enterprise pooled usage
- `usage_logs` - Historical usage per user

---

## **IMPLEMENTATION ROADMAP**

### **Phase 1: Core Constants Update (CRITICAL)**
- [ ] Update ComputeCostConstants with new PC values
- [ ] Add new UsageCapabilities (browserOpen, appCloning, assetUpload, etc.)
- [ ] Update UsageQuotaConfigStore tier limits

### **Phase 2: Go Tier Gating (HIGH)**
- [ ] Add feature flag: `canExecuteCode`
- [ ] Restrict Go tier to planning/analysis only
- [ ] Block file opens, clones, generation

### **Phase 3: Cloning System (HIGH)**
- [ ] Create CloningCostCalculator
- [ ] Implement complexity detection (small/medium/hard)
- [ ] Add pause/resume for cloning operations

### **Phase 4: UX Improvements (MEDIUM)**
- [ ] Update error messages for tier-specific actions
- [ ] Add tier-specific button labels
- [ ] Show correct upgrade path for each tier

### **Phase 5: Advanced (MEDIUM)**
- [ ] Deduct-as-you-go cost tracking
- [ ] Partial result display for analysis
- [ ] Refund logic for stopped operations

---

**Status:** ✅ Audit Complete | 📊 Ready for Phase 1 Implementation
