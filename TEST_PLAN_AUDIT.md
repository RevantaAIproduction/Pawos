# TEST PLAN AUDIT REPORT
**Date:** 2026-09-09  
**Scope:** Verification of COMPREHENSIVE_TEST_PLAN.md against actual current implementation  
**Result:** Multiple stale assumptions found — corrections required before test execution

---

## CRITICAL CORRECTIONS REQUIRED

### 1. JIRA/LINEAR CAPABILITIES (SCOPE ERROR)

**Stale Assumption in Test Plan:**
- Section "Intentionally Deferred / V2" lists: "Jira/Linear ticket creation/updates (currently read-only only)"
- Lines 18: "Jira/Linear ticket creation/updates (currently read-only only)"
- Line 19: "Advanced Jira/Linear status transitions beyond 'Done'"

**Actual Implementation:**
- **Jira:** Comments AND status transition to "Done" ARE implemented
  - Location: AutonomousOrchestrator.ts:1192-1245
  - Includes: comment posting (line 1200-1210) + status transition to Done (line 1214-1231)
  - Uses JiraWriteBackPlugin.buildJiraAuthorizationHeader() for OAuth Bearer vs Basic auth
- **Linear:** Comments AND status transition to "Done" ARE implemented
  - Location: AutonomousOrchestrator.ts:1248-1302
  - Includes: comment posting (line 1261-1270) + status transition to Done (line 1273-1287)

**Correction:**
1. Remove "Jira/Linear ticket creation/updates (currently read-only only)" from deferred list
2. Replace with: "Jira/Linear: ticket creation and advanced status transitions (not implemented, deferred to V2)"
3. Update test descriptions to specify which capabilities ARE tested:
   - Jira: Read issues, post comments, transition to Done
   - Linear: Read issues, post comments, transition to Done
   - Jira/Linear: NOT tested: ticket creation, description updates, arbitrary status transitions

**Evidence/Source:**
- src/renderer/organization/AutonomousOrchestrator.ts:1186-1302
- src/main/execution/plugins/infrastructure/JiraWriteBackPlugin.ts (OAuth Bearer detection)

**Priority Impact:** MEDIUM — affects P0 test scope definition

---

### 2. GITHUB PR CREATION STATUS (SCOPE ERROR)

**Stale Assumption in Test Plan:**
- TEST-GITHUB-002 "GitHub PR Creation (via Autonomous Work)" classified as P0
- Steps assume PR creation succeeds and is visible in GitHub
- Expected result: "PR created on target branch"

**Actual Implementation:**
- GitHub PR creation function EXISTS in AutonomousOrchestrator.ts:1100-1158
- BUT is a STUB: Line 1125 shows `createGitHubPR = async (opts: any) => ({ ok: false, reason: 'PR creation requires main process' });`
- Always returns failure
- PR creation is NOT functional in current code

**Correction:**
1. Move TEST-GITHUB-002 from P0 to DORMANT/NOT TESTED section
2. Replace with note: "GitHub PR creation: dormant/incomplete. Currently only GitHub PR commenting on externally-created PRs is implemented."
3. Keep TEST-GITHUB-003 (PR commenting) as P0 — only for existing PRs, not creation
4. If any test uses "PR created in autonomous work flow," replace with "PR externally created, autonomous work posts comment to it"

**Evidence/Source:**
- src/renderer/organization/AutonomousOrchestrator.ts:1100-1158, specifically line 1125

**Priority Impact:** HIGH — affects P0 test suite definition. PR creation is NOT ready for launch testing.

---

### 3. SETTLEMENT RPC NAME (IMPLEMENTATION REFERENCE ERROR)

**Stale Assumption in Test Plan:**
- TEST-AUTO-008 "Settlement": "Settlement RPC: settle_autonomous_run_execution() called"
- References non-existent RPC name

**Actual Implementation:**
- RPC is: `settle_autonomous_task_run_pc(p_run_id, p_actual_pc)`
- Location: AutonomousTaskBillingService.ts:170
- Not `settle_autonomous_run_execution()`

**Correction:**
- Replace all references to `settle_autonomous_run_execution()` with `settle_autonomous_task_run_pc()`
- Update test assertions to verify correct RPC name
- Add verification: RPC accepts (run_id, actual_pc) parameters

**Evidence/Source:**
- src/renderer/organization/AutonomousTaskBillingService.ts:170

**Priority Impact:** MEDIUM — test assertions need correction

---

### 4. BILLING TERMINOLOGY (CONCEPTUAL ERROR)

**Stale Assumptions in Test Plan:**
- TEST-AUTO-001 through TEST-AUTO-009 use "tokens" interchangeably for all billing
- TEST-BILL-002 "Monitor Real AI Usage Consumption": "balance decreased by reasonable amount (e.g., 50-500 tokens)"
- No distinction between Tier Compute (normal AI usage) and Work PC (autonomous execution)

**Actual Implementation:**
- **Tier Compute:** Used for normal conversations, meetings, etc. Charged via creditStore.consume() in tokens.
- **Work PC:** Used for autonomous execution. Charged in PC units (not tokens).
- Two distinct billing systems.
- Conversion: $1 customer money = 100 Work PC = (variable) Tier Compute tokens

**Corrections in Test Plan:**
1. TEST-BILL-002: Replace "balance decreased by X tokens" with "Tier Compute balance decreased"
2. Add clarification: "Meeting summarization uses Tier Compute (creditStore.consume), not Work PC"
3. TEST-AUTO-008 onwards: Use "Work PC" not "tokens" for autonomous execution
4. TEST-AUTO-001 authorization: Specify "Work PC required" not "tokens"
5. Add note: Autonomous authorization checks Work PC availability, not Tier Compute

**Evidence/Source:**
- src/main/billing/CreditStore.ts (Tier Compute, tokens)
- src/renderer/organization/AutonomousTaskBillingService.ts (Work PC settlement)
- src/main/ipc/handlers/meetingHandler.ts:279-284 (creditStore.consume for meetings)

**Priority Impact:** MEDIUM — affects billing test interpretation

---

### 5. EVIDENCE REQUIREMENTS — ELECTRON APP CORRECTIONS

**Stale Assumptions in Test Plan:**
- TEST-AUTH-001 Evidence: "localStorage contains valid auth tokens"
- TEST-AUTH-002 Evidence: "Browser Network tab shows auth token in response"
- TEST-AUTH-003 Evidence: "renderer/main IPC logs do NOT contain token"
- Multiple tests reference "Browser Network tab" for Electron app

**Actual Implementation:**
- PawOS is an Electron desktop application (not a web app)
- Auth tokens stored in secure Electron storage (not localStorage)
- Network visibility depends on DevTools in Electron
- IPC communication is internal, not HTTP

**Corrections:**
1. Replace "localStorage" with "Electron secure storage" or "keychain"
2. Replace "Browser Network tab" with "DevTools Network tab (if DevTools enabled)" or "Electron IPC inspection"
3. Clarify: renderer process has no localStorage for auth (Electron app stores tokens securely)
4. Add note: Some evidence may require Electron DevTools or main-process instrumentation
5. For OAuth tests: "no token in DevTools console output" is correct; "localStorage" is incorrect

**Evidence/Source:**
- PawOS architecture (Electron desktop app)
- Supabase auth integration in renderer process

**Priority Impact:** MEDIUM — affects evidence collection methodology

---

### 6. ENTITLEMENT MATRIX (IMPLEMENTATION REFERENCE ERROR)

**Assumption in Test Plan:**
- No explicit entitlement matrix stated
- Tests assume Pro Max required, but no spec of other tiers

**Actual Implementation:**
- Entitlement matrix from EntitlementService.ts:
  - Go tier (free): Tier Compute only, no Autonomous Work
  - Pro tier (individual): Tier Compute only, no Autonomous Work
  - Pro Max tier (individual): Full feature set, Autonomous Work
  - Pro (organization): Tier Compute only, no Autonomous Work
  - Pro Max (organization): Full feature set, Autonomous Work
  - Team (organization): Full feature set, Autonomous Work
  - Enterprise (organization): Full feature set, Autonomous Work

**Corrections:**
1. Add explicit entitlement matrix to test plan
2. TEST-AUTO-001: Verify entitlementIsFeatureAvailable('autonomousTaskBilling') returns correct value per tier
3. Add test: "Go tier user cannot start autonomous work (error expected)"
4. Add test: "Pro tier user cannot start autonomous work (error expected)"
5. Add test: "Organization Pro user cannot start autonomous work (error expected)"
6. Verify: Team and Enterprise org users CAN start autonomous work

**Evidence/Source:**
- src/main/billing/EntitlementService.ts
- src/renderer/organization/AutonomousTaskBillingGate.ts line 82 (entitlementIsFeatureAvailable check)

**Priority Impact:** MEDIUM — test coverage gaps

---

### 7. RLS ENFORCEMENT VERIFICATION SCOPE (VERIFICATION TYPE ERROR)

**Stale Assumption in Test Plan:**
- TEST-SEC-P1-001 claims RLS is "verified" by existence in migrations
- Migration CREATE POLICY statements shown as "verification complete"

**Actual Implementation:**
- Source-level verification: CREATE POLICY statements exist in migrations (VERIFIED in code)
- Applied migration verification: requires database inspection to confirm policies exist on live schema
- Live RLS enforcement: requires cross-user access test on deployed database

**Corrections:**
1. Add three separate RLS tests:
   - **Test A (Source):** "Migration files contain CREATE POLICY statements for autonomous_task_runs and organization_billing_events" — ALREADY VERIFIED by code audit
   - **Test B (Schema):** "Deployed Supabase database shows RLS enabled and policies created (query information_schema)" — REQUIRED for staging
   - **Test C (Enforcement):** "User B cannot read User A's runs via authenticated Supabase client" — REQUIRED for staging
2. Move TEST-SEC-P1-001 from claiming "verified" to requiring "staging E2E"
3. Add evidence requirement: "Run query as user-B, verify no rows returned"

**Evidence/Source:**
- Source verification: supabase/migrations/20260723000000, 20260903000000
- Staging verification: Requires live Supabase database

**Priority Impact:** MEDIUM — RLS not fully tested yet

---

### 8. WAITING FOR TOP-UP MECHANISM (IMPLEMENTATION REFERENCE)

**Stale Assumption in Test Plan:**
- TEST-AUTO-P1-001: "Authorization fails... App shows 'Waiting for Top-Up' modal"
- No source verification that this modal exists or is named this

**Actual Implementation:**
- Task transitions to 'waiting_for_topup' state (confirmed in RPC)
- UI rendering of this state not verified in test plan source audit
- Modal/UI component may or may not exist; requires renderer verification

**Corrections:**
1. Add verification: "Check that Settings/Dashboard/UI actually displays 'waiting_for_topup' state to user"
2. Clarify: Test can verify the DATABASE state (status='waiting_for_topup') without assuming UI
3. If no UI exists yet, mark as "backend state verification only, UI rendering TBD"
4. Step 1 should be: "Start autonomous work with insufficient balance"
5. Step 2: "Verify Supabase shows task status = 'waiting_for_topup'"
6. Step 3 (if UI exists): "Verify user-visible modal/message prompts for top-up"

**Evidence/Source:**
- Database state confirmed; UI not verified in this audit

**Priority Impact:** LOW — database behavior is testable regardless of UI

---

### 9. AUTONOMOUS CANCELLATION SCENARIOS (INCOMPLETE SPEC)

**Stale Assumption in Test Plan:**
- TEST-AUTO-P2-001: "Cancellation... charges applied only for work done (if partial settlement)"
- No distinction between cancellation before and after provider work

**Actual Implementation:**
- Cancellation can occur at any point in lifecycle
- If cancelled before provider work: reservation returned, no charge
- If cancelled after provider work: actual usage settled, reservation partially returned
- Settlement idempotency ensures no double-charging

**Corrections:**
1. Split TEST-AUTO-P2-001 into two scenarios:
   - **Scenario A:** Cancellation during execution planning (no provider API calls yet) → 0 Work PC charged
   - **Scenario B:** Cancellation after Gemini API calls started → actual Work PC consumed charged
2. Test each scenario separately
3. Verify idempotency: multiple cancel attempts don't double-charge
4. Verify reservation accounting: reserved balance is returned proportionally

**Evidence/Source:**
- Settlement RPC logic in migrations

**Priority Impact:** LOW — details test coverage

---

### 10. ANDROID/HEADLESS EVIDENCE COLLECTION (ARCHITECTURE MISMATCH)

**Stale Assumption in Test Plan:**
- Multiple tests reference "Browser" features (cookies, local storage, etc.)
- Some reference "renderer console"
- Some reference "IPC logs"
- Terminology inconsistent for Electron app

**Actual Implementation:**
- PawOS is Electron desktop app
- "Renderer" = Electron renderer process (web view inside Electron)
- "DevTools" = Electron DevTools attached to app window
- "IPC" = Inter-Process Communication between Electron main and renderer
- No browser localStorage (Electron uses secure storage)

**Corrections:**
1. Standardize terminology:
   - "DevTools console" not "browser console"
   - "Electron secure storage" not "localStorage"
   - "Main process logs" not "browser logs"
   - "IPC channel messages" not "XHR/fetch"
2. For each test, specify correct evidence source
3. Add note: "Some evidence may require Electron DevTools or main-process log inspection"

**Evidence/Source:**
- PawOS is Electron app (src/main directory exists, not standard web app)

**Priority Impact:** LOW — clarification only

---

### 11. CONNECTOR WRITE-BACK PROTECTION (IMPLEMENTATION DETAIL)

**Assumption in Test Plan:**
- Jira/Linear write-back tests assume explicit entitlement gates

**Actual Implementation:**
- Credential possession is the primary security boundary (not explicit connector entitlement gate)
- If Jira credentials not configured: graceful skip ("Jira: credentials not configured")
- No separate @assertConnectorEntitled() call needed (credential lookup failure is the gate)
- Connector entitlement enforcement happens at CONNECTION time (ConnectorEntitlementGate), not write-back time

**Corrections:**
1. Update TEST-JIRA-002 expected result: "Comment not posted if credentials not configured (graceful failure)"
2. Clarify: Credential possession is the security boundary, not explicit entitlement re-check
3. Test separately: connector entitlement enforcement (at connection time), not at write-back time
4. Remove assumption of "explicit @assertConnectorEntitled() gate in write-back handler"

**Evidence/Source:**
- src/renderer/organization/AutonomousOrchestrator.ts:1192 (credential resolution check)

**Priority Impact:** LOW — implementation detail

---

## SUMMARY TABLE

| # | Finding | Type | Severity | Section Affected | Action |
|---|---------|------|----------|------------------|--------|
| 1 | Jira/Linear are NOT read-only | Scope | HIGH | Deferred list, TEST-JIRA-*, TEST-LINEAR-* | Remove from deferred, keep comment/transition tests |
| 2 | GitHub PR creation is dormant stub | Scope | HIGH | TEST-GITHUB-002 | Move to dormant, not P0 |
| 3 | Settlement RPC is `settle_autonomous_task_run_pc` | Reference | MEDIUM | TEST-AUTO-008, code references | Replace RPC name |
| 4 | Tier Compute vs Work PC distinction missing | Terminology | MEDIUM | All billing tests | Add clear terminology |
| 5 | localStorage → Electron secure storage | Architecture | MEDIUM | Evidence requirements | Replace storage mechanism |
| 6 | Entitlement matrix not specified | Spec | MEDIUM | Tier gating tests | Add explicit matrix |
| 7 | RLS verification incomplete | Scope | MEDIUM | TEST-SEC-P1-001 | Add schema + enforcement tests |
| 8 | Waiting-for-topup UI unverified | Implementation | LOW | TEST-AUTO-P1-001 | Verify DB state, note UI as TBD |
| 9 | Cancellation scenarios incomplete | Spec | LOW | TEST-AUTO-P2-001 | Split into A/B scenarios |
| 10 | Browser/localStorage terminology | Terminology | LOW | Evidence sections | Standardize to Electron terms |
| 11 | Credential possession vs entitlement gate | Detail | LOW | TEST-JIRA-*, TEST-LINEAR-* | Clarify security boundary |

---

## CORRECTIONS APPLIED TO REVISED TEST PLAN

All 11 findings above have been corrected in the revised COMPREHENSIVE_TEST_PLAN.md:

1. ✅ Jira/Linear moved from deferred to implemented (comment + Done transition)
2. ✅ GitHub PR creation moved to dormant section
3. ✅ Settlement RPC name corrected
4. ✅ Billing terminology clarified (Tier Compute vs Work PC)
5. ✅ Evidence requirements updated for Electron app
6. ✅ Entitlement matrix added
7. ✅ RLS tests split into source/schema/enforcement
8. ✅ Waiting-for-topup tests clarified
9. ✅ Cancellation scenarios separated
10. ✅ Terminology standardized
11. ✅ Credential possession vs entitlement clarified

---

**Status:** AUDIT COMPLETE — All corrections applied to revised test plan

