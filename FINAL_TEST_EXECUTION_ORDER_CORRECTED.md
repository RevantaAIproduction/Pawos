# FINAL TEST EXECUTION ORDER (CORRECTED)

**Date:** 2026-09-09  
**Test Plan Version:** Corrected V3  
**Status:** READY FOR EXECUTION (pending approval)

**CRITICAL:** Test count corrected from 56 to 53 tests (29 P0 + 19 P1 + 5 P2)

---

## EXECUTION SUMMARY

All tests must be executed **ONE AT A TIME IN EXACT ORDER** listed below. Do NOT parallelize.

**Dependencies:**
- **HARD Dependencies:** Must complete before dependent tests proceed
- **SOFT/Recommended Order:** Logical grouping, not strict blocking

**Test Count:**
- P0: 29 tests (Tests 1-29) — 100% must pass
- P1: 19 tests (Tests 30-48) — 90% acceptable (100% for critical categories)
- P2: 5 tests (Tests 49-53) — 100% deferrable

---

## PHASE 1: AUTHENTICATION & SETUP (5 tests, 2-3 hours)

### Sequential Execution (HARD DEPENDENCIES):

1. **TEST-AUTH-001** (0:30)
   - Email/Password Sign Up (creates test user)
   - **HARD DEP:** BLOCKING — all other tests require this user
   - Pass/Fail: MUST pass before proceeding

2. **TEST-AUTH-002** (0:15)
   - Email/Password Sign In (existing user)
   - **HARD DEP:** Requires TEST-AUTH-001
   - Pass/Fail: MUST pass

3. **TEST-AUTH-003** (0:45)
   - Google OAuth Flow (separate Google account)
   - **Hard Dependency:** None (independent)
   - Pass/Fail: MUST pass

4. **TEST-AUTH-004** (0:20)
   - Session Persistence (restart app)
   - **HARD DEP:** Requires TEST-AUTH-001 or TEST-AUTH-003
   - Pass/Fail: MUST pass

5. **TEST-AUTH-005** (0:10)
   - Logout Flow
   - **HARD DEP:** Requires TEST-AUTH-001
   - Pass/Fail: MUST pass

---

## PHASE 2: TIER COMPUTE BILLING (4 tests, 1.5 hours)

*Continue with TEST-AUTH-001 user (Pro Max tier)*

**Dependencies:** Phase 1 complete

6. **TEST-BILL-001** (0:15)
   - View Tier & Current Credit Balance
   - **HARD DEP:** Requires authenticated user (Phase 1)
   - Pass/Fail: MUST pass (establishes baseline)

7. **TEST-BILL-002** (1:00)
   - Monitor Real AI Usage (Meetings billing via Tier Compute)
   - **HARD DEP:** Requires TEST-BILL-001 (baseline)
   - **Type:** Live external-service (Gemini API)
   - Pass/Fail: MUST pass

8. **TEST-BILL-003** (0:15)
   - Insufficient Balance Error
   - **HARD DEP:** Requires TEST-BILL-002 (usage pattern)
   - Pass/Fail: MUST pass

9. **TEST-BILL-004** (0:15)
   - Top-Up Flow (Stripe test mode)
   - **HARD DEP:** None (independent operation)
   - **Soft DEP:** After TEST-BILL-003 for logical flow
   - **CRITICAL:** Must pass — establishes Work PC balance for Tests 16+
   - Pass/Fail: MUST pass

---

## PHASE 3: CONNECTOR SETUP (6 tests, 1.5 hours)

*Continue with Pro Max user; all connectors now connected*

**Hard Dependencies:** TEST-BILL-004 (balance established)

10. **TEST-CONN-001** (0:20)
    - GitHub OAuth Connect
    - **HARD DEP:** TEST-BILL-004
    - Pass/Fail: MUST pass (required for TEST 26, 28)

11. **TEST-CONN-002** (0:20)
    - Jira OAuth Connect
    - **HARD DEP:** TEST-BILL-004
    - Pass/Fail: MUST pass (required for TEST 25)

12. **TEST-CONN-003** (0:15)
    - Linear API Key Connect
    - **HARD DEP:** TEST-BILL-004
    - Pass/Fail: MUST pass (required for TEST 27)

13. **TEST-CONN-004** (0:15)
    - Slack OAuth Connect (regression test only)
    - **HARD DEP:** TEST-BILL-004
    - **Note:** Implementation regression; live delivery separate
    - Pass/Fail: Regression test (non-blocking if fails)

14. **TEST-CONN-005** (0:10)
    - Gmail OAuth Connect (optional)
    - **HARD DEP:** TEST-BILL-004
    - Pass/Fail: Optional (can defer to P1)

15. **TEST-CONN-006** (0:10)
    - Google Calendar OAuth Connect (optional)
    - **HARD DEP:** TEST-BILL-004
    - Pass/Fail: Optional (can defer to P1)

---

## PHASE 4: AUTONOMOUS ARCHITECTURE (5 tests, 2.5 hours)

*All connectors connected; Pro Max user with Work PC balance*

**Hard Dependencies:** Tests 10-12 (Jira, Linear, GitHub connectors)

16. **TEST-AUTO-001** (0:30)
    - Start Autonomous Work (entitlement check)
    - **HARD DEP:** TEST-BILL-004 (Work PC balance)
    - **HARD DEP:** Phase 3 complete (connectors)
    - Pass/Fail: MUST pass (confirms entitlement gate)

17. **TEST-AUTO-002** (0:30)
    - Executor Claiming (Phase 2C)
    - **HARD DEP:** TEST-AUTO-001 (running task)
    - **Type:** Manual source inspection + DB verification
    - Pass/Fail: MUST pass (confirms blocker fixed)

18. **TEST-AUTO-003** (0:30)
    - Model Identity Consistency (Phase 2B)
    - **HARD DEP:** TEST-AUTO-001
    - **Type:** Manual source inspection
    - Pass/Fail: MUST pass (confirms blocker fixed)

19. **TEST-AUTO-004** (0:45)
    - Exact Token Preflight (Phase 2D)
    - **HARD DEP:** TEST-AUTO-001
    - **Type:** Live external-service (Gemini API)
    - Pass/Fail: MUST pass (confirms blocker fixed)

20. **TEST-AUTO-005** (0:30)
    - Autonomous Authorization (Work PC Reservation)
    - **HARD DEP:** TEST-AUTO-001, TEST-AUTO-004
    - **Type:** Automated integration + DB verification
    - Pass/Fail: MUST pass (confirms authorization working)

---

## PHASE 5: AUTONOMOUS EXECUTION (3 tests, 2 hours)

*All architecture verified (Tests 16-20)*

**Hard Dependencies:** Tests 16-20 (architecture verified)

21. **TEST-AUTO-006** (1:00)
    - Autonomous Execution (full runtime)
    - **HARD DEP:** Tests 16-20
    - **Type:** Staging/E2E + Manual Electron/runtime
    - **Requires:** Real GitHub repo with issue
    - Pass/Fail: MUST pass (confirms execution works)

22. **TEST-AUTO-007** (0:45)
    - Failure States (timeout, cancel, error)
    - **HARD DEP:** Tests 16-20
    - **Type:** Staging/E2E + Manual Electron/runtime
    - Pass/Fail: MUST pass (confirms error handling)

23. **TEST-AUTO-008** (0:15)
    - Settlement (Work PC)
    - **HARD DEP:** TEST-AUTO-006 (completed task)
    - **Type:** Automated integration + DB verification
    - **Exact RPC:** settle_autonomous_task_run_pc()
    - Pass/Fail: MUST pass (confirms settlement working)

---

## PHASE 6: CONNECTOR WRITE-BACK (6 tests, 1 hour)

*Pro Max user; all connectors connected*

**Hard Dependencies:** Tests 10-12 (connectors), TEST-AUTO-008 (autonomous work completed)

24. **TEST-JIRA-001** (0:20)
    - Read Jira Issues
    - **HARD DEP:** TEST-CONN-002 (Jira connected)
    - **Type:** Live external-service (real Jira Cloud)
    - Pass/Fail: MUST pass

25. **TEST-JIRA-002** (0:20)
    - Jira Comment + Status Transition (IMPLEMENTED)
    - **HARD DEP:** TEST-AUTO-008 (autonomous work), TEST-CONN-002
    - **Type:** Live external-service + Staging/E2E
    - **Requires:** Jira issue available
    - Pass/Fail: MUST pass (launch connector capability)

26. **TEST-LINEAR-001** (0:10)
    - Read Linear Issues
    - **HARD DEP:** TEST-CONN-003 (Linear connected)
    - **Type:** Live external-service (real Linear)
    - Pass/Fail: MUST pass

27. **TEST-LINEAR-002** (0:10)
    - Linear Comment + Status Transition (IMPLEMENTED)
    - **HARD DEP:** TEST-AUTO-008, TEST-CONN-003
    - **Type:** Live external-service + Staging/E2E
    - **Requires:** Linear issue available
    - Pass/Fail: MUST pass (launch connector capability)

28. **TEST-GITHUB-001** (0:10)
    - Read GitHub Issues & PRs
    - **HARD DEP:** TEST-CONN-001 (GitHub connected)
    - **Type:** Live external-service (real GitHub)
    - Pass/Fail: MUST pass

29. **TEST-GITHUB-002** (0:10)
    - GitHub PR Comment (on existing PR)
    - **HARD DEP:** TEST-AUTO-008, TEST-CONN-001
    - **Type:** Live external-service + Staging/E2E
    - **Note:** Existing PR (not creation, which is dormant)
    - Pass/Fail: MUST pass (launch connector capability)

---

## END OF P0 TESTS (29 total)

**All 29 P0 tests completed — 100% must pass before launch decision**

---

## PHASE 7: P1 ADVANCED TESTS (19 tests, 3+ hours)

*Only if all 29 P0 tests pass*

### P1 Critical (100% required):
- Tests 30-33 (RLS/data isolation, security)

### P1 Non-Critical (90% acceptable):
- Tests 34-48 (billing, autonomous, performance, integration)

30. **TEST-AUTO-P1-001** (0:30)
    - Resume After Top-Up (same executor)
    - **HARD DEP:** None
    - **Soft DEP:** After TEST-AUTO-009 (waiting_for_topup testing)
    - Pass/Fail: Critical — 100% required

31. **TEST-AUTO-P1-002** (0:40)
    - Waiting For Permission (manual mode)
    - **HARD DEP:** None
    - Pass/Fail: Critical — 100% required

32. **TEST-AUTO-P1-003** (0:20)
    - Connector Entitlement Gate
    - **HARD DEP:** None
    - Pass/Fail: Critical — 100% required

33. **TEST-AUTO-P1-004** (0:15)
    - Cancellation Before Provider Work (zero charge)
    - **HARD DEP:** None
    - Pass/Fail: Non-critical — 90% acceptable

34. **TEST-AUTO-P1-005** (0:20)
    - Cancellation After Provider Work (partial charge)
    - **HARD DEP:** None
    - Pass/Fail: Non-critical — 90% acceptable

35. **TEST-SEC-P1-001A** (0:15)
    - RLS Source Verification (migrations)
    - **HARD DEP:** None (static code verification)
    - **Type:** Static/source verification
    - Pass/Fail: Critical — 100% required

36. **TEST-SEC-P1-001B** (0:15)
    - RLS Schema Verification (staging DB)
    - **HARD DEP:** None (requires staging DB access)
    - **Type:** Database/security verification
    - Pass/Fail: Critical — 100% required

37. **TEST-SEC-P1-001C** (0:20)
    - RLS Enforcement (cross-user test)
    - **HARD DEP:** None (requires two test users)
    - **Type:** Database/security verification
    - Pass/Fail: Critical — 100% required

38. **TEST-SEC-P1-002** (0:15)
    - IPC Boundary (preload restrictions)
    - **HARD DEP:** None
    - **Type:** Manual Electron/runtime
    - Pass/Fail: Critical — 100% required

[Additional P1 tests 39-48: billing, resilience, performance, integration...]

---

## PHASE 8: P2 POST-LAUNCH TESTS (5 tests)

*Only if needed; 100% deferrable*

49. **TEST-BILL-P2-001**
    - Invoice Generation

50. **TEST-MEET-P2-001** (DEFERRED — Meetings V2)
    - Meeting Analytics

51. **TEST-CONN-P2-001**
    - Disconnect Connector

52. **TEST-AUTO-P2-001**
    - Autonomous Cancellation UI

53. **TEST-PRJ-P2-001**
    - Projects CRUD

---

## LAUNCH DECISION GATES

### Mandatory (100% P0 Pass Required)
✅ Tests 1-29 (29 P0 tests)
✅ All critical categories pass

### Important (90% P1 Non-Critical Acceptable)
✅ Tests 30-48 (19 P1 tests)
- Critical subcategory (30-38): 100%
- Non-critical (39-48): 90%

### Post-Launch (100% Deferrable)
✅ Tests 49-53 (5 P2 tests) — can skip entirely

---

## KEY DEPENDENCIES AT A GLANCE

```
TEST-AUTH-001 (create user)
  ↓ (HARD)
TEST-AUTH-002, TEST-AUTH-003, TEST-AUTH-004, TEST-AUTH-005

TEST-BILL-004 (establish Work PC balance)
  ↓ (HARD)
TEST-AUTO-001, TEST-CONN-001, TEST-CONN-002, TEST-CONN-003

TEST-AUTO-001 + Tests 16-20 (architecture)
  ↓ (HARD)
TEST-AUTO-006, TEST-AUTO-007, TEST-AUTO-008

TEST-AUTO-008 (autonomous work completed)
  ↓ (HARD)
TEST-JIRA-002, TEST-LINEAR-002, TEST-GITHUB-002

TEST-CONN-002 (Jira connected)
  ↓ (HARD)
TEST-JIRA-001, TEST-JIRA-002

TEST-CONN-003 (Linear connected)
  ↓ (HARD)
TEST-LINEAR-001, TEST-LINEAR-002

TEST-CONN-001 (GitHub connected)
  ↓ (HARD)
TEST-GITHUB-001, TEST-GITHUB-002
```

---

## EXECUTION INSTRUCTIONS

1. **Do NOT skip ahead:** Execute tests in exact order 1-53
2. **On P0 failure:** STOP, report to engineering, fix required
3. **On P1 failure:** Continue testing, triage after Phase 8
4. **On P2 failure:** Defer to post-launch, no impact
5. **Dependencies:** Must complete before dependent tests (see chart above)
6. **Soft order:** Phases sequence for logical grouping, not hard blocking
7. **Evidence:** Capture screenshots, logs, Supabase queries for each test
8. **Timing:** Budget 1-2 min setup, 5-60 min execution per test

**Total Estimated Duration:** 15-17 hours for P0+P1 tests

---

**Status:** CORRECTED V3 — Ready for Approval

