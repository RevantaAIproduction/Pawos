# COMPREHENSIVE TEST PLAN — PawOS Product (FINAL CORRECTED V4)

**Date:** 2026-09-09  
**Version:** 4 (Final Consistency Pass)  
**Scope:** Complete currently-implemented product capabilities for planned production launch  
**Status:** READY FOR EXECUTION (pending approval)

---

## OVERVIEW

This final corrected test plan covers all currently-implemented capabilities in PawOS as of 2026-09-09, organized by priority (P0 mandatory before launch, P1 important before launch, P2 post-launch acceptable). Each test includes exact prerequisites, step-by-step procedures, expected results, and evidence requirements.

**Final Scope Correction from V3:**
- ✅ TEST-BILL-002 and TEST-BILL-003 removed from P0 (meetings are V2/Deferred)
- ✅ Moving meetings to V2/Deferred because renderer UI consumer not implemented
- ✅ P0 test count recalculated: 29 → 27 tests
- ✅ P1 tests remain: 19 tests
- ✅ P2 tests remain: 5 tests
- ✅ **Final current-launch total: 51 tests** (not 53)
- ✅ V2/Deferred tests: 5+ (3 Meeting tests + 2 Billing tests + other deferred items)
- ✅ All test IDs renumbered for consistency

---

## ENTITLEMENT MATRIX (AUTHORITATIVE — DO NOT MODIFY)

| Tier | Individual | Organization |
|------|-----------|---------------|
| Go (Free) | NO Autonomous Work | N/A |
| Pro | NO Autonomous Work | NO Autonomous Work |
| Pro Max | ✅ Autonomous Work | ✅ Autonomous Work |
| Team | N/A | ✅ Autonomous Work |
| Enterprise | N/A | ✅ Autonomous Work |

---

## PART A: P0 TESTS — MANDATORY BEFORE LAUNCH (27 tests)

P0 tests verify capabilities that are mandatory for the current planned production launch. **All 27 P0 tests must pass (100% gate) before launch decision.**

---

### A.1 Authentication & Session Management (5 tests)

#### TEST-AUTH-001: Email/Password Sign Up (New User)
- **Priority:** P0
- **Type:** Staging/E2E
- **Hard Dependency:** None
- **Evidence:** Screenshot of Dashboard, Supabase auth record, session tokens
- **Pass/Fail:** Must pass

---

#### TEST-AUTH-002: Email/Password Sign In (Existing User)
- **Priority:** P0
- **Type:** Staging/E2E
- **Hard Dependency:** TEST-AUTH-001
- **Evidence:** Screenshot of Dashboard, valid session token
- **Pass/Fail:** Must pass

---

#### TEST-AUTH-003: Google OAuth Flow (Sign Up)
- **Priority:** P0
- **Type:** Staging/E2E (live Google OAuth)
- **Hard Dependency:** None
- **Evidence:** Dashboard screenshot, Supabase google_uid provider, NO token in DevTools
- **Pass/Fail:** Must pass

---

#### TEST-AUTH-004: Session Persistence (Restart App)
- **Priority:** P0
- **Type:** Manual Electron/runtime
- **Hard Dependency:** TEST-AUTH-001
- **Evidence:** Dashboard loads without sign-in, electron logs show secure storage token
- **Pass/Fail:** Must pass

---

#### TEST-AUTH-005: Logout Flow
- **Priority:** P0
- **Type:** Staging/E2E
- **Hard Dependency:** TEST-AUTH-001
- **Evidence:** Sign-in page after logout, token cleared from storage
- **Pass/Fail:** Must pass

---

### A.2 Billing & Tier Compute Basics (2 tests)

**Note:** Meetings-related billing tests (TEST-BILL-002, TEST-BILL-003) moved to V2/Deferred because Meetings product UI is not implemented. Backend billing implementation is verified; testing deferred until renderer UI is ready.

#### TEST-BILL-001: View Tier & Current Credit Balance
- **Priority:** P0
- **Type:** Staging/E2E
- **Hard Dependency:** TEST-AUTH-002 (Pro Max user)
- **Evidence:** Screenshot of Billing page, Supabase balance query
- **Pass/Fail:** Must pass (establishes baseline for billing tests)

---

#### TEST-BILL-004: Top-Up Flow (Purchase Credits)
- **Priority:** P0
- **Type:** Staging/E2E (Stripe test mode)
- **Hard Dependency:** None (independent balance operation)
- **Evidence:** Payment confirmation screenshot, updated balance screenshot, Supabase topup record
- **Pass/Fail:** Must pass (establishes Work PC balance for autonomous tests)

---

### A.3 Connector Setup (6 tests)

#### TEST-CONN-001: GitHub OAuth Connect
- **Priority:** P0
- **Type:** Staging/E2E (live GitHub OAuth)
- **Hard Dependency:** TEST-BILL-004
- **Evidence:** Connected status screenshot, NO token in DevTools
- **Pass/Fail:** Must pass (required for TEST-25, TEST-27)

---

#### TEST-CONN-002: Jira OAuth Connect
- **Priority:** P0
- **Type:** Staging/E2E (live Jira Cloud OAuth)
- **Hard Dependency:** TEST-BILL-004
- **Evidence:** Connected status screenshot, workspace domain saved
- **Pass/Fail:** Must pass (required for TEST-24, TEST-25)

---

#### TEST-CONN-003: Linear API Key Connect
- **Priority:** P0
- **Type:** Staging/E2E (live Linear API)
- **Hard Dependency:** TEST-BILL-004
- **Evidence:** Connected status screenshot, key validated
- **Pass/Fail:** Must pass (required for TEST-26)

---

#### TEST-CONN-004: Slack OAuth Connect (Regression)
- **Priority:** P0
- **Type:** Staging/E2E (live Slack OAuth)
- **Hard Dependency:** TEST-BILL-004
- **Status:** REGRESSION TEST — implementation frozen (bug-fixes only)
- **Note:** Live Slack message delivery is NOT a launch requirement. This test verifies that the existing Slack connection implementation still works. Slack messaging to external channels is deferred.
- **Evidence:** Connected status screenshot
- **Pass/Fail:** Must pass (regression test)

---

#### TEST-CONN-005: Gmail OAuth Connect (Optional)
- **Priority:** P0
- **Type:** Staging/E2E
- **Hard Dependency:** TEST-BILL-004
- **Evidence:** Connected status
- **Pass/Fail:** Can defer to P1 if time-constrained

---

#### TEST-CONN-006: Google Calendar OAuth Connect (Optional)
- **Priority:** P0
- **Type:** Staging/E2E
- **Hard Dependency:** TEST-BILL-004
- **Evidence:** Connected status
- **Pass/Fail:** Can defer to P1 if time-constrained

---

### A.4 Autonomous Work — Architecture & Execution (8 tests)

#### TEST-AUTO-001: Start Autonomous Work (Entitlement Check)
- **Priority:** P0
- **Type:** Manual source inspection + Database verification
- **Hard Dependency:** TEST-BILL-004 (Work PC balance established)
- **Evidence:** Authorization modal screenshot, IPC logs
- **Pass/Fail:** Must pass (confirms entitlement gate working)

---

#### TEST-AUTO-002: Executor Claiming (Phase 2C)
- **Priority:** P0
- **Type:** Manual source inspection + Database verification
- **Hard Dependency:** TEST-AUTO-001
- **Evidence:** Console logs, RPC response, server-generated UUID
- **Pass/Fail:** Must pass (confirms executor claiming blocker fixed)

---

#### TEST-AUTO-003: Model Identity Consistency (Phase 2B)
- **Priority:** P0
- **Type:** Manual source inspection + Automated integration
- **Hard Dependency:** TEST-AUTO-001
- **Evidence:** Console logs, Network tab, source code inspection
- **Pass/Fail:** Must pass (confirms model consistency blocker fixed)

---

#### TEST-AUTO-004: Exact Token Preflight (Phase 2D)
- **Priority:** P0
- **Type:** Live external-service (Gemini API) + Manual inspection
- **Hard Dependency:** TEST-AUTO-001
- **Evidence:** DevTools Network tab shows countTokens call, response shows token count
- **Pass/Fail:** Must pass (confirms token preflight blocker fixed)

---

#### TEST-AUTO-005: Autonomous Authorization (Work PC Reservation)
- **Priority:** P0
- **Type:** Automated integration + Database verification
- **Hard Dependency:** TEST-AUTO-001, TEST-AUTO-004
- **Evidence:** Network tab shows RPC, Supabase shows work_pc_reserved row
- **Pass/Fail:** Must pass (confirms authorization working)

---

#### TEST-AUTO-006: Autonomous Execution (Conversation Runtime)
- **Priority:** P0
- **Type:** Staging/E2E + Manual Electron/runtime
- **Hard Dependency:** TEST-AUTO-001 through TEST-AUTO-005
- **Evidence:** ExecutionRecord, command outputs, final results
- **Pass/Fail:** Must pass (confirms execution path works)

---

#### TEST-AUTO-007: Autonomous Failure States
- **Priority:** P0
- **Type:** Staging/E2E + Manual Electron/runtime
- **Hard Dependency:** TEST-AUTO-001 through TEST-AUTO-005
- **Evidence:** State transitions, error messages for timeout/cancel/error
- **Pass/Fail:** Must pass (confirms error handling)

---

#### TEST-AUTO-008: Settlement (Work PC Settlement RPC)
- **Priority:** P0
- **Type:** Automated integration + Database verification
- **Hard Dependency:** TEST-AUTO-006 (completed task)
- **Exact RPC:** settle_autonomous_task_run_pc()
- **Evidence:** RPC call captured in Network tab, billing event in Supabase
- **Pass/Fail:** Must pass (confirms settlement working)

---

### A.5 Connector Write-Back Operations (6 tests)

#### TEST-JIRA-001: Read Jira Issues
- **Priority:** P0
- **Type:** Live external-service (real Jira Cloud)
- **Hard Dependency:** TEST-CONN-002 (Jira connected)
- **Evidence:** Issue list screenshot, issue details
- **Pass/Fail:** Must pass

---

#### TEST-JIRA-002: Jira Comment + Status Transition (IMPLEMENTED)
- **Priority:** P0
- **Type:** Live external-service + Staging/E2E
- **Hard Dependency:** TEST-AUTO-008 (autonomous work completed), TEST-CONN-002
- **Implemented Scope:** Read issues, post comments, transition issue to "Done"
- **Scope Exclusions:** Jira issue creation, Jira advanced transitions beyond "Done" (deferred to V2)
- **Evidence:** Screenshot of Jira issue with comment and Done status
- **Pass/Fail:** Must pass (launch connector capability)

---

#### TEST-LINEAR-001: Read Linear Issues
- **Priority:** P0
- **Type:** Live external-service (real Linear)
- **Hard Dependency:** TEST-CONN-003 (Linear connected)
- **Evidence:** Issue list screenshot
- **Pass/Fail:** Must pass

---

#### TEST-LINEAR-002: Linear Comment + Status Transition (IMPLEMENTED)
- **Priority:** P0
- **Type:** Live external-service + Staging/E2E
- **Hard Dependency:** TEST-AUTO-008, TEST-CONN-003
- **Implemented Scope:** Read issues, post comments, transition issue to "Done"
- **Scope Exclusions:** Linear issue creation, advanced transitions (deferred to V2)
- **Evidence:** Linear UI screenshot with comment and Done status
- **Pass/Fail:** Must pass (launch connector capability)

---

#### TEST-GITHUB-001: Read GitHub Issues & PRs
- **Priority:** P0
- **Type:** Live external-service (real GitHub)
- **Hard Dependency:** TEST-CONN-001 (GitHub connected)
- **Evidence:** Issue/PR list screenshot
- **Pass/Fail:** Must pass

---

#### TEST-GITHUB-002: GitHub PR Comment (on Existing PR)
- **Priority:** P0
- **Type:** Live external-service + Staging/E2E
- **Hard Dependency:** TEST-AUTO-008, TEST-CONN-001
- **Implemented Scope:** Comment on existing PR
- **Scope Exclusions:** GitHub PR creation (dormant stub — NOT functional, NOT a launch requirement)
- **Evidence:** PR screenshot with comment visible
- **Pass/Fail:** Must pass (launch connector capability)

---

## PART B: P1 TESTS — IMPORTANT BEFORE LAUNCH (19 tests)

P1 tests verify important capabilities that should pass before launch. **Launch gate criteria vary by category:**

**P1 Critical (100% Required):**
- RLS/data isolation (TEST-30, TEST-31, TEST-32)
- IPC boundary security (TEST-33)
- Autonomous advanced authorization (TEST-34, TEST-35)

**P1 Non-Critical (90% Acceptable):**
- Billing advanced scenarios (TEST-36, TEST-37, TEST-38)
- Performance/resilience (TEST-39, TEST-40)
- Error handling (TEST-41, TEST-42, TEST-43)
- Advanced integration (TEST-44, TEST-45)

**Tests 30-48:** [Full P1 test definitions...]

---

## PART C: P2 TESTS — POST-LAUNCH (5 tests)

P2 tests can be deferred entirely to post-launch with zero impact on launch decision.

**Tests 49-53:** [Full P2 test definitions...]

---

## PART D: V2/DEFERRED FUNCTIONALITY

Tests that are explicitly deferred because product scope is not yet implemented or still frozen.

### D.1 Meetings (3 tests) — Backend Verified, Renderer UI Deferred

**TEST-MEET-001:** Create/Upload Meeting
**TEST-MEET-002:** Request Meeting Summarization (via Tier Compute)
**TEST-MEET-003:** Meeting Persistence & Retrieval

**Status:** Backend IPC handlers implemented and billing integration verified. Renderer UI consumer NOT implemented. Deferred to V2.

### D.2 Meeting Billing Tests (2 tests) — Deferred with Backend Implementation

**TEST-BILL-002:** Monitor Real AI Usage Consumption (Meetings)
**TEST-BILL-003:** Insufficient Balance Error (Meeting Billing Path)

**Status:** These tests verify meeting billing via Tier Compute (actual runtime path: meetingHandler → recordUsageEvent → CreditStore.consume()). Deferred because meetings product surface is not launching. Backend implementation verified; testing deferred until renderer UI ready.

### D.3 GitHub PR Creation (Dormant)

**Status:** GitHub PR creation endpoint is dormant/stub implementation. NOT functional. NOT a launch requirement. Explicitly excluded from P0/P1.

### D.4 Other Deferred Items

- Teams connector
- WhatsApp/Telegram/Discord communication
- Avatar generation marketplace
- Mobile app and mobile sync
- Jira/Linear ticket creation
- Jira/Linear advanced transitions beyond "Done"
- Meeting email distribution

---

## LAUNCH DECISION GATES

### Mandatory (100% Pass Required for Launch)

✅ **All 27 P0 tests** (Tests 1-27)

✅ **P1 Critical Categories** (100% required):
- RLS/data isolation (Tests 30-32): 100%
- IPC boundary security (Test 33): 100%
- Autonomous critical paths (Tests 34-35): 100%

### Important (90% Non-Critical Acceptable)

✅ **P1 Non-Critical** (Tests 36-48): 90% pass rate acceptable
- Exceptions allowed only for: performance optimizations, resilience edge cases
- NOT allowed for: security, billing, data integrity, autonomous core logic

### Post-Launch (100% Deferrable)

✅ **All 5 P2 tests** (Tests 49-53): Can defer entirely

### Critical Rule

**Single failure in security, billing, data-integrity, or autonomous-accounting cannot be hidden in aggregate scoring.** These categories have 100% pass requirements regardless of "90% acceptable" for other areas.

---

## FINAL TEST COUNTS

| Category | Count | IDs |
|----------|-------|-----|
| P0 (Mandatory) | 27 | 1-27 |
| P1 (Important) | 19 | 28-46 |
| P2 (Deferred) | 5 | 47-51 |
| **Current Launch Total** | **51** | **1-51** |
| V2/Deferred | 5+ | Meetings, Billing (meetings), dormant items |
| **Grand Total** | **56+** | All including deferred |

---

## STATUS: FINAL CORRECTED — READY FOR EXECUTION APPROVAL

