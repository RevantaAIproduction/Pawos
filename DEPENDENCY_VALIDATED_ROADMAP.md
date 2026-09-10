# DEPENDENCY-VALIDATED ROADMAP

**Date:** 2026-09-08  
**Method:** Source-code audit of actual implementations  
**Purpose:** Correct implementation order based on real dependencies, not estimated hours

---

## FINDINGS VS INVENTORY

The initial master inventory made assumptions without source verification. This document corrects it.

### ASSUMPTION 1: Meeting Assistant is P0 ❌ INCORRECT

**Original claim:** Meeting Assistant is highest priority (40-60 hours)  
**Actual finding:**
- Meeting cost formula: ✅ IMPLEMENTED (0.5 PC per minute)
- Meeting recording: ✅ PARTIALLY IMPLEMENTED (IPC handler exists)
- Billing integration: ❌ STUBS (9 TODOs in code)
- AI summarization: ❌ NOT STARTED (Gemini integration TODO)
- Email delivery: ❌ NOT STARTED (SMTP integration TODO)

**Problem:** Meeting Assistant has too many dependencies that must be completed FIRST:
- Tier gating system must enforce feature availability
- Billing deduction must work for subscription (not autonomous Work PC)
- AI integration (Gemini) must be wired
- Email service must be integrated

**Verdict:** Meeting Assistant is P1, not P0. **Requires prerequisites.**

---

### ASSUMPTION 2: Tier Gating Should Happen After Meeting Assistant ❌ INCORRECT

**Actual finding:**
- Entitlement matrix: ✅ DEFINED (`meetingAssistant` feature exists)
- EntitlementService: ✅ CAN_CHECK (canUseFeature method exists)
- IPC tier gating: ⚠️ PARTIALLY IMPLEMENTED (8 TODOs in `src/main/ipc/ipc.ts`)
- Enforcement in handlers: ❌ INCOMPLETE

**Verdict:** Tier gating should happen BEFORE meeting assistant implementation. It's a prerequisite for safe feature rollout.

---

### ASSUMPTION 3: Status Transitions Are Ready to Implement ❌ INCOMPLETE

**Source check:**
- Jira transition function: ✅ EXISTS (`transitionJiraIssue()`)
- Linear transition function: ✅ EXISTS (`transitionLinearIssue()`)
- GitHub status update: ✅ EXISTS in API
- IPC handlers: ❌ MISSING (not registered)
- AutonomousOrchestrator integration: ❌ NOT WIRED
- Tests: ❌ MISSING

**Dependencies:**
- Phase 2 idempotency must be completed first (✅ CODE DONE)
- Provider API contract validation needed
- Database migration for tracking (if needed)

**Verdict:** Status transitions are P1, mid-priority. **Ready to implement after tier gating.**

---

### ASSUMPTION 4: Communication Runtime Should Be Deferred ✅ CORRECT

**Verification:**
- Status: Frozen 2026-07-18 (by explicit design)
- Missing: Phone call audio, wake-word, mobile sync
- Product decision: Intentionally deferred

**Verdict:** CORRECTLY CLASSIFIED as FUTURE. Do not implement.

---

## CORRECTED PRIORITY MATRIX

| Priority | Subsystem | Current Status | Why | Blocks | Estimated Effort |
|----------|-----------|---|---|---|---|
| **P0** | **Tier Gating Enforcement** | 80% (stubs in place) | FOUNDATION for all feature access control; must happen first | All features | 8-12h |
| **P1** | **Status Transitions** | 70% (functions exist, not wired) | Closes autonomous workflow loop; many users expect it | Meeting assistant quality | 12-18h |
| **P1** | **Meeting Assistant Core** | 20% (cost formula + stubs) | Revenue feature; required for team/enterprise tier | Future features | 50-70h |
| **P2** | **GitHub Issue Closing** | 60% (API ready) | Convenience feature; nice-to-have | Nothing critical | 8-12h |
| **P2** | **Google Calendar Sync** | 0% (infrastructure ready) | Integration enhancement | Meeting features | 20-30h |
| **FUTURE** | **Communication Runtime** | Frozen | Intentionally deferred (audio/video/wake-word) | N/A | Deferred |
| **FUTURE** | **Companion Avatar Gen** | Frozen | Marketplace dependent | N/A | Deferred |

---

## DEPENDENCY GRAPH

```
Tier Gating (P0) ← Foundation
  ↓
  ├→ Status Transitions (P1) ← Can start after tier gating
  ├→ Meeting Assistant (P1) ← Depends on tier gating + AI integration
  └→ All other features ← Require gate enforcement
```

---

## TIER GATING DETAILS

**Why it's P0:**
- Existing code has stubs (`// TODO: Tier gating...`)
- Without enforcement, all features accessible to all tiers
- Subscription model cannot be enforced
- Meeting assistant cannot charge only Pro+ users

**What exists:**
- EntitlementService: ✅ Has `canUseFeature()` method
- Entitlement matrix: ✅ Defines all features + tier requirements
- IPC stubs: ⚠️ 8 TODOs in `src/main/ipc/ipc.ts` line ~1240-1360

**What's missing:**
- Main process enforcement of gate responses
- Tests for gate enforcement
- Clear error messaging for gated features

**Implementation order:**
1. Implement gate enforcement in IPC handlers
2. Add tests for each gate
3. Verify Phase 1 regression (22/22 still passing)
4. Ready for meeting assistant integration

---

## STATUS TRANSITIONS DETAILS

**Why it's P1:**
- Closes the autonomous work loop
- Users expect completed work to update source system
- Already have provider functions
- Just needs wiring + tests

**What exists:**
- `transitionJiraIssue()`: ✅ IMPLEMENTED
- `transitionLinearIssue()`: ✅ IMPLEMENTED
- GitHub API support: ✅ STANDARD
- Phase 2 idempotency: ✅ READY

**What's missing:**
- IPC handlers (register in `connectivityIpc.ts`)
- AutonomousOrchestrator post-completion call
- Tests for transition workflows
- Provider error handling

**No new architectural pieces needed** — just wiring.

---

## MEETING ASSISTANT DETAILS

**Why it's P1 (not P0):**
- Requires tier gating first (so only Pro+ can use)
- Requires AI integration (Gemini currently TODO)
- Requires email integration (currently TODO)
- Too many dependencies to be highest priority

**What exists:**
- Cost formula: ✅ (0.5 PC/min)
- Meeting recording: ✅ PARTIAL
- Database schema: ✅ (via workspace schema)
- IPC handlers: ⚠️ STUBBED (9 TODOs)

**What's missing:**
- Tier gating integration
- AI summarization (Gemini)
- Email delivery
- Billing deduction implementation
- Tests

**Dependencies on other systems:**
1. Tier gating must be complete
2. AI provider integration must be available
3. Email service must be available
4. Billing deduction (subscription credits) must work

**CRITICAL:** Meeting assistant deducts SUBSCRIPTION CREDITS, NOT Work PC.
- Work PC is for autonomous work (Phase 1 - separate tier)
- Meeting summarization is Pro+ feature (subscription)
- Two separate billing streams

---

## WHAT SHOULD CHANGE IN ORIGINAL INVENTORY

### Was Proposed:
```
1. Meeting Assistant core (40-60h) ← WRONG PRIORITY
2. Status transitions (15-20h)
3. GitHub issue closing (10-15h)
4. Tier gating (20-30h)
5. Communication runtime (deferred)
```

### Corrected Order:
```
1. Tier Gating Enforcement (8-12h) ← FOUNDATION REQUIRED
2. Status Transitions (12-18h) ← Once gating ready
3. Meeting Assistant Core (50-70h) ← After dependencies met
4. GitHub Issue Closing (8-12h) ← Nice-to-have
5. Communication Runtime (FUTURE) ← Intentionally deferred
```

---

## NEXT IMPLEMENTATION TARGET

### Recommendation: **TIER GATING ENFORCEMENT** (P0)

**Why:**
- Required for all subsequent work
- Relatively contained (8 TODOs in known location)
- No external dependencies (EntitlementService already complete)
- Unblocks status transitions and meeting assistant
- Critical for revenue protection (ensures feature access control)

**Scope:**
- Implement gate checks in 8 IPC handlers
- Add enforcement tests
- Verify Phase 1 regression

**Start location:** `src/main/ipc/ipc.ts` lines 1240-1356 (8 TODO comments)

**Do NOT implement:** Meeting assistant until tier gating is complete

---

## CRITICAL CLARIFICATION

**Work PC vs Subscription Credits:**

The original inventory incorrectly suggested meeting summarization uses Work PC.

**Actual architecture:**
- **Work PC:** Autonomous task provider costs (Phase 1, Supabase-based, per-run)
- **Subscription Credits:** Tier-based AI usage limits (CreditStore-based, monthly/weekly)
- **Meeting Summarization:** Should use subscription credits (same as other AI features)

Meeting assistant is a Pro+ feature that consumes the same credit pool as other AI features, NOT a separate Work PC consumption.

---

## VALIDATION RESULTS

| Item | Status | Evidence |
|------|--------|----------|
| Meeting cost formula | ✅ DONE | MeetingService.calculateSummarizationCost() |
| Tier gating exists | ✅ EXISTS | EntitlementService has canUseFeature() |
| Tier gating enforcement | ❌ INCOMPLETE | 8 TODOs in ipc.ts |
| Status transitions | ✅ FUNCTIONS EXIST | transitionJiraIssue(), transitionLinearIssue() |
| Status IPC handlers | ❌ MISSING | Not registered in connectivityIpc.ts |
| AI summarization | ❌ NOT STARTED | Gemini integration TODO |
| Email integration | ❌ NOT STARTED | Email service TODO |
| Tests for meetings | ⚠️ PARTIAL | Some handler tests exist, not all |

---

## STOP POINT

**Do NOT proceed to implementation without explicit approval of:**

1. This corrected roadmap
2. Tier gating as the immediate next task
3. The revised priority order above

**Do NOT implement meeting assistant** until tier gating is complete.

**Do NOT modify Phase 1 or Phase 2** code.
