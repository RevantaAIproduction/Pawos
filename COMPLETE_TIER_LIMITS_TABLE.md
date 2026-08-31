# Complete Usage Limits by Tier & Capability

**Source:** `src/main/billing/UsageQuotaConfigStore.ts` (defaultConfig)

---

## **ALL CAPABILITIES ACROSS ALL TIERS**

### **1. AI Reasoning (Paw Compute)**

| Tier | Monthly | Weekly | Multiplier | Price |
|------|---------|--------|----------|-------|
| **Go** | 20 | — | — | FREE |
| **Pro** | 2,000 | 1,000 | 1× | $20 |
| **Pro Max 5x** | 10,000 | 1,000 | 5× | $100 |
| **Pro Max 20x** | 40,000 | 10,000 | 20× | $250 |
| **Team Std** | 2,000/user | — | — | Custom |
| **Team Prem** | 10,000/user | — | — | Custom |
| **Enterprise** | ∞ | — | pooled | Custom |

---

### **2. Repository Analysis**

| Tier | Monthly | Weekly |
|------|---------|--------|
| **Go** | 0 | — |
| **Pro** | 200 | — |
| **Pro Max 5x** | 1,000 | — |
| **Pro Max 20x** | 4,000 | — |
| **Team Std** | 2,000/user | — |
| **Team Prem** | 10,000/user | — |
| **Enterprise** | ∞ | — |

---

### **3. Website Analysis**

| Tier | Monthly | Weekly |
|------|---------|--------|
| **Go** | 0 | — |
| **Pro** | 200 | — |
| **Pro Max 5x** | 1,000 | — |
| **Pro Max 20x** | 4,000 | — |
| **Team Std** | 150 | — |
| **Team Prem** | 300 | — |
| **Enterprise** | ∞ | — |

---

### **4. Code Execution**

| Tier | Monthly | Weekly |
|------|---------|--------|
| **Go** | 0 | — |
| **Pro** | 500 | — |
| **Pro Max 5x** | 2,500 | — |
| **Pro Max 20x** | 10,000 | — |
| **Team Std** | 400 | — |
| **Team Prem** | 800 | — |
| **Enterprise** | ∞ | — |

---

### **5. Browser Automation**

| Tier | Monthly | Weekly |
|------|---------|--------|
| **Go** | 0 | — |
| **Pro** | 300 | — |
| **Pro Max 5x** | 1,500 | — |
| **Pro Max 20x** | 6,000 | — |
| **Team Std** | 250 | — |
| **Team Prem** | 500 | — |
| **Enterprise** | ∞ | — |

---

### **6. Desktop Automation**

| Tier | Monthly | Weekly |
|------|---------|--------|
| **Go** | 0 | — |
| **Pro** | 300 | — |
| **Pro Max 5x** | 1,500 | — |
| **Pro Max 20x** | 6,000 | — |
| **Team Std** | 250 | — |
| **Team Prem** | 500 | — |
| **Enterprise** | ∞ | — |

---

### **7. Long Running Workflow**

| Tier | Monthly | Weekly |
|------|---------|--------|
| **Go** | 0 | — |
| **Pro** | 50 | — |
| **Pro Max 5x** | 250 | — |
| **Pro Max 20x** | 1,000 | — |
| **Team Std** | 40 | — |
| **Team Prem** | 80 | — |
| **Enterprise** | ∞ | — |

---

### **8. Autonomous Execution (Usage Quota)**

| Tier | Monthly | Weekly |
|------|---------|--------|
| **Go** | 0 | — |
| **Pro** | 20 | — |
| **Pro Max 5x** | 100 | — |
| **Pro Max 20x** | 400 | — |
| **Team Std** | 15 | — |
| **Team Prem** | 30 | — |
| **Enterprise** | ∞ | — |

**Note:** This is SEPARATE from Autonomous TASK BILLING (see below)

---

### **9. Autonomous Task Billing (Ticket Wallet)**

**Availability by Tier:**
- Go: ❌ NOT AVAILABLE
- Pro: ✅ Available (dollar-denominated wallet)
- Pro Max 5x: ✅ Available
- Pro Max 20x: ✅ Available
- Team: ✅ Available (org-level wallet)
- Enterprise: ✅ Available (org-level wallet)

**Wallet Details:**

| Aspect | Value |
|--------|-------|
| **Model** | Dollar-denominated wallet (independent of subscription) |
| **Min Top-up** | $30 USD |
| **Max Top-up** | $20,000 USD |
| **Presets** | $30, $60, $100, $150, $200 |
| **Billing Trigger** | Only on task completion (PR-ready + ticket updated) |
| **Monthly Limit** | None (pay-as-you-go) |
| **Weekly Limit** | None (pay-as-you-go) |
| **Concurrent Tasks** | 1 per workspace (deduplicated by ticket) |
| **Duration Limit** | No hard limit (tracked: durationSeconds) |

**Volume-Tiered Pricing (by cumulative tickets completed):**

| Tickets Completed | Price Per Ticket |
|------------------|-----------------|
| 1-500 | $5.00 |
| 501-2,000 | $4.50 |
| 2,001-10,000 | $4.00 |
| 10,001-25,000 | $3.50 |
| 25,001+ | $3.00 |

**Complexity-Based Pricing (proposed, not yet wired):**

| Complexity | Work Score | Price Range |
|-----------|-----------|-------------|
| **Simple** | 0-3 | $5.00 (flat) |
| **Medium** | 4-12 | $5-$20 (scales linearly) |
| **Complex** | 13+ | $20-$50 (scales linearly) |

**Work Score:** filesChanged + commandsExecuted

**Example Calculations:**

```
Scenario 1: User's 1st ticket (simple, 2 files changed)
- Volume tier: 1st ticket → $5.00
- Complexity: workScore=2 → simple → $5.00
- Actual charge: $5.00 (uses volume tier, complexity not wired yet)

Scenario 2: User's 501st ticket (medium, 8 files)
- Volume tier: 501st ticket → $4.50
- Complexity: workScore=8 → medium → scales within $5-$20
- Actual charge: $4.50 (uses volume tier, complexity not wired yet)

Scenario 3: User's 25,001st ticket (complex, 50 files)
- Volume tier: 25,001st ticket → $3.00
- Complexity: workScore=50 → complex → $50 (capped)
- Actual charge: $3.00 (uses volume tier, complexity not wired yet)
```

**Feature Gating:**
- Pro tier: autonomousExecution capability included, but NO autonomousTaskBilling feature
- Pro Max: BOTH autonomousExecution + autonomousTaskBilling
- Team/Enterprise: autonomousTaskBilling available with pooled org wallet

---

## **COMPLETE SUMMARY TABLE**

| Capability | Go | Pro | Pro Max 5x | Pro Max 20x | Team Std | Team Prem | Enterprise |
|------------|----|----|-----------|-----------|----------|-----------|----------|
| **AI Reasoning (mo)** | 20 | 2,000 | 10,000 | 40,000 | 2,000/u | 10,000/u | ∞ |
| **AI Reasoning (wk)** | — | 1,000 | 1,000 | 10,000 | — | — | — |
| **Repository Analysis** | 0 | 200 | 1,000 | 4,000 | 2,000/u | 10,000/u | ∞ |
| **Website Analysis** | 0 | 200 | 1,000 | 4,000 | 2,000/u | 10,000/u | ∞ |
| **Code Execution** | 0 | 500 | 2,500 | 10,000 | 2,000/u | 10,000/u | ∞ |
| **Browser Automation** | 0 | 300 | 1,500 | 6,000 | 2,000/u | 10,000/u | ∞ |
| **Desktop Automation** | 0 | 300 | 1,500 | 6,000 | 2,000/u | 10,000/u | ∞ |
| **Long Running Workflow** | 0 | 50 | 250 | 1,000 | 2,000/u | 10,000/u | ∞ |
| **Autonomous Execution** | 0 | 20 | 100 | 400 | 2,000/u | 10,000/u | ∞ |
| **Autonomous Task Billing** | ❌ | ✅ $5 | ✅ $5 | ✅ $5 | ✅ $5 | ✅ $5 | ✅ $3-5 |

---

## **KEY OBSERVATIONS**

### **Go Tier**
- ✅ 20 AI Reasoning turns/month
- ❌ 0 all other capabilities (can't do analysis, execution, automation)
- 📌 Planning & analysis only

### **Pro vs Pro Max Multiplier**
- **Pro Max 5x:** 5× multiplier on all capabilities (except weekly AI is same 1,000)
- **Pro Max 20x:** 20× multiplier (and 10× weekly AI cap)

**Example - Code Execution:**
```
Pro:        500/month
Pro Max 5x: 2,500/month (5×)
Pro Max 20x: 10,000/month (20×)
```

### **Team Tiers**
- **Team Standard:** 1,500 AI, lower limits
- **Team Premium:** 2× Team Standard on all capabilities
- **Pricing:** Custom per-seat

### **Ratio Analysis**

**Pro → Pro Max 5x ratio:**
```
aiReasoning:        2000 → 10000 = 5×
repositoryAnalysis: 200 → 1000 = 5×
codeExecution:      500 → 2500 = 5×
All others:         consistent 5×
```

**Pro → Pro Max 20x ratio:**
```
aiReasoning:        2000 → 40000 = 20×
repositoryAnalysis: 200 → 4000 = 20×
codeExecution:      500 → 10000 = 20×
All others:         consistent 20×
```

**Weekly AI cap is different:**
```
Pro:           1000/week (monthly: 2000, so ~4 weeks)
Pro Max 5x:    1000/week (same! not 5×)
Pro Max 20x:   10000/week (10× weekly multiplier, different from 20× monthly)
```

---

## **USAGE ENFORCEMENT**

**Both monthly AND weekly are enforced independently** (whichever hits first blocks):

```
User in Pro tier on aiReasoning:
- Used 500 this week of 1000/week ✅ can continue
- Used 1900 this month of 2000/month ✅ can continue
- Try to use 200 more in week: 500+200=700 < 1000 ✅ OK
- Try to use 200 more in month: 1900+200=2100 > 2000 ❌ BLOCKED (monthly hit first)
```

---

## **PRO MAX VARIANT COMPARISON**

### **When to use each:**

| Scenario | Pro | Pro Max 5x | Pro Max 20x |
|----------|-----|-----------|-----------|
| Light dev, occasional AI | ✅ | — | — |
| Regular dev, heavy analysis | ✅ | — | — |
| Power dev, frequent AI | — | ✅ | — |
| Intensive dev, automation heavy | — | ✅ | ✅ |
| Teams cloning, bulk work | — | — | ✅ |

**Cost per AI turn:**
```
Pro:        $20 ÷ 2000 = $0.01 per turn
Pro Max 5x: $100 ÷ 10000 = $0.01 per turn (same efficiency)
Pro Max 20x: $250 ÷ 40000 = $0.0063 per turn (cheapest!)
```

---

## **PROCESS FLOW: LIMITS IN ACTION**

### **User Submits Request → Limit Check → Execution**

```
User Action (e.g., "run repository analysis")
    ↓
1. GET TIER
   - From SubscriptionStore.getEffectiveState()
   - Resolve actual tier (Go, Pro, Pro Max 5x/20x, Team Std/Prem, Enterprise)
    ↓
2. GET LIMITS
   - Call UsageQuotaConfigStore.getEffectiveQuota(tier, capability)
   - For Team: multiply base × seat count (if org pooled)
   - For Pro Max: apply multiplier (5× or 20×)
   - Result: monthlyLimit, weeklyLimit
    ↓
3. GET USAGE
   - From CreditStore.getBalance()
   - Read: usedThisPeriod, usedThisWeek
   - Calculate: remaining = limit - used
    ↓
4. CHECK: remaining > 0?
    ├─ YES → ALLOW execution
    │         └─ Deduct usage: usedThisPeriod += cost
    │             (Also deduct usedThisWeek for weekly-capped capabilities)
    │
    └─ NO  → BLOCK execution
             └─ Show error:
                 "Limit Reached - [Buy Credits] or [Upgrade Plan]"
                 (Go shows "Upgrade to Pro"
                  Pro shows "Upgrade to Pro Max"
                  Pro Max shows only "Buy Credits")
```

### **Example: Repository Analysis Flow**

**Team Standard, 5 users, 2000/user/month quota**

```
User1 submits repository analysis
    ↓
1. Tier = team, seatTier = standard
   → Effective tier key = 'team'
    ↓
2. Get limit for repositoryAnalysis:
   - Base: 150 (old)
   - Org pooled? YES
   - Organization users: 5
   - Total pool: NOT multiplied, uses base 150... 
   
   [WAIT - NEW SPEC: Team Std = 2000/user]
   - New total pool: 2000 × 5 = 10,000/month
    ↓
3. Get current usage:
   - Organization usage counter: 450 used
   - Remaining: 10,000 - 450 = 9,550
    ↓
4. Check: 9,550 > 0?
   YES ✅
    ↓
ALLOW analysis execution
   └─ Log: organization_usage_counters += 1
```

### **Example: Go Tier Blocked**

```
Go user submits code execution
    ↓
1. Tier = go
    ↓
2. Get limit for codeExecution:
   - Limit: 0
    ↓
3. Get usage:
   - Used: 0
   - Remaining: 0 - 0 = 0
    ↓
4. Check: 0 > 0?
   NO ❌
    ↓
BLOCK execution
   └─ Show: "Limit Reached"
             [ Upgrade to Pro ]
```

### **Example: Pro Max 5x vs 20x Decision**

```
Pro user wants to do 2500 code executions/month

Pro limits:      500/month   (needs 5 more months)
Pro Max 5x:      2500/month  (COVERS!)  → $100/month
Pro Max 20x:     10000/month (OVERKILL) → $250/month
    ↓
RECOMMENDATION: Pro Max 5x (5× multiplier gives exactly 2500)
```

### **Example: Team Tier Pooling**

```
Organization: 10 users (Team Premium)
Each user gets: 10,000/month allocation (per capability)
Organization total pool: 10,000 × 10 = 100,000/month

If User A uses 3000:
  └─ Pool: 100,000 - 3000 = 97,000 remaining

If User B uses 5000:
  └─ Pool: 97,000 - 5000 = 92,000 remaining

If User C tries to use 100,000:
  └─ Pool: 92,000 < 100,000 ❌ BLOCKED
     ("Org limit reached, contact admin")
```

---

**Status:** ✅ Complete tier matrix with process flows
**Source:** UsageQuotaConfigStore.defaultConfig()
**Date:** 2026-08-28
**Updates:** Team Standard: 2000/user | Team Premium: 10000/user
