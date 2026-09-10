# COMPREHENSIVE TEST PLAN — PawOS Product (CORRECTED V3)

**Date:** 2026-09-09  
**Version:** 3 (Critically Corrected)  
**Scope:** Complete currently-implemented product capabilities for planned production launch  
**Status:** READY FOR REVISION REVIEW (not yet approved for execution)

---

## OVERVIEW

This corrected test plan covers all currently-implemented capabilities in PawOS as of 2026-09-09, organized by priority (P0 mandatory before launch, P1 important before launch, P2 post-launch acceptable). Each test includes exact prerequisites, step-by-step procedures, expected results, and evidence requirements.

**Key Corrections from V2:**
- ✅ Meeting tests moved to V2/Deferred (backend only, no renderer UI)
- ✅ Meeting billing test corrected to actual runtime path (not autonomous countTokens)
- ✅ P0/P1 launch gates made category-specific (100% for critical categories)
- ✅ Test classifications corrected (manual vs automated distinguished)
- ✅ Dependencies clarified (hard vs soft/recommended order)
- ✅ Test count recalculated: 56 → 53 tests (29 P0, 19 P1, 5 P2)
- ✅ All test IDs renumbered accordingly

**Intentionally Deferred / V2 / Dormant:**
- Meetings: Backend implementation verified; renderer UI consumer deferred to V2
- Meeting email distribution (deferred to V2)
- Teams connector (deferred to V2)
- WhatsApp/Telegram/Discord communication (deferred to V2)
- Avatar generation marketplace (deferred to V2)
- Mobile app and mobile sync (deferred to V2)
- Jira/Linear ticket creation/updates (deferred to V2)
- Jira/Linear advanced status transitions beyond "Done" (deferred to V2)
- GitHub PR creation (dormant/stub — not functional)

---

## ENTITLEMENT MATRIX (AUTHORITATIVE)

Do not modify:

| Tier | Individual | Organization |
|------|-----------|---------------|
| Go (Free) | NO Autonomous Work | N/A |
| Pro | NO Autonomous Work | NO Autonomous Work |
| Pro Max | ✅ Autonomous Work | ✅ Autonomous Work |
| Team | N/A | ✅ Autonomous Work |
| Enterprise | N/A | ✅ Autonomous Work |

---

## PART A: P0 TESTS — MANDATORY BEFORE LAUNCH (29 tests)

P0 tests verify capabilities that are mandatory for the current planned production launch. **All 29 P0 tests must pass (100% gate) before launch decision.**

---

### A.1 Authentication & Session Management (5 tests)

#### TEST-AUTH-001: Email/Password Sign Up (New User)
- **Priority:** P0
- **Subsystem:** Authentication / Supabase Auth
- **Type:** Staging/E2E (real Supabase + OAuth providers)
- **Hard Dependency:** None (initial user creation)
- **Prerequisites:**
  - PawOS Electron desktop app running
  - Supabase project with email auth enabled
  - No existing account with test email
  
- **Steps:**
  1. Click "Create Account" button on sign-in screen
  2. Enter new email (test-001-20260909@example.com)
  3. Enter password (minimum 8 chars, 1 uppercase, 1 number)
  4. Check email inbox for verification link
  5. Click verification link in email
  6. Electron app receives OAuth callback
  7. Dashboard is visible
  
- **Expected Result:**
  - Account created in Supabase auth
  - User table entry created
  - Session established in Electron secure storage
  - Dashboard renders
  
- **Failure Criteria:**
  - Verification email never arrives
  - Verification link doesn't work
  - Dashboard doesn't load after verification
  
- **Evidence Required:**
  - Screenshot of Dashboard after sign-up
  - Supabase Auth user record exists with correct email
  - Electron secure storage contains valid auth tokens

---

#### TEST-AUTH-002: Email/Password Sign In (Existing User)
- **Priority:** P0
- **Subsystem:** Authentication / Supabase Auth
- **Type:** Staging/E2E
- **Hard Dependency:** TEST-AUTH-001 (user must exist)
- **Prerequisites:**
  - Verified account already exists (from TEST-AUTH-001)
  - App at sign-in screen
  
- **Steps:**
  1. Enter email (test-001-20260909@example.com)
  2. Enter correct password
  3. Click "Sign In"
  4. Dashboard loads
  
- **Expected Result:**
  - Auth token obtained
  - Session established
  - Dashboard renders
  - User email shown in account menu
  
- **Failure Criteria:**
  - Wrong password accepted
  - Correct password rejected
  - Session not established
  
- **Evidence Required:**
  - Screenshot of Dashboard
  - Electron secure storage contains valid token

---

#### TEST-AUTH-003: Google OAuth Flow (Sign Up)
- **Priority:** P0
- **Subsystem:** Authentication / OAuth / Google
- **Type:** Staging/E2E (live Google OAuth)
- **Hard Dependency:** None (separate Google account)
- **Prerequisites:**
  - Google Cloud OAuth app configured
  - Test Google account available
  - Sign-up page visible
  
- **Steps:**
  1. Click "Continue with Google"
  2. Electron redirects to Google OAuth
  3. Authorize scopes
  4. Electron redirects back
  5. Dashboard loads
  
- **Expected Result:**
  - New user account created (linked to Google ID)
  - OAuth token stored securely (NOT in renderer localStorage)
  - Session established
  - Dashboard accessible
  
- **Failure Criteria:**
  - OAuth token visible in DevTools console
  - Token stored in renderer localStorage
  
- **Evidence Required:**
  - Screenshot of Dashboard after OAuth
  - Supabase auth user record has google_uid provider
  - DevTools console shows NO token output

---

#### TEST-AUTH-004: Session Persistence (Restart App)
- **Priority:** P0
- **Subsystem:** Authentication / Session Management
- **Type:** Manual Electron/runtime
- **Hard Dependency:** TEST-AUTH-001 (existing session)
- **Prerequisites:**
  - User signed in
  - Dashboard visible
  
- **Steps:**
  1. Close PawOS Electron app
  2. Wait 2 seconds
  3. Reopen PawOS app
  
- **Expected Result:**
  - App loads without requiring re-authentication
  - Dashboard is immediately visible
  - Previous session state is preserved
  
- **Failure Criteria:**
  - Sign-in page appears
  - Session tokens lost
  
- **Evidence Required:**
  - Screenshot of Dashboard loading without sign-in
  - Electron main process logs show token loaded from secure storage

---

#### TEST-AUTH-005: Logout Flow
- **Priority:** P0
- **Subsystem:** Authentication / Session Management
- **Type:** Staging/E2E
- **Hard Dependency:** TEST-AUTH-001 (existing session)
- **Prerequisites:**
  - User signed in and on Dashboard
  
- **Steps:**
  1. Click user avatar / account menu
  2. Click "Logout" or "Sign Out"
  3. Confirm logout
  
- **Expected Result:**
  - Session token cleared from Electron secure storage
  - User redirected to sign-in page
  - Dashboard no longer accessible
  
- **Failure Criteria:**
  - Session token still in storage
  - User remains on Dashboard
  
- **Evidence Required:**
  - Screenshot of sign-in page after logout
  - Electron main process shows token cleared

---

### A.2 Billing & Tier Compute Basics (4 tests)

#### TEST-BILL-001: View Tier & Current Credit Balance
- **Priority:** P0
- **Subsystem:** Billing / Tier Compute
- **Type:** Staging/E2E
- **Hard Dependency:** TEST-AUTH-002 (authenticated Pro Max user)
- **Prerequisites:**
  - User on Pro Max tier
  - Dashboard open
  - Settings accessible
  
- **Steps:**
  1. Navigate to Settings → Billing
  2. Observe current tier display
  3. Observe current Tier Compute balance
  4. Verify balance matches Supabase `organization_credits.balance_tokens`
  
- **Expected Result:**
  - Tier correctly shown as "Pro Max"
  - Current Tier Compute balance displayed
  - Balance reflects actual database state
  
- **Evidence Required:**
  - Screenshot of Billing settings page
  - Query Supabase: `SELECT balance_tokens FROM organization_credits WHERE ...`

---

#### TEST-BILL-002: Monitor Real AI Usage Consumption (Meetings)
- **Priority:** P0
- **Subsystem:** Billing / Tier Compute
- **Type:** Live external-service (Gemini API) + Staging
- **Hard Dependency:** TEST-BILL-001 (baseline balance)
- **Prerequisites:**
  - User on Pro Max tier with >10000 Tier Compute tokens
  - Gemini API accessible
  - Audio file or meeting transcript available
  
- **Steps:**
  1. Record or upload meeting
  2. Note current Tier Compute balance
  3. Request meeting summarization
  4. Summarization completes
  5. Check Tier Compute balance immediately after
  6. Calculate tokens consumed = (balance before) - (balance after)
  
- **Expected Result:**
  - Balance decreased by reasonable amount
  - Tokens consumed is NOT zero
  - Billing event created in `organization_billing_events`
  - Event type: 'meeting_summarization'
  
- **Failure Criteria:**
  - Balance unchanged
  - Balance negative
  - No billing event created
  
- **Evidence Required:**
  - Screenshots: before/after balance
  - Meeting summary output
  - Supabase query: `SELECT * FROM organization_billing_events WHERE event_type = 'meeting_summarization' ORDER BY created_at DESC LIMIT 1`

---

#### TEST-BILL-003: Insufficient Balance Error (Exact Preflight Check)
- **Priority:** P0
- **Subsystem:** Billing / Tier Compute / Authorization
- **Type:** Automated integration + Database verification
- **Hard Dependency:** TEST-BILL-002 (established usage pattern)
- **Prerequisites:**
  - User on Pro Max tier with exactly 100 Tier Compute tokens balance
  - Meeting available that requires ~150 tokens
  
- **Steps:**
  1. Note balance = 100 tokens
  2. Attempt to summarize meeting requiring 150 tokens
  3. Observe error message
  4. Verify balance unchanged
  
- **Expected Result:**
  - Error message: "Insufficient Tier Compute balance"
  - Action not executed
  - Balance remains 100 tokens
  - No partial charge
  
- **Failure Criteria:**
  - Operation succeeds despite insufficient balance
  - Balance becomes negative
  - Action partially executes
  
- **Evidence Required:**
  - Screenshot of error message
  - Supabase balance query confirms unchanged
  - No billing event created for failed attempt

---

#### TEST-BILL-004: Top-Up Flow (Purchase Credits)
- **Priority:** P0
- **Subsystem:** Billing / Top-Up / Payment
- **Type:** Staging/E2E (Stripe test mode)
- **Hard Dependency:** None (independent balance operation)
- **Prerequisites:**
  - Billing page accessible
  - Stripe test mode enabled
  - Test credit card available (Stripe 4242 4242 4242 4242)
  
- **Steps:**
  1. Navigate to Settings → Billing → "Add Credits"
  2. Select top-up amount ($20 USD)
  3. Click "Proceed to Payment"
  4. Enter test card (4242 4242 4242 4242)
  5. Click "Pay"
  6. Confirmation shown
  7. Return to Billing page
  8. Verify balance increased
  
- **Expected Result:**
  - Stripe payment succeeded
  - Tier Compute balance increased by equivalent tokens
  - Transaction logged in `ticket_balance_topups`
  
- **Failure Criteria:**
  - Payment declined
  - Balance not updated
  - Amount calculation wrong
  
- **Evidence Required:**
  - Screenshot of "Payment successful" confirmation
  - Screenshot of updated balance
  - Supabase query shows new topup record

---

### A.3 Connector Setup (6 tests)

#### TEST-CONN-001: GitHub OAuth Connect
- **Priority:** P0
- **Subsystem:** Connectors / GitHub OAuth
- **Type:** Staging/E2E (live GitHub OAuth)
- **Hard Dependency:** TEST-BILL-004 (user with sufficient balance)
- **Prerequisites:**
  - GitHub OAuth app configured
  - Settings → Connections accessible
  
- **Steps:**
  1. Navigate to Settings → Connections → GitHub
  2. Click "Connect GitHub"
  3. Electron redirects to GitHub OAuth
  4. Authorize scopes
  5. Redirect back
  6. Connection shows "Connected"
  
- **Expected Result:**
  - GitHub OAuth token stored securely (NOT in renderer localStorage)
  - Token never visible in DevTools
  - User record shows github_username
  
- **Failure Criteria:**
  - OAuth token visible in console
  - Token stored in renderer localStorage
  
- **Evidence Required:**
  - Screenshot of connected status
  - DevTools console shows NO token output

---

#### TEST-CONN-002: Jira OAuth Connect
- **Priority:** P0
- **Subsystem:** Connectors / Jira OAuth
- **Type:** Staging/E2E (live Jira Cloud OAuth)
- **Hard Dependency:** TEST-BILL-004
- **Prerequisites:**
  - Jira Cloud workspace with OAuth app configured
  - Jira workspace domain available
  
- **Steps:**
  1. Navigate to Settings → Connections → Jira
  2. Click "Connect Jira"
  3. Enter Jira workspace domain
  4. OAuth flow completes
  5. Connection shows "Connected"
  
- **Expected Result:**
  - Jira OAuth token stored securely
  - Workspace domain saved
  
- **Evidence Required:**
  - Screenshot of connected status
  - Supabase shows jira_workspace_domain and jira_oauth_token stored

---

#### TEST-CONN-003: Linear API Key Connect
- **Priority:** P0
- **Subsystem:** Connectors / Linear API
- **Type:** Staging/E2E
- **Hard Dependency:** TEST-BILL-004
- **Prerequisites:**
  - Linear workspace with API key generated
  - Settings accessible
  
- **Steps:**
  1. Navigate to Settings → Connections → Linear
  2. Click "Connect Linear"
  3. Paste Linear API key
  4. Click "Verify & Connect"
  5. System verifies key by querying Linear API
  6. Connection shows "Connected"
  
- **Expected Result:**
  - API key validated before storing
  - Key stored securely
  - Invalid keys rejected with clear error
  
- **Evidence Required:**
  - Screenshot of connected status
  - Supabase shows linear_api_key stored

---

#### TEST-CONN-004: Slack OAuth Connect (Regression)
- **Priority:** P0
- **Subsystem:** Connectors / Slack OAuth
- **Type:** Staging/E2E
- **Status:** REGRESSION TEST — implementation frozen (bug-fixes only)
- **Hard Dependency:** TEST-BILL-004
- **Note:** Live Slack message delivery verification is separate (P1 or deferred)
- **Prerequisites:**
  - Slack OAuth app configured
  - Slack workspace available
  
- **Steps:**
  1. Navigate to Settings → Connections → Slack
  2. Click "Connect Slack"
  3. OAuth flow completes
  4. Connection shows "Connected"
  
- **Expected Result:**
  - Slack token stored securely
  - Connection verified
  
- **Evidence Required:**
  - Screenshot of connected status
  - No token in DevTools console

---

#### TEST-CONN-005: Gmail OAuth Connect (OPTIONAL)
- **Priority:** P1 (may be deferred)
- **Subsystem:** Connectors / Gmail OAuth
- **Type:** Staging/E2E
- **Hard Dependency:** TEST-BILL-004
- **Prerequisites:**
  - Google Cloud OAuth app with Gmail scope
  - Gmail account available
  
- **Evidence Required:**
  - Connection status screenshot

---

#### TEST-CONN-006: Google Calendar OAuth Connect (OPTIONAL)
- **Priority:** P1 (may be deferred)
- **Subsystem:** Connectors / Google Calendar OAuth
- **Type:** Staging/E2E
- **Hard Dependency:** TEST-BILL-004
- **Prerequisites:**
  - Google Cloud OAuth app with Calendar scope
  
- **Evidence Required:**
  - Connection status screenshot

---

### A.4 Autonomous Work — Architecture & Execution (10 tests)

#### TEST-AUTO-001: Start Autonomous Work (Entitlement Check)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Entitlement Gate
- **Type:** Staging/E2E
- **Hard Dependency:** TEST-BILL-004 (Pro Max user with Work PC balance)
- **Prerequisites:**
  - User on Pro Max tier
  - Autonomous Work tab visible
  - Sufficient Work PC balance (>5000)
  
- **Steps:**
  1. Navigate to Autonomous Work
  2. Click "Start Autonomous Task"
  3. Authorization modal appears
  4. Confirm authorization
  
- **Expected Result:**
  - Modal shows estimated Work PC cost
  - Tier verified via IPC entitlementIsFeatureAvailable
  - Task transitions to 'running' state
  
- **Evidence Required:**
  - Screenshot of authorization modal
  - Supabase: task row created with status='running'

---

#### TEST-AUTO-002: Executor Claiming (Phase 2C)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Executor Claiming
- **Type:** Manual inspection + Database verification
- **Hard Dependency:** TEST-AUTO-001 (running task)
- **Prerequisites:**
  - Autonomous task in 'running' state
  - Database accessible
  
- **Steps:**
  1. Trace AutonomousOrchestrator.ts execution
  2. Verify RPC called BEFORE authorization
  3. Verify server-generated executor_instance_id
  
- **Expected Result:**
  - RPC called at line 525-530 BEFORE createAuthorizedProvider
  - executorInstanceId extracted and passed to authorization
  - ID is server-generated UUID
  
- **Failure Criteria:**
  - RPC not called
  - RPC called after authorization
  - Client-generated UUID (blocker not fixed)
  
- **Evidence Required:**
  - Main process console logs show "[EXECUTOR_CLAIMED_SERVER_SIDE]"
  - Supabase query: autonomous_executor_claims shows server ID

---

#### TEST-AUTO-003: Model Identity Consistency (Phase 2B)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Model Selection
- **Type:** Manual inspection + Static/source verification
- **Hard Dependency:** TEST-AUTO-001
- **Prerequisites:**
  - Autonomous task in execution
  - AI router configured
  
- **Steps:**
  1. Capture model from aiRouter.getReasoningProvider().model
  2. Verify same model in token preflight
  3. Verify same model in authorization
  4. Verify same model in Gemini execution
  
- **Expected Result:**
  - Model consistent throughout
  - NOT hardcoded if aiRouter returns different model
  - Pricing uses same model
  
- **Evidence Required:**
  - Main process logs show consistent model value
  - Source inspection: AutonomousOrchestrator.ts lines 427, 560-563

---

#### TEST-AUTO-004: Exact Token Preflight (Phase 2D)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Token Preflight
- **Type:** Live external-service (Gemini API) + Manual inspection
- **Hard Dependency:** TEST-AUTO-001
- **Prerequisites:**
  - Gemini API key available
  - Task with ~1000 char prompt
  
- **Steps:**
  1. Trace token preflight (lines 206-286)
  2. Verify Gemini countTokens API called (NOT chars/4)
  3. Verify exact token count returned
  4. Verify no fallback to heuristic on error
  
- **Expected Result:**
  - Gemini countTokens() endpoint called
  - Exact token count used for authorization
  - Fail-closed if countTokens fails
  
- **Failure Criteria:**
  - chars/4 heuristic used
  - countTokens never called
  - Fallback on network error
  
- **Evidence Required:**
  - DevTools Network tab shows POST to generativelanguage.googleapis.com/v1beta/models/*/countTokens
  - Authorization amount matches returned token count

---

#### TEST-AUTO-005: Autonomous Authorization (Work PC Reservation)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Authorization
- **Type:** Automated integration + Database verification
- **Hard Dependency:** TEST-AUTO-001
- **Prerequisites:**
  - Autonomous task with Work PC authorization
  - Exact preflight completed
  - Supabase accessible
  
- **Steps:**
  1. Trace createAuthorizedProvider() wrapper
  2. Verify authorization RPC called
  3. Verify Work PC reservation created
  4. Verify balance check prevents insufficient authorization
  
- **Expected Result:**
  - Authorization RPC called before each turn
  - Reservation recorded with execution_executor_instance_id
  - Reservation window configurable (120+ seconds)
  - Balance check prevents authorization if insufficient
  
- **Failure Criteria:**
  - Authorization skipped
  - Reservation not created
  - Wrong billing concept used
  
- **Evidence Required:**
  - DevTools Network tab shows authorization RPC
  - Supabase: autonomous_reservation_requests rows exist
  - RPC response includes work_pc_required value

---

#### TEST-AUTO-006: Autonomous Execution (Runtime)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Execution
- **Type:** Staging/E2E + Manual Electron/runtime
- **Hard Dependency:** Tests 16-20 (architecture verified)
- **Prerequisites:**
  - Authorization succeeded
  - Real Gemini API accessible
  - Real or test GitHub repo with issue
  
- **Steps:**
  1. Execute autonomous task on GitHub issue
  2. Model reads issue, makes plan
  3. Applies code changes
  4. Runs tests/builds
  
- **Expected Result:**
  - Execution completes
  - ExecutionRecord captures all outputs
  - Verification results recorded
  
- **Failure Criteria:**
  - Execution hangs
  - Actions not recorded
  - Evidence missing
  
- **Evidence Required:**
  - Screenshot of final ExecutionRecord
  - Supabase: autonomous_task_runs status = 'completed'

---

#### TEST-AUTO-007: Failure States (Cancellation, Timeout, Error)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Error Handling
- **Type:** Staging/E2E + Manual Electron/runtime
- **Hard Dependency:** Tests 16-20
- **Prerequisites:**
  - Autonomous task in running state
  
- **Steps:**
  1. Test timeout (let run >5 min)
  2. Test cancellation (click stop button)
  3. Test model error (inject invalid action)
  
- **Expected Result:**
  - Timeout: Task marked 'timeout'
  - Cancellation: Task marked 'cancelled', no double-charge
  - Error: Task marked 'failed', error message shown
  
- **Failure Criteria:**
  - Task hangs (no timeout)
  - Cancel doesn't work
  - Charges applied despite cancellation
  
- **Evidence Required:**
  - Screenshots of error state
  - Supabase shows correct status
  - Billing: no settlement for failed runs

---

#### TEST-AUTO-008: Settlement (Work PC)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Settlement
- **Type:** Automated integration + Database verification
- **Hard Dependency:** TEST-AUTO-006 (completed task)
- **Prerequisites:**
  - Autonomous task completed
  - ExecutionRecord finalized
  
- **Steps:**
  1. Verify settlement RPC called
  2. Verify billing event created
  3. Verify Work PC balance deducted
  4. Verify settlement idempotent
  
- **Expected Result:**
  - Settlement RPC: settle_autonomous_task_run_pc() called (exact name)
  - Billing event created in organization_billing_events
  - Work PC balance decreased
  - Calling settlement twice returns same billing_event_id
  
- **Failure Criteria:**
  - Settlement never called
  - Wrong RPC name used
  - Double-charging on retry
  
- **Evidence Required:**
  - DevTools Network tab shows settle_autonomous_task_run_pc RPC
  - Supabase: organization_billing_events row exists
  - Work PC balance decreased correctly

---

#### TEST-AUTO-009: Waiting For Top-Up (Work PC Insufficient)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Insufficient Balance
- **Type:** Staging/E2E + Database verification
- **Hard Dependency:** TEST-AUTO-005 (authorization tested)
- **Prerequisites:**
  - User with low Work PC balance (<1000)
  - Autonomous task requiring ~5000 Work PC
  
- **Steps:**
  1. Start autonomous work
  2. Authorization fails (insufficient Work PC)
  3. Observe app state
  4. Add credits via top-up (TEST-BILL-004 pattern)
  5. Task resumes or retries
  
- **Expected Result:**
  - Task state transitions to 'waiting_for_topup'
  - Error message indicates Work PC insufficiency
  - After top-up, task resumes
  
- **Failure Criteria:**
  - Task state doesn't change
  - Error message vague
  - User must manually restart
  
- **Evidence Required:**
  - Supabase: task status = 'waiting_for_topup'
  - Work PC balance before/after top-up
  - Task resumes after top-up

---

### A.5 Connector Integration — Write-Back (6 tests)

#### TEST-JIRA-001: Read Jira Issues
- **Priority:** P0
- **Subsystem:** Jira Connector / Issue Reading
- **Type:** Live external-service (real Jira Cloud)
- **Hard Dependency:** TEST-CONN-002 (Jira OAuth connected)
- **Prerequisites:**
  - Jira OAuth connected
  - Jira workspace has issues
  
- **Steps:**
  1. Navigate to Work Stream or Jira section
  2. Browse Jira issues
  3. Click on issue to view details
  
- **Expected Result:**
  - Issues listed with title, key, status
  - Can view full details
  - OAuth token not exposed
  
- **Evidence Required:**
  - Screenshots of issue list and details

---

#### TEST-JIRA-002: Jira Comment + Status Transition (After Autonomous Work)
- **Priority:** P0
- **Subsystem:** Jira Connector / Write-Back (IMPLEMENTED)
- **Type:** Live external-service + Staging/E2E
- **Hard Dependency:** TEST-AUTO-008 (autonomous work completed)
- **Prerequisites:**
  - Jira OAuth connected
  - Autonomous work completed on Jira issue
  - Issue exists with "Done" transition available
  
- **Steps:**
  1. Complete autonomous work on Jira issue
  2. System attempts external update (comment + transition)
  3. Verify comment appears on real Jira issue
  4. Verify status changed to "Done"
  5. Refresh Jira in browser
  
- **Expected Result:**
  - Comment posted within 2 seconds
  - Comment body includes work reference
  - Status transitioned to "Done"
  - No 401/403 auth errors
  - OAuth Bearer token used correctly
  
- **Failure Criteria:**
  - Comment not posted
  - Status not transitioned
  - Auth errors
  
- **Evidence Required:**
  - Screenshot of Jira issue with comment AND Done status
  - DevTools Network tab shows POST /rest/api/3/issue/*/comments (HTTP 201)
  - Authorization headers show Bearer token

---

#### TEST-LINEAR-001: Read Linear Issues
- **Priority:** P0
- **Subsystem:** Linear Connector / Issue Reading
- **Type:** Live external-service (real Linear workspace)
- **Hard Dependency:** TEST-CONN-003 (Linear API key connected)
- **Prerequisites:**
  - Linear API key connected
  - Linear workspace has issues
  
- **Steps:**
  1. Browse Linear issues
  2. View issue details
  
- **Expected Result:**
  - Issues listed
  - Can view full details
  - API key not exposed
  
- **Evidence Required:**
  - Issue list screenshot

---

#### TEST-LINEAR-002: Linear Comment + Status Transition (After Autonomous Work)
- **Priority:** P0
- **Subsystem:** Linear Connector / Write-Back (IMPLEMENTED)
- **Type:** Live external-service + Staging/E2E
- **Hard Dependency:** TEST-AUTO-008
- **Prerequisites:**
  - Linear API key connected
  - Autonomous work completed on Linear issue
  - Issue in non-terminal state with "Done" available
  
- **Steps:**
  1. Complete work on Linear issue
  2. System attempts external update
  3. Refresh Linear
  
- **Expected Result:**
  - Comment posted via Linear GraphQL API
  - Status changed to "Done"
  - Comment visible in Linear UI
  - No API key exposed
  
- **Evidence Required:**
  - Screenshot of Linear issue with comment and Done status
  - DevTools Network shows GraphQL mutation

---

#### TEST-GITHUB-001: Read GitHub Issues & PRs
- **Priority:** P0
- **Subsystem:** GitHub Connector / Issue Reading
- **Type:** Live external-service (real GitHub)
- **Hard Dependency:** TEST-CONN-001 (GitHub OAuth connected)
- **Prerequisites:**
  - GitHub OAuth connected
  - User has repositories with issues/PRs
  
- **Steps:**
  1. Browse GitHub issues
  2. Browse PRs
  3. View details
  
- **Expected Result:**
  - Issues/PRs listed
  - Can filter and search
  - OAuth token not exposed
  
- **Evidence Required:**
  - List and detail screenshots

---

#### TEST-GITHUB-002: GitHub PR Comment (on Existing PR)
- **Priority:** P0
- **Subsystem:** GitHub Connector / PR Commenting
- **Type:** Live external-service (real GitHub)
- **Hard Dependency:** TEST-AUTO-008
- **Prerequisites:**
  - GitHub OAuth connected
  - PR exists in real GitHub repo (externally created)
  - Autonomous work completed
  
- **Steps:**
  1. Work completes
  2. Attempt to post comment on existing PR
  3. Refresh GitHub PR
  
- **Expected Result:**
  - Comment posted
  - Comment visible in PR
  
- **Failure Criteria:**
  - Comment not posted
  - 401/403 auth errors
  
- **Evidence Required:**
  - GitHub PR shows comment

---

### A.6 GitHub PR Creation (DORMANT — NOT TESTED)

**TEST-GITHUB-03: GitHub PR Creation (STUB IMPLEMENTATION)**
- **Status:** DORMANT — GitHub PR creation is a stub function that always returns failure
- **Location:** AutonomousOrchestrator.ts:1100-1158, line 1125: `createGitHubPR = async (opts: any) => ({ ok: false, reason: 'PR creation requires main process' });`
- **Launch Status:** NOT a launch requirement
- **Note:** Currently only GitHub PR commenting on externally-created PRs is functional
- **DO NOT TEST:** GitHub PR creation is not implemented and should not be included in launch gate

---

## PART B: P1 TESTS — IMPORTANT BEFORE LAUNCH (19 tests)

P1 tests verify important functionality. **Critical P1 categories (security, billing, autonomous accounting) require 100% pass. Non-critical P1 (performance, resilience) may have 90% pass rate with documented exceptions.**

### P1 Critical (100% required):
- RLS/data isolation (Tests 30-32)
- IPC boundary security (Test 33)

### P1 Non-Critical (90% acceptable):
- Advanced billing (Tests 22-24)
- Advanced autonomous (Tests 25-29)
- Performance/resilience (Tests 34-39)
- Integration (Tests 40-48)

[P1 Tests 22-40 detailed specs to follow in separate section...]

---

## PART C: P2 TESTS — POST-LAUNCH ACCEPTABLE (5 tests)

P2 tests can be deferred to post-launch phase. 100% deferrable.

---

## PART D: V2/DEFERRED FUNCTIONALITY (Not for Current Launch)

### Meeting Tests (Backend Only, No Renderer UI)
- **TEST-MEET-001:** Create/Upload Meeting — Backend only
- **TEST-MEET-002:** Request Meeting Summarization — Backend only
- **TEST-MEET-003:** Meeting Persistence & Retrieval — Backend only
- **Status:** Backend billing path verified; renderer UI consumer deferred to V2
- **Launch Impact:** Meetings NOT part of current launch
- **Do NOT test** these as P0 launch requirements

### GitHub PR Creation
- **Status:** Stub implementation only
- **Do NOT test:** Not functional

### Other V2 Items
- Meeting email distribution
- Teams connector
- WhatsApp/Telegram/Discord
- Avatar generation marketplace
- Mobile app/sync
- Jira/Linear ticket creation
- Advanced Jira/Linear status transitions

---

## LAUNCH GATE CRITERIA (CORRECTED)

### Mandatory (100% Pass Required)
✅ All 29 P0 tests (Tests 1-29)
✅ All P1 Critical tests (RLS, IPC, security: ~100%)
✅ Advertised launch connector live functionality (Jira/Linear comment + Done, GitHub read + comment)
✅ Autonomous authorization/reservation/settlement (zero accounting errors)
✅ Billing/accounting (zero double-charges, exact rates applied)

### Important (90% Pass Acceptable)
- P1 Non-Critical performance/resilience tests
- Advanced features already verified to work

### Post-Launch (100% Deferrable)
- All P2 tests
- All V2/deferred functionality

---

**Status:** V3 CORRECTED — READY FOR REVIEW

