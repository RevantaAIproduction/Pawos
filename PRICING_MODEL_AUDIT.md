# Pricing Model Audit & Implementation Plan

**Date:** 2026-08-28  
**Status:** AUDIT FINDINGS

---

## **PRO MAX VARIANTS**

**Already Implemented:** Pro Max has 2 pricing tiers
- **Pro Max 5x:** $100/month, 5× Pro limits
- **Pro Max 20x:** $250/month, 20× Pro limits

Both have same features (Jira, Linear, autonomousTaskBilling), only limits differ.

**In New Pricing Model:**
- Pro Max 5x: 500 free code edits, 125 free asset uploads, small clone affordable
- Pro Max 20x: 2000 free code edits, 500 free asset uploads, medium clone affordable

---

## **Current Implementation vs. New Model**

### **1. ComputeCostConstants.ts - OUTDATED**

**Current Costs:**
```
edit: 0.5 PC/line
command: 2 PC
file-access: 0.2 PC
analysis: 1.5 PC
generation: 2.5 PC
execution: 2 PC
```

**New Model:**
```
edit: 4 PC/line (was 0.5) ❌ MISMATCH
command: 0.05-0.20 PC (was 2) ❌ MISMATCH
analysis: 0.10 PC (drag/analyze) (was 1.5) ❌ MISMATCH
generation: 6 PC/file (was 2.5) ❌ MISMATCH
```

**Action Required:**
- [ ] Update COMPUTE_COSTS object with new values
- [ ] Add new action types: `cloning`, `asset-upload`, `asset-analysis`, `page-build`
- [ ] Separate "edit" into granular types (single-line, block, file, function)

---

### **2. UsageQuotaConfigStore.ts - NEEDS EXPANSION**

**Current Tracked Capabilities:**
- aiReasoning
- repositoryAnalysis
- websiteAnalysis
- codeExecution
- browserAutomation
- desktopAutomation
- longRunningWorkflow
- autonomousExecution

**New Capabilities Needed:**
- browserOpen (0.30 PC, 50-1000 free/month by tier)
- contentAnalysis (0.10 PC, 100-2000 free/month by tier)
- codeEdit (4 PC, 5-25 free/month by tier)
- appCloning (1200-10000 PC, 0 free all tiers)
- assetUpload (10 PC, 5-100 free/month by tier)
- assetAnalysis (8 PC, 10-200 free/month by tier)
- pageBuild (400-1000 PC, 0 free most tiers)

**Current Quota Structure:**
```
Pro: 200-500/month per capability
Pro Max: 20x Pro multiplier (4000-10000/month)
Team: 150-400/month per user (pooled)
Enterprise: null (unlimited)
```

**New Tier Limits by Capability:**

| Capability | Go | Pro | Pro Max | Team | Enterprise |
|--------|----|----|---------|------|------------|
| browserOpen | 0 | 50 | 200 | 1000 | ∞ |
| contentAnalysis | 0 | 100 | 500 | 2000 | ∞ |
| codeEdit (lines) | 0 | 5 | 25 | 100 | ∞ |
| appCloning | 0 | 0 | 0 | 0 | ∞ |
| assetUpload | 0 | 5 | 25 | 100 | ∞ |
| assetAnalysis | 0 | 10 | 50 | 200 | ∞ |
| pageBuild | 0 | 0 | 0 | 0 | ∞ |

**Action Required:**
- [ ] Extend TRACKED_USAGE_CAPABILITIES with new capabilities
- [ ] Update Go tier: 0 free for most (except planning/analysis)
- [ ] Update Pro tier quotas
- [ ] Update Pro Max tier quotas
- [ ] Update Team tier quotas

---

### **3. EntitlementService.ts - GO TIER RESTRICTIONS**

**Current Implementation:**
- Go tier: Has desktopCompanion, basicWorkspace, basicFileManagement, localRuntimeFeatures
- No explicit "planning-only" vs "execute" boundary for new actions

**New Requirement:**
- Go tier can ONLY: analyze, plan, architect
- Go tier CANNOT: open files, clone apps, generate code

**Action Required:**
- [ ] Add feature flags: `canCloneApps`, `canEditCode`, `canOpenFiles`
- [ ] Go tier: canCloneApps = false, canEditCode = false, canOpenFiles = false
- [ ] Pro+ tiers: canCloneApps = true, canEditCode = true, canOpenFiles = true
- [ ] Update DesktopExecutionEngine to check these flags

---

### **4. BrowserOpenExtensionTypes.ts - CORRECT ✅**

**Status:** Implementation matches new model
- ✅ 0.30 PC for opens
- ✅ 0.10 PC for analyses
- ✅ Tier limits defined
- ✅ Separate monthly quotas for opens vs analyses

**No action needed.**

---

### **5. Missing: Cloning Cost Calculation**

**Current:** No app cloning pricing implemented

**New Model:**
```typescript
export const CLONING_COSTS = {
  small: { basePC: 1200, description: 'Simple UI, basic logic' },
  medium: { basePC: 5000, description: 'Dashboards, integrations' },
  hard: { basePC: 10000, description: 'Full-stack, APIs, databases' },
};
```

**Action Required:**
- [ ] Create CloningCostCalculator with complexity detection
- [ ] Implement in extension helpers
- [ ] Add tier checks for cloning capability

---

### **6. Missing: Limit Reached Messaging**

**Current:** Generic "Insufficient compute" or "No balance"

**New Model:**
```
Go: [ Buy Credits ] or [ Upgrade to Pro ]
Pro: [ Buy Credits ] or [ Upgrade to Pro Max ]
Pro Max: [ Buy Credits ] (only option - already at top tier)
```

**Action Required:**
- [ ] Update error message templates
- [ ] Add tier-specific action buttons
- [ ] Wire upgrade links to checkout flow
- [ ] Add credits purchase flow

---

### **7. Missing: Mid-Action Limit Exhaustion Handling**

**Current:** No explicit handling when balance hits 0 mid-action

**New Model:**
- Atomic operations (clone, code edit, page build): STOP + refund partial
- Progressive operations (analysis): SHOW PARTIAL + upgrade option

**Action Required:**
- [ ] Implement deduct-as-you-go cost tracking
- [ ] Add pause/resume for cloning
- [ ] Add refund logic for stopped operations
- [ ] Add partial result display for analysis

---

## **Implementation Priority**

### **Phase 1: Core Updates (CRITICAL)**
1. [ ] Update ComputeCostConstants.ts with new PC values
2. [ ] Update UsageQuotaConfigStore with tier quotas
3. [ ] Add Go tier execution restrictions
4. [ ] Add cloning cost calculator

### **Phase 2: UX Updates (HIGH)**
5. [ ] Update error messaging (limit reached vs no balance)
6. [ ] Add tier-specific action buttons
7. [ ] Implement upgrade flow links

### **Phase 3: Advanced (MEDIUM)**
8. [ ] Implement deduct-as-you-go tracking
9. [ ] Add pause/resume for cloning
10. [ ] Add refund logic for stopped operations
11. [ ] Add partial result display for analysis

---

## **Files to Update**

### **Tier 1 (Core Pricing Logic)**
- `src/shared/execution/ComputeCostConstants.ts` ← Add new action types, update costs
- `src/main/billing/UsageQuotaConfigStore.ts` ← Extend tracked capabilities, update tier limits
- `src/main/billing/EntitlementService.ts` ← Add Go tier restrictions

### **Tier 2 (Cloning)**
- Create `src/shared/cloning/CloningCostCalculator.ts` (NEW)
- Create `src/renderer/conversation/extensions/CloningExtensionTypes.ts` (NEW)
- Create `src/renderer/conversation/extensions/CloningExtensionHelpers.ts` (NEW)

### **Tier 3 (UI/Messaging)**
- `src/renderer/billing/TierCheckoutPage.tsx` ← Add upgrade messaging
- `src/renderer/ui/ErrorDisplay.tsx` ← Update error messages
- `src/renderer/conversation/extensions/ExtensionRenderer.tsx` ← Add tier-specific actions

---

## **Test Cases Required**

- [ ] Go user tries to clone → blocked, shows upgrade option
- [ ] Pro user clones small app → deducts 1200 PC
- [ ] Mid-action balance exhaustion → shows tier-specific action
- [ ] Cloning at 50% when balance hit → ⏸️ PAUSE state
- [ ] Code edit at 25% when balance hit → ❌ STOP, refund partial
- [ ] Analysis at 75% when balance hit → ✅ Show partial results

---

**Next Step:** Approve Phase 1 updates to proceed with implementation.
