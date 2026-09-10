# FINAL TEST EXECUTION ORDER

**Date:** 2026-09-09  
**Test Plan Version:** Revised V2 (Audited & Corrected)  
**Status:** READY FOR SEQUENTIAL EXECUTION

---

## EXECUTION PHASES & SEQUENCING

All tests must be executed **ONE AT A TIME IN EXACT ORDER** listed below. Do not parallelize or skip ahead without completing prior tests.

### CRITICAL PRE-EXECUTION CHECKLIST

Before starting ANY test:
- [ ] Supabase staging environment accessible
- [ ] Stripe test mode enabled
- [ ] Gmail/Google OAuth app configured
- [ ] GitHub OAuth app configured
- [ ] Jira Cloud workspace with OAuth app ready
- [ ] Linear workspace with API key available
- [ ] Real Gemini API key available
- [ ] PawOS Electron app can launch
- [ ] Network isolation capability available (for network error tests)
- [ ] Two separate test Supabase users created

---

## PHASE 1: AUTHENTICATION & SETUP (2-3 hours)

### Sequential Execution (must complete in order):

1. **TEST-AUTH-001** (0:30) — Email/Password Sign Up (New User)
   - Creates test account for all subsequent tests
   - **BLOCKING:** All other tests require authenticated user
   - Evidence: Screenshot, Supabase auth user record
   - Pass/Fail: Must pass before proceeding

2. **TEST-AUTH-002** (0:15) — Email/Password Sign In (Existing User)
   - Verifies authentication stability
   - Uses account created in TEST-AUTH-001
   - Evidence: Screenshot, session token
   - Pass/Fail: Must pass

3. **TEST-AUTH-003** (0:45) — Google OAuth Flow (Sign Up)
   - New account via Google (separate from EMAIL account)
   - Evidence: OAuth token security, Supabase provider link
   - Pass/Fail: Must pass

4. **TEST-AUTH-004** (0:20) — Session Persistence (Restart App)
   - Uses authenticated session from TEST-AUTH-001
   - Restart PawOS app
   - Evidence: Dashboard loads without sign-in
   - Pass/Fail: Must pass

5. **TEST-AUTH-005** (0:10) — Logout Flow
   - Uses authenticated session
   - Evidence: Sign-in page after logout
   - Pass/Fail: Must pass (re-authenticate for next phase)

---

## PHASE 2: TIER COMPUTE BILLING BASICS (1.5 hours)

*Re-authenticate using TEST-AUTH-001 account (Pro Max tier)*

6. **TEST-BILL-001** (0:15) — View Tier & Current Credit Balance
   - Verify UI displays correct tier and balance
   - Evidence: Balance screenshot, Supabase query
   - Pass/Fail: Must pass (establishes baseline balance)

7. **TEST-BILL-002** (1:00) — Monitor Real AI Usage Consumption (Meetings)
   - **REQUIRES:** Gemini API accessible, audio/meeting available
   - Creates meeting, requests summarization
   - Evidence: Before/after balance, billing event
   - Pass/Fail: Must pass (confirms Tier Compute integration)

8. **TEST-BILL-003** (0:15) — Insufficient Balance Error (Exact Preflight)
   - **REQUIRES:** Ability to set user balance to 100 tokens (admin/fixture)
   - Attempts meeting summarization over limit
   - Evidence: Error message, unchanged balance
   - Pass/Fail: Must pass

9. **TEST-BILL-004** (0:15) — Top-Up Flow (Purchase Credits)
   - Navigate to Billing, add $20 via Stripe test card
   - Evidence: Confirmation, balance increase
   - Pass/Fail: Must pass (establishes balance for autonomous tests)

---

## PHASE 3: CONNECTOR SETUP (1.5 hours)

*Continue with Pro Max user from Phase 2*

10. **TEST-CONN-001** (0:20) — GitHub OAuth Connect
    - **REQUIRES:** GitHub OAuth app configured
    - Navigate to Settings → Connections → GitHub
    - Evidence: Connected status, token security check
    - Pass/Fail: Must pass (required for later GitHub tests)

11. **TEST-CONN-002** (0:20) — Jira OAuth Connect
    - **REQUIRES:** Jira Cloud workspace with OAuth app
    - Navigate to Settings → Connections → Jira
    - Evidence: Connected status, workspace domain saved
    - Pass/Fail: Must pass (required for Jira tests)

12. **TEST-CONN-003** (0:15) — Linear API Key Connect
    - **REQUIRES:** Linear workspace with API key
    - Navigate to Settings → Connections → Linear
    - Evidence: Connected status, key validated
    - Pass/Fail: Must pass (required for Linear tests)

13. **TEST-CONN-004** (0:15) — Slack OAuth Connect
    - **REQUIRES:** Slack OAuth app configured
    - Navigate to Settings → Connections → Slack
    - Evidence: Connected status
    - Pass/Fail: Regression test only (frozen feature)

14. **TEST-CONN-005** (0:10) — Gmail OAuth Connect
    - Optional; may be deferred
    - Evidence: Connected status
    - Pass/Fail: Can defer to P1 phase

15. **TEST-CONN-006** (0:10) — Google Calendar OAuth Connect
    - Optional; may be deferred
    - Evidence: Connected status
    - Pass/Fail: Can defer to P1 phase

---

## PHASE 4: AUTONOMOUS WORK ARCHITECTURE (2.5 hours)

*Continue with Pro Max user; all connectors now connected*

16. **TEST-AUTO-001** (0:30) — Start Autonomous Work (Entitlement Check)
    - Verify authorization modal, Work PC cost display
    - Evidence: Modal screenshot, IPC logs
    - Pass/Fail: Must pass (confirms entitlement gate)

17. **TEST-AUTO-002** (0:30) — Executor Claiming (Phase 2C)
    - Trace AutonomousOrchestrator execution
    - Verify RPC called before authorization
    - Evidence: Console logs, RPC response, server-generated UUID
    - Pass/Fail: Must pass (confirms executor claim blocker is fixed)

18. **TEST-AUTO-003** (0:30) — Model Identity Consistency (Phase 2B)
    - Verify same model throughout (authorization + execution)
    - Evidence: Console logs, Network tab, source inspection
    - Pass/Fail: Must pass (confirms model consistency blocker is fixed)

19. **TEST-AUTO-004** (0:45) — Exact Token Preflight (Phase 2D)
    - Verify Gemini countTokens API called (not chars/4 heuristic)
    - Evidence: Network tab shows countTokens call, response tokens
    - Pass/Fail: Must pass (confirms token preflight blocker is fixed)

20. **TEST-AUTO-005** (0:30) — Autonomous Authorization (Work PC Reservation)
    - Verify authorization RPC, Work PC reservation created
    - Evidence: Network tab, RPC response, Supabase reservation rows
    - Pass/Fail: Must pass (confirms authorization working)

---

## PHASE 5: AUTONOMOUS EXECUTION (2 hours)

*Continue with Pro Max user; all architecture verified*

21. **TEST-AUTO-006** (1:00) — Autonomous Execution (Conversation Runtime)
    - Execute sample autonomous task with GitHub issue
    - **REQUIRES:** Real or test GitHub repo with issue
    - Evidence: ExecutionRecord, command outputs, verification results
    - Pass/Fail: Must pass (confirms execution path works)

22. **TEST-AUTO-007** (0:45) — Autonomous Failure States
    - Test three failure scenarios: timeout, cancel, model error
    - Evidence: State transitions, error messages
    - Pass/Fail: Must pass (confirms error handling)

23. **TEST-AUTO-008** (0:15) — Settlement (Work PC Settlement RPC)
    - Verify settlement RPC called with actual Work PC
    - Evidence: RPC call to settle_autonomous_task_run_pc, billing event
    - Pass/Fail: Must pass (confirms settlement integration)

---

## PHASE 6: CONNECTOR INTEGRATION (1 hour)

*Continue with Pro Max user*

24. **TEST-JIRA-001** (0:20) — Read Jira Issues
    - Browse connected Jira workspace
    - Evidence: Issue list, issue details screenshots
    - Pass/Fail: Must pass

25. **TEST-JIRA-002** (0:20) — Jira Comment + Status Transition
    - **REQUIRES:** Jira issue available for write-back test
    - Complete autonomous work, verify comment + Done transition
    - Evidence: Screenshot of Jira issue with comment and Done status
    - Pass/Fail: Must pass (confirms Jira write-back working)

26. **TEST-LINEAR-001** (0:10) — Read Linear Issues
    - Browse connected Linear workspace
    - Evidence: Issue list screenshot
    - Pass/Fail: Must pass

27. **TEST-LINEAR-002** (0:10) — Linear Comment + Status Transition
    - **REQUIRES:** Linear issue available
    - Complete work, verify comment + Done transition
    - Evidence: Linear UI screenshot with comment and Done
    - Pass/Fail: Must pass

28. **TEST-GITHUB-001** (0:10) — Read GitHub Issues & PRs
    - Browse GitHub repos
    - Evidence: Issue/PR list screenshot
    - Pass/Fail: Must pass

29. **TEST-GITHUB-002** (0:10) — GitHub PR Comment
    - Post comment on existing PR
    - Evidence: PR with comment visible
    - Pass/Fail: Must pass

---

## PHASE 7: MEETINGS (1 hour)

*Continue with Pro Max user; Tier Compute balance available*

30. **TEST-MEET-001** (0:15) — Create/Upload Meeting
    - Create new meeting
    - Evidence: Meeting in list
    - Pass/Fail: Must pass

31. **TEST-MEET-002** (0:40) — Request Meeting Summarization
    - **REQUIRES:** Gemini API accessible
    - Summarize meeting, verify Tier Compute decremented
    - Evidence: Summary text, balance before/after, billing event
    - Pass/Fail: Must pass

32. **TEST-MEET-003** (0:05) — Meeting Persistence & Retrieval
    - Restart app, verify meetings and summaries persist
    - Evidence: Meetings list after restart
    - Pass/Fail: Must pass

---

## PHASE 8: P1 ADVANCED TESTS (3 hours)

*All P0 tests must pass before starting P1*

33. **TEST-BILL-P1-001** (0:30) — Volume-Tiered Work PC Pricing
    - Check pricing tiers
    - Evidence: Billing event shows correct rate tier
    - Pass/Fail: Should pass; non-blocking if fails

34. **TEST-BILL-P1-002** (0:30) — Free Tier Limits (Tier Compute Quota)
    - Create Go tier user, test quota enforcement
    - Evidence: Quota enforced, error message
    - Pass/Fail: Should pass; non-blocking if fails

35. **TEST-BILL-P1-003** (0:20) — Referral Credit Redemption
    - If referral credits available, test redemption
    - Evidence: Balance increase
    - Pass/Fail: Should pass; skip if no referral credits

36. **TEST-AUTO-P1-001** (0:30) — Resume After Top-Up
    - Set user to waiting_for_topup state, add credits, verify resume
    - Evidence: Same executor_instance_id reused, no double charge
    - Pass/Fail: Should pass; non-blocking if fails

37. **TEST-AUTO-P1-002** (0:40) — Waiting For Permission (Manual Mode)
    - Use Pro tier user (no autonomousPlanBypass), verify permission modal
    - Evidence: Permission modal, task state waiting_for_permission
    - Pass/Fail: Should pass; non-blocking if fails

38. **TEST-AUTO-P1-003** (0:20) — Connector Entitlement Gate
    - Disconnect Jira, try to start Jira task, verify error
    - Evidence: "Jira not connected" error
    - Pass/Fail: Should pass; non-blocking if fails

39. **TEST-AUTO-P1-004** (0:15) — Cancellation Before Provider Work
    - Cancel task before Gemini API calls, verify zero charge
    - Evidence: Task status cancelled, no billing event
    - Pass/Fail: Should pass; non-blocking if fails

40. **TEST-AUTO-P1-005** (0:20) — Cancellation After Provider Work
    - Cancel after Gemini calls, verify partial charge
    - Evidence: Billing event with actual_work_pc > 0
    - Pass/Fail: Should pass; non-blocking if fails

41. **TEST-SEC-P1-001A** (0:15) — RLS Source Verification (Migrations)
    - Inspect migration files for RLS statements
    - Evidence: Screenshot of CREATE POLICY statements
    - Pass/Fail: Must pass (source verification)

42. **TEST-SEC-P1-001B** (0:15) — RLS Schema Verification (Policies on DB)
    - Query pg_policies on staging Supabase
    - Evidence: Query result showing policies exist
    - Pass/Fail: Should pass; required for staging

43. **TEST-SEC-P1-001C** (0:20) — RLS Enforcement (Cross-User Access)
    - Authenticate as user-B, attempt to read user-A's runs
    - Evidence: Zero rows returned
    - Pass/Fail: Should pass; required for staging

44. **TEST-SEC-P1-002** (0:15) — IPC Boundary (Preload Restrictions)
    - Open DevTools, verify whitelisted functions only
    - Evidence: Console log showing function availability
    - Pass/Fail: Should pass; non-blocking if fails

45. **TEST-ERR-P1-001** (0:30) — Network Error Recovery
    - Simulate network outage during task, verify error handling
    - Evidence: Error message, task recoverable
    - Pass/Fail: Should pass; non-blocking if fails

46. **TEST-ERR-P1-002** (0:30) — Gemini API Error (Rate Limit)
    - Trigger rate limit, verify error and retry mechanism
    - Evidence: Error message, no charge, retry works
    - Pass/Fail: Should pass; non-blocking if fails

47. **TEST-ERR-P1-003** (0:20) — Database Connection Error
    - Simulate Supabase outage, verify error handling
    - Evidence: Error message, no task created, balance unchanged
    - Pass/Fail: Should pass; non-blocking if fails

48. **TEST-PERF-P1-001** (0:15) — Token Preflight Latency
    - Measure Gemini countTokens latency
    - Evidence: Timing <1 second
    - Pass/Fail: Should pass; non-blocking if fails

49. **TEST-PERF-P1-002** (0:15) — Authorization RPC Latency
    - Measure authorization RPC latency per turn
    - Evidence: Timing <500ms per call
    - Pass/Fail: Should pass; non-blocking if fails

50. **TEST-INT-P1-001** (1:00) — Full Autonomous Workflow E2E
    - Complete full workflow: issue → execution → settlement → external update
    - Evidence: Final state, balance change, Supabase records
    - Pass/Fail: Should pass; comprehensive validation

51. **TEST-INT-P1-002** (0:30) — Multi-Connector Workflow
    - Test Jira + GitHub together in one autonomous run
    - Evidence: Both platforms updated
    - Pass/Fail: Should pass; advanced integration test

---

## PHASE 9: P2 POST-LAUNCH TESTS (Not required before launch)

Tests 52-58 can be deferred to post-launch:

52. **TEST-BILL-P2-001** — Invoice Generation
53. **TEST-MEET-P2-001** — Meeting Analytics
54. **TEST-CONN-P2-001** — Disconnect Connector
55. **TEST-AUTO-P2-001** — Autonomous Cancellation UI
56. **TEST-PRJ-P2-001** — Projects CRUD

*Plus any additional regression tests identified during Phase 1-8*

---

## TOTAL EXECUTION TIME ESTIMATE

- **Phase 1 (Auth):** 2-3 hours
- **Phase 2 (Tier Compute Billing):** 1.5 hours
- **Phase 3 (Connectors):** 1.5 hours
- **Phase 4 (Autonomous Architecture):** 2.5 hours
- **Phase 5 (Execution):** 2 hours
- **Phase 6 (Connectors):** 1 hour
- **Phase 7 (Meetings):** 1 hour
- **Phase 8 (P1 Advanced):** 3+ hours

**Total:** ~15-17 hours for P0 + P1 tests

---

## PASS/FAIL THRESHOLDS

### LAUNCH GO/NO-GO DECISION:

**MUST PASS (P0):**
- Tests 1-32 (all phases 1-7): 100% pass required

**SHOULD PASS (P1):**
- Tests 33-51: 90% pass rate acceptable
  - Up to 5 P1 test failures can be documented as known issues for post-launch fix
  - More than 5 P1 failures: escalate to engineering for triage

**CAN DEFER (P2):**
- Tests 52+: 100% deferrable to post-launch

---

## EXECUTION INSTRUCTIONS FOR TESTER

1. **Do NOT skip ahead:** Execute tests in exact order listed
2. **Document each result:** Pass/Fail, evidence captured
3. **On P0 failure:** STOP, report to engineering, fix required before proceeding
4. **On P1 failure:** Continue testing, document issue, review after Phase 8
5. **On P2:** Defer all tests, no blocking impact
6. **Timing:** Budget 1-2 minutes per test for setup; 5-60 minutes for execution
7. **Evidence:** Capture every screenshot, query result, error message
8. **Regression:** Run tests in order; skipping dependencies may cause cascading failures

---

**All 51 P0+P1 tests are now sequenced for execution.**

Execute one at a time in order. Do not parallelize or skip ahead.

