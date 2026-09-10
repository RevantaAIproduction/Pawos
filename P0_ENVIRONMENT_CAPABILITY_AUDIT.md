# P0 ENVIRONMENT CAPABILITY AUDIT

**Date**: 2026-09-09
**Scope**: Classify all 27 mandatory P0 tests by execution environment requirements
**Purpose**: Identify which tests can run now, which need Electron, which need live providers

---

## TEST-BY-TEST ENVIRONMENT CLASSIFICATION

### CATEGORY A.1: AUTHENTICATION & SESSION MANAGEMENT (5 tests)

#### TEST-AUTH-001: Email/Password Sign Up (New User)
- **Type**: Staging/E2E
- **Required Environment**: Electron UI + Supabase auth
- **Current Support**: ❌ NO (Electron unavailable)
- **Blocker**: Requires interactive Electron desktop app
- **Hard Dependencies**: None
- **Can Run Without Electron**: ❌ NO (core UI interaction required)
- **Classification**: **CATEGORY B — ELECTRON REQUIRED**

#### TEST-AUTH-002: Email/Password Sign In (Existing User)
- **Type**: Staging/E2E
- **Required Environment**: Electron UI + Supabase + test user account
- **Current Support**: ❌ NO (Electron unavailable, depends on TEST-AUTH-001)
- **Blocker**: TEST-AUTH-001 must pass first; Electron required
- **Hard Dependencies**: TEST-AUTH-001
- **Can Run Without Electron**: ❌ NO
- **Classification**: **CATEGORY B & G — ELECTRON REQUIRED + DEPENDENCY-BLOCKED**

#### TEST-AUTH-003: Google OAuth Flow (Sign Up)
- **Type**: Staging/E2E (live Google OAuth)
- **Required Environment**: Electron + Google OAuth provider + Supabase
- **Current Support**: ❌ NO (Electron + live provider)
- **Blocker**: Electron + live OAuth provider
- **Hard Dependencies**: None
- **Can Run Without Electron**: ❌ NO (OAuth desktop redirect required)
- **Classification**: **CATEGORY D — ELECTRON + REAL OAUTH REQUIRED**

#### TEST-AUTH-004: Session Persistence (Restart App)
- **Type**: Manual Electron/runtime
- **Required Environment**: Electron secure storage + app restart capability
- **Current Support**: ❌ NO (requires app lifecycle control)
- **Blocker**: Electron runtime needed; cannot simulate restart in CLI
- **Hard Dependencies**: TEST-AUTH-001
- **Can Run Without Electron**: ❌ NO (restart semantics Electron-specific)
- **Classification**: **CATEGORY B & G — ELECTRON REQUIRED + DEPENDENCY-BLOCKED**

#### TEST-AUTH-005: Logout Flow
- **Type**: Staging/E2E
- **Required Environment**: Electron UI + Supabase session + storage clearing
- **Current Support**: ❌ NO (Electron)
- **Blocker**: Electron UI required
- **Hard Dependencies**: TEST-AUTH-001
- **Can Run Without Electron**: ❌ NO
- **Classification**: **CATEGORY B & G — ELECTRON REQUIRED + DEPENDENCY-BLOCKED**

---

### CATEGORY A.2: BILLING & TIER COMPUTE BASICS (2 tests)

#### TEST-BILL-001: View Tier & Current Credit Balance
- **Type**: Staging/E2E
- **Required Environment**: Electron UI + Supabase balance query + Pro Max user
- **Current Support**: ❌ NO (Electron + requires TEST-AUTH-002)
- **Blocker**: Electron + test user with Pro Max tier
- **Hard Dependencies**: TEST-AUTH-002 (Pro Max user must exist)
- **Can Run Without Electron**: ❌ NO (UI screenshot required)
- **Classification**: **CATEGORY B & G — ELECTRON REQUIRED + DEPENDENCY-BLOCKED**

#### TEST-BILL-004: Top-Up Flow (Purchase Credits)
- **Type**: Staging/E2E (Stripe test mode)
- **Required Environment**: Electron + Stripe test mode + payment processing
- **Current Support**: ❌ NO (Electron + Stripe)
- **Blocker**: Electron + Stripe test credentials
- **Hard Dependencies**: None (independent)
- **Can Run Without Electron**: ❌ NO (payment flow UI-driven)
- **Classification**: **CATEGORY B & D — ELECTRON + EXTERNAL SERVICE (Stripe) REQUIRED**

---

### CATEGORY A.3: CONNECTOR SETUP (6 tests)

#### TEST-CONN-001: GitHub OAuth Connect
- **Type**: Staging/E2E (live GitHub OAuth)
- **Required Environment**: Electron + GitHub OAuth + live GitHub
- **Current Support**: ❌ NO (Electron + live OAuth)
- **Blocker**: Electron + GitHub OAuth credentials
- **Hard Dependencies**: TEST-BILL-004 (must have Work PC balance)
- **Can Run Without Electron**: ❌ NO (OAuth desktop flow)
- **Classification**: **CATEGORY D & G — ELECTRON + REAL OAUTH REQUIRED + DEPENDENCY-BLOCKED**

#### TEST-CONN-002: Jira OAuth Connect
- **Type**: Staging/E2E (live Jira Cloud OAuth)
- **Required Environment**: Electron + Jira OAuth + live Jira Cloud
- **Current Support**: ❌ NO (Electron + live OAuth)
- **Blocker**: Electron + Jira OAuth credentials
- **Hard Dependencies**: TEST-BILL-004
- **Can Run Without Electron**: ❌ NO
- **Classification**: **CATEGORY D & G — ELECTRON + REAL OAUTH REQUIRED + DEPENDENCY-BLOCKED**

#### TEST-CONN-003: Linear API Key Connect
- **Type**: Staging/E2E (live Linear API)
- **Required Environment**: Electron + Linear API key + live Linear
- **Current Support**: ❌ NO (Electron)
- **Blocker**: Electron + Linear API credentials
- **Hard Dependencies**: TEST-BILL-004
- **Can Run Without Electron**: ❌ NO (UI form submission)
- **Classification**: **CATEGORY B & D & G — ELECTRON + EXTERNAL SERVICE (Linear) + DEPENDENCY-BLOCKED**

#### TEST-CONN-004: Slack OAuth Connect (Regression)
- **Type**: Staging/E2E (live Slack OAuth)
- **Required Environment**: Electron + Slack OAuth + live Slack
- **Current Support**: ❌ NO (Electron + live OAuth)
- **Blocker**: Electron + Slack OAuth credentials
- **Hard Dependencies**: TEST-BILL-004
- **Can Run Without Electron**: ❌ NO
- **Classification**: **CATEGORY D & G — ELECTRON + REAL OAUTH REQUIRED + DEPENDENCY-BLOCKED**

#### TEST-CONN-005: Gmail OAuth Connect (Optional)
- **Type**: Staging/E2E
- **Required Environment**: Electron + Gmail OAuth
- **Current Support**: ❌ NO (Electron)
- **Blocker**: Electron
- **Hard Dependencies**: TEST-BILL-004
- **Can Run Without Electron**: ❌ NO
- **Classification**: **CATEGORY B & D & G — ELECTRON + OPTIONAL + DEPENDENCY-BLOCKED**

#### TEST-CONN-006: Google Calendar OAuth Connect (Optional)
- **Type**: Staging/E2E
- **Required Environment**: Electron + Google Calendar OAuth
- **Current Support**: ❌ NO (Electron)
- **Blocker**: Electron
- **Hard Dependencies**: TEST-BILL-004
- **Can Run Without Electron**: ❌ NO
- **Classification**: **CATEGORY B & D & G — ELECTRON + OPTIONAL + DEPENDENCY-BLOCKED**

---

### CATEGORY A.4: AUTONOMOUS WORK — ARCHITECTURE & EXECUTION (8 tests)

#### TEST-AUTO-001: Start Autonomous Work (Entitlement Check)
- **Type**: Manual source inspection + Database verification
- **Required Environment**: Source code + Supabase database access
- **Current Support**: ✅ YES (source inspection + DB queries possible)
- **Blocker**: None (can verify via source + DB)
- **Hard Dependencies**: TEST-BILL-004 (Work PC balance needed)
- **Can Run Without Electron**: ✅ YES (DB verification only)
- **Classification**: **CATEGORY C & G — LIVE SUPABASE + DEPENDENCY-BLOCKED**

#### TEST-AUTO-002: Executor Claiming (Phase 2C)
- **Type**: Manual source inspection + Database verification
- **Required Environment**: Source code + Supabase + RPC call simulation
- **Current Support**: ✅ MAYBE (RPC queries possible; actual executor claim requires Electron workflow)
- **Blocker**: Executor claim only happens during actual autonomous work execution (Electron-driven)
- **Hard Dependencies**: TEST-AUTO-001
- **Can Run Without Electron**: ❌ NO (executor claiming triggered by Electron workflow)
- **Classification**: **CATEGORY B & G — ELECTRON REQUIRED (for claim triggering) + DEPENDENCY-BLOCKED**

#### TEST-AUTO-003: Model Identity Consistency (Phase 2B)
- **Type**: Manual source inspection + Automated integration
- **Required Environment**: Source code + Network inspection
- **Current Support**: ❌ NO (requires Electron DevTools Network tab)
- **Blocker**: Electron DevTools/Network inspection needed
- **Hard Dependencies**: TEST-AUTO-001
- **Can Run Without Electron**: ❌ NO (model consistency verified via network inspection)
- **Classification**: **CATEGORY B & G — ELECTRON REQUIRED (DevTools) + DEPENDENCY-BLOCKED**

#### TEST-AUTO-004: Exact Token Preflight (Phase 2D)
- **Type**: Live external-service (Gemini API) + Manual inspection
- **Required Environment**: Gemini API + DevTools Network tab + Electron
- **Current Support**: ❌ NO (Electron + live Gemini)
- **Blocker**: Electron + live Gemini API call
- **Hard Dependencies**: TEST-AUTO-001
- **Can Run Without Electron**: ❌ NO (preflight happens during execution)
- **Classification**: **CATEGORY B & D & G — ELECTRON + LIVE GEMINI API + DEPENDENCY-BLOCKED**

#### TEST-AUTO-005: Autonomous Authorization (Work PC Reservation)
- **Type**: Automated integration + Database verification
- **Required Environment**: Electron workflow + Supabase RPC + Network inspection
- **Current Support**: ❌ NO (Electron needed to trigger authorization)
- **Blocker**: Electron (to trigger autonomous work, which calls authorize_autonomous_model_request RPC)
- **Hard Dependencies**: TEST-AUTO-001, TEST-AUTO-004
- **Can Run Without Electron**: ❌ NO (RPC only fires when work starts)
- **Classification**: **CATEGORY B & G — ELECTRON REQUIRED + DEPENDENCY-BLOCKED**

#### TEST-AUTO-006: Autonomous Execution (Conversation Runtime)
- **Type**: Staging/E2E + Manual Electron/runtime
- **Required Environment**: Electron + Gemini API + Supabase + execution plugins
- **Current Support**: ❌ NO (Electron + live execution)
- **Blocker**: Electron + live execution environment
- **Hard Dependencies**: TEST-AUTO-001 through TEST-AUTO-005
- **Can Run Without Electron**: ❌ NO (execution runtime required)
- **Classification**: **CATEGORY B & D & G — ELECTRON + LIVE GEMINI + DEPENDENCY-BLOCKED**

#### TEST-AUTO-007: Autonomous Failure States
- **Type**: Staging/E2E + Manual Electron/runtime
- **Required Environment**: Electron + error simulation capability
- **Current Support**: ❌ NO (Electron)
- **Blocker**: Electron (to trigger failure scenarios)
- **Hard Dependencies**: TEST-AUTO-001 through TEST-AUTO-005
- **Can Run Without Electron**: ❌ NO
- **Classification**: **CATEGORY B & G — ELECTRON REQUIRED + DEPENDENCY-BLOCKED**

#### TEST-AUTO-008: Settlement (Work PC Settlement RPC)
- **Type**: Automated integration + Database verification
- **Required Environment**: Completed autonomous work + Supabase settlement RPC
- **Current Support**: ❌ NO (requires TEST-AUTO-006 to complete)
- **Blocker**: TEST-AUTO-006 must execute first
- **Hard Dependencies**: TEST-AUTO-006 (completed task)
- **Can Run Without Electron**: ❌ NO (settlement only after execution)
- **Classification**: **CATEGORY B & G — ELECTRON REQUIRED + DEPENDENCY-BLOCKED**

---

### CATEGORY A.5: CONNECTOR WRITE-BACK OPERATIONS (6 tests)

#### TEST-JIRA-001: Read Jira Issues
- **Type**: Live external-service (real Jira Cloud)
- **Required Environment**: Jira Cloud + API credentials + Electron UI
- **Current Support**: ❌ NO (Electron + live Jira)
- **Blocker**: Electron + TEST-CONN-002 (Jira connector setup)
- **Hard Dependencies**: TEST-CONN-002 (Jira must be connected)
- **Can Run Without Electron**: ❌ NO (UI interaction required)
- **Classification**: **CATEGORY D & G — LIVE JIRA CLOUD + ELECTRON + DEPENDENCY-BLOCKED**

#### TEST-JIRA-002: Jira Comment + Status Transition
- **Type**: Live external-service + Staging/E2E
- **Required Environment**: Jira Cloud + autonomous work completion + Electron
- **Current Support**: ❌ NO (Electron + live Jira + autonomous work)
- **Blocker**: Electron + TEST-AUTO-008 (autonomous work must complete)
- **Hard Dependencies**: TEST-AUTO-008, TEST-CONN-002
- **Can Run Without Electron**: ❌ NO
- **Classification**: **CATEGORY D & G — LIVE JIRA CLOUD + ELECTRON + DEPENDENCY-BLOCKED**

#### TEST-LINEAR-001: Read Linear Issues
- **Type**: Live external-service (real Linear)
- **Required Environment**: Linear API + credentials + Electron UI
- **Current Support**: ❌ NO (Electron + live Linear)
- **Blocker**: Electron + TEST-CONN-003 (Linear connector setup)
- **Hard Dependencies**: TEST-CONN-003
- **Can Run Without Electron**: ❌ NO
- **Classification**: **CATEGORY D & G — LIVE LINEAR + ELECTRON + DEPENDENCY-BLOCKED**

#### TEST-LINEAR-002: Linear Comment + Status Transition
- **Type**: Live external-service + Staging/E2E
- **Required Environment**: Linear + autonomous work + Electron
- **Current Support**: ❌ NO
- **Blocker**: Electron + TEST-AUTO-008
- **Hard Dependencies**: TEST-AUTO-008, TEST-CONN-003
- **Can Run Without Electron**: ❌ NO
- **Classification**: **CATEGORY D & G — LIVE LINEAR + ELECTRON + DEPENDENCY-BLOCKED**

#### TEST-GITHUB-001: Read GitHub Issues & PRs
- **Type**: Live external-service (real GitHub)
- **Required Environment**: GitHub API + credentials + Electron UI
- **Current Support**: ❌ NO (Electron + live GitHub)
- **Blocker**: Electron + TEST-CONN-001 (GitHub connector setup)
- **Hard Dependencies**: TEST-CONN-001
- **Can Run Without Electron**: ❌ NO
- **Classification**: **CATEGORY D & G — LIVE GITHUB + ELECTRON + DEPENDENCY-BLOCKED**

#### TEST-GITHUB-002: GitHub PR Comment
- **Type**: Live external-service + Staging/E2E
- **Required Environment**: GitHub + autonomous work + Electron
- **Current Support**: ❌ NO
- **Blocker**: Electron + TEST-AUTO-008
- **Hard Dependencies**: TEST-AUTO-008, TEST-CONN-001
- **Can Run Without Electron**: ❌ NO
- **Classification**: **CATEGORY D & G — LIVE GITHUB + ELECTRON + DEPENDENCY-BLOCKED**

---

## SUMMARY BY CLASSIFICATION

### GROUP 1 — EXECUTABLE IN CURRENT ENVIRONMENT

**Count**: 0 tests
**Tests**: None

**Reason**: All 27 P0 tests require either:
- Electron UI interaction, OR
- Live external provider/OAuth, OR
- Electron-triggered workflow

No P0 tests are pure CLI/source/database verifications independent of Electron.

---

### GROUP 2 — ELECTRON REQUIRED

**Count**: 16 tests
- TEST-AUTH-001, AUTH-002, AUTH-004, AUTH-005
- TEST-BILL-001, BILL-004
- TEST-CONN-001, CONN-002, CONN-003, CONN-004, CONN-005, CONN-006
- TEST-AUTO-002, AUTO-003, AUTO-005, AUTO-006, AUTO-007, AUTO-008

**Reason**: UI-driven tests requiring desktop app interaction

---

### GROUP 3 — LIVE BACKEND REQUIRED

**Count**: 1 test
- TEST-AUTO-001

**Reason**: Can verify via Supabase queries + source inspection (does NOT require Electron if workflow is triggered externally)

**Note**: This test CAN be verified if:
- An autonomous work task exists in Supabase
- OR autonomous work is triggered via external method
- BUT still blocked by TEST-BILL-004 hard dependency

---

### GROUP 4 — LIVE PROVIDER/OAUTH REQUIRED

**Count**: 12 tests
- TEST-AUTH-003 (Google OAuth)
- TEST-CONN-001 (GitHub), CONN-002 (Jira), CONN-003 (Linear), CONN-004 (Slack), CONN-005 (Gmail), CONN-006 (Calendar)
- TEST-JIRA-001, JIRA-002, LINEAR-001, LINEAR-002, GITHUB-001, GITHUB-002
- TEST-AUTO-004 (Gemini API)

**Reason**: Require live OAuth provider redirects or external API calls

---

### GROUP 5 — DEPENDENCY-BLOCKED

**Count**: 26 tests
(All tests except those with 0 hard dependencies)

**Hard Dependency Tree**:
```
TEST-AUTH-001 (No dependency)
  ↓ blocks TEST-AUTH-002, AUTH-004, AUTH-005
TEST-BILL-004 (No dependency) 
  ↓ blocks TEST-BILL-001, CONN-001..006, AUTO-001
TEST-BILL-001 (depends on AUTH-002)
TEST-CONN-001..004 (depend on BILL-004)
TEST-AUTO-001 (depends on BILL-004)
  ↓ blocks AUTO-002, AUTO-003
TEST-AUTO-004 (depends on AUTO-001)
  ↓ blocks AUTO-005
TEST-AUTO-005 (depends on AUTO-001, AUTO-004)
  ↓ blocks AUTO-006, AUTO-007
TEST-AUTO-006 (depends on AUTO-001..AUTO-005)
  ↓ blocks AUTO-008
TEST-AUTO-008 (depends on AUTO-006)
  ↓ blocks JIRA-002, LINEAR-002, GITHUB-002

Independent path (no dependency):
TEST-BILL-004
  ↓ CONN-001..004
  ↓ READ tests (JIRA-001, LINEAR-001, GITHUB-001)
```

---

## CURRENT P0 EXECUTION STRATEGY

### EXECUTABLE NOW (With Current Environment)

**Count**: 0 tests

**Reason**: All 27 P0 tests require either Electron desktop or live external providers.

---

### WHAT WOULD UNBLOCK TESTING

#### Path 1: Local Electron Desktop
If test runner has access to local machine with desktop:
1. Start: `npm run dev:electron`
2. Execute TEST-AUTH-001 (no dependency) manually
3. Then TEST-BILL-004 (independent)
4. Then connector tests (TEST-CONN-001..004)
5. Then autonomous tests (TEST-AUTO-001..008)
6. Then write-back tests (JIRA/LINEAR/GITHUB)

**Estimated execution time**: 2-3 hours (includes OAuth flows, payment processing, Gemini calls)

#### Path 2: CI/CD Pipeline with Desktop Runner
- GitLab CI with Windows desktop runner
- Headless Electron with virtual display (Xvfb on Linux)
- Pre-stage test OAuth credentials

---

### DEPENDENCY EXECUTION ORDER (When Electron Available)

**Tier 1 — No Dependencies (Execute First)**:
1. TEST-BILL-004 (Stripe top-up) — independent
2. TEST-AUTH-001 (Email sign-up) — independent

**Tier 2 — Depend on Tier 1**:
3. TEST-BILL-001 (requires TEST-AUTH-002, which requires TEST-AUTH-001)
4. TEST-CONN-001..004 (require TEST-BILL-004)
5. TEST-AUTO-001 (requires TEST-BILL-004)

**Tier 3 — Depend on Tier 2**:
6. TEST-AUTH-002, AUTH-004, AUTH-005 (require TEST-AUTH-001)
7. TEST-JIRA-001, LINEAR-001, GITHUB-001 (require CONN tests)
8. TEST-AUTO-002..005 (require TEST-AUTO-001)

**Tier 4 — Deep Dependency Chain**:
9. TEST-AUTO-006, AUTO-007 (require TEST-AUTO-001..005)
10. TEST-AUTO-008 (requires TEST-AUTO-006)
11. TEST-JIRA-002, LINEAR-002, GITHUB-002 (require TEST-AUTO-008)

---

### CORRECT NEXT TEST AFTER TEST-AUTH-001 IS RESOLVED

**If TEST-AUTH-001 passes**:
- Execute TEST-BILL-004 next (independent of AUTH)
- Parallel: Test Connector OAuth with Tier 1 tests

**If TEST-AUTH-001 fails**:
- Do NOT proceed to AUTH-002, AUTH-004, AUTH-005
- CAN proceed to TEST-BILL-004 (independent)

**Recommended parallel execution (when possible)**:
- TEST-BILL-004 (while TEST-AUTH-001 is running/blocked)
- Start this immediately — no dependency on AUTH tests

---

## BLOCKER SUMMARY

| Blocker Type | Count | Impact |
|--------------|-------|--------|
| **Electron Runtime** | 16 | Critical — blocks all UI tests |
| **Live OAuth Providers** | 12 | Critical — blocks connector/auth OAuth tests |
| **Live External APIs** | 8 | Critical — blocks Gemini, Jira, Linear, GitHub, Stripe |
| **Hard Dependency Chains** | 26 | High — sequential execution required |
| **Currently Executable** | 0 | ZERO tests can run now |

---

## MINIMUM REQUIRED TO BEGIN P0 TESTING

**Option A: Local Developer Desktop**
- ✅ `npm run dev:electron` (interactive desktop, X11, or headless runner)
- ✅ Real Supabase staging credentials
- ✅ Real OAuth provider credentials (Google, GitHub, Jira, Linear, Slack)
- ✅ Stripe test API key
- ✅ Time: 2-3 hours to complete all 27 P0 tests

**Option B: CI/CD Pipeline**
- ✅ GitLab runner with desktop capabilities
- ✅ Pre-configured OAuth secrets
- ✅ Supabase staging accessible from runner
- ✅ Automated test harness (Puppeteer/Playwright + Electron driver)

**Option C: Staging Environment**
- ✅ Remote desktop (VNC/RDP) to run Electron locally
- ✅ Live relay of test results back to CI/CD

---

