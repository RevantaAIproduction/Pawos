# FINAL TEST EXECUTION ORDER (FINAL CORRECTED V4)

**Date:** 2026-09-09  
**Status:** READY FOR EXECUTION (pending approval)

**CRITICAL:** Final test count corrected from 53 to 51 tests  
- P0: 27 tests (Tests 1-27)
- P1: 19 tests (Tests 28-46)
- P2: 5 tests (Tests 47-51)

---

## EXECUTION SUMMARY

Execute tests **ONE AT A TIME** following the recommended sequence below. Do NOT parallelize.

**Hard Dependencies:** Must complete before dependent tests proceed (blocking)
**Soft/Recommended Order:** Logical grouping for efficient execution, not blocking dependencies

---

## PHASE 1: AUTHENTICATION & SETUP (5 tests, 2-3 hours)

### Sequential Execution (HARD DEPENDENCIES):

**1. TEST-AUTH-001** (0:30) — Email/Password Sign Up
- Creates test user
- **HARD DEP:** Blocks all other tests (requires authenticated user)
- Pass/Fail: MUST pass before proceeding

**2. TEST-AUTH-002** (0:15) — Email/Password Sign In
- Verifies auth stability
- **HARD DEP:** Requires TEST-AUTH-001
- Pass/Fail: MUST pass

**3. TEST-AUTH-003** (0:45) — Google OAuth Flow
- Separate Google account
- **HARD DEP:** None (independent)
- Pass/Fail: MUST pass

**4. TEST-AUTH-004** (0:20) — Session Persistence (Restart App)
- **HARD DEP:** Requires TEST-AUTH-001 or TEST-AUTH-003
- Pass/Fail: MUST pass

**5. TEST-AUTH-005** (0:10) — Logout Flow
- **HARD DEP:** Requires TEST-AUTH-001
- Pass/Fail: MUST pass (re-authenticate for Phase 2)

---

## PHASE 2: TIER COMPUTE BILLING (2 tests, 0.5 hours)

*Continue with TEST-AUTH-001 user (Pro Max tier)*

**CRITICAL NOTE:** Meetings-related billing tests (former TEST-BILL-002 and TEST-BILL-003) are MOVED TO V2/DEFERRED because meetings product UI is not implemented. Only core billing tests remain.

**6. TEST-BILL-001** (0:15) — View Tier & Current Credit Balance
- Verify UI displays correct tier and balance
- **HARD DEP:** TEST-AUTH-002 (authenticated Pro Max user)
- **Type:** Staging/E2E
- Pass/Fail: MUST pass (establishes baseline for billing)

**7. TEST-BILL-004** (0:15) — Top-Up Flow (Purchase Credits)
- Add $20 via Stripe test mode
- **HARD DEP:** None (independent balance operation)
- **Type:** Staging/E2E
- **CRITICAL:** Establishes Work PC balance for autonomous tests 14+
- Pass/Fail: MUST pass

---

## PHASE 3: CONNECTOR SETUP (6 tests, 1.5 hours)

*Continue with Pro Max user; all connectors now connected*

**Hard Dependencies:** TEST-BILL-004 (balance established)

**8. TEST-CONN-001** (0:20) — GitHub OAuth Connect
- **Hard Dep:** TEST-BILL-004
- **Type:** Staging/E2E (live GitHub OAuth)
- Pass/Fail: MUST pass (required for tests 25, 27)

**9. TEST-CONN-002** (0:20) — Jira OAuth Connect
- **Hard Dep:** TEST-BILL-004
- **Type:** Staging/E2E (live Jira Cloud OAuth)
- Pass/Fail: MUST pass (required for tests 24, 25)

**10. TEST-CONN-003** (0:15) — Linear API Key Connect
- **Hard Dep:** TEST-BILL-004
- **Type:** Staging/E2E (live Linear API)
- Pass/Fail: MUST pass (required for test 26)

**11. TEST-CONN-004** (0:15) — Slack OAuth Connect (Regression)
- **Hard Dep:** TEST-BILL-004
- **Type:** Staging/E2E
- **STATUS:** REGRESSION TEST ONLY (frozen feature, bug-fixes only)
- **NOTE:** Live Slack message delivery is NOT a launch requirement
- **Note:** This test verifies the existing Slack connection implementation still works
- Pass/Fail: MUST pass (regression test)

**12. TEST-CONN-005** (0:10) — Gmail OAuth Connect (Optional)
- **Hard Dep:** TEST-BILL-004
- **Type:** Staging/E2E
- Pass/Fail: Can defer to P1 if time-constrained

**13. TEST-CONN-006** (0:10) — Google Calendar OAuth Connect (Optional)
- **Hard Dep:** TEST-BILL-004
- **Type:** Staging/E2E
- Pass/Fail: Can defer to P1 if time-constrained

---

## PHASE 4: AUTONOMOUS ARCHITECTURE (5 tests, 2.5 hours)

*All connectors connected; Pro Max user with Work PC balance (from TEST-BILL-004)*

**Hard Dependencies:** Tests 8-10 (Jira, Linear, GitHub connectors)

**14. TEST-AUTO-001** (0:30) — Start Autonomous Work (Entitlement Check)
- Verify authorization modal, Work PC cost display
- **HARD DEP:** TEST-BILL-004 (Work PC balance)
- **Type:** Manual source inspection + Database verification
- Pass/Fail: MUST pass (confirms entitlement gate working)

**15. TEST-AUTO-002** (0:30) — Executor Claiming (Phase 2C)
- Trace AutonomousOrchestrator execution
- Verify RPC called before authorization, server-generated UUID
- **HARD DEP:** TEST-AUTO-001
- **Type:** Manual source inspection + Database verification
- Pass/Fail: MUST pass (confirms executor claim blocker fixed)

**16. TEST-AUTO-003** (0:30) — Model Identity Consistency (Phase 2B)
- Verify same model throughout authorization + execution
- **HARD DEP:** TEST-AUTO-001
- **Type:** Manual source inspection + Automated integration
- Pass/Fail: MUST pass (confirms model consistency blocker fixed)

**17. TEST-AUTO-004** (0:45) — Exact Token Preflight (Phase 2D)
- Verify Gemini countTokens API called (not chars/4 heuristic)
- **HARD DEP:** TEST-AUTO-001
- **Type:** Live external-service (Gemini API) + Manual inspection
- Pass/Fail: MUST pass (confirms token preflight blocker fixed)

**18. TEST-AUTO-005** (0:30) — Autonomous Authorization (Work PC Reservation)
- Verify authorization RPC, Work PC reservation created
- **HARD DEP:** TEST-AUTO-001, TEST-AUTO-004
- **Type:** Automated integration + Database verification
- Pass/Fail: MUST pass (confirms authorization working)

---

## PHASE 5: AUTONOMOUS EXECUTION (3 tests, 2 hours)

*All architecture verified (Tests 14-18)*

**Hard Dependencies:** Tests 14-18 (architecture verified)

**19. TEST-AUTO-006** (1:00) — Autonomous Execution (Conversation Runtime)
- Execute sample autonomous task with GitHub issue
- **HARD DEP:** Tests 14-18
- **Type:** Staging/E2E + Manual Electron/runtime
- Pass/Fail: MUST pass (confirms execution path works)

**20. TEST-AUTO-007** (0:45) — Autonomous Failure States
- Test timeout, cancel, model error scenarios
- **HARD DEP:** Tests 14-18
- **Type:** Staging/E2E + Manual Electron/runtime
- Pass/Fail: MUST pass (confirms error handling)

**21. TEST-AUTO-008** (0:15) — Settlement (Work PC Settlement RPC)
- Verify settlement RPC called with actual Work PC
- **HARD DEP:** TEST-AUTO-006 (completed task)
- **Exact RPC:** settle_autonomous_task_run_pc()
- **Type:** Automated integration + Database verification
- Pass/Fail: MUST pass (confirms settlement working)

---

## PHASE 6: CONNECTOR WRITE-BACK (6 tests, 1 hour)

*Pro Max user; all connectors connected*

**Hard Dependencies:** Tests 8-10 (connectors), TEST-AUTO-008 (autonomous work completed)

**22. TEST-JIRA-001** (0:20) — Read Jira Issues
- Browse connected Jira workspace
- **HARD DEP:** TEST-CONN-002
- **Type:** Live external-service (real Jira Cloud)
- Pass/Fail: MUST pass

**23. TEST-JIRA-002** (0:20) — Jira Comment + Status Transition
- Complete autonomous work, verify comment + Done transition
- **HARD DEP:** TEST-AUTO-008, TEST-CONN-002
- **Type:** Live external-service + Staging/E2E
- **Implemented Scope:** Comment + transition to Done
- **Scope Exclusions:** Jira ticket creation, advanced transitions (deferred to V2)
- Pass/Fail: MUST pass (launch connector capability)

**24. TEST-LINEAR-001** (0:10) — Read Linear Issues
- Browse connected Linear workspace
- **HARD DEP:** TEST-CONN-003
- **Type:** Live external-service (real Linear)
- Pass/Fail: MUST pass

**25. TEST-LINEAR-002** (0:10) — Linear Comment + Status Transition
- Complete work, verify comment + Done transition
- **HARD DEP:** TEST-AUTO-008, TEST-CONN-003
- **Type:** Live external-service + Staging/E2E
- **Implemented Scope:** Comment + transition to Done
- **Scope Exclusions:** Linear ticket creation, advanced transitions (deferred to V2)
- Pass/Fail: MUST pass (launch connector capability)

**26. TEST-GITHUB-001** (0:10) — Read GitHub Issues & PRs
- Browse GitHub repos
- **HARD DEP:** TEST-CONN-001
- **Type:** Live external-service (real GitHub)
- Pass/Fail: MUST pass

**27. TEST-GITHUB-002** (0:10) — GitHub PR Comment (Existing PR)
- Post comment on existing PR
- **HARD DEP:** TEST-AUTO-008, TEST-CONN-001
- **Type:** Live external-service + Staging/E2E
- **Implemented Scope:** Comment on existing PR
- **Scope Exclusions:** GitHub PR creation (dormant stub, NOT functional, NOT a launch requirement)
- Pass/Fail: MUST pass (launch connector capability)

---

## END OF P0 TESTS (27 total)

**All 27 P0 tests completed — 100% must pass before launch decision**

---

## PHASE 7: P1 CRITICAL & ADVANCED TESTS (19 tests, 3+ hours)

*Only if all 27 P0 tests pass*

### P1 Critical Tests (100% required):

**28. TEST-AUTO-P1-001** — Resume After Top-Up
**29. TEST-AUTO-P1-002** — Waiting For Permission (Manual Mode)
**30. TEST-AUTO-P1-003** — Connector Entitlement Gate
**31. TEST-SEC-P1-001A** — RLS Source Verification
**32. TEST-SEC-P1-001B** — RLS Schema Verification
**33. TEST-SEC-P1-001C** — RLS Enforcement (Cross-User)
**34. TEST-SEC-P1-002** — IPC Boundary Security

*Pass/Fail: Critical — 100% required before launch*

### P1 Non-Critical Tests (90% acceptable):

**35. TEST-AUTO-P1-004** — Cancellation Before Provider Work
**36. TEST-AUTO-P1-005** — Cancellation After Provider Work
**37. TEST-BILL-P1-001** — Volume-Tiered Work PC Pricing
**38. TEST-BILL-P1-002** — Free Tier Limits (Go Tier Quota)
**39. TEST-BILL-P1-003** — Referral Credit Redemption
**40. TEST-ERR-P1-001** — Network Error Recovery
**41. TEST-ERR-P1-002** — Gemini API Error (Rate Limit)
**42. TEST-ERR-P1-003** — Database Connection Error
**43. TEST-PERF-P1-001** — Token Preflight Latency
**44. TEST-PERF-P1-002** — Authorization RPC Latency
**45. TEST-INT-P1-001** — Full Autonomous Workflow E2E
**46. TEST-INT-P1-002** — Multi-Connector Workflow

*Pass/Fail: Non-critical — 90% acceptable (documented exceptions for performance/resilience only)*

---

## PHASE 8: P2 POST-LAUNCH TESTS (5 tests)

*Only if needed; 100% deferrable to post-launch*

**47. TEST-BILL-P2-001** — Invoice Generation
**48. TEST-CONN-P2-001** — Disconnect Connector
**49. TEST-AUTO-P2-001** — Autonomous Cancellation UI
**50. TEST-PRJ-P2-001** — Projects CRUD
**51. TEST-MEET-P2-001** — Meeting Analytics (deferred with Meetings V2)

*Pass/Fail: Post-launch — 100% deferrable*

---

## HARD DEPENDENCY GRAPH

```
TEST-AUTH-001 (create user)
  ↓ (HARD)
TEST-AUTH-002, TEST-AUTH-003, TEST-AUTH-004, TEST-AUTH-005

TEST-BILL-004 (establish Work PC balance)
  ↓ (HARD)
TEST-AUTO-001, TEST-CONN-001, TEST-CONN-002, TEST-CONN-003, TEST-CONN-004/005/006

TEST-AUTO-001 + Tests 14-18 (architecture)
  ↓ (HARD)
TEST-AUTO-006, TEST-AUTO-007, TEST-AUTO-008

TEST-AUTO-008 (autonomous work completed)
  ↓ (HARD)
TEST-JIRA-002, TEST-LINEAR-002, TEST-GITHUB-002

TEST-CONN-001 (GitHub connected)
  ↓ (HARD)
TEST-GITHUB-001, TEST-GITHUB-002

TEST-CONN-002 (Jira connected)
  ↓ (HARD)
TEST-JIRA-001, TEST-JIRA-002

TEST-CONN-003 (Linear connected)
  ↓ (HARD)
TEST-LINEAR-001, TEST-LINEAR-002
```

---

## SOFT/RECOMMENDED ORDERING (Non-Blocking)

- Phase structure provides efficient grouping
- Within phases, listed order is recommended but not strictly required
- Independent tests may execute out of order if their hard dependencies are satisfied
- Example: Linear tests (24-25) can run before Jira tests (22-23) if both connectors are connected
- Phase progression (1→2→3→...→8) is recommended for coherent workflow, not mandatory

---

## LAUNCH DECISION GATES

### Mandatory (100% P0 Pass Required)
✅ Tests 1-27 (all 27 P0 tests)

### Important (Category-Specific)
✅ Tests 28-34 (P1 Critical): 100% required
✅ Tests 35-46 (P1 Non-Critical): 90% acceptable (performance/resilience exceptions only)

### Post-Launch (100% Deferrable)
✅ Tests 47-51 (all 5 P2 tests)

### Critical Rule
**Single failure in security, billing, data-integrity, or autonomous-accounting cannot be hidden in aggregate scoring.** These categories have 100% pass requirements.

---

## EXECUTION INSTRUCTIONS

1. **Sequential execution:** Tests one at a time, exact order 1-51
2. **Hard dependencies:** Required blockers (see dependency graph)
3. **Soft dependencies:** Recommended order for efficiency, not blocking
4. **On P0 failure:** STOP, escalate to engineering, fix required before proceeding
5. **On P1 failure:** Continue testing, triage after Phase 8
6. **On P2 failure:** Defer to post-launch, no impact
7. **Evidence:** Capture screenshots, logs, queries for every test
8. **Timing:** Budget 1-2 min setup, 5-60 min execution per test

**Total Estimated Duration:** 14-16 hours for P0+P1 tests

---

## FINAL COUNTS

| Category | Tests | Count |
|----------|-------|-------|
| P0 (Mandatory) | 1-27 | 27 |
| P1 (Important) | 28-46 | 19 |
| P2 (Deferred) | 47-51 | 5 |
| **Current Launch** | **1-51** | **51** |
| V2/Deferred (not executing) | - | 5+ |

---

**Status:** FINAL CORRECTED V4 — Ready for Approval

