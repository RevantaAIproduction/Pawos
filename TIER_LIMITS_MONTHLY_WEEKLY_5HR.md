# Tier Limits: Monthly, Weekly (7-Day), & 5-Hour Rolling Windows

**Source:** PawComputeCapacityStore.ts (5-hour & weekly limits) + UsageQuotaConfigStore.ts (monthly & weekly quotas)

**Note:** Weekly and 7-day are the same (one week = 7 days), consolidated into a single "Weekly" limit.

---

## **AI REASONING (Paw Compute) - Three Enforcement Levels**

| Tier | Monthly | Weekly | 5-Hour | Notes |
|------|---------|--------|--------|-------|
| **Go** | 500 | 500 | 500 PC | Equal across all windows |
| **Pro** | 2,000 | 500 | 300 PC | Reduced burst limit |
| **Pro Max 5x** | 10,000 | 2,000 | 500 PC | 5× Pro limits |
| **Pro Max 20x** | 40,000 | 10,000 | 1,000 PC | 20× monthly, 10× weekly |
| **Team Std** | 2,000/user | 500/user | 300 PC/user | Same as Pro per user |
| **Team Prem** | 10,000/user | 2,000/user | 500 PC/user | Same as Pro Max 5x per user |
| **Enterprise** | ∞ | — | 4,000 PC | Org-pooled rolling |

---

## **ROLLING WINDOW ENFORCEMENT (Weekly = 7 Days)**

| Tier | Weekly Window | 5-Hour Window |
|------|---------|---------|
| **Go** | 500 PC | 500 PC |
| **Pro** | 1,200 PC | 300 PC |
| **Pro Max 5x** | 2,000 PC | 500 PC |
| **Pro Max 20x** | 4,000 PC | 1,000 PC |
| **Team Std** | 1,200 PC/user | 300 PC/user |
| **Team Prem** | 2,000 PC/user | 500 PC/user |
| **Enterprise** | 16,000 PC | 4,000 PC |

---

## **HOW THESE WORK TOGETHER**

**Four Independent Limits (Whichever hits first blocks):**

```
User in Pro tier

Monthly limit:      2,000 PC / month
Weekly limit:       500 PC / week
5-hour limit:       300 PC / 5-hour rolling window
7-day limit:        1,200 PC / 7-day rolling window

Scenario 1: Normal usage (spreads over time)
Day 1: Use 50 PC → OK (50 < 300 in 5h, 50 < 500/week, 50 < 2000 monthly, 50 < 1200/7d)

Scenario 2: Burst usage (hitting 5-hour limit)
Day 1: User sends 280 PC of prompts in 2 hours
  └─ 5-hour check: 280 + prior < 300? → YES, OK but tight
  
Scenario 3: Another burst immediately
Day 1: User sends another 30 PC (total 310 in same 5 hours)
  └─ 5-hour check: 310 > 300? → NO ❌ BLOCKED
  └─ Must wait until first prompts expire (>5 hours old)

Scenario 4: Weekly exhaustion (hits weekly limit first)
Day 1-2: User uses 450 PC across multiple sessions
Day 3: Tries to use 100 more
  └─ Weekly check: 450 + 100 = 550 > 500? → NO ❌ BLOCKED
  └─ Must wait until week resets

Scenario 5: Which limit blocks first?
User has used 200 PC in last 5 hours
User has used 400 PC this week
User tries to send 150 PC request:
  └─ 5-hour: 200 + 150 = 350 > 300? → YES ❌ 5-HOUR BLOCKS FIRST
  └─ (Would also hit weekly: 400 + 150 = 550 > 500, but 5-hour blocks first)
```

---

## **ENFORCEMENT HIERARCHY**

```
User submits request
    ↓
1. Check Monthly Limit
   Pro: used < 2000? → No? BLOCK
    ↓
2. Check Weekly Limit (aiReasoning only)
   Pro: used < 1000? → No? BLOCK
    ↓
3. Check 7-Day Rolling
   Pro: last 7 days < 1600? → No? BLOCK
    ↓
4. Check 5-Hour Rolling ⭐ MOST RESTRICTIVE
   Pro: last 5 hours + request < 400? → No? BLOCK
    ↓
ALLOW & Execute
   └─ Deduct from all four counters:
       • usedThisPeriod (monthly)
       • usedThisWeek (weekly)
       • usage7dPc (7-day rolling)
       • usage5hPc (5-hour rolling)
```

---

## **WHICH LIMIT BLOCKS FIRST?**

### **Pro Tier Example: 400 PC request**

```
Scenario A: Start of month/week
- Monthly: 0/2000 ✅
- Weekly: 0/1000 ✅
- 7-day: 0/1600 ✅
- 5-hour: 0/400 ✅
→ Request ALLOWED

Scenario B: Mid-month usage (1900 used this month)
- Monthly: 1900/2000 ✅ (only 100 left!)
- Weekly: 500/1000 ✅
- 7-day: 700/1600 ✅
- 5-hour: 200/400 ✅
- 400 PC request: 1900 + 400 = 2300 > 2000? ❌ MONTHLY BLOCKS FIRST

Scenario C: Heavy 5-hour burst
- Monthly: 500/2000 ✅
- Weekly: 200/1000 ✅
- 7-day: 300/1600 ✅
- 5-hour: 350/400 ✅ (only 50 left!)
- 400 PC request: 350 + 400 = 750 > 400? ❌ 5-HOUR BLOCKS FIRST
  └─ Wait 5+ hours for oldest usage to roll off
```

---

## **REAL-WORLD IMPACT BY TIER**

### **Go Tier: Generous Free Tier**
```
Monthly: 500 PC (≈ 56 prompts)
Weekly: 500 PC (same as monthly)
5-hour: 500 PC (≈ 56 prompts max per 5h)
Use case: Testing, light exploration
```

### **Pro Tier: Standard Production Use**
```
Monthly: 2,000 PC (≈ 225 normal prompts)
Weekly: 500 PC (≈ 56 prompts/week - major constraint!)
5-hour: 300 PC (≈ 34 prompts per 5h window)
Use case: Regular daily use with limits

⚠️ Weekly limit is PRIMARY constraint:
- Can't burst multiple days in a row
- Must spread 2000/month across 4 weeks: ~500/week max
- 5-hour limit prevents intensive batching

Example schedule:
- 71 prompts/week (balanced across 5h windows)
- One big session → hits 5-hour limit (300 PC)
```

### **Pro Max 5x: Scaled Production**
```
Monthly: 10,000 PC (≈ 1,120 prompts)
Weekly: 2,000 PC (≈ 286 prompts/week)
5-hour: 500 PC (≈ 56 prompts per 5h window)
Use case: Power users, moderate automation

Can sustain:
- 286 prompts/week across the month
- Multiple bursts of 56 prompts per 5h window
- 7-day window: 2,000 PC keeps sustained use available
```

### **Pro Max 20x: Premium Tier**
```
Monthly: 40,000 PC (≈ 4,500 prompts)
Weekly: 10,000 PC (≈ 1,430 prompts/week)
5-hour: 1,000 PC (≈ 112 prompts per 5h window)
7-day: 4,000 PC (flexible weekly distribution)
Use case: Heavy automation, large teams

Flexibility:
- Can burst 112 prompts every 5 hours continuously
- Weekly window is generous (10,000 = 20× Pro's 500)
- High-volume workloads supported
```

### **Team Standard: Per-User Pro Limits**
```
Per user: 2,000 PC/month, 500 PC/week, 300 PC/5h
10-person team total: 20,000 PC/month

Each user sees:
- Same as Pro tier individually
- Can't "lend" between teammates
- Rolling windows are per-user (not pooled)
```

### **Team Premium: Per-User Pro Max 5x Limits**
```
Per user: 10,000 PC/month, 2,000 PC/week, 500 PC/5h
10-person team total: 100,000 PC/month

Each user sees:
- Same as Pro Max 5x individually  
- Independent 5-hour windows per person
- Supports distributed high-volume work
```

### **Enterprise: Org-Wide Unlimited**
```
Monthly: ∞ (unlimited)
7-day: 16,000 PC (org-pooled)
5-hour: 4,000 PC (org-pooled)
Use case: Mission-critical, high-volume operations

Pooling model:
- Monthly is truly unlimited
- But 7-day and 5-hour are ORG-LEVEL (shared across all users)
- Can't burst 4000 PC in 5 hours per person; it's the org cap
```

---

## **CALIBRATION NOTES**

**From source comment:**
```
Cold request:  32.34 PC / $0.0323 USD
Warm request:  8.39 PC / $0.0084 USD (36k cached)
45-prompt session: 401.5 PC / $0.401 USD
Blended cost: 8.92 PC/prompt
```

**Updated 5-hour limits:**
- Go 500 PC ≈ 56 prompts per 5-hour window
- Pro 300 PC ≈ 34 prompts per 5-hour window (tight!)
- Pro Max 5x 500 PC ≈ 56 prompts per 5-hour window
- Pro Max 20x 1000 PC ≈ 112 prompts per 5-hour window

**Key constraint change:**
- Pro tier's 5-hour limit reduced from 400→300 PC (tighter burst control)
- Pro tier's weekly limit reduced from 1000→500 PC (must spread usage)
- Go tier upgraded from 20→500 PC (generous free tier)

---

## **KEY DIFFERENCES FROM MONTHLY-ONLY**

| Aspect | Monthly Only | + Weekly | + 5-Hour Rolling |
|--------|---------|----------|------------------|
| **Burst Prevention** | ❌ Can spend all in 1 day | ✅ Slows down | ✅✅ **Hard cap** |
| **Fairness** | Users can hog | Better sharing | Best (per-user window) |
| **Cost Prediction** | Predictable/month | Tighter | Variable/volatile |
| **Use Case** | Budget tracking | Consistency | Anti-abuse |

---

## **STATUS**

✅ **Complete enforcement system:**
- Monthly quotas (for monthly allowances)
- Weekly caps (aiReasoning only)
- 7-day rolling (secondary enforcement)
- 5-hour rolling (primary burst limiter)

All four limits enforced independently. Whichever hits first blocks the request.

**Date:** 2026-08-28
**Source:** PawComputeCapacityStore.ts (lines 41-52) + UsageQuotaConfigStore.ts
