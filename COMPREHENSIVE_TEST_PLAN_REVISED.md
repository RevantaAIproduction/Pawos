# COMPREHENSIVE TEST PLAN — PawOS Product (REVISED)

**Date:** 2026-09-09  
**Version:** 2 (Audited & Corrected)  
**Scope:** Complete currently-implemented product capabilities  
**Status:** READY FOR EXECUTION (pending approval)

---

## OVERVIEW

This test plan covers all currently-implemented capabilities in PawOS as of 2026-09-09, organized by priority (P0 mandatory before launch, P1 important before launch, P2 post-launch acceptable). Each test includes exact prerequisites, step-by-step procedures, expected results, and evidence requirements.

**Key Changes from V1:**
- Jira/Linear NOW include comment posting and "Done" status transitions (NOT read-only)
- GitHub PR creation moved to DORMANT (stub implementation, not functional)
- Billing terminology clarified: Tier Compute (normal AI usage) vs Work PC (autonomous execution)
- Evidence requirements updated for Electron desktop app (not browser-based)
- RLS verification split into source/schema/enforcement tiers
- Entitlement matrix added explicitly

**Intentionally Deferred / V2 / Dormant:**
- Meetings email distribution (deferred to V2)
- Teams connector (deferred to V2)
- WhatsApp/Telegram/Discord communication (deferred to V2)
- Avatar generation marketplace (deferred to V2)
- Mobile app and mobile sync (deferred to V2)
- Jira/Linear ticket creation/updates (deferred to V2)
- Jira/Linear advanced status transitions beyond "Done" (deferred to V2)
- GitHub PR creation (dormant/stub — not functional, requires main process implementation)

---

## PART A: P0 TESTS — MANDATORY BEFORE LAUNCH

P0 tests verify the absolute minimum viable product and must all pass before any production deployment.

---

### A.1 Authentication & Session Management

#### TEST-AUTH-001: Email/Password Sign Up (New User)
- **Priority:** P0
- **Subsystem:** Authentication / Supabase Auth
- **Type:** Staging/E2E (real Supabase + real OAuth providers)
- **Prerequisites:**
  - PawOS Electron desktop app running
  - Supabase project with email auth enabled
  - No existing account with test email (e.g., test-001-20260909@example.com)
  
- **Steps:**
  1. Click "Create Account" button on sign-in screen
  2. Enter new email (test-001-20260909@example.com)
  3. Enter password (minimum 8 chars, 1 uppercase, 1 number)
  4. Check email inbox for verification link
  5. Click verification link in email
  6. Electron app receives OAuth callback
  7. Dashboard is visible with empty project list
  
- **Expected Result:**
  - Account created in Supabase auth
  - User table entry created
  - Session established in Electron secure storage
  - Dashboard renders with onboarding or empty state
  
- **Failure Criteria:**
  - Verification email never arrives
  - Verification link doesn't work
  - Dashboard doesn't load after verification
  - Error messages don't appear for invalid passwords
  
- **Evidence Required:**
  - Screenshot of Dashboard after sign-up
  - Supabase Auth user record exists with correct email (query auth.users)
  - Electron secure storage contains valid auth tokens (check main process)
  - DevTools Network tab shows successful OAuth callback
  
- **Regression Tests:**
  - Existing user cannot sign up with same email (error expected)
  - Session persists across app restart
  - Logout works correctly

---

#### TEST-AUTH-002: Email/Password Sign In (Existing User)
- **Priority:** P0
- **Subsystem:** Authentication / Supabase Auth
- **Type:** Staging/E2E
- **Prerequisites:**
  - Verified account already exists (test-existing@example.com)
  - App is at sign-in screen
  
- **Steps:**
  1. Enter email (test-existing@example.com)
  2. Enter correct password
  3. Click "Sign In"
  4. Dashboard loads
  5. User info visible in account menu (Settings)
  
- **Expected Result:**
  - Auth token obtained from Supabase
  - Session established in Electron secure storage
  - Dashboard renders
  - User email shown in account menu
  
- **Failure Criteria:**
  - Wrong password accepted
  - Correct password rejected
  - Session not established
  - Dashboard doesn't load
  
- **Evidence Required:**
  - Screenshot of Dashboard
  - DevTools Network tab shows auth token in Supabase response (Authorization header)
  - Electron secure storage contains valid session token (main process check)
  - Account menu shows correct email
  
- **Regression Tests:**
  - Invalid password produces error message
  - Case-sensitive email handling works
  - Multiple sign-in attempts with wrong password don't lock account

---

#### TEST-AUTH-003: Google OAuth Flow (Sign Up)
- **Priority:** P0
- **Subsystem:** Authentication / OAuth / Google
- **Type:** Staging/E2E (live Google OAuth)
- **Prerequisites:**
  - Google Cloud OAuth app configured (client ID, client secret, redirect URI)
  - Google Cloud app credential available in PawOS settings
  - Test Google account available (test-pawos-user@gmail.com)
  - Sign-up page visible
  
- **Steps:**
  1. Click "Continue with Google" on sign-up page
  2. Browser/Electron redirects to Google OAuth consent screen
  3. Consent to "Sign in with your Google Account"
  4. Select test account (test-pawos-user@gmail.com)
  5. Grant requested OAuth scopes (email, profile)
  6. Electron app receives OAuth callback
  7. Dashboard loads
  8. Account menu shows Google email
  
- **Expected Result:**
  - New user account created (linked to Google ID)
  - OAuth token stored securely (in Electron secure storage, NOT in renderer localStorage)
  - Session established
  - Dashboard accessible
  
- **Failure Criteria:**
  - OAuth token visible in DevTools console
  - Token stored in renderer localStorage (security violation)
  - Redirect URI mismatch error
  - User not created in user table
  
- **Evidence Required:**
  - Screenshot of Dashboard after OAuth
  - Supabase auth user record has google_uid provider (query auth.users)
  - DevTools console shows NO token output
  - Main process secure storage contains token (not renderer)
  
- **Regression Tests:**
  - Signing up with Google then signing in with email works
  - Revoking Google consent disables future sign-ins via Google
  - OAuth token refresh on expiry (if applicable)

---

#### TEST-AUTH-004: Session Persistence (Restart App)
- **Priority:** P0
- **Subsystem:** Authentication / Session Management
- **Type:** Manual Electron/runtime
- **Prerequisites:**
  - User signed in
  - Dashboard visible
  
- **Steps:**
  1. Close PawOS desktop app completely
  2. Wait 2 seconds
  3. Reopen PawOS app
  4. Observe app startup sequence
  
- **Expected Result:**
  - App loads without requiring re-authentication
  - Dashboard is immediately visible
  - Previous session state is preserved
  
- **Failure Criteria:**
  - Sign-in page appears instead of Dashboard
  - Session tokens lost
  - Previous state not restored
  
- **Evidence Required:**
  - Screenshot of Dashboard loading without sign-in
  - Main process logs show token loaded from secure storage
  - No sign-in API calls in DevTools Network tab
  
- **Regression Tests:**
  - Logout clears session (next restart goes to sign-in)
  - Token expiry triggers re-authentication

---

#### TEST-AUTH-005: Logout Flow
- **Priority:** P0
- **Subsystem:** Authentication / Session Management
- **Type:** Integration
- **Prerequisites:**
  - User signed in and on Dashboard
  
- **Steps:**
  1. Click user avatar / account menu
  2. Click "Logout" or "Sign Out"
  3. Confirm logout (if confirmation modal appears)
  4. Observe page state
  
- **Expected Result:**
  - Session token cleared from Electron secure storage
  - User redirected to sign-in page
  - Dashboard no longer accessible
  - Subsequent restart shows sign-in
  
- **Failure Criteria:**
  - Session token still in storage
  - User remains on Dashboard
  - Can still access protected routes
  
- **Evidence Required:**
  - Screenshot of sign-in page after logout
  - Main process secure storage shows token cleared
  - DevTools Network tab shows logout API call succeeded
  
- **Regression Tests:**
  - Accessing Dashboard URL directly after logout redirects to sign-in
  - Can sign in with different account after logout

---

### A.2 Billing & Tier Compute Basics

#### TEST-BILL-001: View Tier & Current Credit Balance
- **Priority:** P0
- **Subsystem:** Billing / Tier Compute / Credit Display
- **Type:** Integration
- **Prerequisites:**
  - User on Pro Max tier (confirmed in Supabase)
  - Dashboard open
  - Settings accessible
  
- **Steps:**
  1. Navigate to Settings → Billing
  2. Observe current tier display
  3. Observe current Tier Compute balance (in tokens or equivalent)
  4. Verify balance matches Supabase `organization_credits.balance_tokens`
  
- **Expected Result:**
  - Tier correctly shown as "Pro Max" or equivalent
  - Current Tier Compute balance displayed in consistent units
  - Balance is not hardcoded; reflects actual database state
  - Last update timestamp is recent
  
- **Failure Criteria:**
  - Wrong tier displayed
  - Balance shows as 0 when user has credits
  - Balance is stale (more than 5 minutes old)
  - Cannot access Billing settings
  
- **Evidence Required:**
  - Screenshot of Billing settings page
  - Screenshot of Settings → Account showing current tier
  - Query Supabase: `SELECT balance_tokens FROM organization_credits WHERE ...` verify matches UI
  - DevTools Network tab shows successful API call to fetch balance
  
- **Regression Tests:**
  - Balance updates after AI usage (meetings, conversations)
  - Switching between Go/Pro/Pro Max shows correct limits
  - Free tier user sees correct messaging (e.g., "200 tokens/month included")

---

#### TEST-BILL-002: Monitor Real AI Usage Consumption (Meetings)
- **Priority:** P0
- **Subsystem:** Billing / Tier Compute / Meeting Summarization
- **Type:** Integration + Live External Service (Gemini API)
- **Prerequisites:**
  - User on Pro Max tier with >10000 Tier Compute tokens balance
  - Meeting capability enabled
  - Audio file or meeting transcript available
  
- **Steps:**
  1. Record or upload a meeting (or provide meeting transcript)
  2. Note current Tier Compute balance (e.g., 15000 tokens)
  3. Request meeting summarization
  4. Summarization completes
  5. Check Tier Compute balance immediately after
  6. Calculate tokens consumed = (balance before) - (balance after)
  
- **Expected Result:**
  - Balance decreased by reasonable amount (e.g., 50-500 tokens for 5-minute meeting)
  - Tokens consumed is NOT zero
  - Tokens consumed matches estimated input + output tokens from Gemini response
  - Billing event recorded in `organization_billing_events` with event_type = 'meeting_summarization'
  - Note: Meeting summarization uses **Tier Compute (tokens)**, NOT Work PC
  
- **Failure Criteria:**
  - Balance unchanged after summarization
  - Balance negative (over-consumption not detected)
  - Tokens consumed wildly off from actual usage (e.g., 1000x expected)
  - No billing event created
  
- **Evidence Required:**
  - Screenshots: before/after balance
  - Meeting summary output
  - Supabase query: `SELECT * FROM organization_billing_events WHERE event_type = 'meeting_summarization' ORDER BY created_at DESC LIMIT 1`
  - DevTools Network tab shows Gemini countTokens API calls
  
- **Regression Tests:**
  - Multiple summarizations accumulate usage correctly
  - Different meeting lengths consume proportional tokens
  - Gemini API errors don't silently consume credits

---

#### TEST-BILL-003: Insufficient Balance Error (Exact Preflight Check)
- **Priority:** P0
- **Subsystem:** Billing / Tier Compute / Authorization
- **Type:** Integration + Unit (preflight check)
- **Prerequisites:**
  - User on Pro Max tier with exactly 100 Tier Compute tokens balance
  - Meeting available that requires ~150 tokens
  - System can control available tokens if needed
  
- **Steps:**
  1. Note balance = 100 tokens
  2. Attempt to summarize a meeting estimated at 150 tokens
  3. Observe error message
  4. Verify balance unchanged
  
- **Expected Result:**
  - Error message: "Insufficient Tier Compute balance" (or similar)
  - Action not executed
  - Balance remains 100 tokens
  - No partial charge
  - Exact token count from Gemini countTokens() used (not heuristic chars/4)
  
- **Failure Criteria:**
  - Operation succeeds despite insufficient balance
  - Balance becomes negative
  - Action partially executes
  - Vague error message
  - Heuristic estimate (chars/4) used instead of exact countTokens
  
- **Evidence Required:**
  - Screenshot of error message
  - Supabase balance query confirms unchanged
  - DevTools Network tab shows:
    - Gemini countTokens() API call successful
    - meetingHandler never calls creditStore.consume()
  - Main process logs show exact token count was retrieved
  
- **Regression Tests:**
  - Balance just above required amount allows operation
  - Zero balance produces error
  - Negative balance cannot occur in any scenario

---

#### TEST-BILL-004: Top-Up Flow (Purchase Credits)
- **Priority:** P0
- **Subsystem:** Billing / Top-Up / Payment
- **Type:** Staging/E2E (Stripe integration, can use test card)
- **Prerequisites:**
  - Billing page accessible
  - Stripe test mode enabled
  - Test credit card available (Stripe 4242 4242 4242 4242)
  
- **Steps:**
  1. Navigate to Settings → Billing → "Add Credits"
  2. Select top-up amount (e.g., $20 USD)
  3. Click "Proceed to Payment"
  4. Enter test card (4242 4242 4242 4242, future expiry, CVC 123)
  5. Click "Pay"
  6. Confirmation shown
  7. Return to Billing page
  8. Verify balance increased
  
- **Expected Result:**
  - Stripe payment succeeded
  - Tier Compute balance increased by equivalent tokens (e.g., 20000 tokens for $20)
  - Transaction logged in `ticket_balance_topups` (note: "ticket" is legacy naming for Tier Compute)
  - Receipt available (if email configured)
  
- **Failure Criteria:**
  - Payment declined
  - Balance not updated after successful payment
  - Amount calculation wrong
  - Payment page times out
  
- **Evidence Required:**
  - Screenshot of "Payment successful" confirmation
  - Screenshot of updated balance
  - Supabase: `SELECT * FROM ticket_balance_topups WHERE user_id = ... ORDER BY topped_up_at DESC LIMIT 1`
  - Stripe dashboard shows transaction (in test mode)
  
- **Regression Tests:**
  - Cancelled payment doesn't charge
  - Multiple top-ups accumulate correctly
  - Free tier user cannot access top-up (error expected)

---

### A.3 Autonomous Work — Core Execution Flow

#### TEST-AUTO-001: Start Autonomous Work (Entitlement Check)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Entitlement Gate
- **Type:** Integration
- **Prerequisites:**
  - User on Pro Max tier (confirmed in Supabase)
  - Autonomous Work tab/button visible
  - Sufficient Work PC balance (>5000 Work PC)
  
- **Entitlement Matrix (Canonical):**
  - Go tier: NO autonomous work
  - Pro tier (individual): NO autonomous work
  - Pro Max tier (individual): YES
  - Pro (organization): NO autonomous work
  - Pro Max (organization): YES
  - Team (organization): YES
  - Enterprise (organization): YES
  
- **Steps:**
  1. Navigate to Work Stream or Autonomous Work tab
  2. Click "Start Autonomous Task" or equivalent
  3. Authorization modal appears (shows estimated Work PC cost)
  4. Confirm authorization
  5. Task starts
  
- **Expected Result:**
  - Modal correctly shows estimated Work PC cost
  - Tier verified via IPC entitlementIsFeatureAvailable('autonomousTaskBilling')
  - Authorization check confirms user can run autonomous work
  - Task transitions to 'running' state
  
- **Failure Criteria:**
  - Modal shows wrong cost
  - Go/Pro user allowed to start (should see tier upgrade error)
  - Authorization check skipped
  - Task starts in wrong state
  
- **Evidence Required:**
  - Screenshot of authorization modal
  - DevTools console shows entitlementIsFeatureAvailable call succeeds
  - Supabase: task row created with status='running'
  - Main process logs show authorization confirmed
  
- **Regression Tests:**
  - Go tier user sees "Upgrade to Pro Max" error instead of starting
  - Pro tier user sees "Upgrade to Pro Max" error
  - Pro Max user can always start (if balance sufficient)

---

#### TEST-AUTO-002: Executor Claiming (Server-Authoritative, Phase 2C)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Executor Authorization / Phase 2C
- **Type:** Unit + Integration
- **Prerequisites:**
  - Autonomous task in 'running' state
  - Database accessible
  
- **Steps:**
  1. Trace AutonomousOrchestrator.ts execution
  2. Verify claim_autonomous_executor_for_run RPC called BEFORE authorization
  3. Verify returned execution_executor_instance_id is server-generated (not client crypto.randomUUID)
  4. Verify executor ID passed to authorization
  
- **Expected Result:**
  - RPC called at line 525-530 (BEFORE createAuthorizedProvider at line 561)
  - Server-side generation confirmed: `gen_random_uuid()` in migration SQL
  - executorInstanceId extracted from claimData.execution_executor_instance_id
  - ID is 36-char UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  - Same executor_instance_id reused if claim called again (idempotent)
  
- **Failure Criteria:**
  - RPC not called
  - RPC called AFTER authorization
  - Executor ID is client-generated UUID (indicates blocker still present)
  - Server claim fails with error
  
- **Evidence Required:**
  - Main process console logs show "[EXECUTOR_CLAIMED_SERVER_SIDE]" message
  - DevTools Network tab shows RPC call to claim_autonomous_executor_for_run
  - RPC response includes execution_executor_instance_id field
  - Supabase: `SELECT * FROM autonomous_executor_claims WHERE run_id = ... LIMIT 1` shows server-generated ID
  
- **Regression Tests:**
  - Resume-after-topup also uses server claim (consistent)
  - Duplicate claims return same executor_instance_id (idempotent)
  - Claim fails gracefully if run_id invalid

---

#### TEST-AUTO-003: Model Identity Consistency (Authorization ↔ Execution)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Model Selection / Phase 2B
- **Type:** Unit + Integration
- **Prerequisites:**
  - Autonomous task in execution phase
  - AI router configured with specific model
  
- **Steps:**
  1. Capture model from `aiRouter.getReasoningProvider().model`
  2. Verify same model used in token preflight (countTokens API)
  3. Verify same model passed to createAuthorizedProvider
  4. Verify same model used in final Gemini API call
  
- **Expected Result:**
  - Model is consistent throughout (e.g., 'gemini-flash-latest')
  - NOT hardcoded as 'gemini-flash-latest' if aiRouter returns different model
  - Pricing calculation uses SAME model
  - Execution uses SAME model
  - Authorization and actual call cannot diverge
  
- **Failure Criteria:**
  - Model changes between authorization and execution
  - Different models used for pricing vs. execution
  - Hardcoded model overrides aiRouter model
  - Model is undefined/null
  
- **Evidence Required:**
  - Main process console logs show model at authorization
  - DevTools Network tab: Gemini countTokens call uses same model as Gemini streamResponse
  - Code inspection: AutonomousOrchestrator.ts lines 427, 560-563 use baseProvider.model
  
- **Regression Tests:**
  - Switching models in aiRouter config affects all runs
  - Model is persisted in authorization record (for audit trail)

---

#### TEST-AUTO-004: Exact Token Preflight (Gemini countTokens API, Phase 2D)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Token Authorization / Exact Preflight
- **Type:** Unit + Integration + Live External Service
- **Prerequisites:**
  - Autonomous task in execution with known input text size
  - Gemini API key available
  
- **Steps:**
  1. Prepare task with ~1000 character input prompt
  2. Trace token preflight (AutonomousOrchestrator.ts lines 206-286, Phase 2D)
  3. Verify Gemini countTokens API called (NOT chars/4 heuristic)
  4. Verify exact token count returned
  5. Verify authorization uses this exact count
  6. Verify no fallback to heuristic on API error (fail-closed)
  
- **Expected Result:**
  - Gemini countTokens() endpoint called: `https://generativelanguage.googleapis.com/v1beta/models/{model}:countTokens`
  - Request includes exact prompt/messages being used
  - Response includes `totalTokens` field
  - Authorization uses exact count (not estimate)
  - If countTokens fails, task aborts (fail-closed), not fallback to heuristic
  
- **Failure Criteria:**
  - chars/4 heuristic still used
  - countTokens API never called
  - countTokens API called but result ignored
  - Heuristic fallback on network error (should fail instead)
  - Token count wildly different from actual usage
  
- **Evidence Required:**
  - DevTools Network tab shows POST to generativelanguage.googleapis.com/v1beta/models/*/countTokens
  - Request body includes conversation content
  - Response contains totalTokens value
  - Main process console shows token preflight completion
  - Authorization amount matches returned token count (not chars/4)
  
- **Regression Tests:**
  - countTokens called before each turn (not just initial)
  - countTokens error produces meaningful error message
  - countTokens latency acceptable (<1 second)

---

#### TEST-AUTO-005: Autonomous Authorization (Work PC Reservation Check)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Authorization / Work PC Reservation
- **Type:** Integration + Database
- **Prerequisites:**
  - Autonomous task with Work PC authorization
  - Exact preflight completed
  - Supabase accessible
  - Note: **Work PC is different from Tier Compute tokens. Work PC is used for autonomous execution only.**
  
- **Steps:**
  1. Trace createAuthorizedProvider() wrapper
  2. Verify authorization RPC called before each turn
  3. Check reservation is created/extended in `autonomous_reservation_requests`
  4. Verify reservation amount = exact Work PC needed (based on token count converted to Work PC)
  5. Verify reservation duration (e.g., 120 seconds)
  6. Verify balance check prevents authorization if insufficient Work PC
  
- **Expected Result:**
  - Authorization RPC: `authorize_model_request()` called
  - Reservation recorded with execution_executor_instance_id
  - Reservation window is configurable (120+ seconds typical)
  - Idempotency tracked by `auth_request_id` (different for each turn)
  - Authorization failure returns structured error (ok: false, reason: string)
  - **Charging based on Work PC, not Tier Compute tokens**
  
- **Failure Criteria:**
  - Authorization skipped
  - Reservation not created
  - Authorization amount wrong
  - No idempotency tracking
  - Error messages vague
  - Wrong billing concept used
  
- **Evidence Required:**
  - DevTools Network tab shows authorization RPC call
  - RPC response includes ok: true, work_pc_required: number, available_balance: number
  - Supabase: `SELECT * FROM autonomous_reservation_requests WHERE run_id = ...` shows reservation rows
  - Timestamps show reservation created before execution
  
- **Regression Tests:**
  - Multiple authorization calls (multiple turns) each create separate reservations
  - Authorization fails gracefully if balance insufficient
  - Authorization succeeds if (balance - reserved) >= required_work_pc

---

#### TEST-AUTO-006: Autonomous Execution (Conversation Runtime)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Execution / Headless Conversation Runtime
- **Type:** Integration + Unit
- **Prerequisites:**
  - Authorization succeeded
  - Real Gemini API accessible (or stubbed)
  
- **Steps:**
  1. Task description (prompt) fed to ConversationRuntime instance
  2. Runtime processes actions and generates new turns
  3. Model requests tools (e.g., executeAction for file operations)
  4. IPC handler routes to DesktopExecutionEngine
  5. Actions execute (or wait for permission)
  6. Evidence recorded in ExecutionRecord
  7. ConversationRuntime reaches completion state
  
- **Expected Result:**
  - Execution completes without hanging
  - All model outputs recorded
  - Actions show in ExecutionRecord
  - Verification results captured (build/test/typecheck/lint)
  - Settlement can proceed with actual execution evidence
  
- **Failure Criteria:**
  - Execution hangs indefinitely
  - Actions not recorded
  - Evidence missing or malformed
  - Completion state not reached
  - Model error messages not captured
  
- **Evidence Required:**
  - Screenshot of final ExecutionRecord
  - ExecutionRecord JSON shows all actions, outputs, verification results
  - Main process console shows completion message
  - Supabase: autonomous_task_runs row shows status = 'completed' or 'waiting_for_permission'
  
- **Regression Tests:**
  - Execution respects execution mode (acceptEdits vs manual)
  - Pro Max gets acceptEdits mode (no permission prompts)
  - Pro user gets manual mode (permission required for writes)

---

#### TEST-AUTO-007: Autonomous Failure States (Cancellation, Errors)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Error Handling / State Transitions
- **Type:** Integration
- **Prerequisites:**
  - Autonomous task in running state
  
- **Steps:**
  1. **Scenario A (Timeout):** Let task run >5 min without completing
  2. **Scenario B (User Cancel):** Click cancel/stop button during execution
  3. **Scenario C (Model Error):** Inject invalid action that fails
  4. Observe error handling and state transition
  
- **Expected Result:**
  - Scenario A: Task marked as 'timeout' or 'retry_limit_reached'
  - Scenario B: Task marked as 'cancelled', no charges (reservation returned)
  - Scenario C: Task marked as 'failed' with error message, partial charges only
  - Latest ExecutionRecord shows failure reason
  - User notified with clear message
  
- **Failure Criteria:**
  - Task hangs (no timeout)
  - Cancel button doesn't work
  - Task still marked as 'completed' despite error
  - No error message shown to user
  - Charges applied despite cancellation
  
- **Evidence Required:**
  - Screenshots of error/cancelled state
  - Supabase: autonomous_task_runs.status = 'cancelled'/'failed'/'timeout'
  - ExecutionRecord shows completion_source and error details
  - Billing: settlement not called for failed runs
  
- **Regression Tests:**
  - Different failure modes produce correct state
  - User can retry after cancellation
  - Timeout value is configurable

---

### A.4 Autonomous Settlement & Work PC Billing

#### TEST-AUTO-008: Settlement (Actual Work PC from Usage Events)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Settlement / Billing
- **Type:** Integration + Database
- **Prerequisites:**
  - Autonomous task completed successfully
  - ExecutionRecord finalized with actual token usage
  - **Settlement uses Work PC, NOT Tier Compute tokens**
  
- **Steps:**
  1. Task execution finishes
  2. Main process calculates actual Work PC from usage events
  3. Settlement RPC called: `settle_autonomous_task_run_pc(run_id, actual_pc)`
  4. Verify settlement creates billing event
  5. Verify Work PC balance deducted from available balance
  6. Verify settlement is idempotent (calling twice doesn't double-charge)
  
- **Expected Result:**
  - Settlement RPC: `settle_autonomous_task_run_pc()` called (exact name verified from source)
  - Billing event created in organization_billing_events
  - Work PC balance decreased by (actual_pc value)
  - BillingEvent.status = 'settled'
  - Calling settlement twice returns same billing_event_id
  
- **Failure Criteria:**
  - Settlement never called
  - Settlement called with wrong actual_pc value
  - Double-charging on retry
  - Balance not updated
  - Idempotency broken
  - Using wrong billing concept (Tier Compute instead of Work PC)
  
- **Evidence Required:**
  - DevTools Network tab shows settlement RPC call to settle_autonomous_task_run_pc
  - RPC response includes billing_event_id
  - Supabase: `SELECT * FROM organization_billing_events WHERE run_id = ...` shows entry
  - Work PC balance query shows decrease matching expected cost
  - Second settlement call returns same billing_event_id
  
- **Regression Tests:**
  - Different actual_pc values settle correctly
  - Insufficient balance at settlement time fails gracefully
  - Settlement respects volume-tiered pricing

---

#### TEST-AUTO-009: Waiting For Top-Up State (Work PC Insufficient)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Insufficient Balance / Resume
- **Type:** Integration
- **Prerequisites:**
  - User with low Work PC balance (<1000 Work PC)
  - Autonomous task that requires ~5000 Work PC
  - **Note: "Work PC" is the unit for autonomous execution, distinct from Tier Compute tokens**
  
- **Steps:**
  1. Start autonomous work
  2. Authorization fails (insufficient Work PC balance)
  3. Observe app behavior (error message or waiting state)
  4. User navigates to Billing and adds credits (via top-up)
  5. Credits converted to Work PC
  6. Task resumes or retries automatically
  
- **Expected Result:**
  - Task state transitions to 'waiting_for_topup'
  - Error message clearly indicates Work PC insufficiency
  - User directed to top-up in Billing
  - After top-up completes, Work PC increases
  - Task resumes without manual restart (if UI implements auto-resume)
  
- **Failure Criteria:**
  - Task state doesn't change to waiting_for_topup
  - Error message vague or missing
  - User must manually restart task
  - Task resumes before top-up completes
  - Balance not reflected as Work PC
  
- **Evidence Required:**
  - Error message screenshot
  - Task state in Supabase is 'waiting_for_topup'
  - Work PC balance before/after top-up
  - Task state after top-up (if auto-resume implemented: status='running')
  
- **Regression Tests:**
  - Different required Work PC amounts calculate correctly
  - Partial top-up still shows waiting state
  - Full top-up triggers resume

---

### A.5 Connector Integration — Currently Implemented

#### TEST-CONN-001: GitHub OAuth Connect
- **Priority:** P0
- **Subsystem:** Connectors / GitHub OAuth
- **Type:** Staging/E2E (live GitHub OAuth)
- **Prerequisites:**
  - GitHub OAuth app configured
  - Settings → Connections accessible
  - GitHub account (test-pawos-github@github.com) available
  
- **Steps:**
  1. Navigate to Settings → Connections → GitHub
  2. Click "Connect GitHub"
  3. Electron redirects to GitHub OAuth
  4. Authorize scopes (repo, read:org, etc.)
  5. Electron redirects back
  6. Connection status shows "Connected"
  7. GitHub username/avatar displayed
  
- **Expected Result:**
  - GitHub OAuth token stored securely (in secure storage, NOT renderer localStorage)
  - Token never visible in DevTools console
  - User record shows github_username
  - Can now use GitHub for autonomous work
  
- **Failure Criteria:**
  - OAuth token visible in console/logs
  - Token stored in renderer localStorage (security violation)
  - Redirect URI mismatch
  - Connection status says "Not connected" after auth
  
- **Evidence Required:**
  - Screenshot of connected status
  - DevTools console: no token output
  - Main process secure storage contains token (not renderer)
  - Supabase: user has github provider linked
  
- **Regression Tests:**
  - Disconnect removes GitHub credentials
  - Reconnecting replaces old token
  - Multiple GitHub accounts can be tested sequentially

---

#### TEST-CONN-002: Jira OAuth Connect
- **Priority:** P0
- **Subsystem:** Connectors / Jira OAuth
- **Type:** Staging/E2E (live Jira Cloud + OAuth)
- **Prerequisites:**
  - Jira Cloud workspace with OAuth app configured
  - Jira OAuth credentials (client ID, secret)
  - Jira workspace domain (*.atlassian.net)
  
- **Steps:**
  1. Navigate to Settings → Connections → Jira
  2. Click "Connect Jira"
  3. Enter Jira workspace domain
  4. Electron redirects to Jira OAuth
  5. Authorize requested scopes (read:jira-work, etc.)
  6. Redirect back to PawOS
  7. Connection shows "Connected"
  
- **Expected Result:**
  - Jira OAuth token stored securely
  - Workspace domain saved
  - Can query Jira issues later
  - Can post comments and transition status (see tests below)
  
- **Failure Criteria:**
  - OAuth fails with "Invalid grant"
  - Token exposed in logs
  - Workspace domain not saved
  
- **Evidence Required:**
  - Screenshot of connected status
  - Supabase: jira_workspace_domain, jira_oauth_token stored
  - Main process: token not exposed
  
- **Regression Tests:**
  - Multiple Jira workspaces can be connected (if supported)
  - Disconnect removes credentials

---

#### TEST-CONN-003: Linear API Key Connect
- **Priority:** P0
- **Subsystem:** Connectors / Linear API
- **Type:** Integration
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
  - Key stored securely (encrypted at rest or in secure storage)
  - Can query Linear issues later
  - Can post comments and transition status (see tests below)
  - Invalid keys rejected with clear error
  
- **Failure Criteria:**
  - Invalid key accepted
  - Key stored in plaintext
  - No validation performed
  
- **Evidence Required:**
  - Screenshot of connected status
  - Successful API call to Linear in DevTools
  - Supabase: linear_api_key stored (encrypted)
  
- **Regression Tests:**
  - Expired key shows "Invalid credentials" when used
  - Disconnect removes key

---

#### TEST-CONN-004: Slack OAuth Connect
- **Priority:** P0 (Frozen - communication runtime frozen, bug-fixes only)
- **Subsystem:** Connectors / Slack OAuth
- **Type:** Staging/E2E
- **Status:** FROZEN — only regression tests on existing functionality
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
  - Connection status screenshot
  - No token in console logs
  
- **Regression Tests:**
  - Frozen implementation — run only regression tests on existing functionality
  - No new Slack features to test

---

#### TEST-CONN-005: Gmail OAuth Connect
- **Priority:** P1 (May be deferred)
- **Subsystem:** Connectors / Gmail OAuth
- **Type:** Staging/E2E
- **Prerequisites:**
  - Google Cloud OAuth app with Gmail scope
  - Gmail account available
  
- **Steps:**
  1. Navigate to Settings → Connections → Gmail
  2. Click "Connect Gmail"
  3. OAuth flow with Google
  4. Grant Gmail read/send scope
  5. Connection shows "Connected"
  
- **Expected Result:**
  - Gmail OAuth token stored securely
  - Scope validation confirms email access
  
- **Evidence Required:**
  - Connection status
  - Supabase shows gmail_oauth_token
  
- **Regression Tests:**
  - Token refresh on expiry works

---

#### TEST-CONN-006: Google Calendar OAuth Connect
- **Priority:** P1 (May be deferred)
- **Subsystem:** Connectors / Google Calendar OAuth
- **Type:** Staging/E2E
- **Prerequisites:**
  - Google Cloud OAuth app with Calendar scope
  
- **Steps:**
  1. Settings → Connections → Google Calendar
  2. OAuth flow
  3. Grant Calendar read scope
  
- **Expected Result:**
  - Calendar token stored
  - Can query user's calendar later
  
- **Evidence Required:**
  - Connection status screenshot
  
- **Regression Tests:**
  - Token refresh works

---

### A.6 Meetings & Summarization

#### TEST-MEET-001: Create/Upload Meeting
- **Priority:** P0
- **Subsystem:** Meetings / Meeting Creation
- **Type:** Integration
- **Prerequisites:**
  - User on Pro Max tier
  - Audio file or transcript available
  
- **Steps:**
  1. Navigate to Meetings section
  2. Click "New Meeting" or upload file
  3. Select audio file or paste transcript
  4. Enter meeting title (optional)
  5. Click "Create"
  6. Meeting appears in list
  
- **Expected Result:**
  - Meeting record created
  - Audio/transcript persisted
  - Meeting shows in Meetings list
  - Can be summarized later
  
- **Failure Criteria:**
  - Upload fails
  - Meeting not saved
  - Meeting doesn't appear in list
  
- **Evidence Required:**
  - Screenshot of Meetings list with new meeting
  - Supabase: meeting record exists
  
- **Regression Tests:**
  - Different audio formats supported
  - Large files handled correctly

---

#### TEST-MEET-002: Request Meeting Summarization
- **Priority:** P0
- **Subsystem:** Meetings / Summarization
- **Type:** Integration + Live External Service (Gemini API)
- **Prerequisites:**
  - Meeting created and persisted
  - Tier Compute balance >2000 tokens
  - **Note: Meeting summarization uses Tier Compute tokens, NOT Work PC**
  
- **Steps:**
  1. Open meeting
  2. Click "Summarize" button
  3. Summarization request sent
  4. Observe processing state
  5. Summary appears once complete
  6. Verify Tier Compute balance decremented
  
- **Expected Result:**
  - Gemini API called with audio/transcript
  - Summary generated and displayed
  - Tier Compute balance decremented by actual tokens used
  - Summary cached (can view again without re-billing)
  
- **Failure Criteria:**
  - Summarization fails
  - Tier Compute balance not decremented
  - Summary incorrect/truncated
  - Double-billed on retry
  
- **Evidence Required:**
  - Screenshot of generated summary
  - Tier Compute balance before/after confirmation
  - DevTools Network tab shows Gemini API calls
  - Supabase: billing event created for meeting_summarization
  - Event shows Tier Compute consumed, NOT Work PC
  
- **Regression Tests:**
  - Caching prevents double-billing
  - Invalid audio/transcript produces error
  - Very long meetings handled correctly

---

#### TEST-MEET-003: Meeting Persistence & Retrieval
- **Priority:** P0
- **Subsystem:** Meetings / Persistence
- **Type:** Database / Integration
- **Prerequisites:**
  - Multiple meetings created and summarized
  
- **Steps:**
  1. Create meeting A with summary
  2. Create meeting B with summary
  3. Restart app
  4. Navigate to Meetings
  5. Verify both meetings present
  6. Verify summaries still available (not regenerated)
  
- **Expected Result:**
  - All meetings persisted
  - Summaries retrieved from cache
  - No re-billing on retrieval
  
- **Failure Criteria:**
  - Meetings lost after restart
  - Summary requires regeneration
  - Tier Compute charged again for cached summary
  
- **Evidence Required:**
  - Screenshot of Meetings list after restart
  - Supabase: all meeting records exist
  - Billing events show no duplicate entries
  
- **Regression Tests:**
  - Deletion removes meeting from list
  - Search/filter works

---

#### TEST-MEET-004: Meeting Email Distribution (DEFERRED TO V2)
- **Priority:** DEFERRED
- **Subsystem:** Meetings / Email Distribution
- **Status:** NOT IMPLEMENTED — V2 feature
- **Note:** Test plan placeholder for future implementation

---

### A.7 Jira Integration (NOW IMPLEMENTED — Not Read-Only)

#### TEST-JIRA-001: Read Jira Issues (List)
- **Priority:** P0
- **Subsystem:** Jira Connector / Issue Reading
- **Type:** Live External Service (real Jira Cloud)
- **Prerequisites:**
  - Jira OAuth connected (TEST-CONN-002)
  - Jira workspace has at least 3 issues
  
- **Steps:**
  1. Navigate to Work Stream or Jira section
  2. Click "Browse Jira Issues" or similar
  3. List of issues appears
  4. Click on one issue to view details
  
- **Expected Result:**
  - Issues listed with title, key, status
  - Can click to view full issue details
  - Description, assignee, priority visible
  - OAuth token not exposed
  
- **Failure Criteria:**
  - Empty list (should show issues if workspace has any)
  - OAuth error (401/403)
  - Timeout or slow response
  
- **Evidence Required:**
  - Screenshot of issue list
  - Screenshot of issue details
  - DevTools Network tab shows GET request to Jira REST API
  - Authorization: Bearer header (OAuth)
  
- **Regression Tests:**
  - Pagination works for many issues
  - Filtering by status/assignee works
  - Search functionality works

---

#### TEST-JIRA-002: Jira Comment + Status Transition (After Autonomous Work)
- **Priority:** P0
- **Subsystem:** Jira Connector / Autonomous Write-Back
- **Type:** Live External Service (real Jira Cloud)
- **Prerequisites:**
  - Jira OAuth connected
  - Autonomous work completed on Jira issue (executed against a Jira ticket)
  - Issue exists in Jira workspace with "Done" transition available
  
- **Steps:**
  1. Complete autonomous work on Jira issue
  2. Execution record shows completion
  3. System attempts external update (comment posting + status transition)
  4. Verify comment appears on real Jira issue
  5. Verify status changed to "Done" on real Jira issue
  6. Refresh Jira in browser — both visible
  
- **Expected Result:**
  - Comment posted within 2 seconds
  - HTTP 201 response from Jira API
  - Comment body includes work reference/summary
  - Status transition succeeds (HTTP 204)
  - No 401/403 auth errors
  - OAuth Bearer token used correctly (NOT Basic auth unless legacy credentials)
  
- **Failure Criteria:**
  - Comment not posted
  - Status not transitioned
  - 401/403 Unauthorized (auth issue)
  - Token exposed in renderer logs
  - Timeout
  
- **Evidence Required:**
  - Screenshot of Jira issue in browser showing comment AND "Done" status
  - DevTools Network tab shows:
    - POST /rest/api/3/issue/*/comments (HTTP 201)
    - POST /rest/api/3/issue/*/transitions (HTTP 204)
  - Authorization headers show Bearer <token> (not Basic)
  - No token in DevTools console
  
- **Regression Tests:**
  - Basic-auth credentials (legacy) still work if configured
  - Comment not posted if Jira credentials not configured (graceful failure: "Jira: credentials not configured")
  - Multiple comments don't create duplicates (idempotency via external_write_idempotency table)
  - If "Done" transition not available, error handled gracefully

---

### A.8 Linear Integration (NOW IMPLEMENTED — Not Read-Only)

#### TEST-LINEAR-001: Read Linear Issues
- **Priority:** P0
- **Subsystem:** Linear Connector / Issue Reading
- **Type:** Live External Service (real Linear workspace)
- **Prerequisites:**
  - Linear API key connected (TEST-CONN-003)
  - Linear workspace has issues
  
- **Steps:**
  1. Browse Linear issues
  2. View issue details
  
- **Expected Result:**
  - Issues listed
  - Can view full details
  - No API key exposed
  
- **Evidence Required:**
  - Issue list screenshot
  - DevTools Network shows GraphQL POST to Linear API
  - Authorization: Bearer header (API key)
  
- **Regression Tests:**
  - Pagination works
  - Filter/search works

---

#### TEST-LINEAR-002: Linear Comment + Status Transition (After Autonomous Work)
- **Priority:** P0
- **Subsystem:** Linear Connector / Autonomous Write-Back
- **Type:** Live External Service (real Linear workspace)
- **Prerequisites:**
  - Linear API key connected
  - Autonomous work completed on Linear issue
  - Issue in Linear with "Done" status available
  
- **Steps:**
  1. Complete work on Linear issue
  2. System attempts external update (comment + status transition)
  3. Refresh Linear — comment visible AND status changed
  
- **Expected Result:**
  - Comment posted via Linear GraphQL API
  - HTTP 200 response with comment ID
  - Status changed to "Done" on real issue
  - Comment visible in Linear UI
  - No API key exposed
  
- **Evidence Required:**
  - Linear UI shows comment AND Done status
  - DevTools Network shows GraphQL mutation
  - API key not in logs
  
- **Regression Tests:**
  - Invalid credentials produce error
  - Idempotency prevents double-posting
  - Graceful failure if credentials not configured

---

### A.9 GitHub Integration (Read + Comment Only)

#### TEST-GITHUB-001: Read GitHub Issues & Pull Requests
- **Priority:** P0
- **Subsystem:** GitHub Connector / Reading
- **Type:** Live External Service (real GitHub)
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
  - List screenshot
  - DevTools Network shows GitHub REST API calls
  - Authorization: Bearer header
  
- **Regression Tests:**
  - Pagination works
  - Different repos can be browsed

---

#### TEST-GITHUB-002: GitHub PR Comment (Completion Update on Existing PR)
- **Priority:** P0
- **Subsystem:** GitHub Connector / PR Commenting
- **Type:** Live External Service (real GitHub)
- **Prerequisites:**
  - GitHub OAuth connected
  - PR exists in real GitHub repo (created externally or by prior work)
  - Autonomous work completed
  
- **Steps:**
  1. Work completes
  2. Attempt to post comment on existing PR
  3. Refresh GitHub PR
  4. Comment visible
  
- **Expected Result:**
  - Comment posted
  - HTTP 201 response
  - Comment visible in PR
  - Includes work summary/links
  
- **Failure Criteria:**
  - Comment not posted
  - 401/403 auth
  
- **Evidence Required:**
  - GitHub PR shows comment
  - DevTools Network shows POST /repos/*/issues/*/comments
  
- **Regression Tests:**
  - Multiple comments don't duplicate
  - Formatting/markdown preserved

---

#### TEST-GITHUB-003: GitHub PR Creation (DORMANT — NOT FUNCTIONAL)
- **Priority:** DORMANT
- **Subsystem:** GitHub Connector / PR Creation
- **Status:** STUB IMPLEMENTATION ONLY — NOT FUNCTIONAL FOR TESTING
- **Note:** GitHub PR creation function exists as stub (line 1125 in AutonomousOrchestrator.ts) but always returns failure: `{ ok: false, reason: 'PR creation requires main process' }`. This feature is incomplete and should NOT be tested or relied upon for launch. Main process implementation is required to make this functional.

---

---

## PART B: P1 TESTS — IMPORTANT BEFORE LAUNCH

P1 tests verify important (but not absolutely critical) functionality. Launch can proceed with P1 failures if P0 items are all passing.

---

### B.1 Advanced Billing & Tier Logic

#### TEST-BILL-P1-001: Volume-Tiered Work PC Pricing (Seat Billing)
- **Priority:** P1
- **Subsystem:** Billing / Seat Billing / Volume Tiers
- **Type:** Database / Unit
- **Prerequisites:**
  - Organization with 1, 5, 10, 20 members in Supabase
  - Pricing config defines Work PC tier rates
  
- **Steps:**
  1. Check organization_members.seat_count
  2. Retrieve current Work PC rate from pricing table
  3. Create autonomous work
  4. Verify settlement uses correct tier
  
- **Expected Result:**
  - 1 member: rate A
  - 5 members: rate B (higher per unit)
  - 10 members: rate C (discounted)
  - Rates applied correctly to Work PC billing
  
- **Failure Criteria:**
  - Wrong tier applied
  - Rate doesn't scale with seat count
  
- **Evidence Required:**
  - Billing event shows correct amount (in Work PC or USD equivalent)
  - Supabase query matches calculated rate
  
- **Regression Tests:**
  - Adding member updates tier
  - Removing member updates tier

---

#### TEST-BILL-P1-002: Free Tier Limits (Tier Compute Quota)
- **Priority:** P1
- **Subsystem:** Billing / Free Tier / Usage Quota
- **Type:** Integration
- **Prerequisites:**
  - Go tier user (free)
  - 200 Tier Compute token/month limit configured
  - User has consumed 180 tokens
  
- **Steps:**
  1. User attempts to use 50 more Tier Compute tokens
  2. Check balance (should be 20 remaining)
  3. Authorization should fail or allow only 20 tokens
  
- **Expected Result:**
  - Quota enforced
  - Error message: "Monthly Tier Compute limit reached"
  - User can upgrade or wait for reset
  
- **Failure Criteria:**
  - User allowed to exceed 200 tokens
  - No warning shown
  
- **Evidence Required:**
  - Error message screenshot
  - Billing record shows usage within 200-token limit
  
- **Regression Tests:**
  - Quota resets on month boundary
  - Pro tier has no quota (unlimited Tier Compute)

---

#### TEST-BILL-P1-003: Referral Credit Redemption
- **Priority:** P1
- **Subsystem:** Billing / Referral / Bonus Credits
- **Type:** Integration
- **Prerequisites:**
  - User has earned Referral Credits (Paw Credits)
  - Can redeem for Work PC bonus
  
- **Steps:**
  1. Navigate to Billing
  2. Click "Redeem Referral Credits"
  3. Enter amount to redeem
  4. Confirm
  5. Work PC balance increases
  
- **Expected Result:**
  - Referral credits converted to Work PC
  - Balance increased
  - Bonus expires at month boundary
  
- **Failure Criteria:**
  - Redemption fails
  - Balance not increased
  - Bonus persists beyond month
  
- **Evidence Required:**
  - Work PC balance before/after
  - Supabase shows bonus_work_pc and bonus_expires_at
  
- **Regression Tests:**
  - Cannot redeem more than available
  - Bonus applies to authorization checks

---

### B.2 Advanced Autonomous Features

#### TEST-AUTO-P1-001: Resume After Top-Up (Same Executor)
- **Priority:** P1
- **Subsystem:** Autonomous Work / Resume / Retry
- **Type:** Integration
- **Prerequisites:**
  - Autonomous task in 'waiting_for_topup' state
  - User adds sufficient Work PC credits
  
- **Steps:**
  1. Task waiting for topup
  2. User adds $20 USD (converted to Work PC)
  3. Task automatically resumes (or user clicks "Resume")
  4. Execution continues
  5. Settlement completes
  
- **Expected Result:**
  - Resume uses same executor_instance_id (Phase 2C)
  - Execution picks up where it left off (or restarts)
  - No double-billing
  - Same run_id used
  
- **Failure Criteria:**
  - Task doesn't resume
  - New executor_instance_id created (should reuse)
  - Double-charging
  
- **Evidence Required:**
  - Task status changes to 'running'
  - Same executor_instance_id in resume RPC
  - Billing event shows single charge, not two
  
- **Regression Tests:**
  - Multiple resume attempts don't cause issues
  - Insufficient topup keeps task waiting

---

#### TEST-AUTO-P1-002: Waiting For Permission (Manual Mode)
- **Priority:** P1
- **Subsystem:** Autonomous Work / Manual Mode / Approval
- **Type:** Integration
- **Prerequisites:**
  - Pro tier user (not Pro Max) — no autonomousPlanBypass entitlement
  - Autonomous work attempts to write files
  
- **Steps:**
  1. Autonomous work reaches applyCodeEdit action
  2. Permission modal appears (not auto-confirmed)
  3. User clicks "Approve"
  4. Execution continues
  
- **Expected Result:**
  - Permission modal shows proposed changes
  - User can review before approval
  - After approval, execution resumes
  - Settlement works correctly
  
- **Failure Criteria:**
  - Modal doesn't appear (should be required for Pro user)
  - User cannot deny
  - Execution doesn't wait
  
- **Evidence Required:**
  - Permission modal screenshot
  - Task state 'waiting_for_permission' in Supabase
  - Execution resumes after approval
  
- **Regression Tests:**
  - Denial stops execution
  - Pro Max user auto-confirms (no modal)
  - Different action types handled correctly

---

#### TEST-AUTO-P1-003: Connector Entitlement Gate
- **Priority:** P1
- **Subsystem:** Autonomous Work / Connector Entitlement
- **Type:** Integration
- **Prerequisites:**
  - Jira issue selected for autonomous work
  - Jira OAuth not connected
  
- **Steps:**
  1. Start autonomous work on Jira ticket
  2. System checks if Jira connected
  3. Error shown: "Jira not connected"
  
- **Expected Result:**
  - Work doesn't start
  - User directed to connect Jira
  - No charges applied
  
- **Failure Criteria:**
  - Work starts without Jira
  - User charged despite error
  
- **Evidence Required:**
  - Error message screenshot
  - No task created in Supabase
  - Work PC balance unchanged
  
- **Regression Tests:**
  - Same check for Linear, GitHub
  - After connecting, work starts

---

### B.3 Autonomous Cancellation Scenarios

#### TEST-AUTO-P1-004: Cancellation Before Provider Work (Zero Charge)
- **Priority:** P1
- **Subsystem:** Autonomous Work / Cancellation / Zero Charge
- **Type:** Integration
- **Prerequisites:**
  - Autonomous task in 'running' state
  - No provider API calls made yet
  
- **Steps:**
  1. Start autonomous work
  2. While model is planning (before first Gemini API call), click Cancel
  3. Confirm cancellation
  4. Check balance
  
- **Expected Result:**
  - Execution stops
  - Task marked as 'cancelled'
  - Reservation returned, zero Work PC charged
  - Balance unchanged
  
- **Evidence Required:**
  - Task status = 'cancelled'
  - No billing event created
  - Work PC balance unchanged
  
- **Regression Tests:**
  - Different cancellation points

---

#### TEST-AUTO-P1-005: Cancellation After Provider Work (Partial Charge)
- **Priority:** P1
- **Subsystem:** Autonomous Work / Cancellation / Partial Charge
- **Type:** Integration
- **Prerequisites:**
  - Autonomous task with provider work already done
  - Cancel during validation phase (after Gemini called)
  
- **Steps:**
  1. Autonomous work completes Gemini calls
  2. Task in validation phase
  3. User cancels
  4. Check settlement
  
- **Expected Result:**
  - Execution stops
  - Task marked as 'cancelled'
  - Actual Work PC consumed is charged (not zero)
  - Unused reservation is returned
  - No double charge on retry
  
- **Evidence Required:**
  - Task status = 'cancelled'
  - Billing event exists with actual_work_pc > 0
  - Work PC balance decreased by actual_work_pc
  - Idempotency: re-settle doesn't double-charge
  
- **Regression Tests:**
  - Different cancellation points charge proportionally

---

### B.4 RLS & Security (Multi-Tier Verification)

#### TEST-SEC-P1-001A: RLS Source Verification (Migrations)
- **Priority:** P1
- **Subsystem:** Security / RLS / Source Code
- **Type:** Static Code Review
- **Prerequisites:**
  - Access to migrations
  
- **Steps:**
  1. Inspect migrations: 20260723000000, 20260903000000
  2. Verify CREATE POLICY statements exist for autonomous_task_runs
  3. Verify CREATE POLICY statements exist for organization_billing_events
  4. Verify RLS ENABLE statements present
  
- **Expected Result:**
  - Migration 20260723000000 contains:
    - ALTER TABLE autonomous_task_runs ENABLE ROW LEVEL SECURITY;
    - CREATE POLICY statements for user and org scopes
  - Migration 20260903000000 contains updated policies
  
- **Failure Criteria:**
  - No RLS statements
  - RLS disabled
  
- **Evidence Required:**
  - Code screenshot of migration file
  - Confirmed: RLS ENABLE and CREATE POLICY present
  
- **Status:** ALREADY VERIFIED in implementation freeze audit

---

#### TEST-SEC-P1-001B: RLS Schema Verification (Applied Policies)
- **Priority:** P1
- **Subsystem:** Security / RLS / Database Schema
- **Type:** Staging Database Check
- **Prerequisites:**
  - Access to staging Supabase database
  - Can query information_schema
  
- **Steps:**
  1. Query Supabase to list all policies on autonomous_task_runs table
  2. Verify policies check auth.uid() or organization membership
  3. Repeat for organization_billing_events table
  
- **Expected Result:**
  - Policies exist in live schema
  - auth.uid() enforcement in SELECT policies
  - Organization membership checks in SELECT policies
  
- **Evidence Required:**
  - SQL query result showing all policies:
    ```sql
    SELECT policyname, definition FROM pg_policies 
    WHERE tablename IN ('autonomous_task_runs', 'organization_billing_events')
    ```
  
- **Status:** REQUIRED for staging verification

---

#### TEST-SEC-P1-001C: RLS Enforcement (Cross-User Access Test)
- **Priority:** P1
- **Subsystem:** Security / RLS / Enforcement
- **Type:** Staging/E2E (Supabase RLS enforcement)
- **Prerequisites:**
  - Two different Supabase users (user-A, user-B) on same staging database
  - User-A created autonomous run
  - Direct Supabase access available
  
- **Steps:**
  1. Authenticate as user-B
  2. Query autonomous_task_runs using user-B's token
  3. Attempt to read user-A's run by ID
  4. Verify RLS denies access
  
- **Expected Result:**
  - User-B cannot see user-A's runs
  - Query returns empty result set (not error, just no rows)
  - RLS policy enforced at database level
  
- **Failure Criteria:**
  - User-B sees user-A's runs
  - Query returns data it shouldn't
  
- **Evidence Required:**
  - Query result as user-B: ZERO rows for user-A's run
  - Query result as user-A: own runs visible
  - Verify RLS at DB level, not app-level filtering
  
- **Status:** REQUIRED for staging verification

---

#### TEST-SEC-P1-002: IPC Boundary (Preload Restrictions)
- **Priority:** P1
- **Subsystem:** Security / IPC / Preload Bridge
- **Type:** Unit / Security Audit
- **Prerequisites:**
  - PawOS running with DevTools access
  
- **Steps:**
  1. Open DevTools in renderer
  2. Attempt to call preload functions directly
  3. Verify only whitelisted functions accessible
  4. Attempt to call non-whitelisted functions
  
- **Expected Result:**
  - Whitelisted functions (entitlementIsFeatureAvailable, etc.) work
  - Non-whitelisted functions undefined
  - No access to main process functions
  
- **Failure Criteria:**
  - Renderer can call arbitrary main process functions
  - Private functions exposed
  
- **Evidence Required:**
  - DevTools console log shows whitelisted functions exist
  - Attempts to call non-whitelisted fail (undefined)
  
- **Status:** REQUIRED for security verification

---

### B.5 Error Handling & Edge Cases

#### TEST-ERR-P1-001: Network Error Recovery (Temporary Outage)
- **Priority:** P1
- **Subsystem:** Error Handling / Network Resilience
- **Type:** Integration
- **Prerequisites:**
  - Network connectivity available
  - Can simulate network outage (OS-level)
  
- **Steps:**
  1. Start autonomous work
  2. During execution, disconnect network
  3. Wait 5-10 seconds
  4. Reconnect network
  5. Observe error handling
  
- **Expected Result:**
  - Network error caught and logged
  - User shown friendly error message
  - Task doesn't crash
  - Can retry
  
- **Failure Criteria:**
  - UI unresponsive
  - No error message
  - Task in broken state
  
- **Evidence Required:**
  - Error message shown to user
  - Main process console has error log
  - Task can be retried
  
- **Regression Tests:**
  - Different outage durations handled
  - Long outages timeout gracefully

---

#### TEST-ERR-P1-002: Gemini API Error (Rate Limit)
- **Priority:** P1
- **Subsystem:** Error Handling / External API
- **Type:** Integration + Live External Service
- **Prerequisites:**
  - Gemini API key available
  - Can trigger rate limit (by running many queries)
  
- **Steps:**
  1. Start multiple autonomous tasks simultaneously
  2. Trigger Gemini API rate limit
  3. Observe error handling
  
- **Expected Result:**
  - Rate limit error caught
  - Task shows "API error - please retry later"
  - Doesn't charge user for failed request
  - Can retry
  
- **Failure Criteria:**
  - Silent failure
  - User charged despite error
  - No retry mechanism
  
- **Evidence Required:**
  - Error message shown
  - No billing event for failed task
  - Retry button works
  
- **Regression Tests:**
  - Invalid API key shows different error
  - Timeout errors handled differently

---

#### TEST-ERR-P1-003: Database Connection Error
- **Priority:** P1
- **Subsystem:** Error Handling / Database Resilience
- **Type:** Integration
- **Prerequisites:**
  - Supabase connectivity available
  - Can simulate Supabase outage
  
- **Steps:**
  1. Block Supabase connection (firewall rule)
  2. Attempt to start autonomous work
  3. Observe error
  
- **Expected Result:**
  - Connection error caught
  - User shown "Service unavailable" or similar
  - Clear guidance to retry
  
- **Failure Criteria:**
  - UI hangs
  - No error message
  - Token charged despite failure
  
- **Evidence Required:**
  - Error message shown
  - No task created
  - Work PC balance unchanged
  
- **Regression Tests:**
  - Different DB operations fail gracefully
  - Reconnection works after outage

---

### B.6 Performance & Scale

#### TEST-PERF-P1-001: Token Preflight Latency
- **Priority:** P1
- **Subsystem:** Performance / Token Preflight
- **Type:** Integration + Live External Service
- **Prerequisites:**
  - Gemini API accessible
  - Task with ~2000-char prompt
  
- **Steps:**
  1. Time token preflight (Gemini countTokens call)
  2. Measure latency
  3. Verify acceptable performance
  
- **Expected Result:**
  - countTokens call completes in <1 second
  - Not a significant bottleneck
  
- **Failure Criteria:**
  - >2 second latency
  - Multiple countTokens calls per turn
  
- **Evidence Required:**
  - DevTools timing screenshot
  - Network tab shows single countTokens call
  
- **Regression Tests:**
  - Different prompt sizes have proportional timing

---

#### TEST-PERF-P1-002: Authorization RPC Latency
- **Priority:** P1
- **Subsystem:** Performance / Authorization
- **Type:** Integration
- **Prerequisites:**
  - Autonomous work with real Supabase
  
- **Steps:**
  1. Time authorization RPC call
  2. Measure latency per turn
  
- **Expected Result:**
  - <500ms per authorization call
  - Not blocking execution
  
- **Failure Criteria:**
  - >1 second per call
  
- **Evidence Required:**
  - Network timing in DevTools
  
- **Regression Tests:**
  - Multiple turns average acceptable latency

---

### B.7 Integration Tests

#### TEST-INT-P1-001: Full Autonomous Workflow (End-to-End)
- **Priority:** P1
- **Subsystem:** Integration / Full Workflow
- **Type:** Staging/E2E
- **Prerequisites:**
  - GitHub repo with issue
  - GitHub OAuth connected
  - User on Pro Max tier
  - Work PC balance >10000
  
- **Steps:**
  1. Start autonomous work on GitHub issue
  2. Authorization modal shows estimated Work PC cost
  3. Confirm
  4. Execution begins
  5. Model reads issue, makes plan
  6. Applies code changes
  7. Runs tests/builds
  8. Settlement occurs
  9. Work PC balance decremented
  
- **Expected Result:**
  - Full workflow succeeds
  - All intermediate states correct
  - Work PC balance deducted correctly
  - Run marked as 'completed' or 'waiting_for_permission'
  
- **Failure Criteria:**
  - Any step fails
  - Work PC not updated
  - Balance not changed correctly
  
- **Evidence Required:**
  - Screenshot of final state (completed)
  - Supabase: run.status = 'completed', billing_event created
  - Work PC balance decreased appropriately
  
- **Regression Tests:**
  - Different issue types (feature, bug, documentation)
  - Different repo sizes

---

#### TEST-INT-P1-002: Multi-Connector Workflow (Jira + GitHub)
- **Priority:** P1
- **Subsystem:** Integration / Multi-Connector
- **Type:** Staging/E2E (real Jira + real GitHub)
- **Prerequisites:**
  - Jira issue linked to GitHub issue
  - Both connectors connected
  
- **Steps:**
  1. Start autonomous work from Jira issue
  2. Model works, posts comment on Jira
  3. Transitions Jira status to Done
  4. Posts comment on GitHub (if PR exists)
  5. Settlement completes
  
- **Expected Result:**
  - Both Jira and GitHub updated
  - Comments on both platforms
  - Status transitions on both
  - Settlement handles multi-connector workflow
  
- **Failure Criteria:**
  - Only one platform updated
  - Partial failure
  
- **Evidence Required:**
  - Screenshots of both Jira issue and GitHub
  - Comments visible on both
  
- **Regression Tests:**
  - Different connector combinations

---

---

## PART C: P2 TESTS — POST-LAUNCH ACCEPTABLE

P2 tests verify nice-to-have functionality and edge cases. These can be tested after launch in production.

---

### C.1 Optional Advanced Features

#### TEST-BILL-P2-001: Invoice Generation & Download
- **Priority:** P2
- **Subsystem:** Billing / Invoicing
- **Type:** Integration
- **Prerequisites:**
  - Multiple billing events for user
  
- **Steps:**
  1. Navigate to Billing → Invoices
  2. Find past month invoice
  3. Click "Download PDF"
  
- **Expected Result:**
  - PDF downloads
  - Contains correct amounts and dates
  
- **Evidence Required:**
  - PDF file with correct content
  
- **Regression Tests:**
  - Invoice date range correct
  - Currency correct

---

#### TEST-MEET-P2-001: Meeting Analytics & Insights
- **Priority:** P2
- **Subsystem:** Meetings / Analytics
- **Type:** Integration
- **Prerequisites:**
  - Multiple meetings summarized
  
- **Steps:**
  1. View Meetings dashboard
  2. Check summary statistics (total meetings, avg length, etc.)
  
- **Expected Result:**
  - Statistics accurate
  - Charts render
  
- **Evidence Required:**
  - Analytics screenshot
  
- **Regression Tests:**
  - Different time ranges
  - Filtering works

---

#### TEST-CONN-P2-001: Disconnect Connector
- **Priority:** P2
- **Subsystem:** Connectors / Disconnection
- **Type:** Integration
- **Prerequisites:**
  - Connector connected
  
- **Steps:**
  1. Settings → Connections → [Connector]
  2. Click "Disconnect"
  3. Confirm
  4. Verify disconnected
  
- **Expected Result:**
  - Credentials removed from Supabase
  - Status shows "Not Connected"
  - Cannot use connector
  
- **Evidence Required:**
  - Status screenshot
  - Supabase shows credentials null/deleted
  
- **Regression Tests:**
  - Reconnecting works after disconnection

---

#### TEST-AUTO-P2-001: Autonomous Work Cancellation (Mid-Execution)
- **Priority:** P2
- **Subsystem:** Autonomous Work / Cancellation
- **Type:** Integration
- **Prerequisites:**
  - Autonomous work running
  
- **Steps:**
  1. Click "Cancel" button during execution
  2. Confirm cancellation
  3. Observe state change
  4. Verify settlement
  
- **Expected Result:**
  - Execution stops
  - Task marked as 'cancelled'
  - Work PC charges applied only for work done
  - No double charge on retry
  
- **Evidence Required:**
  - Task status = 'cancelled'
  - Billing event reflects actual Work PC consumed
  
- **Regression Tests:**
  - Cancel at different phases
  - Different settlement amounts

---

#### TEST-PRJ-P2-001: Projects Feature (Basic CRUD)
- **Priority:** P2
- **Subsystem:** Projects
- **Type:** Integration
- **Prerequisites:**
  - Projects feature enabled (if implemented)
  
- **Steps:**
  1. Create new project
  2. Add description
  3. Save
  4. View project
  5. Edit details
  6. Delete project
  
- **Expected Result:**
  - Project persisted
  - CRUD operations work
  - Project accessible later
  
- **Evidence Required:**
  - Project appears in list
  - Supabase record created
  
- **Regression Tests:**
  - Multiple projects
  - Bulk operations

---

---

## PART D: DORMANT / NOT TESTED

The following features exist as stubs or are explicitly deferred. Do NOT test these features for launch:

### D.1 GitHub PR Creation (Stub Implementation)
- **Location:** AutonomousOrchestrator.ts:1100-1158
- **Status:** STUB — always returns failure `{ ok: false, reason: 'PR creation requires main process' }`
- **Required Fix:** Main process implementation required
- **Launch Impact:** NOT required for launch. Can be deferred.

### D.2 Jira/Linear Ticket Creation (Not Implemented)
- **Status:** Deferred to V2
- **Capability:** Creating new Jira/Linear issues from autonomous work
- **Launch Impact:** NOT required. Only comment + Done transition tested.

### D.3 Jira/Linear Advanced Status Transitions (Not Implemented)
- **Status:** Deferred to V2
- **Capability:** Transitions beyond "Done" (e.g., move to "Review", "Custom Status")
- **Launch Impact:** NOT required. Only "Done" transition tested.

### D.4 Meeting Email Distribution (Not Implemented)
- **Status:** Deferred to V2
- **Capability:** Sending meeting summaries via email
- **Launch Impact:** NOT required for launch.

### D.5 Teams Connector (Not Implemented)
- **Status:** Deferred to V2
- **Communication Runtime:** Frozen, no Teams integration
- **Launch Impact:** NOT required.

### D.6 WhatsApp/Telegram/Discord (Not Implemented)
- **Status:** Deferred to V2
- **Communication Runtime:** Frozen
- **Launch Impact:** NOT required.

### D.7 Avatar Generation Marketplace (Not Implemented)
- **Status:** Deferred to V2
- **Launch Impact:** NOT required.

### D.8 Mobile App & Sync (Not Implemented)
- **Status:** Deferred to V2
- **Launch Impact:** NOT required.

---

---

## TEST EXECUTION STRATEGY

### Phase 1: Pre-Launch (P0 + P1)
1. **Days 1-2:** Run all P0 tests (A.1 - A.9)
   - Fix any critical blockers immediately
2. **Days 3-4:** Run all P1 tests (B.1 - B.7)
   - Document known issues
   - Triage for hot-fixes vs. post-launch

### Phase 2: Live Verification (Real External Services)
- Live Jira Cloud testing (requires real workspace + OAuth)
- Live Linear workspace testing
- Live GitHub repo testing
- Gemini API behavior under load

### Phase 3: Post-Launch (P2)
- Advanced features tested after launch
- Performance monitoring in production

---

---

## SUCCESS CRITERIA FOR LAUNCH

**All P0 tests must pass** (A.1 - A.9):
- ✅ Authentication working (email, OAuth)
- ✅ Billing integrated (Tier Compute for AI, Work PC for autonomous)
- ✅ Autonomous work executable (entitlement, authorization, settlement)
- ✅ Executor claiming server-authoritative (Phase 2C)
- ✅ Token preflight exact (Gemini countTokens, Phase 2D)
- ✅ Model identity consistent (Phase 2B)
- ✅ Jira/Linear integration (read + comment + Done transition)
- ✅ GitHub integration (read + comment on existing PRs, NOT creation)
- ✅ Meetings functional (create, summarize, persist)

**P1 tests should pass** (B.1 - B.7):
- ✅ Advanced billing features
- ✅ Resume after topup
- ✅ Manual approval mode
- ✅ RLS enforcement (all three tiers)
- ✅ Error handling

**Known P2/Dormant items acceptable as post-launch**:
- Advanced analytics
- Invoicing
- Connector disconnection
- PR creation (not functional yet)
- Advanced Jira/Linear features

---

**Test Plan V2 Ready for Execution**

All 11 audit findings have been corrected. This version is ready for approval and sequential execution.

