# COMPREHENSIVE TEST PLAN — PawOS Product

**Date:** 2026-09-09  
**Scope:** Complete currently-implemented product capabilities  
**Status:** APPROVED FOR EXECUTION (pending user review)  

---

## OVERVIEW

This test plan covers all currently-implemented capabilities in PawOS as of 2026-09-09, organized by priority (P0 mandatory before launch, P1 important before launch, P2 post-launch acceptable). Each test includes exact prerequisites, step-by-step procedures, expected results, and evidence requirements.

**Intentionally Deferred / V2:**
- Meetings email distribution (deferred to V2)
- Teams connector (deferred to V2)
- WhatsApp/Telegram/Discord communication (deferred to V2)
- Avatar generation marketplace (deferred to V2)
- Mobile app and mobile sync (deferred to V2)
- Jira/Linear ticket creation/updates (currently read-only only)
- Advanced Jira/Linear status transitions beyond "Done"

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
  6. Browser redirects back to PawOS
  7. Dashboard is visible with empty project list
  
- **Expected Result:**
  - Account created in Supabase auth
  - User table entry created
  - Session established
  - Dashboard renders with onboarding or empty state
  
- **Failure Criteria:**
  - Verification email never arrives
  - Verification link doesn't work
  - Dashboard doesn't load after verification
  - Error messages don't appear for invalid passwords
  
- **Evidence Required:**
  - Screenshot of Dashboard after sign-up
  - Supabase Auth user record exists with correct email
  - localStorage contains valid auth tokens
  - Network tab shows successful redirect from email link
  
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
  - Auth token obtained
  - Session established
  - Dashboard renders
  - User email shown in account menu
  
- **Failure Criteria:**
  - Wrong password accepted
  - Correct password rejected
  - Session not established
  - Dashboard doesn't load
  
- **Evidence Required:**
  - Screenshot of Dashboard
  - Browser Network tab shows auth token in response
  - localStorage contains valid session token
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
  2. Browser redirects to Google OAuth consent screen
  3. Consent to "Sign in with your Google Account"
  4. Select test account (test-pawos-user@gmail.com)
  5. Grant requested OAuth scopes (email, profile)
  6. Browser redirects back to PawOS
  7. Dashboard loads
  8. Account menu shows Google email
  
- **Expected Result:**
  - New user account created (linked to Google ID)
  - OAuth token stored securely (never in renderer console)
  - Session established
  - Dashboard accessible
  
- **Failure Criteria:**
  - OAuth token visible in DevTools console/logs
  - Token stored in localStorage (should only be in secure storage)
  - Redirect URI mismatch error
  - User not created in user table
  
- **Evidence Required:**
  - Screenshot of Dashboard after OAuth
  - Supabase auth user record has google_uid provider
  - Browser Network tab shows Authorization header does NOT contain token
  - renderer/main IPC logs do NOT contain token
  
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
  - Previous session state is preserved (if applicable)
  
- **Failure Criteria:**
  - Sign-in page appears instead of Dashboard
  - Session tokens lost
  - Previous state not restored
  
- **Evidence Required:**
  - Screenshot of Dashboard loading without sign-in
  - localStorage contains valid auth token
  - No sign-in API calls in Network tab
  
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
  - Session token cleared from localStorage
  - User redirected to sign-in page
  - Dashboard no longer accessible
  - Subsequent refresh shows sign-in
  
- **Failure Criteria:**
  - Session token still in localStorage
  - User remains on Dashboard
  - Can still access protected routes
  
- **Evidence Required:**
  - Screenshot of sign-in page after logout
  - localStorage shows no auth token
  - Browser Network tab shows logout API call succeeded
  
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
  3. Observe current Paw Compute balance
  4. Verify balance matches Supabase `organization_credits.balance_tokens`
  
- **Expected Result:**
  - Tier correctly shown as "Pro Max" or equivalent
  - Current balance displayed in consistent units (tokens or USD equivalent)
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
  - Query Supabase: verify `organization_credits.balance_tokens` matches UI display
  - Network tab shows successful API call to fetch balance
  
- **Regression Tests:**
  - Balance updates after AI usage
  - Switching between Go/Pro/Pro Max shows correct limits
  - Free tier user sees correct messaging (e.g., "200 tokens/month included")

---

#### TEST-BILL-002: Monitor Real AI Usage Consumption (Meetings)
- **Priority:** P0
- **Subsystem:** Billing / Tier Compute / Meeting Summarization
- **Type:** Integration + Live External Service (Gemini API)
- **Prerequisites:**
  - User on Pro Max tier with >10000 tokens balance
  - Meeting capability enabled
  - Audio file or meeting transcript available
  
- **Steps:**
  1. Record or upload a meeting (or provide meeting transcript)
  2. Note current Paw Compute balance (e.g., 15000 tokens)
  3. Request meeting summarization
  4. Summarization completes
  5. Check Paw Compute balance immediately after
  6. Calculate tokens consumed = (balance before) - (balance after)
  
- **Expected Result:**
  - Balance decreased by reasonable amount (e.g., 50-500 tokens for 5-minute meeting)
  - Tokens consumed is NOT zero
  - Tokens consumed matches estimated input + output tokens from Gemini response
  - Billing event recorded in `organization_billing_events`
  
- **Failure Criteria:**
  - Balance unchanged after summarization
  - Balance negative (over-consumption not detected)
  - Tokens consumed wildly off from actual usage (e.g., 1000x expected)
  - No billing event created
  
- **Evidence Required:**
  - Screenshots: before/after balance
  - Meeting summary output
  - Supabase query: `SELECT * FROM organization_billing_events WHERE event_type = 'meeting_summarization' ORDER BY created_at DESC LIMIT 1`
  - Network tab shows Gemini countTokens API calls
  
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
  - User on Pro Max tier with exactly 100 tokens balance
  - Meeting available that requires ~150 tokens
  - System can mock/control available tokens if needed
  
- **Steps:**
  1. Note balance = 100 tokens
  2. Attempt to summarize a meeting estimated at 150 tokens
  3. Observe error message
  4. Verify balance unchanged
  
- **Expected Result:**
  - Error message: "Insufficient Paw Compute balance"
  - Action not executed
  - Balance remains 100 tokens
  - No partial charge
  - Exact token count from Gemini countTokens() used (not heuristic)
  
- **Failure Criteria:**
  - Operation succeeds despite insufficient balance
  - Balance becomes negative
  - Action partially executes
  - Vague error message (user doesn't understand what "compute" means)
  - Heuristic estimate (chars/4) used instead of exact countTokens
  
- **Evidence Required:**
  - Screenshot of error message
  - Supabase balance query confirms unchanged
  - Network tab shows:
    - Gemini countTokens() API call successful
    - meetingHandler never calls creditStore.consume()
  - Browser console shows exact token count was retrieved
  
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
  - Balance increased by equivalent tokens (e.g., 20000 tokens for $20)
  - Transaction logged in `ticket_balance_topups`
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
  - Sufficient balance (>5000 tokens)
  
- **Steps:**
  1. Navigate to Work Stream or Autonomous Work tab
  2. Click "Start Autonomous Task" or equivalent
  3. Authorization modal appears
  4. Confirm authorization
  5. Task starts
  
- **Expected Result:**
  - Modal correctly shows estimated cost
  - Tier verified via IPC entitlementIsFeatureAvailable('autonomousTaskBilling')
  - Authorization check confirms user can run autonomous work
  - Task transitions to 'running' state
  
- **Failure Criteria:**
  - Modal shows wrong cost estimate
  - Go/Pro user allowed to start (should see error)
  - Authorization check skipped
  - Task starts in wrong state
  
- **Evidence Required:**
  - Screenshot of authorization modal
  - Browser Console shows entitlementIsFeatureAvailable call succeeds
  - Supabase: task row created with status='running'
  - IPC handler called with correct parameters
  
- **Regression Tests:**
  - Go tier user sees "Upgrade required" error instead of starting task
  - Pro tier user sees "Upgrade required" error
  - Pro Max tier user can always start (if balance sufficient)

---

#### TEST-AUTO-002: Executor Claiming (Server-Authoritative)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Executor Authorization / Phase 2C
- **Type:** Unit + Integration
- **Prerequisites:**
  - Autonomous task in 'running' state
  - Database accessible
  
- **Steps:**
  1. Trace AutonomousOrchestrator.ts execution
  2. Verify claim_autonomous_executor_for_run RPC called (before authorization)
  3. Verify returned executor_instance_id passed to authorization
  4. Verify executor ID is server-generated UUID (not client crypto.randomUUID)
  
- **Expected Result:**
  - RPC called at line 525-530 (before createAuthorizedProvider)
  - server-side generation confirmed: `gen_random_uuid()` in migration SQL
  - executorInstanceId extracted from claimData.execution_executor_instance_id
  - ID is 36-char UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  
- **Failure Criteria:**
  - RPC not called
  - RPC called AFTER authorization
  - Executor ID is client-generated UUID (indicates blocker not fixed)
  - Server claim fails with error
  
- **Evidence Required:**
  - Browser console logs show "[EXECUTOR_CLAIMED_SERVER_SIDE]" message
  - Network tab shows RPC call to claim_autonomous_executor_for_run
  - RPC response includes execution_executor_instance_id field
  - Supabase: `SELECT * FROM autonomous_executor_claims WHERE run_id = ... LIMIT 1` shows server-generated ID
  
- **Regression Tests:**
  - Resume-after-topup also uses server claim (consistent)
  - Duplicate claims return same executor_instance_id (idempotent)
  - Claim fails gracefully if run_id invalid

---

#### TEST-AUTO-003: Model Identity Consistency (Authorization ↔ Execution)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Token Authorization / Phase 2B
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
  - Not hardcoded as 'gemini-flash-latest' if aiRouter returns different model
  - Pricing calculation uses SAME model
  - Execution uses SAME model
  - Authorization and actual call cannot diverge
  
- **Failure Criteria:**
  - Model changes between authorization and execution
  - Different models used for pricing vs. execution
  - Hardcoded model overrides aiRouter model
  - Model is undefined/null
  
- **Evidence Required:**
  - Browser console logs:
    - Model at authorization: console.log shows which model
    - Model at execution: Gemini API call headers show model
  - Network tab: Gemini countTokens call uses same model as Gemini streamResponse
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
  2. Trace token preflight (AutonomousOrchestrator.ts lines 206-286)
  3. Verify Gemini countTokens API called (not chars/4 heuristic)
  4. Verify exact token count returned
  5. Verify authorization uses this exact count
  6. Verify no fallback to heuristic on API error
  
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
  - Network tab shows POST to generativelanguage.googleapis.com/v1beta/models/*/countTokens
  - Request body includes conversation content
  - Response contains totalTokens value
  - Browser console shows: "[TOKEN_PREFLIGHT_EXACT]" or similar log
  - Authorization amount matches returned token count (not chars/4)
  
- **Regression Tests:**
  - countTokens called before each turn (not just initial)
  - countTokens error produces meaningful error message
  - countTokens latency acceptable (<1 second)

---

#### TEST-AUTO-005: Autonomous Authorization (Reservation Check)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Authorization / Token Reservation
- **Type:** Integration + Database
- **Prerequisites:**
  - Autonomous task with 5000-token authorization
  - Exact preflight completed
  - Supabase accessible
  
- **Steps:**
  1. Trace createAuthorizedProvider() wrapper
  2. Verify authorization RPC called before each turn
  3. Check reservation is created/extended in `autonomous_reservation_requests`
  4. Verify reservation amount = exact token count
  5. Verify reservation duration (e.g., 120 seconds)
  6. Verify balance check prevents authorization if insufficient
  
- **Expected Result:**
  - Authorization RPC: `authorize_model_request()` called
  - Reservation recorded with execution_executor_instance_id
  - Reservation window is configurable (120+ seconds typical)
  - Idempotency tracked by `auth_request_id` (different for each turn)
  - Authorization failure returns structured error (ok: false, reason: string)
  
- **Failure Criteria:**
  - Authorization skipped
  - Reservation not created
  - Authorization amount wrong
  - No idempotency tracking
  - Error messages vague
  
- **Evidence Required:**
  - Network tab shows authorization RPC call
  - RPC response includes ok: true, required_pc: number, wallet_remaining: number
  - Supabase: `SELECT * FROM autonomous_reservation_requests WHERE run_id = ...` shows reservation rows
  - Timestamps show reservation created before execution
  
- **Regression Tests:**
  - Multiple authorization calls (multiple turns) each create separate reservations
  - Authorization fails gracefully if balance insufficient
  - Authorization succeeds if (balance - reserved) >= required_pc

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
  - Browser console shows completion message
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
  - Scenario B: Task marked as 'cancelled', no charges
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

### A.4 Autonomous Settlement & Billing

#### TEST-AUTO-008: Settlement (Actual PC from Usage Events)
- **Priority:** P0
- **Subsystem:** Autonomous Work / Settlement / Billing
- **Type:** Integration + Database
- **Prerequisites:**
  - Autonomous task completed successfully
  - ExecutionRecord finalized with actual token usage
  
- **Steps:**
  1. Task execution finishes
  2. Main process calculates actual Paw Compute from usage events
  3. Settlement RPC called with actual_pc
  4. Verify settlement creates billing event
  5. Verify charges deducted from balance
  6. Verify settlement is idempotent (calling twice doesn't double-charge)
  
- **Expected Result:**
  - Settlement RPC: settle_autonomous_run_execution() called
  - Billing event created in organization_billing_events
  - Balance decreased by (actual_pc converted to cost)
  - BillingEvent.status = 'settled'
  - Calling settlement twice returns same billing_event_id
  
- **Failure Criteria:**
  - Settlement never called
  - Settlement called with wrong actual_pc
  - Double-charging on retry
  - Balance not updated
  - Idempotency broken
  
- **Evidence Required:**
  - Network tab shows settlement RPC call
  - RPC response includes billing_event_id
  - Supabase: `SELECT * FROM organization_billing_events WHERE run_id = ...` shows entry
  - Balance query shows decrease matching expected cost
  - Second settlement call returns same billing_event_id
  
- **Regression Tests:**
  - Different actual_pc values settle correctly
  - Insufficient balance at settlement time fails gracefully
  - Settlement respects volume-tiered pricing

---

#### TEST-AUTO-009: Waiting For Top-Up State
- **Priority:** P0
- **Subsystem:** Autonomous Work / Top-Up Prompt / Billing
- **Type:** Integration
- **Prerequisites:**
  - User with low balance (<2000 tokens)
  - Autonomous task that requires ~5000 tokens
  
- **Steps:**
  1. Start autonomous task
  2. Authorization fails (insufficient balance)
  3. App shows "Waiting for Top-Up" modal
  4. Modal includes current balance and required top-up amount
  5. User navigates to Billing and adds credits
  6. Returns to task
  7. Task resumes or retries automatically
  
- **Expected Result:**
  - Task state transitions to 'waiting_for_topup'
  - Modal clearly shows what needs to happen
  - User can top up and return seamlessly
  - Task resumes after top-up without manual restart
  
- **Failure Criteria:**
  - Modal not shown
  - Modal doesn't explain what went wrong
  - User must restart task manually
  - Task resumes before top-up completes
  
- **Evidence Required:**
  - Screenshot of waiting-for-topup modal
  - Modal shows balance and required amount
  - Task state in Supabase is 'waiting_for_topup'
  - After top-up, task resumes automatically
  
- **Regression Tests:**
  - Different required amounts calculate correctly
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
  3. Browser redirects to GitHub OAuth
  4. Authorize scopes (repo, read:org, etc.)
  5. Browser redirects back
  6. Connection status shows "Connected"
  7. GitHub username/avatar displayed
  
- **Expected Result:**
  - GitHub OAuth token stored securely
  - Token never visible in renderer console
  - User record shows github_username
  - Can now use GitHub for autonomous work
  
- **Failure Criteria:**
  - OAuth token visible in console/logs
  - Token stored in localStorage (wrong)
  - Redirect URI mismatch
  - Connection status says "Not connected" after auth
  
- **Evidence Required:**
  - Screenshot of connected status
  - Browser DevTools Network: no token in request/response
  - renderer console logs: no token printed
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
  4. Browser redirects to Jira OAuth
  5. Authorize requested scopes (read:jira-work, etc.)
  6. Redirect back to PawOS
  7. Connection shows "Connected"
  
- **Expected Result:**
  - Jira OAuth token stored securely
  - Workspace domain saved
  - Can query Jira issues later
  
- **Failure Criteria:**
  - OAuth fails with "Invalid grant"
  - Token exposed in logs
  - Workspace domain not saved
  
- **Evidence Required:**
  - Screenshot of connected status
  - Supabase: jira_workspace_domain, jira_oauth_token stored
  - Network: token not visible
  
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
  - Key stored securely (encrypted at rest)
  - Can query Linear issues later
  - Invalid keys rejected with clear error
  
- **Failure Criteria:**
  - Invalid key accepted
  - Key stored in plaintext
  - No validation performed
  
- **Evidence Required:**
  - Screenshot of connected status
  - Successful API call to Linear in Network tab
  - Supabase: linear_api_key stored (encrypted)
  
- **Regression Tests:**
  - Expired key shows "Invalid credentials" when used
  - Disconnect removes key

---

#### TEST-CONN-004: Slack OAuth Connect
- **Priority:** P0 (Frozen - communication runtime frozen)
- **Subsystem:** Connectors / Slack OAuth
- **Type:** Staging/E2E
- **Status:** FROZEN — bug fixes only
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
- **Priority:** P1 (Used for email feature, may be deferred)
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
- **Priority:** P1 (Similar to Gmail)
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
  - Balance >2000 tokens
  
- **Steps:**
  1. Open meeting
  2. Click "Summarize" button
  3. Summarization request sent
  4. Observe processing state
  5. Summary appears once complete
  6. Verify balance decremented
  
- **Expected Result:**
  - Gemini API called with audio/transcript
  - Summary generated and displayed
  - Balance decremented by actual tokens used
  - Summary cached (can view again without re-billing)
  
- **Failure Criteria:**
  - Summarization fails
  - Balance not decremented
  - Summary incorrect/truncated
  - Double-billed on retry
  
- **Evidence Required:**
  - Screenshot of generated summary
  - Balance before/after confirmation
  - Network tab shows Gemini API calls
  - Supabase: billing event created for meeting_summarization
  
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
  - Balance charged again for cached summary
  
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

### A.7 Jira/Linear Integration

#### TEST-JIRA-001: Read Jira Issues (List)
- **Priority:** P0
- **Subsystem:** Jira Connector / Issue Reading
- **Type:** Live External Service (real Jira Cloud)
- **Prerequisites:**
  - Jira OAuth connected
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
  - No OAuth token exposed
  
- **Failure Criteria:**
  - Empty list (should show issues if workspace has any)
  - OAuth error (401/403)
  - Timeout or slow response
  
- **Evidence Required:**
  - Screenshot of issue list
  - Screenshot of issue details
  - Network tab shows GET request to Jira REST API
  - Jira request includes Authorization: Bearer header (not Basic)
  
- **Regression Tests:**
  - Pagination works for many issues
  - Filtering by status/assignee works
  - Search functionality works

---

#### TEST-JIRA-002: Jira Write-Back (Comment After Autonomous Work)
- **Priority:** P0
- **Subsystem:** Jira Connector / Autonomous Write-Back
- **Type:** Live External Service (real Jira Cloud)
- **Prerequisites:**
  - Jira OAuth connected
  - Autonomous work completed on Jira ticket
  - Issue exists in Jira workspace
  
- **Steps:**
  1. Complete autonomous work on Jira issue
  2. Execution record shows completion
  3. Attempt external update (comment posting)
  4. Verify comment appears on real Jira issue
  5. Refresh Jira in browser — comment visible
  
- **Expected Result:**
  - Comment posted within 2 seconds
  - Comment body includes work reference/summary
  - No 401/403 auth errors
  - OAuth Bearer token used (not Basic auth)
  - HTTP 201 response from Jira API
  
- **Failure Criteria:**
  - Comment not posted
  - 401/403 Unauthorized (auth issue)
  - Token exposed in renderer logs
  - Timeout
  
- **Evidence Required:**
  - Screenshot of Jira issue in browser showing comment
  - Network tab shows POST /rest/api/3/issue/*/comments
  - Authorization header: Bearer <token> (not Basic)
  - Response status 201 Created
  - Jira response includes comment ID
  
- **Regression Tests:**
  - Basic-auth credentials (legacy) still work if configured
  - Comment not posted if credentials not configured (graceful failure)
  - Multiple comments don't create duplicates (idempotency)

---

#### TEST-JIRA-003: Jira Status Transition (Done)
- **Priority:** P0
- **Subsystem:** Jira Connector / Status Transition
- **Type:** Live External Service (real Jira Cloud)
- **Prerequisites:**
  - Jira OAuth connected
  - Issue in "In Progress" or other non-terminal status
  - "Done" transition available
  
- **Steps:**
  1. Complete autonomous work on issue
  2. Comment posting succeeds
  3. Attempt status transition to "Done"
  4. Refresh Jira — issue now shows "Done"
  
- **Expected Result:**
  - GET /rest/api/3/issue/*/transitions returns available transitions
  - "Done" transition found with transition ID
  - POST /rest/api/3/issue/*/transitions executes transition
  - HTTP 204 No Content response
  - Issue status changed to Done in Jira
  
- **Failure Criteria:**
  - Transition not found (error)
  - Status doesn't change
  - 401/403 auth error
  
- **Evidence Required:**
  - Screenshot of Jira issue showing "Done" status
  - Network tab shows both transition list and execute calls
  - Both requests use Bearer auth
  
- **Regression Tests:**
  - Unsupported transition name produces clear error
  - Transition fails gracefully if permission denied

---

#### TEST-LINEAR-001: Read Linear Issues
- **Priority:** P0
- **Subsystem:** Linear Connector / Issue Reading
- **Type:** Live External Service (real Linear workspace)
- **Prerequisites:**
  - Linear API key connected
  - Linear workspace has issues
  
- **Steps:**
  1. Browse Linear issues (similar to Jira)
  2. View issue details
  
- **Expected Result:**
  - Issues listed
  - Can view full details
  - No API key exposed
  
- **Evidence Required:**
  - Issue list screenshot
  - Network shows GraphQL POST to Linear API
  - Authorization: Bearer header (API key base64-encoded if needed)
  
- **Regression Tests:**
  - Pagination works
  - Filter/search works

---

#### TEST-LINEAR-002: Linear Write-Back (Comment)
- **Priority:** P0
- **Subsystem:** Linear Connector / Autonomous Write-Back
- **Type:** Live External Service (real Linear workspace)
- **Prerequisites:**
  - Linear API connected
  - Autonomous work completed on Linear ticket
  
- **Steps:**
  1. Complete work on Linear issue
  2. Comment posting attempted
  3. Refresh Linear — comment visible
  
- **Expected Result:**
  - Comment posted via Linear GraphQL API
  - HTTP 200 response with comment ID
  - Comment visible in Linear UI
  - No API key exposed
  
- **Evidence Required:**
  - Linear UI shows comment
  - Network shows GraphQL mutation
  - API key not in logs
  
- **Regression Tests:**
  - Invalid credentials produce error
  - Idempotency prevents double-posting

---

#### TEST-LINEAR-003: Linear Status Transition
- **Priority:** P0
- **Subsystem:** Linear Connector / Status Transition
- **Type:** Live External Service (real Linear workspace)
- **Prerequisites:**
  - Linear API connected
  - Issue in non-terminal state
  
- **Steps:**
  1. Complete work
  2. Attempt "Done" transition
  3. Refresh Linear
  
- **Expected Result:**
  - Status changed to Done
  - GraphQL mutation succeeded
  
- **Evidence Required:**
  - Linear UI shows Done status
  - Network shows mutation
  
- **Regression Tests:**
  - Unsupported status produces error

---

### A.8 GitHub Integration

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
  - Network shows GitHub REST API calls
  - Authorization: Bearer header
  
- **Regression Tests:**
  - Pagination works
  - Different repos can be browsed

---

#### TEST-GITHUB-002: GitHub PR Creation (via Autonomous Work)
- **Priority:** P0 (if PR creation implemented)
- **Subsystem:** GitHub Connector / PR Creation
- **Type:** Live External Service (real GitHub)
- **Prerequisites:**
  - GitHub OAuth connected
  - Autonomous work creates code changes
  
- **Steps:**
  1. Complete autonomous work (code changes made)
  2. System attempts PR creation
  3. PR appears on real GitHub repo
  
- **Expected Result:**
  - PR created on target branch
  - Correct branch/PR body
  - HTTP 201 response with PR URL
  - PR visible in GitHub UI
  
- **Failure Criteria:**
  - PR not created
  - Wrong branch
  - Auth error
  
- **Evidence Required:**
  - GitHub UI shows PR
  - Network shows POST /repos/*/pulls
  - PR URL captured and stored
  
- **Regression Tests:**
  - PR title/body customizable
  - Duplicate PR prevention (idempotency)

---

#### TEST-GITHUB-003: GitHub PR Comment (Completion Update)
- **Priority:** P0
- **Subsystem:** GitHub Connector / PR Commenting
- **Type:** Live External Service (real GitHub)
- **Prerequisites:**
  - GitHub OAuth connected
  - PR created (from TEST-GITHUB-002)
  - Autonomous work completed
  
- **Steps:**
  1. Work completes
  2. Attempt to post comment on PR
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
  - Network shows POST /repos/*/issues/*/comments
  
- **Regression Tests:**
  - Multiple comments don't duplicate
  - Formatting/markdown preserved

---

---

## PART B: P1 TESTS — IMPORTANT BEFORE LAUNCH

P1 tests verify important (but not absolutely critical) functionality. Launch can proceed with P1 failures if emergency/critical-path items are working.

---

### B.1 Advanced Billing & Tier Logic

#### TEST-BILL-P1-001: Volume-Tiered Pricing (Seat Billing)
- **Priority:** P1
- **Subsystem:** Billing / Seat Billing / Volume Tiers
- **Type:** Database / Unit
- **Prerequisites:**
  - Organization with 1, 5, 10, 20 members in Supabase
  - Pricing config defines tiers
  
- **Steps:**
  1. Check organization_members.seat_count
  2. Retrieve current seat billing rate from BillingRateTable
  3. Create autonomous work
  4. Verify settlement uses correct tier
  
- **Expected Result:**
  - 1 member: rate A
  - 5 members: rate B (higher per unit)
  - 10 members: rate C (discounted)
  - Rates applied correctly
  
- **Failure Criteria:**
  - Wrong tier applied
  - Rate doesn't scale with seat count
  
- **Evidence Required:**
  - Billing event shows correct amount_usd
  - Supabase query matches calculated rate
  
- **Regression Tests:**
  - Adding member updates tier
  - Removing member updates tier

---

#### TEST-BILL-P1-002: Free Tier Limits (Usage Quota)
- **Priority:** P1
- **Subsystem:** Billing / Free Tier / Usage Quota
- **Type:** Integration
- **Prerequisites:**
  - Go tier user (free)
  - 200 token/month limit configured
  - User has consumed 180 tokens
  
- **Steps:**
  1. User attempts to use 50 more tokens
  2. Check balance (should be 20 remaining)
  3. Authorization should fail or allow only 20 tokens
  
- **Expected Result:**
  - Quota enforced
  - Error message: "Monthly token limit reached"
  - User can upgrade or wait for reset
  
- **Failure Criteria:**
  - User allowed to exceed 200 tokens
  - No warning shown
  
- **Evidence Required:**
  - Error message screenshot
  - Billing record shows usage within 200-token limit
  
- **Regression Tests:**
  - Quota resets on month boundary
  - Pro tier has no quota (unlimited)

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
  5. Balance increases
  
- **Expected Result:**
  - Referral credits converted to Work PC
  - Balance increased
  - Bonus expires at month boundary
  
- **Failure Criteria:**
  - Redemption fails
  - Balance not increased
  - Bonus persists beyond month
  
- **Evidence Required:**
  - Balance before/after
  - Supabase shows bonus_pc and bonus_expires_at
  
- **Regression Tests:**
  - Cannot redeem more than available
  - Bonus applies to authorization checks

---

### B.2 Advanced Autonomous Features

#### TEST-AUTO-P1-001: Retry After Topup (Resume Mechanism)
- **Priority:** P1
- **Subsystem:** Autonomous Work / Resume / Retry
- **Type:** Integration
- **Prerequisites:**
  - Autonomous task in 'waiting_for_topup' state
  - User adds sufficient credits
  
- **Steps:**
  1. Task waiting for topup
  2. User adds $20 USD
  3. Task automatically resumes (or user clicks "Resume")
  4. Execution continues
  5. Settlement completes
  
- **Expected Result:**
  - Resume uses same executor_instance_id (Phase 2C)
  - Execution picks up where it left off (if stateless) or restarts
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
  - Pro tier user (not Pro Max)
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
  - Modal doesn't appear (Pro user auto-confirms when it shouldn't)
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
  - Balance unchanged
  
- **Regression Tests:**
  - Same check for Linear, GitHub
  - After connecting, work starts

---

### B.3 Advanced Connector Features

#### TEST-CONN-P1-001: Credential Encryption At Rest
- **Priority:** P1
- **Subsystem:** Connectors / Security / Credential Storage
- **Type:** Database / Security
- **Prerequisites:**
  - Multiple connectors connected (GitHub, Jira, Linear)
  
- **Steps:**
  1. Query Supabase database directly
  2. Inspect connector credentials table
  3. Verify OAuth tokens are encrypted
  
- **Expected Result:**
  - OAuth tokens are NOT plain text in database
  - Encrypted field contains ciphertext
  - Cannot decrypt without database encryption key
  
- **Failure Criteria:**
  - OAuth tokens visible in plaintext
  - No encryption layer
  
- **Evidence Required:**
  - Database query shows encrypted value (not readable)
  - Supabase RLS shows secrets encrypted in columns
  
- **Regression Tests:**
  - Tokens still work after decryption
  - Old unencrypted tokens not accessible

---

#### TEST-CONN-P1-002: Connector Entitlement By Tier
- **Priority:** P1
- **Subsystem:** Connectors / Tier Gating
- **Type:** Integration
- **Prerequisites:**
  - Go tier user (limited connectors)
  - Pro Max user (all connectors)
  
- **Steps:**
  1. Go user attempts to connect Jira
  2. Error: "Jira requires Pro Max tier"
  3. Pro Max user connects Jira
  4. Success
  
- **Expected Result:**
  - Tier restrictions enforced
  - Clear upgrade prompts
  - Pro Max users can connect all available connectors
  
- **Failure Criteria:**
  - Go user can connect Jira
  - No error message
  
- **Evidence Required:**
  - Error screenshot
  - ConnectorEntitlementGate applied
  
- **Regression Tests:**
  - Different connectors have different tier requirements
  - Upgrading user unlocks connectors

---

### B.4 RLS & Security

#### TEST-SEC-P1-001: RLS Policy Enforcement (Autonomous Runs)
- **Priority:** P1
- **Subsystem:** Security / RLS / Database Isolation
- **Type:** Database / Unit
- **Prerequisites:**
  - Two different users (user-A, user-B)
  - User-A created autonomous run
  - Direct Supabase access available
  
- **Steps:**
  1. Authenticate as user-B
  2. Query autonomous_task_runs
  3. Attempt to read user-A's run
  4. Verify RLS denies access
  
- **Expected Result:**
  - User-B cannot see user-A's runs
  - Query returns empty result set
  - RLS policy enforced at database level (not app level)
  
- **Failure Criteria:**
  - User-B sees user-A's runs
  - Query returns data it shouldn't
  
- **Evidence Required:**
  - Query as user-B returns no rows for user-A
  - Query as user-A returns their own rows
  - RLS policy confirms in migrations: `auth.uid()`
  
- **Regression Tests:**
  - Organization members can see org's runs (if org user)
  - Admin cannot escalate to view other users' data

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
  - Console log shows whitelisted functions exist
  - Attempts to call non-whitelisted fail (undefined)
  
- **Regression Tests:**
  - Preload bridge doesn't leak main process globals

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
  - Browser console has error log
  - Task can be retried
  
- **Regression Tests:**
  - Different outage durations handled
  - Long outages timeout gracefully

---

#### TEST-ERR-P1-002: Gemini API Error (Rate Limit / Invalid Key)
- **Priority:** P1
- **Subsystem:** Error Handling / External API
- **Type:** Integration + Live External Service
- **Prerequisites:**
  - Gemini API key available
  - Can simulate rate limit (by running many queries)
  
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
  - Billing event NOT created for failed task
  - Retry button works
  
- **Regression Tests:**
  - Invalid API key shows different error
  - Timeout errors handled differently

---

#### TEST-ERR-P1-003: Database Connection Error (Supabase Down)
- **Priority:** P1
- **Subsystem:** Error Handling / Database Resilience
- **Type:** Integration
- **Prerequisites:**
  - Supabase connectivity available
  - Can simulate Supabase outage (firewall rule or maintenance)
  
- **Steps:**
  1. Block Supabase connection
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
  - Balance unchanged
  
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
  - Network tab shows single countTokens call
  - Timing screenshot from DevTools
  
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
  - Balance >10000 tokens
  
- **Steps:**
  1. Start autonomous work on GitHub issue
  2. Authorization modal appears
  3. Confirm
  4. Execution begins
  5. Model reads issue, makes plan
  6. Applies code changes
  7. Runs tests/builds
  8. Creates PR
  9. Posts comment on PR
  10. Settlement occurs
  11. Balance decremented
  
- **Expected Result:**
  - Full workflow succeeds without error
  - All intermediate states correct
  - PR visible on real GitHub
  - Balance deducted correctly
  - Run marked as 'completed'
  
- **Failure Criteria:**
  - Any step fails
  - PR not created
  - Comment not posted
  - Balance not updated
  
- **Evidence Required:**
  - Screenshot of GitHub PR
  - Screenshot of final state (completed)
  - Supabase: run.status = 'completed', billing_event created
  - Balance decreased appropriately
  
- **Regression Tests:**
  - Different issue types (feature, bug, documentation)
  - Different repo sizes
  - Different code languages

---

#### TEST-INT-P1-002: Multi-Connector Workflow (Jira → GitHub)
- **Priority:** P1
- **Subsystem:** Integration / Multi-Connector
- **Type:** Staging/E2E (real Jira + real GitHub)
- **Prerequisites:**
  - Jira issue linked to GitHub issue
  - Both connectors connected
  
- **Steps:**
  1. Start autonomous work from Jira issue
  2. Model works, creates/updates PR on GitHub
  3. Posts comment on Jira
  4. Posts comment on GitHub PR
  5. Updates Jira status
  
- **Expected Result:**
  - Both Jira and GitHub updated
  - Comments on both platforms
  - Status transitions on both
  - Settlement handles multi-connector workflow
  
- **Failure Criteria:**
  - Only one platform updated
  - Partial failure
  
- **Evidence Required:**
  - Screenshots of both Jira issue and GitHub PR
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
  - Charges applied only for work done (if partial settlement)
  - User refunded if applicable
  
- **Evidence Required:**
  - Task status = 'cancelled'
  - Billing event (if any) reflects cancelled status
  
- **Regression Tests:**
  - Cancel during different phases
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

### C.2 Deferred / V2 Features (Do Not Test Yet)

#### TEAMS (DEFERRED TO V2)
- Teams connector not implemented
- Do not test Teams authentication or write-back

#### MEETINGS EMAIL DISTRIBUTION (DEFERRED TO V2)
- Email distribution not implemented
- Do not test email sending of summaries

#### WHATSAPP / TELEGRAM / DISCORD (DEFERRED TO V2)
- Communication channels not implemented
- Do not test these connectors

#### AVATAR GENERATION MARKETPLACE (DEFERRED TO V2)
- Marketplace not implemented
- Do not test avatar generation or purchase

#### MOBILE APP / SYNC (DEFERRED TO V2)
- Mobile app not implemented
- Do not test mobile features

#### JIRA TICKET CREATION / UPDATE (NOT IMPLEMENTED)
- Only read and comment are implemented
- Do not test Jira ticket creation or description updates

#### LINEAR TICKET CREATION / UPDATE (NOT IMPLEMENTED)
- Only read and comment are implemented
- Do not test Linear ticket creation or updates

---

---

## TEST EXECUTION STRATEGY

### Phase 1: Pre-Launch (P0 + P1)
1. **Days 1-2:** Run all P0 tests (A.1 - A.8)
   - Fix any critical blockers immediately
2. **Days 3-4:** Run all P1 tests (B.1 - B.7)
   - Document known issues
   - Triage for hot-fixes vs. post-launch

### Phase 2: Live Verification (Real External Services)
- Live Jira Cloud testing (requires real workspace + OAuth)
- Live Linear workspace testing
- Live GitHub repo testing
- Gemini API behavior under rate limits

### Phase 3: Post-Launch (P2)
- Advanced features tested after launch
- Performance monitoring in production
- User feedback integration

---

## SUCCESS CRITERIA FOR LAUNCH

**All P0 tests must pass** (A.1 - A.8):
- ✅ Authentication working (email, OAuth)
- ✅ Billing integrated (balance display, consumption)
- ✅ Autonomous work executable (entitlement, authorization, settlement)
- ✅ Executor claiming server-authoritative (Phase 2C)
- ✅ Token preflight exact (Gemini countTokens, Phase 2D)
- ✅ Model identity consistent (Phase 2B)
- ✅ Jira/Linear/GitHub integration (read + write-back)
- ✅ Meetings functional (create, summarize, persist)

**P1 tests should pass** (B.1 - B.7):
- ✅ Advanced billing features
- ✅ Resume after topup
- ✅ Manual approval mode
- ✅ RLS enforcement
- ✅ Error handling

**Known P2 items acceptable as post-launch**:
- Advanced analytics
- Invoicing
- Connector disconnection
- Cancellation during execution

---

**Test Plan Ready for User Review and Approval**

